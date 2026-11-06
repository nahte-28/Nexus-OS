import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Calculator } from './Calculator'

describe('Rekenmachine', () => {
  afterEach(() => {
    cleanup()
    localStorage.removeItem('nexus.calculator')
  })

  it('works out a sum from the keys and keeps it in the history', () => {
    render(<Calculator />)
    for (const k of ['7', '+', '5', '×', '2']) fireEvent.click(screen.getByRole('button', { name: k }))
    expect(screen.getByText('= 17')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Is gelijk aan' }))
    expect((screen.getByLabelText('Berekening') as HTMLInputElement).value).toBe('17')
    expect(screen.getByText('7+5×2 =')).toBeTruthy()
    expect(JSON.parse(localStorage.getItem('nexus.calculator')!)).toEqual([{ input: '7+5×2', result: '17' }])
  })

  it('says what is wrong when you press enter', () => {
    render(<Calculator />)
    const input = screen.getByLabelText('Berekening')
    fireEvent.change(input, { target: { value: '8 / 0' } })
    fireEvent.submit(input.closest('form')!)
    expect(screen.getByRole('alert').textContent).toBe('Delen door nul kan niet.')
  })
})
