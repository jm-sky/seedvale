import { describe, expect, it } from 'vitest'
import { ANIMAL_DEFS, canHarvestMeatFrom, corpsePhaseFromElapsed, rotFxRelevant } from './AnimalAgent'
import { MAX_HP } from './faunaCombat'
import { createHarvestedRemains, createNaturalRemains } from './harvestedRemains'

describe('corpsePhaseFromElapsed (plan 188 — natural corpse decay)', () => {
  it('is fresh right after death', () => {
    expect(corpsePhaseFromElapsed(0)).toBe('fresh')
    expect(corpsePhaseFromElapsed(19.9)).toBe('fresh')
  })

  it('becomes rotting once the rot-onset threshold is reached', () => {
    expect(corpsePhaseFromElapsed(20)).toBe('rotting')
    expect(corpsePhaseFromElapsed(39.9)).toBe('rotting')
  })

  it('decomposes into bones once the bones-onset threshold is reached', () => {
    expect(corpsePhaseFromElapsed(40)).toBe('bones')
    expect(corpsePhaseFromElapsed(59.9)).toBe('bones')
  })

  it('depends only on elapsed simulation time, not on any frame/FPS notion', () => {
    // A single large `dt` (time-skip) landing past a threshold must resolve
    // to the same final phase as many small steps would.
    expect(corpsePhaseFromElapsed(1000)).toBe('bones')
  })
})

describe('rotFxRelevant (plan 188 — presentation is distance-gated, lifecycle is not)', () => {
  it('is only relevant while rotting and within FX range', () => {
    expect(rotFxRelevant('rotting', 5)).toBe(true)
    expect(rotFxRelevant('fresh', 5)).toBe(false)
    expect(rotFxRelevant('bones', 5)).toBe(false)
  })

  it('turns off once the observer is far away, even while still rotting', () => {
    expect(rotFxRelevant('rotting', 1000)).toBe(false)
  })
})

describe('createNaturalRemains (plan 188 — natural decay endpoint, no hide/meat)', () => {
  it('builds a bones-only pile distinct from the harvested-remains group', () => {
    const remains = createNaturalRemains('deer', 1.1)
    expect(remains.name).toBe('natural-remains')
    expect(remains.children.length).toBeGreaterThanOrEqual(3)
  })

  it('has fewer children than the harvested remains for the same species (no hide/meat)', () => {
    const natural = createNaturalRemains('deer', 1.1)
    const harvested = createHarvestedRemains('deer', 1.1)
    expect(natural.children.length).toBeLessThan(harvested.children.length)
  })
})

describe('canHarvestMeatFrom (plan 188 follow-up — meat only from fresh corpses)', () => {
  const alive = { dead: false, meatHarvested: false, buried: false, corpsePhase: 'fresh' as const }

  it('allows harvest on a fresh, dead, unharvested, unburied corpse', () => {
    expect(canHarvestMeatFrom({ ...alive, dead: true })).toBe(true)
  })

  it('blocks harvest once the corpse is rotting', () => {
    expect(canHarvestMeatFrom({ ...alive, dead: true, corpsePhase: 'rotting' })).toBe(false)
  })

  it('blocks harvest once the corpse has decomposed to bones', () => {
    expect(canHarvestMeatFrom({ ...alive, dead: true, corpsePhase: 'bones' })).toBe(false)
  })

  it('blocks harvest on a live animal regardless of phase', () => {
    expect(canHarvestMeatFrom({ ...alive, dead: false })).toBe(false)
  })

  it('blocks harvest already taken', () => {
    expect(canHarvestMeatFrom({ ...alive, dead: true, meatHarvested: true })).toBe(false)
  })

  it('blocks harvest on a buried corpse even if still nominally fresh', () => {
    expect(canHarvestMeatFrom({ ...alive, dead: true, buried: true })).toBe(false)
  })

  it('composes with corpsePhaseFromElapsed across the death → fresh → rotting timeline', () => {
    const justDied = corpsePhaseFromElapsed(0)
    const stillFresh = corpsePhaseFromElapsed(19.9)
    const rotted = corpsePhaseFromElapsed(20)
    expect(canHarvestMeatFrom({ ...alive, dead: true, corpsePhase: justDied })).toBe(true)
    expect(canHarvestMeatFrom({ ...alive, dead: true, corpsePhase: stillFresh })).toBe(true)
    expect(canHarvestMeatFrom({ ...alive, dead: true, corpsePhase: rotted })).toBe(false)
  })
})

describe('bear (plan 188 — data-driven fauna species, no dedicated agent/AI)', () => {
  it('is a valid AnimalKind with a full animal definition', () => {
    const def = ANIMAL_DEFS.bear
    expect(def.kind).toBe('bear')
    expect(def.role).toBe('predator')
    expect(def.sociability).toBe('wild')
  })

  it('has valid combat/lifecycle configuration — larger and tougher than wolf', () => {
    expect(MAX_HP.bear).toBeGreaterThan(MAX_HP.wolf)
    expect(ANIMAL_DEFS.bear.scale).toBeGreaterThan(ANIMAL_DEFS.wolf.scale)
    expect(ANIMAL_DEFS.bear.modelHeight).toBeGreaterThan(ANIMAL_DEFS.wolf.modelHeight)
  })
})
