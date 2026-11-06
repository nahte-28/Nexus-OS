import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Weather } from './Weather'
import { weatherStore } from '../weather/store'

const FORECAST = {
  timezone: 'Europe/Brussels',
  current: { time: 1_794_000_000, temperature_2m: 11.6, apparent_temperature: 9.2, weather_code: 61, wind_speed_10m: 18, precipitation: 0.4, is_day: 1 },
  hourly: { time: [1_794_000_000], temperature_2m: [11.6], precipitation_probability: [60], weather_code: [61] },
  daily: { time: [1_793_955_600], weather_code: [61], temperature_2m_max: [13.8], temperature_2m_min: [7.6], precipitation_probability_max: [70], sunrise: [1_793_983_000], sunset: [1_794_016_000] },
}

describe('Weer', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    weatherStore.update(() => ({ places: [], selected: 0, cache: {}, inDagstart: true }))
  })

  it('finds a place and shows its forecast', async () => {
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { q?: string }
      const data = body.q ? { results: [{ name: 'Antwerpen', latitude: 51.22, longitude: 4.4, admin1: 'Vlaanderen', country: 'België' }] } : FORECAST
      return new Response(JSON.stringify(data), { status: 200 })
    })
    vi.stubGlobal('fetch', fetch)
    render(<Weather />)
    fireEvent.change(screen.getByLabelText('Plaats zoeken'), { target: { value: 'Antwerpen' } })
    fireEvent.click(screen.getByRole('button', { name: 'Zoeken' }))
    fireEvent.click(await screen.findByRole('button', { name: /Antwerpen/ }))
    expect(await screen.findByText('Lichte regen · voelt als 9°')).toBeTruthy()
    expect(screen.getByText('Neem een paraplu mee.')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Antwerpen' })).toBeTruthy()
    expect(fetch).toHaveBeenLastCalledWith('/api/weather', expect.objectContaining({ body: JSON.stringify({ lat: 51.22, lon: 4.4 }) }))
    expect(weatherStore.getSnapshot().cache['51.22,4.40'].forecast.now.temp).toBe(11.6)
  })
})
