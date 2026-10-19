import type Anthropic from '@anthropic-ai/sdk'
import { logEvent } from '../devtools/log'
import { readStorage, writeStorage } from '../state/storage'
import { TOOL_SPECS, type ToolContext } from './tools'

type MessageParam = Anthropic.Beta.BetaMessageParam
type ContentBlock = Anthropic.Beta.BetaContentBlock
type ToolResult = Anthropic.Beta.BetaToolResultBlockParam

/** An action the assistant proposed, as shown on its permission card. */
export interface ToolRequest {
  id: string
  name: string
  label: string
  description: string
  readOnly: boolean
  status: 'pending' | 'running' | 'done' | 'denied' | 'failed'
  result?: string
}

export type ChatItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'tool'; id: string; request: ToolRequest }
  | { kind: 'notice'; id: string; text: string; error?: boolean }

export interface UsageRecord {
  at: number
  model: string
  inputTokens: number
  outputTokens: number
  ms: number
  stopReason: string | null
}

export interface AssistantState {
  items: ChatItem[]
  /** Text of the answer that is still streaming in. */
  streaming: string
  busy: boolean
  usage: UsageRecord[]
}

interface DoneEvent {
  type: 'done'
  message: {
    role: 'assistant'
    content: ContentBlock[]
    stop_reason: string | null
    model: string
    usage: { input_tokens: number; output_tokens: number }
  }
}
type StreamEvent = { type: 'text'; text: string } | DoneEvent | { type: 'error'; message: string }

/** Sends the conversation to the server and streams the reply. Replaced in tests. */
export type Transport = (messages: MessageParam[], onEvent: (event: StreamEvent) => void) => Promise<void>

const ALWAYS_KEY = 'nexus.ai.always'
/** Tool rounds per question, so a confused model cannot loop forever on the user's bill. */
const MAX_ROUNDS = 8

