import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { emptySpaces, liveSpaces } from '@nexus/core'
import { useEffect } from 'react'
import { preloadApps } from './registry'
import { Spaces } from './Spaces'
import { spacesStore, setCurrentSpace } from '../spaces/store'
import { useWindows, WindowsProvider } from '../state/WindowsContext'

/** Opens Notities and Agenda, as if someone had arranged their desktop. */
function Opened({ children }: { children: React.ReactNode }) {
  const { state, dispatch } = useWindows()
  useEffect(() => {
    dispatch({ type: 'open', appId: 'notes', title: 'Notities', rect: { x: 0, y: 0, width: 400, height: 300 } })
    dispatch({ type: 'open', appId: 'agenda', title: 'Agenda', rect: { x: 420, y: 0, width: 400, height: 300 } })
  }, [dispatch])
  return (
    <>
      <p data-testid="open">{state.windows.map((w) => w.appId).join(',')}</p>
      {children}
    </>
  )
}

const renderSpaces = () =>
  render(
    <WindowsProvider>
      <Opened>
        <Spaces />
      </Opened>
    </WindowsProvider>,
  )

describe('Spaces', () => {
  beforeAll(preloadApps)
  beforeEach(() => {
    spacesStore.adopt(emptySpaces())
    setCurrentSpace(null)
    localStorage.clear()
  })
  afterEach(cleanup)

  it('saves the open windows as a Space and opens it again later', () => {
    renderSpaces()
    fireEvent.change(screen.getByRole('textbox', { name: 'Naam van de nieuwe Space' }), { target: { value: 'Blok' } })
    fireEvent.click(screen.getByRole('button', { name: 'Huidige vensters bewaren als Space' }))
    const [space] = liveSpaces(spacesStore.getSnapshot())
    expect(space).toMatchObject({ name: 'Blok', profileId: expect.any(String) })
    expect(space.windows.map((w) => w.appId)).toEqual(['notes', 'agenda'])
    expect(screen.getByText('Notities, Agenda')).toBeTruthy()
  })

  it('starts from a template, which opens its apps side by side', () => {
    renderSpaces()
    fireEvent.click(screen.getByRole('tab', { name: 'Templates' }))
    const card = screen.getByText(/Studie, Leerkaarten en Agenda/).closest('li')!
    fireEvent.click(within(card).getByRole('button', { name: 'Gebruiken' }))
    expect(screen.getByTestId('open').textContent).toBe('study,flashcards,agenda')
    expect(liveSpaces(spacesStore.getSnapshot())[0].name).toBe('Examens')
  })

  it('keeps a changed layout as a draft until it is saved', () => {
    renderSpaces()
    fireEvent.click(screen.getByRole('button', { name: 'Huidige vensters bewaren als Space' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Indeling' }))
    expect(screen.getByText(/Je vensters staan zoals bewaard/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Netjes naast elkaar zetten' }))
    expect(screen.getByText(/zijn veranderd/)).toBeTruthy()
    const before = liveSpaces(spacesStore.getSnapshot())[0].version
    fireEvent.click(screen.getByRole('button', { name: 'Indeling bewaren' }))
    expect(liveSpaces(spacesStore.getSnapshot())[0].version).toBe(before + 1)
    expect(screen.getByText(/Je vensters staan zoals bewaard/)).toBeTruthy()
  })

  it('archives, restores and deletes only after a confirmation', () => {
    renderSpaces()
    fireEvent.click(screen.getByRole('button', { name: 'Huidige vensters bewaren als Space' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archiveren' }))
    expect(screen.getByText('Gearchiveerd (1)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Terugzetten' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verwijderen' }))
    expect(liveSpaces(spacesStore.getSnapshot())).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Ja, verwijderen' }))
    expect(liveSpaces(spacesStore.getSnapshot())).toHaveLength(0)
  })

  it('remembers the tab', () => {
    renderSpaces()
    fireEvent.click(screen.getByRole('tab', { name: 'Regels' }))
    cleanup()
    renderSpaces()
    expect(screen.getByRole('tab', { name: 'Regels' }).getAttribute('aria-selected')).toBe('true')
  })
})
