/**
 * Financiën: transactions from a bank's CSV export. Belgian banks write semicolons, a decimal comma
 * and dates as dd/mm/yyyy; the columns differ per bank, so they are guessed from the header and can
 * be changed before importing. Nothing is imported without being shown first.
 */
import { alive, EXPENSE_CATEGORIES, INCOME_CATEGORIES, type FinanceState, type MoneyKind } from './finance'

export const MAX_IMPORT_ROWS = 2000

/** Rows of a CSV file; the separator (; , or tab) is the one the first line uses most. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '')
  const first = clean.slice(0, clean.search(/\r?\n|$/))
  const sep = [';', ',', '\t'].map((c) => ({ c, n: first.split(c).length })).sort((a, b) => b.n - a.n)[0].c
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === sep) {
      row.push(cell.trim())
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++
      row.push(cell.trim())
      if (row.some((c) => c !== '')) rows.push(row)
      row = []
      cell = ''
      if (rows.length > MAX_IMPORT_ROWS) break
    } else cell += ch
  }
  row.push(cell.trim())
  if (row.some((c) => c !== '')) rows.push(row)
  return rows
}

/** "31/10/2026", "31-10-26", "2026-10-31" or "31.10.2026" as YYYY-MM-DD; null when it is no date. */
export function parseBankDate(text: string): string | null {
  const t = text.trim()
  let y: number, m: number, d: number
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t)
  const eu = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/.exec(t)
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  else if (eu) [d, m, y] = [Number(eu[1]), Number(eu[2]), Number(eu[3].length === 2 ? `20${eu[3]}` : eu[3])]
  else return null
  const date = new Date(y, m - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** "-1.234,56", "1 234,56 EUR", "+12.50" or "(4,00)" in signed cents; null when it is no amount. */
export function parseBankAmount(text: string): number | null {
  let t = text.replace(/\s|EUR|€/gi, '')
  if (!t) return null
  let sign = 1
  if (/^\(.*\)$/.test(t)) {
    sign = -1
    t = t.slice(1, -1)
  }
  if (t.startsWith('-')) sign = -sign
  t = t.replace(/^[+-]/, '')
  // The last of . and , followed by one or two digits is the decimal mark; the other groups thousands.
  const decimal = /[.,](\d{1,2})$/.exec(t)
  const whole = (decimal ? t.slice(0, decimal.index) : t).replace(/[.,]/g, '')
  if (!/^\d{1,9}$/.test(whole)) return null
  const cents = Number(whole) * 100 + (decimal ? Number(decimal[1].padEnd(2, '0')) : 0)
  return sign * cents
}

export interface ImportColumns {
  date: number
  amount: number
  /** Columns joined into the note, e.g. the counterparty and the message. */
  description: number[]
}

const HEADERS = {
  date: ['uitvoeringsdatum', 'boekingsdatum', 'datum', 'date', 'transactiedatum', 'valutadatum'],
  amount: ['bedrag', 'amount', 'montant', 'bedrag (eur)'],
  description: ['naam tegenpartij', 'tegenpartij', 'naam', 'omschrijving', 'mededeling', 'mededelingen', 'beschrijving', 'description', 'details', 'counterparty'],
}

const norm = (h: string) => h.toLowerCase().replace(/\s+/g, ' ').trim()

function findHeader(names: string[], header: string[]): number {
  for (const name of names) {
    const i = header.findIndex((h) => norm(h) === name)
    if (i >= 0) return i
  }
  for (const name of names) {
    const i = header.findIndex((h) => norm(h).includes(name))
    if (i >= 0) return i
  }
  return -1
}

/**
 * Which row is the header and which columns hold the date, amount and description. Without a
 * recognisable header, the columns are guessed from the first row that has a date and an amount.
 */
export function guessColumns(rows: string[][]): { headerRow: number; columns: ImportColumns } | null {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const header = rows[r]
    const date = findHeader(HEADERS.date, header)
    const amount = findHeader(HEADERS.amount, header)
    if (date >= 0 && amount >= 0) {
      const description = HEADERS.description.map((n) => findHeader([n], header)).filter((i, k, all) => i >= 0 && i !== date && i !== amount && all.indexOf(i) === k)
      return { headerRow: r, columns: { date, amount, description: description.slice(0, 2) } }
    }
  }
  const sample = rows.find((row) => row.some((c) => parseBankDate(c)) && row.some((c) => /\d[.,]\d{2}$/.test(c) && parseBankAmount(c) !== null))
  if (!sample) return null
  const date = sample.findIndex((c) => parseBankDate(c))
  const amount = sample.findIndex((c, i) => i !== date && /\d[.,]\d{2}$/.test(c) && parseBankAmount(c) !== null)
  const description = sample.map((c, i) => ({ c, i })).filter(({ c, i }) => i !== date && i !== amount && /[a-z]{3}/i.test(c)).sort((a, b) => b.c.length - a.c.length).slice(0, 1).map(({ i }) => i)
  return { headerRow: -1, columns: { date, amount, description } }
}

