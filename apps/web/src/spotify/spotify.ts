import { authorizeUrl, base64Url, parseSpotifySettings, type PlaylistRef, type SpotifySettings } from '@nexus/core'
import { useSyncExternalStore } from 'react'
import { logEvent } from '../devtools/log'
import { readStorage, writeStorage } from '../state/storage'

/**
 * Spotify for NEXUS: logging in with PKCE (only the public Client ID, no secret), the tokens on this
 * device, and the few Web API calls focusmuziek needs. Nothing goes through the NEXUS server.
 */
export const SPOTIFY_CLIENT_ID = (import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined) || 'b59935169d844a0bbdd33a99d1c71a79'
/** The address set in the Spotify app; Spotify only sends you back there. */
export const SPOTIFY_REDIRECT = 'https://nexus-os-lime.vercel.app/spotify'

const SETTINGS_KEY = 'nexus.spotify'
const AUTH_KEY = 'nexus.spotify.auth'
const VERIFIER_KEY = 'nexus.spotify.verifier'
const API = 'https://api.spotify.com/v1'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'

interface Auth {
  access: string
  refresh: string
  expiresAt: number
}

export interface SpotifyState {
  linked: boolean
  settings: SpotifySettings
  /** The last thing that went wrong, shown in Instellingen; null when the last call worked. */
  problem: string | null
}

type Listener = () => void
const listeners = new Set<Listener>()
let problem: string | null = null

function readAuth(): Auth | null {
  try {
    const a = JSON.parse(readStorage(AUTH_KEY) ?? 'null') as Partial<Auth> | null
    return a && typeof a.access === 'string' && typeof a.refresh === 'string' && typeof a.expiresAt === 'number' ? (a as Auth) : null
  } catch {
    return null
  }
}

function readSettings(): SpotifySettings {
  try {
    return parseSpotifySettings(JSON.parse(readStorage(SETTINGS_KEY) ?? 'null'))
  } catch {
    return parseSpotifySettings(null)
  }
}

let snapshot: SpotifyState = { linked: readAuth() !== null, settings: readSettings(), problem }
function emit() {
  snapshot = { linked: readAuth() !== null, settings: readSettings(), problem }
  for (const l of listeners) l()
}

export const spotifyStore = {
  getSnapshot: () => snapshot,
  subscribe(listener: Listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
export const useSpotify = () => useSyncExternalStore(spotifyStore.subscribe, spotifyStore.getSnapshot)

export function setSpotifySettings(patch: Partial<SpotifySettings>): void {
  writeStorage(SETTINGS_KEY, JSON.stringify({ ...readSettings(), ...patch }))
  emit()
}

function setProblem(text: string | null): void {
  if (problem === text) return
  problem = text
  if (text) logEvent('system', `Spotify: ${text}`, true)
  emit()
}

function saveAuth(body: { access_token: string; refresh_token?: string; expires_in: number }, previous: Auth | null, now = Date.now()): void {
  const refresh = body.refresh_token ?? previous?.refresh
  if (!refresh) throw new Error('Spotify gaf geen vernieuwcode terug.')
  writeStorage(AUTH_KEY, JSON.stringify({ access: body.access_token, refresh, expiresAt: now + (body.expires_in - 60) * 1000 }))
}

/** Sends you to Spotify to log in; it comes back on /spotify. */
export async function startSpotifyLogin(): Promise<void> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)))
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
  const state = base64Url(crypto.getRandomValues(new Uint8Array(12)))
  writeStorage(VERIFIER_KEY, JSON.stringify({ verifier, state }))
  window.location.assign(authorizeUrl(SPOTIFY_CLIENT_ID, SPOTIFY_REDIRECT, challenge, state))
}

/**
 * Back from Spotify on /spotify?code=…: trades the code for tokens and opens Instellingen.
 * Returns false when the address is not the Spotify return.
 */
export async function finishSpotifyLogin(location: Pick<Location, 'pathname' | 'search'> = window.location, fetcher: typeof fetch = fetch): Promise<boolean> {
  if (location.pathname !== '/spotify') return false
  const q = new URLSearchParams(location.search)
  history.replaceState(history.state, '', '/')
  let pending: { verifier?: string; state?: string } = {}
  try {
    pending = JSON.parse(readStorage(VERIFIER_KEY) ?? '{}') as typeof pending
  } catch {
    // Nothing pending: handled below.
  }
  writeStorage(VERIFIER_KEY, '')
  const code = q.get('code')
  if (q.get('error')) {
    setProblem(q.get('error') === 'access_denied' ? 'Je hebt Spotify koppelen geannuleerd.' : `Spotify weigerde de koppeling (${q.get('error')}).`)
    return true
  }
  if (!code || !pending.verifier || q.get('state') !== pending.state) {
    setProblem('De koppeling met Spotify liep fout. Probeer opnieuw vanuit Instellingen.')
    return true
  }
  try {
    const res = await fetcher(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: SPOTIFY_REDIRECT, client_id: SPOTIFY_CLIENT_ID, code_verifier: pending.verifier }),
    })
    if (!res.ok) throw new Error(`Spotify antwoordde ${res.status}.`)
    saveAuth((await res.json()) as { access_token: string; refresh_token?: string; expires_in: number }, null)
    setProblem(null)
    logEvent('system', 'Spotify gekoppeld')
  } catch (err) {
    setProblem(`Koppelen lukte niet: ${err instanceof Error ? err.message : String(err)}`)
  }
  return true
}

