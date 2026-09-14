import { describe, expect, it } from 'vitest'
import {
  CLOSE_ATTACK_CHANCE,
  type PredatorHumanDecisionInput,
  PROVOKED_FLEE_HP_RATIO,
} from './predatorHumanDecision'
import {
  createPredatorIntentCommitment,
  resolveCommittedPredatorIntent,
} from './predatorIntentCommitment'

const closeWolf = {
  hunger: 0.3,
  humanDistance: 2,
  playerNoticeRange: 10,
  playerPanicRange: 3,
  fireNearby: false,
  nearbyHumanCount: 1,
  kind: 'wolf',
  selfHpRatio: 1,
  provoked: false,
  aggressionRoll: 0,
} as const satisfies PredatorHumanDecisionInput

const hungryFarWolf = {
  ...closeWolf,
  hunger: 0.95,
  humanDistance: 9,
} as const satisfies PredatorHumanDecisionInput

function tick(
  commitment: ReturnType<typeof createPredatorIntentCommitment>,
  input: PredatorHumanDecisionInput,
  nextRoll: number,
  extras: { dt?: number, targetKey?: string | null, forceReroll?: boolean } = {},
) {
  return resolveCommittedPredatorIntent(commitment, {
    input,
    dt: extras.dt ?? 0.2,
    targetKey: extras.targetKey === undefined ? 'player' : extras.targetKey,
    nextRoll,
    forceReroll: extras.forceReroll,
  })
}

describe('resolveCommittedPredatorIntent — stable close encounter', () => {
  it('does not thrash attack/flee when successive ticks supply a new roll', () => {
    const commitment = createPredatorIntentCommitment()
    // Close territorial branch: roll < 0.3 attack, else flee. Alternating
    // rolls are exactly the 0.2 s Math.random() bug.
    const rolls = [
      CLOSE_ATTACK_CHANCE - 0.01,
      CLOSE_ATTACK_CHANCE,
      0.05,
      0.9,
      0.2,
      0.8,
      0.01,
      0.99,
      0.15,
      0.7,
    ]
    const intents = rolls.map((nextRoll) => tick(commitment, closeWolf, nextRoll))
    expect(intents[0]).toBe('attack')
    expect(new Set(intents)).toEqual(new Set(['attack']))
  })

  it('holds a flee roll the same way — later aggressive rolls do not reverse it', () => {
    const commitment = createPredatorIntentCommitment()
    const first = tick(commitment, closeWolf, CLOSE_ATTACK_CHANCE)
    expect(first).toBe('flee')
    expect(tick(commitment, closeWolf, 0)).toBe('flee')
    expect(tick(commitment, closeWolf, CLOSE_ATTACK_CHANCE - 0.01)).toBe('flee')
  })

  it('does not let proximity score drift break an in-flight attack', () => {
    const commitment = createPredatorIntentCommitment()
    expect(tick(commitment, hungryFarWolf, CLOSE_ATTACK_CHANCE)).toBe('attack')
    // Same frozen roll at panic range would score flee (close territorial
    // does not override when the roll is at/above CLOSE_ATTACK_CHANCE).
    const closeHungry = { ...hungryFarWolf, humanDistance: 2 }
    expect(tick(commitment, closeHungry, CLOSE_ATTACK_CHANCE)).toBe('attack')
    expect(commitment.remainingSec).toBeGreaterThan(0)
  })
})

describe('resolveCommittedPredatorIntent — NPC', () => {
  it('is stable for the same NPC target across successive rolls', () => {
    const commitment = createPredatorIntentCommitment()
    const first = tick(commitment, closeWolf, CLOSE_ATTACK_CHANCE - 0.01, { targetKey: 'npc-1' })
    expect(first).toBe('attack')
    expect(tick(commitment, closeWolf, CLOSE_ATTACK_CHANCE, { targetKey: 'npc-1' })).toBe('attack')
    expect(tick(commitment, closeWolf, 0.95, { targetKey: 'npc-1' })).toBe('attack')
  })

  it('treats an NPC id change as a new encounter and may adopt a new roll', () => {
    const commitment = createPredatorIntentCommitment()
    expect(tick(commitment, closeWolf, CLOSE_ATTACK_CHANCE - 0.01, { targetKey: 'npc-1' })).toBe('attack')
    expect(tick(commitment, closeWolf, CLOSE_ATTACK_CHANCE, { targetKey: 'npc-2' })).toBe('flee')
    expect(commitment.targetKey).toBe('npc-2')
  })
})

describe('resolveCommittedPredatorIntent — meaningful override', () => {
  it('breaks an attack commitment when provoked HP drops below the flee floor', () => {
    const commitment = createPredatorIntentCommitment()
    const healthyProvoked = {
      ...closeWolf,
      hunger: 0.3,
      humanDistance: 8,
      provoked: true,
      selfHpRatio: 0.8,
    }
    expect(tick(commitment, healthyProvoked, 0)).toBe('attack')
    const wounded = { ...healthyProvoked, selfHpRatio: PROVOKED_FLEE_HP_RATIO - 0.1 }
    expect(tick(commitment, wounded, 0)).toBe('flee')
  })

  it('breaks an attack commitment when fire appears', () => {
    const commitment = createPredatorIntentCommitment()
    expect(tick(commitment, hungryFarWolf, 0)).toBe('attack')
    expect(tick(commitment, { ...hungryFarWolf, fireNearby: true }, 0)).toBe('flee')
  })

  it('force-rerolls on provocation so a coward roll can still retaliate', () => {
    const commitment = createPredatorIntentCommitment()
    expect(tick(commitment, closeWolf, CLOSE_ATTACK_CHANCE)).toBe('flee')
    const provoked = {
      ...closeWolf,
      hunger: 0.3,
      humanDistance: 8,
      provoked: true,
      selfHpRatio: 0.8,
    }
    expect(tick(commitment, provoked, 0, { forceReroll: true })).toBe('attack')
  })
})

describe('resolveCommittedPredatorIntent — encounter lifecycle', () => {
  it('clears on a null target and starts fresh on the next encounter', () => {
    const commitment = createPredatorIntentCommitment()
    expect(tick(commitment, closeWolf, CLOSE_ATTACK_CHANCE - 0.01)).toBe('attack')
    expect(tick(commitment, closeWolf, 0, { targetKey: null })).toBeNull()
    expect(commitment.targetKey).toBeNull()
    expect(tick(commitment, closeWolf, CLOSE_ATTACK_CHANCE)).toBe('flee')
  })

  it('may switch after the commitment window with the frozen roll', () => {
    const commitment = createPredatorIntentCommitment()
    expect(tick(commitment, hungryFarWolf, CLOSE_ATTACK_CHANCE)).toBe('attack')
    const closeHungry = { ...hungryFarWolf, humanDistance: 2 }
    expect(tick(commitment, closeHungry, CLOSE_ATTACK_CHANCE)).toBe('attack')
    const remaining = commitment.remainingSec
    expect(remaining).toBeGreaterThan(0)
    expect(tick(commitment, closeHungry, CLOSE_ATTACK_CHANCE, { dt: remaining })).toBe('flee')
  })
})
