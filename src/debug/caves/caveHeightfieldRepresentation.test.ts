import { describe, expect, it } from 'vitest'
import {
  buildCaveHeightfieldFixture,
  CAVE_HEIGHTFIELD_ENTRANCE,
} from './caveHeightfieldFixtures'
import { buildHeightfieldMeshBuffers } from './caveHeightfieldMesh'
import {
  buildCaveHeightfieldRepresentation,
  DEFAULT_HEIGHTFIELD_CONFIG,
  extractHeightfieldBoundaryEdges,
  heightfieldCellCenter,
  sampleHeightfieldAt,
} from './caveHeightfieldRepresentation'

const TEST_CONFIG = { ...DEFAULT_HEIGHTFIELD_CONFIG, cellSize: 0.5 }

function arraysEqual(a: Float32Array | Uint8Array, b: Float32Array | Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function nearestInsideCell(
  representation: ReturnType<typeof buildCaveHeightfieldRepresentation>['representation'],
  x: number,
  z: number,
): { ix: number, iz: number } | null {
  let best: { ix: number, iz: number, dist: number } | null = null
  for (let iz = 0; iz < representation.depth; iz++) {
    for (let ix = 0; ix < representation.width; ix++) {
      const i = iz * representation.width + ix
      if (!representation.inside[i]) continue
      const c = heightfieldCellCenter(representation, ix, iz)
      const dist = Math.hypot(c.x - x, c.z - z)
      if (!best || dist < best.dist) best = { ix, iz, dist }
    }
  }
  return best ? { ix: best.ix, iz: best.iz } : null
}

function floodInside(
  representation: ReturnType<typeof buildCaveHeightfieldRepresentation>['representation'],
  startIx: number,
  startIz: number,
): Set<number> {
  const seen = new Set<number>()
  const stack = [[startIx, startIz] as const]
  while (stack.length > 0) {
    const [ix, iz] = stack.pop()!
    if (ix < 0 || iz < 0 || ix >= representation.width || iz >= representation.depth) continue
    const i = iz * representation.width + ix
    if (seen.has(i) || !representation.inside[i]) continue
    seen.add(i)
    stack.push([ix + 1, iz], [ix - 1, iz], [ix, iz + 1], [ix, iz - 1])
  }
  return seen
}

function insideHalfWidthAtZ(
  representation: ReturnType<typeof buildCaveHeightfieldRepresentation>['representation'],
  z: number,
): number {
  let minX = Infinity
  let maxX = -Infinity
  for (let iz = 0; iz < representation.depth; iz++) {
    for (let ix = 0; ix < representation.width; ix++) {
      const i = iz * representation.width + ix
      if (!representation.inside[i]) continue
      const c = heightfieldCellCenter(representation, ix, iz)
      if (Math.abs(c.z - z) > representation.cellSize) continue
      minX = Math.min(minX, c.x)
      maxX = Math.max(maxX, c.x)
    }
  }
  return maxX - minX
}

describe('cave heightfield representation (plan world-terrain-018)', () => {
  it('is deterministic: same topology + config → identical arrays', () => {
    const topology = buildCaveHeightfieldFixture('basic')
    const a = buildCaveHeightfieldRepresentation(topology, TEST_CONFIG)
    const b = buildCaveHeightfieldRepresentation(topology, TEST_CONFIG)
    expect(a.representation.width).toBe(b.representation.width)
    expect(a.representation.depth).toBe(b.representation.depth)
    expect(arraysEqual(a.representation.inside, b.representation.inside)).toBe(true)
    expect(arraysEqual(a.representation.floorY, b.representation.floorY)).toBe(true)
    expect(arraysEqual(a.representation.ceilingY, b.representation.ceilingY)).toBe(true)
    expect(arraysEqual(a.representation.signedDistance, b.representation.signedDistance)).toBe(true)
  })

  it('every inside cell satisfies min clearance', () => {
    for (const id of ['basic', 'bend', 'branch'] as const) {
      const topology = buildCaveHeightfieldFixture(id)
      const { representation } = buildCaveHeightfieldRepresentation(topology, TEST_CONFIG)
      for (let i = 0; i < representation.inside.length; i++) {
        if (!representation.inside[i]) continue
        expect(representation.ceilingY[i]! - representation.floorY[i]!).toBeGreaterThanOrEqual(topology.minClearance - 1e-5)
      }
    }
  })

  it('a straight passage has no internal holes along the centerline', () => {
    const topology = buildCaveHeightfieldFixture('basic')
    const { representation } = buildCaveHeightfieldRepresentation(topology, TEST_CONFIG)
    for (let z = -0.5; z >= -16.5; z -= 0.5) {
      const sample = sampleHeightfieldAt(representation, 0, z)
      expect(sample.inside).toBe(true)
    }
  })

  it('widening / chamber increases footprint width over the passage', () => {
    const topology = buildCaveHeightfieldFixture('basic')
    const { representation } = buildCaveHeightfieldRepresentation(topology, TEST_CONFIG)
    const passageW = insideHalfWidthAtZ(representation, -8)
    const chamberW = insideHalfWidthAtZ(representation, -17)
    expect(passageW).toBeGreaterThan(2)
    expect(chamberW).toBeGreaterThan(passageW + 1.5)
  })

  it('a branch fixture is one connected intended junction', () => {
    const topology = buildCaveHeightfieldFixture('branch')
    const { representation, insideCellCount } = buildCaveHeightfieldRepresentation(topology, TEST_CONFIG)
    const start = nearestInsideCell(representation, 0, 0)
    const left = nearestInsideCell(representation, -6.4, -14.2)
    const right = nearestInsideCell(representation, 6.6, -13.4)
    expect(start).not.toBeNull()
    expect(left).not.toBeNull()
    expect(right).not.toBeNull()
    const seen = floodInside(representation, start!.ix, start!.iz)
    expect(seen.has(left!.iz * representation.width + left!.ix)).toBe(true)
    expect(seen.has(right!.iz * representation.width + right!.ix)).toBe(true)
    expect(seen.size).toBe(insideCellCount)
  })

  it('boundary wall extraction owns each inside→outside edge once', () => {
    const topology = buildCaveHeightfieldFixture('branch')
    const { representation } = buildCaveHeightfieldRepresentation(topology, TEST_CONFIG)
    const edges = extractHeightfieldBoundaryEdges(representation)
    const keys = edges.map((e) => `${e.insideIx},${e.insideIz}|${e.outsideIx},${e.outsideIz}`)
    expect(new Set(keys).size).toBe(keys.length)
    expect(edges.length).toBeGreaterThan(20)
  })

  it('inside floor/ceiling arrays contain no invalid values', () => {
    const topology = buildCaveHeightfieldFixture('bend')
    const { representation } = buildCaveHeightfieldRepresentation(topology, TEST_CONFIG)
    for (let i = 0; i < representation.inside.length; i++) {
      if (!representation.inside[i]) continue
      expect(Number.isFinite(representation.floorY[i])).toBe(true)
      expect(Number.isFinite(representation.ceilingY[i])).toBe(true)
      expect(Number.isFinite(representation.signedDistance[i])).toBe(true)
    }
  })

  it('mesh buffers are non-empty and use unique boundary edges from the representation', () => {
    const topology = buildCaveHeightfieldFixture('basic')
    const { representation } = buildCaveHeightfieldRepresentation(topology, TEST_CONFIG)
    const edges = extractHeightfieldBoundaryEdges(representation)
    const buffers = buildHeightfieldMeshBuffers(representation)
    expect(buffers.vertices).toBeGreaterThan(0)
    expect(buffers.triangles).toBeGreaterThan(0)
    expect(buffers.boundaryEdgeCount).toBe(edges.length)
    for (let i = 0; i < buffers.positions.length; i++) {
      expect(Number.isFinite(buffers.positions[i])).toBe(true)
    }
  })

  it('does not invent a second topology type — fixtures are CaveTopology', () => {
    const topology = buildCaveHeightfieldFixture('basic')
    expect(topology.entrance).toEqual(CAVE_HEIGHTFIELD_ENTRANCE)
    expect(topology.nodes.some((n) => n.kind === 'entrance')).toBe(true)
    expect(topology.segments.length).toBeGreaterThan(0)
    expect(topology.minClearance).toBeGreaterThan(0)
  })
})
