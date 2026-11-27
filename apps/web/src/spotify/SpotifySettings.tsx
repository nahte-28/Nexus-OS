import { playlistUri, type PlaylistRef } from '@nexus/core'
import { useEffect, useState } from 'react'
import { desktopAppName, isDesktopApp, openWebApp } from '../platform/desktop'
import { applyMoveCode, moveCode, myPlaylists, play, playlistName, setSpotifySettings, startSpotifyLogin, unlinkSpotify, useSpotify, attempt } from './spotify'

const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 hover:bg-nx-surface-2 disabled:opacity-60'
const primary = 'rounded-lg bg-nx-accent px-3 py-1.5 font-medium text-nx-accent-text disabled:opacity-60'

/** Instellingen › Spotify: koppelen, de playlists voor studeren en gamen, en pauzeren. */
export function SpotifySettings() {
  const { linked, settings, problem } = useSpotify()
  const [lists, setLists] = useState<PlaylistRef[] | null>(null)
  const [code, setCode] = useState('')
  const [moved, setMoved] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    if (!linked) return
    let gone = false
    myPlaylists()
      .then((l) => !gone && setLists(l))
      .catch(() => !gone && setLists([]))
    return () => {
      gone = true
    }
  }, [linked])

  return (
    <fieldset className="space-y-3 border-t border-nx-border pt-4 text-sm">
      <legend className="mb-2 text-sm font-semibold text-nx-muted">Spotify</legend>
      <p className="text-nx-muted">Focusmuziek: start je de focustimer in Studie, dan speelt Spotify je studeerplaylist. Start je een Gaming-sessie, ook vanaf je horloge, dan je gamingplaylist. Je hebt Spotify Premium nodig.</p>
      {problem && (
        <p role="alert" className="text-nx-danger">
          {problem}
        </p>
      )}
      {!linked ? (
        isDesktopApp ? (
          <div className="space-y-2">
            <p>
              Koppel Spotify eerst in de browser op nexus-os-lime.vercel.app (Instellingen › Spotify), kies daar Naar de {desktopAppName} en plak de koppelcode hier.
            </p>
            <button type="button" className={button} onClick={() => void openWebApp('https://nexus-os-lime.vercel.app')}>
              NEXUS openen in de browser
            </button>
            <div className="flex gap-2">
              <input aria-label="Koppelcode" value={code} onChange={(e) => setCode(e.target.value)} placeholder="nxsp1.…" className={field} />
              <button type="button" className={primary} disabled={!code.trim()} onClick={() => void applyMoveCode(code).then((err) => (setNote(err), err || setCode('')))}>
                Koppelen
              </button>
            </div>
            {note && <p className="text-nx-danger">{note}</p>}
          </div>
        ) : (
          <button type="button" className={primary} onClick={() => void startSpotifyLogin()}>
            Spotify koppelen
          </button>
        )
      ) : (
        <>
          <PlaylistChoice label="Studeren" value={settings.study} lists={lists} onChange={(study) => setSpotifySettings({ study })} />
          <PlaylistChoice label="Gamen" value={settings.gaming} lists={lists} onChange={(gaming) => setSpotifySettings({ gaming })} />
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.pause} onChange={(e) => setSpotifySettings({ pause: e.target.checked })} className="accent-[var(--nx-accent)]" />
            Pauzeren tijdens een pauze en als je stopt; daarna gaat de muziek verder
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.shuffle} onChange={(e) => setSpotifySettings({ shuffle: e.target.checked })} className="accent-[var(--nx-accent)]" />
            Willekeurige volgorde
          </label>
          <div className="flex flex-wrap gap-2">
            {settings.study && (
              <button type="button" className={button} onClick={() => void attempt(() => play(settings.study, settings.shuffle))}>
                Studeerplaylist nu spelen
              </button>
            )}
            {!isDesktopApp && (
              <button type="button" className={button} onClick={() => setMoved(moveCode())}>
                Naar de Windows- of Linux-app
              </button>
            )}
            <button type="button" className={`${button} text-nx-danger`} onClick={unlinkSpotify}>
              Ontkoppelen
            </button>
          </div>
        </>
      )}
      {moved && (
        <div className="space-y-1 rounded-md border border-nx-border p-2">
          <p>Plak deze code in de app bij Instellingen › Spotify. Deze browser is nu ontkoppeld, zodat de muziek maar vanaf één plek start.</p>
          <input readOnly aria-label="Je koppelcode" value={moved} onFocus={(e) => e.target.select()} className={`${field} font-mono text-xs`} />
          <button type="button" className={button} onClick={() => void navigator.clipboard?.writeText(moved)}>
            Kopiëren
          </button>
        </div>
      )}
    </fieldset>
  )
}

function PlaylistChoice({ label, value, lists, onChange }: { label: string; value: PlaylistRef | null; lists: PlaylistRef[] | null; onChange: (p: PlaylistRef | null) => void }) {
  const [link, setLink] = useState('')
  const [error, setError] = useState<string | null>(null)
  const options = lists && value && !lists.some((l) => l.uri === value.uri) ? [value, ...lists] : (lists ?? (value ? [value] : []))
  const addLink = async () => {
    const uri = playlistUri(link)
    if (!uri) return setError('Plak een link naar een playlist of album (Delen › Link kopiëren in Spotify).')
    const name = await playlistName(uri).catch(() => null)
    onChange({ uri, name: name ?? 'Playlist via link' })
    setLink('')
    setError(null)
  }
  return (
    <div className="space-y-1">
      <label className="flex flex-wrap items-center gap-2">
        <span className="w-20">{label}</span>
        <select aria-label={`Playlist voor ${label.toLowerCase()}`} value={value?.uri ?? ''} onChange={(e) => onChange(options.find((o) => o.uri === e.target.value) ?? null)} className={`${field} sm:w-72`}>
          <option value="">Geen muziek</option>
          {options.map((o) => (
            <option key={o.uri} value={o.uri}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2 sm:pl-[5.5rem]">
        <input aria-label={`Link voor ${label.toLowerCase()}`} value={link} onChange={(e) => setLink(e.target.value)} placeholder="of plak een link uit Spotify" className={`${field} sm:w-72`} />
        <button type="button" className={button} disabled={!link.trim()} onClick={() => void addLink()}>
          Gebruiken
        </button>
      </div>
      {error && <p className="text-nx-danger">{error}</p>}
    </div>
  )
}
