import { describe, expect, it } from 'vitest'
import type { Role, Trait } from './characters'
import {
  activityAt,
  effectiveScheduleFor,
  FAST_WORKER_WORK_EXTEND_HOURS,
  hourToTimeOfDay,
  idleIntentFor,
  nextBoundary,
  NIGHT_OWL_SHIFT_HOURS,
  SCHEDULE_TEMPLATES,
  type ScheduleActivity,
  type ScheduleTemplate,
  SOCIABLE_SOCIAL_HOURS,
} from './schedule'

const ROLES: readonly Role[] = ['woodcutter', 'farmer', 'guard', 'trader', 'miner', 'fisher', 'hunter', 'blacksmith']

function hoursOf(activity: ScheduleActivity, template: ScheduleTemplate): number[] {
  return template.filter((entry) => entry.activity === activity).map((entry) => entry.hour)
}

function snapshotTemplates(): Record<Role, { hour: number, activity: ScheduleActivity }[]> {
  const snapshot = {} as Record<Role, { hour: number, activity: ScheduleActivity }[]>
  for (const role of ROLES) {
    snapshot[role] = SCHEDULE_TEMPLATES[role].map((entry) => ({ ...entry }))
  }
  return snapshot
}

function expectValidSchedule(template: ScheduleTemplate): void {
  expect(template.length).toBeGreaterThan(0)
  const hours = template.map((entry) => entry.hour)
  for (const hour of hours) {
    expect(hour).toBeGreaterThanOrEqual(0)
    expect(hour).toBeLessThan(24)
  }
  const unique = new Set(hours.map((hour) => hour.toFixed(6)))
  expect(unique.size).toBe(hours.length)
  for (const hour of [0, 6, 12, 18, 23.5]) {
    expect(activityAt(template, hourToTimeOfDay(hour))).toBeTruthy()
    expect(nextBoundary(template, hourToTimeOfDay(hour))).not.toBeNull()
  }
}

