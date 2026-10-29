import { useState } from 'react'
import { reportText } from '@nexus/core'
import { supabase } from '../sync/supabase'
import { makeReport, REPORT_MIGRATION, sendReport, type SendResult } from './report'

const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'

const NOTICE: Record<Exclude<SendResult, 'sent'>, string> = {
  'signed-out': 'Doorsturen kan alleen als je aangemeld bent. Kopieer de melding en stuur ze zelf door.',
  setup: `Probleem melden heeft nog een stap in de database nodig: voer ${REPORT_MIGRATION} uit in de SQL Editor van Supabase (zie Account > Database-check). Kopieer de melding intussen.`,
  'too-many': 'Je stuurde vandaag al 20 meldingen. Kopieer deze en stuur ze zelf door.',
  failed: 'Doorsturen lukte niet, misschien ben je offline. Kopieer de melding of probeer het straks opnieuw.',
}

/** One click sends what went wrong, with the version and NEXUS's event log; copying is the fallback. */
export function ReportButton({ app, error, note, onSent }: { app: string; error: Error | null; note?: string; onSent?: () => void }) {
  const [state, setState] = useState<'idle' | 'sending' | SendResult>('idle')
  const [copied, setCopied] = useState(false)

  const send = async () => {
    setState('sending')
    const result = await sendReport(supabase, makeReport(app, error, note)).catch((): SendResult => 'failed')
    setState(result)
    if (result === 'sent') onSent?.()
  }
  const copy = () => {
    void navigator.clipboard?.writeText(reportText(makeReport(app, error, note))).then(() => setCopied(true))
  }

  if (state === 'sent') return <p role="status" className="text-sm">✓ Verstuurd. Bedankt, hiermee kan het opgelost worden.</p>
  const notice = state === 'idle' || state === 'sending' ? null : NOTICE[state]
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={state === 'sending'} onClick={() => void send()}>
          {state === 'sending' ? 'Versturen…' : 'Probleem melden'}
        </button>
        {notice && (
          <button type="button" className={button} onClick={copy}>
            {copied ? '✓ Gekopieerd' : 'Melding kopiëren'}
          </button>
        )}
      </div>
      {notice && <p role="alert" className="text-sm text-nx-muted">{notice}</p>}
    </div>
  )
}
