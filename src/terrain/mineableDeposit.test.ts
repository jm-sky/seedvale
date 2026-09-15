import { describe, expect, it } from 'vitest'
import type { NaturalResource } from './naturalResources'
import { caveSpatialContext, WORLD_SPATIAL_CONTEXT_SURFACE } from '../world/spatialContext'
import { hitsForRichness, recordMined, type ResourceDepletionState } from './depositMining'
import {
  depositMatchesQueryContext,
  mineableDepositFromNaturalResource,
  resolveDepositRemaining,
} from './mineableDeposit'

const surfaceGold: NaturalResource = {
  id: 'resource_1_2',
  type: 'gold',
  x: 10,
  z: 20,
  radius: 12,
  richness: 0.5,
}

describe('mineableDepositFromNaturalResource (plan world-018)', () => {
  it('adapts a surface ore without changing identity or adding explicit reserve', () => {
    const definition = mineableDepositFromNaturalResource(surfaceGold, () => 7)
    expect(definition).toEqual({
      id: 'resource_1_2',
      type: 'gold',
      x: 10,
      y: 7,
      z: 20,
      spatialContext: WORLD_SPATIAL_CONTEXT_SURFACE,
      richness: 0.5,
      radius: 12,
    })
    expect(definition?.initialReserve).toBeUndefined()
  })

  it('leaves non-ore environmental resources as settlement descriptors only', () => {
    expect(mineableDepositFromNaturalResource({ ...surfaceGold, type: 'fish' }, () => 0)).toBeNull()
  })
})

describe('resolveDepositRemaining / spatial filter (plan world-018)', () => {
  it('falls back to hitsForRichness when no explicit reserve is set', () => {
    const state: ResourceDepletionState = new Map()
    const remaining = resolveDepositRemaining(state, {
      id: 'resource_1_2',
      richness: 0.5,
    })
    expect(remaining).toBe(hitsForRichness(0.5))
  })

  it('rejects vertically overlapping wrong-domain candidates', () => {
    const caveGold = {
      spatialContext: caveSpatialContext('cave:abc'),
    }
    expect(depositMatchesQueryContext(caveGold, WORLD_SPATIAL_CONTEXT_SURFACE)).toBe(false)
    expect(depositMatchesQueryContext(caveGold, caveSpatialContext('cave:abc'))).toBe(true)
    expect(depositMatchesQueryContext(caveGold, caveSpatialContext('cave:other'))).toBe(false)
    expect(depositMatchesQueryContext({ spatialContext: WORLD_SPATIAL_CONTEXT_SURFACE }, WORLD_SPATIAL_CONTEXT_SURFACE)).toBe(true)
  })

  it('persisted remaining overrides reconstructed initial reserve exactly', () => {
    const state: ResourceDepletionState = new Map()
    recordMined(state, 'abandonedMine:aa:gold:interior-deep', 2)
    expect(resolveDepositRemaining(state, {
      id: 'abandonedMine:aa:gold:interior-deep',
      richness: 0.98,
      initialReserve: 180,
    })).toBe(2)
  })
})
