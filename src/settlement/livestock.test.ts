import { describe, expect, it } from 'vitest'
import type { AnimalAgent, AnimalSaveState } from '../fauna/AnimalAgent'
import { createLivestockRegistry } from './livestock'

function fakeAnimal(animalId: string, kind: 'chicken' | 'horse', ownerHouseId?: string): AnimalAgent {
  const state: AnimalSaveState = {
    x: 1, z: 2, yaw: 0.3,
    health: { current: 5, max: 10, dead: false },
    life: { hunger: 0.1, thirst: 0.2, stamina: 1 },
    productionReadyAtDays: 2,
    eggPending: false,
    corpse: null,
  }
  return {
    animalId,
    ownerHouseId,
    def: { kind },
    snapshot: () => state,
  } as unknown as AnimalAgent
}

describe('createLivestockRegistry', () => {
  it('capture then serialize round-trips one settlement, and getSaved reflects it', () => {
    const registry = createLivestockRegistry()
    registry.capture('home', [fakeAnimal('chicken-house0-0', 'chicken', 'home:home:0')])
    const saved = registry.getSaved('home')
    expect(saved?.get('chicken-house0-0')?.kind).toBe('chicken')

    const { entries, removedIds } = registry.serialize()
    expect(entries).toHaveLength(1)
    expect(entries[0]!.settlementId).toBe('home')
    expect(removedIds).toHaveLength(0)
  })

  it('markRemoved tombstones an id, namespaced by settlement, and drops it from saved state', () => {
    const registry = createLivestockRegistry()
    registry.capture('home', [fakeAnimal('chicken-house0-0', 'chicken')])
    registry.markRemoved('home', 'chicken-house0-0')

    expect(registry.getSaved('home')?.has('chicken-house0-0')).toBe(false)
    expect(registry.getRemoved('home')?.has('chicken-house0-0')).toBe(true)
    expect(registry.serialize().removedIds).toEqual(['home:chicken-house0-0'])
  })

  it('keeps the same animalId independent across two different settlements', () => {
    const registry = createLivestockRegistry()
    registry.capture('village-a', [fakeAnimal('merchant-horse-village-a', 'horse')])
    registry.markRemoved('village-b', 'merchant-horse-village-a')

    // Same bare id, different settlement — the tombstone in village-b must
    // never shadow the still-saved individual in village-a.
    expect(registry.getSaved('village-a')?.has('merchant-horse-village-a')).toBe(true)
    expect(registry.getRemoved('village-a')?.has('merchant-horse-village-a')).toBeFalsy()
  })

  it('rehydrates from an initial {entries, removedIds} snapshot (composite-key parsing)', () => {
    const seeded = createLivestockRegistry()
    seeded.capture('home', [fakeAnimal('chicken-house0-0', 'chicken')])
    seeded.markRemoved('home', 'chicken-house1-0')
    const { entries, removedIds } = seeded.serialize()

    const restored = createLivestockRegistry({ entries, removedIds })
    expect(restored.getSaved('home')?.get('chicken-house0-0')?.animalId).toBe('chicken-house0-0')
    expect(restored.getRemoved('home')?.has('chicken-house1-0')).toBe(true)
  })
})