function alwaysAllowed(): Set<string> {
  try {
    return new Set(JSON.parse(readStorage(ALWAYS_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

export function forgetAlwaysAllowed(): void {
  writeStorage(ALWAYS_KEY, '[]')
}

function nowNote(now: number): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const local = new Date(now).toLocaleString('nl-BE', { dateStyle: 'full', timeStyle: 'short' })
  const offset = -new Date(now).getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const hh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')
  const mm = String(Math.abs(offset) % 60).padStart(2, '0')
  return `[Nu: ${local}, tijdzone ${zone} (UTC${sign}${hh}:${mm})]`
}

/**
 * One conversation with NEXUS AI. The model proposes actions; each one waits for the user's
 * permission (or a standing "always allow" for that action) before it runs here, on the device.
 */
export class AssistantSession {
  private history: MessageParam[] = []
  private state: AssistantState = { items: [], streaming: '', busy: false, usage: [] }
  private listeners = new Set<() => void>()
  private pending = new Map<string, { input: Record<string, unknown>; resolve: (allowed: boolean) => void }>()
  private nextId = 1

  constructor(
    private transport: Transport,
    private context: () => ToolContext,
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): AssistantState => this.state

  private set(patch: Partial<AssistantState>): void {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((l) => l())
  }

  private push(item: ChatItem): void {
    this.set({ items: [...this.state.items, item] })
  }

  private id(): string {
    return String(this.nextId++)
  }

  private updateTool(id: string, patch: Partial<ToolRequest>): void {
    this.set({
      items: this.state.items.map((item) =>
        item.kind === 'tool' && item.request.id === id ? { ...item, request: { ...item.request, ...patch } } : item,
      ),
    })
  }

  reset(): void {
    for (const p of this.pending.values()) p.resolve(false)
    this.pending.clear()
    this.history = []
    this.set({ items: [], streaming: '' })
  }

  /** The user's answer on a permission card. */
  decide(toolId: string, allowed: boolean, always = false): void {
    const pending = this.pending.get(toolId)
    if (!pending) return
    this.pending.delete(toolId)
    if (allowed && always) {
      const item = this.state.items.find((i) => i.kind === 'tool' && i.request.id === toolId)
      if (item?.kind === 'tool') {
        const set = alwaysAllowed()
        set.add(item.request.name)
        writeStorage(ALWAYS_KEY, JSON.stringify([...set]))
      }
    }
    pending.resolve(allowed)
  }

  async send(text: string): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed || this.state.busy) return
    this.push({ kind: 'user', id: this.id(), text: trimmed })
    this.history.push({
      role: 'user',
      content: [
        { type: 'text', text: trimmed },
        { type: 'text', text: nowNote(this.context().now()) },
      ],
    })
    this.set({ busy: true })
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const message = await this.ask()
        if (!message) return
        const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
        if (message.stop_reason === 'refusal') {
          this.push({ kind: 'notice', id: this.id(), text: 'NEXUS AI kan hier niet bij helpen.', error: true })
          this.dropLastExchangeIfUnanswered()
          return
        }
        if (message.stop_reason === 'max_tokens') {
          this.push({ kind: 'notice', id: this.id(), text: 'Het antwoord werd afgebroken omdat het te lang werd.', error: true })
          if (toolUses.length > 0) this.dropLastExchangeIfUnanswered()
          return
        }
        if (message.stop_reason !== 'tool_use' || toolUses.length === 0) return
        const results = await Promise.all(toolUses.map((use) => this.handleTool(use)))
        this.history.push({ role: 'user', content: results })
      }
      this.push({ kind: 'notice', id: this.id(), text: 'Gestopt na veel acties op rij. Stel je vraag gerust opnieuw.', error: true })
    } finally {
      this.set({ busy: false, streaming: '' })
    }
  }

  /**
   * A turn whose tool calls will not be answered cannot stay in the history: the API needs a
   * result for every tool call. Forget the exchange so the user can rephrase.
   */
  private dropLastExchangeIfUnanswered(): void {
    const last = this.history[this.history.length - 1]
    if (last?.role === 'assistant') this.history.pop()
    while (this.history.length > 0 && this.history[this.history.length - 1].role === 'user') {
      const content = this.history[this.history.length - 1].content
      const isToolResults = Array.isArray(content) && content.some((b) => b.type === 'tool_result')
      this.history.pop()
      if (!isToolResults) break
      this.history.pop() // the assistant turn those results answered
    }
  }

  private async ask(): Promise<DoneEvent['message'] | null> {
    const started = performance.now()
    let done: DoneEvent['message'] | null = null
    let error: string | null = null
    this.set({ streaming: '' })
    try {
      await this.transport(this.history, (event) => {
        if (event.type === 'text') this.set({ streaming: this.state.streaming + event.text })
        else if (event.type === 'done') done = event.message
        else error = event.message
      })
    } catch (err) {
      error = err instanceof Error ? err.message : 'NEXUS AI is niet bereikbaar.'
    }
    const message = done as DoneEvent['message'] | null
    if (!message) {
      const text = error ?? 'Geen antwoord ontvangen.'
      this.push({ kind: 'notice', id: this.id(), text, error: true })
      logEvent('ai', `Aanvraag mislukt: ${text}`, true)
      // Keep the history valid: the question without an answer is removed again.
      this.dropLastExchangeIfUnanswered()
      this.set({ streaming: '' })
      return null
    }
    // The full content goes back on the next request, thinking blocks included, unchanged.
    this.history.push({ role: 'assistant', content: message.content as MessageParam['content'] })
    const text = message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
    this.set({ streaming: '' })
    if (text) this.push({ kind: 'assistant', id: this.id(), text })
    const record: UsageRecord = {
      at: Date.now(),
      model: message.model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      ms: Math.round(performance.now() - started),
      stopReason: message.stop_reason,
    }
    this.set({ usage: [record, ...this.state.usage].slice(0, 100) })
    logEvent('ai', `Antwoord van ${record.model}: ${record.inputTokens} in, ${record.outputTokens} uit, ${record.ms} ms`)
    return message
  }

  private async handleTool(use: Anthropic.Beta.BetaToolUseBlock): Promise<ToolResult> {
    const spec = TOOL_SPECS[use.name]
    const input = (typeof use.input === 'object' && use.input !== null ? use.input : {}) as Record<string, unknown>
    const ctx = this.context()
    if (!spec) return { type: 'tool_result', tool_use_id: use.id, is_error: true, content: `Onbekende actie ${use.name}.` }
    const problem = spec.validate(input, ctx)
    const request: ToolRequest = {
      id: use.id,
      name: use.name,
      label: spec.label,
      description: spec.describe(input),
      readOnly: spec.readOnly,
      status: 'pending',
    }
    if (problem) {
      this.push({ kind: 'tool', id: this.id(), request: { ...request, status: 'failed', result: problem } })
      return { type: 'tool_result', tool_use_id: use.id, is_error: true, content: problem }
    }
    this.push({ kind: 'tool', id: this.id(), request })
    const allowed = alwaysAllowed().has(use.name) || (await new Promise<boolean>((resolve) => this.pending.set(use.id, { input, resolve })))
    if (!allowed) {
      this.updateTool(use.id, { status: 'denied' })
      logEvent('ai', `Actie geweigerd: ${spec.label}`)
      return { type: 'tool_result', tool_use_id: use.id, is_error: true, content: 'De gebruiker weigerde deze actie.' }
    }
    this.updateTool(use.id, { status: 'running' })
    try {
      const result = await spec.run(input, ctx)
      this.updateTool(use.id, { status: 'done', result: spec.readOnly ? undefined : result })
      logEvent('ai', `Actie uitgevoerd: ${spec.label}`)
      return { type: 'tool_result', tool_use_id: use.id, content: result }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Mislukt.'
      this.updateTool(use.id, { status: 'failed', result: message })
      logEvent('ai', `Actie mislukt: ${spec.label}: ${message}`, true)
      return { type: 'tool_result', tool_use_id: use.id, is_error: true, content: message }
    }
  }
}

/** Calls /api/ai with the user's login and reads the streamed reply line by line. */
export function httpTransport(base: string, token: () => Promise<string | null>): Transport {
  return async (messages, onEvent) => {
    const access = await token()
    if (!access) throw new Error('Meld je aan in de Account-app om NEXUS AI te gebruiken.')
    const response = await fetch(`${base}/api/ai`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
      body: JSON.stringify({ messages }),
    })
    if (!response.ok || !response.body) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null
      throw new Error(body?.error ?? `NEXUS AI gaf een fout (${response.status}).`)
    }
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
    let buffer = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (value) buffer += value
      let newline: number
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line) onEvent(JSON.parse(line) as StreamEvent)
      }
      if (done) break
    }
  }
}