describe('schedule', () => {
  it('hourToTimeOfDay matches the documented dayNight mapping', () => {
    expect(hourToTimeOfDay(0)).toBe(0)
    expect(hourToTimeOfDay(12)).toBe(0.5)
    expect(hourToTimeOfDay(18)).toBe(0.75)
    expect(hourToTimeOfDay(7)).toBeCloseTo(0.2917, 3)
  })

  it('has a template for every role', () => {
    for (const role of ROLES) {
      expect(SCHEDULE_TEMPLATES[role].length).toBeGreaterThan(0)
    }
  })

  it('gives the trader a realistic day with a long stall block and a short evening at home', () => {
    const template = SCHEDULE_TEMPLATES.trader
    expect(activityAt(template, hourToTimeOfDay(8))).toBe('work')
    expect(activityAt(template, hourToTimeOfDay(13.5))).toBe('eat')
    expect(activityAt(template, hourToTimeOfDay(14))).toBe('work')
    expect(activityAt(template, hourToTimeOfDay(20))).toBe('work')
    expect(activityAt(template, hourToTimeOfDay(21.5))).toBe('home')
    expect(activityAt(template, hourToTimeOfDay(23.5))).toBe('sleep')
    expect(hoursOf('home', template)[0]).toBe(21)
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

describe('effectiveScheduleFor', () => {
  it('equals the base template when no overlay traits apply', () => {
    expect(effectiveScheduleFor(SCHEDULE_TEMPLATES.woodcutter, [])).toEqual(
      SCHEDULE_TEMPLATES.woodcutter,
    )
    expect(effectiveScheduleFor(SCHEDULE_TEMPLATES.guard, ['energetic'])).toEqual(
      SCHEDULE_TEMPLATES.guard,
    )
  })

  it('never mutates SCHEDULE_TEMPLATES', () => {
    const before = snapshotTemplates()
    for (const role of ROLES) {
      effectiveScheduleFor(
        SCHEDULE_TEMPLATES[role],
        ['fast_worker', 'night_owl', 'sociable'],
        { hasSocialPlace: true },
      )
    }
    expect(SCHEDULE_TEMPLATES).toEqual(before)
  })

  it('shifts every night_owl entry later by NIGHT_OWL_SHIFT_HOURS, wrapping midnight', () => {
    const base = SCHEDULE_TEMPLATES.woodcutter
    const owl = effectiveScheduleFor(base, ['night_owl'])
    expect(owl.map((entry) => entry.activity)).toEqual(base.map((entry) => entry.activity))
    for (let i = 0; i < base.length; i++) {
      expect(owl[i]!.hour).toBeCloseTo((base[i]!.hour + NIGHT_OWL_SHIFT_HOURS) % 24, 6)
    }
    // Base woodcutter sleeps at 22; night owl still at home then, sleeps after midnight.
    expect(activityAt(base, hourToTimeOfDay(22))).toBe('sleep')
    expect(activityAt(owl, hourToTimeOfDay(22))).toBe('home')
    expect(activityAt(owl, hourToTimeOfDay(0.5))).toBe('sleep')
    expect(activityAt(owl, hourToTimeOfDay(8))).toBe('wake')
  })

  it('keeps the guard night_owl schedule valid across midnight', () => {
    const owl = effectiveScheduleFor(SCHEDULE_TEMPLATES.guard, ['night_owl'])
    expectValidSchedule(owl)
    expect(activityAt(owl, hourToTimeOfDay(23))).toBe('work')
    expect(activityAt(owl, hourToTimeOfDay(2.5))).toBe('eat')
    expect(activityAt(owl, hourToTimeOfDay(9))).toBe('home')
    expect(activityAt(owl, hourToTimeOfDay(10))).toBe('sleep')
    expect(hoursOf('sleep', owl)[0]).toBeCloseTo(10, 6)
    expect(nextBoundary(owl, hourToTimeOfDay(23))?.hour).toBeCloseTo(2, 6)
  })

  it('extends fast_worker work into the following home block', () => {
    const base = SCHEDULE_TEMPLATES.woodcutter
    const busy = effectiveScheduleFor(base, ['fast_worker'])
    expect(hoursOf('home', busy)[0]).toBeCloseTo(
      hoursOf('home', base)[0]! + FAST_WORKER_WORK_EXTEND_HOURS,
      6,
    )
    expect(activityAt(busy, hourToTimeOfDay(18.5))).toBe('work')
    expect(activityAt(base, hourToTimeOfDay(18.5))).toBe('home')
    expect(activityAt(busy, hourToTimeOfDay(19.5))).toBe('home')
    // Per-action speed is NpcAgent's FAST_WORKER_WAIT_MULT — overlay only moves the block.
    expect(hoursOf('work', busy)).toEqual(hoursOf('work', base))
  })

  it('leaves sociable home unchanged when no social place exists', () => {
    const base = SCHEDULE_TEMPLATES.woodcutter
    expect(effectiveScheduleFor(base, ['sociable'])).toEqual(base)
    expect(effectiveScheduleFor(base, ['sociable'], { hasSocialPlace: false })).toEqual(base)
  })

  it('substitutes the start of home with social when a social place exists', () => {
    const base = SCHEDULE_TEMPLATES.woodcutter
    const social = effectiveScheduleFor(base, ['sociable'], { hasSocialPlace: true })
    expect(activityAt(social, hourToTimeOfDay(18))).toBe('social')
    expect(activityAt(social, hourToTimeOfDay(18 + SOCIABLE_SOCIAL_HOURS))).toBe('home')
    expect(activityAt(social, hourToTimeOfDay(21))).toBe('home')
    expect(hoursOf('sleep', social)).toEqual(hoursOf('sleep', base))
  })

  it('converts a short home block entirely to social when a social place exists', () => {
    const shortHome: ScheduleTemplate = [
      { hour: 6, activity: 'home' },
      { hour: 7.5, activity: 'sleep' },
    ]
    const social = effectiveScheduleFor(shortHome, ['sociable'], { hasSocialPlace: true })
    expect(hoursOf('social', social)).toEqual([6])
    expect(hoursOf('home', social)).toEqual([])
    expect(activityAt(social, hourToTimeOfDay(6.5))).toBe('social')
  })

  it('applies multiple traits deterministically without mutating the source', () => {
    const base = SCHEDULE_TEMPLATES.woodcutter
    const sourceCopy = base.map((entry) => ({ ...entry }))
    const traits: readonly Trait[] = ['fast_worker', 'night_owl', 'sociable']
    const first = effectiveScheduleFor(base, traits, { hasSocialPlace: true })
    const second = effectiveScheduleFor(base, traits, { hasSocialPlace: true })
    expect(first).toEqual(second)
    expect(base).toEqual(sourceCopy)
    expectValidSchedule(first)
    // fast_worker delays home, then night_owl shifts everything, then sociable splits home.
    const homeHour = hourToTimeOfDay(21)
    expect(activityAt(first, homeHour)).toBe('social')
    expect(activityAt(first, hourToTimeOfDay(23))).toBe('home')
    expect(activityAt(first, hourToTimeOfDay(0.5))).toBe('sleep')
  })

  it('produces a valid effective schedule for every role and overlay combo', () => {
    const combos: readonly (readonly Trait[])[] = [
      [],
      ['night_owl'],
      ['fast_worker'],
      ['sociable'],
      ['night_owl', 'fast_worker'],
      ['night_owl', 'sociable'],
      ['fast_worker', 'sociable'],
      ['fast_worker', 'night_owl', 'sociable', 'energetic'],
    ]
    for (const role of ROLES) {
      for (const traits of combos) {
        const derived = effectiveScheduleFor(SCHEDULE_TEMPLATES[role], traits, {
          hasSocialPlace: true,
        })
        expectValidSchedule(derived)
        expect(activityAt(derived, hourToTimeOfDay(0))).toBeTruthy()
        expect(nextBoundary(derived, hourToTimeOfDay(23.9))).not.toBeNull()
      }
    }
  })

  it('maps wake to a home idle intent and leaves other activities as-is', () => {
    expect(idleIntentFor('wake')).toBe('home')
    expect(idleIntentFor('eat')).toBe('eat')
    expect(idleIntentFor('home')).toBe('home')
    expect(idleIntentFor('sleep')).toBe('sleep')
    expect(idleIntentFor('work')).toBe('work')
    expect(idleIntentFor('social')).toBe('social')
  })
})
