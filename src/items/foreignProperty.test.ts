import { describe, expect, it, vi } from 'vitest'
import type { AnimalAgent } from '../fauna/AnimalAgent'
import { surfaceInteractable } from '../interaction/Interactable'
import {
  beginMountedForeignUse,
  createForeignPropertyUse,
  evaluateMountedForeignUse,
  FOREIGN_MERCHANT_HORSE_REMOVAL_DISTANCE,
  FOREIGN_PROPERTY_MOUNT_REASON,
  isForeignPropertyBorrowingPermitted,
  previewForeignPropertyAction,
  previewMerchantHorseMount,
  resolveMerchantHorseForeignUse,
  settlementMerchantNpc,
  UNAUTHORIZED_PROPERTY_MARKUP_MILD,
  UNAUTHORIZED_PROPERTY_MARKUP_NEUTRAL,
  UNAUTHORIZED_PROPERTY_MARKUP_POOR,
  UNAUTHORIZED_PROPERTY_RELATION_DELTA,
  unauthorizedPropertyMarkup,
} from './foreignProperty'

function fakeHorse(overrides: {
  id?: string
  playerOwned?: boolean
  x?: number
  z?: number
} = {}): AnimalAgent {
  return {
    animalId: overrides.id ?? 'merchant-horse-home',
    isPlayerOwned: () => overrides.playerOwned ?? false,
    mesh: { position: { x: overrides.x ?? 0, z: overrides.z ?? 0 } },
  } as unknown as AnimalAgent
}

const homeSettlement = {
  id: 'home',
  npcs: [
    { id: 'home:npc:2', role: 'farmer', health: { dead: false } },
    { id: 'home:npc:1', role: 'trader', health: { dead: false } },
    { id: 'home:npc:0', role: 'trader', health: { dead: true } },
  ],
}

describe('foreign property classification (plan items-player-042)', () => {
  it('picks the live trader by stable id, skipping the dead one', () => {
    expect(settlementMerchantNpc(homeSettlement)?.id).toBe('home:npc:1')
  })

  it('resolves the merchant horse through the acquisition seam, not id parsing', () => {
    const horse = fakeHorse()
    const other = fakeHorse({ id: 'household-horse' })
    const resolveAnimal = (id: string) => (id === 'merchant-horse-home' ? horse : null)
    expect(resolveMerchantHorseForeignUse(horse, [homeSettlement], resolveAnimal)).toEqual({
      animalId: 'merchant-horse-home',
      merchantNpcId: 'home:npc:1',
    })
    expect(resolveMerchantHorseForeignUse(other, [homeSettlement], resolveAnimal)).toBeNull()
    expect(resolveMerchantHorseForeignUse(fakeHorse({ playerOwned: true }), [homeSettlement], resolveAnimal)).toBeNull()
  })

  it('previews a negative mount action only while the horse is still foreign', () => {
    const horse = fakeHorse()
    const resolve = () => ({ animalId: horse.animalId, merchantNpcId: 'home:npc:1' })
    expect(previewMerchantHorseMount(horse, resolve)).toEqual({
      tone: 'negative',
      reasonLabel: FOREIGN_PROPERTY_MOUNT_REASON,
    })
    expect(previewMerchantHorseMount(fakeHorse({ playerOwned: true }), resolve)).toBeNull()
  })

  it('attaches the warning to the mount action, not inspect or attack', () => {
    const horse = fakeHorse()
    const target = surfaceInteractable({
      kind: 'animal',
      position: { x: 0, z: 0 },
      promptLabel: 'Dosiądź: Koń',
      animal: horse,
    })
    const resolve = () => ({ animalId: horse.animalId, merchantNpcId: 'home:npc:1' })
    expect(previewForeignPropertyAction(target, { slot: 'primary', label: 'Dosiądź: Koń' }, resolve)?.tone).toBe('negative')
    expect(previewForeignPropertyAction(target, { slot: 'inspect', label: 'Sprawdź' }, resolve)).toBeNull()
    expect(previewForeignPropertyAction(target, { slot: 'primary', label: 'Atakuj: Koń' }, resolve)).toBeNull()
  })

  it('treats friendly and trusted as permitted borrowing', () => {
    expect(isForeignPropertyBorrowingPermitted('friendly')).toBe(true)
    expect(isForeignPropertyBorrowingPermitted('trusted')).toBe(true)
    expect(isForeignPropertyBorrowingPermitted('acquainted')).toBe(false)
    expect(isForeignPropertyBorrowingPermitted('stranger')).toBe(false)
  })

  it('maps relation bands onto the plan markup targets', () => {
    expect(unauthorizedPropertyMarkup(2, 'acquainted')).toBe(UNAUTHORIZED_PROPERTY_MARKUP_MILD)
    expect(unauthorizedPropertyMarkup(0, 'stranger')).toBe(UNAUTHORIZED_PROPERTY_MARKUP_NEUTRAL)
    expect(unauthorizedPropertyMarkup(-3, 'stranger')).toBe(UNAUTHORIZED_PROPERTY_MARKUP_POOR)
    expect(unauthorizedPropertyMarkup(4, 'friendly')).toBe(0)
  })
})

