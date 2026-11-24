import { musicMode, musicStep, type MusicMode } from '@nexus/core'
import { logEvent } from '../devtools/log'
import { gamingStore } from '../gaming/store'
import { focusStore } from '../study/timer'
import { attempt, pause, play, spotifyStore } from './spotify'

/** What you are doing now: the focus timer of this device and the Gaming timer (also from the phone or watch). */
export function currentMode(): MusicMode {
  const { timer } = focusStore.getSnapshot()
  return musicMode({ phase: timer.phase, running: timer.endsAt !== null }, gamingStore.getSnapshot().active !== null)
}

/**
 * Focusmuziek: follows the focus timer and the Gaming timer and tells Spotify what to play. What
 * runs when NEXUS opens is left alone; only changes after that start or pause music.
 */
export function watchFocusMusic(mode: () => MusicMode = currentMode, stores: Array<{ subscribe(l: () => void): () => void }> = [focusStore, gamingStore, spotifyStore]): () => void {
  let prev = mode()
  let paused: MusicMode | null = null
  let queue = Promise.resolve()
  const check = () => {
    const next = mode()
    if (next === prev) return
    const { linked, settings } = spotifyStore.getSnapshot()
    const from = prev
    prev = next
    if (!linked) return
    const r = musicStep(from, next, settings, paused)
    paused = r.paused
    const step = r.step
    if (!step) return
    // One call after the other, so a quick pause and start keep their order.
    queue = queue.then(async () => {
      const ok = await attempt(() => (step.kind === 'pause' ? pause() : play(step.kind === 'play' ? step.playlist : null, settings.shuffle)))
      if (ok && step.kind === 'play') logEvent('system', `Spotify speelt ${step.playlist.name}`)
    })
  }
  const offs = stores.map((s) => s.subscribe(check))
  return () => offs.forEach((off) => off())
}

/** Runs focusmuziek in one NEXUS tab (Web Locks), so two tabs do not both start the music. */
export function startFocusMusic(): () => void {
  let stop: (() => void) | undefined
  let release: (() => void) | undefined
  let stopped = false
  if (typeof navigator !== 'undefined' && navigator.locks) {
    void navigator.locks.request('nexus-spotify', () => {
      if (stopped) return
      stop = watchFocusMusic()
      return new Promise<void>((resolve) => (release = resolve))
    })
  } else {
    stop = watchFocusMusic()
  }
  return () => {
    stopped = true
    stop?.()
    release?.()
  }
}
