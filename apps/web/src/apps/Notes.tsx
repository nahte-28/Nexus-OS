import { useState } from 'react'
import { noteTitle } from '@nexus/core'
import { useNotes } from '../state/useNotes'

export function Notes() {
  const { notes, add, update, remove } = useNotes()
  const [selectedId, setSelectedId] = useState<string | null>(notes[0]?.id ?? null)
  const selected = notes.find((n) => n.id === selectedId) ?? null

  return (
    <div className="flex h-full min-h-0 flex-col sm:flex-row">
      <aside className="flex max-h-48 flex-col border-b border-nx-border sm:max-h-none sm:w-56 sm:border-r sm:border-b-0">
        <div className="flex items-center justify-between p-3">
          <h2 className="text-sm font-semibold text-nx-muted">Notities</h2>
          <button
            type="button"
            onClick={() => setSelectedId(add())}
            className="rounded-md bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text"
          >
            Nieuw
          </button>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {notes.length === 0 && <li className="px-2 py-3 text-sm text-nx-muted">Nog geen notities.</li>}
          {notes.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                onClick={() => setSelectedId(note.id)}
                aria-current={note.id === selectedId}
                className={`w-full truncate rounded-md px-2 py-2 text-left text-sm ${
                  note.id === selectedId ? 'bg-nx-surface-2 font-medium' : 'hover:bg-nx-surface-2'
                }`}
              >
                {noteTitle(note)}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="flex min-h-0 flex-1 flex-col p-3">
        {selected ? (
          <>
            <div className="flex items-center gap-2">
              <input
                value={selected.title}
                onChange={(e) => update(selected.id, { title: e.target.value })}
                placeholder="Titel"
                aria-label="Titel"
                className="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none placeholder:text-nx-muted"
              />
              <button
                type="button"
                onClick={() => {
                  remove(selected.id)
                  setSelectedId(null)
                }}
                className="rounded-md px-2 py-1 text-sm text-nx-muted hover:bg-nx-surface-2"
              >
                Verwijderen
              </button>
            </div>
            <textarea
              value={selected.body}
              onChange={(e) => update(selected.id, { body: e.target.value })}
              placeholder="Begin met schrijven…"
              aria-label="Inhoud"
              className="mt-2 min-h-0 flex-1 resize-none bg-transparent text-base leading-relaxed outline-none placeholder:text-nx-muted"
            />
            <p className="pt-2 text-xs text-nx-muted">
              Laatst gewijzigd {new Date(selected.updatedAt).toLocaleString('nl-BE')}
            </p>
          </>
        ) : (
          <p className="m-auto text-sm text-nx-muted">Kies een notitie of maak een nieuwe.</p>
        )}
      </section>
    </div>
  )
}
