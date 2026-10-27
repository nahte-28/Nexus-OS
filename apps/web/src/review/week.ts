import { reviewedWeek, reviewKey, reviewMoment, reviewNoteTitle, weekFacts, type WeekInput } from '@nexus/core'
import type { ConnectEngine } from '../connect/engine'
import { logEvent } from '../devtools/log'
import { readAiStream } from '../files/study'
import { gradesStore } from '../grades/store'
import { habitsStore } from '../habits/store'
import { defaultDeadlineEffects, type DeadlineEffects } from '../life/alerts'
import { lifeStore } from '../life/store'
import { apiBase } from '../platform/desktop'
import { profilesStore } from '../profiles/store'
import { remindersStore } from '../reminders/store'
import { notesStore } from '../state/notesStore'
import { readStorage, writeStorage } from '../state/storage'
import { focusStore } from '../study/timer'
import { supabase } from '../sync/supabase'

const AUTO_KEY = 'nexus.review.auto'
const DONE_KEY = 'nexus.review.week'
const TRIED_KEY = 'nexus.review.triedAt'
const CHECK_MS = 5 * 60_000
/** After a failed automatic review, wait this long before the next try. */
const RETRY_MS = 30 * 60_000

type Token = () => Promise<string | null>
const sessionToken: Token = async () => (await supabase?.auth.getSession())?.data.session?.access_token ?? null

/** Everything NEXUS knows about the week, from the stores on this device. */
export function weekInput(now = Date.now()): WeekInput {
  const { state } = profilesStore.getSnapshot()
  return {
    now,
    items: lifeStore.getSnapshot(),
    calendarEvents: state.calendarEvents,
    timetable: state.lessons,
    reminders: remindersStore.getSnapshot(),
    habits: habitsStore.getSnapshot(),
    grades: gradesStore.getSnapshot(),
    focus: focusStore.getSnapshot().log,
  }
}

export const autoReview = () => readStorage(AUTO_KEY) !== 'off'
export const setAutoReview = (on: boolean) => writeStorage(AUTO_KEY, on ? 'on' : 'off')

/** Streams NEXUS AI's review of [facts]; returns the whole Markdown text. */
export async function streamReview(facts: string, wish: string, onText: (soFar: string) => void, token: Token = sessionToken, base = apiBase): Promise<string> {
  const access = await token()
  if (!access) throw new Error('Meld je aan in de Account-app om NEXUS AI te gebruiken.')
  const response = await fetch(`${base}/api/review`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
    body: JSON.stringify({ facts, wish }),
  })
  return readAiStream(response, onText, 'Je week heeft te veel gegevens voor NEXUS AI.')
}

/** The note of the week's review, when there is one. */
export const reviewNote = (monday: number) => notesStore.getSnapshot().find((n) => n.title === reviewNoteTitle(monday))

/** Saves the review as a note; a second review of the same week replaces the first. */
export function saveReview(monday: number, markdown: string, now = Date.now()): string {
  const id = reviewNote(monday)?.id ?? notesStore.add()
  const made = new Date(now).toLocaleString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
  notesStore.update(id, { title: reviewNoteTitle(monday), body: `Gemaakt door NEXUS AI op ${made}.\n\n${markdown}` })
  writeStorage(DONE_KEY, reviewKey(monday))
  return id
}

/** Makes this week's review and saves it as a note. */
export async function makeReview(wish: string, onText: (soFar: string) => void, now = Date.now(), token: Token = sessionToken): Promise<{ id: string; title: string }> {
  const monday = reviewedWeek(now)
  const markdown = await streamReview(weekFacts(weekInput(now)), wish, onText, token)
  if (!markdown.trim()) throw new Error('NEXUS AI gaf geen overzicht terug.')
  const id = saveReview(monday, markdown, now)
  logEvent('ai', `${reviewNoteTitle(monday)} gemaakt`)
  return { id, title: reviewNoteTitle(monday) }
}

/** The first line of the review's "Je week" part, for the notification. */
export function reviewTeaser(markdown: string): string {
  const line = markdown
    .split('\n')
    .map((l) => l.replace(/^[-*\d.\s#]+/, '').trim())
    .find((l) => l && !/^je week$/i.test(l))
  return line ? (line.length > 140 ? `${line.slice(0, 139)}…` : line) : 'Je overzicht en plan voor volgende week staan in Notities.'
}

/**
 * Makes the review on Sunday evening (or Monday morning, when NEXUS was closed on Sunday) once per
 * week, and tells this device and the phones. Skips a week whose note already exists, e.g. made
 * on another device. Returns true when it made one.
 */
export async function autoReviewTick(effects: DeadlineEffects, now = Date.now(), token: Token = sessionToken): Promise<boolean> {
  if (!autoReview() || !reviewMoment(now)) return false
  const monday = reviewedWeek(now)
  const key = reviewKey(monday)
  if (readStorage(DONE_KEY) === key) return false
  if (reviewNote(monday)) {
    writeStorage(DONE_KEY, key)
    return false
  }
  const tried = Number(readStorage(TRIED_KEY))
  if (Number.isFinite(tried) && now - tried < RETRY_MS) return false
  if (!(await token())) return false
  writeStorage(TRIED_KEY, String(now))
  try {
    let text = ''
    const { title } = await makeReview('', (t) => (text = t), now, token)
    const ref = `review:${key}`
    await effects.local(title, reviewTeaser(text), ref).catch(() => {})
    await effects.phones(title, reviewTeaser(text), ref).catch(() => {})
    return true
  } catch (err) {
    logEvent('ai', `Weekoverzicht maken mislukt: ${err instanceof Error ? err.message : err}`, true)
    return false
  }
}

/** Checks for the weekly review while NEXUS runs; one tab does it (Web Locks). */
export function startWeekReview(connect: ConnectEngine): () => void {
  let stopped = false
  let timer: ReturnType<typeof setInterval> | undefined
  let release: (() => void) | undefined
  const effects = defaultDeadlineEffects(connect)
  const run = () => {
    const tick = () => void Promise.all([notesStore.ready, lifeStore.ready, remindersStore.ready]).then(() => autoReviewTick(effects))
    tick()
    timer = setInterval(tick, CHECK_MS)
  }
  if (typeof navigator !== 'undefined' && navigator.locks) {
    void navigator.locks.request('nexus-review', () => {
      if (stopped) return
      run()
      return new Promise<void>((resolve) => (release = resolve))
    })
  } else {
    run()
  }
  return () => {
    stopped = true
    clearInterval(timer)
    release?.()
  }
}
