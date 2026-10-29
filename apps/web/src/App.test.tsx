import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { defaultProfilesState } from '@nexus/core'
import { App } from './App'
import { preloadApps } from './apps/registry'
import { flowsStore } from './flows/store'
import { profilesStore } from './profiles/store'
import { getAll } from './state/db'
import { ThemeProvider } from './theme/ThemeContext'

function mockViewport(mobile: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: mobile,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

const renderApp = () =>
  render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  )

/** Profiles are only switched in the Profielen app. */
const chooseProfile = (name: string) => {
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Apps' })).getByRole('button', { name: 'Profielen' }))
  const dialog = screen.getByRole('dialog', { name: 'Profielen' })
  fireEvent.click(within(within(dialog).getByRole('list', { name: 'Profielen kiezen' })).getByRole('button', { name: new RegExp(`^${name}`) }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Sluiten' }))
}

describe('App shell', () => {
  // Apps load their code on first open; load it all up front so each test renders at once.
  beforeAll(preloadApps)

  beforeEach(() => {
    localStorage.clear()
    // Outside the schedule, so tests do not depend on the clock.
    profilesStore.update(() => ({ ...defaultProfilesState(), schedule: { ...defaultProfilesState().schedule, enabled: false } }))
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('opens a window from the start menu and closes it', () => {
    mockViewport(false)
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Notities' }))
    expect(screen.getByRole('dialog', { name: 'Notities' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sluiten' }))
    expect(screen.queryByRole('dialog', { name: 'Notities' })).toBeNull()
  })

  it('saves notes to the device database', async () => {
    mockViewport(false)
    renderApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'Notities' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Nieuw' }))
    fireEvent.change(screen.getByLabelText('Inhoud'), { target: { value: 'Hallo NEXUS' } })
    await waitFor(async () => {
      const stored = await getAll<{ body: string }>('notes')
      expect(stored.map((n) => n.body)).toContain('Hallo NEXUS')
    })
  })

  it('finds a note with Ctrl+K and opens it in Notities', () => {
    mockViewport(false)
    renderApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'Notities' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Nieuw' }))
    fireEvent.change(screen.getByLabelText('Inhoud'), { target: { value: 'Wiskunde examen\nhoofdstuk 4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Nieuw' }))
    fireEvent.change(screen.getByLabelText('Inhoud'), { target: { value: 'Boodschappen' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sluiten' }))

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    const box = screen.getByRole('combobox', { name: 'Zoek overal' })
    fireEvent.change(box, { target: { value: 'wiskunde hoofdstuk' } })
    expect(within(screen.getByRole('group', { name: 'Notities' })).getAllByRole('option').map((o) => o.textContent)).toEqual([
      expect.stringContaining('Wiskunde examen'),
    ])
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(screen.queryByRole('dialog', { name: 'Zoeken' })).toBeNull()
    expect((screen.getByLabelText('Inhoud') as HTMLTextAreaElement).value).toContain('Wiskunde examen')

    fireEvent.click(screen.getByRole('button', { name: 'Zoeken (Ctrl+K)' }))
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Zoek overal' }), { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Zoeken' })).toBeNull()
  })

  it('explains that sync is local-only until an account is connected', () => {
    mockViewport(false)
    renderApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'Account' })[0])
    expect(screen.getByText(/Synchronisatie is nog niet ingesteld/)).toBeTruthy()
  })

  it('explains that devices and notifications need an account', () => {
    mockViewport(false)
    renderApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'Apparaten' })[0])
    expect(screen.getByText(/werkt met een account/)).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Meldingen' })[0])
    expect(screen.getByText(/Koppel dit apparaat in Apparaten/)).toBeTruthy()
  })

  it('opens NEXUS AI and plans a reminder from the Herinneringen app', async () => {
    mockViewport(false)
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'NEXUS AI' }))
    expect(screen.getByText('Meld je eerst aan in de Account-app.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Herinneringen' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Titel' }), { target: { value: 'Verslag inleveren' } })
    fireEvent.click(screen.getByRole('button', { name: 'Plannen' }))
    await waitFor(() => expect(screen.getByRole('list', { name: 'Geplande herinneringen' }).textContent).toContain('Verslag inleveren'))
  })

  it('shows the Developer app only in developer mode', () => {
    mockViewport(false)
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(screen.queryByRole('menuitem', { name: 'Ontwikkelaar' })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Instellingen' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Ontwikkelaarsmodus/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ontwikkelaar' }))
    expect(screen.getByText(/NEXUS OS 1\.0/)).toBeTruthy()
  })

  it('switches theme and remembers it', () => {
    mockViewport(false)
    renderApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'Instellingen' })[0])
    fireEvent.click(screen.getByRole('radio', { name: /NEXUS Pulse/ }))
    expect(document.documentElement.dataset.theme).toBe('pulse')
    expect(localStorage.getItem('nexus.theme')).toBe('pulse')
  })

  it('shows the app grid on phones and opens apps full screen', () => {
    mockViewport(true)
    renderApp()
    const grid = screen.getByRole('list', { name: 'Apps' })
    expect(grid).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Over NEXUS' })[0])
    expect(screen.getByRole('button', { name: 'Terug' })).toBeTruthy()
    expect(screen.getByText(/^NEXUS OS v\d+\.\d+$/)).toBeTruthy()
  })

  it('switches profile, which changes the apps and the theme', () => {
    mockViewport(false)
    renderApp()
    const sidebar = screen.getByRole('navigation', { name: 'Apps' })
    expect(within(sidebar).getByRole('button', { name: 'Herinneringen' })).toBeTruthy()
    chooseProfile('Gaming')
    expect(within(sidebar).queryByRole('button', { name: 'Herinneringen' })).toBeNull()
    expect(within(sidebar).getByRole('button', { name: 'Profielen' })).toBeTruthy()
    expect(document.documentElement.dataset.theme).toBe('pulse')
    chooseProfile('Persoonlijk')
    expect(document.documentElement.dataset.theme).toBe('focus')
  })

  it('shows the next class from the timetable on the School dashboard', () => {
    mockViewport(false)
    renderApp()
    chooseProfile('School')
    expect(screen.getByText('School Workspace')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Apps' })).getByRole('button', { name: 'Profielen' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Lesrooster' }))
    fireEvent.change(screen.getByLabelText('Vak'), { target: { value: 'Wiskunde' } })
    fireEvent.click(screen.getByRole('button', { name: 'Les toevoegen' }))
    expect(screen.getByRole('list', { name: 'Lesrooster' }).textContent).toContain('Wiskunde')
    expect(screen.getByText('Volgende les').parentElement?.textContent).toContain('Wiskunde')
  })

  it('opens KlasHub as its own app from the sidebar', () => {
    mockViewport(false)
    const open = vi.fn()
    vi.stubGlobal('open', open)
    renderApp()
    chooseProfile('School')
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Apps' })).getByRole('button', { name: 'KlasHub' }))
    expect(open).toHaveBeenCalledWith('https://klashub.vercel.app', '_blank', 'noopener')
    expect(screen.queryByRole('dialog', { name: 'KlasHub' })).toBeNull()
  })

  const openProfiles = () => fireEvent.click(within(screen.getByRole('navigation', { name: 'Apps' })).getByRole('button', { name: 'Profielen' }))

  it('picks a profile for one hour from the Profielen app', () => {
    mockViewport(false)
    renderApp()
    openProfiles()
    fireEvent.change(screen.getByLabelText('Hoe lang geldt een keuze met de hand?'), { target: { value: 'hour' } })
    fireEvent.click(within(screen.getByRole('list', { name: 'Profielen kiezen' })).getByRole('button', { name: /Gaming/ }))
    const { override } = profilesStore.getSnapshot().state
    expect(override).toMatchObject({ profile: 'gaming', mode: 'until-time' })
    expect(screen.getByText(/Met de hand gekozen.*, tot \d\d:\d\d/)).toBeTruthy()
  })

  it('reorders apps and sets an accent colour per profile', () => {
    mockViewport(false)
    renderApp()
    chooseProfile('Persoonlijk')
    openProfiles()
    fireEvent.click(screen.getByRole('tab', { name: 'Apps & widgets' }))
    fireEvent.click(within(screen.getByRole('list', { name: 'Apps' })).getByRole('button', { name: 'Meldingen omhoog' }))
    const sidebar = within(screen.getByRole('navigation', { name: 'Apps' }))
      .getAllByRole('button')
      .map((b) => b.textContent)
    // (Ontwikkelaar may still show from the developer-mode test above.)
    expect(sidebar.filter((t) => t !== 'Ontwikkelaar').slice(0, 10)).toEqual(['Agenda', 'Notities', 'Bestanden', 'Studie', 'Cijfers', 'Gewoontes', 'Dagboek', 'Leerkaarten', 'Inzichten', 'Meldingen'])

    fireEvent.click(screen.getByRole('tab', { name: 'Uiterlijk' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Groen' }))
    expect(document.documentElement.style.getPropertyValue('--nx-accent')).toBe('#15803d')
    fireEvent.click(screen.getByRole('radio', { name: 'Van het thema' }))
    expect(document.documentElement.style.getPropertyValue('--nx-accent')).toBe('')
  })

  it('lets chosen apps through in a quiet profile', () => {
    mockViewport(false)
    renderApp()
    openProfiles()
    fireEvent.click(screen.getByRole('tab', { name: 'Meldingen' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Profiel' }), { target: { value: 'school' } })
    fireEvent.change(screen.getByLabelText('Naam van de app'), { target: { value: 'Smartschool' } })
    fireEvent.click(screen.getByRole('button', { name: 'Toevoegen' }))
    expect(profilesStore.getSnapshot().state.profiles.school.allowApps).toEqual(['Smartschool'])
    expect(screen.getByRole('list', { name: 'Altijd doorlaten' }).textContent).toContain('Smartschool')
  })

  it('builds a flow from a template in Flow Studio, with a dry run and a confirmed delete', () => {
    mockViewport(false)
    renderApp()
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Apps' })).getByRole('button', { name: 'Flow Studio' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Sjablonen' }))
    const template = within(screen.getByRole('list', { name: 'Sjablonen' })).getByText('School Start').closest('li')!
    fireEvent.click(within(template).getByRole('button', { name: 'Gebruiken' }))
    expect(screen.getByRole('complementary', { name: 'Proefrun' }).textContent).toContain('KlasHub te openen')
    fireEvent.change(screen.getByLabelText('Naam'), { target: { value: '' } })
    expect(screen.getByRole('alert').textContent).toBe('Geef de flow een naam.')
    fireEvent.click(screen.getByRole('button', { name: 'Ongedaan maken' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bewaren' }))
    expect(flowsStore.getSnapshot().flows.map((f) => f.name)).toContain('School Start')

    fireEvent.click(screen.getByRole('tab', { name: 'Mijn flows' }))
    const flows = within(screen.getByRole('list', { name: 'Flows' }))
    expect(flows.getByText('School Start')).toBeTruthy()
    fireEvent.click(flows.getAllByRole('button', { name: 'Verwijderen' })[0])
    fireEvent.click(flows.getByRole('button', { name: 'Ja, verwijderen' }))
    expect(flowsStore.getSnapshot().flows.map((f) => f.name)).not.toContain('School Start')
  })
})
