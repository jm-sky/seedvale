/** world-terrain-019 early ground migration — the production heightfield
 *  ground query. The floor the player is given must be the floor the mesh
 *  renders (`sampleHeightfieldAt(...).floorY`), and the query must stay
 *  Y-aware: a surface entity above a tunnel is not in the cave. Pure:
 *  fixture topology, analytic surfaces, no Three.js. */

import { describe, expect, it } from 'vitest'
import type { CaveHeightfieldRepresentation } from './caveHeightfieldRepresentation'
import {
  buildCaveHeightfieldFixture,
  caveHeightfieldBaseSurfaceAt,
  caveHeightfieldWalkSurfaceAt,
} from '../../debug/caves/caveHeightfieldFixtures'
import { applyCaveGroundHysteresis, CAVE_FLOOR_GRACE, CAVE_UNDERGROUND_MISS } from './caveGroundQuery'
import { heightfieldGroundColumn, queryHeightfieldGround } from './caveHeightfieldQuery'
import {
  buildCaveHeightfieldRepresentation,
  DEFAULT_HEIGHTFIELD_CONFIG,
  heightfieldNodeGap,
  heightfieldNodeOpenSky,
  heightfieldNodePosition,
  sampleHeightfieldAt,
} from './caveHeightfieldRepresentation'
import { SURFACE_CLIP_EPS } from './caveSurface'

const TEST_CONFIG = { ...DEFAULT_HEIGHTFIELD_CONFIG, cellSize: 0.5 }
const base = caveHeightfieldBaseSurfaceAt
const walk = caveHeightfieldWalkSurfaceAt

let cachedField: CaveHeightfieldRepresentation | null = null
function field(): CaveHeightfieldRepresentation {
  cachedField ??= buildCaveHeightfieldRepresentation(buildCaveHeightfieldFixture('basic'), walk, TEST_CONFIG).heightfield
  return cachedField
}

const topology = buildCaveHeightfieldFixture('basic')
const passage = topology.nodes.find((n) => n.id === 'passage')!
const chamber = topology.nodes.find((n) => n.kind === 'chamber')!

/** First grid node (scanning from the deep end) that is cave void under a
 *  closed rock ceiling — i.e. the hillside above it is real surface. */
function closedTunnelNode(): { x: number, z: number } {
  const f = field()
  for (let iz = 0; iz < f.nz; iz++) {
    for (let ix = 0; ix < f.nx; ix++) {
      const i = iz * f.nx + ix
      if (heightfieldNodeGap(f, i) <= 1 || heightfieldNodeOpenSky(f, i)) continue
      const { x, z } = heightfieldNodePosition(f, ix, iz)
      if (base(x, z) - f.ceilY[i]! > 1) return { x, z }
    }
  }
  throw new Error('fixture has no closed tunnel node')
}

function openSkyNode(): { x: number, z: number } {
  const f = field()
  for (let iz = 0; iz < f.nz; iz++) {
    for (let ix = 0; ix < f.nx; ix++) {
      const i = iz * f.nx + ix
      if (heightfieldNodeGap(f, i) > 1 && heightfieldNodeOpenSky(f, i)) return heightfieldNodePosition(f, ix, iz)
    }
  }
  throw new Error('fixture has no open-sky node')
}

describe('heightfieldGroundColumn', () => {
  it('inside the passage: floor is exactly the rendered heightfield floor, ceiling from the same sample', () => {
    const { x, z } = passage.position
    const sample = sampleHeightfieldAt(field(), x, z)
    expect(sample.gap).toBeGreaterThan(0)
    const column = heightfieldGroundColumn(field(), base, x, z)!
    expect(column).not.toBeNull()
    expect(column.floorY).toBe(sample.floorY)
    expect(column.ceilingY).toBe(Math.min(sample.ceilY, base(x, z) - SURFACE_CLIP_EPS))
    expect(column.openSky).toBeUndefined()
  })

  it('chamber: floor is the heightfield chamber floor', () => {
    const { x, z } = chamber.position
    const sample = sampleHeightfieldAt(field(), x, z)
    const column = heightfieldGroundColumn(field(), base, x, z)!
    expect(column.floorY).toBe(sample.floorY)
    expect(column.ceilingY - column.floorY).toBeGreaterThan(2)
  })

  it('openSky mirrors the heightfield sample at the mouth and is absent in the closed tunnel', () => {
    const mouth = openSkyNode()
    expect(sampleHeightfieldAt(field(), mouth.x, mouth.z).openSky).toBe(true)
    expect(heightfieldGroundColumn(field(), base, mouth.x, mouth.z)?.openSky).toBe(true)
    const tunnel = closedTunnelNode()
    expect(sampleHeightfieldAt(field(), tunnel.x, tunnel.z).openSky).toBe(false)
    expect(heightfieldGroundColumn(field(), base, tunnel.x, tunnel.z)?.openSky).toBeUndefined()
  })

  it('returns null outside the grid and in rock (gap <= 0)', () => {
    const f = field()
    expect(heightfieldGroundColumn(f, base, f.bounds.minX - 5, f.bounds.minZ - 5)).toBeNull()
    // A grid corner is rock: the field is padded beyond the cave.
    expect(sampleHeightfieldAt(f, f.originX, f.originZ).gap).toBeLessThanOrEqual(0)
    expect(heightfieldGroundColumn(f, base, f.originX, f.originZ)).toBeNull()
  })
})

