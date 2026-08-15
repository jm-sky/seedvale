import { describe, expect, it } from 'vitest'
import type { ChunkManager } from './chunkManager'
import { sampleFootstepSurface } from './footstepSurface'

function stub(overrides: {
  height?: number
  waterLevel?: number
  seed?: number
  ridge?: number
  desert?: number
  roads?: { ax: number, az: number, bx: number, bz: number, halfWidth: number }[]
}): ChunkManager {
  return {
    sampleHeight: () => overrides.height ?? 8,
    waterLevel: overrides.waterLevel ?? 0,
    seed: overrides.seed ?? 1,
    sampleMountainRidge: () => overrides.ridge ?? 0,
    roadCorridorsNear: () => overrides.roads ?? [],
    sampleTreeEnv: () => ({
      biome: { desert: overrides.desert ?? 0, swamp: 0, forest: 1 },
    }),
  } as unknown as ChunkManager
}

describe('sampleFootstepSurface', () => {
  it('classifies the shore band as sand', () => {
    expect(sampleFootstepSurface(stub({ height: 0.2 }), 0, 0)).toBe('sand')
  })

  it('classifies desert biome as sand, not dirt/concrete', () => {
    expect(sampleFootstepSurface(stub({ desert: 0.8 }), 12, 12)).toBe('sand')
  })

  it('classifies temperate inland as grass', () => {
    expect(sampleFootstepSurface(stub({ desert: 0.1 }), 12, 12)).toBe('grass')
  })

  it('classifies a road corridor as road before desert', () => {
    const roads = [{ ax: 0, az: 0, bx: 20, bz: 0, halfWidth: 2 }]
    expect(sampleFootstepSurface(stub({ desert: 0.9, roads }), 4, 0)).toBe('road')
  })

  it('classifies mountain rock as stone', () => {
    expect(sampleFootstepSurface(stub({ ridge: 0.8 }), 12, 12)).toBe('stone')
  })
})
