// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { DRY_WATER_SAMPLE } from '../terrain/waterSample'
import { AnimalAgent, type AnimalAgentDeps } from './AnimalAgent'
import { ANIMAL_DEFS } from './animalDefs'
import {
  cellCoord,
  cellKey,
  createFaunaProximityIndex,
  FAUNA_PROXIMITY_CELL_KEY_STRIDE,
  FAUNA_PROXIMITY_CELL_KEY_WORLD_EXTENT,
  FAUNA_PROXIMITY_CELL_SIZE,
} from './faunaProximity'

const sampleHeight = () => 0
const sampleLocalWater = () => DRY_WATER_SAMPLE
const collidersNear = () => []

function makeDeps(overrides: Partial<AnimalAgentDeps> = {}): AnimalAgentDeps {
  return {
    def: ANIMAL_DEFS.deer,
    animalId: 'test-animal',
    sampleHeight,
    waterLevel: -10,
    sampleLocalWater,
    collidersNear,
    x: 0,
    z: 0,
    ...overrides,
  }
}

function place(animalId: string, x: number, z: number): AnimalAgent {
  return new AnimalAgent(makeDeps({ animalId, x, z }))
}

function collectNear(
  index: ReturnType<typeof createFaunaProximityIndex>,
  x: number,
  z: number,
  radius: number,
): string[] {
  const ids: string[] = []
  index.forEachNear(x, z, radius, (agent) => ids.push(agent.animalId))
  return ids
}

function idsMatchingDistance(
  agents: readonly AnimalAgent[],
  x: number,
  z: number,
  radius: number,
  predicate: (distance: number, radius: number) => boolean,
): Set<string> {
  const ids = new Set<string>()
  for (const agent of agents) {
    const d = Math.hypot(agent.mesh.position.x - x, agent.mesh.position.z - z)
    if (predicate(d, radius)) ids.add(agent.animalId)
  }
  return ids
}

function spatialIdsMatchingDistance(
  index: ReturnType<typeof createFaunaProximityIndex>,
  x: number,
  z: number,
  radius: number,
  predicate: (distance: number, radius: number) => boolean,
): Set<string> {
  const ids = new Set<string>()
  index.forEachNear(x, z, radius, (agent) => {
    const d = Math.hypot(agent.mesh.position.x - x, agent.mesh.position.z - z)
    if (predicate(d, radius)) ids.add(agent.animalId)
  })
  return ids
}

function expectEquivalentCandidateSets(
  index: ReturnType<typeof createFaunaProximityIndex>,
  agents: readonly AnimalAgent[],
  x: number,
  z: number,
  radius: number,
): void {
  const lt = (d: number, r: number) => d < r
  const lte = (d: number, r: number) => d <= r
  expect(spatialIdsMatchingDistance(index, x, z, radius, lt))
    .toEqual(idsMatchingDistance(agents, x, z, radius, lt))
  expect(spatialIdsMatchingDistance(index, x, z, radius, lte))
    .toEqual(idsMatchingDistance(agents, x, z, radius, lte))
}

