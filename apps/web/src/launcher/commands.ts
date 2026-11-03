import { gameForWatch, parseDeadline, parseReminder, type AppId, type CommandValues, type ProfileId } from '@nexus/core'
import { logEvent } from '../devtools/log'
import { gamingStore } from '../gaming/store'
import { startGaming } from '../gaming/timer'
import { lifeStore } from '../life/store'
import { chooseFor } from '../profiles/store'
import { remindersStore } from '../reminders/store'
import { reveal } from '../search/reveal'
import { notesStore } from '../state/notesStore'
import { focusStore } from '../study/timer'

/** What a command did: a message to show, and the app to open (if any). */
export interface CommandOutcome {
  message: string
  open?: AppId
}

const local = (value: string) => Date.parse(value)

/**
 * The handlers of the command registry (LAUNCHER_COMMANDS in packages/core/src/launcher.ts), by id.
 * Each validates its input again with the same rules as its app, and none deletes anything.
 */
export const COMMAND_HANDLERS: Record<string, (values: CommandValues, now: number) => Promise<CommandOutcome>> = {
  'note.new': async (values) => {
    const id = notesStore.add()
    const title = (values.title ?? '').trim().slice(0, 200)
    if (title) notesStore.update(id, { title })
    reveal('notes', id)
    return { message: title ? `Notitie "${title}" gemaakt.` : 'Notitie gemaakt.', open: 'notes' }
  },
  'reminder.new': async (values, now) => {
    const parsed = parseReminder({ title: values.title, at: local(values.at ?? ''), repeat: 'none', target: 'phone' }, now)
    if (!parsed.ok) throw new Error(parsed.error)
    await remindersStore.add(parsed.value, now)
    return { message: `Herinnering "${parsed.value.title}" gezet.` }
  },
  'deadline.new': async (values, now) => {
    const parsed = parseDeadline({ title: values.title, dueAt: local(values.dueAt ?? '') })
    if (!parsed.ok) throw new Error(parsed.error)
    const id = await lifeStore.addDeadline(parsed.value, now)
    reveal('agenda', id)
    return { message: `Deadline "${parsed.value.title}" toegevoegd.` }
  },
  'profile.switch': async (values, now) => {
    chooseFor(values.profile as ProfileId, 'until-change', now)
    return { message: 'Profiel gewisseld.' }
  },
  'focus.start': async (_values, now) => {
    focusStore.start(now)
    return { message: 'Focus gestart.', open: 'study' }
  },
  'gaming.start': async (_values, now) => {
    const game = gameForWatch(gamingStore.getSnapshot())
    if (!game) throw new Error('Voeg eerst een game toe in Gaming Companion.')
    const error = startGaming(game.id, now)
    if (error) throw new Error(error)
    return { message: `Gaming-timer voor ${game.name} gestart.` }
  },
}

/** Runs a command; logs it for the Developer app without the values (they can be personal). */
export async function runCommand(id: string, values: CommandValues, now = Date.now()): Promise<CommandOutcome> {
  const handler = COMMAND_HANDLERS[id]
  if (!handler) throw new Error('Onbekende opdracht.')
  const outcome = await handler(values, now)
  logEvent('system', `Launcher: opdracht ${id} uitgevoerd`)
  return outcome
}
