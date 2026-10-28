import { mergeFlashcards, newCard, parseAiCards, parseFlashcardsState, reviewCard, type CardGrade, type FlashcardsState } from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logEvent } from '../devtools/log'
import { readAiStream, type StudyPayload } from '../files/study'
import { apiBase } from '../platform/desktop'
import { createProblem, DocStore, startDocSync } from '../state/docStore'
import { supabase } from '../sync/supabase'

export const FLASHCARDS_MIGRATION = 'supabase/migrations/20261027160000_flashcards.sql'

export const flashcardsStore = new DocStore<FlashcardsState>('nexus.flashcards', parseFlashcardsState)
export const flashcardsSyncProblem = createProblem()

export function startFlashcardsSync(client: SupabaseClient | null): () => void {
  return startDocSync(client, flashcardsStore, { key: 'flashcards', parse: parseFlashcardsState, merge: mergeFlashcards, migration: FLASHCARDS_MIGRATION, problem: flashcardsSyncProblem, label: 'Leerkaarten' })
}

export function addDeck(name: string, now = Date.now()): string {
  const id = crypto.randomUUID()
  flashcardsStore.update((s) => ({ ...s, decks: [...s.decks, { id, name: name.trim().slice(0, 80), createdAt: now, updatedAt: now, deletedAt: null }] }))
  return id
}

export function renameDeck(id: string, name: string, now = Date.now()) {
  flashcardsStore.update((s) => ({ ...s, decks: s.decks.map((d) => (d.id === id ? { ...d, name: name.trim().slice(0, 80), updatedAt: now } : d)) }))
}

/** Deletes the deck and its cards. */
export function removeDeck(id: string, now = Date.now()) {
  flashcardsStore.update((s) => ({
    ...s,
    decks: s.decks.map((d) => (d.id === id ? { ...d, deletedAt: now, updatedAt: now } : d)),
    cards: s.cards.map((c) => (c.deckId === id && c.deletedAt === null ? { ...c, deletedAt: now, updatedAt: now } : c)),
  }))
}

export function addCards(deckId: string, cards: Array<{ front: string; back: string }>, now = Date.now()): number {
  const fresh = cards.filter((c) => c.front.trim() && c.back.trim()).map((c) => newCard(crypto.randomUUID(), deckId, c.front, c.back, now))
  if (fresh.length > 0) flashcardsStore.update((s) => ({ ...s, cards: [...s.cards, ...fresh] }))
  return fresh.length
}

export function editCard(id: string, patch: { front?: string; back?: string }, now = Date.now()) {
  flashcardsStore.update((s) => ({ ...s, cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: now } : c)) }))
}

export function removeCard(id: string, now = Date.now()) {
  flashcardsStore.update((s) => ({ ...s, cards: s.cards.map((c) => (c.id === id ? { ...c, front: '', back: '', deletedAt: now, updatedAt: now } : c)) }))
}

export function answerCard(id: string, grade: CardGrade, now = Date.now()) {
  flashcardsStore.update((s) => ({ ...s, cards: s.cards.map((c) => (c.id === id ? reviewCard(c, grade, now) : c)) }))
}

type Token = () => Promise<string | null>
const sessionToken: Token = async () => (await supabase?.auth.getSession())?.data.session?.access_token ?? null

/** Streams NEXUS AI's cards for [payload]; [onCount] gets how many are readable so far. Returns the cards. */
export async function makeCards(
  name: string,
  payload: StudyPayload,
  options: { count: number; focus: string },
  onCount: (count: number) => void,
  token: Token = sessionToken,
  base = apiBase,
): Promise<Array<{ front: string; back: string }>> {
  const access = await token()
  if (!access) throw new Error('Meld je aan in de Account-app om NEXUS AI te gebruiken.')
  const response = await fetch(`${base}/api/cards`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
    body: JSON.stringify({ name, ...payload, ...options }),
  })
  const text = await readAiStream(response, (soFar) => onCount(parseAiCards(soFar).length), 'Dit bestand is te groot voor NEXUS AI.')
  const cards = parseAiCards(text)
  if (cards.length === 0) throw new Error('NEXUS AI vond hier geen stof voor leerkaarten.')
  logEvent('ai', `${cards.length} leerkaarten gemaakt`)
  return cards
}
