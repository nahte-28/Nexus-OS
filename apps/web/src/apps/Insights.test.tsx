import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

const { Insights } = await import('./Insights')

describe('Inzichten', () => {
  afterEach(cleanup)

  it('shows this week, the charts and a table', () => {
    render(<Insights />)
    const week = screen.getByRole('region', { name: 'Deze week' })
    expect(within(week).getByText('Focustijd deze week')).toBeTruthy()
    expect(screen.getAllByRole('img')).toHaveLength(3)
    expect(screen.getByRole('img', { name: /^Focustijd per week: wk \d+/ })).toBeTruthy()
    fireEvent.click(screen.getByText('Als tabel'))
    expect(screen.getAllByRole('row')).toHaveLength(9)
  })
})
