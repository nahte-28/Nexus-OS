// Makes the key pair for signed desktop updates. Run it once on your own PC, never in a shared
// place:   node apps/desktop/scripts/make-update-key.mjs
//
// It writes the private key to nexus-update-key.txt in the current folder (not in the repository)
// and prints the public key. Then, on GitHub › Settings › Secrets and variables › Actions:
//   - Secrets › New repository secret: NEXUS_UPDATE_SIGNING_KEY = the contents of the file
//   - Variables › New repository variable: NEXUS_UPDATE_PUBLIC_KEY = the printed public key
// Delete the file afterwards or keep it somewhere safe (a password manager). Whoever has it can
// sign updates that every NEXUS desktop app will install.
import { generateKeyPairSync } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'

const FILE = 'nexus-update-key.txt'
if (existsSync(FILE)) {
  console.error(`${FILE} already exists here; move it away first so no key is overwritten.`)
  process.exit(1)
}
const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const seed = privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32).toString('hex')
const pub = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex')
writeFileSync(FILE, seed + '\n', { mode: 0o600 })
console.log(`Private key written to ${FILE} (paste it into the secret NEXUS_UPDATE_SIGNING_KEY).`)
console.log(`Public key (repository variable NEXUS_UPDATE_PUBLIC_KEY):\n${pub}`)
