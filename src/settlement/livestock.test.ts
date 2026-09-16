import { Object3D, Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'
import type { AnimalAgent, AnimalSaveState } from '../fauna/AnimalAgent'
import { ownerFromHouseId } from '../fauna/animalOwnership'
import {
  createLivestockRegistry,
  fillShepherdFlockKinds,
  isPlayerOwnedLivestockRecord,
  livestockRecordMatchesHouseholdSlot,
  type LivestockSaveRecord,
  resolveLivePersistentAnimal,
  setOwnedAnimalControl,
  shouldSpawnDeterministicLivestockSlot,
  tickSettlementLivestock,
  transferAnimalOwnership,
} from './livestock'

function fakeAnimal(
  animalId: string,
  kind: 'chicken' | 'horse',
  ownerHouseId?: string,
  owner = ownerFromHouseId(ownerHouseId),
  control?: AnimalSaveState['control'],
): AnimalAgent {
  const state: AnimalSaveState = {
    x: 1, z: 2, yaw: 0.3,
    health: { current: 5, max: 10, dead: false },
    life: { hunger: 0.1, thirst: 0.2, stamina: 1 },
    productionReadyAtDays: 2,
    eggPending: false,
    corpse: null,
    owner,
    ...(control ? { control } : {}),
  }
  return {
    animalId,
    ownerHouseId,
    getOwner: () => owner,
    isPlayerOwned: () => owner?.kind === 'player',
    isDead: () => false,
    setOwnedControlMode: vi.fn(),
    transferOwnershipToPlayer: vi.fn(function (this: AnimalAgent) {
      (this as { getOwner: () => unknown }).getOwner = () => ({ kind: 'player' })
    }),
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

  it('restoreRemoved drops the tombstone and restores exactly one saved record', () => {
    const registry = createLivestockRegistry()
    const animal = fakeAnimal('horse-house0-0', 'horse', undefined, { kind: 'player' })
    registry.upsert('home', animal)
    registry.markRemoved('home', 'horse-house0-0')
    const snapshot = registry.getRemovedSnapshot('home', 'horse-house0-0')
    expect(snapshot?.animalId).toBe('horse-house0-0')
    expect(registry.serialize().removedIds).toEqual(['home:horse-house0-0'])

    registry.restoreRemoved({
      ...snapshot!,
      health: { ...snapshot!.health, dead: false, current: snapshot!.health.max },
      corpse: null,
    })
    expect(registry.getRemoved('home')?.has('horse-house0-0')).toBeFalsy()
    expect(registry.getSaved('home')?.get('horse-house0-0')?.animalId).toBe('horse-house0-0')
    expect(registry.serialize().removedIds).toEqual([])
    expect(registry.serialize().entries).toHaveLength(1)
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

  it('serializes player-owned records with owner field and origin namespace', () => {
    const registry = createLivestockRegistry()
    registry.upsert('home', fakeAnimal('horse-house0-0', 'horse', 'home:home:0', { kind: 'player' }))
    const entry = registry.serialize().entries[0]!
    expect(entry.owner).toEqual({ kind: 'player' })
    expect(entry.settlementId).toBe('home')
    expect(isPlayerOwnedLivestockRecord(entry)).toBe(true)
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

describe('livestock reconciliation helpers', () => {
  const householdRecord: LivestockSaveRecord = {
    settlementId: 'home',
    animalId: 'horse-house0-0',
    kind: 'horse',
    owner: { kind: 'household', houseId: 'home:home:0' },
    ownerHouseId: 'home:home:0',
    x: 0, z: 0, yaw: 0,
    health: { current: 10, max: 10, dead: false },
    life: { hunger: 0, thirst: 0, stamina: 1 },
    productionReadyAtDays: null,
    eggPending: false,
    corpse: null,
  }

  it('accepts household records only for matching deterministic slots', () => {
    expect(livestockRecordMatchesHouseholdSlot(householdRecord, 'horse', 'home:home:0')).toBe(true)
    expect(livestockRecordMatchesHouseholdSlot(householdRecord, 'horse', 'home:home:1')).toBe(false)
  })

  it('rejects player-owned records for household slot hydration', () => {
    const playerRecord = { ...householdRecord, owner: { kind: 'player' as const }, ownerHouseId: undefined }
    expect(livestockRecordMatchesHouseholdSlot(playerRecord, 'horse', 'home:home:0')).toBe(false)
    expect(isPlayerOwnedLivestockRecord(playerRecord)).toBe(true)
  })
})

describe('persistent livestock operations', () => {
  it('transfer keeps the same object identity and moves it to detached collection', () => {
    const registry = createLivestockRegistry()
    const animal = fakeAnimal('horse-house0-0', 'horse', 'home:home:0')
    const settlementLivestock = [animal]
    const detached: AnimalAgent[] = []
    const detachedById = new Map<string, AnimalAgent>()
    const detachedOriginById = new Map<string, string>()
    const ctx = {
      getLoadedSettlements: () => [{ id: 'home', livestock: settlementLivestock }],
      detached,
      detachedById,
      detachedOriginById,
      registry,
    }

    expect(transferAnimalOwnership(ctx, 'horse-house0-0', { kind: 'player' })).toBe(true)
    expect(settlementLivestock).toHaveLength(0)
    expect(detached).toEqual([animal])
    expect(detachedById.get('horse-house0-0')).toBe(animal)
    expect(detachedOriginById.get('horse-house0-0')).toBe('home')
    expect(resolveLivePersistentAnimal(ctx, 'horse-house0-0')?.animal).toBe(animal)
    expect(animal.transferOwnershipToPlayer).toHaveBeenCalled()
  })

  it('setOwnedAnimalControl updates only player-owned live animals', () => {
    const registry = createLivestockRegistry()
    const animal = fakeAnimal('horse-house0-0', 'horse', undefined, { kind: 'player' })
    const detached = [animal]
    const ctx = {
      getLoadedSettlements: () => [],
      detached,
      detachedById: new Map([['horse-house0-0', animal]]),
      detachedOriginById: new Map([['horse-house0-0', 'home']]),
      registry,
    }
    expect(setOwnedAnimalControl(ctx, 'horse-house0-0', 'stay')).toBe(true)
    expect(animal.setOwnedControlMode).toHaveBeenCalledWith('stay')
  })

  it('upsert serializes Stay control on a transferred player-owned horse', () => {
    const registry = createLivestockRegistry()
    const animal = fakeAnimal(
      'merchant-horse-home',
      'horse',
      undefined,
      { kind: 'player' },
      { mode: 'stay', stayAnchor: { x: 12, z: -3 } },
    )
    registry.upsert('home', animal)
    const entries = registry.serialize().entries
    expect(entries).toHaveLength(1)
    expect(entries[0]!.animalId).toBe('merchant-horse-home')
    expect(entries[0]!.control).toEqual({ mode: 'stay', stayAnchor: { x: 12, z: -3 } })
    expect(isPlayerOwnedLivestockRecord(entries[0]!)).toBe(true)

    const restored = createLivestockRegistry({
      entries,
      removedIds: registry.serialize().removedIds,
    })
    expect(restored.getSaved('home')?.get('merchant-horse-home')?.animalId).toBe('merchant-horse-home')
    expect(restored.serialize().entries).toHaveLength(1)
  })

  it('tombstone and player-owned records skip deterministic merchant-horse respawn', () => {
    const animalId = 'merchant-horse-home'
    expect(shouldSpawnDeterministicLivestockSlot(animalId, undefined, undefined)).toBe(true)
    expect(shouldSpawnDeterministicLivestockSlot(animalId, new Set([animalId]), undefined)).toBe(false)
    const playerOwned: LivestockSaveRecord = {
      settlementId: 'home',
      animalId,
      kind: 'horse',
      owner: { kind: 'player' },
      x: 1, z: 2, yaw: 0,
      health: { current: 5, max: 10, dead: false },
      life: { hunger: 0, thirst: 0, stamina: 1 },
      productionReadyAtDays: 0,
      eggPending: false,
      corpse: null,
      control: { mode: 'stay', stayAnchor: { x: 1, z: 2 } },
    }
    expect(shouldSpawnDeterministicLivestockSlot(animalId, undefined, playerOwned)).toBe(false)
  })

  it('tombstone and player-owned records skip deterministic vendor-paddock respawn', () => {
    const animalId = 'vendor-horse-home-0'
    expect(shouldSpawnDeterministicLivestockSlot(animalId, undefined, undefined)).toBe(true)
    expect(shouldSpawnDeterministicLivestockSlot(animalId, new Set([animalId]), undefined)).toBe(false)
    const playerOwned: LivestockSaveRecord = {
      settlementId: 'home',
      animalId,
      kind: 'horse',
      owner: { kind: 'player' },
      x: 1, z: 2, yaw: 0,
      health: { current: 5, max: 10, dead: false },
      life: { hunger: 0, thirst: 0, stamina: 1 },
      productionReadyAtDays: 0,
      eggPending: false,
      corpse: null,
      training: { progress: 0.6 },
      paddockStay: {
        settlementId: 'home',
        slotIndex: 0,
        x: 0, z: 0, radius: 10,
        entranceX: 10, entranceZ: 0, entranceWidth: 2.4,
        hayX: -3, hayZ: 3,
      },
    }
    expect(shouldSpawnDeterministicLivestockSlot(animalId, undefined, playerOwned)).toBe(false)
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

  it('forwards one scare stimulus to every local candidate without a global scan', () => {
    const a = fakeTickAnimal({ animalId: 'chicken-a' })
    const b = fakeTickAnimal({ animalId: 'chicken-b' })
    const scareStimulus = {
      source: 'thunder' as const,
      eventId: 'lightning:1:0:0',
      strength: 0.9,
      simulatedDistanceM: 180,
    }
    tickSettlementLivestock([a, b], ctxFor({ scareStimulus }))
    expect(a.update).toHaveBeenCalledWith(expect.objectContaining({ scareStimulus }))
    expect(b.update).toHaveBeenCalledWith(expect.objectContaining({ scareStimulus }))
  })
})

describe('fillShepherdFlockKinds (plan fauna-004)', () => {
  it('appends extra sheep so earlier house rolls keep their slots', () => {
    const kinds = ['cow', 'chicken'] as Array<'cow' | 'chicken' | 'sheep'>
    fillShepherdFlockKinds(kinds, 3)
    expect(kinds).toEqual(['cow', 'chicken', 'sheep', 'sheep', 'sheep'])
  })

  it('counts existing sheep toward the flock and does not prepend', () => {
    const kinds = ['sheep', 'cow'] as Array<'cow' | 'sheep'>
    fillShepherdFlockKinds(kinds, 2)
    expect(kinds).toEqual(['sheep', 'cow', 'sheep'])
    fillShepherdFlockKinds(kinds, 2)
    expect(kinds).toEqual(['sheep', 'cow', 'sheep'])
    fillShepherdFlockKinds(kinds, 4)
    expect(kinds).toEqual(['sheep', 'cow', 'sheep', 'sheep', 'sheep'])
  })
})
