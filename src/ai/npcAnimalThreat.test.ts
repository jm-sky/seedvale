import { describe, expect, it } from 'vitest'
import type { CombatTargetHandle } from '../combat/combatIntent'
import {
  decideAnimalThreatResponse,
  IMMEDIATE_ANIMAL_THREAT_RADIUS,
  senseImmediateAnimalThreat,
  type ThreateningAnimalCandidate,
} from './npcAnimalThreat'

function fakeTarget(alive = true): CombatTargetHandle {
  return {
    ref: { id: 'wolf-1', kind: 'animal' },
    getPosition: () => (alive ? { x: 0, z: 0 } : null),
    isAlive: () => alive,
    applyDamage: () => {},
  }
}

describe('senseImmediateAnimalThreat (plan 179 §7/§10/§12)', () => {
  it('returns the nearest alive candidate within radius', () => {
    const near: ThreateningAnimalCandidate = { animalId: 'near', kind: 'wolf', x: 2, z: 0, target: fakeTarget() }
    const far: ThreateningAnimalCandidate = { animalId: 'far', kind: 'wolf', x: 9, z: 0, target: fakeTarget() }
    const threat = senseImmediateAnimalThreat(0, 0, [far, near])
    expect(threat?.animalId).toBe('near')
    expect(threat?.distance).toBe(2)
  })

  it('ignores a candidate outside the radius', () => {
    const outside: ThreateningAnimalCandidate = {
      animalId: 'outside',
      kind: 'wolf',
      x: IMMEDIATE_ANIMAL_THREAT_RADIUS + 5,
      z: 0,
      target: fakeTarget(),
    }
    expect(senseImmediateAnimalThreat(0, 0, [outside])).toBeNull()
  })

  it('ignores a dead candidate (target.isAlive() false)', () => {
    const dead: ThreateningAnimalCandidate = { animalId: 'dead', kind: 'wolf', x: 1, z: 0, target: fakeTarget(false) }
    expect(senseImmediateAnimalThreat(0, 0, [dead])).toBeNull()
  })

  it('returns null with no candidates', () => {
    expect(senseImmediateAnimalThreat(0, 0, [])).toBeNull()
  })
})

describe('decideAnimalThreatResponse (plan 179 §8/§14/§15)', () => {
  it('a healthy, armed NPC defends', () => {
    expect(
      decideAnimalThreatResponse({ hasMeleeCapability: true, hasRangedCapability: false, healthRatio: 1 }),
    ).toBe('defend')
  })

  it('an unarmed NPC always flees regardless of health', () => {
    expect(
      decideAnimalThreatResponse({ hasMeleeCapability: false, hasRangedCapability: false, healthRatio: 1 }),
    ).toBe('flee')
  })

  it('a badly-hurt armed NPC flees instead of defending', () => {
    expect(
      decideAnimalThreatResponse({ hasMeleeCapability: true, hasRangedCapability: false, healthRatio: 0.1 }),
    ).toBe('flee')
  })

  it('ranged capability alone is enough to defend', () => {
    expect(
      decideAnimalThreatResponse({ hasMeleeCapability: false, hasRangedCapability: true, healthRatio: 1 }),
    ).toBe('defend')
  })
})
