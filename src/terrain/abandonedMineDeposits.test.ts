import { describe, expect, it } from 'vitest'
import type { AbandonedMineLandmark } from '../world/caves/abandonedMineLandmark'
import type { CaveInteriorPlacementCandidate, CaveInteriorPlacementView } from '../world/caves/caveInteriorPlacement'
import { createSeededRandom } from '../world/parseSeed'
import { WORLD_SPATIAL_CONTEXT_SURFACE } from '../world/spatialContext'
import {
  type AbandonedMineDepositInput,
  allocateIntegerReserves,
  generateAbandonedMineGoldDeposits,
  mineGoldDepositId,
  pickMineGoldTotalReserve,
} from './abandonedMineDeposits'

const LANDMARK: AbandonedMineLandmark = {
  mineId: 'abandonedMine:00aabbcc',
  caveId: 'cave:mine-1',
  x: 400,
  z: -200,
  caveSource: 'existing-cave',
}

function candidate(
  overrides: Partial<CaveInteriorPlacementCandidate> & Pick<CaveInteriorPlacementCandidate, 'nodeId' | 'depthFromEntrance'>,
): CaveInteriorPlacementCandidate {
  return {
    kind: 'chamber',
    x: LANDMARK.x + 8 + overrides.depthFromEntrance * 6,
    y: 40 - overrides.depthFromEntrance * 3,
    z: LANDMARK.z + 14 + overrides.depthFromEntrance * 4,
    targetWidth: 6,
    ...overrides,
  }
}

function placement(candidates: CaveInteriorPlacementCandidate[]): CaveInteriorPlacementView {
  return {
    caveId: LANDMARK.caveId,
    entrance: { x: LANDMARK.x, y: 52, z: LANDMARK.z, yaw: 0.4 },
    candidates,
  }
}

function input(overrides: Partial<AbandonedMineDepositInput> = {}): AbandonedMineDepositInput {
  return {
    worldSeed: 42,
    landmark: LANDMARK,
    placement: placement([
      candidate({ nodeId: 'widening-bend', depthFromEntrance: 1, kind: 'widening', targetWidth: 4.2 }),
      candidate({ nodeId: 'chamber', depthFromEntrance: 2, targetWidth: 7 }),
      candidate({ nodeId: 'branch-chamber', depthFromEntrance: 3, x: LANDMARK.x - 12, z: LANDMARK.z + 28 }),
    ]),
    sampleHeight: () => 55,
    waterLevel: 8,
    spatialContextAt: () => WORLD_SPATIAL_CONTEXT_SURFACE,
    ...overrides,
  }
}

describe('mine gold reserve helpers (plan world-018)', () => {
  it('picks totals in 500–1000, biased around 750', () => {
    const totals: number[] = []
    for (let seed = 1; seed <= 400; seed++) {
      totals.push(pickMineGoldTotalReserve(createSeededRandom(seed)))
    }
    expect(Math.min(...totals)).toBeGreaterThanOrEqual(500)
    expect(Math.max(...totals)).toBeLessThanOrEqual(1000)
    const mean = totals.reduce((sum, value) => sum + value, 0) / totals.length
    expect(mean).toBeGreaterThan(700)
    expect(mean).toBeLessThan(800)
  })

  it('allocates integer reserves that sum exactly to the selected total', () => {
    const weights = [1, 0.9, 1.15, 1.3, 1.45]
    const result = allocateIntegerReserves(753, weights)
    expect(result).toHaveLength(5)
    expect(result.reduce((sum, value) => sum + value, 0)).toBe(753)
    expect(result.every((value) => value >= 20)).toBe(true)
  })

  it('four-slot fallback keeps the same selected total', () => {
    const four = allocateIntegerReserves(753, [1, 1.15, 1.3, 1.45])
    expect(four).toHaveLength(4)
    expect(four.reduce((sum, value) => sum + value, 0)).toBe(753)
  })
})

