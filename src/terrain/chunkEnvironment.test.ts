import { describe, expect, it } from 'vitest'
import type { RoadCorridorSegment } from './chunkHeightmap'
import { createSeededRandom } from '../world/parseSeed'
import {
  cemeteryFitsVillageFringe,
  cemeteryFootprintClearsRoads,
  deriveLandmarkId,
  LANDMARK_BIAS_MAX,
  LANDMARK_BIAS_MIN,
  landmarkChanceBias,
  rollCemeterySize,
} from './chunkEnvironment'

function roadSegment(overrides: Partial<RoadCorridorSegment> = {}): RoadCorridorSegment {
  return {
    ax: -50,
    az: 0,
    ah: 0,
    bx: 50,
    bz: 0,
    bh: 0,
    halfWidth: 5,
    heightStrength: 0.85,
    tintStrength: 0.8,
    ...overrides,
  }
}

const PLAINS = {
  mountainRidge: 0,
  altitude01: 0.2,
  slope: 0.2,
  desert: 0,
  swamp: 0,
  forest: 1,
}

describe('landmarkChanceBias', () => {
  it('stays within [min, max]', () => {
    const samples = [
      PLAINS,
      { mountainRidge: 1, altitude01: 0.8, slope: 0.1, desert: 0, swamp: 0, forest: 0.2 },
      { mountainRidge: 0.9, altitude01: 0.05, slope: 0.5, desert: 1, swamp: 0, forest: 0 },
      { mountainRidge: 0, altitude01: 0.08, slope: 0.1, desert: 0, swamp: 1, forest: 0 },
    ] as const
    for (const kind of ['monolith', 'stoneCircle', 'smallRuins'] as const) {
      for (const sample of samples) {
        const bias = landmarkChanceBias(kind, sample)
        expect(bias).toBeGreaterThanOrEqual(LANDMARK_BIAS_MIN)
        expect(bias).toBeLessThanOrEqual(LANDMARK_BIAS_MAX)
      }
    }
  })

  it('is deterministic', () => {
    expect(landmarkChanceBias('monolith', PLAINS)).toBe(landmarkChanceBias('monolith', PLAINS))
  })

  it('boosts monoliths on ridges vs plains', () => {
    const ridge = landmarkChanceBias('monolith', { ...PLAINS, mountainRidge: 0.9, altitude01: 0.5 })
    const plains = landmarkChanceBias('monolith', PLAINS)
    expect(ridge).toBeGreaterThan(plains)
  })

  it('boosts ruins on forested mid-altitude vs desert ridge', () => {
    const habitable = landmarkChanceBias('smallRuins', PLAINS)
    const harsh = landmarkChanceBias('smallRuins', {
      mountainRidge: 0.9,
      altitude01: 0.6,
      slope: 0.2,
      desert: 0.8,
      swamp: 0,
      forest: 0.1,
    })
    expect(habitable).toBeGreaterThan(harsh)
  })
})

describe('cemeteryFitsVillageFringe', () => {
  const village = { x: 0, z: 0, radius: 40 }
  const plaza = { x: 0, z: 0, radius: 10 }

  it('rejects when no regional disk is present', () => {
    expect(cemeteryFitsVillageFringe(30, 0, [], [])).toBe(false)
  })

  it('rejects plaza / house clearings', () => {
    expect(cemeteryFitsVillageFringe(0, 0, [village], [plaza])).toBe(false)
    expect(cemeteryFitsVillageFringe(8, 0, [village], [plaza])).toBe(false)
  })

  it('accepts the village fringe outside clearings', () => {
    expect(cemeteryFitsVillageFringe(30, 0, [village], [plaza])).toBe(true)
  })

  it('rejects inside the inner band and past the outer band', () => {
    expect(cemeteryFitsVillageFringe(10, 0, [village], [])).toBe(false)
    expect(cemeteryFitsVillageFringe(50, 0, [village], [])).toBe(false)
  })
})

describe('cemeteryFootprintClearsRoads (world-terrain-006)', () => {
  it('accepts a cemetery with no nearby road', () => {
    expect(cemeteryFootprintClearsRoads(0, 0, 'SM', 1, [])).toBe(true)
  })

  it('rejects a cemetery whose center sits on the road, for every size', () => {
    const segments = [roadSegment()]
    for (const size of ['SM', 'MD', 'LG'] as const) {
      expect(cemeteryFootprintClearsRoads(0, 3, size, 1, segments)).toBe(false)
    }
  })

  it('rejects an LG cemetery whose grave-grid footprint reaches a road even though its center point clears it', () => {
    const segments = [roadSegment({ halfWidth: 3 })]
    // Far enough that the road-tint center-point check alone would pass —
    // an LG cemetery's wider grid still reaches this road.
    const y = 12
    expect(cemeteryFootprintClearsRoads(0, y, 'LG', 1, segments)).toBe(false)
  })

  it('accepts a cemetery whose footprint clears the road with the safety margin', () => {
    const segments = [roadSegment({ halfWidth: 3 })]
    expect(cemeteryFootprintClearsRoads(0, 40, 'LG', 1, segments)).toBe(true)
  })

  it('scales the rejected footprint with `scale`', () => {
    const segments = [roadSegment({ halfWidth: 3 })]
    const y = 15
    expect(cemeteryFootprintClearsRoads(0, y, 'SM', 1, segments)).toBe(true)
    expect(cemeteryFootprintClearsRoads(0, y, 'SM', 3, segments)).toBe(false)
  })
})

describe('deriveLandmarkId', () => {
  it('is deterministic for identical (seed, chunk, kind, ordinal)', () => {
    expect(deriveLandmarkId(123, 4, -7, 'monolith', 0)).toBe(deriveLandmarkId(123, 4, -7, 'monolith', 0))
  })

  it('differs across chunk coordinates', () => {
    expect(deriveLandmarkId(123, 4, -7, 'monolith', 0)).not.toBe(deriveLandmarkId(123, 5, -7, 'monolith', 0))
    expect(deriveLandmarkId(123, 4, -7, 'monolith', 0)).not.toBe(deriveLandmarkId(123, 4, -6, 'monolith', 0))
  })

  it('differs across landmark kind at the same chunk', () => {
    expect(deriveLandmarkId(123, 4, -7, 'monolith', 0)).not.toBe(deriveLandmarkId(123, 4, -7, 'cemetery', 0))
  })

  it('differs across ordinal for the same kind/chunk (future multi-roll support)', () => {
    expect(deriveLandmarkId(123, 4, -7, 'monolith', 0)).not.toBe(deriveLandmarkId(123, 4, -7, 'monolith', 1))
  })

  it('differs across world seed for the same chunk/kind', () => {
    expect(deriveLandmarkId(123, 4, -7, 'monolith', 0)).not.toBe(deriveLandmarkId(456, 4, -7, 'monolith', 0))
  })
})

describe('rollCemeterySize', () => {
  it('is deterministic for identical seeded random streams', () => {
    const rollFrom = (seed: number) => rollCemeterySize(createSeededRandom(seed))
    expect(rollFrom(42)).toBe(rollFrom(42))
  })

  it('only ever returns SM/MD/LG and covers all three across many seeds', () => {
    const seen = new Set<string>()
    for (let seed = 0; seed < 500; seed++) {
      const size = rollCemeterySize(createSeededRandom(seed))
      expect(['SM', 'MD', 'LG']).toContain(size)
      seen.add(size)
    }
    expect(seen).toEqual(new Set(['LG', 'MD', 'SM']))
  })
})
