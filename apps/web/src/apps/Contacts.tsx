import { useState, useSyncExternalStore } from 'react'
import {
  deleteContact, emptyContact, importContacts, listContacts, parseVCards, saveContact, telHref, toVCards, upcomingBirthdays,
  type BirthdayTarget, type Contact, type ContactDraft,
} from '@nexus/core'
import { contactsStore, contactsSyncProblem, useContacts } from '../contacts/store'
import { readStorage, writeStorage } from '../state/storage'

const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-50'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'

const TABS = ['Contacten', 'Verjaardagen', 'Instellingen'] as const
type Tab = (typeof TABS)[number]
const TAB_KEY = 'nexus.contacts.tab'

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'
const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']
function birthdayText(b: string): string {
  if (!b) return ''
  const [y, m, d] = b.startsWith('--') ? ['', b.slice(2, 4), b.slice(5, 7)] : b.split('-')
  return `${Number(d)} ${MONTHS[Number(m) - 1]}${y ? ` ${y}` : ''}`
}

function Avatar({ name }: { name: string }) {
  return <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-nx-surface-2 text-xs font-semibold" aria-hidden="true">{initials(name)}</span>
}

function Editor({ start, id, onClose }: { start: ContactDraft; id: string; onClose: () => void }) {
  const [draft, setDraft] = useState(start)
  const [yearKnown, setYearKnown] = useState(!start.birthday.startsWith('--'))
  const [error, setError] = useState('')
  const set = (patch: Partial<ContactDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const save = () => {
    const next = saveContact(contactsStore.getSnapshot(), draft, id)
    if (typeof next === 'string') return setError(next)
    contactsStore.update(() => next)
    onClose()
  }
  // A date field needs a year; without one the birthday is kept as --MM-DD.
  const dateValue = draft.birthday ? (draft.birthday.startsWith('--') ? `2000${draft.birthday.slice(1)}` : draft.birthday) : ''
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); save() }} aria-label="Contact bewerken">
      <label className="flex flex-col gap-1">Naam<input className={field} value={draft.name} maxLength={100} autoFocus onChange={(e) => set({ name: e.target.value })} /></label>
      <label className="flex flex-col gap-1">Telefoon<input className={field} type="tel" value={draft.phone} maxLength={40} onChange={(e) => set({ phone: e.target.value })} placeholder="Bv. 0470 12 34 56" /></label>
      <label className="flex flex-col gap-1">E-mail<input className={field} type="email" value={draft.email} maxLength={120} onChange={(e) => set({ email: e.target.value })} /></label>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          Verjaardag
          <input className={`${field} w-auto`} type="date" value={dateValue} onChange={(e) => set({ birthday: e.target.value ? (yearKnown ? e.target.value : `-${e.target.value.slice(4)}`) : '' })} />
        </label>
        <label className="flex items-center gap-1.5 pb-1.5">
          <input type="checkbox" checked={!yearKnown} onChange={(e) => { setYearKnown(!e.target.checked); if (draft.birthday) set({ birthday: e.target.checked ? `-${dateValue.slice(4)}` : dateValue }) }} />
          Jaar onbekend
        </label>
        <label className="flex items-center gap-1.5 pb-1.5">
          <input type="checkbox" checked={draft.remindBirthday} onChange={(e) => set({ remindBirthday: e.target.checked })} />
          Melding op de dag
        </label>
      </div>
      <label className="flex flex-col gap-1">Adres<input className={field} value={draft.address} maxLength={200} onChange={(e) => set({ address: e.target.value })} /></label>
      <label className="flex flex-col gap-1">Notitie<textarea className={field} rows={2} value={draft.notes} maxLength={1000} onChange={(e) => set({ notes: e.target.value })} /></label>
      <label className="flex items-center gap-1.5"><input type="checkbox" checked={draft.favorite} onChange={(e) => set({ favorite: e.target.checked })} />Favoriet (bovenaan)</label>
      {error && <p role="alert">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className={primaryButton}>Bewaren</button>
        <button type="button" className={button} onClick={onClose}>Annuleren</button>
      </div>
    </form>
  )
}

