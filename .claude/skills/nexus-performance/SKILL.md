---
name: nexus-performance
description: Use when a NEXUS OS change touches startup (main.tsx, background.ts, imports into the first screen), adds a dependency, renders long lists or the dashboard, adds polling/timers/sync, or runs on low-end targets (phone, watch, the Linux VM). Holds the startup budget rules and how to measure.
---

# NEXUS performance

## Responsibility

NEXUS must start fast on a phone and in a 4 GB VM, stay smooth with many windows open, and not
drain the phone or watch battery. Protect the mechanisms that already make it fast; measure
before and after any change that could slow it down.

## What keeps NEXUS fast today (don't break these)

- **First screen first**: `main.tsx` renders the shell; `background.ts` (sync, reminders,
  notices) is imported on `requestIdleCallback` (timeout 1.5 s); `preloadApps()` fetches app
  code after 4 s.
- **Lazy apps**: every app window is `load('Name', () => import('./Name'))` in
  `apps/registry.tsx`. Never import an app component statically from the shell.
- **Lazy Supabase**: supabase-js (~55 kB gzip) loads through `loadSupabase` in
  `sync/config.ts`; `firstScreen.test.ts` fails if anything `main.tsx` imports pulls it in. Type
  imports (`import type`) are fine.
- **Tree-shaking**: `@nexus/core` has `"sideEffects": false`; keep core modules free of
  top-level side effects (no work at import time).
- **Batched sync**: `pullSetting` groups everything requested within `PULL_BATCH_MS` (20 ms)
  into one `select ... in (keys)`; each document syncs once per sign-in, polls every 5 minutes,
  and on return to NEXUS. Don't add per-document polling loops.
- **Motion**: only `opacity`/`transform`, no `transition-all`, no layout animation; window drag
  and dashboard drag use pointer events (HTML5 drag-and-drop fails in Tauri on Windows).

## Rules for new code

1. No new runtime dependency for something a few lines of code or the platform can do (dates via
   `Intl`, no moment/lodash/date-fns). If one is truly needed, load it lazily inside the app
   that uses it and state the gzip size in the PR.
2. Heavy pure work (parsing big calendar feeds, rankings, layouts) lives in core, is tested on a
   realistic size, and runs once per input change (memoize with `useMemo` on stable inputs, or
   compute in the store), not on every render or every second.
3. Timers: use `useNow(ms)` (`state/useNow.ts`) with the coarsest interval that works (a
   minute for agenda views, a second only for visible clocks and timers). Stop timers and
   subscriptions in cleanup. Pause work when the tab is hidden where possible.
4. Lists that can grow without bound (chat, history, events, agenda feeds) are capped or
   paginated (event bus keeps 200; outbox and safety plan have limits) and trimmed server-side
   when big (`trimPast` in `api/calendar.ts`).
5. Server functions answer under Vercel's 4.5 MB response limit and do no work per request that
   could be cached.
6. Phone/watch: the companion and watch use alarms and the encrypted safety plan, not
   continuous polling. Keep payloads small (the watch "Vandaag" plan).
7. Storage: `localStorage` writes are synchronous; don't write on every keystroke of a large
   document, debounce or write on blur. Large blobs belong in IndexedDB.

## How to measure

- Bundle: `npm run build` and compare the sizes Vite prints for `index-*.js` (entry) before and
  after; the entry chunk must not grow for a change inside one app.
- Startup: Playwright with CPU throttling (`page.emulate` via CDP `Emulation.setCPUThrottlingRate`
  4x) on the built app (`vite preview`), time until the navigation landmark is visible.
- Render cost: React Profiler in dev, or count renders in a component test for hot paths
  (dashboard widgets, windows).
- Database: Supabase advisors (performance) and indexes on every foreign key
  (`20261124090000_hardening.sql` added them; new tables add their own).

## Quality control

- `firstScreen.test.ts` passes; entry chunk size not increased without reason.
- No new interval/subscription without cleanup; no `transition-all`.
- Large-data case tested (e.g. a year of agenda items, 1000 notes) for new list/aggregate code.

## References

- `apps/web/src/main.tsx`, `background.ts`, `apps/registry.tsx`, `sync/config.ts`,
  `state/docStore.ts`, `firstScreen.test.ts`
- `packages/core/src/dashboardLayout.ts`, `README.md` ("Documenten syncen")
- External: `vercel-react-best-practices` (only the client-side rules apply; NEXUS is a Vite SPA,
  not Next.js)
