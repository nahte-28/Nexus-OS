import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MessagePushSettings } from './MessagePushSettings'
import { messagePushError, type MessagePush } from './messagePush'

describe('Berichten op je gsm', () => {
  afterEach(cleanup)

  it('turns privéberichten off and keeps the teamchat on', async () => {
    const api = { get: vi.fn(async () => ({ dm: true, team: true })), set: vi.fn(async () => {}) } as unknown as MessagePush
    render(<MessagePushSettings api={api} />)
    fireEvent.click(await screen.findByLabelText('Privéberichten van vrienden'))
    await waitFor(() => expect(api.set).toHaveBeenCalledWith({ dm: false, team: true }))
    expect((screen.getByLabelText('Teamchat') as HTMLInputElement).checked).toBe(true)
  })

  it('puts the switch back when saving fails, and asks for the SQL when it is missing', async () => {
    const api = { get: vi.fn(async () => ({ dm: true, team: true })), set: vi.fn(async () => Promise.reject(new Error('Geen verbinding.'))) } as unknown as MessagePush
    render(<MessagePushSettings api={api} />)
    fireEvent.click(await screen.findByLabelText('Teamchat'))
    expect((await screen.findByRole('alert')).textContent).toBe('Geen verbinding.')
    expect((screen.getByLabelText('Teamchat') as HTMLInputElement).checked).toBe(true)
    expect(messagePushError({ code: 'PGRST205', message: "Could not find the table 'public.message_push'" })).toBe('setup:supabase/migrations/20261116090000_message_push.sql')
  })
})
