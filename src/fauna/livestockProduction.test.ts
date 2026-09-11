import { describe, expect, it } from 'vitest'
import { ANIMAL_DEFS } from './AnimalAgent'
import {
  initialLivestockProductionReadyAtDays,
  livestockProductionReady,
  nextLivestockProductionReadyAtDays,
  WOOL_GROWTH_DAYS,
  WOOL_YIELD,
} from './livestockProduction'

describe('livestockProductionReady (plan fauna-002)', () => {
  it('is never ready before the first real tick (null anchor)', () => {
    expect(livestockProductionReady(null, 0)).toBe(false)
    expect(livestockProductionReady(null, 1000)).toBe(false)
  })

  it('is not ready before the anchor day', () => {
    expect(livestockProductionReady(5, 4.9)).toBe(false)
  })

  it('is ready exactly on and after the anchor day', () => {
    expect(livestockProductionReady(5, 5)).toBe(true)
    expect(livestockProductionReady(5, 5.1)).toBe(true)
  })

  it('resolves correctly after an arbitrarily long unloaded interval — no accumulation, just one comparison', () => {
    // A settlement unloaded for 40 in-game days then reloaded: the very
    // first fresh `nowDays` this animal sees already resolves readiness
    // correctly, with no per-frame catch-up loop needed.
    expect(livestockProductionReady(10, 50)).toBe(true)
  })
})

describe('nextLivestockProductionReadyAtDays (plan fauna-002)', () => {
  it('anchors the next cycle a fixed interval after the current moment', () => {
    expect(nextLivestockProductionReadyAtDays(12, 0.5)).toBe(12.5)
  })

  it('a late collection does not shorten the next wait — always a full interval from *now*', () => {
    // Collected 3 days late (nowDays=15 instead of an earlier day) — the
    // next cycle still starts counting from the actual collection moment.
    expect(nextLivestockProductionReadyAtDays(15, 1)).toBe(16)
  })
})

describe('initialLivestockProductionReadyAtDays (plan fauna-002)', () => {
  it('never exceeds one full interval past nowDays (bounded stagger)', () => {
    expect(initialLivestockProductionReadyAtDays(0, 1, 0)).toBe(0)
    expect(initialLivestockProductionReadyAtDays(0, 1, 1)).toBe(1)
    expect(initialLivestockProductionReadyAtDays(0, 1, 0.5)).toBe(0.5)
  })

  it('offsets from whatever nowDays already is, not always from zero', () => {
    expect(initialLivestockProductionReadyAtDays(20, 0.5, 0.5)).toBe(20.25)
  })
})

describe('ANIMAL_DEFS livestock production config (plan fauna-002 §5/§10/§14 verification)', () => {
  it('chicken lays 1 egg per cycle, no wild kind has a production config', () => {
    expect(ANIMAL_DEFS.chicken.production).toEqual({ product: 'egg', amount: 1, intervalDays: 1 })
    expect(ANIMAL_DEFS.wolf.production).toBeUndefined()
    expect(ANIMAL_DEFS.deer.production).toBeUndefined()
    expect(ANIMAL_DEFS.horse.production).toBeUndefined()
  })

  it('cow produces 5 l of milk, sheep 2 l', () => {
    expect(ANIMAL_DEFS.cow.production).toMatchObject({ product: 'milk', amount: 5 })
    expect(ANIMAL_DEFS.sheep.production).toMatchObject({ product: 'milk', amount: 2 })
  })

  it('sheep milking cooldown is shorter than cow, matching their yield difference', () => {
    expect(ANIMAL_DEFS.sheep.production?.intervalDays).toBeLessThan(ANIMAL_DEFS.cow.production!.intervalDays)
  })
})

describe('wool cycle (plan fauna-004)', () => {
  it('uses a 24-day growth cycle and yields 4 wool', () => {
    expect(WOOL_GROWTH_DAYS).toBe(24)
    expect(WOOL_YIELD).toBe(4)
  })

  it('is not ready before 24 days, and is ready exactly on and after the anchor', () => {
    expect(livestockProductionReady(24, 23.9)).toBe(false)
    expect(livestockProductionReady(24, 24)).toBe(true)
    expect(livestockProductionReady(24, 24.1)).toBe(true)
  })

  it('staggers the first fleece across one growth cycle', () => {
    expect(initialLivestockProductionReadyAtDays(0, WOOL_GROWTH_DAYS, 0)).toBe(0)
    expect(initialLivestockProductionReadyAtDays(0, WOOL_GROWTH_DAYS, 1)).toBe(24)
    expect(initialLivestockProductionReadyAtDays(10, WOOL_GROWTH_DAYS, 0.5)).toBe(22)
  })

  it('resets the next fleece a full 24 days after a successful shear, not from the old anchor', () => {
    expect(nextLivestockProductionReadyAtDays(30, WOOL_GROWTH_DAYS)).toBe(54)
  })

  it('a long time skip still represents one ready fleece, not catch-up yield', () => {
    expect(livestockProductionReady(24, 100)).toBe(true)
    expect(WOOL_YIELD).toBe(4)
  })

  it('does not change milk/egg production intervals', () => {
    expect(ANIMAL_DEFS.sheep.production).toMatchObject({ product: 'milk', amount: 2, intervalDays: 0.35 })
    expect(ANIMAL_DEFS.chicken.production).toMatchObject({ product: 'egg', amount: 1, intervalDays: 1 })
  })
})
