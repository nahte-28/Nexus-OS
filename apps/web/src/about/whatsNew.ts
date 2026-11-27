import { CHANGELOG, type ChangelogEntry } from './changelog'

/**
 * "Wat is er nieuw": one file per change in ./entries, named <date>-<slug>.ts, with
 *
 *   import type { ChangelogEntry } from '../changelog'
 *   export default { date: '2026-11-27', title: '…', items: ['…'] } satisfies ChangelogEntry
 *
 * Two pull requests never touch the same file that way, so they merge in any order. The older
 * entries stay in changelog.ts. Newest first; on the same day files come first, last name first.
 */
const files = import.meta.glob<ChangelogEntry>('./entries/*.ts', { eager: true, import: 'default' })

export function mergeEntries(fromFiles: Record<string, ChangelogEntry>, earlier: ChangelogEntry[]): ChangelogEntry[] {
  const own = Object.keys(fromFiles)
    .sort()
    .reverse()
    .map((name) => fromFiles[name])
  // Array.prototype.sort is stable: within one date the order above stays.
  return [...own, ...earlier].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

export const ENTRIES: ChangelogEntry[] = mergeEntries(files, CHANGELOG)

/** File names, for the test that checks each file's date matches its name. */
export const ENTRY_FILES: Record<string, ChangelogEntry> = files
