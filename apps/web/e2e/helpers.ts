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

/** The buttons that open an app: the rows on the desktop's home screen, the grid on a phone. */
export function appButtons(page: Page) {
  return isMobile(page) ? page.getByRole('group', { name: 'Apps' }).getByRole('button') : page.getByRole('navigation', { name: 'Apps' }).getByRole('button')
}

/** The button that opens one app (on the desktop it is an icon, named by its label). */
export function appButton(page: Page, title: string) {
  return appButtons(page).and(page.getByRole('button', { name: title, exact: true }))
}

/** The names of every app you can open. */
export async function appTitles(page: Page): Promise<string[]> {
  const buttons = await appButtons(page).all()
  const names = await Promise.all(buttons.map(async (b) => (await b.getAttribute('aria-label')) ?? (await b.innerText())))
  return names.map((t) => t.trim()).filter(Boolean)
}

/** Collects errors that escape to the page; console noise (a missing API in preview) is not one. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}
