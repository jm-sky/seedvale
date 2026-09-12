import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RoadCorridorSegment } from '../terrain/chunkHeightmap'
import { wolfDenInitialFillVariant } from './animalVariants'
import {
  clearsRiverChannel,
  FAUNA_URLS,
  faunaGltfUrls,
  isDeerEdgeHabitat,
  isNearRoadCorridor,
  SPAWNER_SPECS,
  spawnerId,
} from './createFauna'

function segment(overrides: Partial<RoadCorridorSegment> = {}): RoadCorridorSegment {
  return {
    ax: 0, az: 0, ah: 0, bx: 10, bz: 0, bh: 0, halfWidth: 2, heightStrength: 1, tintStrength: 1,
    ...overrides,
  }
}

describe('SPAWNER_SPECS rockDen habitat (plan 188)', () => {
  it('has a rockDen entry that can produce bear, alongside the existing wolf den', () => {
    const rockDenSpecs = SPAWNER_SPECS.filter((spec) => spec.type === 'rockDen')
    expect(rockDenSpecs.some((spec) => spec.kind === 'wolf')).toBe(true)
    expect(rockDenSpecs.some((spec) => spec.kind === 'bear')).toBe(true)
    // Two distinct physical dens, not one den reconfigured for bear only.
    expect(rockDenSpecs.length).toBeGreaterThanOrEqual(2)
  })

  it('registers a bear.glb model URL through the shared FAUNA_URLS map', () => {
    expect(FAUNA_URLS.bear).toBe('/models/fauna/bear.glb')
  })

  it('registers wild_boar.glb through the shared FAUNA_URLS map', () => {
    expect(FAUNA_URLS.boar).toBe('/models/fauna/wild_boar.glb')
  })
})

describe('faunaGltfUrls (wild-boar GLB feature flag)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('includes boar by default', () => {
    vi.stubGlobal('window', { location: { search: '' } })
    expect(faunaGltfUrls().boar).toBe('/models/fauna/wild_boar.glb')
  })

  it('omits boar when ?boarGlb=0 so createBoarModel stays the visual', () => {
    vi.stubGlobal('window', { location: { search: '?boarGlb=0' } })
    expect(faunaGltfUrls().boar).toBeUndefined()
    expect(faunaGltfUrls().bear).toBe('/models/fauna/bear.glb')
  })
})

describe('wolfDen initial pack variants (plan fauna-022)', () => {
  it('assigns exactly one alpha across the den maxPreyCount, at slot 0', () => {
    const den = SPAWNER_SPECS.find((spec) => spec.type === 'wolfDen')
    expect(den).toBeDefined()
    expect(den?.kind).toBe('wolf')
    expect(den?.maxPreyCount).toBe(2)
    const variants = Array.from({ length: den!.maxPreyCount }, (_, i) => wolfDenInitialFillVariant(i))
    expect(variants.filter((v) => v === 'alpha')).toHaveLength(1)
    expect(variants[0]).toBe('alpha')
    expect(variants[1]).toBe('normal')
  })
})

describe('spawnerId (plan 188 — multiple habitat instances of the same type)', () => {
  it('keeps the pre-188/pre-rename id for the first spawner of a given type (save compatibility)', () => {
    expect(spawnerId('home', 'rockDen', 'wolf', 0)).toBe('home:cave')
  })

  it('gives a second spawner of the same type a distinct, stable id instead of colliding', () => {
    const first = spawnerId('home', 'rockDen', 'wolf', 0)
    const second = spawnerId('home', 'rockDen', 'bear', 1)
    expect(second).not.toBe(first)
    expect(second).toBe('home:cave:bear')
  })
})

describe('clearsRiverChannel (wild spawn / habitat river clearance)', () => {
  it('imposes no restriction without river data', () => {
    expect(clearsRiverChannel(undefined, 6)).toBe(true)
    expect(clearsRiverChannel(null, 6)).toBe(true)
  })

  it('rejects a position in the water', () => {
    expect(clearsRiverChannel(-0.5, 1.5)).toBe(false)
    expect(clearsRiverChannel(0, 1.5)).toBe(false)
  })

  it('rejects a dry position too close to the water edge', () => {
    expect(clearsRiverChannel(1, 1.5)).toBe(false)
    // A habitat prop needs more bank than a single animal does.
    expect(clearsRiverChannel(3, 1.5)).toBe(true)
    expect(clearsRiverChannel(3, 6)).toBe(false)
  })

  it('accepts a position well clear of the channel', () => {
    expect(clearsRiverChannel(20, 6)).toBe(true)
  })
})

describe('isNearRoadCorridor (plan fauna-016 §2 — wild spawn/road avoidance)', () => {
  it('rejects a candidate on the road itself', () => {
    expect(isNearRoadCorridor(5, 0, [segment()], 1)).toBe(true)
  })

  it('rejects a candidate within clearance of the road edge', () => {
    // halfWidth 2 + clearance 1 = rejected up to 3 units from the centerline.
    expect(isNearRoadCorridor(5, 2.9, [segment()], 1)).toBe(true)
  })

  it('accepts a candidate clear of the road', () => {
    expect(isNearRoadCorridor(5, 4, [segment()], 1)).toBe(false)
  })

  it('accepts any candidate with no road segments nearby', () => {
    expect(isNearRoadCorridor(5, 0, [], 1)).toBe(false)
  })
})

describe('isDeerEdgeHabitat (plan fauna-016 §1 — deer/stag forest-edge spawn habitat)', () => {
  it('rejects open meadow', () => {
    expect(isDeerEdgeHabitat(0.05)).toBe(false)
  })

  it('accepts the forest-edge transition', () => {
    expect(isDeerEdgeHabitat(0.45)).toBe(true)
  })

  it('rejects deep forest', () => {
    expect(isDeerEdgeHabitat(0.95)).toBe(false)
  })
})
