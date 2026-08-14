import { describe, expect, it } from 'vitest'
import {
  cemeteryFitsVillageFringe,
  deriveLandmarkId,
  LANDMARK_BIAS_MAX,
  LANDMARK_BIAS_MIN,
  landmarkChanceBias,
} from './chunkEnvironment'

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
