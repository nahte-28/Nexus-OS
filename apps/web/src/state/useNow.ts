import { useEffect, useState } from 'react'

/** The current time, refreshed every [ms] so views that depend on it move along. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

/** How long until the clock shows the next minute. */
export function msToNextMinute(now: number): number {
  return 60_000 - (now % 60_000)
}

/**
 * The current time for a clock that shows hours and minutes: it changes exactly when the minute
 * changes, not up to a minute later. Coming back to NEXUS (another tab, a computer that slept)
 * catches up at once, because the browser slows timers down in the background.
 */
export function useMinute(): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const t = Date.now()
      setNow(t)
      clearTimeout(timer)
      // A few ms past the boundary, so the new minute is surely there.
      timer = setTimeout(tick, msToNextMinute(t) + 20)
    }
    const onShow = () => {
      if (document.visibilityState === 'visible') tick()
    }
    tick()
    document.addEventListener('visibilitychange', onShow)
    window.addEventListener('focus', onShow)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onShow)
      window.removeEventListener('focus', onShow)
    }
  }, [])
  return now
}
