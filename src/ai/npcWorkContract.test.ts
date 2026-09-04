import { describe, expect, it } from 'vitest'
import { createWorkContractRecord, type WorkContractRecord } from '../world/workContract'
import {
  CONTRACT_TOTAL_CONSTRUCTION_WORK_HOURS,
  scoreWorkContractOpportunity,
  selectBestWorkContract,
  type WorkContractEvaluationInput,
} from './npcWorkContract'

function makeContract(rewardCoins: number, x = 0, z = 0): WorkContractRecord {
  return createWorkContractRecord({ id: 'workContract:1', employer: 'player', targetId: 'well:1', x, z, rewardCoins, now: 1 })
}

function baseInput(overrides: Partial<WorkContractEvaluationInput> = {}): WorkContractEvaluationInput {
  return {
    npcX: 0,
    npcZ: 0,
    role: 'woodcutter',
    scheduledActivity: 'home',
    hasWorkplace: true,
    dayLengthSec: 600,
    walkSpeed: 2.4,
    ...overrides,
  }
}

describe('scoreWorkContractOpportunity', () => {
  it('is a positive-scoring, deterministic function of reward for a nearby, off-duty NPC', () => {
    const contract = makeContract(100)
    const score = scoreWorkContractOpportunity(contract, baseInput())
    expect(score).toBe(scoreWorkContractOpportunity(contract, baseInput()))
    expect(score).toBeGreaterThan(0)
  })

  it('a low reward scores lower than a high one, all else equal', () => {
    const input = baseInput()
    const low = scoreWorkContractOpportunity(makeContract(10), input)
    const high = scoreWorkContractOpportunity(makeContract(100), input)
    expect(high).toBeGreaterThan(low)
  })

  it('distance lowers the score (travel cost)', () => {
    const input = baseInput()
    const near = scoreWorkContractOpportunity(makeContract(50, 0, 0), input)
    const far = scoreWorkContractOpportunity(makeContract(50, 500, 500), input)
    expect(far).toBeLessThan(near)
  })

  it('a scheduled work conflict with a real workplace lowers the score', () => {
    const contract = makeContract(50)
    const free = scoreWorkContractOpportunity(contract, baseInput({ scheduledActivity: 'home' }))
    const busy = scoreWorkContractOpportunity(contract, baseInput({ scheduledActivity: 'work', hasWorkplace: true }))
    expect(busy).toBeLessThan(free)
  })

  it('a scheduled work conflict with no real workplace does not apply the penalty', () => {
    const contract = makeContract(50)
    const noWorkplace = scoreWorkContractOpportunity(contract, baseInput({ scheduledActivity: 'work', hasWorkplace: false }))
    const free = scoreWorkContractOpportunity(contract, baseInput({ scheduledActivity: 'home' }))
    expect(noWorkplace).toBe(free)
  })

  it('role suitability shifts the score (a guard is less suited than a woodcutter)', () => {
    const contract = makeContract(50)
    const woodcutter = scoreWorkContractOpportunity(contract, baseInput({ role: 'woodcutter', hasWorkplace: false }))
    const guard = scoreWorkContractOpportunity(contract, baseInput({ role: 'guard', hasWorkplace: false }))
    expect(woodcutter).toBeGreaterThan(guard)
  })

  it('always charges the full construction-duration cost regardless of contract state', () => {
    const contract = makeContract(50)
    // A fresh, never-accepted contract always represents the full estimate
    // — construction has not started (plan §4: contracts are created with a
    // brand new pit-stage well).
    expect(CONTRACT_TOTAL_CONSTRUCTION_WORK_HOURS).toBeGreaterThan(0)
    // baseInput's role is 'woodcutter' (+5 suitability, see CONTRACT_SUITABILITY_BY_ROLE).
    const score = scoreWorkContractOpportunity(contract, baseInput({ hasWorkplace: false }))
    expect(score).toBe(50 + 5 - CONTRACT_TOTAL_CONSTRUCTION_WORK_HOURS * 3)
  })
})

describe('selectBestWorkContract', () => {
  it('picks the highest-scoring candidate among several', () => {
    const cheap = makeContract(10)
    const rich = { ...makeContract(200), id: 'workContract:2' }
    const { best, scored } = selectBestWorkContract([cheap, rich], baseInput({ hasWorkplace: false }))
    expect(best?.contract.id).toBe('workContract:2')
    expect(scored).toHaveLength(2)
  })

  it('returns null when every candidate scores at or below zero (never a fixed reward threshold)', () => {
    const farAway = makeContract(15, 10000, 10000)
    const { best } = selectBestWorkContract([farAway], baseInput())
    expect(best).toBeNull()
  })

  it('returns null for an empty candidate list', () => {
    const { best, scored } = selectBestWorkContract([], baseInput())
    expect(best).toBeNull()
    expect(scored).toEqual([])
  })
})
