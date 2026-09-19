import { describe, expect, it } from 'vitest'
import type { DestinationAnimalThreat } from '../fauna/destinationThreatHooks'
import {
  assessDestinationThreat,
  DESTINATION_THREAT_INFLUENCE_RADIUS,
  HERBALIST_GATHER_RISK_PROFILE,
  type NpcDestinationThreatInput,
} from './npcDestinationThreat'

const DESTINATION = { x: 0, z: 0 }
const NEUTRAL_PROFILE = { id: 'neutral', toleranceAllowance: 0 }
const RISKIER_PROFILE = { id: 'riskier', toleranceAllowance: 0.3 }

function baseInput(overrides: Partial<NpcDestinationThreatInput> = {}): NpcDestinationThreatInput {
  return {
    destination: DESTINATION,
    threats: [],
    healthRatio: 1,
    hasMeleeCapability: false,
    hasRangedCapability: false,
    role: 'herbalist',
    neuroticism: 0.5,
    activityRiskProfile: NEUTRAL_PROFILE,
    ...overrides,
  }
}

function threat(overrides: Partial<DestinationAnimalThreat> & { animalId: string }): DestinationAnimalThreat {
  return { x: 0, z: 0, humanDanger: 0.5, ...overrides }
}

describe('assessDestinationThreat', () => {
  it('accepts a destination with no threats regardless of tolerance', () => {
    const result = assessDestinationThreat(baseInput({
      healthRatio: 0,
      neuroticism: 1,
      activityRiskProfile: HERBALIST_GATHER_RISK_PROFILE,
    }))
    expect(result.riskScore).toBe(0)
    expect(result.acceptable).toBe(true)
  })

  it('scores a closer equivalent threat as riskier than a farther one', () => {
    const closer = assessDestinationThreat(baseInput({ threats: [threat({ animalId: 'a', x: 2, z: 0 })] }))
    const farther = assessDestinationThreat(baseInput({ threats: [threat({ animalId: 'a', x: 10, z: 0 })] }))
    expect(closer.riskScore).toBeGreaterThan(farther.riskScore)
  })

  it('ignores a threat beyond the influence radius', () => {
    const result = assessDestinationThreat(baseInput({
      threats: [threat({ animalId: 'a', x: DESTINATION_THREAT_INFLUENCE_RADIUS + 1, z: 0 })],
    }))
    expect(result.riskScore).toBe(0)
  })

  it('scores two equal threats as riskier than one', () => {
    const one = assessDestinationThreat(baseInput({ threats: [threat({ animalId: 'a' })] }))
    const two = assessDestinationThreat(baseInput({
      threats: [threat({ animalId: 'a' }), threat({ animalId: 'b' })],
    }))
    expect(two.riskScore).toBeGreaterThan(one.riskScore)
  })

  it('keeps group aggregation bounded rather than exploding linearly', () => {
    const many = Array.from({ length: 20 }, (_, i) => threat({ animalId: `w${i}` }))
    const dominant = assessDestinationThreat(baseInput({ threats: [threat({ animalId: 'solo' })] })).riskScore
    const group = assessDestinationThreat(baseInput({ threats: many })).riskScore
    // Geometric-series bound: never reaches (and never exceeds) 2x the
    // dominant single contribution, however many threats stack.
    expect(group).toBeLessThan(dominant * 2)
    expect(group).toBeGreaterThan(dominant * 1.9)
  })

  it('lower HP lowers tolerance', () => {
    const healthy = assessDestinationThreat(baseInput({ healthRatio: 1 }))
    const hurt = assessDestinationThreat(baseInput({ healthRatio: 0.1 }))
    expect(hurt.toleranceScore).toBeLessThan(healthy.toleranceScore)
  })

  it('a usable weapon raises tolerance', () => {
    const unarmed = assessDestinationThreat(baseInput({ hasMeleeCapability: false, hasRangedCapability: false }))
    const armed = assessDestinationThreat(baseInput({ hasMeleeCapability: true }))
    expect(armed.toleranceScore).toBeGreaterThan(unarmed.toleranceScore)
  })

  it('ranged capability alone raises tolerance the same way melee does', () => {
    const unarmed = assessDestinationThreat(baseInput({ hasMeleeCapability: false, hasRangedCapability: false }))
    const ranged = assessDestinationThreat(baseInput({ hasRangedCapability: true }))
    expect(ranged.toleranceScore).toBeGreaterThan(unarmed.toleranceScore)
    expect(ranged.combatContribution).toBeGreaterThan(0)
  })

  it('higher neuroticism lowers tolerance', () => {
    const calm = assessDestinationThreat(baseInput({ neuroticism: 0 }))
    const anxious = assessDestinationThreat(baseInput({ neuroticism: 1 }))
    expect(anxious.toleranceScore).toBeLessThan(calm.toleranceScore)
  })

  it('hunter/guard bias is bounded and only applies with real combat capability', () => {
    const neutralRole = assessDestinationThreat(baseInput({ role: 'herbalist', hasMeleeCapability: true }))
    const hunterArmed = assessDestinationThreat(baseInput({ role: 'hunter', hasMeleeCapability: true }))
    const hunterUnarmed = assessDestinationThreat(baseInput({ role: 'hunter', hasMeleeCapability: false, hasRangedCapability: false }))
    expect(hunterArmed.toleranceScore).toBeGreaterThan(neutralRole.toleranceScore)
    expect(hunterArmed.roleContribution).toBeLessThan(0.2)
    // Role alone (no usable weapon) never grants the bias.
    expect(hunterUnarmed.roleContribution).toBe(0)
  })

  it('a hunter without usable combat capability or with very low HP can still reject danger', () => {
    const result = assessDestinationThreat(baseInput({
      role: 'hunter',
      hasMeleeCapability: false,
      hasRangedCapability: false,
      healthRatio: 0.05,
      threats: [threat({ animalId: 'bear', humanDanger: 0.65 })],
    }))
    expect(result.acceptable).toBe(false)
  })

  it('conservative gathering accepts less risk than a deliberately riskier activity profile', () => {
    const conservative = assessDestinationThreat(baseInput({ activityRiskProfile: HERBALIST_GATHER_RISK_PROFILE }))
    const riskier = assessDestinationThreat(baseInput({ activityRiskProfile: RISKIER_PROFILE }))
    expect(conservative.toleranceScore).toBeLessThan(riskier.toleranceScore)
  })

  it('is deterministic and treats an exact tie as acceptable', () => {
    // Default tolerance (neutral profile, full health, no combat capability,
    // neutral role/neuroticism) is exactly BASE(0.3) + HEALTH(0.5) = 0.8 —
    // a threat contributing exactly 0.8 at zero distance ties it exactly.
    const input = baseInput({ threats: [threat({ animalId: 'a', humanDanger: 0.8, x: 0, z: 0 })], activityRiskProfile: NEUTRAL_PROFILE })
    const first = assessDestinationThreat(input)
    const second = assessDestinationThreat(input)
    expect(first).toEqual(second)
    expect(first.riskScore).toBeCloseTo(first.toleranceScore, 10)
    expect(first.acceptable).toBe(true)
  })
})