/** A code to move the link to the Windows- or Linux-app: the vernieuwcode. This browser lets go of it. */
export function moveCode(): string | null {
  const auth = readAuth()
  if (!auth) return null
  unlinkSpotify()
  return `nxsp1.${auth.refresh}`
}

/** Pastes a code from moveCode(); checks it with Spotify right away. */
export async function applyMoveCode(code: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  const refresh = code.trim().replace(/^nxsp1\./, '')
  if (!refresh || refresh === code.trim()) return 'Dit is geen koppelcode van NEXUS.'
  try {
    await refreshAuth(refresh, fetcher)
    setProblem(null)
    return null
  } catch (err) {
    return `De code werkt niet (meer): ${err instanceof Error ? err.message : String(err)}`
  }
}

export function unlinkSpotify(): void {
  writeStorage(AUTH_KEY, '')
  setProblem(null)
  emit()
}

async function refreshAuth(refresh: string, fetcher: typeof fetch): Promise<Auth> {
  const res = await fetcher(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh, client_id: SPOTIFY_CLIENT_ID }),
  })
  if (!res.ok) {
    // An old or revoked link: koppel opnieuw.
    if (res.status === 400 || res.status === 401) writeStorage(AUTH_KEY, '')
    throw new Error(res.status === 400 ? 'koppel Spotify opnieuw in Instellingen.' : `Spotify antwoordde ${res.status}.`)
  }
  saveAuth((await res.json()) as { access_token: string; refresh_token?: string; expires_in: number }, { access: '', refresh, expiresAt: 0 })
  emit()
  return readAuth()!
}

async function accessToken(fetcher: typeof fetch, now = Date.now()): Promise<string> {
  const auth = readAuth()
  if (!auth) throw new Error('Spotify is niet gekoppeld.')
  if (auth.expiresAt > now) return auth.access
  return (await refreshAuth(auth.refresh, fetcher)).access
}

async function call(path: string, init: RequestInit = {}, fetcher: typeof fetch = fetch): Promise<Response> {
  const token = await accessToken(fetcher)
  return fetcher(`${API}${path}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) } })
}

/** Your playlists (own and followed), for the choice in Instellingen. */
export async function myPlaylists(fetcher: typeof fetch = fetch): Promise<PlaylistRef[]> {
  const res = await call('/me/playlists?limit=50', {}, fetcher)
  if (!res.ok) throw new Error(`Spotify antwoordde ${res.status}.`)
  const body = (await res.json()) as { items?: Array<{ uri?: string; name?: string } | null> }
  return (body.items ?? []).flatMap((p) => (p && typeof p.uri === 'string' ? [{ uri: p.uri, name: p.name || 'Playlist' }] : []))
}

/** The name of a pasted playlist or album, or null when Spotify does not know it. */
export async function playlistName(uri: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  const [, kind, id] = uri.split(':')
  const res = await call(`/${kind}s/${id}?fields=name`, {}, fetcher)
  if (!res.ok) return null
  return ((await res.json()) as { name?: string }).name ?? null
}

/** A device to play on when nothing plays now: this computer's Spotify first, else the first one. */
async function pickDevice(fetcher: typeof fetch): Promise<string | null> {
  const res = await call('/me/player/devices', {}, fetcher)
  if (!res.ok) return null
  const { devices = [] } = (await res.json()) as { devices?: Array<{ id: string | null; type: string; is_restricted: boolean }> }
  const usable = devices.filter((d) => d.id && !d.is_restricted)
  return (usable.find((d) => d.type === 'Computer') ?? usable[0])?.id ?? null
}

const NO_DEVICE = 'Open Spotify op je pc of gsm, dan kan NEXUS de muziek starten.'

/** Starts [playlist], or resumes when [playlist] is null. */
export async function play(playlist: PlaylistRef | null, shuffle: boolean, fetcher: typeof fetch = fetch): Promise<void> {
  const body = playlist ? JSON.stringify({ context_uri: playlist.uri }) : undefined
  let res = await call('/me/player/play', { method: 'PUT', body }, fetcher)
  if (res.status === 404) {
    const device = await pickDevice(fetcher)
    if (!device) throw new Error(NO_DEVICE)
    res = await call(`/me/player/play?device_id=${encodeURIComponent(device)}`, { method: 'PUT', body }, fetcher)
  }
  if (res.status === 403) throw new Error('Spotify laat dit alleen toe met Premium.')
  if (res.status === 404) throw new Error(NO_DEVICE)
  if (!res.ok) throw new Error(`Spotify antwoordde ${res.status}.`)
  if (playlist && shuffle) await call('/me/player/shuffle?state=true', { method: 'PUT' }, fetcher).catch(() => undefined)
}

export async function pause(fetcher: typeof fetch = fetch): Promise<void> {
  const res = await call('/me/player/pause', { method: 'PUT' }, fetcher)
  // Nothing playing (404) or already paused (403): fine.
  if (!res.ok && res.status !== 404 && res.status !== 403) throw new Error(`Spotify antwoordde ${res.status}.`)
}

/** Runs a Spotify call for focusmuziek and keeps its problem for Instellingen. */
export async function attempt(work: () => Promise<void>): Promise<boolean> {
  try {
    await work()
    setProblem(null)
    return true
  } catch (err) {
    setProblem(err instanceof Error ? err.message : String(err))
    return false
  }
}
