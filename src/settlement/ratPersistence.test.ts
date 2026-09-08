import { describe, expect, it } from 'vitest'
import { createRatRegistry } from './ratPersistence'
import { createStorageInfestationRegistry } from './storageInfestation'

describe('storageInfestation registry (plan quests-progression-006)', () => {
  it('round-trips active and repaired conditions', () => {
    const registry = createStorageInfestationRegistry()
    registry.activate('home')
    expect(registry.isActive('home')).toBe(true)
    registry.repair('home')
    expect(registry.isActive('home')).toBe(false)
    expect(registry.serialize()).toEqual({ home: 'repaired' })
  })
})

describe('rat persistence registry (plan quests-progression-006)', () => {
  it('captures and serializes saved individuals', () => {
    const registry = createRatRegistry()
    const fakeAnimal = {
      animalId: 'rat-home-0',
      def: { kind: 'rat' as const },
      snapshot: () => ({
        x: 1,
        z: 2,
        yaw: 0,
        health: { current: 1, max: 1, dead: false },
        life: { hunger: 0, thirst: 0, stamina: 1 },
        productionReadyAtDays: null,
        eggPending: false,
        corpse: null,
      }),
    }
    registry.capture('home', [fakeAnimal as never])
    const serialized = registry.serialize()
    expect(serialized.entries).toHaveLength(1)
    expect(serialized.entries[0]).toMatchObject({ settlementId: 'home', animalId: 'rat-home-0', x: 1, z: 2 })
  })

  it('tombstones removed rats so they are not restored', () => {
    const registry = createRatRegistry({
      entries: [{
        settlementId: 'home',
        animalId: 'rat-home-0',
        x: 0,
        z: 0,
        yaw: 0,
        health: { current: 1, max: 1, dead: false },
        life: { hunger: 0, thirst: 0, stamina: 1 },
        productionReadyAtDays: null,
        eggPending: false,
        corpse: null,
      }],
      removedIds: ['home:rat-home-0'],
    })
    expect(registry.getSaved('home')?.has('rat-home-0')).toBe(true)
    expect(registry.getRemoved('home')?.has('rat-home-0')).toBe(true)
  })
})
