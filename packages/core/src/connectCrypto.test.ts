import { describe, expect, it } from 'vitest'
import { parsePayload } from './connect'
import { decryptWith, encryptFor, exportPublicKey, fingerprint, fromBase64, generateDeviceKeyPair } from './connectCrypto'
import vectors from './fixtures/connect-vectors.json'

describe('connect encryption', () => {
  it('round-trips a message for the intended device only', async () => {
    const pc = await generateDeviceKeyPair()
    const pcPublic = await exportPublicKey(pc.publicKey)
    expect(fromBase64(pcPublic)).toHaveLength(65)

    const envelope = await encryptFor(pcPublic, 'pc-id', 'Hallo pc 👋')
    expect(envelope.ciphertext).not.toContain('Hallo')
    await expect(decryptWith(pc.privateKey, pcPublic, 'pc-id', envelope)).resolves.toBe('Hallo pc 👋')

    // Bound to the recipient id and to its key.
    await expect(decryptWith(pc.privateKey, pcPublic, 'other-id', envelope)).rejects.toThrow()
    const other = await generateDeviceKeyPair()
    await expect(decryptWith(other.privateKey, await exportPublicKey(other.publicKey), 'pc-id', envelope)).rejects.toThrow()
  })

  it('makes a stable, short fingerprint', async () => {
    const pair = await generateDeviceKeyPair()
    const key = await exportPublicKey(pair.publicKey)
    const code = await fingerprint(key)
    expect(code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/)
    expect(await fingerprint(key)).toBe(code)
  })

  it('speaks the same protocol as the Android companion', async () => {
    const { recipient, fromAndroid, fromWeb } = vectors
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      fromBase64(recipient.privateKeyPkcs8),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    )
    for (const vector of [fromAndroid, fromWeb]) {
      await expect(decryptWith(privateKey, recipient.publicKey, recipient.deviceId, vector)).resolves.toBe(vector.plaintext)
    }
    expect(parsePayload(JSON.parse(fromAndroid.plaintext))?.text).toBe('Etentje "vanavond"? 🍝')
    expect(await fingerprint(recipient.publicKey)).toBe(recipient.fingerprint)
  })
})
