import { describe, expect, it } from 'vitest'
import { formatSize, parseStorageName, previewKind, storageName, studyKind, studyNoteTitle } from './files'

describe('NEXUS Bestanden', () => {
  it('knows what it can show and what the AI can read', () => {
    expect(previewKind('Labo.PDF')).toBe('pdf')
    expect(previewKind('foto.jpg')).toBe('image')
    expect(previewKind('notities.md')).toBe('text')
    expect(previewKind('les.pptx')).toBe('pptx')
    expect(previewKind('verslag.docx')).toBe('docx')
    expect(previewKind('punten.xlsx')).toBe('none')
    expect(studyKind('samenvatting.docx')).toBe('docx')
    expect(studyKind('Hoofdstuk 3.pdf')).toBe('pdf')
    expect(studyKind('logo.svg')).toBeNull()
    expect(studyKind('les.pptx')).toBeNull()
  })

  it('keeps any file name in the storage path', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e'
    const object = storageName(id, 'Elektronica – samenvatting é/2.pdf')
    expect(object).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]+$/)
    expect(parseStorageName(object)).toEqual({ id, name: 'Elektronica – samenvatting é/2.pdf' })
    expect(parseStorageName('../x')).toBeNull()
  })

  it('formats sizes and names the summary note', () => {
    expect(formatSize(830)).toBe('830 B')
    expect(formatSize(2_400_000)).toBe('2,4 MB')
    expect(studyNoteTitle('Elektronica H3.pdf')).toBe('Samenvatting: Elektronica H3')
  })
})
