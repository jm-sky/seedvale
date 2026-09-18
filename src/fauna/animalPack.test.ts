import { describe, expect, it } from 'vitest'
import { ANIMAL_DEFS } from './animalDefs'
import {
  animalPackGroundContainerId,
  canEquipAnimalPack,
  canUnequipAnimalPack,
  createAnimalPack,
  detachAnimalPack,
  hydrateAnimalPack,
  resolveDroppedPackPosition,
  snapshotAnimalPack,
} from './animalPack'

describe('animalPack (plan fauna-039)', () => {
  it('constructs an empty, gabarite-capped, weight-unlimited pack for a pack-capable def', () => {
    const pack = createAnimalPack(ANIMAL_DEFS.horse)
    expect(pack).toBeTruthy()
    expect(pack?.contents.isEmpty()).toBe(true)
    expect(pack?.contents.maxSize).toBe(ANIMAL_DEFS.horse.pack?.cargoCapacityUnits)
    expect(pack?.contents.maxWeight).toBe(Infinity)
  })

  it('returns null for a species without pack capability', () => {
    expect(createAnimalPack(ANIMAL_DEFS.cow)).toBeNull()
  })

  it('snapshots to undefined for no pack, and round-trips contents through hydrate', () => {
    expect(snapshotAnimalPack(null)).toBeUndefined()
    const pack = createAnimalPack(ANIMAL_DEFS.donkey)
    pack?.contents.add('rope', 2)
    const snapshot = snapshotAnimalPack(pack)
    expect(snapshot?.equipment).toBe('saddlebags')
    expect(snapshot?.contents.counts.rope).toBe(2)

    const hydrated = hydrateAnimalPack(ANIMAL_DEFS.donkey, snapshot)
    expect(hydrated?.contents.count('rope')).toBe(2)
    expect(hydrated?.contents.maxSize).toBe(ANIMAL_DEFS.donkey.pack?.cargoCapacityUnits)
  })

  it('hydrates to null when there is no snapshot, regardless of capability', () => {
    expect(hydrateAnimalPack(ANIMAL_DEFS.horse, undefined)).toBeNull()
  })

  it('equip eligibility requires capability, aliveness, ownership and no existing pack', () => {
    expect(canEquipAnimalPack(ANIMAL_DEFS.horse, { alive: true, playerOwned: true, hasPack: false })).toBe(true)
    expect(canEquipAnimalPack(ANIMAL_DEFS.cow, { alive: true, playerOwned: true, hasPack: false })).toBe(false)
    expect(canEquipAnimalPack(ANIMAL_DEFS.horse, { alive: false, playerOwned: true, hasPack: false })).toBe(false)
    expect(canEquipAnimalPack(ANIMAL_DEFS.horse, { alive: true, playerOwned: false, hasPack: false })).toBe(false)
    expect(canEquipAnimalPack(ANIMAL_DEFS.horse, { alive: true, playerOwned: true, hasPack: true })).toBe(false)
  })

  it('unequip eligibility requires an equipped, fully empty pack', () => {
    expect(canUnequipAnimalPack(null)).toBe(false)
    const pack = createAnimalPack(ANIMAL_DEFS.horse)
    expect(canUnequipAnimalPack(pack)).toBe(true)
    pack?.contents.add('rope', 1)
    expect(canUnequipAnimalPack(pack)).toBe(false)
  })

  it('detachAnimalPack losslessly snapshots contents for the death handoff', () => {
    const pack = createAnimalPack(ANIMAL_DEFS.horse)
    pack?.contents.add('rope', 4)
    const detached = pack ? detachAnimalPack(pack) : null
    expect(detached?.contents.counts.rope).toBe(4)
  })

  it('namespaces the ground container id by origin settlement, not animalId alone', () => {
    expect(animalPackGroundContainerId('home', 'horse-house0-0')).toBe('animal-pack:home:horse-house0-0')
    expect(animalPackGroundContainerId('other-settlement', 'horse-house0-0'))
      .not.toBe(animalPackGroundContainerId('home', 'horse-house0-0'))
  })

  it('offsets the dropped pack laterally from the animal, deterministically (no RNG)', () => {
    const a = resolveDroppedPackPosition(10, 10, 0)
    const b = resolveDroppedPackPosition(10, 10, 0)
    expect(a).toEqual(b)
    expect(a.x !== 10 || a.z !== 10).toBe(true)
  })
})
