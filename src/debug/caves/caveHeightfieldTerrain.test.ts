import { describe, expect, it } from 'vitest'
import { CAVE_MOUTH_DEPTH, mouthCarveDepth } from '../../world/caves/mouthCarve'
import {
  buildCaveHeightfieldFixture,
  CAVE_HEIGHTFIELD_ENTRANCE,
  CAVE_HEIGHTFIELD_FIXTURE_IDS,
  caveHeightfieldBaseSurfaceAt,
  caveHeightfieldWalkSurfaceAt,
} from './caveHeightfieldFixtures'
import { CAVE_HEIGHTFIELD_TERRAIN_ANCHOR } from './caveHeightfieldTerrain'

/** The spike is only meaningful if a player deep inside has real hillside
 *  overhead — see plan world-terrain-018 §6 / the review follow-up. */
const DEEP_SURFACE_ABOVE_PLAYER_MIN = 8

describe('cave heightfield harness terrain (plan world-terrain-018)', () => {
  it('samples the production analytic terrain deterministically', () => {
    for (const [x, z] of [[0, 0], [3.5, -8], [-6.4, -14.2], [9.4, -19]] as const) {
      const a = caveHeightfieldBaseSurfaceAt(x, z)
      const b = caveHeightfieldBaseSurfaceAt(x, z)
      expect(a).toBe(b)
      expect(Number.isFinite(a)).toBe(true)
    }
  })

  it('the anchored hillside is above water, slopes at the doorway and rises over the cave', () => {
    const entrance = caveHeightfieldBaseSurfaceAt(0, 0)
    // Not a beach / seabed: `defaultTerrainConfig` clamps ocean to waterLevel.
    expect(entrance).toBeGreaterThan(5)
    // Approach descends outward (+Z) so the doorway reads as a hillside.
    expect(caveHeightfieldBaseSurfaceAt(0, 7)).toBeLessThan(entrance - 1)
    // Ground rises inward (−Z), monotonically enough to be a real slope.
    let previous = entrance
    for (let z = -2; z >= -20; z -= 2) {
      const here = caveHeightfieldBaseSurfaceAt(0, z)
      expect(here).toBeGreaterThan(previous - 0.5)
      previous = here
    }
    expect(caveHeightfieldBaseSurfaceAt(0, -18) - entrance).toBeGreaterThan(DEEP_SURFACE_ABOVE_PLAYER_MIN)
    // Lateral relief exists too — the bend/branch fixtures run off-axis.
    const lateral = [-6.4, 6.6].map((x) => caveHeightfieldBaseSurfaceAt(x, -14))
    for (const h of lateral) expect(h).toBeGreaterThan(entrance + 4)
  })

  it('walk surface is the analytic base minus the production mouth recess', () => {
    for (const [x, z] of [[0, 0], [0, 1.5], [1, -0.5]] as const) {
      expect(caveHeightfieldWalkSurfaceAt(x, z)).toBeCloseTo(
        caveHeightfieldBaseSurfaceAt(x, z) - mouthCarveDepth(x, z, CAVE_HEIGHTFIELD_ENTRANCE),
        6,
      )
    }
    // Far from the doorway the two are the same sampler.
    expect(caveHeightfieldWalkSurfaceAt(0, -12)).toBe(caveHeightfieldBaseSurfaceAt(0, -12))
    expect(caveHeightfieldWalkSurfaceAt(0, 14)).toBe(caveHeightfieldBaseSurfaceAt(0, 14))
  })

  it('anchors the entrance at the bottom of the production mouth recess', () => {
    expect(CAVE_HEIGHTFIELD_ENTRANCE.y).toBeCloseTo(caveHeightfieldBaseSurfaceAt(0, 0) - CAVE_MOUTH_DEPTH, 6)
    expect(CAVE_HEIGHTFIELD_TERRAIN_ANCHOR.x).toBeTypeOf('number')
  })

  it('every fixture puts its deepest station clearly under the hillside', () => {
    for (const id of CAVE_HEIGHTFIELD_FIXTURE_IDS) {
      const topology = buildCaveHeightfieldFixture(id)
      const deepest = topology.nodes.reduce((best, node) => {
        const above = caveHeightfieldBaseSurfaceAt(node.position.x, node.position.z) - node.position.y
        return above > best.above ? { node, above } : best
      }, { node: topology.nodes[0]!, above: -Infinity })
      expect(deepest.above).toBeGreaterThan(DEEP_SURFACE_ABOVE_PLAYER_MIN)
      expect(deepest.above).toBeLessThan(20)
    }
  })

  it('keeps the production overburden requirement past the mouth transition', () => {
    for (const id of CAVE_HEIGHTFIELD_FIXTURE_IDS) {
      const topology = buildCaveHeightfieldFixture(id)
      for (const node of topology.nodes) {
        const distance = Math.hypot(node.position.x - CAVE_HEIGHTFIELD_ENTRANCE.x, node.position.z - CAVE_HEIGHTFIELD_ENTRANCE.z)
        if (distance < 6) continue
        const roof = caveHeightfieldBaseSurfaceAt(node.position.x, node.position.z)
          - (node.position.y + node.targetHeight)
        expect(roof).toBeGreaterThan(1.4)
      }
    }
  })

  it('builds identical topology for repeated calls', () => {
    for (const id of CAVE_HEIGHTFIELD_FIXTURE_IDS) {
      expect(JSON.stringify(buildCaveHeightfieldFixture(id)))
        .toBe(JSON.stringify(buildCaveHeightfieldFixture(id)))
    }
  })
})
