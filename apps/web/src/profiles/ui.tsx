import type { ComponentType, SVGProps } from 'react'
import { PROFILE_IDS, type ActiveReason, type ProfileId, type ProfilesState } from '@nexus/core'
import { CodeIcon, GamepadIcon, HomeIcon, SchoolIcon } from '../apps/icons'
import { profilesStore, useProfiles } from './store'

export const PROFILE_ICONS: Record<ProfileId, ComponentType<SVGProps<SVGSVGElement>>> = {
  school: SchoolIcon,
  personal: HomeIcon,
  gaming: GamepadIcon,
  developer: CodeIcon,
}

const DAY_SHORT = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']

/** "ma–vr" for consecutive days, else "ma, wo, vr". */
export function daysLabel(days: number[]): string {
  const sorted = [...new Set(days)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b)
  if (sorted.length === 0) return 'geen dagen'
  if (sorted.length === 7) return 'elke dag'
  const consecutive = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1)
  if (consecutive && sorted.length > 2) return `${DAY_SHORT[sorted[0] - 1]}–${DAY_SHORT[sorted[sorted.length - 1] - 1]}`
  return sorted.map((d) => DAY_SHORT[d - 1]).join(', ')
}

export function reasonText(reason: ActiveReason, state: ProfilesState): string {
  const s = state.schedule
  if (reason === 'schedule') return `Automatisch actief, ${daysLabel(s.days)} ${s.start}–${s.end}`
  if (reason === 'override')
    return state.override?.mode === 'until-manual'
      ? 'Met de hand gekozen, tot je terugschakelt'
      : 'Met de hand gekozen, tot het tijdschema wisselt'
  return 'Je standaardprofiel'
}

/** Quick switch between School, Persoonlijk, Gaming and Developer. */
export function ProfileSwitcher({ compact = false }: { compact?: boolean }) {
  const { state, active } = useProfiles()
  return (
    <div role="radiogroup" aria-label="Profiel" className={`flex gap-1 ${compact ? 'flex-wrap' : 'overflow-x-auto'}`}>
      {PROFILE_IDS.map((id) => {
        const profile = state.profiles[id]
        const Icon = PROFILE_ICONS[id]
        const selected = active.id === id
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            title={profile.description}
            onClick={() => profilesStore.choose(id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm ${
              selected ? 'bg-nx-accent font-medium text-nx-accent-text' : 'text-nx-muted hover:bg-nx-surface-2 hover:text-nx-text'
            }`}
          >
            <Icon className="size-4" />
            {profile.name}
          </button>
        )
      })}
    </div>
  )
}
