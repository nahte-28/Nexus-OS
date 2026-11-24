/**
 * Het NEXUS-teken: een N getekend als één koperspoor tussen twee soldeerpunten, zoals op een
 * printplaat. Dezelfde vorm staat in het app-icoon (public/icon.svg).
 */
export function NexusGlyph({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <path d="M5 15.8V5L19 19V8.2" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="5" cy="19" r="2.6" stroke="currentColor" strokeWidth="2" />
      <circle cx="19" cy="5" r="2.6" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

/** Het teken met het woord NEXUS ernaast. */
export function NexusMark({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 text-[17px] font-extrabold tracking-[0.08em] text-nx-text ${className}`}>
      <NexusGlyph className="size-[22px] text-nx-accent" />
      NEXUS
    </span>
  )
}
