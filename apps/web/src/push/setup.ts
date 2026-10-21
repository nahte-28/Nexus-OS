/** One-time web-push setup: the values for Vercel and Supabase, made in this browser. */

export interface PushSetup {
  publicKey: string
  privateKey: string
  secret: string
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** A VAPID key pair (P-256, as web-push expects it) and a secret for the database to call /api/push. */
export async function makePushSetup(): Promise<PushSetup> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const publicKey = base64Url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)))
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  if (!jwk.d) throw new Error('Sleutel maken mislukt.')
  const secret = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('')
  return { publicKey, privateKey: jwk.d, secret }
}

/** The SQL that tells the database where /api/push is and which secret to send. */
export function pushConfigSql(origin: string, secret: string): string {
  const url = `${origin.replace(/\/+$/, '')}/api/push`.replace(/'/g, "''")
  return (
    `insert into nexus_private.push_config (id, url, secret) values (1, '${url}', '${secret.replace(/'/g, "''")}')\n` +
    `  on conflict (id) do update set url = excluded.url, secret = excluded.secret;`
  )
}
