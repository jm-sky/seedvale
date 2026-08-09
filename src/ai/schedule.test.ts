import { describe, expect, it } from 'vitest'
import { activityAt, hourToTimeOfDay, nextBoundary, SCHEDULE_TEMPLATES } from './schedule'

describe('schedule', () => {
  it('hourToTimeOfDay matches the documented dayNight mapping', () => {
    expect(hourToTimeOfDay(0)).toBe(0)
    expect(hourToTimeOfDay(12)).toBe(0.5)
    expect(hourToTimeOfDay(18)).toBe(0.75)
    expect(hourToTimeOfDay(7)).toBeCloseTo(0.2917, 3)
  })

  it('has a template for every role', () => {
    for (const role of ['woodcutter', 'farmer', 'guard', 'trader', 'miner', 'fisher'] as const) {
      expect(SCHEDULE_TEMPLATES[role].length).toBeGreaterThan(0)
    }
  })

  it('activityAt resolves the most recently started entry, in-order template', () => {
    const template = SCHEDULE_TEMPLATES.woodcutter
    expect(activityAt(template, hourToTimeOfDay(8))).toBe('work')
    expect(activityAt(template, hourToTimeOfDay(12.5))).toBe('eat')
    expect(activityAt(template, hourToTimeOfDay(20))).toBe('home')
  })

  it('activityAt wraps across midnight for a schedule that starts late (guard)', () => {
    const template = SCHEDULE_TEMPLATES.guard
    // 18:00 work -> still work at 23:00, wraps to 'eat' just after 00:00
    expect(activityAt(template, hourToTimeOfDay(23))).toBe('work')
    expect(activityAt(template, hourToTimeOfDay(0.5))).toBe('eat')
    expect(activityAt(template, hourToTimeOfDay(7))).toBe('home')
  })

  it('falls back to "home" for an empty template', () => {
    expect(activityAt([], 0.5)).toBe('home')
  })

  it('nextBoundary finds the soonest upcoming entry, in-order template', () => {
    const template = SCHEDULE_TEMPLATES.woodcutter
    expect(nextBoundary(template, hourToTimeOfDay(8))?.hour).toBe(12)
    expect(nextBoundary(template, hourToTimeOfDay(20))?.hour).toBe(22)
  })

  it('nextBoundary wraps across midnight for a schedule that starts late (guard)', () => {
    const template = SCHEDULE_TEMPLATES.guard
    expect(nextBoundary(template, hourToTimeOfDay(23))?.hour).toBe(0)
    expect(nextBoundary(template, hourToTimeOfDay(7.5))?.hour).toBe(8)
  })

  it('nextBoundary returns null for an empty template', () => {
    expect(nextBoundary([], 0.5)).toBeNull()
  })
})
