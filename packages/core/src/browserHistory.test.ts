import { describe, expect, it } from 'vitest'
import { addPageVisit, forgetVisit, MAX_VISITS, parseHistory, searchHistory, titleVisit, type Visit } from './browserHistory'

const v = (url: string, at: number, title = ''): Visit => ({ url, title, at })

describe('browser history', () => {
  it('adds visits newest first and merges a reload of the same page', () => {
    let h = addPageVisit([], v('https://vrt.be/', 1000))
    h = addPageVisit(h, v('https://vrt.be/', 2000, 'VRT NWS'))
    expect(h).toEqual([v('https://vrt.be/', 2000, 'VRT NWS')])
    h = addPageVisit(h, v('https://ap.be/', 3000))
    expect(h.map((x) => x.url)).toEqual(['https://ap.be/', 'https://vrt.be/'])
    h = addPageVisit(h, v('https://vrt.be/', 4000))
    expect(h).toHaveLength(3)
  })

  it('ignores pages that are no website and keeps at most the limit', () => {
    expect(addPageVisit([], v('about:blank', 1))).toEqual([])
    let h: Visit[] = []
    for (let i = 0; i < MAX_VISITS + 5; i++) h = addPageVisit(h, v(`https://s${i}.be/`, i))
    expect(h).toHaveLength(MAX_VISITS)
  })

  it('fills in a late title, searches and forgets', () => {
    let h = [v('https://ap.be/', 2), v('https://vrt.be/', 1)]
    h = titleVisit(h, 'https://vrt.be/', 'VRT NWS')
    expect(searchHistory(h, 'nws')).toEqual([v('https://vrt.be/', 1, 'VRT NWS')])
    expect(searchHistory(h, 'ap.be')).toHaveLength(1)
    expect(forgetVisit(h, h[0])).toHaveLength(1)
  })

  it('parses only valid entries', () => {
    expect(parseHistory([v('https://a.be/', 1), { url: 'javascript:x', title: '', at: 1 }, null, 'x'])).toEqual([v('https://a.be/', 1)])
    expect(parseHistory('nope')).toEqual([])
  })
})
