---
name: nexus-module-builder
description: Use when adding a new NEXUS OS app or module (a new window, a new feature switch in Apps aan/uit, a new synced document or table), or extending an existing module with new stored data. Step-by-step checklist of every place a module must be registered.
---

# NEXUS module builder

## Responsibility

Add modules the way the existing ~60 apps were added, so they show up in Start, the phone grid,
Apps aan/uit, profiles, the Database-check, backups, Help, the register in Platform Health and
the smoke tests. Missing one registration point is the most common NEXUS bug.

## Before building

- Confirm it doesn't already exist (grep `apps/web/src/apps/registry.tsx`, `core/features.ts`,
  and Help topics). Extend an existing module rather than duplicating it.
- Don't recreate an existing third-party app (e.g. DartCounter) and never copy content from
  KlasHub (private): link to it as a NEXUS app.
- If Ethan offered options and didn't pick one, ask on a decision card before building it.
- One PR per module or item.

## Checklist: a new app module (reference: Doelen / `goals`)

Core (`packages/core/src`)
1. `<domain>.ts` + `<domain>.test.ts`: types, `empty<X>()`, `parse<X>(raw)` (tolerant of old or
   broken data, with a schema number if the shape will evolve), `merge<X>(a, b)` for sync, and
   all pure logic. Export from `index.ts`.
2. `windows.ts`: add the id to `AppId`.
3. `features.ts`: add to `FeatureId` and `FEATURES` (Dutch title + description,
   `defaultOn: true` unless it is developer-only, `available: true`).
4. `modules.ts`: add an `m(...)` entry to `MODULES` with docKeys, tables, localKeys, schema file,
   events and `uses`. `registryProblems` (tested in `web/integration/integration.test.tsx`)
   fails if this is out of step.
5. Synced document: add the key to `BACKUP_DOCS` in `backup.ts`, and map it to its store in
   `apps/web/src/backup/backup.ts` (`<key>: doc(store, parse, merge)`).
6. SQL: add a `SCHEMA_STEPS` entry in `schemaCheck.ts` (see `nexus-security` for the SQL rules).

Web (`apps/web/src`)
7. `<domain>/store.ts`: `new DocStore<T>('nexus.<domain>', parse<X>)`, a `use<X>()` hook via
   `useSyncExternalStore`, `start<X>Sync` with `startDocSync` (key, parse, merge, migration
   path, problem, Dutch label). A **new** synced document uses `key: docKey('<name>')` and
   `migration: SETTINGS_DOCS_MIGRATION` from core: no SQL needed (see step 13). Device-only data uses `readStorage`/`writeStorage` instead.
8. `background.ts`: call `start<X>Sync(supabase, () => isFeatureOn('<id>'), onFeaturesChange)`.
9. `apps/<Name>.tsx` (+ `<Name>.test.tsx`) and register it in `apps/registry.tsx` with
   `load('<Name>', () => import('./<Name>'))` and an `APPS` entry (id, Dutch title, icon from
   `icons.tsx`, `defaultSize`, `feature`, `fill` if it needs the whole desktop).
10. Help: add a topic in `help/topics.ts`.
11. If it feeds the phone/watch: `safety/plan.ts`. If NEXUS AI may read it: an
    `AI_MODULES` entry in `core/aiContext.ts` (the person chooses per module what AI sees). If it reports events: `events/sources.ts`.
12. E2E: add the feature id to the `nexus.features` list in `apps/web/e2e/helpers.ts`
    (`startWithEverything`), so the smoke test opens it.

SQL (only if it syncs or has tables)
13. A synced document needs **no migration**: use `docKey('<name>')` (`doc.<name>`, allowed since
    `20261126110000_settings_docs.sql`; at most 64 rows per account). Do not add names to
    `user_settings_key_check` any more. Only new tables, functions or sharing rules need a
    migration `supabase/migrations/<yyyymmddhhmmss>_<name>.sql`.
14. Follow the SQL workflow in CLAUDE.md (project-files copy, `alles-in-een-keer.sql`,
    `supabase/tests/run.sh`, SQL Editor steps for Ethan).

Release notes
15. Entry at the top of `apps/web/src/about/changelog.ts` (Dutch, for the user, date of merge).

## Extending an existing module

- New stored fields: make `parse<X>` default them, bump the schema number if old data needs a
  migration, keep `merge<X>` correct for two devices editing offline.
- New dashboard widget: add it to the widget list and bump `PROFILES_SCHEMA`
  (`core/profiles.ts`) with a migration in `parseProfilesState`.

## Quality control

- `npm test` passes, including `integration.test.tsx` (register), `schemaCheck` file test,
  `changelog.test.ts` and the new unit/component tests.
- `npm run typecheck`, `npm run build`, then the Playwright smoke test for desktop and mobiel.
- Works offline (open the app with network off) and after sign-in on a second device.
- Switching the module off in Apps aan/uit hides it everywhere and stops its sync.

## References

- `apps/web/src/goals/store.ts`, `apps/web/src/apps/Goals.tsx`, `packages/core/src/goals.ts`
- `packages/core/src/modules.ts`, `features.ts`, `backup.ts`, `schemaCheck.ts`
- `apps/web/e2e/helpers.ts`, `apps/web/e2e/apps.e2e.ts`
