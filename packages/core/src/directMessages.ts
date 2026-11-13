/**
 * Privéberichten: one-to-one messages between friends, sealed on the sender's device for every
 * device of both people (NEXUS Connect keys). Pure logic: what is sealed, and the conversation list.
 */
import type { Envelope } from './connectCrypto'

export const DM_TEXT_MAX = 2000
export const DM_DEVICES_MAX = 20

/** What one device can read of a message: the text, or null when it was not sealed for it. */
export interface DirectMessage {
  id: string
  sender: string
  recipient: string
  createdAt: number
  readAt: number | null
  text: string | null
}

export type SealedEnvelopes = Record<string, Envelope>

/** The plaintext inside every envelope: a version, so later NEXUS versions can add to it. */
export function sealText(text: string): string {
  return JSON.stringify({ v: 1, text })
}

export function openText(plain: string | null): string | null {
  if (plain === null) return null
  try {
    const value = JSON.parse(plain) as { v?: unknown; text?: unknown }
    return value.v === 1 && typeof value.text === 'string' ? value.text.slice(0, DM_TEXT_MAX) : null
  } catch {
    return null
  }
}

export interface Conversation {
  friendId: string
  last: DirectMessage | null
  unread: number
}

/** One row per friend, the latest conversation first, then friends without messages. */
export function conversations(friendIds: string[], messages: DirectMessage[], me: string): Conversation[] {
  return friendIds
    .map((friendId) => {
      const mine = messages.filter((m) => (m.sender === friendId && m.recipient === me) || (m.sender === me && m.recipient === friendId))
      const last = mine.reduce<DirectMessage | null>((a, m) => (!a || m.createdAt > a.createdAt ? m : a), null)
      return { friendId, last, unread: mine.filter((m) => m.sender === friendId && m.readAt === null).length }
    })
    .sort((a, b) => (b.last?.createdAt ?? 0) - (a.last?.createdAt ?? 0))
}
