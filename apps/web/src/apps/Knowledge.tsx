import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  allTags,
  backlinks,
  liveCollections,
  missingLinks,
  noteMeta,
  noteRevisions,
  noteTags,
  noteTitle,
  outgoingLinks,
  parseMarkdown,
  recordRevision,
  removeCollection,
  revisionChange,
  saveCollection,
  searchKnowledge,
  setNoteMeta,
  type Inline,
  type KnowledgeState,
  type Note,
} from '@nexus/core'
import { knowledgeStore, knowledgeSyncProblem, useKnowledge } from '../knowledge/store'
import { onReveal, takeReveal } from '../search/reveal'
import { readStorage, writeStorage } from '../state/storage'
import { useNotes } from '../state/useNotes'
import { notesStore } from '../state/notesStore'

const TABS = ['Bibliotheek', 'Notitie', 'Collecties', 'Links', 'Zoeken', 'Geschiedenis'] as const
type Tab = (typeof TABS)[number]
const TAB_KEY = 'nexus.knowledge.tab'
const NOTE_KEY = 'nexus.knowledge.note'
const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-50'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'
const when = (t: number) => new Date(t).toLocaleString('nl-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function change(apply: (s: KnowledgeState) => KnowledgeState | { error: string }): string | null {
  const next = apply(knowledgeStore.getSnapshot())
  if ('error' in next) return next.error
  knowledgeStore.update(() => next)
  return null
}

/** Keeps the current text of a note as a version (see recordRevision). */
function keepVersion(note: Note | undefined, force = false) {
  if (note) knowledgeStore.update((s) => recordRevision(s, note, crypto.randomUUID(), Date.now(), force))
}

