import { describe, expect, it } from 'vitest'
import { bookmarkGroups, emptyBrowser, mergeBookmarks, moveBookmark, parseBrowser, resolveInput, saveBookmark, webAddress, type BrowserSettings } from './browser'
import { defaultProfilesState, mergeFirstSync, parseProfilesState } from './profiles'

const ok = (s: BrowserSettings | { error: string }): BrowserSettings => {
  if ('error' in s) throw new Error(s.error)
  return s
}

describe('browser', () => {
  it('tells addresses from searches', () => {
    expect(webAddress('vrt.be/nws')).toBe('https://vrt.be/nws')
    expect(webAddress('http://localhost:5173')).toBe('http://localhost:5173/')
    expect(webAddress('javascript:alert(1)')).toBeNull()
    expect(webAddress('https://user:pw@example.com')).toBeNull()
    expect(webAddress('hallo')).toBeNull()
    expect(resolveInput('weer antwerpen', 'duckduckgo')).toBe('https://duckduckgo.com/?q=weer%20antwerpen')
    expect(resolveInput('ap.be', 'google')).toBe('https://ap.be/')
    expect(resolveInput('  ', 'google')).toBeNull()
  })

  it('saves, refuses doubles, groups by folder and moves', () => {
    let s = ok(saveBookmark(emptyBrowser(), { id: 'a', title: '', url: 'vrt.be' }, 1))
    s = ok(saveBookmark(s, { id: 'b', title: 'Canvas', url: 'https://canvas.ap.be', folder: 'School' }, 2))
    s = ok(saveBookmark(s, { id: 'c', title: 'YouTube', url: 'youtube.com' }, 3))
    expect(s.bookmarks[0].title).toBe('vrt.be')
    expect(saveBookmark(s, { id: 'd', title: 'x', url: 'https://vrt.be/' }, 4)).toEqual({ error: 'Die bladwijzer heb je al.' })
    expect('error' in saveBookmark(s, { id: 'd', title: 'x', url: 'ftp://x.be' }, 4)).toBe(true)
    expect(bookmarkGroups(s.bookmarks).map((g) => [g.folder, g.items.map((b) => b.id)])).toEqual([
      ['', ['a', 'c']],
      ['School', ['b']],
    ])
    expect(bookmarkGroups(s.bookmarks, 'canv').map((g) => g.folder)).toEqual(['School'])
    s = moveBookmark(s, 'c', -1)
    expect(s.bookmarks.map((b) => b.id)).toEqual(['a', 'c', 'b'])
    const edited = ok(saveBookmark(s, { id: 'a', title: 'VRT', url: 'vrt.be', folder: 'Nieuws' }, 9))
    expect(edited.bookmarks[0]).toEqual({ id: 'a', title: 'VRT', url: 'https://vrt.be/', folder: 'Nieuws', addedAt: 1 })
  })

  it('parses safely and keeps bookmarks from both devices on the first sync', () => {
    const parsed = parseBrowser({ engine: 'bing', bookmarks: [{ id: 'a', url: 'vrt.be' }, { id: 'b', url: 'javascript:x' }, { id: 'a', url: 'x.be' }, null] })
    expect(parsed.engine).toBe('bing')
    expect(parsed.bookmarks.map((b) => b.url)).toEqual(['https://vrt.be/'])
    expect(parseBrowser({ engine: 'toString' }).engine).toBe('google')
    expect(mergeBookmarks(parsed.bookmarks, [{ id: 'z', title: 'VRT', url: 'https://vrt.be/', folder: '', addedAt: 0 }])).toBe(parsed.bookmarks)

    const local = { ...defaultProfilesState(), revision: 2, browser: ok(saveBookmark(emptyBrowser(), { id: 'l', title: '', url: 'local.be' }, 1)) }
    const remote = { ...defaultProfilesState(), revision: 5, browser: ok(saveBookmark(emptyBrowser(), { id: 'r', title: '', url: 'remote.be' }, 1)) }
    expect(mergeFirstSync(local, remote).browser.bookmarks.map((b) => b.id)).toEqual(['r', 'l'])
  })
})

describe('browser in profiles', () => {
  it('survives a round trip through the profiles parser', () => {
    const state = { ...defaultProfilesState(), browser: { engine: 'ecosia' as const, bookmarks: [{ id: 'a', title: 'VRT', url: 'https://vrt.be/', folder: 'Nieuws', addedAt: 1 }] } }
    expect(parseProfilesState(JSON.parse(JSON.stringify(state))).browser).toEqual(state.browser)
  })
})
