import { Object3D, Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'
import type { AnimalAgent, AnimalSaveState } from '../fauna/AnimalAgent'
import { createLivestockRegistry, tickSettlementLivestock } from './livestock'

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

function fakeTickAnimal(overrides: Partial<AnimalAgent> = {}): AnimalAgent {
  return {
    animalId: 'chicken-house0-0',
    def: { kind: 'chicken' },
    mesh: new Object3D(),
    update: vi.fn(),
    readyToLayEgg: vi.fn(() => false),
    markEggLaid: vi.fn(),
    notifyEggCollected: vi.fn(),
    readyToRemove: vi.fn(() => false),
    dispose: vi.fn(),
    ...overrides,
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

describe('tickSettlementLivestock', () => {
  function ctxFor(overrides: Partial<Parameters<typeof tickSettlementLivestock>[1]> = {}) {
    return {
      dt: 1 / 60,
      settlementId: 'home',
      observerPos: new Vector3(),
      dayFactor: 1,
      timeOfDay: 0.5,
      nowDays: 3,
      litFires: [],
      villages: [],
      getNowDays: () => 3,
      ...overrides,
    }
  }

  it('a ready chicken drops exactly one egg and fires onAnimalVocalize', () => {
    const animal = fakeTickAnimal({ readyToLayEgg: vi.fn(() => true) })
    const livestock = [animal]
    const dropLivestockProduct = vi.fn()
    const onAnimalVocalize = vi.fn()

    tickSettlementLivestock(livestock, ctxFor({ dropLivestockProduct, onAnimalVocalize }))

    expect(dropLivestockProduct).toHaveBeenCalledTimes(1)
    expect(dropLivestockProduct).toHaveBeenCalledWith('egg', 0, 0, expect.any(Function))
    expect(animal.markEggLaid).toHaveBeenCalledTimes(1)
    expect(onAnimalVocalize).toHaveBeenCalledWith('chicken', 0, 0)
  })

  it("the drop's onCollected callback reads the latest nowDays via getNowDays, not the tick's frame value", () => {
    const animal = fakeTickAnimal({ readyToLayEgg: vi.fn(() => true) })
    const livestock = [animal]
    let onCollected: (() => void) | undefined
    const dropLivestockProduct = vi.fn((_kind, _x, _z, cb: () => void) => { onCollected = cb })
    const getNowDays = vi.fn(() => 3)

    tickSettlementLivestock(livestock, ctxFor({ nowDays: 1, dropLivestockProduct, getNowDays }))
    getNowDays.mockReturnValue(7)
    onCollected!()

    expect(animal.notifyEggCollected).toHaveBeenCalledWith(7)
  })

  it('a readyToRemove animal is spliced out, disposed, and tombstoned via persistence.markRemoved', () => {
    const dead = fakeTickAnimal({ animalId: 'chicken-house0-1', readyToRemove: vi.fn(() => true) })
    const alive = fakeTickAnimal({ animalId: 'chicken-house0-2' })
    const livestock = [dead, alive]
    const markRemoved = vi.fn()

    const persistence = { getSaved: () => undefined, getRemoved: () => undefined, markRemoved }
    tickSettlementLivestock(livestock, ctxFor({ persistence }))

    expect(dead.dispose).toHaveBeenCalledTimes(1)
    expect(markRemoved).toHaveBeenCalledWith('home', 'chicken-house0-1')
    expect(livestock).toEqual([alive])
  })

  it('keeps the livestock array identity (in-place splice, not a replacement array)', () => {
    const dead = fakeTickAnimal({ readyToRemove: vi.fn(() => true) })
    const livestock = [dead]
    const originalArray = livestock

    tickSettlementLivestock(livestock, ctxFor())

    expect(livestock).toBe(originalArray)
    expect(livestock).toHaveLength(0)
  })
})
