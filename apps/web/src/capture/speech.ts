/**
 * Spraaknotitie: speech to text with the browser's own speech recognition (Web Speech API). In
 * Chrome the audio goes to Google to be recognised; NEXUS itself never keeps or sends it.
 */

interface RecognitionResult {
  isFinal: boolean
  0: { transcript: string }
}

interface RecognitionEvent {
  resultIndex: number
  results: ArrayLike<RecognitionResult>
}

export interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

type RecognitionClass = new () => Recognition

function recognitionClass(): RecognitionClass | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const speechSupported = () => recognitionClass() !== null

/** What went wrong, in words someone can act on. */
export function speechError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'NEXUS mag de microfoon niet gebruiken. Sta de microfoon toe in de instellingen van je browser voor deze site.'
    case 'audio-capture':
      return 'Er is geen microfoon gevonden.'
    case 'network':
      return 'Inspreken heeft internet nodig. Typ je notitie, of probeer het opnieuw als je online bent.'
    case 'language-not-supported':
      return 'Je browser herkent geen Nederlands.'
    default:
      return `Inspreken lukte niet (${code}).`
  }
}

/** Glues a new piece of spoken text to what is already there, with one space between. */
export function appendSpoken(text: string, spoken: string): string {
  const piece = spoken.trim()
  if (!piece) return text
  const glued = !text.trim() ? piece.charAt(0).toUpperCase() + piece.slice(1) : piece
  return text && !/\s$/.test(text) ? `${text} ${glued}` : `${text}${glued}`
}

export interface Dictation {
  stop(): void
}

/**
 * Listens until stopped (or until the browser stops after a silence). [onFinal] gets each finished
 * sentence once, [onInterim] what is being heard right now.
 */
export function startDictation(handlers: { onFinal: (text: string) => void; onInterim: (text: string) => void; onError: (message: string) => void; onEnd: () => void }, lang = 'nl-BE'): Dictation | null {
  const Recognition = recognitionClass()
  if (!Recognition) return null
  const r = new Recognition()
  r.lang = lang
  r.continuous = true
  r.interimResults = true
  r.onresult = (e) => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i]
      if (result.isFinal) handlers.onFinal(result[0].transcript)
      else interim += result[0].transcript
    }
    handlers.onInterim(interim)
  }
  // Silence or an abort is not worth a message; the button simply goes back.
  r.onerror = (e) => e.error !== 'no-speech' && e.error !== 'aborted' && handlers.onError(speechError(e.error))
  r.onend = () => {
    handlers.onInterim('')
    handlers.onEnd()
  }
  try {
    r.start()
  } catch (err) {
    handlers.onError(err instanceof Error ? err.message : String(err))
    return null
  }
  return { stop: () => r.stop() }
}
