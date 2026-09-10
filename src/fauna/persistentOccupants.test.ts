// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { DRY_WATER_SAMPLE } from '../terrain/waterSample'
import { AnimalAgent, type AnimalSaveState } from './AnimalAgent'
import { ANIMAL_DEFS } from './animalDefs'
import {
  createPersistentOccupantRegistry,
  ordinaryHabitatCapacity,
  persistentAnimalId,
  type PersistentOccupantDecl,
  persistentOccupantRestoreAction,
  type PersistentOccupantSaveRecord,
  persistentOccupantSlotKey,
} from './persistentOccupants'

const decl: PersistentOccupantDecl = {
  habitatId: 'home:cave:bear',
  occupantKey: 'resident',
  kind: 'bear',
}

function liveState(overrides: Partial<AnimalSaveState> = {}): AnimalSaveState {
  return {
    x: 12,
    z: -4,
    yaw: 0.3,
    health: { current: 40, max: 40, dead: false },
    life: { hunger: 0.4, thirst: 0.6, stamina: 1 },
    productionReadyAtDays: null,
    eggPending: false,
    corpse: null,
    rabid: false,
    ...overrides,
  }
}

function liveRecord(overrides: Partial<PersistentOccupantSaveRecord> = {}): PersistentOccupantSaveRecord {
  return {
    habitatId: decl.habitatId,
    occupantKey: decl.occupantKey,
    animalId: persistentAnimalId(decl.habitatId, decl.occupantKey),
    kind: decl.kind,
    state: liveState(),
    ...overrides,
  }
}

describe('persistent occupant identity', () => {
  it('derives the slot key only from habitatId + occupantKey', () => {
    expect(persistentOccupantSlotKey('home:cave:bear', 'resident')).toBe('home:cave:bear:resident')
    expect(persistentOccupantSlotKey('other:cave', 'resident')).not.toBe(
      persistentOccupantSlotKey('home:cave:bear', 'resident'),
    )
  })

  it('uses a namespaced animalId independent of ordinary kind-N spawn ids', () => {
    const id = persistentAnimalId(decl.habitatId, decl.occupantKey)
    expect(id).toBe('persistent:home:cave:bear:resident')
    expect(id).not.toMatch(/^(bear|wolf|deer)-\d+$/)
    expect(persistentAnimalId('a', 'resident')).not.toBe(persistentAnimalId('b', 'resident'))
  })

  it('does not depend on ordinary nextAnimalId / spawn order', () => {
    const first = persistentAnimalId(decl.habitatId, decl.occupantKey)
    const afterOrdinary = persistentAnimalId(decl.habitatId, decl.occupantKey)
    expect(first).toBe(afterOrdinary)
    expect(first).not.toBe('bear-0')
    expect(first).not.toBe('bear-1')
  })
})

describe('ordinaryHabitatCapacity', () => {
  it('subtracts reserved persistent slots from maxPreyCount', () => {
    expect(ordinaryHabitatCapacity(3, 1)).toBe(2)
    expect(ordinaryHabitatCapacity(1, 1)).toBe(0)
    expect(ordinaryHabitatCapacity(1, 2)).toBe(0)
  })
})

describe('persistentOccupantRestoreAction', () => {
  it('creates a fresh occupant once when nothing is saved', () => {
    expect(persistentOccupantRestoreAction(decl, undefined)).toEqual({ type: 'fresh' })
    expect(persistentOccupantRestoreAction(decl, { entries: [], removedSlots: [] })).toEqual({ type: 'fresh' })
  })

  it('hydrates a saved live/dead record of the declared kind', () => {
    const record = liveRecord()
    expect(persistentOccupantRestoreAction(decl, { entries: [record], removedSlots: [] })).toEqual({
      type: 'hydrate',
      record,
    })
  })

  it('skips reconstruction for a tombstoned slot', () => {
    const slot = persistentOccupantSlotKey(decl.habitatId, decl.occupantKey)
    expect(persistentOccupantRestoreAction(decl, {
      entries: [liveRecord()],
      removedSlots: [slot],
    })).toEqual({ type: 'skip' })
  })

  it('rejects a saved record whose kind disagrees with the declaration', () => {
    expect(persistentOccupantRestoreAction(decl, {
      entries: [liveRecord({ kind: 'wolf' })],
      removedSlots: [],
    })).toEqual({ type: 'mismatch' })
  })
})

describe('createPersistentOccupantRegistry', () => {
  it('counts declared slots even after tombstone', () => {
    const registry = createPersistentOccupantRegistry({
      entries: [],
      removedSlots: [persistentOccupantSlotKey(decl.habitatId, decl.occupantKey)],
    })
    registry.registerDeclarations([decl, { habitatId: 'home:thicket', occupantKey: 'resident', kind: 'deer' }])
    expect(registry.slotCountFor(decl.habitatId)).toBe(1)
    expect(registry.slotCountFor('home:thicket')).toBe(1)
    expect(registry.slotCountsByHabitatId().get(decl.habitatId)).toBe(1)
  })

  it('markRemoved tombstones the slot and blocks later reconstruction', () => {
    const registry = createPersistentOccupantRegistry({
      entries: [liveRecord()],
      removedSlots: [],
    })
    registry.registerDeclarations([decl])
    expect(registry.restoreAction(decl).type).toBe('hydrate')
    registry.markRemoved(persistentOccupantSlotKey(decl.habitatId, decl.occupantKey))
    expect(registry.restoreAction(decl)).toEqual({ type: 'skip' })
    expect(registry.serialize().removedSlots).toEqual([
      persistentOccupantSlotKey(decl.habitatId, decl.occupantKey),
    ])
    expect(registry.serialize().entries).toEqual([])
  })

  it('capture round-trips durable AnimalSaveState without requiring transient trips/targets', () => {
    const animal = new AnimalAgent({
      def: ANIMAL_DEFS.bear,
      animalId: persistentAnimalId(decl.habitatId, decl.occupantKey),
      sampleHeight: () => 0,
      waterLevel: -10,
      sampleLocalWater: () => DRY_WATER_SAMPLE,
      collidersNear: () => [],
      x: 0,
      z: 0,
    })
    animal.infectWithRabies()
    animal.hydrate({
      ...animal.snapshot(),
      x: 8,
      z: 3,
      yaw: 1.2,
      life: { hunger: 0.2, thirst: 0.7, stamina: 0.5 },
      health: { current: 12, max: 40, dead: true },
      corpse: { timeSinceDeath: 40, meatHarvested: false },
      rabid: true,
    })

    const registry = createPersistentOccupantRegistry()
    registry.registerDeclarations([decl])
    registry.capture([animal])
    const snapshot = registry.serialize()
    expect(snapshot.entries).toHaveLength(1)
    const record = snapshot.entries[0]!
    expect(record.animalId).toBe(animal.animalId)
    expect(record.state.x).toBe(8)
    expect(record.state.z).toBe(3)
    expect(record.state.health.dead).toBe(true)
    expect(record.state.corpse).toEqual({ timeSinceDeath: 40, meatHarvested: false })
    expect(record.state.rabid).toBe(true)
    expect(record.state).not.toHaveProperty('sourceTarget')
    expect(record.state).not.toHaveProperty('trip')

    const restored = createPersistentOccupantRegistry(snapshot)
    restored.registerDeclarations([decl])
    const action = restored.restoreAction(decl)
    expect(action.type).toBe('hydrate')
    if (action.type !== 'hydrate') return
    expect(action.record.animalId).toBe(animal.animalId)
    expect(action.record.state.life.hunger).toBe(0.2)
  })
})
