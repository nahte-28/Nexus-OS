/**
 * Het NEXUS-merk: een soldeerpunt met een spoor naar het woord, zoals een component op een
 * printplaat. Ook gebruikt in de telefoonweergave.
 */
export function NexusMark({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 text-[17px] font-extrabold tracking-[0.06em] text-nx-text ${className}`}>
      <svg viewBox="0 0 22 12" className="h-3 w-[22px] text-nx-accent" aria-hidden>
        <circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <path d="M10.5 6H22" stroke="currentColor" strokeWidth="2" />
      </svg>
      NEXUS
    </span>
  )
}