function Details({ c, onEdit, onClose }: { c: Contact; onEdit: () => void; onClose: () => void }) {
  const tel = telHref(c.phone)
  return (
    <section className="space-y-2" aria-label={c.name}>
      <div className="flex items-center gap-3">
        <Avatar name={c.name} />
        <h2 className="flex-1 text-lg font-semibold">{c.name}{c.favorite ? ' ★' : ''}</h2>
        <button type="button" className={small} onClick={onEdit}>Bewerken</button>
        <button type="button" className={small} onClick={onClose}>Terug</button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {c.phone && (<><dt className="text-nx-muted">Telefoon</dt><dd>{tel ? <a className="underline" href={tel}>{c.phone}</a> : c.phone}</dd></>)}
        {c.email && (<><dt className="text-nx-muted">E-mail</dt><dd><a className="underline" href={`mailto:${c.email}`}>{c.email}</a></dd></>)}
        {c.birthday && (<><dt className="text-nx-muted">Verjaardag</dt><dd>{birthdayText(c.birthday)}{c.remindBirthday ? '' : ' (geen melding)'}</dd></>)}
        {c.address && (<><dt className="text-nx-muted">Adres</dt><dd className="whitespace-pre-line">{c.address}</dd></>)}
        {c.notes && (<><dt className="text-nx-muted">Notitie</dt><dd className="whitespace-pre-line">{c.notes}</dd></>)}
      </dl>
      <button type="button" className={small} onClick={() => { contactsStore.update((s) => deleteContact(s, c.id)); onClose() }}>Verwijderen</button>
    </section>
  )
}

