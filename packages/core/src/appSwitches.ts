import { APP_GROUP } from './appGroups'
import type { WidgetId } from './profiles'
import type { AppId } from './windows'

/**
 * Instellingen › Apps aan/uit: you switch off the apps you do not use. A switched-off app is gone
 * from the sidebar, the search, the start menu and the dashboard, in every profile, but its data
 * stays, so it is all back when you switch it on again. The switches travel with your profiles.
 * Modules keep their own switches (features.ts); this is for the other apps. Pure logic.
 */
export type AppSwitches = Partial<Record<AppId, boolean>>

/**
 * Never switched off: the way back (Profielen, Instellingen), help, your account and the apps that
 * only show in their own case (Beheer, Ontwikkelaar, the Linux apps).
 */
export const ALWAYS_ON_APPS: AppId[] = ['profiles', 'settings', 'help', 'account', 'about', 'admin', 'developer', 'linuxapps', 'system']

export const canSwitchApp = (id: AppId): boolean => !ALWAYS_ON_APPS.includes(id)

/** Whether an app is on: everything is on until you switch it off. */
export function appOn(switches: AppSwitches, id: AppId): boolean {
  return !canSwitchApp(id) || switches[id] !== false
}

/** Stored switches, keeping only true/false for apps that can be switched. */
export function parseAppSwitches(value: unknown): AppSwitches {
  if (typeof value !== 'object' || value === null) return {}
  const out: AppSwitches = {}
  for (const id of Object.keys(APP_GROUP) as AppId[]) {
    const v = (value as Record<string, unknown>)[id]
    if (typeof v === 'boolean' && canSwitchApp(id)) out[id] = v
  }
  return out
}

/** The app a dashboard widget belongs to; the widget goes with it. */
export const WIDGET_APP: Partial<Record<WidgetId, AppId>> = {
  deadlines: 'agenda',
  notes: 'notes',
  klashub: 'klashub',
  ai_study: 'assistant',
  notifications: 'notifications',
  devices: 'devices',
  finance: 'finance',
}

/** The widgets whose app is on. */
export function widgetsOn(widgets: WidgetId[], switches: AppSwitches): WidgetId[] {
  return widgets.filter((w) => {
    const app = WIDGET_APP[w]
    return !app || appOn(switches, app)
  })
}
