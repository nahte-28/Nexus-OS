import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

localStorage.setItem('nexus.apps.recent', JSON.stringify(['notes', 'grades', 'nope']))
const { StartMenu } = await import('./StartMenu')
const { favoritesStore } = await import('../controlcenter/store')

const menu = (props: Partial<Parameters<typeof StartMenu>[0]> = {}) => {
  const onOpenApp = vi.fn()
  const onSearch = vi.fn()
  const onClose = vi.fn()
  render(<StartMenu onClose={onClose} onOpenApp={onOpenApp} onSearch={onSearch} {...props} />)
  return { onOpenApp, onSearch, onClose }
}

afterEach(cleanup)

describe('Start 2.0', () => {
  it('toont je favorieten, wat je recent opende en alle apps', () => {
    for (const id of favoritesStore.getSnapshot()) favoritesStore.toggle(id)
    favoritesStore.toggle('notes')
    const { onOpenApp } = menu()
    expect(screen.getByRole('menuitem', { name: 'Notities (favoriet)' })).toBeTruthy()
    // Notities is a favourite already, so Recent only shows Cijfers.
    expect(screen.queryByRole('menuitem', { name: 'Notities (recent)' })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cijfers (recent)' }))
    expect(onOpenApp).toHaveBeenCalledWith('grades')
    const all = within(screen.getByRole('group', { name: 'Alle apps' }))
    expect(all.getByRole('menuitem', { name: 'Agenda' })).toBeTruthy()
  })

  it('zoekt in apps, opent de eerste met Enter en gaat door naar Zoeken overal', () => {
    const { onOpenApp, onSearch, onClose } = menu()
    const box = screen.getByRole('textbox', { name: 'Zoek apps' })
    fireEvent.change(box, { target: { value: 'cijf' } })
    expect(screen.queryByRole('group', { name: 'Alle apps' })).toBeNull()
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onOpenApp).toHaveBeenCalledWith('grades')
    fireEvent.click(screen.getByRole('menuitem', { name: /Zoek overal naar “cijf”/ }))
    expect(onSearch).toHaveBeenCalledWith('cijf')
    expect(onClose).toHaveBeenCalled()
  })

  it('stuurt een zoekterm zonder app-resultaat met Enter naar Zoeken overal', () => {
    const { onSearch } = menu()
    const box = screen.getByRole('textbox', { name: 'Zoek apps' })
    fireEvent.change(box, { target: { value: 'wiskunde hoofdstuk 3' } })
    expect(screen.getByText(/Geen apps met/)).toBeTruthy()
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onSearch).toHaveBeenCalledWith('wiskunde hoofdstuk 3')
  })

  it('loopt met de pijltjes door de items en terug naar het zoekveld', () => {
    menu()
    const box = screen.getByRole('textbox', { name: 'Zoek apps' })
    fireEvent.change(box, { target: { value: 'not' } })
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    expect(document.activeElement?.textContent).toContain('Notities')
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(box)
  })
})