describe('generateAbandonedMineGoldDeposits (plan world-018)', () => {
  it('derives stable ids from mineId + semantic slot, not candidate order', () => {
    const a = generateAbandonedMineGoldDeposits(input())
    const shuffled = generateAbandonedMineGoldDeposits(input({
      placement: placement([
        candidate({ nodeId: 'branch-chamber', depthFromEntrance: 3, x: LANDMARK.x - 12, z: LANDMARK.z + 28 }),
        candidate({ nodeId: 'chamber', depthFromEntrance: 2, targetWidth: 7 }),
        candidate({ nodeId: 'widening-bend', depthFromEntrance: 1, kind: 'widening', targetWidth: 4.2 }),
      ]),
    }))
    expect(a.map((deposit) => deposit.id).sort()).toEqual(shuffled.map((deposit) => deposit.id).sort())
    expect(a.map((deposit) => deposit.id)).toContain(mineGoldDepositId(LANDMARK.mineId, 'interior-shallow'))
    expect(a.map((deposit) => deposit.id)).toContain(mineGoldDepositId(LANDMARK.mineId, 'interior-deep'))
  })

  it('targets five deposits with at least one exterior and two interior', () => {
    const deposits = generateAbandonedMineGoldDeposits(input())
    expect(deposits).toHaveLength(5)
    const exterior = deposits.filter((deposit) => deposit.spatialContext.kind === 'surface')
    const interior = deposits.filter((deposit) => deposit.spatialContext.kind === 'cave')
    expect(exterior.length).toBeGreaterThanOrEqual(1)
    expect(interior.length).toBeGreaterThanOrEqual(2)
    expect(interior.every((deposit) => deposit.spatialContext.kind === 'cave' && deposit.spatialContext.caveId === LANDMARK.caveId)).toBe(true)
  })

  it('keeps interior Y from Cave V2 candidates, never sampleHeight', () => {
    const deposits = generateAbandonedMineGoldDeposits(input({ sampleHeight: () => 999 }))
    const interior = deposits.filter((deposit) => deposit.spatialContext.kind === 'cave')
    expect(interior.length).toBeGreaterThanOrEqual(2)
    expect(interior.every((deposit) => deposit.y !== 999 && deposit.y < 80)).toBe(true)
  })

  it('distributes the selected total across the actual slots exactly', () => {
    const deposits = generateAbandonedMineGoldDeposits(input())
    const total = deposits.reduce((sum, deposit) => sum + (deposit.initialReserve ?? 0), 0)
    expect(total).toBeGreaterThanOrEqual(500)
    expect(total).toBeLessThanOrEqual(1000)
    expect(deposits.every((deposit) => (deposit.initialReserve ?? 0) >= 20)).toBe(true)
    expect(deposits.every((deposit) => deposit.type === 'gold')).toBe(true)
  })

  it('four-node fallback preserves the same selected total', () => {
    const five = generateAbandonedMineGoldDeposits(input())
    const four = generateAbandonedMineGoldDeposits(input({
      placement: placement([
        candidate({ nodeId: 'widening-bend', depthFromEntrance: 1, kind: 'widening' }),
        candidate({ nodeId: 'chamber', depthFromEntrance: 2 }),
      ]),
    }))
    expect(four.length).toBe(4)
    const fiveTotal = five.reduce((sum, deposit) => sum + (deposit.initialReserve ?? 0), 0)
    const fourTotal = four.reduce((sum, deposit) => sum + (deposit.initialReserve ?? 0), 0)
    expect(fourTotal).toBe(fiveTotal)
  })

  it('is independent of unrelated RNG call order and identical for the same seed/mine', () => {
    const unrelated = createSeededRandom(99)
    unrelated()
    unrelated()
    const a = generateAbandonedMineGoldDeposits(input())
    const b = generateAbandonedMineGoldDeposits(input())
    expect(a).toEqual(b)
    const otherSeed = generateAbandonedMineGoldDeposits(input({ worldSeed: 99 }))
    expect(otherSeed.map((deposit) => deposit.initialReserve)).not.toEqual(a.map((deposit) => deposit.initialReserve))
  })
})
