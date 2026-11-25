# Skills for NEXUS OS

Which skills to use for which task, and how the external ones relate to the project's own
`nexus-*` skills (in `.claude/skills/`). **Where an external skill and a `nexus-*` skill
disagree, the `nexus-*` skill and `CLAUDE.md` win.** External skills are not vendored in this
repo; install them per machine with the commands at the bottom (checked 2026-11-25).

## Which skills for which task

| Task | Use |
|---|---|
| New feature or module | superpowers:brainstorming → superpowers:writing-plans → `nexus-architecture` + `nexus-module-builder` → superpowers:test-driven-development |
| UI, widget, visual change | `nexus-design-system` (+ frontend-design for ideas, web-design-guidelines / ui-ux-pro-max for an audit) |
| SQL, RLS, auth, sharing, crypto, `api/` | `nexus-security` (+ supabase, supabase-postgres-best-practices, security-audit for a full audit, built-in /security-review on the diff) |
| External service, desktop, phone, watch | `nexus-integration` (+ claude-api for NEXUS AI) |
| Startup, bundle, lists, timers | `nexus-performance` (+ vercel-react-best-practices, client-side rules only) |
| Bug or failing test | superpowers:systematic-debugging |
| See it running, screenshots | Playwright via the repo's e2e setup (webapp-testing ideas), the built-in `run` skill |
| Before the PR | superpowers:verification-before-completion, superpowers:requesting-code-review or /code-review |
| Architecture clean-up (only when asked) | improve-codebase-architecture |
| Find or write skills | find-skills, skill-creator / superpowers:writing-skills |

## By category

**Design**: frontend-design, ui-ux-pro-max, web-design-guidelines → `nexus-design-system`
**Frontend**: vercel-react-best-practices, vercel-composition-patterns → `nexus-architecture`, `nexus-performance`
**Backend**: supabase, supabase-postgres-best-practices → `nexus-security`, `nexus-module-builder`
**Security**: security-audit, Security Engineer (reference only) → `nexus-security`
**Testing**: webapp-testing, test-driven-development, systematic-debugging
**AI**: claude-api (built in) → `nexus-integration`
**Workflow**: brainstorming, writing-plans, requesting-code-review, find-skills, skill-creator, improve-codebase-architecture

## Overlaps and conflicts (resolved)

- **shadcn**: not used. NEXUS has its own Werkbank system with `nx-*` tokens and no component
  library; adopting shadcn would replace the design system. Don't install.
- **agent-browser**: not used. Needs a global Rust CLI plus its own Chrome download; the
  repo already has Playwright (`apps/web/e2e`) and the cloud sandbox ships Chromium.
- **webapp-testing**: its scripts are Python Playwright (not installed here). Use the idea
  (start server, wait for network idle, inspect, act) with the TypeScript Playwright setup in
  `apps/web/playwright.config.ts`.
- **Security Engineer** (daffy0208/ai-dev-standards): generic Next.js/Express/JWT advice; NEXUS
  uses Supabase Auth, so most of it doesn't apply. Its OWASP checklist is covered by
  `nexus-security` + security-audit. Reference only, don't install.
- **vercel-react-best-practices / composition-patterns**: written for Next.js; skip server
  component, RSC and `next/*` rules. Client-side rules (bundle splitting, re-renders) apply.
- **web-design-guidelines / ui-ux-pro-max**: ignore Title Case rules (UI is Dutch, sentence
  case) and palette/style generators (the palette is fixed). ui-ux-pro-max's search script
  needs Python; its rules are usable without it.
- **supabase**: suggests applying migrations through the CLI/MCP. In NEXUS, Ethan runs SQL in
  the SQL Editor; never apply to production without his go-ahead (`nexus-security`).
- **security-audit**: full-audit mode only when explicitly asked; it writes reports outside
  the repo.
- **test-driven-development**: follow it for core logic; UI work is test-after with Testing
  Library + Playwright smoke.
- **improve-codebase-architecture**: manual only (`disable-model-invocation`), and it expects a
  `codebase-design` skill that isn't installed. Use only when Ethan asks for a refactor review;
  never rewrite working modules on its say-so.

## Added 2026-11-25 (Product Excellence)

| Skill | Use for | Note |
|---|---|---|
| impeccable (pbakaus) | critique, polish, delight, animate of a screen | One skill now (`--skill impeccable`; the old names critique/polish/delight/animate no longer exist). Its launcher downloads a binary; if it fails, read PRODUCT/DESIGN context directly. Its "replace the visual world" mode does not apply: refinement only, `nexus-design-system` wins. |
| extract-design-system | writing the Werkbank tokens down as a DESIGN.md | Read-only on the code; the source of truth stays `index.css` + `nexus-design-system`. |
| micro-interaction (iart-ai) | press feedback, list add/remove, small transitions | Use the motion tokens in `index.css` (`--ease-out`), only `opacity`/`transform`, no animation on keyboard-opened UI (search, quick capture). |
| web-quality-audit, performance, core-web-vitals, accessibility, best-practices (addyosmani) | audits with Lighthouse and the e2e axe run | Measure first (Lighthouse on `vite preview`, note it is uncompressed). Startup rules in `nexus-performance` win over their generic budgets. |
| charting (mthines) | charts in Inzichten, Cijfers, dashboard widgets | `nx-*` colours only; empty states for no data. |
| i18n (tartinerlabs) | consistent Dutch (nl-BE), dates and numbers | NEXUS is nl-BE only; do not add a multi-language framework unless Ethan asks. |
| mcp-builder (anthropics) | a NEXUS MCP server for AI assistants | Security first: `nexus-security`, read-only scopes, explicit consent per scope. |

The analysis that used these is in [docs/product-excellence.md](../docs/product-excellence.md).

## Install (per machine, optional)

```bash
npx skills add anthropics/skills --skill frontend-design
npx skills add anthropics/skills --skill webapp-testing
npx skills add anthropics/skills --skill skill-creator
npx skills add nextlevelbuilder/ui-ux-pro-max-skill --skill ui-ux-pro-max
npx skills add vercel-labs/agent-skills --skill web-design-guidelines
npx skills add vercel-labs/agent-skills --skill vercel-react-best-practices
npx skills add vercel-labs/agent-skills --skill vercel-composition-patterns
npx skills add supabase/agent-skills --skill supabase
npx skills add supabase/agent-skills --skill supabase-postgres-best-practices
npx skills add cloudflare/security-audit-skill --skill security-audit
npx skills add obra/superpowers --skill test-driven-development
npx skills add obra/superpowers --skill systematic-debugging
npx skills add obra/superpowers --skill brainstorming
npx skills add obra/superpowers --skill writing-plans
npx skills add obra/superpowers --skill requesting-code-review
npx skills add vercel-labs/skills --skill find-skills
npx skills add mattpocock/skills --skill improve-codebase-architecture
npx skills add pbakaus/impeccable --skill impeccable
npx skills add arvindrk/extract-design-system --skill extract-design-system
npx skills add iart-ai/web-animation-skills --skill micro-interaction
npx skills add addyosmani/web-quality-skills --skill web-quality-audit
npx skills add addyosmani/web-quality-skills --skill performance
npx skills add addyosmani/web-quality-skills --skill core-web-vitals
npx skills add addyosmani/web-quality-skills --skill accessibility
npx skills add addyosmani/web-quality-skills --skill best-practices
npx skills add mthines/agent-skills --skill charting
npx skills add tartinerlabs/skills --skill i18n
npx skills add anthropics/skills --skill mcp-builder
```

In the Claude cloud sessions superpowers, frontend-design and skill-creator are already
available as plugins.
