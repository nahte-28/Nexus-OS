import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { deflateRawSync } from 'node:zlib'
import type { FileMeta } from '@nexus/core'
import { resetDbConnection } from '../state/db'
import { docxText, documentText, pptxText } from './docx'
import { FilesStore } from './store'
import { syncFiles, type FilesRemote } from './sync'

/** A storage bucket in memory. */
function fakeRemote() {
  const objects = new Map<string, { meta: FileMeta; data: Blob }>()
  const remote: FilesRemote = {
    list: async () => [...objects.values()].map((o) => o.meta),
    upload: async (meta, data) => void objects.set(meta.id, { meta, data }),
    download: async (meta) => objects.get(meta.id)!.data,
    remove: async (meta) => void objects.delete(meta.id),
  }
  return { objects, remote }
}

describe('Bestanden', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
    resetDbConnection()
  })

  it('keeps files offline and moves them between devices through the account', async () => {
    const { objects, remote } = fakeRemote()
    const pc = new FilesStore()
    const id = await pc.add(new Blob(['Ohm: U = R · I'], { type: 'text/plain' }), 'Elektronica.txt')
    await expect(pc.add(new Blob([new Uint8Array(11 * 1024 * 1024)]), 'groot.pdf')).rejects.toThrow(/te groot/)
    expect(await syncFiles(pc, remote)).toEqual({ uploaded: 1, removed: 0, received: 0 })
    expect(pc.getSnapshot()[0]).toMatchObject({ id, remote: true, offline: true })

    // Another device sees it, and downloads it the first time it is opened.
    resetDbConnection()
    globalThis.indexedDB = new IDBFactory()
    const phone = new FilesStore()
    expect(await syncFiles(phone, remote)).toMatchObject({ received: 1 })
    expect(phone.getSnapshot()[0]).toMatchObject({ name: 'Elektronica.txt', offline: false })
    phone.download = remote.download
    expect(await (await phone.blob(id)).text()).toBe('Ohm: U = R · I')
    expect(phone.getSnapshot()[0].offline).toBe(true)

    // Deleted on the phone: gone from the account, then from the pc.
    await phone.remove(id)
    expect(phone.getSnapshot()).toEqual([])
    expect(await syncFiles(phone, remote)).toMatchObject({ removed: 1 })
    expect(objects.size).toBe(0)
    await syncFiles(pc, remote)
    expect(pc.getSnapshot()).toEqual([])
  })

  it('reads the text of a Word file', async () => {
    const xml =
      '<w:document><w:body><w:p><w:r><w:t>Hoofdstuk 1</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">Wet van </w:t></w:r><w:r><w:t>Ohm &amp; Kirchhoff</w:t></w:r></w:p></w:body></w:document>'
    expect(documentText(xml)).toBe('Hoofdstuk 1\nWet van Ohm & Kirchhoff')
    const docx = zip('word/document.xml', new TextEncoder().encode(xml))
    expect(await docxText(new Blob([docx]))).toBe('Hoofdstuk 1\nWet van Ohm & Kirchhoff')
    await expect(docxText(new Blob(['geen zip']))).rejects.toThrow(/Word-bestand/)
  })

  it('reads the text of a PowerPoint, slide by slide', async () => {
    const slide = (texts: string[]) => new TextEncoder().encode(`<p:sld>${texts.map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join('')}</p:sld>`)
    const pptx = zip('ppt/slides/slide10.xml', slide(['Einde']), ['ppt/slides/slide2.xml', slide(['Wet van Ohm', 'U = R &amp; I'])], ['ppt/presentation.xml', slide(['niet'])])
    expect(await pptxText(new Blob([pptx]))).toBe('Dia 2\nWet van Ohm\nU = R & I\n\nDia 10\nEinde')
    await expect(pptxText(new Blob([zip('word/document.xml', slide([]))]))).rejects.toThrow(/PowerPoint/)
  })
})

/** A zip with deflated entries, as Word and PowerPoint write them. */
function zip(name: string, content: Uint8Array, ...more: Array<[string, Uint8Array]>): Uint8Array<ArrayBuffer> {
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const [entry, bytes] of [[name, content] as [string, Uint8Array], ...more]) {
    const nameBytes = new TextEncoder().encode(entry)
    const data = deflateRawSync(bytes)
    const local = new Uint8Array(30 + nameBytes.length + data.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(8, 8, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, bytes.length, true)
    lv.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)
    local.set(data, 30 + nameBytes.length)
    const central = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(10, 8, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, bytes.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint32(42, offset, true)
    central.set(nameBytes, 46)
    locals.push(local)
    centrals.push(central)
    offset += local.length
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, centrals.length, true)
  ev.setUint16(10, centrals.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  const out = new Uint8Array(offset + centralSize + end.length)
  let at = 0
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at)
    at += part.length
  }
  return out
}
