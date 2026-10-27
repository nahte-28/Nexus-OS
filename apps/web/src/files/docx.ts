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
  const found = await scanZip(zip, (name) => name === wanted)
  return found[0]?.data ?? null
}

/** Every file in the zip whose name [matches], in archive order. */
async function scanZip(zip: ArrayBuffer, matches: (name: string) => boolean): Promise<Array<{ name: string; data: Uint8Array }>> {
  const found: Array<{ name: string; data: Uint8Array }> = []
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
  if (end < 0) return found
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  for (let n = 0; n < count && at + 46 <= bytes.length; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) return found
    const method = view.getUint16(at + 10, true)
    const compressed = view.getUint32(at + 20, true)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    const local = view.getUint32(at + 42, true)
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength))
    if (matches(name)) {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
      const data = bytes.subarray(start, start + compressed)
      if (method === 0) found.push({ name, data })
      else if (method === 8) found.push({ name, data: await inflate(data) })
    }
    at += 46 + nameLength + extraLength + commentLength
  }
  return found
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

const decodeEntities = (text: string) =>
  text.replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ENTITIES[e]).replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))

/** Paragraph text from WordprocessingML. */
export function documentText(xml: string): string {
  return decodeEntities(
    xml
      .replace(/<w:tab\/>/g, '\t')
      .replace(/<w:br[^>]*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<w:instrText[^>]*>[^<]*<\/w:instrText>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  )
}

export async function docxText(file: Blob): Promise<string> {
  const xml = await readZipEntry(await file.arrayBuffer(), 'word/document.xml')
  if (!xml) throw new Error('Dit Word-bestand kan NEXUS niet lezen. Bewaar het als .docx of pdf.')
  return documentText(decoder.decode(xml))
}

/** The text on one slide (DrawingML): one line per paragraph. */
export function slideText(xml: string): string {
  return xml
    .split(/<\/a:p>/)
    .map((p) => decodeEntities([...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join('')).trim())
    .filter(Boolean)
    .join('\n')
}

/** The text of a PowerPoint (.pptx), slide by slide; images and layout are dropped. */
export async function pptxText(file: Blob): Promise<string> {
  const slides = await scanZip(await file.arrayBuffer(), (name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
  if (slides.length === 0) throw new Error('Deze PowerPoint kan NEXUS niet lezen. Bewaar ze als .pptx of pdf.')
  const number = (name: string) => Number(name.match(/(\d+)\.xml$/)![1])
  return slides
    .sort((a, b) => number(a.name) - number(b.name))
    .map((s) => `Dia ${number(s.name)}\n${slideText(decoder.decode(s.data)) || '(geen tekst)'}`)
    .join('\n\n')
}
