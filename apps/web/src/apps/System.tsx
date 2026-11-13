import { useCallback, useEffect, useRef, useState } from 'react'
import { logEvent } from '../devtools/log'
import { isLinuxApp } from '../platform/desktop'
import {
  SCALES,
  modeLabel,
  signalLabel,
  system,
  type BluetoothState,
  type DisplayState,
  type Screen,
  type SoundState,
  type WifiNetwork,
  type WifiState,
} from '../platform/system'

const TABS = ['Wifi', 'Geluid', 'Beeld', 'Bluetooth'] as const
type Tab = (typeof TABS)[number]

const button = 'rounded-lg border border-nx-border px-3 py-1.5 hover:bg-nx-surface-2 disabled:opacity-50'
const primary = 'rounded-lg bg-nx-accent px-3 py-1.5 font-medium text-nx-accent-text disabled:opacity-50'
const card = 'rounded-xl border border-nx-border bg-nx-surface-2/40 p-3'

/** Loads a state, with a busy flag and the last error; `act` runs a change and loads again. */
function useSystemState<T>(load: (fresh: boolean) => Promise<T>) {
  const [state, setState] = useState<T | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const live = useRef(true)
  const refresh = useCallback(
    (fresh = false) => {
      setBusy(true)
      return load(fresh).then(
        (s) => {
          if (!live.current) return
          setState(s)
          setBusy(false)
        },
        (e) => {
          if (!live.current) return
          setError(String(e))
          setBusy(false)
        },
      )
    },
    [load],
  )
  useEffect(() => {
    live.current = true
    void refresh()
    return () => {
      live.current = false
    }
  }, [refresh])
  const act = (change: () => Promise<void>, done?: string) => {
    setError(null)
    setBusy(true)
    return change().then(
      () => {
        if (done) logEvent('system', done)
        return refresh()
      },
      (e) => {
        if (live.current) {
          setError(String(e))
          setBusy(false)
        }
      },
    )
  }
  return { state, setState, busy, error, refresh, act }
}

function Problem({ text }: { text: string | null }) {
  return text ? (
    <p role="alert" className="text-red-500">
      {text}
    </p>
  ) : null
}

