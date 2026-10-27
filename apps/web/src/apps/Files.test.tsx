import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const { Files } = await import('./Files')

describe('Bestanden', () => {
  afterEach(cleanup)

  it('adds a file, opens it and offers the AI summary', async () => {
    render(<Files />)
    const input = screen.getByLabelText('Bestanden toevoegen') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['Wet van Ohm'], 'Elektronica.txt', { type: 'text/plain' })] } })
    const list = await screen.findByRole('list', { name: 'Mijn bestanden' })
    expect(within(list).getByText('Elektronica.txt')).toBeTruthy()
    expect(within(list).getByText(/alleen hier/)).toBeTruthy()

    fireEvent.click(within(list).getByRole('button', { name: 'Openen' }))
    await waitFor(() => expect(screen.getByText('Wet van Ohm')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'AI-samenvatting' }))
    expect(screen.getByRole('button', { name: 'Samenvatting maken' })).toBeTruthy()
    expect((screen.getByRole('checkbox', { name: 'Feedback geven op deze samenvatting' }) as HTMLInputElement).checked).toBe(true)
  })

  it('offers the pdf app on a phone that cannot show a pdf inside NEXUS', async () => {
    Object.defineProperty(navigator, 'pdfViewerEnabled', { value: false, configurable: true })
    try {
      render(<Files />)
      const input = screen.getByLabelText('Bestanden toevoegen') as HTMLInputElement
      fireEvent.change(input, { target: { files: [new File(['%PDF-1.4'], 'Cursus.pdf', { type: 'application/pdf' })] } })
      const list = await screen.findByRole('list', { name: 'Mijn bestanden' })
      fireEvent.click(within((await within(list).findByText('Cursus.pdf')).closest('li') as HTMLElement).getByRole('button', { name: 'Openen' }))
      expect(await screen.findByRole('button', { name: 'Openen in pdf-app' })).toBeTruthy()
      expect(document.querySelector('iframe')).toBeNull()
    } finally {
      delete (navigator as { pdfViewerEnabled?: boolean }).pdfViewerEnabled
    }
  })

  it('explains when the browser cannot open folders', () => {
    render(<Files />)
    fireEvent.click(screen.getByRole('tab', { name: 'Op deze pc' }))
    expect(screen.getByText(/kan geen mappen van je computer openen/)).toBeTruthy()
  })
})