/** Deterministic [0, 1) generator — enough for placement, not gameplay RNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('createFaunaProximityIndex (plan fauna-042)', () => {
  it('rebuilds membership from the wild pool and does not invent livestock', () => {
    const wolf = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.wolf, animalId: 'wolf', x: 0, z: 0 }))
    const deer = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.deer, animalId: 'deer', x: 4, z: 0 }))
    const sheep = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.sheep, animalId: 'sheep', x: 3, z: 0 }))
    const index = createFaunaProximityIndex()
    index.rebuild([wolf, deer])
    expect(index.has(wolf)).toBe(true)
    expect(index.has(deer)).toBe(true)
    expect(index.has(sheep)).toBe(false)
    expect(collectNear(index, 0, 0, 10)).toEqual(['wolf', 'deer'])
  })

  it('still visits an agent on a cell boundary', () => {
    const wolf = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.wolf, animalId: 'wolf', x: 0.1, z: 0 }))
    const deer = new AnimalAgent(makeDeps({
      def: ANIMAL_DEFS.deer,
      animalId: 'boundary-deer',
      x: FAUNA_PROXIMITY_CELL_SIZE,
      z: 0,
    }))
    const index = createFaunaProximityIndex()
    index.rebuild([wolf, deer])
    expect(collectNear(index, wolf.mesh.position.x, wolf.mesh.position.z, ANIMAL_DEFS.wolf.detectRange))
      .toContain('boundary-deer')
  })

  it('does not visit a distant agent in the common case', () => {
    const wolf = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.wolf, animalId: 'wolf', x: 0, z: 0 }))
    const far = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.deer, animalId: 'far-deer', x: 400, z: 0 }))
    const index = createFaunaProximityIndex()
    index.rebuild([wolf, far])
    expect(collectNear(index, 0, 0, ANIMAL_DEFS.wolf.detectRange)).toEqual(['wolf'])
    expect(index.has(far)).toBe(true)
  })

  it('keeps dead agents in the view so carcass queries can see them', () => {
    const corpse = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.deer, animalId: 'corpse', x: 2, z: 0 }))
    corpse.takeDamage(9999)
    const index = createFaunaProximityIndex()
    index.rebuild([corpse])
    expect(collectNear(index, 0, 0, 14)).toEqual(['corpse'])
  })

  it('counts only in-radius agents that pass the caller predicate', () => {
    const inside = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.deer, animalId: 'in', x: 4, z: 0 }))
    const outside = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.deer, animalId: 'out', x: 20, z: 0 }))
    const otherKind = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.wolf, animalId: 'wolf', x: 3, z: 0 }))
    const index = createFaunaProximityIndex()
    index.rebuild([inside, outside, otherKind])
    expect(index.countNear(0, 0, 12, (a) => a.def.kind === 'deer')).toBe(1)
  })
})

describe('FaunaProximityIndex brute-force equivalence (plan fauna-042)', () => {
  const radii = [8, 16, 24, 40]

  it('matches a full scan after the same distance predicate across radii, signs, and cell edges', () => {
    const cell = FAUNA_PROXIMITY_CELL_SIZE
    const agents = [
      place('origin', 0, 0),
      place('neg-x', -40, 12),
      place('neg-z', 12, -40),
      place('neg-both', -48.5, -33.25),
      place('near-zero-neg', -0.01, -0.01),
      place('near-zero-pos', 0.01, 0.01),
      place('cell-edge-west', cell - 1e-6, 4),
      place('cell-edge-east', cell, 4),
      place('cell-edge-south', 4, cell - 1e-6),
      place('cell-edge-north', 4, cell),
      place('cell-corner-inside', cell - 1e-6, cell - 1e-6),
      place('cell-corner-outside', cell, cell),
      place('neg-cell-edge', -cell, 0),
      place('neg-cell-inside', -cell + 1e-6, 0),
      place('on-radius-8', 8, 0),
      place('inside-radius-8', 8 - 1e-6, 0),
      place('outside-radius-8', 8 + 1e-6, 0),
      place('on-radius-16', 0, 16),
      place('inside-radius-16', 0, 16 - 1e-6),
      place('outside-radius-16', 0, 16 + 1e-6),
      place('on-radius-24-diag', 24 / Math.SQRT2, 24 / Math.SQRT2),
      place('far', 400, -400),
    ]
    const index = createFaunaProximityIndex()
    index.rebuild(agents)

    const centers: Array<{ x: number, z: number }> = [
      { x: 0, z: 0 },
      { x: -0.5, z: 0.5 },
      { x: cell, z: 0 },
      { x: cell - 1e-4, z: cell - 1e-4 },
      { x: cell + 1e-4, z: cell + 1e-4 },
      { x: -cell, z: -cell },
      { x: 8, z: 0 },
      { x: -40, z: -33 },
    ]

    for (const center of centers) {
      for (const radius of radii) {
        expectEquivalentCandidateSets(index, agents, center.x, center.z, radius)
      }
    }
  })

  it('matches a full scan for a few hundred deterministic positions', () => {
    const rand = mulberry32(0x042fa11a)
    const agents: AnimalAgent[] = []
    for (let i = 0; i < 240; i++) {
      const x = (rand() * 220) - 110
      const z = (rand() * 220) - 110
      agents.push(place(`p-${i}`, x, z))
    }
    agents.push(place('sentinel-far', 2500, -1800))
    const index = createFaunaProximityIndex()
    index.rebuild(agents)

    const centers = [
      { x: 0, z: 0 },
      { x: -80, z: 90 },
      { x: 16, z: -16 },
      { x: 15.999, z: 0.001 },
      { x: -0.001, z: 31.999 },
    ]
    for (const center of centers) {
      for (const radius of radii) {
        expectEquivalentCandidateSets(index, agents, center.x, center.z, radius)
      }
    }
  })

  it('spatial prefilter may over-fetch, but never misses an in-radius agent', () => {
    const agents = [
      place('near', 3, 0),
      place('just-outside', 16.5, 0),
      place('far', 80, 0),
    ]
    const index = createFaunaProximityIndex()
    index.rebuild(agents)
    const radius = 8
    const raw = new Set(collectNear(index, 0, 0, radius))
    const exact = idsMatchingDistance(agents, 0, 0, radius, (d, r) => d <= r)
    expect(raw.has('near')).toBe(true)
    expect(exact.has('near')).toBe(true)
    expect(exact.has('just-outside')).toBe(false)
    expect(exact.has('far')).toBe(false)
    for (const id of exact) expect(raw.has(id)).toBe(true)
    expect(raw.size).toBeGreaterThanOrEqual(exact.size)
  })
})

describe('cellKey arithmetic packing (plan fauna-042)', () => {
  const halfStride = FAUNA_PROXIMITY_CELL_KEY_STRIDE / 2

  it('is unique for neighbouring cells, the origin, negatives, and large in-range coordinates', () => {
    const cells: Array<[number, number]> = [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
      [-1, 0],
      [0, -1],
      [-1, -1],
      [1, -1],
      [-1, 1],
      [-2, 3],
      [3, -2],
      [halfStride - 1, halfStride - 1],
      [-halfStride, -halfStride],
      [halfStride - 1, -halfStride],
      [-halfStride, halfStride - 1],
      [100_000, -99_999],
      [-250_000, 250_000],
    ]
    const seen = new Map<number, [number, number]>()
    for (const [cx, cz] of cells) {
      const key = cellKey(cx, cz)
      const prior = seen.get(key)
      expect(prior, `collision ${cx},${cz} vs ${prior?.join(',')}`).toBeUndefined()
      seen.set(key, [cx, cz])
    }
    expect(cellKey(0, 0)).not.toBe(cellKey(0, 1))
    expect(cellKey(0, 0)).not.toBe(cellKey(1, 0))
    expect(cellKey(-1, 0)).not.toBe(cellKey(0, -1))
    expect(cellKey(0, -1)).not.toBe(cellKey(-1, 0))
  })

  it('has no collisions across the documented supported cell range', () => {
    const seen = new Map<number, [number, number]>()
    const samples: number[] = []
    for (let i = -8; i <= 8; i++) samples.push(i)
    samples.push(-halfStride, -halfStride + 1, -1, 0, 1, halfStride - 2, halfStride - 1)
    for (const cx of samples) {
      for (const cz of samples) {
        const key = cellKey(cx, cz)
        const prior = seen.get(key)
        if (prior) expect(prior).toEqual([cx, cz])
        else seen.set(key, [cx, cz])
      }
    }
  })

  it('documents the wrapping collision just outside the supported range', () => {
    expect(FAUNA_PROXIMITY_CELL_KEY_STRIDE).toBe(1 << 20)
    expect(FAUNA_PROXIMITY_CELL_KEY_WORLD_EXTENT)
      .toBe((FAUNA_PROXIMITY_CELL_KEY_STRIDE / 2) * FAUNA_PROXIMITY_CELL_SIZE)
    expect(cellKey(0, FAUNA_PROXIMITY_CELL_KEY_STRIDE)).toBe(cellKey(1, 0))
    expect(cellCoord(-FAUNA_PROXIMITY_CELL_KEY_WORLD_EXTENT)).toBe(-halfStride)
    expect(cellCoord(FAUNA_PROXIMITY_CELL_KEY_WORLD_EXTENT - 1e-9)).toBe(halfStride - 1)
    expect(Math.abs(cellKey(halfStride - 1, halfStride - 1))).toBeLessThan(2 ** 40)
  })

  it('keeps neighbouring world points in distinct cells around zero and negatives', () => {
    expect(cellCoord(-0.001)).toBe(-1)
    expect(cellCoord(0)).toBe(0)
    expect(cellCoord(FAUNA_PROXIMITY_CELL_SIZE - 1e-9)).toBe(0)
    expect(cellCoord(FAUNA_PROXIMITY_CELL_SIZE)).toBe(1)
    expect(cellKey(cellCoord(-0.001), cellCoord(-0.001)))
      .not.toBe(cellKey(cellCoord(0.001), cellCoord(0.001)))
  })
})

describe('FaunaProximityIndex snapshot semantics (plan fauna-042)', () => {
  it('may still prefilter a target that walked out of radius until the next rebuild, but the live distance predicate rejects it', () => {
    const wolf = place('wolf', 0, 0)
    const deer = place('deer', 4, 0)
    const index = createFaunaProximityIndex()
    index.rebuild([wolf, deer])
    deer.mesh.position.x = 80
    expect(collectNear(index, 0, 0, 10)).toContain('deer')
    expect(spatialIdsMatchingDistance(index, 0, 0, 10, (d, r) => d <= r).has('deer')).toBe(false)
    expect(index.has(deer)).toBe(true)
  })

  it('does not require same-pass discovery of a target that walked into radius, and finds it after the next rebuild', () => {
    const wolf = place('wolf', 0, 0)
    const deer = place('deer', 400, 0)
    const index = createFaunaProximityIndex()
    index.rebuild([wolf, deer])
    deer.mesh.position.x = 4
    expect(spatialIdsMatchingDistance(index, 0, 0, 10, (d, r) => d <= r).has('deer')).toBe(false)
    index.rebuild([wolf, deer])
    expect(spatialIdsMatchingDistance(index, 0, 0, 10, (d, r) => d <= r).has('deer')).toBe(true)
  })

  it('keeps global membership for committed-target checks even when the local query misses', () => {
    const wolf = place('wolf', 0, 0)
    const deer = place('deer', 400, 0)
    const index = createFaunaProximityIndex()
    index.rebuild([wolf, deer])
    deer.mesh.position.x = 3
    expect(collectNear(index, 0, 0, 18)).not.toContain('deer')
    expect(index.has(deer)).toBe(true)
  })

  it('does not index a same-pass respawn until the next rebuild', () => {
    const wolf = place('wolf', 0, 0)
    const spawned = place('spawned', 2, 0)
    const index = createFaunaProximityIndex()
    index.rebuild([wolf])
    expect(index.has(spawned)).toBe(false)
    expect(collectNear(index, 0, 0, 10)).toEqual(['wolf'])
    index.rebuild([wolf, spawned])
    expect(index.has(spawned)).toBe(true)
    expect(collectNear(index, 0, 0, 10)).toEqual(expect.arrayContaining(['wolf', 'spawned']))
  })
})
