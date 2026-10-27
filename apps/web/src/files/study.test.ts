import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkStudyRequest, POST, studyInstruction } from '../../../../api/study'
import { studyFile, studyPayload } from './study'

describe('NEXUS AI study help', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('checks what the client sends and builds the request', () => {
    expect(checkStudyRequest({ name: 'H3.pdf', kind: 'pdf', data: 'JVBERi0x' })).toMatchObject({ ok: true, value: { additions: true, feedback: true, focus: '' } })
    expect(checkStudyRequest({ name: 'H3.pdf', kind: 'pdf', data: 'niet base64!' })).toMatchObject({ ok: false })
    expect(checkStudyRequest({ name: 'x.pptx', kind: 'pptx', data: 'x' })).toMatchObject({ ok: false })
    expect(checkStudyRequest({ name: 'a.txt', kind: 'text', data: 'x'.repeat(300_001) })).toMatchObject({ ok: false })
    expect(studyInstruction({ name: 'a.txt', additions: false, feedback: true, focus: 'formules' })).toBe(
      'Bestand: a.txt. Maak de samenvatting. Laat de kop Aanvullingen weg. Geef ook feedback op het bestand als samenvatting. Wens van de student: formules',
    )
  })

  it('needs a login, like NEXUS AI', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test')
    vi.stubEnv('NEXUS_AI_ALLOWED_EMAILS', 'ethan@example.com')
    const response = await POST(new Request('https://nexus.test/api/study', { method: 'POST', body: '{}' }))
    expect(response.status).toBe(401)
  })

  it('reads text and refuses what the AI cannot read', async () => {
    expect(await studyPayload('notities.md', new Blob(['# Ohm']))).toEqual({ kind: 'text', data: '# Ohm' })
    expect(await studyPayload('a.pdf', new Blob(['%PDF-1'], { type: 'application/pdf' }))).toEqual({ kind: 'pdf', data: btoa('%PDF-1') })
    await expect(studyPayload('les.pptx', new Blob(['x']))).rejects.toThrow(/pdf, Word/)
    await expect(studyPayload('leeg.txt', new Blob(['  ']))).rejects.toThrow(/geen tekst/)
  })

  it('streams the summary and reports server errors in Dutch', async () => {
    const lines = [{ type: 'text', text: '## Samen' }, { type: 'text', text: 'vatting' }, { type: 'done' }].map((e) => JSON.stringify(e) + '\n').join('')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(lines)))
    const seen: string[] = []
    const text = await studyFile('a.txt', { kind: 'text', data: 'x' }, { additions: true, feedback: false, focus: '' }, (t) => seen.push(t), async () => 'token', '')
    expect(text).toBe('## Samenvatting')
    expect(seen).toEqual(['## Samen', '## Samenvatting'])

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ type: 'error', message: 'De AI is niet bereikbaar.' }) + '\n')))
    await expect(studyFile('a.txt', { kind: 'text', data: 'x' }, { additions: true, feedback: true, focus: '' }, () => {}, async () => 'token', '')).rejects.toThrow('De AI is niet bereikbaar.')
    await expect(studyFile('a.txt', { kind: 'text', data: 'x' }, { additions: true, feedback: true, focus: '' }, () => {}, async () => null, '')).rejects.toThrow(/Meld je aan/)
  })
})
