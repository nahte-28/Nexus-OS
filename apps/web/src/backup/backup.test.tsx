import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { parseBackup } from '@nexus/core'
import { BackupSection } from './BackupSection'

const { createBackup, restoreBackup } = await import('./backup')
const { lifeStore } = await import('../life/store')
const { gradesStore } = await import('../grades/store')
const { remindersStore } = await import('../reminders/store')

describe('Back-up', () => {
  afterEach(cleanup)

  it('round-trips the Agenda, reminders and documents', async () => {
    const id = await lifeStore.addDeadline({ title: 'Verslag back-up', dueAt: Date.now() + 86_400_000, projectId: null, notes: '', remind: [], target: 'this_device' })
    await remindersStore.add({ title: 'Bellen', at: Date.now() + 3_600_000, repeat: 'none', target: 'this_device' })
    gradesStore.update((s) => ({ ...s }))
    const text = JSON.stringify(await createBackup({ withFiles: false }))
    const parsed = parseBackup(text)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.life.some((i) => i.id === id)).toBe(true)

    // Restoring on the same device changes nothing that is already there.
    expect(await restoreBackup(parsed.value)).toMatchObject({ life: 0, reminders: 0, notes: 0 })
    // A newer copy in the back-up wins.
    const lost = { ...parsed.value, life: parsed.value.life.map((i) => (i.id === id ? { ...i, title: 'Verslag (uit back-up)', updatedAt: Date.now() + 1000 } : i)) }
    expect((await restoreBackup(lost)).life).toBe(1)
    expect(lifeStore.getSnapshot().find((i) => i.id === id)).toMatchObject({ title: 'Verslag (uit back-up)' })
  })

  it('makes a back-up file and asks before restoring', async () => {
    const download = vi.fn()
    const restore = vi.fn(async () => ({ notes: 2, life: 0, reminders: 0, files: 0, flows: 0, focus: 0 }))
    render(<BackupSection download={download} restore={restore} create={async () => ({ ...(await createBackup({ withFiles: false })), createdAt: new Date(2026, 9, 29).getTime() })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Back-up maken' }))
    await waitFor(() => expect(download).toHaveBeenCalledWith(expect.objectContaining({ format: 'nexus-backup' }), 'nexus-backup-2026-10-29.json'))

    const file = new File([JSON.stringify({ format: 'nexus-backup', version: 1, createdAt: 1, notes: [] })], 'b.json', { type: 'application/json' })
    fireEvent.change(screen.getByLabelText('Back-up kiezen'), { target: { files: [file] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Terugzetten' }))
    expect(await screen.findByText(/Teruggezet: 2 notities/)).toBeTruthy()

    const bad = new File(['nee'], 'x.json')
    fireEvent.change(screen.getByLabelText('Back-up kiezen'), { target: { files: [bad] } })
    expect(await screen.findByRole('alert')).toBeTruthy()
  })
})