function List() {
  const state = useContacts()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string; draft: ContactDraft } | null>(null)
  const contacts = listContacts(state, q)
  const current = open ? listContacts(state).find((c) => c.id === open) : undefined
  if (editing) return <Editor start={editing.draft} id={editing.id} onClose={() => { setOpen(editing.id); setEditing(null) }} />
  if (current) {
    const { id: _id, updatedAt: _u, deleted: _d, ...draft } = current
    return <Details c={current} onEdit={() => setEditing({ id: current.id, draft })} onClose={() => setOpen(null)} />
  }
  return (
    <section className="space-y-2">
      <div className="flex gap-2">
        <input className={field} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoeken op naam, nummer of e-mail" aria-label="Contacten zoeken" />
        <button type="button" className={primaryButton} onClick={() => setEditing({ id: crypto.randomUUID(), draft: emptyContact() })}>+ Nieuw</button>
      </div>
      {contacts.length === 0 ? (
        <p className="text-nx-muted">{q ? 'Niemand gevonden.' : 'Nog geen contacten. Voeg er een toe, of importeer een .vcf-bestand van je gsm bij Instellingen.'}</p>
      ) : (
        <ul className="divide-y divide-nx-border rounded-lg border border-nx-border" aria-label="Contacten">
          {contacts.map((c) => (
            <li key={c.id}>
              <button type="button" className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-nx-surface-2" onClick={() => setOpen(c.id)}>
                <Avatar name={c.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.name}{c.favorite ? ' ★' : ''}</span>
                  <span className="block truncate text-xs text-nx-muted">{c.phone || c.email}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Birthdays() {
  const state = useContacts()
  const list = upcomingBirthdays(state, Date.now(), 366)
  if (list.length === 0) return <p className="text-nx-muted">Nog geen verjaardagen. Vul ze in bij een contact.</p>
  return (
    <ul className="divide-y divide-nx-border rounded-lg border border-nx-border" aria-label="Verjaardagen">
      {list.map((b) => (
        <li key={b.contact.id} className="flex items-center gap-3 px-3 py-2">
          <Avatar name={b.contact.name} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{b.contact.name}</span>
            <span className="text-xs text-nx-muted">
              {new Date(b.at).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' })}
              {b.turns !== null && b.turns > 0 ? ` · wordt ${b.turns}` : ''}
            </span>
          </span>
          <span className={`text-sm ${b.daysLeft === 0 ? 'font-semibold' : 'text-nx-muted'}`}>
            {b.daysLeft === 0 ? 'Vandaag 🎉' : b.daysLeft === 1 ? 'Morgen' : `over ${b.daysLeft} dagen`}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Settings() {
  const state = useContacts()
  const [note, setNote] = useState('')
  const setSettings = (patch: Partial<typeof state.settings>) => contactsStore.update((s) => ({ ...s, settings: { ...s.settings, ...patch, updatedAt: Date.now() } }))
  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > 5_000_000) return setNote('Dat bestand is te groot (meer dan 5 MB).')
    const drafts = parseVCards(await file.text())
    if (drafts.length === 0) return setNote('Er staan geen contacten in dat bestand.')
    const r = importContacts(contactsStore.getSnapshot(), drafts, () => crypto.randomUUID())
    contactsStore.update(() => r.state)
    setNote(`${r.added} ${r.added === 1 ? 'contact' : 'contacten'} toegevoegd${r.skipped ? `, ${r.skipped} overgeslagen (had je al)` : ''}.`)
  }
  const exportAll = () => {
    const blob = new Blob([toVCards(listContacts(state))], { type: 'text/vcard' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'nexus-contacten.vcf'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
  }
  return (
    <section className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="font-semibold">Verjaardagen</legend>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">Melding om<input type="time" className={`${field} w-auto`} value={state.settings.birthdayTime} onChange={(e) => e.target.value && setSettings({ birthdayTime: e.target.value })} /></label>
          <label className="flex flex-col gap-1">
            Waar
            <select className={`${field} w-auto`} value={state.settings.birthdayTarget} onChange={(e) => setSettings({ birthdayTarget: e.target.value as BirthdayTarget })}>
              <option value="phone">Ook op gsm en horloge</option>
              <option value="this_device">Alleen hier</option>
            </select>
          </label>
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="font-semibold">Importeren en exporteren</legend>
        <p className="text-nx-muted">Op je gsm exporteer je contacten als .vcf (Contacten › Importeren/exporteren). Kies dat bestand hier; wie je al had, wordt overgeslagen.</p>
        <div className="flex flex-wrap gap-2">
          <label className={`${button} cursor-pointer`}>
            .vcf importeren
            <input type="file" accept=".vcf,text/vcard,text/x-vcard" className="sr-only" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          <button type="button" className={button} disabled={listContacts(state).length === 0} onClick={exportAll}>Alles exporteren</button>
        </div>
        {note && <p role="status">{note}</p>}
      </fieldset>
    </section>
  )
}

/** Contacten: your address book, synced to your other devices, with birthday notices. */
export function Contacts() {
  const [tab, setTab] = useState<Tab>(() => {
    const saved = readStorage(TAB_KEY)
    return TABS.includes(saved as Tab) ? (saved as Tab) : 'Contacten'
  })
  const problem = useSyncExternalStore(contactsSyncProblem.subscribe, contactsSyncProblem.getSnapshot)
  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-4 text-sm">
      <div role="tablist" aria-label="Contacten" className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button key={t} role="tab" type="button" aria-selected={tab === t} className={`${small} ${tab === t ? 'bg-nx-surface-2 font-medium' : ''}`} onClick={() => { setTab(t); writeStorage(TAB_KEY, t) }}>
            {t}
          </button>
        ))}
      </div>
      {problem && <p role="alert">{problem}</p>}
      {tab === 'Contacten' && <List />}
      {tab === 'Verjaardagen' && <Birthdays />}
      {tab === 'Instellingen' && <Settings />}
    </div>
  )
}
