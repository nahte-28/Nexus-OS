// Signs the installers of a desktop release (desktop.yml): writes <file>.sig next to each file,
// an ed25519 signature in hex that the app checks before it installs an update (signature.rs).
//
// The private key comes from the GitHub secret NEXUS_UPDATE_SIGNING_KEY (64 hex characters, made
// with make-update-key.mjs). Without it nothing is signed and the release works as before.
//
// Usage: node apps/desktop/scripts/sign-update.mjs nexus-os-setup.exe [more files]
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const PKCS8_ED25519 = Buffer.from('302e020100300506032b657004220420', 'hex')

const seedHex = (process.env.NEXUS_UPDATE_SIGNING_KEY ?? '').trim()
if (!seedHex) {
  console.log('NEXUS_UPDATE_SIGNING_KEY is not set: the installers are not signed.')
  process.exit(0)
}
if (!/^[0-9a-f]{64}$/i.test(seedHex)) {
  console.error('NEXUS_UPDATE_SIGNING_KEY must be 64 hex characters (see make-update-key.mjs).')
  process.exit(1)
}

const key = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, Buffer.from(seedHex, 'hex')]), format: 'der', type: 'pkcs8' })
const publicHex = createPublicKey(key).export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex')
const expected = (process.env.NEXUS_UPDATE_PUBLIC_KEY ?? '').trim().toLowerCase()
if (expected && expected !== publicHex) {
  console.error('The signing key does not belong to NEXUS_UPDATE_PUBLIC_KEY: the app would refuse these updates.')
  process.exit(1)
}

for (const file of process.argv.slice(2)) {
  const data = readFileSync(file)
  const signature = sign(null, data, key)
  if (!verify(null, data, createPublicKey(key), signature)) throw new Error(`Signing ${file} failed`)
  writeFileSync(`${file}.sig`, signature.toString('hex') + '\n')
  console.log(`Signed ${file}`)
}
