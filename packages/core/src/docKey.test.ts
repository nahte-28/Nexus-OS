import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DOC_KEY_PATTERN, docKey } from './docKey'

describe('docKey', () => {
  it('makes doc.<name> for names the database accepts', () => {
    expect(docKey('leesplan')).toBe('doc.leesplan')
    expect(docKey('time-tracker2')).toBe('doc.time-tracker2')
  })
  it('refuses names the database would refuse', () => {
    for (const bad of ['', 'a', 'Hoofd', '1start', 'met spatie', 'x'.repeat(32), 'punt.naam']) expect(() => docKey(bad)).toThrow()
  })
  it('uses the same rule as the migration', () => {
    const sql = /key ~ '(\^doc\\\.\[a-z\]\[a-z0-9-\]\{1,30\}\$)'/
    expect(DOC_KEY_PATTERN.source).toBe('^doc\\.[a-z][a-z0-9-]{1,30}$')
    const migration = readFileSync(new URL('../../../supabase/migrations/20261126110000_settings_docs.sql', import.meta.url), 'utf8')
    expect(sql.test(migration)).toBe(true)
  })
})