describe('queryHeightfieldGround (Y-aware)', () => {
  it('player standing on the cave floor → hit with that floor', () => {
    const { x, z } = passage.position
    const floorY = sampleHeightfieldAt(field(), x, z).floorY
    const hit = queryHeightfieldGround(field(), base, x, floorY, z)!
    expect(hit).not.toBeNull()
    expect(hit.floorY).toBe(floorY)
    expect(hit.intervals).toHaveLength(1)
    expect(hit.intervals[0]!.floorY).toBe(floorY)
  })

  it('player slightly below the floor within CAVE_FLOOR_GRACE → still a hit; beyond it → null', () => {
    const { x, z } = passage.position
    const floorY = sampleHeightfieldAt(field(), x, z).floorY
    expect(queryHeightfieldGround(field(), base, x, floorY - CAVE_FLOOR_GRACE + 0.1, z)).not.toBeNull()
    expect(queryHeightfieldGround(field(), base, x, floorY - CAVE_FLOOR_GRACE - 0.1, z)).toBeNull()
  })

  it('surface player on the hillside above an underground tunnel → null', () => {
    const { x, z } = closedTunnelNode()
    const surfaceY = base(x, z)
    expect(sampleHeightfieldAt(field(), x, z).gap).toBeGreaterThan(0)
    expect(queryHeightfieldGround(field(), base, x, surfaceY, z)).toBeNull()
    expect(queryHeightfieldGround(field(), base, x, surfaceY + 1, z)).toBeNull()
  })

  it('player above a closed ceiling but below the surface → null', () => {
    const { x, z } = closedTunnelNode()
    const sample = sampleHeightfieldAt(field(), x, z)
    expect(queryHeightfieldGround(field(), base, x, sample.ceilY + 0.2, z)).toBeNull()
    expect(queryHeightfieldGround(field(), base, x, sample.ceilY - 0.2, z)).not.toBeNull()
  })

  it('mouth: player on the walk surface at the entrance is cave ground under open sky', () => {
    const { x, z } = topology.entrance
    const y = walk(x, z)
    const sample = sampleHeightfieldAt(field(), x, z)
    expect(sample.openSky).toBe(true)
    // The walkable recess meets the cave floor at the mouth.
    expect(Math.abs(y - sample.floorY)).toBeLessThan(0.5)
    const hit = queryHeightfieldGround(field(), base, x, y, z)!
    expect(hit).not.toBeNull()
    expect(hit.openSky).toBe(true)
    expect(hit.floorY).toBe(sample.floorY)
  })

  it('mouth rim: a surface player on the pit wall above the recess floor is not assigned the deep floor', () => {
    const { x, z } = openSkyNode()
    const y = base(x, z)
    const hit = queryHeightfieldGround(field(), base, x, y, z)
    // Above the surface clip → surface owns ground.
    expect(y).toBeGreaterThan(base(x, z) - SURFACE_CLIP_EPS)
    expect(hit).toBeNull()
  })
})

describe('heightfield ground + hysteresis', () => {
  it('a single underground miss keeps the last cave floor; a surface-level miss clears it', () => {
    const { x, z } = passage.position
    const floorY = sampleHeightfieldAt(field(), x, z).floorY
    const surfaceY = base(x, z)
    expect(surfaceY - floorY).toBeGreaterThan(CAVE_UNDERGROUND_MISS)
    const first = queryHeightfieldGround(field(), base, x, floorY, z)
    let state = applyCaveGroundHysteresis(first, floorY, surfaceY, null)
    expect(state.hit).not.toBeNull()
    // Miss underground (e.g. a probe through a rounded rim): keep the floor.
    state = applyCaveGroundHysteresis(null, floorY, surfaceY, state.remember)
    expect(state.hit?.floorY).toBe(floorY)
    // Miss at surface level: release.
    state = applyCaveGroundHysteresis(null, surfaceY, surfaceY, state.remember)
    expect(state.hit).toBeNull()
    expect(state.remember).toBeNull()
  })

  it('no snap from the cave onto the hillside above the tunnel', () => {
    const { x, z } = closedTunnelNode()
    const floorY = sampleHeightfieldAt(field(), x, z).floorY
    const surfaceY = base(x, z)
    const hit = queryHeightfieldGround(field(), base, x, floorY, z)
    const state = applyCaveGroundHysteresis(null, floorY, surfaceY, hit)
    expect(state.hit).not.toBeNull()
    expect(state.hit!.floorY).toBe(floorY)
    expect(state.hit!.floorY).toBeLessThan(surfaceY - CAVE_UNDERGROUND_MISS)
  })
})
