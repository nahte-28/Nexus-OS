import { describe, expect, it } from 'vitest'
import { calculate, formatNumber } from './calculator'

const value = (s: string) => {
  const r = calculate(s)
  return r.ok ? r.value : r.error
}

describe('rekenmachine', () => {
  it('follows the usual order and brackets', () => {
    expect(value('2 + 3 × 4')).toBe(14)
    expect(value('(2 + 3) × 4')).toBe(20)
    expect(value('10 ÷ 4')).toBe(2.5)
    expect(value('-3 + 5')).toBe(2)
    expect(value('2^3^2')).toBe(512)
    expect(value('1,5 * 2')).toBe(3)
  })

  it('does percentages like a pocket calculator', () => {
    expect(value('200 + 10%')).toBe(220)
    expect(value('200 - 25%')).toBe(150)
    expect(value('50%')).toBe(0.5)
    expect(value('80 × 25%')).toBe(20)
  })

  it('says in Dutch what is wrong', () => {
    expect(value('5 / 0')).toBe('Delen door nul kan niet.')
    expect(value('(1 + 2')).toBe('Er ontbreekt een haakje.')
    expect(value('1 + 2)')).toBe('Er staat een haakje te veel.')
    expect(value('3 +')).toBe('De berekening is niet af.')
    expect(value('alert(1)')).toBe('"a" kan de rekenmachine niet lezen.')
    expect(value('1,2,3')).toBe('Dat getal klopt niet.')
  })

  it('writes numbers with a comma', () => {
    expect(formatNumber(0.1 + 0.2)).toBe('0,3')
    expect(formatNumber(1234.5)).toBe('1234,5')
    expect(calculate('1/3').ok && (calculate('1/3') as { text: string }).text).toBe('0,3333333333')
  })
})
