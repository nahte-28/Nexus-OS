import { expect, test, type Page } from '@playwright/test'
import { startWithEverything, trackErrors } from './helpers'

// Spaces and windows are the computer's layout; the phone shows one app at a time.
test.skip(({ isMobile }) => isMobile, 'Vensters en Spaces zijn voor de computer')

const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Apps' })
const open = async (page: Page, title: string) => {
  await sidebar(page).getByRole('button', { name: title, exact: true }).click()
  const win = page.getByRole('dialog', { name: title })
  await expect(win).toBeVisible()
  return win
}
const close = (page: Page, title: string) => page.getByRole('dialog', { name: title }).getByRole('button', { name: 'Sluiten' }).click()
const chooseProfile = async (page: Page, name: string) => {
  const win = await open(page, 'Profielen')
  await win.getByRole('list', { name: 'Profielen kiezen' }).getByRole('button', { name: new RegExp(name) }).click()
  await close(page, 'Profielen')
}

test('School profile, Space, flow and Inbox work together', async ({ page }) => {
  const errors = trackErrors(page)
  await startWithEverything(page)

  // A School Space with Agenda and Notities.
  await chooseProfile(page, 'School')
  await open(page, 'Agenda')
  await open(page, 'Notities')
  const spaces = await open(page, 'Spaces')
  await spaces.getByRole('textbox', { name: 'Naam van de nieuwe Space' }).fill('Lessen')
  await spaces.getByRole('button', { name: 'Huidige vensters bewaren als Space' }).click()
  for (const t of ['Spaces', 'Notities', 'Agenda']) await close(page, t)

  // Another profile, then a flow that turns School Mode on.
  await chooseProfile(page, 'Persoonlijk')
  const studio = await open(page, 'Flow Studio')
  await studio.getByRole('tab', { name: 'Sjablonen' }).click()
  await studio.getByRole('list', { name: 'Sjablonen' }).getByRole('listitem').filter({ hasText: 'Studiesessie' }).getByRole('button', { name: 'Gebruiken' }).click()
  await studio.getByRole('button', { name: 'Bewaren' }).click()
  await studio.getByRole('tab', { name: 'Mijn flows' }).click()
  await studio.getByRole('list', { name: 'Flows' }).getByRole('listitem').filter({ hasText: 'Studiesessie' }).getByRole('button', { name: 'Uitvoeren' }).click()
  await close(page, 'Flow Studio')

  // School Mode offers the School Space; opening it brings the windows back.
  const offer = page.getByRole('status').filter({ hasText: 'Lessen openen?' })
  await expect(offer).toBeVisible()
  await offer.getByRole('button', { name: 'Openen' }).click()
  await expect(page.getByRole('dialog', { name: 'Agenda' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Notities' })).toBeVisible()

  // The flow's run is in the Inbox.
  const inbox = await open(page, 'Inbox')
  await expect(inbox.getByText('Flow Studiesessie is uitgevoerd')).toBeVisible()
  expect(errors).toEqual([])
})

test('Time Machine shows the change, restores and can undo the restore', async ({ page }) => {
  const errors = trackErrors(page)
  await startWithEverything(page)
  let tm = await open(page, 'Time Machine')
  await tm.getByRole('tab', { name: 'Herstelpunten' }).click()
  await tm.getByLabel('Naam van het herstelpunt').fill('Voor de proef')
  await tm.getByRole('button', { name: 'Herstelpunt maken' }).click()
  await close(page, 'Time Machine')

  // A change: a School Space.
  const spaces = await open(page, 'Spaces')
  await spaces.getByRole('textbox', { name: 'Naam van de nieuwe Space' }).fill('Weg ermee')
  await spaces.getByRole('button', { name: 'Huidige vensters bewaren als Space' }).click()
  await close(page, 'Spaces')

  tm = await open(page, 'Time Machine')
  await tm.getByRole('tab', { name: 'Herstelpunten' }).click()
  await tm.getByRole('listitem').filter({ hasText: 'Voor de proef' }).getByRole('button', { name: 'Bekijken en herstellen' }).click()
  await expect(tm.getByText(/Weg ermee/).first()).toBeVisible()
  await tm.getByRole('button', { name: 'Herstellen', exact: true }).click()
  await expect(tm.getByRole('status')).toContainText('Hersteld')
  await close(page, 'Time Machine')
  let check = await open(page, 'Spaces')
  await expect(check.getByText('Weg ermee')).toHaveCount(0)
  await close(page, 'Spaces')

  // The point taken just before the restore brings the Space back.
  tm = await open(page, 'Time Machine')
  await tm.getByRole('tab', { name: 'Herstelpunten' }).click()
  await tm.getByRole('listitem').filter({ hasText: /voor herstel/i }).first().getByRole('button', { name: 'Bekijken en herstellen' }).click()
  await tm.getByRole('button', { name: 'Herstellen', exact: true }).click()
  await expect(tm.getByRole('status')).toContainText('Hersteld')
  await close(page, 'Time Machine')
  check = await open(page, 'Spaces')
  await expect(check.getByText('Weg ermee').first()).toBeVisible()
  expect(errors).toEqual([])
})
