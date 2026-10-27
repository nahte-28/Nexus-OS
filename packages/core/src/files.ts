/**
 * NEXUS Bestanden: your own files, kept on the device and (with an account) in your private
 * storage, plus what NEXUS AI can study from them. Pure logic.
 */

/** Largest file NEXUS keeps; the storage bucket has the same limit. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024
/** A request to Vercel is at most 4.5 MB, so a PDF for the AI (sent as base64) stays under this. */
export const MAX_STUDY_PDF_BYTES = 3 * 1024 * 1024
/** Text sent to the AI, in characters. */
export const MAX_STUDY_TEXT = 300_000

export interface FileMeta {
  id: string
  name: string
  mediaType: string
  size: number
  addedAt: number
}

const extension = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'csv', 'json', 'html', 'htm', 'xml', 'log', 'tex', 'py', 'js', 'ts', 'c', 'cpp', 'h', 'java', 'kt', 'cs', 'sql', 'yml', 'yaml'])
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'])

export type PreviewKind = 'pdf' | 'image' | 'text' | 'none'

/** How NEXUS can show a file itself; anything else is offered as a download. */
export function previewKind(name: string, mediaType = ''): PreviewKind {
  const ext = extension(name)
  if (mediaType === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (mediaType.startsWith('image/') || IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (mediaType.startsWith('text/') || TEXT_EXTENSIONS.has(ext)) return 'text'
  return 'none'
}

export type StudyKind = 'pdf' | 'text' | 'docx'

/** Which files NEXUS AI can read: PDF, Word (.docx) and plain text. */
export function studyKind(name: string, mediaType = ''): StudyKind | null {
  const ext = extension(name)
  if (ext === 'docx' || mediaType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx'
  const preview = previewKind(name, mediaType)
  if (preview === 'pdf') return 'pdf'
  if (preview === 'text' && ext !== 'svg') return 'text'
  return null
}

/** "2,4 MB", "830 kB", "12 B". */
export function formatSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} kB`
  return `${(bytes / 1_000_000).toLocaleString('nl-BE', { maximumFractionDigits: 1 })} MB`
}

function toBase64Url(text: string): string {
  let binary = ''
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): string | null {
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
  } catch {
    return null
  }
}

/**
 * Where a file lives in storage: "<user>/<id>.<name>", the name base64url-encoded so any
 * character survives. Listing the user's folder then gives every file with its name.
 */
export function storageName(id: string, name: string): string {
  return `${id}.${toBase64Url(name.slice(0, 200))}`
}

export function parseStorageName(object: string): { id: string; name: string } | null {
  const match = object.match(/^([0-9a-f-]{36})\.([A-Za-z0-9_-]+)$/)
  if (!match) return null
  const name = fromBase64Url(match[2])
  return name ? { id: match[1], name } : null
}

export interface StudyOptions {
  /** Also suggest interesting things to add, marked as additions. */
  additions: boolean
  /** Give feedback on the uploaded summary itself. */
  feedback: boolean
  /** Optional wish, e.g. "focus op hoofdstuk 3". */
  focus: string
}

export const DEFAULT_STUDY_OPTIONS: StudyOptions = { additions: true, feedback: true, focus: '' }

export const studyNoteTitle = (fileName: string) => `Samenvatting: ${fileName.replace(/\.[^.]+$/, '')}`.slice(0, 200)
