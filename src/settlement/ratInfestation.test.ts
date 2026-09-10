import { describe, expect, it } from 'vitest'
import {
  createRatInfestationRegistry,
  NO_RAT_INFESTATION,
  SEEDED_RAT_INFESTATION,
} from './ratInfestation'

describe('rat infestation registry (plan quests-progression-013)', () => {
  it('seeds damaged storage with an intact nest', () => {
    const registry = createRatInfestationRegistry()
    expect(registry.get('home')).toEqual(NO_RAT_INFESTATION)
    registry.seed('home')
    expect(registry.get('home')).toEqual(SEEDED_RAT_INFESTATION)
    expect(registry.isStorageDamaged('home')).toBe(true)
    expect(registry.hasActiveNest('home')).toBe(true)
    expect(registry.isNestDestroyed('home')).toBe(false)
  })

  it('repairs storage without destroying the nest', () => {
    const registry = createRatInfestationRegistry()
    registry.seed('home')
    registry.repairStorage('home')
    expect(registry.get('home')).toEqual({ storageDamaged: false, nestDestroyed: false })
    expect(registry.hasActiveNest('home')).toBe(true)
  })

  it('destroys the nest without repairing storage', () => {
    const registry = createRatInfestationRegistry()
    registry.seed('home')
    registry.destroyNest('home')
    expect(registry.get('home')).toEqual({ storageDamaged: true, nestDestroyed: true })
    expect(registry.isStorageDamaged('home')).toBe(true)
    expect(registry.hasActiveNest('home')).toBe(false)
  })

  it('round-trips independent storage and nest facts', () => {
    const registry = createRatInfestationRegistry()
    registry.seed('home')
    registry.repairStorage('home')
    registry.destroyNest('home')
    expect(registry.serialize()).toEqual({
      home: { storageDamaged: false, nestDestroyed: true },
    })
    const restored = createRatInfestationRegistry(registry.serialize())
    expect(restored.get('home')).toEqual({ storageDamaged: false, nestDestroyed: true })
  })

  it('does not invent a nest for a settlement without a record', () => {
    const registry = createRatInfestationRegistry()
    expect(registry.hasActiveNest('other')).toBe(false)
    expect(registry.isNestDestroyed('other')).toBe(true)
    registry.repairStorage('other')
    registry.destroyNest('other')
    expect(registry.serialize()).toEqual({})
  })
})
