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
    // The Launcher (Ctrl+K): its tabs, results and a command form.
    await page.keyboard.press('Control+k')
    const launcher = page.getByRole('dialog', { name: 'Launcher' })
    await expect(launcher).toBeVisible()
    await check('Launcher')
    await launcher.getByRole('combobox', { name: 'Zoek overal' }).fill('herinnering')
    await check('Launcher zoeken')
    await launcher.getByRole('option', { name: /Herinnering zetten/ }).click()
    await expect(launcher.getByRole('form', { name: 'Herinnering zetten' })).toBeVisible()
    await check('Launcher opdracht')
    await launcher.getByRole('button', { name: 'Sluiten' }).click()
    // Vault: the tabs Bestanden gets with the module on.
    await appButtons(page).getByText('Bestanden', { exact: true }).click()
    const files = isMobile(page) ? page.locator('main') : page.getByRole('dialog', { name: 'Bestanden' })
    for (const tab of ['Verzamelingen', 'Prullenbak', 'Deellinks']) {
      await files.getByRole('tab', { name: tab }).click()
      await check(`Bestanden ${tab}`)
    }
    if (isMobile(page)) await page.getByRole('button', { name: 'Terug', exact: true }).click()
    else await files.getByRole('button', { name: 'Sluiten' }).click()
    // Marketplace: a kind tab and the permission dialog of a widget.
    await appButtons(page).getByText('Marketplace', { exact: true }).click()
    const market = isMobile(page) ? page.locator('main') : page.getByRole('dialog', { name: 'Marketplace' })
    await market.getByRole('tab', { name: 'Widgets' }).click()
    await market.getByRole('button', { name: 'Installeren' }).first().click()
    await expect(market.getByRole('button', { name: 'Toestaan en installeren' })).toBeVisible()
    await check('Marketplace toestemming')
    await market.getByRole('button', { name: 'Annuleren' }).click()
    if (isMobile(page)) await page.getByRole('button', { name: 'Terug', exact: true }).click()
    else await market.getByRole('button', { name: 'Sluiten' }).click()
    // Offline-centrum: every tab.
    await appButtons(page).getByText('Offline-centrum', { exact: true }).click()
    const offline = isMobile(page) ? page.locator('main') : page.getByRole('dialog', { name: 'Offline-centrum' })
    for (const tab of ['Wachtrij', 'Samengevoegd', 'Geschiedenis', 'Per app']) {
      await offline.getByRole('tab', { name: tab }).click()
      await check(`Offline-centrum ${tab}`)
    }
    if (isMobile(page)) await page.getByRole('button', { name: 'Terug', exact: true }).click()
    else await offline.getByRole('button', { name: 'Sluiten' }).click()
    // Sentinel: every tab, not only the first.
    await appButtons(page).getByText('Sentinel', { exact: true }).click()
    const sentinel = isMobile(page) ? page.locator('main') : page.getByRole('dialog', { name: 'Sentinel' })
    for (const tab of ['Apparaten', 'Sessies', 'Toestemmingen', 'Activiteit']) {
      await sentinel.getByRole('tab', { name: tab }).click()
      await check(`Sentinel ${tab}`)
    }
    expect(errors).toEqual([])
    expect(report).toEqual([])
  })
}
