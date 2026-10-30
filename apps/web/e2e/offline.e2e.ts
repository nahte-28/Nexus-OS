import { expect, test } from '@playwright/test'
import { appButtons, isMobile, startWithEverything, trackErrors } from './helpers'

test('starts without internet, says so and keeps a new note', async ({ page, context }) => {
  const errors = trackErrors(page)
  await startWithEverything(page)
  // The service worker keeps the app on the device; wait until it handles this page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }))
  })

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('status').filter({ hasText: 'Offline.' })).toBeVisible()

  await appButtons(page).getByText('Notities', { exact: true }).click()
  await page.getByRole('button', { name: 'Nieuw', exact: true }).click()
  await page.getByLabel('Inhoud').fill('Geschreven zonder internet')
  await page.waitForTimeout(500)

  await page.reload()
  await appButtons(page).getByText('Notities', { exact: true }).click()
  const view = isMobile(page) ? page.locator('main') : page.getByRole('dialog', { name: 'Notities' })
  await expect(view.getByText('Geschreven zonder internet').first()).toBeVisible()

  await context.setOffline(false)
  await expect(page.getByText('Offline.')).toHaveCount(0)
  expect(errors).toEqual([])
})
