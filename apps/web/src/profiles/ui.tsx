import type { ComponentType, SVGProps } from 'react'
import { explainActive, type ActiveReason, type ProfileId, type ProfilesState } from '@nexus/core'
import { CodeIcon, GamepadIcon, HomeIcon, SchoolIcon } from '../apps/icons'

export const PROFILE_ICONS: Record<ProfileId, ComponentType<SVGProps<SVGSVGElement>>> = {
  school: SchoolIcon,
  personal: HomeIcon,
  gaming: GamepadIcon,
  developer: CodeIcon,
}

export { daysLabel } from '@nexus/core'

/** Why the active profile is active (Profiles 2.0 also names the lesson or who chose it). */
export function reasonText(reason: ActiveReason, state: ProfilesState, at = Date.now()): string {
  return explainActive(state, at, reason)
}
