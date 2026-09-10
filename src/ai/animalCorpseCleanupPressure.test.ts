import { describe, expect, it } from 'vitest'
import type { AnimalCorpseCleanupCandidate } from '../settlement/animalCorpseSanitation'
import type { NpcDecisionTarget } from './weatherPressure'
import { pickActionKind } from '../simulation'
import { resolveAnimalCorpseCleanupPressure } from './animalCorpseCleanupPressure'

function candidate(overrides: Partial<AnimalCorpseCleanupCandidate> = {}): AnimalCorpseCleanupCandidate {
  return {
    animalId: 'rat-1',
    kind: 'rat',
    x: 4,
    z: 0,
    phase: 'fresh',
    meatHarvested: false,
    held: false,
    foodClaimed: false,
    cleanupClaimantNpcId: null,
    responsibleHouseholdId: 'h-a',
    ...overrides,
  }
}

describe('resolveAnimalCorpseCleanupPressure (plan settlements-npcs-029)', () => {
  const claimant = {
    claimantId: 'npc-1',
    claimantHouseholdId: 'h-a',
    claimantPosition: { x: 0, z: 0 },
  }

  it('does not require a fake NeedId in arbitration', () => {
    const pressure = resolveAnimalCorpseCleanupPressure({
      ...claimant,
      candidates: [candidate({ phase: 'rotting' })],
    })
    expect(pressure.score).toBeGreaterThan(0)
    expect(pressure.animalId).toBe('rat-1')
    const winner = pickActionKind<NpcDecisionTarget>(
      [{ kind: 'idle', score: 0.12 }, { kind: 'cleanAnimalCorpse', score: pressure.score }],
      'idle',
    )
    expect(winner).toBe('cleanAnimalCorpse')
  })

  it('scores rotting higher than fresh, and bones remain eligible', () => {
    const fresh = resolveAnimalCorpseCleanupPressure({
      ...claimant,
      candidates: [candidate({ phase: 'fresh' })],
    })
    const rotting = resolveAnimalCorpseCleanupPressure({
      ...claimant,
      candidates: [candidate({ phase: 'rotting' })],
    })
    const bones = resolveAnimalCorpseCleanupPressure({
      ...claimant,
      candidates: [candidate({ phase: 'bones' })],
    })
    expect(rotting.score).toBeGreaterThan(fresh.score)
    expect(fresh.score).toBeGreaterThan(bones.score)
    expect(bones.score).toBeGreaterThan(0)
    expect(bones.animalId).toBe('rat-1')
  })

  it('rejects a corpse owned by another household', () => {
    const pressure = resolveAnimalCorpseCleanupPressure({
      ...claimant,
      candidates: [candidate({ responsibleHouseholdId: 'h-b' })],
    })
    expect(pressure.score).toBe(0)
    expect(pressure.animalId).toBeNull()
    expect(pressure.rejectionReason).toBe('other-household')
  })

  it('rejects food-claimed and other-NPC cleanup-claimed corpses', () => {
    expect(resolveAnimalCorpseCleanupPressure({
      ...claimant,
      candidates: [candidate({ foodClaimed: true })],
    }).rejectionReason).toBe('food-claimed')
    expect(resolveAnimalCorpseCleanupPressure({
      ...claimant,
      candidates: [candidate({ cleanupClaimantNpcId: 'npc-2' })],
    }).rejectionReason).toBe('cleanup-claimed')
  })

  it('keeps a corpse already claimed by this NPC', () => {
    const pressure = resolveAnimalCorpseCleanupPressure({
      ...claimant,
      candidates: [candidate({ cleanupClaimantNpcId: 'npc-1', held: true })],
    })
    expect(pressure.animalId).toBe('rat-1')
    expect(pressure.score).toBeGreaterThan(0)
  })

  it('increases pressure boundedly when several local corpses exist', () => {
    const one = resolveAnimalCorpseCleanupPressure({
      ...claimant,
      candidates: [candidate({ animalId: 'a', phase: 'fresh' })],
    })
    const many = resolveAnimalCorpseCleanupPressure({
      ...claimant,
      candidates: [
        candidate({ animalId: 'a', phase: 'fresh' }),
        candidate({ animalId: 'b', phase: 'fresh', x: 5 }),
        candidate({ animalId: 'c', phase: 'fresh', x: 6 }),
        candidate({ animalId: 'd', phase: 'fresh', x: 7 }),
      ],
    })
    expect(many.score).toBeGreaterThan(one.score)
    const extra = resolveAnimalCorpseCleanupPressure({
      ...claimant,
      candidates: [
        candidate({ animalId: 'a', phase: 'fresh' }),
        candidate({ animalId: 'b', phase: 'fresh', x: 5 }),
        candidate({ animalId: 'c', phase: 'fresh', x: 6 }),
        candidate({ animalId: 'd', phase: 'fresh', x: 7 }),
        candidate({ animalId: 'e', phase: 'fresh', x: 8 }),
        candidate({ animalId: 'f', phase: 'fresh', x: 9 }),
      ],
    })
    expect(extra.score - many.score).toBeLessThan(many.score - one.score + 0.001)
  })
})
