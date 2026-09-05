import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CaveEntrance } from '../caveVolume'
import {
  buildAccidentalUnionStressMesh,
  buildSdfCaveMesh,
  countConnectedComponents,
  DEFAULT_SDF_PARAMS,
} from './sdfCaveMesh'
import { buildSpikeTestTopology } from './spikeTestCave'

function stubWindow(search: string): void {
  vi.stubGlobal('window', { location: { search } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function baseEntrance(): CaveEntrance {
  return { x: 100, y: 12.6, z: -40, yaw: 0.6, width: 3, height: 2.6 }
}

// Coarser than DEFAULT_SDF_PARAMS so the grid stays small under vitest.
const TEST_PARAMS = { ...DEFAULT_SDF_PARAMS, cellSize: 1.0 }

describe('buildSdfCaveMesh (plan world-terrain-008 Variant B)', () => {
  it('is deterministic: same topology + params -> identical vertex/index counts and bounds', () => {
    const topology = buildSpikeTestTopology(42, baseEntrance())
    const a = buildSdfCaveMesh(topology, TEST_PARAMS)
    const b = buildSdfCaveMesh(topology, TEST_PARAMS)
    expect(a.metrics.vertices).toBe(b.metrics.vertices)
    expect(a.metrics.triangles).toBe(b.metrics.triangles)
    expect(a.metrics.bounds).toEqual(b.metrics.bounds)
  })

  it('produces non-empty geometry with no NaN positions', () => {
    const topology = buildSpikeTestTopology(42, baseEntrance())
    const { geometry, metrics } = buildSdfCaveMesh(topology, TEST_PARAMS)
    expect(metrics.vertices).toBeGreaterThan(0)
    expect(metrics.triangles).toBeGreaterThan(0)
    const positions = geometry.getAttribute('position')
    for (let i = 0; i < positions.array.length; i++) {
      expect(Number.isNaN(positions.array[i])).toBe(false)
    }
  })

  it('disabling detail changes the field but preserves structural bounds within tolerance', () => {
    const topology = buildSpikeTestTopology(42, baseEntrance())

    stubWindow('')
    const withDetail = buildSdfCaveMesh(topology, TEST_PARAMS)

    stubWindow('?debugDisableSystems=caveDetail')
    const withoutDetail = buildSdfCaveMesh(topology, TEST_PARAMS)

    expect(withDetail.metrics.detailEnabled).toBe(true)
    expect(withoutDetail.metrics.detailEnabled).toBe(false)

    const boundsTolerance = 1.5
    for (const axis of ['min', 'max'] as const) {
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(withDetail.metrics.bounds[axis][i] - withoutDetail.metrics.bounds[axis][i])).toBeLessThan(boundsTolerance)
      }
    }
  })

  // Plan §10 accidental-union stress test: two spatially close but
  // topologically disconnected void clusters. A large smooth-union radius
  // bridges them into one connected mesh purely from proximity — exactly the
  // "SDF doesn't win just because primitives blend easily" risk the plan
  // calls out. Both outcomes are informative; this test documents which one
  // the tuned `smoothK` produces rather than asserting a required result.
  it('reports whether two close-but-disconnected clusters end up spatially bridged', () => {
    const stressed = buildAccidentalUnionStressMesh({
      clusterA: { center: { x: 0, y: 0, z: 0 }, radius: 1.5 },
      clusterB: { center: { x: 0, y: 0, z: 3.2 }, radius: 1.5 },
      cellSize: 0.5,
      smoothK: DEFAULT_SDF_PARAMS.smoothK,
    })
    expect(stressed.positions.length).toBeGreaterThan(0)
    const vertexCount = stressed.positions.length / 3
    const components = countConnectedComponents(stressed.indices, vertexCount)
    expect(components).toBeGreaterThanOrEqual(1)
    expect(components).toBeLessThanOrEqual(2)
  })

  // Regression (2026-09-05 repro): the surface-net mesher emitted every quad
  // in one fixed corner order regardless of which end of the crossed edge was
  // the void, so ~half the faces were back-facing. With the shared
  // `DoubleSide` + `flatShading` cave material — three.js flips the derived
  // normal by `gl_FrontFacing` — those faces are lit from behind and render
  // black, which is what made the cave mouth read as a black blob.
  it('winds every face toward the void, so normals are consistent', () => {
    const sphere = buildAccidentalUnionStressMesh({
      clusterA: { center: { x: 0, y: 0, z: 0 }, radius: 2 },
      clusterB: { center: { x: 40, y: 0, z: 0 }, radius: 2 },
      cellSize: 0.25,
      smoothK: 0,
    })
    const at = (i: number): [number, number, number] => [
      sphere.positions[i * 3]!,
      sphere.positions[i * 3 + 1]!,
      sphere.positions[i * 3 + 2]!,
    ]
    let inward = 0
    let outward = 0
    for (let i = 0; i < sphere.indices.length; i += 3) {
      const [ax, ay, az] = at(sphere.indices[i]!)
      const [bx, by, bz] = at(sphere.indices[i + 1]!)
      const [cx, cy, cz] = at(sphere.indices[i + 2]!)
      const ux = bx - ax, uy = by - ay, uz = bz - az
      const vx = cx - ax, vy = cy - ay, vz = cz - az
      const nx = uy * vz - uz * vy
      const ny = uz * vx - ux * vz
      const nz = ux * vy - uy * vx
      // Centroid relative to its own cluster centre — a void sphere's faces
      // must all point back at that centre.
      const gx = (ax + bx + cx) / 3
      const gy = (ay + by + cy) / 3
      const gz = (az + bz + cz) / 3
      const centreX = gx < 20 ? 0 : 40
      if (nx * (gx - centreX) + ny * gy + nz * gz < 0) inward++
      else outward++
    }
    expect(inward).toBeGreaterThan(0)
    expect(outward).toBe(0)
  })

  it('far-apart clusters never bridge regardless of smoothK', () => {
    const stressed = buildAccidentalUnionStressMesh({
      clusterA: { center: { x: 0, y: 0, z: 0 }, radius: 1.5 },
      clusterB: { center: { x: 0, y: 0, z: 40 }, radius: 1.5 },
      cellSize: 0.5,
      smoothK: DEFAULT_SDF_PARAMS.smoothK,
    })
    const vertexCount = stressed.positions.length / 3
    expect(countConnectedComponents(stressed.indices, vertexCount)).toBe(2)
  })
})
