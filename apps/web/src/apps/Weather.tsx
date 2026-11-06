import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { weatherLabel, weatherTip, type Forecast, type WeatherPlace } from '@nexus/core'
import { addPlace, placeKey, refreshForecast, removePlace, searchPlaces, weatherStore } from '../weather/store'

const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-50'

const round = (n: number) => `${Math.round(n)}°`
const hour = (at: number, tz: string) => new Intl.DateTimeFormat('nl-BE', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(at)
const weekday = (at: number, tz: string, i: number) => (i === 0 ? 'Vandaag' : i === 1 ? 'Morgen' : new Intl.DateTimeFormat('nl-BE', { timeZone: tz, weekday: 'long' }).format(at))

function Search({ onDone }: { onDone?: () => void }) {
  const [q, setQ] = useState('')
  const [found, setFound] = useState<WeatherPlace[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const search = async () => {
    setBusy(true)
    setError('')
    try {
      const list = await searchPlaces(q)
      setFound(list)
      if (list.length === 0) setError('Geen plaats gevonden met die naam.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Zoeken mislukt.')
    } finally {
      setBusy(false)
    }
  }
  const here = () => {
    if (!navigator.geolocation) return setError('Dit toestel kan je locatie niet geven. Zoek je plaats op naam.')
    setBusy(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false)
        addPlace({ name: 'Mijn locatie', region: '', lat: pos.coords.latitude, lon: pos.coords.longitude })
        onDone?.()
      },
      () => {
        setBusy(false)
        setError('Je locatie delen lukte niet. Zoek je plaats op naam.')
      },
      { timeout: 15_000, maximumAge: 10 * 60_000 },
    )
  }
  return (
    <div className="space-y-2">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void search() }}>
        <input className={field} value={q} maxLength={80} onChange={(e) => setQ(e.target.value)} placeholder="Bv. Antwerpen" aria-label="Plaats zoeken" />
        <button type="submit" className={button} disabled={busy || q.trim().length < 2}>Zoeken</button>
        <button type="button" className={button} disabled={busy} onClick={here}>Mijn locatie</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {found && found.length > 0 && (
        <ul className="divide-y divide-nx-border rounded-lg border border-nx-border" aria-label="Gevonden plaatsen">
          {found.map((p) => (
            <li key={placeKey(p)}>
              <button type="button" className="w-full px-3 py-2 text-left hover:bg-nx-surface-2" onClick={() => { addPlace(p); setFound(null); setQ(''); onDone?.() }}>
                {p.name} <span className="text-xs text-nx-muted">{p.region}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-nx-muted">Het weer komt van Open-Meteo. NEXUS stuurt alleen de plaats mee, afgerond op ongeveer een kilometer.</p>
    </div>
  )
}

function ForecastView({ forecast, fetchedAt }: { forecast: Forecast; fetchedAt: number }) {
  const tz = forecast.timezone
  const now = weatherLabel(forecast.now.code, forecast.now.day)
  const tip = weatherTip(forecast)
  const today = forecast.days[0]
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <span className="text-6xl" aria-hidden="true">{now.icon}</span>
        <div>
          <p className="text-5xl font-semibold tabular-nums">{round(forecast.now.temp)}</p>
          <p>{now.text} · voelt als {round(forecast.now.feels)}</p>
          <p className="text-xs text-nx-muted">
            Wind {Math.round(forecast.now.wind)} km/u{today ? ` · zon op ${hour(today.sunrise, tz)}, onder ${hour(today.sunset, tz)}` : ''} · bijgewerkt {new Date(fetchedAt).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
      {tip && <p className="rounded-lg bg-nx-surface-2 px-3 py-2">{tip}</p>}
      <section>
        <h3 className="mb-1 font-semibold">Komende uren</h3>
        <ol className="flex gap-2 overflow-x-auto pb-1" aria-label="Komende uren">
          {forecast.hours.map((h) => {
            const l = weatherLabel(h.code)
            return (
              <li key={h.at} className="flex min-w-14 flex-col items-center rounded-lg border border-nx-border px-2 py-1.5 text-xs">
                <span className="text-nx-muted">{hour(h.at, tz)}</span>
                <span className="text-xl" title={l.text}>{l.icon}</span>
                <span className="font-medium">{round(h.temp)}</span>
                <span className="text-nx-muted">{Math.round(h.rainChance)}%</span>
              </li>
            )
          })}
        </ol>
      </section>
      <section>
        <h3 className="mb-1 font-semibold">Deze week</h3>
        <ul className="divide-y divide-nx-border rounded-lg border border-nx-border" aria-label="Deze week">
          {forecast.days.map((d, i) => {
            const l = weatherLabel(d.code)
            return (
              <li key={d.at} className="flex items-center gap-3 px-3 py-1.5">
                <span className="w-24 capitalize">{weekday(d.at, tz, i)}</span>
                <span className="text-xl" aria-hidden="true">{l.icon}</span>
                <span className="flex-1 text-nx-muted">{l.text}{d.rainChance >= 20 ? ` · ${Math.round(d.rainChance)}% regen` : ''}</span>
                <span className="tabular-nums">{round(d.min)} / <span className="font-medium">{round(d.max)}</span></span>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

/** Weer: the forecast for your places, kept on this device so it also shows offline. */
export function Weather() {
  const state = useSyncExternalStore(weatherStore.subscribe, weatherStore.getSnapshot)
  const place = state.places[state.selected]
  const cached = place ? state.cache[placeKey(place)] : undefined
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const load = useCallback(async (force: boolean) => {
    if (!place) return
    setBusy(true)
    setError('')
    try {
      await refreshForecast(place, force)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Weer ophalen mislukt.')
    } finally {
      setBusy(false)
    }
  }, [place])
  useEffect(() => {
    void load(false)
  }, [load])

  if (!place) {
    return (
      <div className="flex h-full flex-col gap-3 overflow-auto p-4 text-sm">
        <h2 className="text-lg font-semibold">Waar wil je het weer van zien?</h2>
        <Search />
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-4 text-sm">
      <div role="tablist" aria-label="Plaatsen" className="flex flex-wrap items-center gap-1">
        {state.places.map((p, i) => (
          <button key={placeKey(p)} role="tab" type="button" aria-selected={i === state.selected} className={`${small} ${i === state.selected ? 'bg-nx-surface-2 font-medium' : ''}`} onClick={() => weatherStore.update((s) => ({ ...s, selected: i }))}>
            {p.name}
          </button>
        ))}
        <button type="button" className={small} onClick={() => setAdding((a) => !a)} aria-expanded={adding}>+ Plaats</button>
        <span className="flex-1" />
        <button type="button" className={small} disabled={busy} onClick={() => void load(true)}>{busy ? 'Bezig…' : 'Vernieuwen'}</button>
        <button type="button" className={small} onClick={() => removePlace(state.selected)} aria-label={`${place.name} weghalen`}>Weghalen</button>
      </div>
      {adding && <Search onDone={() => setAdding(false)} />}
      {error && <p role="alert">{error}</p>}
      {cached ? <ForecastView forecast={cached.forecast} fetchedAt={cached.at} /> : !error && <p className="text-nx-muted">Weer ophalen…</p>}
    </div>
  )
}
