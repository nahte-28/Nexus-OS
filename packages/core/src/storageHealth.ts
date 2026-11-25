/**
 * How full this device's storage for NEXUS is, in words for the Offline-centrum. Pure logic: the
 * web app passes what navigator.storage.estimate() and persisted() reported, and the last failed
 * save, if any.
 */

/** From this share of the quota on, NEXUS warns before saving starts to fail. */
export const STORAGE_WARN_RATIO = 0.9

export type StorageLevel = 'ok' | 'warn' | 'full' | 'unknown'

export interface StorageFacts {
  /** Bytes in use, from navigator.storage.estimate(); null when the browser does not say. */
  usage: number | null
  /** Bytes allowed; null or 0 when the browser does not say. */
  quota: number | null
  /** True when the browser promised to keep the data; null when unknown. */
  persisted: boolean | null
  /** When a save last failed because storage was full; null if never (this session). */
  fullAt: number | null
}

export interface StorageSummary {
  level: StorageLevel
  /** "12,3 MB van 2 GB" or null when the browser does not say. */
  usedText: string | null
  /** 0..1, or null when unknown. */
  ratio: number | null
  title: string
  detail: string
}

/** Bytes as "820 kB", "12,3 MB" or "2 GB", in nl-BE. */
export function formatBytes(bytes: number): string {
  const units = ['B', 'kB', 'MB', 'GB', 'TB']
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit++
  }
  const digits = unit === 0 || value >= 100 || Number.isInteger(value) ? 0 : 1
  return `${value.toLocaleString('nl-BE', { maximumFractionDigits: digits, minimumFractionDigits: digits })} ${units[unit]}`
}

/** True for the error a browser throws when localStorage or IndexedDB is full. */
export function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const name = 'name' in err ? String((err as { name: unknown }).name) : ''
  const code = 'code' in err ? Number((err as { code: unknown }).code) : NaN
  // 22: QUOTA_EXCEEDED_ERR in most browsers; 1014: Firefox' NS_ERROR_DOM_QUOTA_REACHED.
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014
}

export function storageSummary(facts: StorageFacts): StorageSummary {
  const known = facts.usage !== null && !!facts.quota && facts.quota > 0
  const ratio = known ? Math.min(1, facts.usage! / facts.quota!) : null
  const usedText = known ? `${formatBytes(facts.usage!)} van ${formatBytes(facts.quota!)}` : null
  const keep =
    facts.persisted === true
      ? 'Je browser bewaart alles, ook als de schijf bijna vol is.'
      : facts.persisted === false
        ? 'Je browser mag gegevens van NEXUS opruimen als de schijf vol raakt. Met een account staat alles ook online.'
        : ''
  if (facts.fullAt !== null) {
    return {
      level: 'full',
      usedText,
      ratio,
      title: 'Opslaan op dit toestel lukte niet',
      detail: 'De opslag van je browser zit vol, dus een wijziging is misschien niet bewaard. Maak ruimte (bijvoorbeeld oude bestanden of dartsfoto\'s wissen) of meld je aan, zodat alles ook online staat.',
    }
  }
  if (ratio !== null && ratio >= STORAGE_WARN_RATIO) {
    return { level: 'warn', usedText, ratio, title: 'De opslag is bijna vol', detail: `Je gebruikt ${usedText}. ${keep}`.trim() }
  }
  if (ratio === null) return { level: 'unknown', usedText, ratio, title: 'Opslag op dit toestel', detail: keep || 'Je browser zegt niet hoeveel ruimte er is.' }
  return { level: 'ok', usedText, ratio, title: 'Genoeg ruimte op dit toestel', detail: `Je gebruikt ${usedText}. ${keep}`.trim() }
}