/** Kennis: Notities as a knowledge base, with collections, tags, links, search and versions. */
export function Knowledge() {
  const { notes } = useNotes()
  const state = useKnowledge()
  const problem = useSyncExternalStore(knowledgeSyncProblem.subscribe, knowledgeSyncProblem.getSnapshot)
  const [tab, setTabState] = useState<Tab>(() => (TABS.includes(readStorage(TAB_KEY) as Tab) ? (readStorage(TAB_KEY) as Tab) : 'Bibliotheek'))
  const [noteId, setNoteId] = useState<string | null>(() => takeReveal('knowledge') ?? readStorage(NOTE_KEY))
  const setTab = (t: Tab) => {
    setTabState(t)
    writeStorage(TAB_KEY, t)
  }
  const open = (id: string, t: Tab = 'Notitie') => {
    // Leaving a note keeps what was typed as a version.
    if (noteId && noteId !== id) keepVersion(notesStore.getSnapshot().find((n) => n.id === noteId))
    setNoteId(id)
    writeStorage(NOTE_KEY, id)
    setTab(t)
  }
  useEffect(
    () =>
      onReveal(() => {
        const id = takeReveal('knowledge')
        if (id) open(id)
      }),
    [],
  )
  const note = notes.find((n) => n.id === noteId)
  const create = (title = '') => {
    const id = notesStore.add()
    if (title) notesStore.update(id, { title })
    open(id)
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <div role="tablist" aria-label="Kennis" className="flex gap-1 overflow-x-auto border-b border-nx-border px-3 py-2">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`shrink-0 rounded-md px-3 py-1 ${tab === t ? 'bg-nx-surface-2 font-medium' : 'hover:bg-nx-surface-2'}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {problem?.startsWith('setup:') && (
          <p role="alert" className="rounded-md border border-amber-500/40 p-2 text-amber-700 dark:text-amber-300">
            Collecties en versies syncen nog niet: voer eenmalig <code>{problem.slice(6)}</code> uit in de SQL Editor van Supabase (of via Account › Database-check).
          </p>
        )}
        {tab === 'Bibliotheek' && <Library notes={notes} state={state} onOpen={open} onCreate={() => create()} />}
        {tab === 'Notitie' && (note ? <Editor key={note.id} note={note} notes={notes} state={state} onOpen={open} onCreate={create} /> : <EmptyNote onCreate={() => create()} />)}
        {tab === 'Collecties' && <Collections notes={notes} state={state} onOpen={open} />}
        {tab === 'Links' && <Links notes={notes} onOpen={open} onCreate={create} />}
        {tab === 'Zoeken' && <Search notes={notes} state={state} onOpen={open} />}
        {tab === 'Geschiedenis' && (note ? <History key={note.id} note={note} state={state} /> : <EmptyNote onCreate={() => create()} />)}
      </div>
    </div>
  )
}

function EmptyNote({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="space-y-2">
      <p className="text-nx-muted">Kies een notitie in de Bibliotheek, of begin een nieuwe.</p>
      <button type="button" className={primaryButton} onClick={onCreate}>
        Nieuwe notitie
      </button>
    </div>
  )
}

function NoteList({ items, onOpen, label, detail }: { items: Note[]; onOpen: (id: string) => void; label: string; detail?: (n: Note) => ReactNode }) {
  return (
    <ul aria-label={label} className="divide-y divide-nx-border rounded-lg border border-nx-border">
      {items.map((n) => (
        <li key={n.id}>
          <button type="button" onClick={() => onOpen(n.id)} className="block w-full p-2 text-left hover:bg-nx-surface-2">
            <span className="block font-medium">{noteTitle(n)}</span>
            {detail && <span className="block text-xs text-nx-muted">{detail(n)}</span>}
          </button>
        </li>
      ))}
    </ul>
  )
}

function Library({ notes, state, onOpen, onCreate }: { notes: Note[]; state: KnowledgeState; onOpen: (id: string) => void; onCreate: () => void }) {
  const [collection, setCollection] = useState<string>('')
  const [tag, setTag] = useState<string>('')
  const collections = liveCollections(state)
  const tags = allTags(state, notes)
  const shown = searchKnowledge(state, notes, '', { collection: collection || null, tag: tag || null }).map((h) => h.note)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={primaryButton} onClick={onCreate}>
          Nieuwe notitie
        </button>
        <select aria-label="Collectie" value={collection} onChange={(e) => setCollection(e.target.value)} className={`${field} w-auto`}>
          <option value="">Alle collecties</option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select aria-label="Tag" value={tag} onChange={(e) => setTag(e.target.value)} className={`${field} w-auto`}>
          <option value="">Alle tags</option>
          {tags.map((t) => (
            <option key={t.tag} value={t.tag}>
              #{t.tag} ({t.count})
            </option>
          ))}
        </select>
      </div>
      {shown.length === 0 ? (
        <p className="text-nx-muted">{notes.length === 0 ? 'Nog geen notities. Alles wat je in Notities of Snel vastleggen bewaart, komt hier.' : 'Geen notities met deze filter.'}</p>
      ) : (
        <NoteList items={shown} onOpen={onOpen} label="Bibliotheek" detail={(n) => [new Date(n.updatedAt).toLocaleDateString('nl-BE'), ...noteTags(state, n).map((t) => `#${t}`)].join(' · ')} />
      )}
    </div>
  )
}

