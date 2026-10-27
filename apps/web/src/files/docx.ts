/**
 * The text of a Word file (.docx), for NEXUS AI. A .docx is a zip; this reads its central
 * directory, inflates word/document.xml with the browser's DecompressionStream and keeps the
 * text of each paragraph. Images, tables' layout and formatting are dropped.
 */

const decoder = new TextDecoder()

async function inflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** One file from a zip archive, or null when it is not there. */
export async function readZipEntry(zip: ArrayBuffer, wanted: string): Promise<Uint8Array | null> {
  const bytes = new Uint8Array(zip)
  const view = new DataView(zip)
  // The end-of-central-directory record is in the last 64 kB + 22 bytes.
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) return null
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  for (let n = 0; n < count && at + 46 <= bytes.length; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) return null
    const method = view.getUint16(at + 10, true)
    const compressed = view.getUint32(at + 20, true)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    const local = view.getUint32(at + 42, true)
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength))
    if (name === wanted) {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
      const data = bytes.subarray(start, start + compressed)
      if (method === 0) return data
      if (method === 8) return inflate(data)
      return null
    }
    at += 46 + nameLength + extraLength + commentLength
  }
  return null
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** Paragraph text from WordprocessingML. */
export function documentText(xml: string): string {
  return xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:instrText[^>]*>[^<]*<\/w:instrText>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ENTITIES[e])
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function docxText(file: Blob): Promise<string> {
  const xml = await readZipEntry(await file.arrayBuffer(), 'word/document.xml')
  if (!xml) throw new Error('Dit Word-bestand kan NEXUS niet lezen. Bewaar het als .docx of pdf.')
  return documentText(decoder.decode(xml))
}
