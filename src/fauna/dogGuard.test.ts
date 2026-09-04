import { describe, expect, it } from 'vitest'
import {
  type DogGuardWolfCandidate,
  resolveDogBarkStimulus,
  resolveDogGuardTarget,
} from './dogGuard'

const HOME = { x: 0, z: 0 }
const OWN_RADIUS = 40
const ASSIST_RADIUS = 20

function wolf(overrides: Partial<DogGuardWolfCandidate>): DogGuardWolfCandidate {
  return { id: 'wolf-1', x: 5, z: 0, dead: false, npcTarget: null, ...overrides }
}

describe('resolveDogGuardTarget', () => {
  it('own-household threat outranks a simultaneous foreign-household threat', () => {
    const result = resolveDogGuardTarget(
      HOME,
      'house-1',
      [
        wolf({ id: 'wolf-foreign', x: 8, z: 0, npcTarget: { npcId: 'npc-foreign', homeId: 'house-2' } }),
        wolf({ id: 'wolf-own', x: 12, z: 0, npcTarget: { npcId: 'npc-own', homeId: 'house-1' } }),
      ],
      OWN_RADIUS,
      ASSIST_RADIUS,
    )
    expect(result).toEqual({ wolfId: 'wolf-own', protectedNpcId: 'npc-own', ownHousehold: true })
  })

  it('a nearby foreign-household NPC may still be protected when no own-household threat exists', () => {
    const result = resolveDogGuardTarget(
      HOME,
      'house-1',
      [wolf({ id: 'wolf-foreign', x: 5, z: 0, npcTarget: { npcId: 'npc-foreign', homeId: 'house-2' } })],
      OWN_RADIUS,
      ASSIST_RADIUS,
    )
    expect(result).toEqual({ wolfId: 'wolf-foreign', protectedNpcId: 'npc-foreign', ownHousehold: false })
  })

  it('a distant unrelated wolf attacking a foreign NPC is ignored (outside the tighter assist radius)', () => {
    const result = resolveDogGuardTarget(
      HOME,
      'house-1',
      [wolf({ x: ASSIST_RADIUS + 1, z: 0, npcTarget: { npcId: 'npc-foreign', homeId: 'house-2' } })],
      OWN_RADIUS,
      ASSIST_RADIUS,
    )
    expect(result).toBeNull()
  })

  it('even an own-household threat is dropped once the wolf is far enough from home (local defender, not settlement-wide police)', () => {
    const result = resolveDogGuardTarget(
      HOME,
      'house-1',
      [wolf({ x: OWN_RADIUS + 1, z: 0, npcTarget: { npcId: 'npc-own', homeId: 'house-1' } })],
      OWN_RADIUS,
      ASSIST_RADIUS,
    )
    expect(result).toBeNull()
  })

  it('a wolf merely present, not attacking anyone, never resolves a guard target', () => {
    const result = resolveDogGuardTarget(HOME, 'house-1', [wolf({ npcTarget: null })], OWN_RADIUS, ASSIST_RADIUS)
    expect(result).toBeNull()
  })

  it('a dead wolf is ignored even mid-attack (disengagement falls out of fresh recomputation, plan §13)', () => {
    const result = resolveDogGuardTarget(
      HOME,
      'house-1',
      [wolf({ dead: true, npcTarget: { npcId: 'npc-own', homeId: 'house-1' } })],
      OWN_RADIUS,
      ASSIST_RADIUS,
    )
    expect(result).toBeNull()
  })

  it('a dog with no ownerHouseId (unowned) never resolves an "own household" match', () => {
    const result = resolveDogGuardTarget(
      HOME,
      undefined,
      [wolf({ npcTarget: { npcId: 'npc', homeId: 'house-1' } })],
      OWN_RADIUS,
      ASSIST_RADIUS,
    )
    // Falls into the foreign/assist tier instead, still bounded by ASSIST_RADIUS.
    expect(result).toEqual({ wolfId: 'wolf-1', protectedNpcId: 'npc', ownHousehold: false })
  })
})

describe('resolveDogBarkStimulus', () => {
  const HOWL_RADIUS = 45
  const STRANGER_RADIUS = 10

  it('an active guard target outranks every other stimulus', () => {
    const stimulus = resolveDogBarkStimulus(
      HOME, 'house-1', true,
      [{ x: 100, z: 100 }], HOWL_RADIUS,
      [{ x: 1, z: 0, homeId: 'house-2' }], STRANGER_RADIUS,
    )
    expect(stimulus).toBe('guard')
  })

  it('a recent nearby wolf howl is a relevant stimulus even with no guard target', () => {
    const stimulus = resolveDogBarkStimulus(HOME, 'house-1', false, [{ x: 10, z: 0 }], HOWL_RADIUS, [], STRANGER_RADIUS)
    expect(stimulus).toBe('wolf-howl')
  })

  it('a distant wolf howl (outside the howl radius) triggers no alert at all — never a chase', () => {
    const stimulus = resolveDogBarkStimulus(
      HOME, 'house-1', false,
      [{ x: HOWL_RADIUS + 1, z: 0 }], HOWL_RADIUS,
      [], STRANGER_RADIUS,
    )
    expect(stimulus).toBeNull()
  })

  it('a foreign-household NPC right by the house is a stranger stimulus', () => {
    const stimulus = resolveDogBarkStimulus(
      HOME, 'house-1', false,
      [], HOWL_RADIUS,
      [{ x: 2, z: 0, homeId: 'house-2' }], STRANGER_RADIUS,
    )
    expect(stimulus).toBe('stranger')
  })

  it('an own-household NPC nearby is never a stranger stimulus', () => {
    const stimulus = resolveDogBarkStimulus(
      HOME, 'house-1', false,
      [], HOWL_RADIUS,
      [{ x: 2, z: 0, homeId: 'house-1' }], STRANGER_RADIUS,
    )
    expect(stimulus).toBeNull()
  })
})
