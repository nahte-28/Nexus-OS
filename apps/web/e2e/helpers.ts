import { expect, type Page } from '@playwright/test'

/** Every blueprint module, Flow Studio and developer mode on; the tour already seen. */
export async function startWithEverything(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('e2e.ready')) return
    sessionStorage.setItem('e2e.ready', '1')
    localStorage.setItem('nexus.features', JSON.stringify({ spaces: true, inbox: true, timeMachine: true, bridge: true, intelligence: true, devHub: true, capture: true, briefing: true, projectHub: true, knowledge: true }))
    localStorage.setItem('nexus.flows.enabled', 'on')
    localStorage.setItem('nexus.developer', 'on')
    localStorage.setItem('nexus.tour.done', '1')
  })
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: /^(Apps|Navigatie)$/ }).first()).toBeVisible()
}

export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1000) < 768

/** The app buttons of the shell that is showing: the sidebar on a computer, the grid on a phone. */
export function appButtons(page: Page) {
  return isMobile(page) ? page.getByRole('list', { name: 'Apps' }).getByRole('button') : page.getByRole('navigation', { name: 'Apps' }).getByRole('button')
}

/** Collects errors that escape to the page; console noise (a missing API in preview) is not one. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}
