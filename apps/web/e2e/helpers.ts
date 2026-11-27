import { expect, type Page } from '@playwright/test'

/** Every blueprint module, Flow Studio and developer mode on; the tour already seen. */
export async function startWithEverything(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('e2e.ready')) return
    sessionStorage.setItem('e2e.ready', '1')
    localStorage.setItem('nexus.features', JSON.stringify({ spaces: true, inbox: true, timeMachine: true, bridge: true, intelligence: true, devHub: true, capture: true, briefing: true, projectHub: true, knowledge: true, studyLab: true, gaming: true, teams: true, controlCenter: true, launcher: true, sentinel: true, vault: true, offline: true, marketplace: true, integration: true, darts: true, goals: true, clock: true, calculator: true, weather: true, contacts: true, browser: true, friends: true }))
    localStorage.setItem('nexus.flows.enabled', 'on')
    localStorage.setItem('nexus.developer', 'on')
    localStorage.setItem('nexus.tour.done', '1')
  })
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: /^(Apps|Navigatie)$/ }).first()).toBeVisible()
}

export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1000) < 768

/** On a phone: the grid of apps. On the desktop all apps are under the NEXUS mark (Start). */
async function showApps(page: Page) {
  if (isMobile(page)) return page.getByRole('group', { name: 'Apps' })
  const menu = page.getByRole('menu', { name: 'Startmenu' })
  if (!(await menu.isVisible())) await page.getByRole('button', { name: 'Start', exact: true }).click()
  // Favourites and Recent repeat some apps; Alle apps has each one once.
  return menu.getByRole('group', { name: 'Alle apps' })
}

/** Opens one app the way you would: from the grid on a phone, from Start on the desktop. */
export async function openApp(page: Page, title: string) {
  const apps = await showApps(page)
  await apps.getByRole(isMobile(page) ? 'button' : 'menuitem', { name: title, exact: true }).click()
}

/** The names of every app you can open. */
export async function appTitles(page: Page): Promise<string[]> {
  const apps = await showApps(page)
  const names = await apps.getByRole(isMobile(page) ? 'button' : 'menuitem').allInnerTexts()
  if (!isMobile(page)) await page.keyboard.press('Escape')
  return names.map((t) => t.trim()).filter(Boolean)
}

/** Collects errors that escape to the page; console noise (a missing API in preview) is not one. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}
