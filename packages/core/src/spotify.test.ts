import { describe, expect, it } from 'vitest'
import { authorizeUrl, base64Url, DEFAULT_SPOTIFY, musicMode, musicStep, parseSpotifySettings, playlistUri, type MusicMode, type SpotifySettings } from './spotify'

const study = { uri: 'spotify:playlist:37i9dQZF1DX8NTLI2TtZa6', name: 'Lofi' }
const gaming = { uri: 'spotify:playlist:0vvXsWCC9xrXsKd4FyS8kM', name: 'Gaming' }
const settings: SpotifySettings = { ...DEFAULT_SPOTIFY, study, gaming }

/** Runs modes one after another and collects the steps. */
function run(modes: MusicMode[], s = settings) {
  let paused: MusicMode | null = null
  const steps: string[] = []
  for (let i = 1; i < modes.length; i++) {
    const r = musicStep(modes[i - 1], modes[i], s, paused)
    paused = r.paused
    steps.push(r.step ? (r.step.kind === 'play' ? `play ${r.step.playlist.name}` : r.step.kind) : '-')
  }
  return steps
}

describe('Spotify focusmuziek', () => {
  it('reads playlist links and uris', () => {
    expect(playlistUri('https://open.spotify.com/playlist/37i9dQZF1DX8NTLI2TtZa6?si=abc')).toBe('spotify:playlist:37i9dQZF1DX8NTLI2TtZa6')
    expect(playlistUri('https://open.spotify.com/intl-nl/album/4aawyAB9vmqN3uQ7FjRGTy')).toBe('spotify:album:4aawyAB9vmqN3uQ7FjRGTy')
    expect(playlistUri(' spotify:playlist:37i9dQZF1DX8NTLI2TtZa6 ')).toBe('spotify:playlist:37i9dQZF1DX8NTLI2TtZa6')
    expect(playlistUri('https://open.spotify.com/track/4aawyAB9vmqN3uQ7FjRGTy')).toBeNull()
    expect(parseSpotifySettings({ study: { uri: 'x' }, pause: false })).toEqual({ ...DEFAULT_SPOTIFY, pause: false })
    expect(parseSpotifySettings({ study }).study).toEqual(study)
  })

  it('knows what you are doing', () => {
    expect(musicMode({ phase: 'focus', running: true }, false)).toBe('study')
    expect(musicMode({ phase: 'break', running: true }, false)).toBe('rest')
    expect(musicMode({ phase: 'focus', running: false }, false)).toBe('off')
    expect(musicMode({ phase: 'focus', running: true }, true)).toBe('gaming')
  })

  it('plays, pauses in a break and resumes after it', () => {
    expect(run(['off', 'study', 'rest', 'study', 'off', 'study', 'off'])).toEqual(['play Lofi', 'pause', 'resume', 'pause', 'resume', 'pause'])
    // A break that ends in a stop stays paused; starting again resumes.
    expect(run(['off', 'study', 'rest', 'off', 'study'])).toEqual(['play Lofi', 'pause', '-', 'resume'])
    expect(run(['off', 'study', 'gaming', 'off', 'study'])).toEqual(['play Lofi', 'play Gaming', 'pause', 'play Lofi'])
  })

  it('keeps the music on without pausing, and skips a mode without playlist', () => {
    expect(run(['off', 'study', 'rest', 'study', 'off'], { ...settings, pause: false })).toEqual(['play Lofi', '-', '-', '-'])
    expect(run(['off', 'gaming', 'off', 'study'], { ...settings, gaming: null })).toEqual(['-', '-', 'play Lofi'])
  })

  it('builds the Spotify login', () => {
    expect(base64Url(new Uint8Array([251, 255, 0]))).toBe('-_8A')
    const url = new URL(authorizeUrl('id', 'https://nexus.example/spotify', 'abc', 's1'))
    expect(url.origin).toBe('https://accounts.spotify.com')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('scope')).toContain('user-modify-playback-state')
  })
})
