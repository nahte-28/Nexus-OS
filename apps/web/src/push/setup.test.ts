import { describe, expect, it } from 'vitest'
import { makePushSetup, pushConfigSql } from './setup'

describe('web-push setup', () => {
  it('makes a VAPID key pair in the format web-push expects and a long secret', async () => {
    const { publicKey, privateKey, secret } = await makePushSetup()
    const bytes = (v: string) => atob(v.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (v.length % 4)) % 4)).length
    expect(publicKey).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(bytes(publicKey)).toBe(65)
    expect(bytes(privateKey)).toBe(32)
    expect(secret).toMatch(/^[0-9a-f]{64}$/)
  })

  it('gives the SQL for the push address', () => {
    expect(pushConfigSql('https://nexus.example/', 'abc')).toBe(
      "insert into nexus_private.push_config (id, url, secret) values (1, 'https://nexus.example/api/push', 'abc')\n" +
        '  on conflict (id) do update set url = excluded.url, secret = excluded.secret;',
    )
  })
})
