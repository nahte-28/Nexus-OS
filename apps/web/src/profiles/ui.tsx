import type { ComponentType, SVGProps } from 'react'
import { type ActiveReason, type ProfileId, type ProfilesState } from '@nexus/core'
import { CodeIcon, GamepadIcon, HomeIcon, SchoolIcon } from '../apps/icons'

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
  if (reason === 'return') return 'Je laatst gekozen profiel buiten het schema'
  return 'Je standaardprofiel'
}
