import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { emptyKnowledge, noteTitle } from '@nexus/core'
import { Knowledge } from './Knowledge'
import { setFeature } from '../features/store'
import { knowledgeStore } from '../knowledge/store'
import { notesStore } from '../state/notesStore'

describe('Kennis', () => {
  beforeEach(() => {
    setFeature('knowledge', true)
    knowledgeStore.adopt(emptyKnowledge())
    localStorage.removeItem('nexus.knowledge.tab')
    localStorage.removeItem('nexus.knowledge.note')
  })
  afterEach(() => {
    cleanup()
    setFeature('knowledge', false)
  })

  it('writes a Markdown note, links to a new one and finds it again', () => {
    render(<Knowledge />)
    fireEvent.click(screen.getByRole('button', { name: 'Nieuwe notitie' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Titel' }), { target: { value: 'Wet van Ohm' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Inhoud' }), { target: { value: '# Ohm\n\nU = R · I, zie **[[Kirchhoff]]**\n\n- spanning\n- stroom #elektronica' } })
    fireEvent.click(screen.getByRole('button', { name: 'Voorbeeld' }))
    const preview = screen.getByRole('article', { name: 'Voorbeeld' })
    expect(within(preview).getByRole('heading', { name: 'Ohm' })).toBeTruthy()
    expect(within(preview).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getAllByText('#elektronica')).toHaveLength(2)

    // Following a link to a note that does not exist yet makes it.
    fireEvent.click(within(screen.getByRole('region', { name: 'Verwijzingen' })).getByRole('button', { name: 'Kirchhoff' }))
    expect((screen.getByRole('textbox', { name: 'Titel' }) as HTMLInputElement).value).toBe('Kirchhoff')
    expect(within(screen.getByRole('region', { name: 'Verwijzingen' })).getByRole('button', { name: 'Wet van Ohm' })).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Zoeken' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Zoeken in Kennis' }), { target: { value: 'spanning' } })
    expect(within(screen.getByRole('list', { name: 'Zoekresultaten' })).getByText('Wet van Ohm')).toBeTruthy()
  })

  it('groups notes in a collection and restores an older version', () => {
    const id = notesStore.add()
    notesStore.update(id, { title: 'Labo 3', body: 'eerste tekst' })
    localStorage.setItem('nexus.knowledge.note', id)
    render(<Knowledge />)
    fireEvent.click(screen.getByRole('tab', { name: 'Collecties' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nieuwe collectie' }), { target: { value: 'Elektronica' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Collectie' }))

    fireEvent.click(screen.getByRole('tab', { name: 'Notitie' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Elektronica' }))
    const body = screen.getByRole('textbox', { name: 'Inhoud' })
    fireEvent.blur(body)
    fireEvent.change(body, { target: { value: 'tweede tekst' } })

    fireEvent.click(screen.getByRole('tab', { name: 'Bibliotheek' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Collectie' }), { target: { value: knowledgeStore.getSnapshot().collections[0].id } })
    expect(within(screen.getByRole('list', { name: 'Bibliotheek' })).getByText('Labo 3')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Geschiedenis' }))
    fireEvent.click(within(screen.getByRole('list', { name: 'Versies' })).getByRole('button', { name: 'Terugzetten' }))
    expect(screen.getByRole('status').textContent).toMatch(/teruggezet/)
    const note = notesStore.getSnapshot().find((n) => n.id === id)!
    expect([noteTitle(note), note.body]).toEqual(['Labo 3', 'eerste tekst'])
    // The text before the restore is a version too.
    expect(within(screen.getByRole('list', { name: 'Versies' })).getAllByRole('listitem')).toHaveLength(2)
  })
})
