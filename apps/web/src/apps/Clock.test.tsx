import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Clock } from './Clock'
import { remindersStore } from '../reminders/store'

describe('Klok', () => {
  afterEach(async () => {
    cleanup()
    for (const r of remindersStore.getSnapshot()) await remindersStore.remove(r.id)
    localStorage.removeItem('nexus.clock.tab')
  })

  it('sets an alarm as a daily reminder for phone and watch', async () => {
    render(<Clock />)
    fireEvent.click(screen.getByRole('tab', { name: 'Wekker' }))
    fireEvent.change(screen.getByLabelText('Uur'), { target: { value: '06:45' } })
    fireEvent.change(screen.getByLabelText('Naam (mag leeg)'), { target: { value: 'Opstaan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Wekker zetten' }))
    await waitFor(() => expect(remindersStore.getSnapshot()).toHaveLength(1))
    const alarm = remindersStore.getSnapshot()[0]
    expect(alarm).toMatchObject({ title: 'Wekker: Opstaan', repeat: 'daily', target: 'phone' })
    expect(new Date(alarm.at).getHours()).toBe(6)
    expect(await screen.findByText('Opstaan')).toBeTruthy()
  })

  it('runs the stopwatch and the world clock', () => {
    render(<Clock />)
    fireEvent.click(screen.getByRole('tab', { name: 'Stopwatch' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(screen.getByRole('button', { name: 'Ronde' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    fireEvent.click(screen.getByRole('button', { name: 'Wissen' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Wereldklok' }))
    expect(screen.getByText('Tokio')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Stad'), { target: { value: 'Asia/Dubai' } })
    fireEvent.click(screen.getByRole('button', { name: 'Toevoegen' }))
    expect(screen.getByText('Dubai')).toBeTruthy()
  })
})
