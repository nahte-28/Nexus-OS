import { describe, expect, it } from 'vitest'
import { emptyFinance } from './finance'
import { guessCategory, guessColumns, importCandidates, parseBankAmount, parseBankDate, parseCsv } from './financeImport'

// Shaped like a Belgian bank export: a title line, then the header, semicolons and decimal commas.
const KBC_LIKE = `Rekeningoverzicht;BE00 0000 0000 0000
Rekeningnummer;Datum;Omschrijving;Valutadatum;Bedrag;Munt;Naam tegenpartij;Vrije mededeling
BE00;31/10/2026;BETALING VIA KAART;31/10/2026;-23,45;EUR;DELHAIZE ANTWERPEN;
BE00;30/10/2026;OVERSCHRIJVING;30/10/2026;1.250,00;EUR;RANDSTAD BELGIUM;"Loon oktober; week 43"
BE00;29/10/2026;DOMICILIERING;29/10/2026;-11,99;EUR;SPOTIFY AB;
BE00;29/10/2026;DOMICILIERING;29/10/2026;-11,99;EUR;SPOTIFY AB;
BE00;28/10/2026;BETALING;28/10/2026;-;EUR;KAPOT;
`

describe('bank CSV import', () => {
  it('reads Belgian dates and amounts', () => {
    expect(parseBankDate('31/10/2026')).toBe('2026-10-31')
    expect(parseBankDate('1-2-26')).toBe('2026-02-01')
    expect(parseBankDate('2026-10-31')).toBe('2026-10-31')
    expect(parseBankDate('31/02/2026')).toBeNull()
    expect(parseBankAmount('-1.234,56')).toBe(-123456)
    expect(parseBankAmount('1 250,00 EUR')).toBe(125000)
    expect(parseBankAmount('+12.5')).toBe(1250)
    expect(parseBankAmount('1,234.56')).toBe(123456)
    expect(parseBankAmount('1.234')).toBe(123400)
    expect(parseBankAmount('(4,00)')).toBe(-400)
    expect(parseBankAmount('-')).toBeNull()
  })

  it('parses quoted cells with separators and finds the header below a title line', () => {
    const rows = parseCsv(`﻿${KBC_LIKE}`)
    expect(rows[3][7]).toBe('Loon oktober; week 43')
    expect(guessColumns(rows)).toEqual({ headerRow: 1, columns: { date: 1, amount: 4, description: [6, 2] } })
    expect(parseCsv('a,b\n1,"x, y"')).toEqual([
      ['a', 'b'],
      ['1', 'x, y'],
    ])
  })

  it('guesses columns without a header', () => {
    const rows = parseCsv('12/10/2026;Colruyt Lier;-8,20\n13/10/2026;Zakgeld;20,00')
    expect(guessColumns(rows)).toEqual({ headerRow: -1, columns: { date: 0, amount: 2, description: [1] } })
  })

  it('turns rows into transactions with a category, skips broken rows and marks doubles', () => {
    const rows = parseCsv(KBC_LIKE)
    const { headerRow, columns } = guessColumns(rows)!
    const { candidates, skipped } = importCandidates(rows, headerRow, columns, emptyFinance())
    expect(skipped).toBe(1)
    expect(candidates.map((c) => [c.kind, c.amount, c.category, c.date])).toEqual([
      ['expense', 2345, 'Eten en drinken', '2026-10-31'],
      ['income', 125000, 'Job', '2026-10-30'],
      ['expense', 1199, 'Abonnementen', '2026-10-29'],
      ['expense', 1199, 'Abonnementen', '2026-10-29'],
    ])
    expect(candidates[0].note).toBe('DELHAIZE ANTWERPEN · BETALING VIA KAART')
    // Two identical rows are two payments, with different ids.
    expect(candidates[2].id).not.toBe(candidates[3].id)
    expect(candidates.every((c) => !c.duplicate)).toBe(true)

    // Imported once, the same file again is all doubles; a hand-typed payment also counts.
    const after = { ...emptyFinance(), transactions: candidates.map((c) => ({ ...c, subscriptionId: null, createdAt: 1, updatedAt: 1, deletedAt: null })) }
    const again = importCandidates(rows, headerRow, columns, after).candidates
    expect(again.map((c) => c.id)).toEqual(candidates.map((c) => c.id))
    expect(again.every((c) => c.duplicate)).toBe(true)
  })

  it('guesses categories from the description', () => {
    expect(guessCategory('NMBS Antwerpen-Centraal', 'expense')).toBe('Vervoer')
    expect(guessCategory('Kinepolis Antwerpen', 'expense')).toBe('Uitgaan')
    expect(guessCategory('Vlaamse Overheid studietoelage', 'income')).toBe('Studiebeurs')
    expect(guessCategory('Iets onbekends', 'expense')).toBe('Andere')
  })
})
