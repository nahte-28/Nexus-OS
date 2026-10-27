import { MAX_STUDY_PDF_BYTES, MAX_STUDY_TEXT, formatSize, studyKind, type StudyOptions } from '@nexus/core'
import { logEvent } from '../devtools/log'
import { apiBase } from '../platform/desktop'
import { notesStore } from '../state/notesStore'
import { supabase } from '../sync/supabase'
import { docxText } from './docx'

export type StudyPayload = { kind: 'pdf' | 'text'; data: string }

function base64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/** What NEXUS AI gets from a file: the PDF itself, or the text of a Word or text file. */
export async function studyPayload(name: string, file: Blob): Promise<StudyPayload> {
  const kind = studyKind(name, file.type)
  if (!kind) throw new Error('NEXUS AI kan pdf, Word (.docx) en tekstbestanden lezen.')
  if (kind === 'pdf') {
    if (file.size > MAX_STUDY_PDF_BYTES) throw new Error(`Deze pdf is ${formatSize(file.size)}; NEXUS AI leest pdf's tot ${formatSize(MAX_STUDY_PDF_BYTES)}.`)
    return { kind: 'pdf', data: base64(await file.arrayBuffer()) }
  }
  const text = kind === 'docx' ? await docxText(file) : await file.text()
  if (!text.trim()) throw new Error('Er staat geen tekst in dit bestand.')
  if (text.length > MAX_STUDY_TEXT) throw new Error('Dit bestand is te lang voor NEXUS AI. Kies een deel, bv. één hoofdstuk.')
  return { kind: 'text', data: text }
}

type StudyEvent = { type: 'text'; text: string } | { type: 'done' } | { type: 'error'; message: string }

/** Streams NEXUS AI's study summary of a file; returns the whole Markdown text. */
export async function studyFile(
  name: string,
  payload: StudyPayload,
  options: StudyOptions,
  onText: (soFar: string) => void,
  token: () => Promise<string | null> = async () => (await supabase?.auth.getSession())?.data.session?.access_token ?? null,
  base = apiBase,
): Promise<string> {
  const access = await token()
  if (!access) throw new Error('Meld je aan in de Account-app om NEXUS AI te gebruiken.')
  const response = await fetch(`${base}/api/study`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
    body: JSON.stringify({ name, ...payload, ...options }),
  })
  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? (response.status === 413 ? 'Dit bestand is te groot voor NEXUS AI.' : `NEXUS AI gaf een fout (${response.status}).`))
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let text = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (value) buffer += value
    let newline: number
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (!line) continue
      const event = JSON.parse(line) as StudyEvent
      if (event.type === 'error') throw new Error(event.message)
      if (event.type === 'text') {
        text += event.text
        onText(text)
      }
    }
    if (done) break
  }
  logEvent('ai', 'Studiesamenvatting gemaakt')
  return text
}

/** Saves a summary as a note, with where it came from on the first line. */
export function saveStudyNote(title: string, fileName: string, markdown: string): string {
  const id = notesStore.add()
  notesStore.update(id, { title, body: `Gemaakt door NEXUS AI uit "${fileName}" op ${new Date().toLocaleDateString('nl-BE')}.\n\n${markdown}` })
  return id
}
