/**
 * End-to-end encryption for NEXUS Connect ("nexus-connect-v1"), identical on web and Android.
 *
 * Every device has a P-256 key pair. A sender encrypts each message for one recipient:
 *   1. generate an ephemeral P-256 key pair,
 *   2. ECDH(ephemeral private, recipient public) -> 32-byte shared secret (x coordinate),
 *   3. HKDF-SHA256(secret, salt = ephemeral public || recipient public, info = "nexus-connect-v1") -> AES-256 key,
 *   4. AES-256-GCM with a random 12-byte nonce, the recipient device id as associated data.
 * Public keys travel as uncompressed points (65 bytes), everything as standard base64.
 */

export const CONNECT_INFO = 'nexus-connect-v1'

export interface Envelope {
  ephemeralKey: string
  iv: string
  ciphertext: string
}

type Bytes = Uint8Array<ArrayBuffer>

const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const
const encoder = new TextEncoder()

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

export function fromBase64(value: string): Bytes {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function concat(a: Uint8Array, b: Uint8Array): Bytes {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

/** A device key pair; the private key cannot be exported, so it never leaves this browser. */
export function generateDeviceKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(ECDH, false, ['deriveBits'])
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  return toBase64(new Uint8Array(await crypto.subtle.exportKey('raw', key)))
}

function importPublicKey(raw: Bytes): Promise<CryptoKey> {
  if (raw.length !== 65 || raw[0] !== 4) throw new Error('Ongeldige publieke sleutel')
  return crypto.subtle.importKey('raw', raw, ECDH, true, [])
}

async function messageKey(privateKey: CryptoKey, peer: CryptoKey, salt: Bytes, usage: KeyUsage): Promise<CryptoKey> {
  const secret = await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, privateKey, 256)
  const hkdf = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode(CONNECT_INFO) },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  )
}

export async function encryptFor(recipientPublicKey: string, recipientDeviceId: string, plaintext: string): Promise<Envelope> {
  const recipientRaw = fromBase64(recipientPublicKey)
  const recipient = await importPublicKey(recipientRaw)
  const ephemeral = await crypto.subtle.generateKey(ECDH, true, ['deriveBits'])
  const ephemeralRaw = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey))
  const key = await messageKey(ephemeral.privateKey, recipient, concat(ephemeralRaw, recipientRaw), 'encrypt')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(recipientDeviceId) },
    key,
    encoder.encode(plaintext),
  )
  return { ephemeralKey: toBase64(ephemeralRaw), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) }
}

/** Throws when the message was not meant for this device or was tampered with. */
export async function decryptWith(
  privateKey: CryptoKey,
  ownPublicKey: string,
  ownDeviceId: string,
  envelope: Envelope,
): Promise<string> {
  const ephemeralRaw = fromBase64(envelope.ephemeralKey)
  const ephemeral = await importPublicKey(ephemeralRaw)
  const key = await messageKey(privateKey, ephemeral, concat(ephemeralRaw, fromBase64(ownPublicKey)), 'decrypt')
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(envelope.iv), additionalData: encoder.encode(ownDeviceId) },
    key,
    fromBase64(envelope.ciphertext),
  )
  return new TextDecoder().decode(plaintext)
}

/**
 * A short code to compare on two screens before trusting a device: the first 6 bytes of
 * SHA-256 over the raw public key, e.g. "4F2A-91C3-07BE".
 */
export async function fingerprint(publicKey: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', fromBase64(publicKey)))
  const hex = [...digest.slice(0, 6)].map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join('')
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`
}
