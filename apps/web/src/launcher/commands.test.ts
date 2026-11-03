import { describe, expect, it } from 'vitest'
import { profilesStore } from '../profiles/store'
import { remindersStore } from '../reminders/store'
import { lifeStore } from '../life/store'
import { runCommand } from './commands'

const local = (t: number) => {
  const d = new Date(t)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

describe('Launcher commands', () => {
  it('sets a reminder and adds a deadline with the rules of their apps', async () => {
    const at = Date.now() + 2 * 3_600_000
    await runCommand('reminder.new', { title: 'Mama bellen', at: local(at) })
    expect(remindersStore.getSnapshot().some((r) => r.title === 'Mama bellen' && r.target === 'phone')).toBe(true)
    await runCommand('deadline.new', { title: 'Labo 4', dueAt: local(at) })
    expect(lifeStore.getSnapshot().some((i) => i.kind === 'deadline' && i.title === 'Labo 4')).toBe(true)
    await expect(runCommand('reminder.new', { title: 'Te laat', at: local(Date.now() - 3_600_000) })).rejects.toThrow('verleden')
  })

  it('switches the profile and refuses unknown commands', async () => {
    await runCommand('profile.switch', { profile: 'developer' })
    expect(profilesStore.getSnapshot().active.id).toBe('developer')
    profilesStore.update((s) => ({ ...s, override: null }))
    await expect(runCommand('rm -rf', {})).rejects.toThrow('Onbekende opdracht.')
  })

  it('needs a game to start Gaming', async () => {
    await expect(runCommand('gaming.start', {})).rejects.toThrow('Voeg eerst een game toe')
  })
})
