/** The two NEXUS design identities: calm "Focus" and command-centre "Pulse". */
export type ThemeId = 'focus' | 'pulse'

export const THEMES: ReadonlyArray<{ id: ThemeId; label: string; description: string }> = [
  { id: 'focus', label: 'NEXUS Focus', description: 'Licht en rustig, als een opgeruimde werkbank.' },
  { id: 'pulse', label: 'NEXUS Pulse', description: 'Donkere printplaat met koperen accenten.' },
]

export function isThemeId(value: unknown): value is ThemeId {
  return value === 'focus' || value === 'pulse'
}
