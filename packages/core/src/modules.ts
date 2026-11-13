/**
 * Moduleregister (Next Frontier, Integratieronde): one manifest per module behind a switch in
 * Nieuwe modules, saying which app it opens, where its data lives, which events it reports and
 * which other modules it builds on. Platform Health in the Developer Hub reads it; a test keeps it
 * in step with FEATURES and the apps. Pure logic.
 */
import type { EventSource } from './events'
import { FEATURES, featureOn, type FeatureId, type FeatureSwitches } from './features'
import { SCHEMA_STEPS } from './schemaCheck'
import type { AppId } from './windows'

export interface ModuleManifest {
  feature: FeatureId
  /** The app it adds, or null when it changes other apps (Launcher in Ctrl+K, Integratie). */
  app: AppId | null
  version: string
  /** Synced documents in user_settings. */
  docKeys: string[]
  /** Own tables in Supabase. */
  tables: string[]
  /** Kept only on this device (localStorage). */
  localKeys: string[]
  /** The SQL file it needs, as listed in the Database-check, or null for none. */
  schema: string | null
  /** Event sources it reports to the event bus. */
  events: EventSource[]
  /** Modules it builds on; it works without them, but shows less. */
  uses: FeatureId[]
}

const m = (feature: FeatureId, app: AppId | null, rest: Partial<Omit<ModuleManifest, 'feature' | 'app'>> = {}): ModuleManifest => ({
  feature,
  app,
  version: '1.0.0',
  docKeys: [],
  tables: [],
  localKeys: [],
  schema: null,
  events: [],
  uses: [],
  ...rest,
})

export const MODULES: ModuleManifest[] = [
  m('spaces', 'spaces', { docKeys: ['spaces'], schema: '20261029170000_spaces.sql', events: ['system'] }),
  m('inbox', 'inbox', { docKeys: ['inbox'], tables: ['inbox_items'], schema: '20261102090000_inbox_v2.sql' }),
  m('timeMachine', 'timemachine', { localKeys: ['nexus.timemachine'], events: ['system'], uses: ['spaces'] }),
  m('bridge', 'bridge', { localKeys: ['nexus.bridge'], events: ['bridge'] }),
  m('intelligence', 'intelligence', { localKeys: ['nexus.intelligence'], events: ['suggestion'] }),
  m('devHub', 'devhub', { localKeys: ['nexus.devhub'] }),
  m('capture', 'capture', { docKeys: ['captures'], schema: '20261030120000_modules.sql' }),
  m('briefing', 'briefing', { docKeys: ['briefing'], schema: '20261030120000_modules.sql' }),
  m('projectHub', 'projecthub', { docKeys: ['projecthub'], schema: '20261030120000_modules.sql' }),
  m('knowledge', 'knowledge', { docKeys: ['knowledge'], schema: '20261030120000_modules.sql' }),
  m('studyLab', 'studylab', { docKeys: ['studylab'], schema: '20261030120000_modules.sql' }),
  m('gaming', 'gaming', { docKeys: ['gaming'], tables: ['team_playing', 'team_game_plans'], schema: '20261103090000_team_gaming.sql', uses: ['teams'] }),
  m('darts', 'darts', { docKeys: ['darts'], schema: '20261105090000_darts.sql' }),
  m('clock', 'clock', { localKeys: ['nexus.clock'], uses: [] }),
  m('calculator', 'calculator', { localKeys: ['nexus.calculator'] }),
  m('weather', 'weather', { localKeys: ['nexus.weather'] }),
  m('contacts', 'contacts', { docKeys: ['contacts'], schema: '20261106090000_contacts.sql' }),
  m('browser', 'browser'),
  m('teams', 'teams', { tables: ['study_groups', 'team_invites', 'team_projects', 'team_project_tasks', 'team_messages', 'team_task_comments'], localKeys: ['nexus.classagenda'], schema: '20261030150000_teams.sql', events: ['study_group'] }),
  m('friends', 'friends', { tables: ['friend_profiles', 'friendships'], localKeys: ['nexus.friends.add'], schema: '20261113150000_friends.sql', events: ['study_group'] }),
  m('controlCenter', 'controlcenter'),
  m('launcher', null, { localKeys: ['nexus.launcher'] }),
  m('sentinel', 'sentinel', { localKeys: ['nexus.sentinel.audit', 'nexus.sentinel.devices'], events: ['device'] }),
  m('vault', null, { docKeys: ['vault'], schema: '20261103120000_vault.sql', uses: ['projectHub', 'knowledge'] }),
  m('offline', 'offline', { localKeys: ['nexus.offline.history'] }),
  m('marketplace', 'marketplace', { localKeys: ['nexus.marketplace'], uses: ['devHub'] }),
  m('integration', null, { uses: ['inbox', 'projectHub', 'vault', 'devHub'] }),
]

/**
 * What is wrong with the register: a switch without a manifest, an app that does not exist, a
 * module it uses that is unknown, or a SQL file the Database-check does not list.
 */
export function registryProblems(apps: Array<{ id: AppId; feature?: FeatureId }>, modules: ModuleManifest[] = MODULES): string[] {
  const problems: string[] = []
  const known = new Set(FEATURES.map((f) => f.id))
  const files = new Set(SCHEMA_STEPS.map((s) => s.file))
  for (const f of FEATURES) if (!modules.some((x) => x.feature === f.id)) problems.push(`${f.title}: geen manifest`)
  for (const x of modules) {
    const title = FEATURES.find((f) => f.id === x.feature)?.title ?? x.feature
    if (!known.has(x.feature)) problems.push(`${x.feature}: onbekende module`)
    if (x.app && !apps.some((a) => a.id === x.app && a.feature === x.feature)) problems.push(`${title}: app ${x.app} hoort niet bij deze module`)
    for (const u of x.uses) if (!known.has(u)) problems.push(`${title}: gebruikt onbekende module ${u}`)
    if (x.schema && !files.has(x.schema)) problems.push(`${title}: ${x.schema} staat niet in de Database-check`)
  }
  for (const a of apps) if (a.feature && !modules.some((x) => x.feature === a.feature && x.app === a.id)) problems.push(`App ${a.id}: niet in het register`)
  return problems
}

export interface ModuleStatus {
  manifest: ModuleManifest
  title: string
  on: boolean
  /** Modules it uses that are switched off. */
  missingUses: FeatureId[]
}

/** Every module with whether it is on and which of the modules it uses are off. */
export function moduleStatus(switches: FeatureSwitches, modules: ModuleManifest[] = MODULES): ModuleStatus[] {
  return modules.map((manifest) => ({
    manifest,
    title: FEATURES.find((f) => f.id === manifest.feature)?.title ?? manifest.feature,
    on: featureOn(switches, manifest.feature),
    missingUses: manifest.uses.filter((u) => !featureOn(switches, u)),
  }))
}
