import { describe, expect, it } from 'vitest'
import { type TimerState, alarmTitle, zoneDayLabel, formatDuration, isAlarmTitle, lap, lapTimes, nextAlarmAt, offsetLabel, pauseStopwatch, pauseCountdown, startStopwatch, startCountdown, stopwatchElapsed, timeIn, timerLeft } from './clock'

describe('klok', () => {
  const winter = Date.UTC(2026, 0, 15, 12, 0)
  it('shows the world clock', () => {
    expect(timeIn('Europe/Brussels', winter)).toBe('13:00')
    expect(timeIn('Asia/Kolkata', winter)).toBe('17:30')
    expect(offsetLabel('America/New_York', 'Europe/Brussels', winter)).toBe('−6 u')
    expect(offsetLabel('Asia/Kolkata', 'Europe/Brussels', winter)).toBe('+4 u 30')
    expect(offsetLabel('Europe/Brussels', 'Europe/Brussels', winter)).toBe('zelfde tijd')
    const late = Date.UTC(2026, 0, 15, 22, 30)
    expect(zoneDayLabel('Asia/Tokyo', 'Europe/Brussels', late)).toBe('morgen')
    expect(zoneDayLabel('America/Los_Angeles', 'Europe/Brussels', Date.UTC(2026, 0, 15, 0, 30))).toBe('gisteren')
  })

  it('formats durations', () => {
    expect(formatDuration(65_000)).toBe('1:05')
    expect(formatDuration(3_723_400, true)).toBe('1:02:03,4')
    expect(formatDuration(-5)).toBe('0:00')
  })

  it('runs a timer across pauses', () => {
    let t: TimerState = { duration: 60_000, endsAt: null, pausedLeft: null }
    t = startCountdown(t, 1000)
    expect(timerLeft(t, 21_000)).toBe(40_000)
    t = pauseCountdown(t, 21_000)
    expect(timerLeft(t, 99_000)).toBe(40_000)
    t = startCountdown(t, 100_000)
    expect(timerLeft(t, 200_000)).toBe(0)
  })

  it('counts a stopwatch with laps', () => {
    let s = startStopwatch({ startedAt: null, elapsed: 0, laps: [] }, 0)
    s = lap(s, 10_000)
    s = pauseStopwatch(s, 15_000)
    s = startStopwatch(s, 50_000)
    s = lap(s, 52_000)
    expect(stopwatchElapsed(s, 60_000)).toBe(25_000)
    expect(lapTimes(s.laps)).toEqual([10_000, 7_000])
  })

  it('names and schedules alarms', () => {
    expect(alarmTitle(' Opstaan ')).toBe('Wekker: Opstaan')
    expect(alarmTitle('')).toBe('Wekker')
    expect(isAlarmTitle('Wekker: Opstaan')).toBe(true)
    expect(isAlarmTitle('Wekkerradio kopen')).toBe(false)
    const now = new Date(2026, 10, 6, 8, 0).getTime()
    expect(nextAlarmAt('07:30', now)).toBe(new Date(2026, 10, 7, 7, 30).getTime())
    expect(nextAlarmAt('9:15', now)).toBe(new Date(2026, 10, 6, 9, 15).getTime())
    expect(nextAlarmAt('25:00', now)).toBeNull()
  })
})
