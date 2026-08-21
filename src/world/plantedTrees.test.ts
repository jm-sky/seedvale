import { describe, expect, it } from 'vitest'
import type { TreeEnvSample } from './treeLifecycle'
import { makePlantedTreeId, parsePlantedTrees, pickPlantedTreeSpecies } from './plantedTrees'
import { makeTreeId } from './treeLifecycle'

describe('makePlantedTreeId', () => {
  it('is deterministic for the same seed/position', () => {
    expect(makePlantedTreeId(7, 10.04, -3.01)).toBe(makePlantedTreeId(7, 10.04, -3.01))
  })

  it('differs across seeds/positions', () => {
    expect(makePlantedTreeId(7, 10, -3)).not.toBe(makePlantedTreeId(8, 10, -3))
    expect(makePlantedTreeId(7, 10, -3)).not.toBe(makePlantedTreeId(7, 11, -3))
  })

  it('never collides with a procedural tree id at the same position (distinct namespace)', () => {
    const planted = makePlantedTreeId(7, 10, -3)
    const procedural = makeTreeId(7, 10, -3, 0)
    expect(planted).not.toBe(procedural)
    expect(planted.startsWith('planted:')).toBe(true)
  })
})

describe('pickPlantedTreeSpecies', () => {
  const env: TreeEnvSample = { biome: { desert: 0, swamp: 0, forest: 1 }, moisture: 0.8, altitude01: 0.15, mountainRidge: 0 }

  it('returns a valid species index across the full random range', () => {
    for (const r of [0, 0.25, 0.5, 0.75, 1]) {
      const index = pickPlantedTreeSpecies(env, r)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(index)).toBe(true)
    }
  })

  it('is deterministic for the same inputs', () => {
    expect(pickPlantedTreeSpecies(env, 0.42)).toBe(pickPlantedTreeSpecies(env, 0.42))
  })
})

describe('parsePlantedTrees', () => {
  const valid = { id: 'planted:1:2:3', x: 2, z: 3, speciesIndex: 1, sizeClass: 'small', sizeJitter: 0.4, rotationY: 1.2 }

  it('keeps well-formed records', () => {
    expect(parsePlantedTrees([valid])).toEqual([valid])
  })

  it('drops malformed entries without throwing', () => {
    expect(parsePlantedTrees(null)).toEqual([])
    expect(parsePlantedTrees('nope')).toEqual([])
    expect(parsePlantedTrees([{ ...valid, sizeClass: 'huge' }])).toEqual([])
    expect(parsePlantedTrees([{ ...valid, x: 'nope' }])).toEqual([])
    expect(parsePlantedTrees([valid, { not: 'a tree' }])).toEqual([valid])
  })
})
