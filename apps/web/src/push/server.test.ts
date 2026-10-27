import { describe, expect, it } from 'vitest'
import { vapidKey } from '../../../../api/push'
import { makePushSetup } from './setup'

describe('VAPID keys on the server', () => {
  it('accepts the keys as the Developer app shows them, also when pasted with their name, quotes or line breaks', async () => {
    const { publicKey, privateKey } = await makePushSetup()
    expect(vapidKey(publicKey, 65)).toBe(publicKey)
    expect(vapidKey(privateKey, 32)).toBe(privateKey)
    expect(vapidKey(`VAPID_PUBLIC_KEY=${publicKey}`, 65)).toBe(publicKey)
    expect(vapidKey(` "${publicKey.slice(0, 40)}\n${publicKey.slice(40)}" `, 65)).toBe(publicKey)
    const standard = Buffer.from(publicKey, 'base64url').toString('base64')
    expect(vapidKey(standard, 65)).toBe(publicKey)
  })

  it('refuses something that is not a key of the right length', async () => {
    const { publicKey, privateKey } = await makePushSetup()
    expect(vapidKey(undefined, 65)).toBeNull()
    expect(vapidKey(privateKey, 65)).toBeNull()
    expect(vapidKey(`VAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${privateKey}`, 65)).toBeNull()
    expect(vapidKey('geen sleutel!', 65)).toBeNull()
  })
})
