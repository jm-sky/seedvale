import { describe, expect, it } from 'vitest'
import { formatWorldDayClock } from './dayNight'

describe('formatWorldDayClock', () => {
  it('labels the first world day as Dzień 1', () => {
    expect(formatWorldDayClock(0, 0.32)).toBe('Dzień 1 · 07:40')
    expect(formatWorldDayClock(0.99, 0)).toBe('Dzień 1 · 00:00')
  })

  it('uses elapsedDays plus one for later days', () => {
    expect(formatWorldDayClock(1, 0.5)).toBe('Dzień 2 · 12:00')
    expect(formatWorldDayClock(4.2, 0.75)).toBe('Dzień 5 · 18:00')
  })
})
