import { useEffect, useState } from 'react'
import { supabase } from '../sync/supabase'
import { MessagePush, type MessagePushPrefs } from './messagePush'

const defaultApi = supabase ? new MessagePush(supabase) : null

/** Apparaten › Meldingen op dit toestel: which messages wake your phone and watch. */
export function MessagePushSettings({ api = defaultApi }: { api?: MessagePush | null }) {
  const [prefs, setPrefs] = useState<MessagePushPrefs | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    if (!api) return
    api.get().then(setPrefs, (err: unknown) => setProblem(err instanceof Error ? err.message : String(err)))
  }, [api])

  if (!api) return null
  if (problem?.startsWith('setup:')) {
    return (
      <p className="text-nx-muted">
        Voor berichten op je gsm is nog één SQL-stap nodig: <code className="font-mono text-xs">{problem.slice(6)}</code>. Kijk in Account › Database-check.
      </p>
    )
  }
  const change = (next: MessagePushPrefs) => {
    const before = prefs
    setPrefs(next)
    setProblem(null)
    api.set(next).catch((err: unknown) => {
      setPrefs(before)
      setProblem(err instanceof Error ? err.message : String(err))
    })
  }
  return (
    <fieldset className="space-y-1">
      <legend className="font-medium">Berichten</legend>
      <p className="text-nx-muted">Een nieuw bericht komt ook hier en op je horloge, met twee snelle antwoorden. Een privébericht blijft versleuteld.</p>
      {prefs && (
        <>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={prefs.dm} onChange={(e) => change({ ...prefs, dm: e.target.checked })} />
            Privéberichten van vrienden
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={prefs.team} onChange={(e) => change({ ...prefs, team: e.target.checked })} />
            Teamchat en nieuwe teamtaken voor jou
          </label>
        </>
      )}
      {problem && <p role="alert">{problem}</p>}
    </fieldset>
  )
}
