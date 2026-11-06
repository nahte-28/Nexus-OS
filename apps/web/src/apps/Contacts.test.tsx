import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { emptyContacts, listContacts } from '@nexus/core'
import { Contacts } from './Contacts'
import { contactsStore } from '../contacts/store'

describe('Contacten', () => {
  beforeEach(() => {
    contactsStore.adopt(emptyContacts())
    localStorage.removeItem('nexus.contacts.tab')
  })
  afterEach(() => cleanup())

  it('adds a contact, finds it and shows the birthday', () => {
    render(<Contacts />)
    fireEvent.click(screen.getByRole('button', { name: '+ Nieuw' }))
    fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'Anna Peeters' } })
    fireEvent.change(screen.getByLabelText('Telefoon'), { target: { value: '+32 470 12 34 56' } })
    fireEvent.click(screen.getByLabelText('Jaar onbekend'))
    fireEvent.change(screen.getByLabelText('Verjaardag'), { target: { value: '2000-12-25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Bewaren' }))
    expect(listContacts(contactsStore.getSnapshot())[0]).toMatchObject({ name: 'Anna Peeters', birthday: '--12-25', remindBirthday: true })
    expect(screen.getByRole('link', { name: '+32 470 12 34 56' }).getAttribute('href')).toBe('tel:+32470123456')
    fireEvent.click(screen.getByRole('button', { name: 'Terug' }))
    fireEvent.change(screen.getByLabelText('Contacten zoeken'), { target: { value: '0470' } })
    expect(screen.getByText('Anna Peeters')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Verjaardagen' }))
    expect(screen.getByText('Anna Peeters')).toBeTruthy()
  })

  it('imports a .vcf file', async () => {
    render(<Contacts />)
    fireEvent.click(screen.getByRole('tab', { name: 'Instellingen' }))
    const file = new File(['BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Bert Janssens\r\nTEL:0471 00 00 00\r\nEND:VCARD\r\n'], 'contacten.vcf', { type: 'text/vcard' })
    fireEvent.change(screen.getByLabelText('.vcf importeren'), { target: { files: [file] } })
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('1 contact toegevoegd.'))
    expect(listContacts(contactsStore.getSnapshot()).map((c) => c.name)).toEqual(['Bert Janssens'])
  })
})