/** Words in a description that point to a category; the first match wins. */
const CATEGORY_WORDS: Array<[string, string[]]> = [
  ['Abonnementen', ['spotify', 'netflix', 'disney', 'youtube', 'apple.com', 'icloud', 'proximus', 'telenet', 'orange', 'base ', 'mobile vikings', 'scarlet', 'playstation', 'xbox', 'steam']],
  ['Eten en drinken', ['delhaize', 'colruyt', 'aldi', 'lidl', 'carrefour', 'albert heijn', 'spar', 'okay', 'bakker', 'mcdonald', 'burger king', 'quick', 'domino', 'deliveroo', 'uber eats', 'takeaway', 'starbucks', 'panos', 'resto', 'frituur']],
  ['Vervoer', ['nmbs', 'sncb', 'de lijn', 'stib', 'mivb', 'q8', 'shell', 'totalenergies', 'esso', 'lukoil', 'parking', 'uber', 'bolt', 'blue-bike', 'velo']],
  ['Kleding', ['zalando', 'h&m', 'h & m', 'primark', 'zara', 'c&a', 'jbc', 'bershka', 'pull&bear', 'jack & jones', 'nike', 'adidas', 'shein']],
  ['Gezondheid', ['apotheek', 'pharmacie', 'mutualiteit', 'ziekenfonds', 'cm ', 'tandarts', 'dokter', 'huisarts']],
  ['School', ['hogeschool', 'universiteit', 'standaard boekhandel', 'acco', 'studentenvoorziening', 'cursus']],
  ['Uitgaan', ['kinepolis', 'cinema', 'cafe', 'café', 'bar ', 'club', 'ticketmaster', 'eventbrite', 'bowling']],
]
const INCOME_WORDS: Array<[string, string[]]> = [
  ['Job', ['loon', 'salaris', 'wedde', 'jobat', 'randstad', 'start people', 'adecco', 'tempo-team', 'unique']],
  ['Studiebeurs', ['studietoelage', 'studiebeurs', 'vlaamse overheid']],
  ['Zakgeld', ['zakgeld']],
]

export function guessCategory(description: string, kind: MoneyKind): string {
  const text = ` ${description.toLowerCase()} `
  const words = kind === 'income' ? INCOME_WORDS : CATEGORY_WORDS
  const found = words.find(([, list]) => list.some((w) => text.includes(w)))
  return found ? found[0] : 'Andere'
}

export interface ImportCandidate {
  /** Fixed per row content, so the same file imported twice (or on two devices) gives no doubles. */
  id: string
  kind: MoneyKind
  amount: number
  category: string
  note: string
  date: string
  /** A transaction like it is already there (same date, kind and amount); unticked at first. */
  duplicate: boolean
}

/** A short stable hash of a text. */
function hash(text: string): string {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return (h >>> 0).toString(36)
}

/** The rows after the header as transactions; rows without a valid date or amount are skipped and counted. */
export function importCandidates(rows: string[][], headerRow: number, columns: ImportColumns, existing: FinanceState): { candidates: ImportCandidate[]; skipped: number } {
  const have = alive(existing.transactions)
  const ids = new Set(existing.transactions.map((t) => t.id))
  const seen = new Map<string, number>()
  const candidates: ImportCandidate[] = []
  let skipped = 0
  for (const row of rows.slice(headerRow + 1, headerRow + 1 + MAX_IMPORT_ROWS)) {
    const date = parseBankDate(row[columns.date] ?? '')
    const signed = parseBankAmount(row[columns.amount] ?? '')
    if (!date || signed === null || signed === 0) {
      skipped++
      continue
    }
    const kind: MoneyKind = signed > 0 ? 'income' : 'expense'
    const amount = Math.abs(signed)
    const note = columns.description
      .map((i) => row[i] ?? '')
      .filter(Boolean)
      .join(' · ')
      .replace(/\s+/g, ' ')
      .slice(0, 200)
    // Two identical rows in one file are two payments; the counter keeps their ids apart.
    const key = `${date}|${signed}|${note}`
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)
    const id = `import-${hash(key)}-${n}`
    const duplicate = ids.has(id) || have.some((t) => t.date === date && t.amount === amount && (t.kind === kind || (kind === 'income' && t.kind === 'refund')))
    const category = guessCategory(note, kind)
    candidates.push({ id, kind, amount, category: (kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).includes(category) ? category : 'Andere', note, date, duplicate })
  }
  return { candidates, skipped }
}
