import { describe, expect, it } from 'vitest'
import type { CaveEntrance } from '../caveVolume'
import type { CaveTopology } from './caveTopology'
import { buildCaveSdfRepresentation, DEFAULT_SDF_PARAMS, placePrimitivesAlongPath } from './caveSdfField'

function baseEntrance(): CaveEntrance {
  return { x: 0, y: 0, z: 0, yaw: 0, width: 3, height: 2.6 }
}

/** A topology whose node/segment ids share nothing with the Milestone-A
 *  spike fixture (`entrance`/`wide-transition`/`descending-passage`/...) or
 *  the old hardcoded `MAIN_CHAIN` — proof the representation consumes
 *  `topology.segments` generically (implementation notes §5). Includes a
 *  branch off `hub` with no second hardcoded chain required. */
function customGraphTopology(): CaveTopology {
  const entrance = baseEntrance()
  return {
    caveId: 'cave:custom-graph',
    seed: 1,
    entrance,
    minClearance: 2,
    nodes: [
      { id: 'start', kind: 'entrance', position: { x: 0, y: 0, z: 0 }, targetWidth: 3, targetHeight: 2.6 },
      { id: 'hub', kind: 'widening', position: { x: 6, y: -1, z: 0 }, targetWidth: 5, targetHeight: 5.5 },
      { id: 'end', kind: 'chamber', position: { x: 12, y: -2, z: 0 }, targetWidth: 9, targetHeight: 10 },
      { id: 'side-room', kind: 'chamber', position: { x: 6, y: -1.5, z: 8 }, targetWidth: 4, targetHeight: 5 },
    ],
    segments: [
      { id: 'link-a', from: 'start', to: 'hub', centerline: [{ x: 0, y: 0, z: 0 }, { x: 3, y: -0.5, z: 0 }, { x: 6, y: -1, z: 0 }] },
      { id: 'link-b', from: 'hub', to: 'end', centerline: [{ x: 6, y: -1, z: 0 }, { x: 12, y: -2, z: 0 }] },
      { id: 'link-branch', from: 'hub', to: 'side-room', centerline: [{ x: 6, y: -1, z: 0 }, { x: 6, y: -1.5, z: 8 }] },
    ],
    features: [],
  }
}

describe('buildCaveSdfRepresentation (plan world-terrain-008 B1)', () => {
  it('is deterministic: same topology + params -> identical bounds and field samples', () => {
    const topology = customGraphTopology()
    const a = buildCaveSdfRepresentation(topology, DEFAULT_SDF_PARAMS)
    const b = buildCaveSdfRepresentation(topology, DEFAULT_SDF_PARAMS)
    expect(a.bounds).toEqual(b.bounds)
    for (const [x, y, z] of [[0, 0, 0], [6, -1, 0], [12, -2, 0], [6, -1.5, 8], [100, 100, 100]] as const) {
      expect(a.sample(x, y, z)).toBe(b.sample(x, y, z))
    }
  })

  it('consumes an arbitrary segment graph with no Milestone-A/MAIN_CHAIN node ids', () => {
    const topology = customGraphTopology()
    const representation = buildCaveSdfRepresentation(topology, DEFAULT_SDF_PARAMS)
    // Inside every node position (the void), the field must be negative;
    // far outside the whole graph, it must be positive (rock).
    for (const node of topology.nodes) {
      expect(representation.sample(node.position.x, node.position.y + node.targetHeight * 0.4, node.position.z)).toBeLessThan(0)
    }
    expect(representation.sample(1000, 1000, 1000)).toBeGreaterThan(0)
  })

  it('produces finite bounds enclosing every node and the branch', () => {
    const topology = customGraphTopology()
    const { bounds } = buildCaveSdfRepresentation(topology, DEFAULT_SDF_PARAMS)
    for (const key of ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ'] as const) {
      expect(Number.isFinite(bounds[key])).toBe(true)
    }
    for (const node of topology.nodes) {
      expect(node.position.x).toBeGreaterThanOrEqual(bounds.minX)
      expect(node.position.x).toBeLessThanOrEqual(bounds.maxX)
      expect(node.position.z).toBeGreaterThanOrEqual(bounds.minZ)
      expect(node.position.z).toBeLessThanOrEqual(bounds.maxZ)
    }
  })
})

describe('placePrimitivesAlongPath (arc-length resampling)', () => {
  const station = (x: number): { x: number, y: number, z: number, width: number, height: number } => ({ x, y: 0, z: 0, width: 4, height: 5 })

  it('produces the same primitive count for the same path regardless of input point density', () => {
    const sparse = [station(0), station(10)]
    const dense = Array.from({ length: 21 }, (_, i) => station(i * 0.5))
    const a = placePrimitivesAlongPath(sparse, 0.8)
    const b = placePrimitivesAlongPath(dense, 0.8)
    expect(a.length).toBe(b.length)
  })

  it('spaces primitives by the requested arc length, not by raw path length / point count', () => {
    const points = [station(0), station(4), station(8)]
    const primitives = placePrimitivesAlongPath(points, 2)
    // 8 m path at 2 m spacing -> 5 primitives (0,2,4,6,8).
    expect(primitives.length).toBe(5)
  })
})
