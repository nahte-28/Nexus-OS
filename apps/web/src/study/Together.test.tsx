import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { TogetherSession } from '@nexus/core'
import { logTogether, markJoined, togetherError, type StudyTogether } from './togetherApi'
import { Together } from './Together'
import { FocusStore } from './timer'

function fake(signedIn = true) {
  const sessions: TogetherSession[] = [
    { id: 's1', title: 'Examen wiskunde', focus: 25, break: 5, startedAt: Date.now() - 60_000, host: 'Remo_VG', mine: false, joined: false, members: [{ name: 'Remo_VG', me: false }] },
  ]
  const api = {
    signedIn: vi.fn(async () => signedIn),
    list: vi.fn(async () => sessions.map((s) => ({ ...s, members: [...s.members] }))),
    start: vi.fn(async (title: string, focus: number, pause: number) => {
      sessions.push({ id: 's2', title, focus, break: pause, startedAt: Date.now(), host: 'Ethan', mine: true, joined: true, members: [{ name: 'Ethan', me: true }] })
      return 's2'
    }),
    join: vi.fn(async (id: string) => {
      const s = sessions.find((x) => x.id === id)!
      s.joined = true
      s.members.push({ name: 'Ethan', me: true })
    }),
    leave: vi.fn(async (id: string) => {
      const s = sessions.find((x) => x.id === id)!
      if (s.mine) sessions.splice(sessions.indexOf(s), 1)
      else {
        s.joined = false
        s.members = s.members.filter((m) => !m.me)
      }
    }),
  }
  return api as typeof api & StudyTogether
}

describe('Samen studeren', () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  it('asks to sign in first', async () => {
    render(<Together api={fake(false)} />)
    expect(await screen.findByText(/Meld je aan in Account/)).toBeTruthy()
  })

  it('joins a session of a friend, shows the shared timer and leaves again', async () => {
    const api = fake()
    render(<Together api={api} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Meedoen' }))
    await waitFor(() => expect(api.join).toHaveBeenCalledWith('s1'))
    const mine = await screen.findByRole('region', { name: 'Je sessie' })
    expect(mine.textContent).toContain('Examen wiskunde')
    expect(mine.textContent).toContain('Focus · blok 1')
    expect(mine.textContent).toContain('Ethan (jij)')
    expect(screen.getByRole('timer').textContent).toMatch(/^2[34]:\d\d$/)
    fireEvent.click(screen.getByRole('button', { name: 'Weggaan' }))
    await waitFor(() => expect(api.leave).toHaveBeenCalledWith('s1'))
    expect(await screen.findByRole('button', { name: 'Meedoen' })).toBeTruthy()
  })

  it('starts an own session with the chosen blocks', async () => {
    const api = fake()
    render(<Together api={api} />)
    fireEvent.change(await screen.findByLabelText('Waaraan werk je?'), { target: { value: 'Labo' } })
    fireEvent.change(screen.getByLabelText('Focus'), { target: { value: '50' } })
    fireEvent.change(screen.getByLabelText('Pauze'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Starten' }))
    await waitFor(() => expect(api.start).toHaveBeenCalledWith('Labo', 50, 10))
    expect(await screen.findByRole('button', { name: 'Sessie stoppen' })).toBeTruthy()
  })

  it('logs each finished focus block once, only after joining', () => {
    const store = new FocusStore()
    const start = Date.now() - 3 * 60 * 60_000
    const s: TogetherSession = { id: 'x', title: 'Fysica', focus: 25, break: 5, startedAt: start, host: 'A', mine: false, joined: true, members: [] }
    markJoined('x', start + 10 * 60_000)
    expect(logTogether(s, start + 31 * 60_000, store)).toBe(1)
    expect(logTogether(s, start + 31 * 60_000, store)).toBe(0)
    expect(logTogether(s, start + 61 * 60_000, store)).toBe(1)
    expect(store.getSnapshot().log.filter((e) => e.task === 'Samen: Fysica').map((e) => e.minutes)).toEqual([25, 25])
    expect(logTogether({ ...s, joined: false }, start + 200 * 60_000, store)).toBe(0)
  })

  it('asks for the SQL step when the database is not ready', () => {
    expect(togetherError({ code: 'PGRST202', message: 'Could not find the function public.study_sessions_list' })).toBe('setup:supabase/migrations/20261114090000_study_together.sql')
  })
})