describe('mounted foreign-use incident', () => {
  const resolve = () => ({ animalId: 'merchant-horse-home', merchantNpcId: 'home:npc:1' as const })

  it('does not evaluate on mount or a nearby dismount-scale move', () => {
    const horse = fakeHorse()
    const incident = beginMountedForeignUse(horse, resolve)!
    expect(incident.originX).toBe(0)
    expect(evaluateMountedForeignUse(
      incident,
      { animalId: horse.animalId, x: 4, z: 0, isPlayerOwned: false },
      { value: 0, level: 'stranger' },
    )).toBeNull()
    expect(incident.resolved).toBe(false)
  })

  it('commits once when the distance threshold is crossed', () => {
    const horse = fakeHorse()
    const incident = beginMountedForeignUse(horse, resolve)!
    const first = evaluateMountedForeignUse(
      incident,
      { animalId: horse.animalId, x: FOREIGN_MERCHANT_HORSE_REMOVAL_DISTANCE, z: 0, isPlayerOwned: false },
      { value: 0, level: 'stranger' },
    )
    expect(first).toEqual({ merchantNpcId: 'home:npc:1', markup: UNAUTHORIZED_PROPERTY_MARKUP_NEUTRAL })
    const second = evaluateMountedForeignUse(
      incident,
      { animalId: horse.animalId, x: FOREIGN_MERCHANT_HORSE_REMOVAL_DISTANCE + 40, z: 0, isPlayerOwned: false },
      { value: 0, level: 'stranger' },
    )
    expect(second).toBeNull()
  })

  it('resolves friendly borrowing without a penalty payload', () => {
    const horse = fakeHorse()
    const incident = beginMountedForeignUse(horse, resolve)!
    expect(evaluateMountedForeignUse(
      incident,
      { animalId: horse.animalId, x: 40, z: 0, isPlayerOwned: false },
      { value: 4, level: 'friendly' },
    )).toBeNull()
    expect(incident.resolved).toBe(true)
  })

  it('uses the acquaintance mild band and the poor-relation band', () => {
    const mildIncident = beginMountedForeignUse(fakeHorse(), resolve)!
    expect(evaluateMountedForeignUse(
      mildIncident,
      { animalId: 'merchant-horse-home', x: 40, z: 0, isPlayerOwned: false },
      { value: 2, level: 'acquainted' },
    )?.markup).toBe(UNAUTHORIZED_PROPERTY_MARKUP_MILD)

    const poorIncident = beginMountedForeignUse(fakeHorse(), resolve)!
    expect(evaluateMountedForeignUse(
      poorIncident,
      { animalId: 'merchant-horse-home', x: 40, z: 0, isPlayerOwned: false },
      { value: -4, level: 'stranger' },
    )?.markup).toBe(UNAUTHORIZED_PROPERTY_MARKUP_POOR)
  })
})

describe('createForeignPropertyUse', () => {
  it('applies relation, grievance and SFX once on unauthorized threshold crossing', () => {
    const horse = fakeHorse()
    const adjustRelation = vi.fn()
    const applyGrievance = vi.fn()
    const playNegativeConsequence = vi.fn()
    const use = createForeignPropertyUse({
      resolveContext: () => ({ animalId: horse.animalId, merchantNpcId: 'home:npc:1' }),
      getRelation: () => 0,
      getRelationLevel: () => 'stranger',
      adjustRelation,
      applyGrievance,
      nowDays: () => 3,
      playNegativeConsequence,
    })
    const incident = use.beginMountedUse(horse)!
    horse.mesh.position.x = FOREIGN_MERCHANT_HORSE_REMOVAL_DISTANCE
    use.updateMountedUse(incident, horse)
    use.updateMountedUse(incident, horse)
    expect(adjustRelation).toHaveBeenCalledTimes(1)
    expect(adjustRelation).toHaveBeenCalledWith('home:npc:1', UNAUTHORIZED_PROPERTY_RELATION_DELTA)
    expect(applyGrievance).toHaveBeenCalledTimes(1)
    expect(applyGrievance).toHaveBeenCalledWith('home:npc:1', UNAUTHORIZED_PROPERTY_MARKUP_NEUTRAL, 3)
    expect(playNegativeConsequence).toHaveBeenCalledTimes(1)
  })

  it('does not fire relation, grievance or SFX for friendly borrowing', () => {
    const horse = fakeHorse()
    const adjustRelation = vi.fn()
    const applyGrievance = vi.fn()
    const playNegativeConsequence = vi.fn()
    const use = createForeignPropertyUse({
      resolveContext: () => ({ animalId: horse.animalId, merchantNpcId: 'home:npc:1' }),
      getRelation: () => 4,
      getRelationLevel: () => 'friendly',
      adjustRelation,
      applyGrievance,
      nowDays: () => 1,
      playNegativeConsequence,
    })
    const incident = use.beginMountedUse(horse)!
    horse.mesh.position.x = 40
    use.updateMountedUse(incident, horse)
    expect(adjustRelation).not.toHaveBeenCalled()
    expect(applyGrievance).not.toHaveBeenCalled()
    expect(playNegativeConsequence).not.toHaveBeenCalled()
  })
})
