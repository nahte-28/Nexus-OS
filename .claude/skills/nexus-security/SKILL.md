---
name: nexus-security
description: Use for any NEXUS OS change that adds or edits SQL (tables, RLS, functions), touches auth, accounts, sharing between users, encryption (Connect, Bridge, DMs, Vault), server functions in api/, secrets or environment variables, or before opening a PR that does any of these.
---

# NEXUS security

## Responsibility

Protect the data of every NEXUS account. The browser is untrusted, Supabase row-level security
(RLS) is the real boundary, secrets stay on the server, and anything sent to a phone or watch is
end-to-end encrypted. Use the external `security-audit` and `supabase` skills for deeper reviews;
this skill holds the NEXUS-specific rules.

## Secrets and configuration

- Public by design (safe in the bundle): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  (anon/publishable key), Spotify Client ID, Discord Application ID, VAPID public key.
- Server-only (Vercel env, never `VITE_`, never in the repo, logs, memory or chat):
  `ANTHROPIC_API_KEY`, `PUSH_SECRET`, VAPID private key, any `service_role` key.
  `service_role` is never used by the web app or `api/`; privileged work goes through
  `security definer` functions with their own checks.
- A person's own Anthropic key travels per request in the `x-nexus-ai-key` header and is never
  stored or logged server-side (`api/_shared.ts`).
- Never paste real keys in tests, fixtures, screenshots or PR text. Use dummies.

## Database rules (Supabase / Postgres)

- **Every table in `public` has RLS on**; `supabase/tests/rls.sql` fails otherwise. Private
  helpers live in the `nexus_private` schema, which users cannot reach.
- Policies: `to authenticated` **plus** an ownership or membership check
  (`user_id = (select auth.uid())`, `public.is_study_group_member(...)`, `public.are_friends(...)`).
  Write `(select auth.uid())`, not bare `auth.uid()` (evaluated once per query; see
  `20261124090000_hardening.sql`). UPDATE needs a SELECT policy too.
- Never authorise on `user_metadata` / `raw_user_meta_data` (user-editable).
- `security definer` functions: `set search_path = public, nexus_private` (or stricter), check
  the caller inside the function, `revoke execute ... from anon` unless it is one of the
  token-based push functions. Avoid `select ... into` in public plpgsql functions (project rule);
  use a scalar subquery or `language sql`.
- Views: `with (security_invoker = true)`.
- Migrations are **idempotent** (`create ... if not exists`, `drop policy if exists`, realtime
  add wrapped for `duplicate_object`, key-list constraints `not valid`): `run.sh` runs every
  migration twice.
- Every new table or sharing rule gets a test file in `supabase/tests/<name>.sql` (pattern:
  insert test users in `auth.users`, `set role authenticated`, `set test.uid = '<uuid>'` (the stub `auth.uid()` reads it), assert
  that user B cannot read or change user A's rows and anon sees nothing), listed in `run.sh`.
- **Never run SQL against Ethan's production project** (Supabase MCP `apply_migration` /
  `execute_sql` on ref `tnhjvcucaanirlmpgiyy`) without his explicit go-ahead. The normal path is
  that Ethan runs the SQL himself in the SQL Editor. Read-only advisor checks are fine.
- Destructive operations (drop table/column, delete rows, truncate) need Ethan's approval first.

## End-to-end encryption

- Notification content, Bridge items, private messages and the phone/watch safety plan are E2E
  encrypted: ECDH P-256 + HKDF-SHA256 + AES-256-GCM in `packages/core/src/connectCrypto.ts`,
  mirrored in Kotlin (`ConnectCrypto.kt`). Server and Supabase see only public keys and
  ciphertext. Private keys never leave the device (non-extractable WebCrypto key in IndexedDB,
  Android keystore).
- Never add a path that sends plaintext content to the server, a push service or a log "just for
  debugging". Push payloads carry no content, or encrypted content only.
- Change web and Kotlin crypto together, with test vectors in both.

## Web and API

- No `dangerouslySetInnerHTML` (there are none today); render user text as text.
- Developer Hub widgets run in a sandboxed iframe without same-origin (`devhub/SandboxFrame.tsx`)
  and talk only through the broker; keep it that way.
- `api/*`: verify the Supabase token (`emailForToken`), check allowlists
  (`NEXUS_AI_ALLOWED_EMAILS`), validate input sizes and types, return Dutch error messages via
  `json()`, CORS only for the listed origins (`cors()` in `_shared.ts`). Fetching user-given URLs
  (calendar feeds) only reaches known hosts (`NEXUS_CALENDAR_HOSTS`, Google) or public addresses,
  never private networks (`publicUrl` in `api/calendar.ts`), to avoid SSRF.
- Security headers live in `vercel.json` and are tested (`securityHeaders.test.ts`).
- NEXUS AI never acts without approval per action (`core/aiContext.ts` approval history) and
  only sees the modules the person allowed.
- OAuth (Spotify) uses PKCE with only a public Client ID; no client secrets in the app.

## Workflow

1. Before writing SQL: read the latest migration that touches the same tables and its test.
2. Write the migration + `supabase/tests/<name>.sql`; run `supabase/tests/run.sh` locally against
   a throwaway Postgres 16 if available, otherwise rely on the CI `database` job.
3. Follow the SQL workflow in CLAUDE.md (project files, `alles-in-een-keer.sql`, SCHEMA_STEPS,
   explicit SQL Editor steps for Ethan).
4. Before the PR: run the `security-review` skill on the diff when it touches auth, RLS, crypto or
   `api/`.

## Quality control

- CI `database` job green (all migrations twice + RLS tests).
- No secret in the diff (`git diff | grep -iE "sk-ant|service_role|secret|private"` is clean).
- Two-user test: B cannot see A's data; anon cannot call protected functions.

## References

- `supabase/migrations/20261124090000_hardening.sql`, `supabase/tests/rls.sql`, `run.sh`
- `packages/core/src/connectCrypto.ts`, `README.md` (NEXUS Connect section)
- `api/_shared.ts`, `vercel.json`, `.env.example`