function Editor({ note, notes, state, onOpen, onCreate }: { note: Note; notes: Note[]; state: KnowledgeState; onOpen: (id: string) => void; onCreate: (title: string) => void }) {
  const [preview, setPreview] = useState(false)
  const [tagText, setTagText] = useState('')
  const meta = noteMeta(state, note.id)
  const collections = liveCollections(state)
  const links = outgoingLinks(notes, note)
  const incoming = backlinks(notes, note)
  const addTag = () => {
    if (!tagText.trim()) return
    change((s) => setNoteMeta(s, note.id, { tags: [...meta.tags, tagText] }, Date.now()))
    setTagText('')
  }
  const follow = (title: string) => {
    const target = links.find((l) => l.title === title)?.note
    if (target) onOpen(target.id)
    else onCreate(title)
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input aria-label="Titel" value={note.title} placeholder="Titel" onChange={(e) => notesStore.update(note.id, { title: e.target.value })} onBlur={() => keepVersion(note)} className="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none placeholder:text-nx-muted" />
        <button type="button" aria-pressed={preview} className={small} onClick={() => setPreview(!preview)}>
          {preview ? 'Bewerken' : 'Voorbeeld'}
        </button>
      </div>
      {preview ? (
        <article aria-label="Voorbeeld" className="space-y-2 rounded-lg border border-nx-border p-3">
          <Markdown text={note.body} onWiki={follow} />
        </article>
      ) : (
        <textarea
          aria-label="Inhoud"
          rows={12}
          value={note.body}
          placeholder="Schrijf in Markdown: # kop, **vet**, - lijst, [[Andere notitie]], #tag"
          onChange={(e) => notesStore.update(note.id, { body: e.target.value })}
          onBlur={() => keepVersion(note)}
          className={`${field} font-mono leading-relaxed`}
        />
      )}
      <p className="text-xs text-nx-muted">Automatisch bewaard {when(note.updatedAt)}</p>
      {collections.length > 0 && (
        <fieldset className="flex flex-wrap gap-3">
          <legend className="mb-1 text-xs text-nx-muted">Collecties</legend>
          {collections.map((c) => (
            <label key={c.id} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={meta.collections.includes(c.id)}
                onChange={(e) => change((s) => setNoteMeta(s, note.id, { collections: e.target.checked ? [...meta.collections, c.id] : meta.collections.filter((x) => x !== c.id) }, Date.now()))}
              />
              {c.name}
            </label>
          ))}
        </fieldset>
      )}
      <div className="space-y-1">
        <span className="text-xs text-nx-muted">Tags</span>
        <div className="flex flex-wrap items-center gap-1">
          {noteTags(state, note).map((t) => (
            <span key={t} className="flex items-center gap-1 rounded bg-nx-surface-2 px-1.5 py-0.5 text-xs">
              #{t}
              {meta.tags.includes(t) && (
                <button type="button" aria-label={`Tag ${t} weghalen`} onClick={() => change((s) => setNoteMeta(s, note.id, { tags: meta.tags.filter((x) => x !== t) }, Date.now()))}>
                  ×
                </button>
              )}
            </span>
          ))}
          <form
            className="flex gap-1"
            onSubmit={(e) => {
              e.preventDefault()
              addTag()
            }}
          >
            <input aria-label="Nieuwe tag" placeholder="tag" value={tagText} onChange={(e) => setTagText(e.target.value)} className={`${field} w-28 py-0.5 text-xs`} />
            <button type="submit" className={small}>
              +
            </button>
          </form>
        </div>
      </div>
      <section aria-label="Verwijzingen" className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <h3 className="text-xs font-semibold text-nx-muted">Verwijst naar</h3>
          {links.length === 0 ? <p className="text-xs text-nx-muted">Typ [[Titel]] om naar een andere notitie te verwijzen.</p> : (
            <ul className="space-y-1">
              {links.map((l) => (
                <li key={l.title}>
                  <button type="button" className="text-left text-nx-accent hover:underline" onClick={() => follow(l.title)}>
                    {l.title}
                  </button>
                  {!l.note && <span className="text-xs text-nx-muted"> (nog geen notitie: klik om te maken)</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-1">
          <h3 className="text-xs font-semibold text-nx-muted">Wordt genoemd in</h3>
          {incoming.length === 0 ? <p className="text-xs text-nx-muted">Nog geen enkele notitie verwijst hiernaar.</p> : (
            <ul className="space-y-1">
              {incoming.map((n) => (
                <li key={n.id}>
                  <button type="button" className="text-left text-nx-accent hover:underline" onClick={() => onOpen(n.id)}>
                    {noteTitle(n)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}

function InlineText({ parts, onWiki }: { parts: Inline[]; onWiki: (title: string) => void }) {
  return (
    <>
      {parts.map((p, i) => {
        switch (p.t) {
          case 'bold':
            return <strong key={i}>{p.text}</strong>
          case 'italic':
            return <em key={i}>{p.text}</em>
          case 'code':
            return (
              <code key={i} className="rounded bg-nx-surface-2 px-1 font-mono text-xs">
                {p.text}
              </code>
            )
          case 'link':
            return (
              <a key={i} href={p.href} target="_blank" rel="noreferrer noopener" className="text-nx-accent underline">
                {p.text}
              </a>
            )
          case 'wiki':
            return (
              <button key={i} type="button" className="text-nx-accent underline" onClick={() => onWiki(p.text)}>
                {p.text}
              </button>
            )
          case 'tag':
            return (
              <span key={i} className="rounded bg-nx-surface-2 px-1 text-xs">
                #{p.text}
              </span>
            )
          default:
            return <span key={i}>{p.text}</span>
        }
      })}
    </>
  )
}

/** Markdown as React elements: the text is never put in the page as HTML. */
function Markdown({ text, onWiki }: { text: string; onWiki: (title: string) => void }) {
  const blocks = parseMarkdown(text)
  if (blocks.length === 0) return <p className="text-nx-muted">Nog leeg.</p>
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === 'heading') {
          const cls = b.level === 1 ? 'text-xl font-semibold' : b.level === 2 ? 'text-lg font-semibold' : 'font-semibold'
          const Tag = (`h${b.level + 1}` as 'h2' | 'h3' | 'h4')
          return (
            <Tag key={i} className={cls}>
              <InlineText parts={b.inline} onWiki={onWiki} />
            </Tag>
          )
        }
        if (b.type === 'list') {
          const List = b.ordered ? 'ol' : 'ul'
          return (
            <List key={i} className={`${b.ordered ? 'list-decimal' : 'list-disc'} space-y-0.5 pl-5`}>
              {b.items.map((item, j) => (
                <li key={j}>
                  <InlineText parts={item} onWiki={onWiki} />
                </li>
              ))}
            </List>
          )
        }
        if (b.type === 'code')
          return (
            <pre key={i} className="overflow-x-auto rounded-md bg-nx-surface-2 p-2 font-mono text-xs">
              {b.text}
            </pre>
          )
        if (b.type === 'quote')
          return (
            <blockquote key={i} className="border-l-2 border-nx-border pl-3 text-nx-muted">
              <InlineText parts={b.inline} onWiki={onWiki} />
            </blockquote>
          )
        if (b.type === 'rule') return <hr key={i} className="border-nx-border" />
        return (
          <p key={i}>
            <InlineText parts={b.inline} onWiki={onWiki} />
          </p>
        )
      })}
    </>
  )
}

function Collections({ notes, state, onOpen }: { notes: Note[]; state: KnowledgeState; onOpen: (id: string) => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const add = () => {
    const err = change((s) => saveCollection(s, crypto.randomUUID(), name, Date.now()))
    setError(err)
    if (!err) setName('')
  }
  const collections = liveCollections(state)
  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input aria-label="Nieuwe collectie" placeholder="Nieuwe collectie, bv. Elektronica" value={name} onChange={(e) => setName(e.target.value)} className={field} />
        <button type="submit" className={button}>
          + Collectie
        </button>
      </form>
      {error && <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}
      {collections.length === 0 ? <p className="text-nx-muted">Nog geen collecties. Een collectie groepeert notities, bv. per vak.</p> : (
        <ul aria-label="Collecties" className="space-y-2">
          {collections.map((c) => {
            const inside = searchKnowledge(state, notes, '', { collection: c.id }).map((h) => h.note)
            return (
              <li key={c.id} className="space-y-2 rounded-lg border border-nx-border p-2">
                <div className="flex items-center justify-between gap-2">
                  <button type="button" className="text-left font-medium hover:underline" aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)}>
                    {c.name} <span className="text-xs text-nx-muted">({inside.length})</span>
                  </button>
                  <button type="button" className={small} aria-label={`Collectie ${c.name} weghalen`} onClick={() => change((s) => removeCollection(s, c.id, Date.now()))}>
                    Weghalen
                  </button>
                </div>
                {open === c.id && (inside.length === 0 ? <p className="text-xs text-nx-muted">Leeg. Vink de collectie aan bij een notitie.</p> : <NoteList items={inside} onOpen={onOpen} label={c.name} />)}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Links({ notes, onOpen, onCreate }: { notes: Note[]; onOpen: (id: string) => void; onCreate: (title: string) => void }) {
  const pairs = notes.flatMap((n) => outgoingLinks(notes, n).flatMap((l) => (l.note ? [{ from: n, to: l.note }] : [])))
  const missing = missingLinks(notes)
  return (
    <div className="space-y-4">
      <section aria-label="Verbonden notities" className="space-y-1">
        <h3 className="font-medium">Verbonden notities</h3>
        {pairs.length === 0 ? <p className="text-nx-muted">Nog geen verwijzingen. Typ [[Titel]] in een notitie om ze te verbinden.</p> : (
          <ul className="space-y-1">
            {pairs.map(({ from, to }) => (
              <li key={`${from.id}-${to.id}`}>
                <button type="button" className="text-nx-accent hover:underline" onClick={() => onOpen(from.id)}>
                  {noteTitle(from)}
                </button>
                {' → '}
                <button type="button" className="text-nx-accent hover:underline" onClick={() => onOpen(to.id)}>
                  {noteTitle(to)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {missing.length > 0 && (
        <section aria-label="Nog te maken" className="space-y-1">
          <h3 className="font-medium">Nog te maken</h3>
          <ul className="space-y-1">
            {missing.map((m) => (
              <li key={m.title} className="flex items-center justify-between gap-2">
                <span>
                  {m.title} <span className="text-xs text-nx-muted">· in {m.from.map(noteTitle).join(', ')}</span>
                </span>
                <button type="button" className={small} onClick={() => onCreate(m.title)}>
                  Maak notitie
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Search({ notes, state, onOpen }: { notes: Note[]; state: KnowledgeState; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const hits = query.trim() ? searchKnowledge(state, notes, query) : []
  return (
    <div className="space-y-3">
      <input type="search" aria-label="Zoeken in Kennis" placeholder="Zoek in titels, tekst en tags" value={query} onChange={(e) => setQuery(e.target.value)} className={field} autoFocus />
      {query.trim() && (hits.length === 0 ? <p className="text-nx-muted">Niets gevonden voor "{query.trim()}".</p> : <NoteList items={hits.map((h) => h.note)} onOpen={onOpen} label="Zoekresultaten" detail={(n) => hits.find((h) => h.note.id === n.id)?.snippet} />)}
    </div>
  )
}

function History({ note, state }: { note: Note; state: KnowledgeState }) {
  const versions = noteRevisions(state, note.id)
  const [shown, setShown] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const restore = (id: string) => {
    const v = versions.find((r) => r.id === id)
    if (!v) return
    // What is there now is kept first, so the restore can be undone.
    keepVersion(note, true)
    notesStore.update(note.id, { title: v.title, body: v.body })
    setStatus(`Versie van ${when(v.at)} teruggezet. De vorige tekst staat bovenaan in de lijst.`)
  }
  return (
    <div className="space-y-3">
      <h2 className="font-semibold">{noteTitle(note)}</h2>
      {status && <p role="status" className="text-nx-muted">{status}</p>}
      {versions.length === 0 ? (
        <p className="text-nx-muted">Nog geen versies. Kennis bewaart een versie als je de notitie verlaat, hoogstens één per twee minuten, en de laatste 20 per notitie.</p>
      ) : (
        <ul aria-label="Versies" className="space-y-2">
          {versions.map((v, i) => (
            <li key={v.id} className="space-y-1 rounded-lg border border-nx-border p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {when(v.at)} <span className="text-xs text-nx-muted">· {revisionChange(versions[i + 1]?.body ?? '', v.body)}</span>
                </span>
                <span className="flex gap-1">
                  <button type="button" className={small} aria-expanded={shown === v.id} onClick={() => setShown(shown === v.id ? null : v.id)}>
                    {shown === v.id ? 'Verbergen' : 'Bekijken'}
                  </button>
                  <button type="button" className={small} disabled={v.title === note.title && v.body === note.body} onClick={() => restore(v.id)}>
                    Terugzetten
                  </button>
                </span>
              </div>
              {shown === v.id && <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-md bg-nx-surface-2 p-2 font-mono text-xs">{v.body || '(leeg)'}</pre>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
