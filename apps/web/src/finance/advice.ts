import { financeFacts, monthLabel, monthOf } from '@nexus/core'
import { logEvent } from '../devtools/log'
import { readAiStream } from '../files/study'
import { apiBase } from '../platform/desktop'
import { notesStore } from '../state/notesStore'
import { supabase } from '../sync/supabase'
import { financeStore } from './store'

type Token = () => Promise<string | null>
const sessionToken: Token = async () => (await supabase?.auth.getSession())?.data.session?.access_token ?? null

/**
 * Streams NEXUS AI's advice about [month]; returns the whole Markdown text. Only totals go out (see
 * financeFacts), through the same route and access rules as the Weekoverzicht.
 */
export async function streamFinanceAdvice(month: string, wish: string, onText: (soFar: string) => void, now = Date.now(), token: Token = sessionToken, base = apiBase): Promise<string> {
  const access = await token()
  if (!access) throw new Error('Meld je aan in de Account-app om NEXUS AI te gebruiken.')
  const response = await fetch(`${base}/api/review`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
    body: JSON.stringify({ kind: 'finance', facts: financeFacts(financeStore.getSnapshot(), now, month), wish }),
  })
  const text = await readAiStream(response, onText, 'Je maand heeft te veel gegevens voor NEXUS AI.')
  if (!text.trim()) throw new Error('NEXUS AI gaf geen advies terug.')
  logEvent('ai', `Geldadvies voor ${monthLabel(month)} gemaakt`)
  return text
}

export const adviceNoteTitle = (month: string) => `Geldadvies ${monthLabel(month)}`

/** Saves the advice as a note; new advice for the same month replaces the old one. */
export function saveAdvice(month: string, markdown: string, now = Date.now()): string {
  const title = adviceNoteTitle(month)
  const id = notesStore.getSnapshot().find((n) => n.title === title)?.id ?? notesStore.add()
  const made = new Date(now).toLocaleString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
  notesStore.update(id, { title, body: `Gemaakt door NEXUS AI op ${made}${month === monthOf(now) ? ', halfweg de maand' : ''}.\n\n${markdown}` })
  return id
}
