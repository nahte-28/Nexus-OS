import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { appButtons, isMobile, startWithEverything, trackErrors } from './helpers'

// KlasHub opens Remo's site in its own window; that is not part of NEXUS.
const SKIP = ['KlasHub']

for (const theme of ['focus', 'pulse'] as const) {
  test(`every app opens without errors and passes the accessibility check (${theme})`, async ({ page }) => {
    const errors = trackErrors(page)
    await startWithEverything(page)
    // Focus is light, Pulse dark: both need enough contrast. The theme stays until a profile changes it.
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme)
    const report: string[] = []
    const check = async (where: string) => {
      // Widgets in their sandbox are your own code; axe checks NEXUS itself.
      // axe brings its own playwright-core types; the page is the same at runtime.
      const r = await new AxeBuilder({ page } as unknown as ConstructorParameters<typeof AxeBuilder>[0]).withTags(['wcag2a', 'wcag2aa']).exclude('iframe').analyze()
      for (const v of r.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical')) report.push(`${where}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ')}`)
    }
    await check('Dashboard')
    const titles = (await appButtons(page).allInnerTexts()).map((t) => t.trim()).filter((t) => t && !SKIP.includes(t))
    expect(titles.length).toBeGreaterThan(20)
    for (const title of titles) {
      await appButtons(page).getByText(title, { exact: true }).click()
      const view = isMobile(page) ? page.locator('main') : page.getByRole('dialog', { name: title })
      await expect(view).toBeVisible()
      await page.waitForTimeout(300)
      await expect(view.getByText(`${title} liep vast.`)).toHaveCount(0)
      await check(title)
      if (isMobile(page)) await page.getByRole('button', { name: 'Terug', exact: true }).click()
      else await view.getByRole('button', { name: 'Sluiten' }).click()
    }
    expect(errors).toEqual([])
    expect(report).toEqual([])
  })
}
