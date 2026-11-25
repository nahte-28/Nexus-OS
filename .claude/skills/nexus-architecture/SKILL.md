---
name: nexus-architecture
description: Use before any NEXUS OS change that touches more than one file, a new feature, sync, storage, or cross-platform behaviour (web, Windows/Linux desktop, Android, watch). Maps the monorepo, the layering rules and where each kind of code belongs.
---

# NEXUS architecture

## Responsibility

Keep every change inside the existing NEXUS architecture: put code in the right layer, reuse
the existing stores, sync and event plumbing, and never start a parallel structure next to one
that already exists. When in doubt, find the nearest existing module that does something similar
and copy its shape.

## Map of the repository

```
packages/core/src   Pure TypeScript logic, no React, no DOM, no Supabase client. One file per
                    domain (grades.ts, darts.ts, profiles.ts, outbox.ts, ...) with a sibling
                    *.test.ts. Exported through index.ts. "sideEffects": false.
apps/web/src        React 19 + Vite 8 + Tailwind 4 PWA. One folder per domain (agenda/, darts/,
                    teams/, ...) for stores and hooks; apps/ holds the app windows (Goals.tsx) and
                    registry.tsx; desktop/ the window manager UI; mobile/ the phone layout;
                    profiles/ the dashboard and widgets; state/ DocStore, storage, IndexedDB.
api/                Vercel serverless functions (ai, calendar, cards, darts, push*, review, study,
                    weather). Files starting with _ are shared helpers, not routes.
supabase/migrations Idempotent SQL, one file per feature, timestamp-named.
supabase/tests      run.sh runs every migration twice on plain Postgres, then RLS tests.
apps/desktop        Tauri 2 shell (src-tauri/src/*.rs: browser, discord, session, system, update).
apps/android-companion  Kotlin phone companion (no AndroidX, OkHttp) and wear/ watch app.
distro/             Debian 13 live-build ISO, apt repo, labwc session, branding.
.github/workflows   ci.yml (typecheck, test, build, Playwright smoke, database), android.yml,
                    desktop.yml, apt.yml, iso.yml.
```

## Layering rules

1. **Logic goes in `packages/core`** whenever it can be pure: parsing, merging, scheduling,
   scoring, migrations of stored shapes (`parseXxx` with schema versions). Web code calls it.
2. **Web state** uses the existing primitives, not new libraries:
   - synced document per feature: `DocStore` + `startDocSync` (`apps/web/src/state/docStore.ts`),
     stored as one row per key in `user_settings`;
   - device-only settings: `readStorage`/`writeStorage` (`state/storage.ts`), keys `nexus.<area>`;
   - notes: IndexedDB + sync engine (`sync/engine.ts`), last write wins, tombstones for deletes;
   - messages/tasks made offline: the outbox (`core/outbox.ts`, `web/offline/outbox.ts`);
   - things that happened: the event bus (`web/events/bus.ts`) for Inbox and Intelligence;
   - React reads stores with `useSyncExternalStore`. No Redux, Zustand or React Query.
3. **Supabase loads lazily** after the first screen via `loadSupabase` in `sync/config.ts`.
   `firstScreen.test.ts` fails if a module imported by `main.tsx` imports supabase-js.
4. **Apps are lazy**: `load('Name', () => import('./Name'))` in `apps/registry.tsx`.
5. **Server code** (`api/`) only for what the browser cannot do: secret keys (Anthropic, VAPID,
   push), CORS-blocked fetches (calendar feeds), heavy work. Verify the Supabase token with
   `emailForToken` from `api/_shared.ts`.
6. **Local-first**: everything with a deadline (agenda, reminders, notes, projects, tasks) must
   work offline and sync later. Online-only is acceptable only for AI, live gaming/darts online,
   network diagnostics.
7. **Cross-platform**: the Windows/Linux app is the same web build inside Tauri
   (`platform/desktop.ts` detects it). Native features go through Tauri commands in
   `src-tauri/src`, with a web fallback. The phone and watch receive work via E2E encrypted
   NEXUS Connect messages or web push, never plaintext content.

## Workflow

1. Read `README.md` sections for the area, then `grep` for the closest existing feature.
2. List affected layers (core, web, api, SQL, desktop, Android) before writing code.
3. Change core first with tests, then the web UI, then SQL/api if needed.
4. If the change adds a module, follow `nexus-module-builder`. If it adds SQL or touches
   auth/crypto, follow `nexus-security`. If it touches startup, lists or the dashboard, check
   `nexus-performance`. External services: `nexus-integration`.

## Quality control

- `npm run typecheck` and `npm test` pass; core logic has unit tests next to it.
- No new runtime dependency without a clear reason stated in the PR.
- No working module rewritten or removed without Ethan's permission.
- Stored shapes stay backward compatible: bump the schema number and migrate in `parseXxx`
  (example: `PROFILES_SCHEMA` in `core/profiles.ts`).

## References

- `README.md` (setup, sync, Connect, companion, watch, desktop, distro)
- `packages/core/src/modules.ts` (module register), `features.ts` (switches)
- Project files: `/mnt/project-files/blueprint/*.md` and the blueprint .docx files
