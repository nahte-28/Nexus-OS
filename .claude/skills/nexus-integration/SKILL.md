---
name: nexus-integration
description: Use when a NEXUS OS change connects to or changes an external service or another NEXUS platform - Supabase, Vercel functions, Anthropic (NEXUS AI), Google Agenda/ICS, Open-Meteo, Spotify, Discord, web push, KlasHub, the Tauri desktop app, the Android companion or the watch app, releases and update checks.
---

# NEXUS integration

## Responsibility

Integrations must be honest (tested, never assumed to work), private (minimal data out, keys on
the server), resilient (NEXUS keeps working when the service is down or not configured) and
consistent across web, desktop, phone and watch.

## Integration map

| Integration | Where | Notes |
|---|---|---|
| Supabase (auth, Postgres, realtime, storage `nexus-files`) | `apps/web/src/sync/`, `state/docStore.ts`, `supabase/` | Optional: without env vars NEXUS runs fully local. Loaded lazily. |
| Vercel functions | `api/*.ts`, helpers in `api/_shared.ts` | Routes; `_`-files are shared. Env vars set by Ethan in Vercel. |
| Anthropic (NEXUS AI) | `api/ai.ts`, `apps/web/src/ai/` | `@anthropic-ai/sdk` 1.x, model `DEFAULT_MODEL` in `_shared.ts` (override `NEXUS_AI_MODEL`). Shared key only for `NEXUS_AI_ALLOWED_EMAILS`; otherwise the person's own key per request. Tools need approval per action. Use the `claude-api` skill for SDK questions. |
| Google Agenda / school timetable (ICS) | `api/calendar.ts`, `core/calendar.ts`, `profiles/calendar*.ts` | Server fetch because of CORS; known hosts or public URLs only; refresh every 15 min and on focus. All-day events are ignored today. |
| Weather | `api/weather.ts` | Open-Meteo, no key, two fixed URLs, coordinates rounded to ~1 km. |
| Spotify (focus music) | `apps/web/src/spotify/`, `core/spotify.ts` | PKCE, public Client ID only, redirect `/spotify`; playback needs Premium. Desktop gets a `nxsp1.` link code from the browser. |
| Discord Rich Presence | `apps/desktop/src-tauri/src/discord.rs`, `core/discord.ts`, `web/gaming/discord.ts` | Desktop app only, local IPC, public Application ID, asset key `nexus`. |
| Web push | `api/push*.ts`, `supabase/migrations/*push*`, `apps/web/src/push/` | VAPID keys in Vercel; payloads carry no plaintext content. Reaches Ethan's phone and watch via Chrome. |
| NEXUS Connect / Bridge | `core/connectCrypto.ts`, `apps/web/src/connect/`, Kotlin `Connect.kt` | E2E encrypted; see `nexus-security`. |
| Tauri desktop (Windows, Linux) | `apps/desktop/src-tauri/src/*.rs`, `apps/web/src/platform/desktop.ts` | Same web build; native features as `#[tauri::command]`, called with `invoke`, always with a browser fallback. Released by `desktop.yml` on every push to main. |
| Android companion + Wear OS watch | `apps/android-companion/`, `wear/` | Kotlin, no AndroidX, OkHttp. Built and released only by CI (`android.yml`); the sandbox can't reach dl.google.com. A watch change needs a new watch APK. |
| Update checks | `releases.atom` of the GitHub repo, read by `src-tauri/src/update.rs` and `UpdateCheck.kt` | Desktop, companion and watch compare their version with the latest release. |
| KlasHub | `openKlasHub()` in `apps/registry.tsx` | Private repo of a classmate: link only, never copy its content. |
| Linux distro | `distro/`, `apt.yml`, `iso.yml` | apt source on `nahte-28.github.io/Nexus-OS`, Flathub store in the Systeem app. |

## Rules

1. **Optional and degradable**: every integration has a "not configured" and an "offline/error"
   state with a Dutch message that says what to do (see `calendarProblems`, `docSyncError`).
   The rest of NEXUS keeps working.
2. **Secrets server-side**: a service that needs a secret goes through `api/` with the secret in
   Vercel env. Public IDs (OAuth client IDs, Application IDs) may live in code.
3. **Minimal data**: send only what the service needs (rounded coordinates, no personal content
   in push payloads, AI sees only allowed modules).
4. **No general proxy**: server functions fetch fixed URLs or validated public URLs only.
5. **Cross-platform parity**: if it changes what the phone or watch does, update the Kotlin side
   (or say clearly in the PR that a new APK is needed and that CI builds it). Desktop-only
   features must hide or explain themselves in the browser.
6. **Pin behaviour, not luck**: wrap the service in a small client with typed parsing in core
   (`parseXxx`) and unit-test it with recorded sample responses. Never assume an API shape from
   memory; check the current docs (Supabase changes often, see the `supabase` skill).
7. **Paid or account-bound services** (new API keys, paid tiers) are Ethan's decision: ask on a
   card before adding one.

## Workflow

1. Read the existing integration nearest to the new one and reuse its client shape.
2. Write the core parser + tests with real sample payloads (scrubbed of personal data).
3. Implement the `api/` function or the client, with error and not-configured states.
4. Test it for real where possible: run the function locally against the service, or call the
   deployed preview. If it can't be tested from the sandbox (Android build, Discord IPC, a
   service behind a login), say so explicitly in the PR and give Ethan the exact steps to verify
   on his device.
5. Document new env vars in `.env.example` (names only, dummy values) and in the PR.

## Quality control

- Unit tests for parsing and error paths; `npm run typecheck` includes `api/` (`tsc -p api`).
- Not-configured and offline states verified (devtools offline / env vars removed).
- No secret in client code; CORS limited to `cors()` origins.
- PR states what was tested live and what Ethan still has to check (device, store, SQL).

## References

- `README.md` (Supabase, Connect, companion, watch, desktop sections)
- `api/_shared.ts`, `api/calendar.ts`, `api/weather.ts`, `apps/web/src/platform/desktop.ts`
- `.github/workflows/android.yml`, `desktop.yml`, `apt.yml`, `iso.yml`
