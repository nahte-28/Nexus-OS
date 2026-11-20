import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The website's security headers in vercel.json: a slip here leaves NEXUS open to being framed or sniffed.
const config = JSON.parse(readFileSync(resolve(__dirname, '../../../vercel.json'), 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[]
}
const all = Object.fromEntries(config.headers.find((h) => h.source === '/(.*)')!.headers.map((h) => [h.key, h.value]))

describe('security headers', () => {
  it('sends the basics on every page and function', () => {
    expect(all['X-Content-Type-Options']).toBe('nosniff')
    expect(all['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(all['X-Frame-Options']).toBe('SAMEORIGIN')
    expect(all['Content-Security-Policy']).toBe("frame-ancestors 'self'")
  })

  it('keeps the microphone (Spraaknotitie) and location (Weer) for NEXUS itself', () => {
    const policy = all['Permissions-Policy']
    expect(policy).toContain('microphone=(self)')
    expect(policy).toContain('geolocation=(self)')
    expect(policy).toContain('camera=()')
  })
})
