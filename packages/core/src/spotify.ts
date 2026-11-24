/**
 * Spotify focusmuziek: when the focus timer runs, NEXUS starts your study playlist on Spotify, and
 * when a Gaming session starts, your gaming playlist. Pure logic; the web app talks to Spotify.
 */

export interface PlaylistRef {
  /** spotify:playlist:… or spotify:album:… */
  uri: string
  name: string
}

export interface SpotifySettings {
  study: PlaylistRef | null
  gaming: PlaylistRef | null
  /** Pause the music in a break and when the timer or session stops; resume after a break. */
  pause: boolean
  /** Shuffle the playlist when NEXUS starts it. */
  shuffle: boolean
}

export const DEFAULT_SPOTIFY: SpotifySettings = { study: null, gaming: null, pause: true, shuffle: true }

/** What you are doing, as far as the music goes. */
export type MusicMode = 'study' | 'gaming' | 'rest' | 'off'

export type MusicStep = { kind: 'play'; playlist: PlaylistRef; mode: 'study' | 'gaming' } | { kind: 'resume' } | { kind: 'pause' }

export const SPOTIFY_SCOPES = ['user-read-playback-state', 'user-modify-playback-state', 'playlist-read-private', 'playlist-read-collaborative']

const URI = /^spotify:(playlist|album):([A-Za-z0-9]{10,40})$/
const LINK = /^https?:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(playlist|album)\/([A-Za-z0-9]{10,40})/

/** A playlist or album link from Spotify (Delen › Link kopiëren) or a spotify: uri, as a uri. */
export function playlistUri(text: string): string | null {
  const t = text.trim()
  const m = t.match(URI) ?? t.match(LINK)
  return m ? `spotify:${m[1]}:${m[2]}` : null
}

function parseRef(raw: unknown): PlaylistRef | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { uri, name } = raw as Record<string, unknown>
  if (typeof uri !== 'string' || !URI.test(uri)) return null
  return { uri, name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 120) : 'Playlist' }
}

export function parseSpotifySettings(raw: unknown): SpotifySettings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SPOTIFY }
  const r = raw as Record<string, unknown>
  return {
    study: parseRef(r.study),
    gaming: parseRef(r.gaming),
    pause: typeof r.pause === 'boolean' ? r.pause : DEFAULT_SPOTIFY.pause,
    shuffle: typeof r.shuffle === 'boolean' ? r.shuffle : DEFAULT_SPOTIFY.shuffle,
  }
}

/** Gaming wins over the focus timer; a break of the timer is rest. */
export function musicMode(focus: { phase: string; running: boolean }, gaming: boolean): MusicMode {
  if (gaming) return 'gaming'
  if (!focus.running) return 'off'
  return focus.phase === 'focus' ? 'study' : 'rest'
}

/**
 * What to tell Spotify when the mode goes from [prev] to [next]. [paused] is the mode whose music
 * NEXUS paused, so that mode coming back resumes instead of starting the playlist again.
 * Returns the step (or null) and the paused mode after it.
 */
export function musicStep(prev: MusicMode, next: MusicMode, settings: SpotifySettings, paused: MusicMode | null): { step: MusicStep | null; paused: MusicMode | null } {
  if (prev === next) return { step: null, paused }
  if (next === 'study' || next === 'gaming') {
    const playlist = next === 'study' ? settings.study : settings.gaming
    if (!playlist) return { step: prev === 'off' || prev === 'rest' ? null : settings.pause ? { kind: 'pause' } : null, paused: null }
    // Back from a break or a stop that NEXUS paused: carry on where it was.
    if (paused === next) return { step: { kind: 'resume' }, paused: null }
    // Music already playing from a break that did not pause.
    if (prev === 'rest' && next === 'study') return { step: null, paused: null }
    return { step: { kind: 'play', playlist, mode: next }, paused: null }
  }
  // Rest or off: pause what NEXUS started, when you want that.
  const playing = prev === 'study' || prev === 'gaming'
  const had = prev === 'study' ? settings.study : prev === 'gaming' ? settings.gaming : null
  if (!settings.pause || !playing || !had) return { step: null, paused: prev === 'rest' && next === 'off' ? paused : null }
  return { step: { kind: 'pause' }, paused: prev }
}

/** base64url without padding, for PKCE. */
export function base64Url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function authorizeUrl(clientId: string, redirectUri: string, challenge: string, state: string): string {
  const q = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SPOTIFY_SCOPES.join(' '),
    state,
  })
  return `https://accounts.spotify.com/authorize?${q.toString()}`
}