function Switch({ label, on, disabled, onChange }: { label: string; on: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-nx-accent' : 'bg-nx-border'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-5' : 'left-0.5'}`} />
    </button>
  )
}

function SignalBars({ signal }: { signal: number }) {
  const bars = signal >= 70 ? 4 : signal >= 45 ? 3 : signal >= 25 ? 2 : 1
  return (
    <span className="inline-flex items-end gap-0.5" aria-label={`Signaal ${signalLabel(signal)}`} role="img">
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={`w-1 rounded-sm ${i <= bars ? 'bg-nx-accent' : 'bg-nx-border'}`} style={{ height: 3 + i * 3 }} />
      ))}
    </span>
  )
}

function WifiPanel() {
  const load = useCallback((fresh: boolean) => system.wifi(fresh), [])
  const { state, busy, error, refresh, act } = useSystemState<WifiState>(load)
  const [asking, setAsking] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const wifiDevice = state?.devices.find((d) => d.kind === 'wifi')
  const cable = state?.devices.find((d) => d.kind === 'ethernet' && d.connected)

  const connect = (n: WifiNetwork, pw?: string) => {
    if (n.secure && !n.saved && pw === undefined) {
      setAsking(n.ssid)
      setPassword('')
      return
    }
    void act(() => system.wifiConnect(n.ssid, pw), `Verbonden met ${n.ssid}`).then(() => setAsking(null))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={`${card} flex items-center justify-between gap-3`}>
        <div>
          <p className="font-medium">Wifi</p>
          <p className="text-xs text-nx-muted">
            {!state ? 'Even kijken…' : !wifiDevice ? 'Deze computer heeft geen wifi.' : wifiDevice.connected ? `Verbonden met ${wifiDevice.connection}` : state.enabled ? 'Niet verbonden' : 'Uit'}
            {cable ? ` · Kabel verbonden (${cable.connection})` : ''}
          </p>
        </div>
        {wifiDevice && <Switch label="Wifi aan" on={!!state?.enabled} disabled={busy} onChange={(on) => void act(() => system.wifiPower(on), on ? 'Wifi aangezet' : 'Wifi uitgezet')} />}
      </div>
      <Problem text={error} />
      {state?.enabled && wifiDevice && (
        <>
          <div className="flex items-center justify-between">
            <p className="font-medium">Netwerken in de buurt</p>
            <button type="button" className={button} disabled={busy} onClick={() => void refresh(true)}>
              {busy ? 'Zoeken…' : 'Opnieuw zoeken'}
            </button>
          </div>
          <ul className="flex flex-col gap-1">
            {state.networks.map((n) => (
              <li key={n.ssid} className={card}>
                <div className="flex items-center gap-3">
                  <SignalBars signal={n.signal} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{n.ssid}</span>
                    <span className="block text-xs text-nx-muted">
                      {n.connected ? 'Verbonden' : n.saved ? 'Bewaard' : n.secure ? 'Met wachtwoord' : 'Open netwerk'}
                    </span>
                  </span>
                  {n.connected ? (
                    <button type="button" className={button} disabled={busy} onClick={() => void act(() => system.wifiDisconnect(wifiDevice.device), `Verbinding met ${n.ssid} verbroken`)}>
                      Verbreken
                    </button>
                  ) : (
                    <button type="button" className={button} disabled={busy} onClick={() => connect(n)}>
                      Verbinden
                    </button>
                  )}
                  {n.saved && (
                    <button type="button" className={button} disabled={busy} onClick={() => void act(() => system.wifiForget(n.ssid), `${n.ssid} vergeten`)}>
                      Vergeten
                    </button>
                  )}
                </div>
                {asking === n.ssid && (
                  <form
                    className="mt-2 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      connect(n, password)
                    }}
                  >
                    <input
                      type="password"
                      autoFocus
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      aria-label={`Wachtwoord voor ${n.ssid}`}
                      placeholder="Wachtwoord"
                      className="min-w-0 flex-1 rounded-lg border border-nx-border bg-nx-surface-2 px-3 py-1.5 outline-none"
                    />
                    <button type="submit" className={primary} disabled={busy || password.length < 8}>
                      Verbinden
                    </button>
                    <button type="button" className={button} onClick={() => setAsking(null)}>
                      Annuleren
                    </button>
                  </form>
                )}
              </li>
            ))}
            {state.networks.length === 0 && <li className="text-nx-muted">{busy ? 'Netwerken zoeken…' : 'Geen netwerken gevonden.'}</li>}
          </ul>
        </>
      )}
    </div>
  )
}

function VolumeRow({ label, input, state, busy, onChange }: { label: string; input: boolean; state: SoundState; busy: boolean; onChange: (change: () => Promise<void>, done?: string) => void }) {
  const volume = input ? state.input : state.output
  const [value, setValue] = useState(volume?.percent ?? 0)
  useEffect(() => setValue(volume?.percent ?? 0), [volume?.percent])
  if (!volume) return null
  return (
    <div className={`${card} flex flex-col gap-2`}>
      <div className="flex items-center justify-between">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-nx-muted">{volume.muted ? 'Gedempt' : `${value}%`}</span>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={150}
          step={5}
          value={value}
          aria-label={`Volume ${label.toLowerCase()}`}
          onChange={(e) => setValue(Number(e.target.value))}
          onPointerUp={() => onChange(() => system.volume(input, value))}
          onKeyUp={() => onChange(() => system.volume(input, value))}
          className="flex-1 accent-[var(--nx-accent)]"
        />
        <button type="button" className={button} disabled={busy} onClick={() => onChange(() => system.mute(input, !volume.muted))}>
          {volume.muted ? 'Dempen uit' : 'Dempen'}
        </button>
      </div>
      {value > 100 && <p className="text-xs text-nx-muted">Boven 100% kan het geluid vervormen.</p>}
    </div>
  )
}

function SoundPanel() {
  const load = useCallback(() => system.sound(), [])
  const { state, busy, error, act } = useSystemState<SoundState>(load)
  if (!state) return <>{error ? <Problem text={error} /> : <p className="text-nx-muted">Even kijken…</p>}</>
  const pick = (list: SoundState['outputs'], label: string) =>
    list.length > 1 && (
      <label className="flex flex-col gap-1">
        <span className="text-xs text-nx-muted">{label}</span>
        <select
          value={list.find((d) => d.default)?.id ?? ''}
          disabled={busy}
          onChange={(e) => void act(() => system.audioDefault(Number(e.target.value)), `${label}: ${list.find((d) => d.id === Number(e.target.value))?.name}`)}
          className="rounded-lg border border-nx-border bg-nx-surface-2 px-3 py-1.5"
        >
          {list.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
    )
  return (
    <div className="flex flex-col gap-3">
      <Problem text={error} />
      {!state.output && !state.input && <p className="text-nx-muted">Geen geluidskaart gevonden.</p>}
      <VolumeRow label="Luidspreker" input={false} state={state} busy={busy} onChange={(c, d) => void act(c, d)} />
      {pick(state.outputs, 'Geluid naar')}
      <VolumeRow label="Microfoon" input state={state} busy={busy} onChange={(c, d) => void act(c, d)} />
      {pick(state.inputs, 'Geluid van')}
    </div>
  )
}

function ScreenCard({ screen, busy, onSet }: { screen: Screen; busy: boolean; onSet: (change: () => Promise<void>, done?: string) => void }) {
  const current = screen.modes.find((m) => m.current) ?? screen.modes[0]
  const [mode, setMode] = useState(current ? screen.modes.indexOf(current) : 0)
  const [scale, setScale] = useState(screen.scale)
  const chosen = screen.modes[mode]
  const changed = chosen !== current || Math.abs(scale - screen.scale) > 0.01
  return (
    <div className={`${card} flex flex-col gap-2`}>
      <p className="font-medium">{screen.description || screen.name}</p>
      {screen.modes.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-nx-muted">Resolutie</span>
          <select value={mode} onChange={(e) => setMode(Number(e.target.value))} className="rounded-lg border border-nx-border bg-nx-surface-2 px-3 py-1.5">
            {screen.modes.map((m, i) => (
              <option key={i} value={i}>
                {modeLabel(m)}
                {m.preferred ? ' (aanbevolen)' : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-xs text-nx-muted">Grootte van tekst en vensters</span>
        <select value={scale} onChange={(e) => setScale(Number(e.target.value))} className="rounded-lg border border-nx-border bg-nx-surface-2 px-3 py-1.5">
          {(SCALES.includes(screen.scale) ? SCALES : [...SCALES, screen.scale].sort()).map((s) => (
            <option key={s} value={s}>
              {Math.round(s * 100)}%
            </option>
          ))}
        </select>
      </label>
      <div>
        <button
          type="button"
          className={primary}
          disabled={busy || !changed || !chosen}
          onClick={() => onSet(() => system.screenSet({ name: screen.name, width: chosen.width, height: chosen.height, refresh: chosen.refresh, scale }), `Scherm ${screen.name}: ${modeLabel(chosen)}, ${Math.round(scale * 100)}%`)}
        >
          Toepassen
        </button>
      </div>
    </div>
  )
}

function DisplayPanel() {
  const load = useCallback(() => system.display(), [])
  const { state, busy, error, act } = useSystemState<DisplayState>(load)
  const [brightness, setBrightness] = useState<number | null>(null)
  useEffect(() => setBrightness(state?.brightness ?? null), [state?.brightness])
  if (!state) return <>{error ? <Problem text={error} /> : <p className="text-nx-muted">Even kijken…</p>}</>
  return (
    <div className="flex flex-col gap-3">
      <Problem text={error} />
      {brightness !== null && (
        <div className={`${card} flex flex-col gap-2`}>
          <div className="flex items-center justify-between">
            <span className="font-medium">Helderheid</span>
            <span className="text-xs text-nx-muted">{brightness}%</span>
          </div>
          <input
            type="range"
            min={5}
            max={100}
            step={5}
            value={brightness}
            aria-label="Helderheid"
            onChange={(e) => setBrightness(Number(e.target.value))}
            onPointerUp={() => void act(() => system.brightness(brightness))}
            onKeyUp={() => void act(() => system.brightness(brightness))}
            className="accent-[var(--nx-accent)]"
          />
        </div>
      )}
      {state.screens.filter((s) => s.enabled).map((s) => (
        <ScreenCard key={s.name} screen={s} busy={busy} onSet={(c, d) => void act(c, d)} />
      ))}
      <p className="text-xs text-nx-muted">NEXUS onthoudt je keuze en zet ze terug bij het aanmelden.</p>
    </div>
  )
}

function BluetoothPanel() {
  const load = useCallback((fresh: boolean) => system.bluetooth(fresh), [])
  const { state, busy, error, refresh, act } = useSystemState<BluetoothState>(load)
  if (!state) return <>{error ? <Problem text={error} /> : <p className="text-nx-muted">Even kijken…</p>}</>
  if (!state.available) return <p className="text-nx-muted">Deze computer heeft geen Bluetooth, of Bluetooth staat uit in het BIOS.</p>
  return (
    <div className="flex flex-col gap-3">
      <div className={`${card} flex items-center justify-between gap-3`}>
        <div>
          <p className="font-medium">Bluetooth</p>
          <p className="text-xs text-nx-muted">{state.powered ? `${state.devices.filter((d) => d.connected).length} verbonden` : 'Uit'}</p>
        </div>
        <Switch label="Bluetooth aan" on={state.powered} disabled={busy} onChange={(on) => void act(() => system.bluetoothPower(on), on ? 'Bluetooth aangezet' : 'Bluetooth uitgezet')} />
      </div>
      <Problem text={error} />
      {state.powered && (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-nx-muted">Zet je koptelefoon, muis of luidspreker in koppelmodus en zoek dan.</p>
            <button type="button" className={button} disabled={busy} onClick={() => void refresh(true)}>
              {busy ? 'Zoeken…' : 'Apparaten zoeken'}
            </button>
          </div>
          <ul className="flex flex-col gap-1">
            {state.devices.map((d) => (
              <li key={d.address} className={`${card} flex items-center gap-3`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{d.name || d.address}</span>
                  <span className="block text-xs text-nx-muted">{d.connected ? 'Verbonden' : d.paired ? 'Gekoppeld' : 'In de buurt'}</span>
                </span>
                {d.connected ? (
                  <button type="button" className={button} disabled={busy} onClick={() => void act(() => system.bluetoothDevice(d.address, 'disconnect'), `${d.name} losgekoppeld`)}>
                    Verbreken
                  </button>
                ) : (
                  <button type="button" className={button} disabled={busy} onClick={() => void act(() => system.bluetoothDevice(d.address, 'connect'), `${d.name} verbonden`)}>
                    {d.paired ? 'Verbinden' : 'Koppelen'}
                  </button>
                )}
                {d.paired && (
                  <button type="button" className={button} disabled={busy} onClick={() => void act(() => system.bluetoothDevice(d.address, 'forget'), `${d.name} vergeten`)}>
                    Vergeten
                  </button>
                )}
              </li>
            ))}
            {state.devices.length === 0 && <li className="text-nx-muted">{busy ? 'Zoeken…' : 'Nog geen apparaten. Tik op Apparaten zoeken.'}</li>}
          </ul>
        </>
      )}
    </div>
  )
}

/** Wifi, sound, screens and Bluetooth of this Linux computer. */
export function System() {
  const [tab, setTab] = useState<Tab>('Wifi')
  if (!isLinuxApp) return <p className="p-4 text-sm text-nx-muted">Systeeminstellingen zie je alleen in de Linux-app van NEXUS.</p>
  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-4 text-sm">
      <div role="tablist" aria-label="Systeem" className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 ${tab === t ? 'bg-nx-surface-2 font-medium' : 'text-nx-muted hover:bg-nx-surface-2'}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={tab}>
        {tab === 'Wifi' && <WifiPanel />}
        {tab === 'Geluid' && <SoundPanel />}
        {tab === 'Beeld' && <DisplayPanel />}
        {tab === 'Bluetooth' && <BluetoothPanel />}
      </div>
    </div>
  )
}
