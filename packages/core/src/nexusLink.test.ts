import { describe, expect, it } from 'vitest'
import { parseNexusLink } from './nexusLink'

describe('parseNexusLink', () => {
  it('opens Snelle notitie with shared text, or for dictation', () => {
    expect(parseNexusLink('nexus://snel?text=Boodschappen%20doen')).toEqual({ kind: 'capture', text: 'Boodschappen doen', dictate: false })
    expect(parseNexusLink('nexus://snel?spraak=1')).toEqual({ kind: 'capture', text: '', dictate: true })
    expect(parseNexusLink('nexus://snel/')).toEqual({ kind: 'capture', text: '', dictate: false })
  })

  it('caps very long shared text', () => {
    const link = parseNexusLink(`nexus://snel?text=${'a'.repeat(3000)}`)
    expect(link?.kind === 'capture' && link.text.length).toBe(2000)
  })

  it('opens a known app, optionally at one item', () => {
    expect(parseNexusLink('nexus://app/agenda')).toEqual({ kind: 'app', app: 'agenda' })
    expect(parseNexusLink('nexus://app/notes/n-123')).toEqual({ kind: 'app', app: 'notes', id: 'n-123' })
    expect(parseNexusLink('nexus:app/notes')).toEqual({ kind: 'app', app: 'notes' })
    expect(parseNexusLink('NEXUS://app/agenda')).toEqual({ kind: 'app', app: 'agenda' })
  })

  it('refuses unknown apps and odd ids', () => {
    expect(parseNexusLink('nexus://app/toString')).toBeNull()
    expect(parseNexusLink('nexus://app/__proto__')).toBeNull()
    expect(parseNexusLink('nexus://app/notes/a%20b')).toBeNull()
    expect(parseNexusLink('nexus://app/notes/a%2Fb')).toBeNull()
    expect(parseNexusLink('nexus://app/notes/%E0%A4%A')).toBeNull()
    expect(parseNexusLink('nexus://app/notes/1/2')).toBeNull()
    expect(parseNexusLink('nexus://app')).toBeNull()
  })

  it('fills in invitation and friend codes', () => {
    expect(parseNexusLink('nexus://join/abcde-fgh23')).toEqual({ kind: 'join', code: 'ABCDE-FGH23' })
    expect(parseNexusLink('nexus://vriend/abcd-efgh')).toEqual({ kind: 'friend', code: 'ABCD-EFGH' })
    expect(parseNexusLink('nexus://join/x')).toBeNull()
  })

  it('ignores other schemes, unknown paths and garbage', () => {
    expect(parseNexusLink('https://nexus-os-lime.vercel.app/app/agenda')).toBeNull()
    expect(parseNexusLink('javascript:alert(1)')).toBeNull()
    expect(parseNexusLink('nexus://wis-alles')).toBeNull()
    expect(parseNexusLink('niet een link')).toBeNull()
    expect(parseNexusLink(`nexus://app/agenda?${'x'.repeat(5000)}`)).toBeNull()
  })
})
