import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { emptyStudyLab } from '@nexus/core'
import { StudyLab } from './StudyLab'
import { setFeature } from '../features/store'
import { studyLabStore } from '../studylab/store'

describe('Study Lab', () => {
  beforeEach(() => {
    setFeature('studyLab', true)
    studyLabStore.adopt(emptyStudyLab())
    localStorage.removeItem('nexus.studylab.tab')
  })
  afterEach(() => {
    cleanup()
    setFeature('studyLab', false)
  })

  it('makes a course with a topic, a question, and practises it', () => {
    render(<StudyLab />)
    fireEvent.click(screen.getByRole('button', { name: 'Naar Vakken' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nieuw vak' }), { target: { value: 'Elektronica' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Vak' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nieuw onderwerp voor Elektronica' }), { target: { value: 'Wet van Ohm' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Onderwerp' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Hoe zeker ben je van Wet van Ohm?' }), { target: { value: '3' } })

    fireEvent.click(screen.getByRole('tab', { name: 'Vragen' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Onderwerp van de vraag' }), { target: { value: studyLabStore.getSnapshot().subjects[0].topics[0].id } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Soort vraag' }), { target: { value: 'choice' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Vraag' }), { target: { value: 'U = ?' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Antwoord 1' }), { target: { value: 'R · I' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Antwoord 2' }), { target: { value: 'R / I' } })
    fireEvent.click(screen.getByRole('button', { name: 'Vraag bewaren' }))
    expect(within(screen.getByRole('list', { name: 'Vragen' })).getByText('U = ?')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Oefenen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start een ronde' }))
    fireEvent.click(screen.getByRole('button', { name: 'R · I' }))
    expect(screen.getByRole('status').textContent).toBe('Juist!')
    fireEvent.click(screen.getByRole('button', { name: 'Volgende' }))
    expect(screen.getByRole('status').textContent).toMatch(/1 van 1 juist/)

    fireEvent.click(screen.getByRole('tab', { name: 'Voortgang' }))
    expect(screen.getByRole('progressbar', { name: 'Wet van Ohm voortgang' }).getAttribute('aria-valuenow')).toBe('100')
  })
})
