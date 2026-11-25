import { buildAgendaFeed, DEFAULT_FEED_OPTIONS, feedUrl, linkedEvents, newFeedToken, type AgendaFeedOptions, type LifeItem, type ProfilesState } from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { logEvent } from '../devtools/log'
import { lifeStore } from '../life/store'
import { apiBase } from '../platform/desktop'
import { profilesStore } from '../profiles/store'
import { supabase } from '../sync/supabase'

/**
 * Agenda in Google: this device writes your lessons (and if you like your appointments and
 * deadlines) as .ics text into Supabase whenever they change; Google Agenda reads them through a
 * secret link (api/agenda-feed.ts). What is already in your Google Agenda is left out.
 */
export const FEED_MIGRATION = 'supabase/migrations/20261125090000_agenda_feed.sql'
/** Changes are written this long after the last one, so typing in the Agenda does not upload every key. */
const PUSH_DELAY_MS = 10_000
/** Even without a change the feed moves on once an hour (the typed-in timetable rolls forward, past lessons are kept). */
const PUSH_EVERY_MS = 60 * 60_000

export interface FeedInfo {
  token: string
  options: AgendaFeedOptions
  updatedAt: number
}

export interface FeedSnapshot {
  /** False until the row was read once (or there is no account). */
  loaded: boolean
  feed: FeedInfo | null
  /** A Dutch error; 'setup:<file>' asks for the SQL step. */
  problem: string | null
}

interface FeedRow {
  token: string
  appointments: boolean
  deadlines: boolean
  ics: string
  updated_at: string
}

export function feedError(error: { code?: string; message?: string } | null | undefined): string {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`
  if (/agenda_feed/i.test(text) && /42P01|42883|PGRST202|PGRST205|could not find the (table|function)|does not exist/i.test(text)) return `setup:${FEED_MIGRATION}`
  if (/fetch|network/i.test(text)) return 'Geen verbinding. Probeer het opnieuw als je online bent.'
  return 'Opslaan in de database mislukt. Probeer het later opnieuw.'
}

/** The address to paste in Google Agenda: always the public NEXUS, also from the Windows app. */
export function publicFeedUrl(token: string): string {
  const origin = apiBase || (typeof location !== 'undefined' ? location.origin : 'https://nexus-os-lime.vercel.app')
  return feedUrl(origin, token)
}

type Sources = { profiles: () => ProfilesState; items: () => LifeItem[]; now: () => number }
const defaultSources: Sources = { profiles: () => profilesStore.getSnapshot().state, items: () => lifeStore.getSnapshot(), now: Date.now }

export function feedText(options: AgendaFeedOptions, previous: string, sources: Sources = defaultSources): string {
  const state = sources.profiles()
  return buildAgendaFeed({ calendarEvents: state.calendarEvents, timetable: state.lessons, items: sources.items(), linked: linkedEvents(state) }, options, sources.now(), previous)
}

export class AgendaFeed {
  private snapshot: FeedSnapshot = { loaded: false, feed: null, problem: null }
  private listeners = new Set<() => void>()
  /** The text as it stands on the server, to keep past events and skip uploads without a change. */
  private ics = ''

  constructor(
    private readonly client: SupabaseClient | null,
    private readonly sources: Sources = defaultSources,
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  getSnapshot = (): FeedSnapshot => this.snapshot

  private set(next: Partial<FeedSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next }
    this.listeners.forEach((l) => l())
  }

  private async signedIn(): Promise<boolean> {
    return Boolean((await this.client?.auth.getSession())?.data.session)
  }

  private take(row: FeedRow | null): void {
    this.ics = row?.ics ?? ''
    this.set({
      loaded: true,
      problem: null,
      feed: row ? { token: row.token, options: { appointments: row.appointments, deadlines: row.deadlines }, updatedAt: Date.parse(row.updated_at) } : null,
    })
  }

  /** Reads whether you have a link. */
  async load(): Promise<void> {
    if (!this.client || !(await this.signedIn())) return this.set({ loaded: true, feed: null })
    const { data, error } = await this.client.from('agenda_feeds').select('token,appointments,deadlines,ics,updated_at').maybeSingle()
    if (error) return this.set({ loaded: true, problem: feedError(error) })
    this.take(data as FeedRow | null)
  }

  private async write(token: string, options: AgendaFeedOptions): Promise<string | null> {
    if (!this.client || !(await this.signedIn())) return 'Meld je aan in de Account-app om je agenda in Google te zetten.'
    const ics = feedText(options, this.ics, this.sources)
    const { data, error } = await this.client
      .from('agenda_feeds')
      .upsert({ token, appointments: options.appointments, deadlines: options.deadlines, ics }, { onConflict: 'user_id' })
      .select('token,appointments,deadlines,ics,updated_at')
      .single()
    if (error) return feedError(error)
    this.take(data as FeedRow)
    return null
  }

  /** Makes a link (or a new one, after which the old one stops working). */
  enable(options: AgendaFeedOptions = this.snapshot.feed?.options ?? DEFAULT_FEED_OPTIONS): Promise<string | null> {
    return this.write(newFeedToken(), options)
  }

  setOptions(options: AgendaFeedOptions): Promise<string | null> {
    const feed = this.snapshot.feed
    return feed ? this.write(feed.token, options) : Promise.resolve(null)
  }

  /** Stops the link: Google gets nothing more and removes the NEXUS events at its next look. */
  async disable(): Promise<string | null> {
    if (!this.client) return null
    const { error } = await this.client.from('agenda_feeds').delete().not('user_id', 'is', null)
    if (error) return feedError(error)
    this.take(null)
    return null
  }

  /** Writes the feed again when it changed; only when you have a link. */
  async push(): Promise<void> {
    const feed = this.snapshot.feed
    if (!this.client || !feed) return
    const ics = feedText(feed.options, this.ics, this.sources)
    if (ics === this.ics) return
    const { error } = await this.client.from('agenda_feeds').update({ ics }).eq('token', feed.token)
    if (error) {
      logEvent('system', `Agenda in Google bijwerken mislukt: ${error.message}`)
      return
    }
    this.ics = ics
    this.set({ feed: { ...feed, updatedAt: Date.now() } })
  }
}

export const agendaFeed = new AgendaFeed(supabase)

export function useAgendaFeed(feed: AgendaFeed = agendaFeed): FeedSnapshot {
  return useSyncExternalStore(feed.subscribe, feed.getSnapshot)
}

/** A one-time file for Importeren in Google Agenda, built here and now. */
export function feedFile(options: AgendaFeedOptions): Blob {
  return new Blob([feedText(options, '')], { type: 'text/calendar;charset=utf-8' })
}

/** Keeps the feed in step with the lessons and the Agenda while NEXUS runs on this device. */
export function startAgendaFeed(feed: AgendaFeed = agendaFeed, client: SupabaseClient | null = supabase): () => void {
  if (!client) return () => {}
  let timer: ReturnType<typeof setTimeout> | null = null
  const later = () => {
    if (!feed.getSnapshot().feed) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void feed.push()
    }, PUSH_DELAY_MS)
  }
  void feed.load().then(() => feed.push())
  const { data } = client.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') void feed.load().then(() => feed.push())
  })
  const offProfiles = profilesStore.subscribe(later)
  const offLife = lifeStore.subscribe(later)
  const hourly = setInterval(() => void feed.push(), PUSH_EVERY_MS)
  return () => {
    if (timer) clearTimeout(timer)
    clearInterval(hourly)
    offProfiles()
    offLife()
    data.subscription.unsubscribe()
  }
}
