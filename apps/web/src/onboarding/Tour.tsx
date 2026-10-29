import { useEffect, useState, useSyncExternalStore } from 'react'
import type { AppId } from '@nexus/core'
import { phonesOf } from '../connect/engine'
import { useConnect } from '../connect/ConnectContext'
import { lifeStore } from '../life/store'
import { useProfiles } from '../profiles/store'
import { readStorage, writeStorage } from '../state/storage'
import { notesStore } from '../state/notesStore'
import { useSync } from '../sync/SyncContext'

const DONE_KEY = 'nexus.tour.done'
const listeners = new Set<() => void>()
let open = false

/** Opens the tour again, e.g. from Instellingen. */
export function startTour(): void {
  open = true
  listeners.forEach((l) => l())
}

function closeTour(): void {
  open = false
  writeStorage(DONE_KEY, '1')
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/**
 * A device is new when the tour never ran here, nobody is signed in and there is nothing in
 * NEXUS yet; existing installs that update don't get the tour by surprise.
 */
function useFirstRun(signedOut: boolean): void {
  useEffect(() => {
    if (!signedOut || readStorage(DONE_KEY)) return
    let cancelled = false
    void Promise.all([notesStore.ready, lifeStore.ready]).then(() => {
      if (!cancelled && notesStore.getSnapshot().length === 0 && lifeStore.getSnapshot().length === 0) startTour()
    })
    return () => {
      cancelled = true
    }
  }, [signedOut])
}

const notificationState = () => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)

interface Step {
  title: string
  text: string
  done?: boolean
  action?: { label: string; run: () => void }
}

/** Rondleiding: the first steps on a new device, each with its own button and a ✓ once done. */
export function Tour({ onOpenApp }: { onOpenApp: (id: AppId) => void }) {
  const visible = useSyncExternalStore(subscribe, () => open)
  const { state: sync } = useSync()
  const { state: connect } = useConnect()
  const { state: profiles } = useProfiles()
  const [step, setStep] = useState(0)
  const [notifications, setNotifications] = useState(notificationState)
  const signedIn = sync.email !== null
  useFirstRun(sync.status === 'signed-out' || sync.status === 'unconfigured')

  useEffect(() => {
    if (visible) setStep(0)
  }, [visible])
  if (!visible) return null

  const go = (id: AppId) => {
    closeTour()
    onOpenApp(id)
  }
  const steps: Step[] = [
    { title: 'Welkom bij NEXUS', text: 'NEXUS is je eigen besturingssysteem in de browser: notities, Agenda, Studie, Financiën en meer, ook zonder internet. Deze rondleiding zet in een paar stappen alles klaar op dit apparaat.' },
    {
      title: 'Aanmelden',
      text: 'Met een account staan je gegevens op al je apparaten en krijg je meldingen op je gsm en horloge. Zonder account blijft alles alleen op dit apparaat.',
      done: signedIn,
      ...(sync.status === 'unconfigured' ? {} : { action: { label: signedIn ? 'Account openen' : 'Aanmelden', run: () => go('account') } }),
    },
    {
      title: 'Meldingen',
      text: 'Sta meldingen toe, dan hoor je het wanneer een deadline, herinnering of focusronde eraan komt.',
      done: notifications === 'granted',
      ...(notifications === 'default' ? { action: { label: 'Meldingen toestaan', run: () => void Notification.requestPermission().then(setNotifications) } } : {}),
    },
    {
      title: 'Gsm en horloge',
      text: 'Koppel je gsm (companion-app of Chrome) en je horloge in Apparaten. Dan gaan meldingen ook naar daar, zelfs als NEXUS op je pc dicht is.',
      done: phonesOf(connect).length > 0,
      ...(signedIn ? { action: { label: 'Apparaten openen', run: () => go('devices') } } : {}),
    },
    {
      title: 'Lesrooster en profielen',
      text: 'Plak in Profielen de link "Koppel agenda" van het AP-intranet of je Google Agenda. School Mode gaat dan vanzelf aan tijdens de lessen.',
      done: profiles.calendarUrl !== '' || profiles.googleUrl !== '',
      action: { label: 'Profielen openen', run: () => go('profiles') },
    },
    { title: 'Klaar', text: 'Zoek alles met Ctrl+K, maak snel een notitie met Alt+N en bewaar af en toe een back-up in Instellingen. Deze rondleiding vind je ook terug in Instellingen.' },
  ]
  const current = steps[step]
  const last = step === steps.length - 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="tour-title" className="nx-glass w-full max-w-md space-y-3 rounded-2xl border border-nx-border p-5 text-sm shadow-xl">
        <p className="text-xs text-nx-muted">
          Stap {step + 1} van {steps.length}
        </p>
        <h2 id="tour-title" className="flex items-center gap-2 text-lg font-semibold">
          {current.title}
          {current.done && <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-600">✓ in orde</span>}
        </h2>
        <p>{current.text}</p>
        {current.action && !current.done && (
          <button type="button" onClick={current.action.run} className="rounded-lg bg-nx-accent px-3 py-1.5 font-medium text-nx-accent-text">
            {current.action.label}
          </button>
        )}
        <div className="flex items-center gap-2 border-t border-nx-border pt-3">
          <button type="button" onClick={closeTour} className="text-nx-muted hover:underline">
            Overslaan
          </button>
          <span className="flex-1" />
          {step > 0 && (
            <button type="button" onClick={() => setStep(step - 1)} className="rounded-lg border border-nx-border px-3 py-1.5 hover:bg-nx-surface-2">
              Terug
            </button>
          )}
          <button type="button" onClick={() => (last ? closeTour() : setStep(step + 1))} className="rounded-lg border border-nx-border px-3 py-1.5 font-medium hover:bg-nx-surface-2">
            {last ? 'Aan de slag' : 'Volgende'}
          </button>
        </div>
      </div>
    </div>
  )
}
