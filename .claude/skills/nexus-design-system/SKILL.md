---
name: nexus-design-system
description: Use for any NEXUS OS UI work - a new app window, widget, dialog, settings section or visual tweak. Holds the Werkbank theme tokens, component patterns, Dutch copy rules and accessibility requirements so new UI matches the existing look.
---

# NEXUS design system ("Werkbank")

## Responsibility

New UI must look and behave like the rest of NEXUS. Extend the existing Werkbank system; never
replace it with a template, a component library (shadcn, MUI, Radix themes) or a new palette.
External design skills (frontend-design, ui-ux-pro-max, web-design-guidelines) are inputs for
ideas and audits, this skill wins where they disagree.

## The theme

Defined in `apps/web/src/index.css` (read its comments before changing anything).

- Concept: a breadboard on a workbench. The grid of holes on the wallpaper and copper "traces"
  (a line with a solder dot) that show what is active are the only loud elements. Everything
  else stays calm.
- Two themes, switched with `data-theme` on `<html>`: **Focus** (light, solder-mask green) and
  **Pulse** (dark circuit board, copper accent). Profiles can override only the accent
  (`theme/accents.ts`, six accents, each with a Focus and a Pulse value).
- Components use **only** the tokens, as Tailwind classes: `bg-nx-bg`, `bg-nx-surface`,
  `bg-nx-surface-2`, `border-nx-border`, `text-nx-text`, `text-nx-muted`, `bg-nx-accent`,
  `text-nx-accent-text`. No raw hex, no `dark:` variants, no Tailwind palette colours
  (`bg-blue-500`), so Focus and Pulse switch cleanly.
- Status colours are tokens too (Werkbank 2.0), AA on every surface in both themes:
  `text-nx-danger` / `text-nx-warning` / `text-nx-success` / `text-nx-info` for text, icons and
  dots (`bg-nx-success` for a dot, `bg-nx-danger/10` + `border-nx-danger/40` for an error box),
  and `bg-nx-danger-strong text-white` for a destructive button. `werkbank.test.ts` fails on a
  palette colour; only the user-picked calendar colours in the Agenda are exempt.
- Type: Tailwind's scale plus `text-2xs` (11px) for badges and small labels; no `text-[11px]`.
- Radius follows hierarchy: buttons `rounded-md`, cards `rounded-lg`, windows `rounded-xl`.
- Font: Schibsted Grotesk Variable, body 15px / 1.5. Don't add fonts.
- Motion: `--ease-out` for entering/leaving, `--ease-in-out` for moving on screen; only
  `opacity` and `transform`; use the `.nx-enter-*` classes. Never `transition-all`. Things opened
  dozens of times a day by keyboard (Ctrl+K search, quick capture) open instantly.
  `prefers-reduced-motion` is already handled globally; don't fight it.
- Traces: add `data-trace="left|bottom|top"` to a nav item or toggle to get the copper line on
  hover, focus, `aria-pressed="true"` or `data-on="true"`.
- Helpers: `.nx-glass`, `.nx-lift`, `.nx-safe-top/.nx-safe-bottom` (phone notch/home bar).

## Common patterns (copy from existing apps)

- Card / section: `rounded-lg border border-nx-border bg-nx-surface-2 p-3`
- Input: `rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none`
- Primary button: `rounded-md bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text`
- Secondary text / labels: `text-xs text-nx-muted`
- Icons: inline SVG components in `apps/web/src/apps/icons.tsx` (`(p: SVGProps) => <svg ...>`).
  Add new icons there in the same stroke style; no icon fonts, no emoji as icons.
- Look at `Goals.tsx`, `Grades.tsx` and `Weather.tsx` for a modern, compact app layout.

## Layout

- Desktop: windows (`desktop/Window.tsx`) open at `defaultSize`; `fill: true` apps fill the
  desktop area on big screens. Containers adapt with `@container` queries, not only viewport
  breakpoints. Dashboard widgets are packed by `core/dashboardLayout.ts`.
- Phone (< 768px): `mobile/` grid layout; every app must work at 360px wide with touch targets
  of at least 40-44px and no horizontal scroll.
- Large screens (>= 1536px): use the space (more columns), don't just stretch.

## Copy

- All UI text is **Dutch (Flemish, nl-BE)**, informal "je". Sentence case, never Title Case.
  Short, concrete, says what the person can do. Use `…` (the character) not `...`.
- Dates, times and numbers via `Intl` with `'nl-BE'` (see `core/briefing.ts`).
- Empty states say what to do next. Errors say what went wrong and how to fix it.

## Accessibility (required)

- Real elements: `<button>` for actions, `<a>` for links, labelled inputs (`<label>` or
  `aria-label`). Icon-only buttons get `aria-label` (Dutch).
- Global `:focus-visible` outline uses the accent; never remove it.
- Live updates (sync state, timers, scores) use `role="status"` or `aria-live`.
- Contrast holds in both themes; check Pulse as well as Focus.
- The Playwright smoke test runs axe on every app (`apps/web/e2e/apps.e2e.ts`); it must pass.

## Workflow

1. Find the closest existing app or widget and reuse its structure and classes.
2. When Ethan asks for a new look or a choice of directions, prototype variants and let him
   pick on a card; don't build options he didn't choose.
3. Build, then screenshot desktop (1366x860 and 1920+) and phone (Pixel 7), Focus and Pulse,
   with Playwright (`/opt/pw-browsers/chromium` in the cloud sandbox).
4. Put screenshots for Ethan in `/mnt/project-files/screenshots/<topic>/`.

## Quality control

- No raw colours, no `transition-all`, no new UI library, no English UI strings.
- Works in Focus and Pulse, desktop and phone, keyboard only.
- axe smoke test passes; component test (Testing Library) for new interactive UI.

## References

- `docs/visual-identity-2.0.md`: Ethan's masterplan for the next design step (Circuit Flow,
  taskbar, Start menu, dashboard 2.0, phased plan). Read it before design work in those areas;
  build its phases only when Ethan asks for them.
- `apps/web/src/index.css`, `apps/web/src/theme/`, `apps/web/src/apps/icons.tsx`
- `packages/core/src/theme.ts` (theme ids), `dashboardLayout.ts`
- Earlier design work: `/mnt/project-files/screenshots/` (dashboard-richtingen, groot-scherm)
