/** Plan world-terrain-019 Milestone B — persistent terrain cutout on an
 *  indexed chunk grid: exact contour, chunk-boundary continuity,
 *  determinism across rebuilds. Pure; no `ChunkManager`, no worker. */

import { MeshStandardMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import type { ChunkMeshData } from './chunkMeshData'
import { buildChunkGeometry } from './buildChunkGeometry'
import { buildCutChunkAttributes, cutoutsOverlappingChunk, type TerrainCutout } from './terrainCutout'

const CHUNK_SIZE = 8
const RESOLUTION = 9 // step 1

function flatMeshData(resolution: number, y = 5): ChunkMeshData {
  const count = resolution * resolution
  const normal = new Float32Array(count * 3)
  const color = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    normal[i * 3 + 1] = 1
    color[i * 3] = 0.2
    color[i * 3 + 1] = 0.5
    color[i * 3 + 2] = 0.1
  }
  return {
    positionY: new Float32Array(count).fill(y),
    normal,
    color,
    bareGround: new Float32Array(count).fill(0.25),
  }
}

/** Disc hole: opening is `radius - distance` — the exact contour is the circle. */
function discCutout(cx: number, cz: number, radius: number, id = 'disc'): TerrainCutout {
  return {
    id,
    bounds: { minX: cx - radius, maxX: cx + radius, minZ: cz - radius, maxZ: cz + radius },
    openingAt: (x, z) => radius - Math.hypot(x - cx, z - cz),
  }
}

function triangleCoversXZ(
  position: Float32Array,
  index: Uint32Array,
  originX: number,
  originZ: number,
  px: number,
  pz: number,
): boolean {
  const lx = px - originX
  const lz = pz - originZ
  for (let t = 0; t < index.length; t += 3) {
    const ax = position[index[t]! * 3]!
    const az = position[index[t]! * 3 + 2]!
    const bx = position[index[t + 1]! * 3]!
    const bz = position[index[t + 1]! * 3 + 2]!
    const cx = position[index[t + 2]! * 3]!
    const cz = position[index[t + 2]! * 3 + 2]!
    const d1 = (lx - bx) * (az - bz) - (ax - bx) * (lz - bz)
    const d2 = (lx - cx) * (bz - cz) - (bx - cx) * (lz - cz)
    const d3 = (lx - ax) * (cz - az) - (cx - ax) * (lz - az)
    const hasNeg = d1 < -1e-9 || d2 < -1e-9 || d3 < -1e-9
    const hasPos = d1 > 1e-9 || d2 > 1e-9 || d3 > 1e-9
    if (!(hasNeg && hasPos)) return true
  }
  return false
}

function facingUpCount(position: Float32Array, index: Uint32Array): { up: number, down: number } {
  let up = 0
  let down = 0
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t]! * 3
    const b = index[t + 1]! * 3
    const c = index[t + 2]! * 3
    const u = [position[c]! - position[b]!, position[c + 1]! - position[b + 1]!, position[c + 2]! - position[b + 2]!]
    const v = [position[a]! - position[b]!, position[a + 1]! - position[b + 1]!, position[a + 2]! - position[b + 2]!]
    const ny = u[2]! * v[0]! - u[0]! * v[2]!
    if (ny > 1e-9) up++
    else if (ny < -1e-9) down++
  }
  return { up, down }
}

const FULL_TRIANGLES = (RESOLUTION - 1) * (RESOLUTION - 1) * 2
const NODE_COUNT = RESOLUTION * RESOLUTION

describe('cutoutsOverlappingChunk', () => {
  it('keeps cutouts that touch the chunk, including one grid step of slack, and drops the rest', () => {
    const inside = discCutout(0, 0, 1)
    const nearEdge = discCutout(4.5, 0, 0.4) // bounds [4.1, 4.9] — within one step of the chunk edge at 4
    const far = discCutout(20, 0, 1)
    const out = cutoutsOverlappingChunk([inside, nearEdge, far], 0, 0, CHUNK_SIZE, 1)
    expect(out.map((c) => c.id)).toEqual([inside.id, nearEdge.id])
    expect(cutoutsOverlappingChunk([], 0, 0, CHUNK_SIZE, 1)).toEqual([])
  })
})

describe('buildCutChunkAttributes', () => {
  it('with no reachable opening reproduces the full regular sheet', () => {
    const data = flatMeshData(RESOLUTION)
    const noHole: TerrainCutout = {
      id: 'closed',
      bounds: { minX: -2, maxX: 2, minZ: -2, maxZ: 2 },
      openingAt: () => -1,
    }
    const cut = buildCutChunkAttributes(data, RESOLUTION, CHUNK_SIZE, 0, 0, [noHole])
    expect(cut.index.length).toBe(FULL_TRIANGLES * 3)
    expect(cut.contourVertexCount).toBe(0)
    expect(cut.cutCellCount).toBe(0)
    expect(cut.position.length / 3).toBe(NODE_COUNT)
    // PlaneGeometry's own diagonal/winding for the first cell.
    expect(Array.from(cut.index.slice(0, 6))).toEqual([0, RESOLUTION, 1, RESOLUTION, RESOLUTION + 1, 1])
  })

  it('removes the terrain exactly over the opening and keeps it everywhere else', () => {
    const data = flatMeshData(RESOLUTION)
    const hole = discCutout(0.3, -0.2, 1.4)
    const cut = buildCutChunkAttributes(data, RESOLUTION, CHUNK_SIZE, 0, 0, [hole])
    expect(cut.cutCellCount).toBeGreaterThan(0)
    expect(cut.contourVertexCount).toBeGreaterThan(4)
    expect(cut.position.length / 3).toBe(NODE_COUNT + cut.contourVertexCount)
    // Open points have no terrain; kept points keep it.
    expect(triangleCoversXZ(cut.position, cut.index, 0, 0, 0.3, -0.2)).toBe(false)
    expect(triangleCoversXZ(cut.position, cut.index, 0, 0, 0.9, 0.3)).toBe(false)
    expect(triangleCoversXZ(cut.position, cut.index, 0, 0, 2.5, 0)).toBe(true)
    expect(triangleCoversXZ(cut.position, cut.index, 0, 0, -3.5, 3.5)).toBe(true)
    expect(triangleCoversXZ(cut.position, cut.index, 0, 0, 0.3, -1.9)).toBe(true)
    // The only removed cells are the ones the disc actually touches — no
    // whole-quad over-cut past the contour.
    expect(cut.cutCellCount).toBeLessThanOrEqual(16)
  })

  it('contour vertices lie on the openingAt = 0 crossing, with every attribute interpolated', () => {
    const data = flatMeshData(RESOLUTION)
    // Vary Y and colour so the interpolation is observable.
    for (let i = 0; i < NODE_COUNT; i++) {
      data.positionY[i] = 5 + (i % RESOLUTION) * 0.5
      data.color[i * 3] = (i % RESOLUTION) / RESOLUTION
    }
    const hole = discCutout(0.3, -0.2, 1.4)
    const cut = buildCutChunkAttributes(data, RESOLUTION, CHUNK_SIZE, 0, 0, [hole])
    const n = cut.position.length / 3
    expect(cut.normal.length / 3).toBe(n)
    expect(cut.color.length / 3).toBe(n)
    expect(cut.bareGround.length).toBe(n)
    expect(cut.uv.length / 2).toBe(n)
    for (let v = NODE_COUNT; v < n; v++) {
      const x = cut.position[v * 3]!
      const y = cut.position[v * 3 + 1]!
      const z = cut.position[v * 3 + 2]!
      // Bisected on the real predicate: on the circle to ~1.5 cm, never a node.
      expect(Math.abs(Math.hypot(x - 0.3, z + 0.2) - 1.4)).toBeLessThan(0.02)
      // On a chunk-local grid every node is integral in at least one axis
      // for a 1 m step; a contour vertex must be strictly between nodes on
      // the axis it was cut along.
      expect(Number.isInteger(x) && Number.isInteger(z)).toBe(false)
      // Y follows the node Y ramp (5 + local ix * 0.5 with ix = x + 4).
      expect(y).toBeCloseTo(5 + (x + 4) * 0.5, 6)
      expect(cut.color[v * 3]!).toBeCloseTo((x + 4) / RESOLUTION, 6)
      expect(cut.bareGround[v]!).toBeCloseTo(0.25, 6)
      expect(cut.uv[v * 2]!).toBeCloseTo((x + 4) / (RESOLUTION - 1), 6)
      expect(cut.uv[v * 2 + 1]!).toBeCloseTo(1 - (z + 4) / (RESOLUTION - 1), 6)
      const nl = Math.hypot(cut.normal[v * 3]!, cut.normal[v * 3 + 1]!, cut.normal[v * 3 + 2]!)
      expect(nl).toBeCloseTo(1, 6)
    }
    // Every index addresses a real vertex and every triangle faces up.
    for (let i = 0; i < cut.index.length; i++) expect(cut.index[i]!).toBeLessThan(n)
    const { up, down } = facingUpCount(cut.position, cut.index)
    expect(down).toBe(0)
    expect(up).toBe(cut.index.length / 3)
  })

  it('is deterministic — a rebuild reproduces the identical hole', () => {
    const data = flatMeshData(RESOLUTION)
    const hole = discCutout(-1.1, 2.4, 1.7)
    const a = buildCutChunkAttributes(data, RESOLUTION, CHUNK_SIZE, 0, 0, [hole])
    const b = buildCutChunkAttributes(data, RESOLUTION, CHUNK_SIZE, 0, 0, [hole])
    expect(Array.from(a.index)).toEqual(Array.from(b.index))
    expect(Array.from(a.position)).toEqual(Array.from(b.position))
    expect(a.cutCellCount).toBe(b.cutCellCount)
  })

  it('a hole straddling a chunk boundary produces identical contour vertices on both sides', () => {
    // Chunk (0,0) spans x ∈ [-4, 4], chunk (1,0) spans x ∈ [4, 12]; the disc
    // is centred on the shared edge and off-grid in Z.
    const hole = discCutout(4, 0.37, 1.6)
    const data = flatMeshData(RESOLUTION)
    const left = buildCutChunkAttributes(data, RESOLUTION, CHUNK_SIZE, 0, 0, [hole])
    const right = buildCutChunkAttributes(data, RESOLUTION, CHUNK_SIZE, CHUNK_SIZE, 0, [hole])
    const onEdge = (cut: typeof left, originX: number): string[] => {
      const out: string[] = []
      for (let v = 0; v < cut.position.length / 3; v++) {
        const x = cut.position[v * 3]! + originX
        if (Math.abs(x - 4) > 1e-6) continue
        // Only vertices that are actually used by a triangle count.
        let used = false
        for (let i = 0; i < cut.index.length; i++) if (cut.index[i] === v) { used = true; break }
        if (!used) continue
        out.push(`${x.toFixed(5)}|${cut.position[v * 3 + 1]!.toFixed(5)}|${cut.position[v * 3 + 2]!.toFixed(5)}`)
      }
      return out.sort()
    }
    const leftEdge = onEdge(left, 0)
    const rightEdge = onEdge(right, CHUNK_SIZE)
    expect(leftEdge.length).toBeGreaterThan(0)
    expect(leftEdge).toEqual(rightEdge)
    // Both halves lost terrain over the hole centre side they own.
    expect(triangleCoversXZ(left.position, left.index, 0, 0, 3.5, 0.37)).toBe(false)
    expect(triangleCoversXZ(right.position, right.index, CHUNK_SIZE, 0, 4.5, 0.37)).toBe(false)
    expect(left.cutCellCount).toBeGreaterThan(0)
    expect(right.cutCellCount).toBeGreaterThan(0)
  })

  it('pins contour vertices to the owner surface height when the cutout provides one', () => {
    const data = flatMeshData(RESOLUTION, 5)
    const hole: TerrainCutout = { ...discCutout(0.3, -0.2, 1.4), surfaceYAt: (x, z) => 20 + x * 0.1 + z * 0.2 }
    const cut = buildCutChunkAttributes(data, RESOLUTION, CHUNK_SIZE, 0, 0, [hole])
    expect(cut.contourVertexCount).toBeGreaterThan(0)
    for (let v = NODE_COUNT; v < cut.position.length / 3; v++) {
      const x = cut.position[v * 3]!
      const z = cut.position[v * 3 + 2]!
      expect(cut.position[v * 3 + 1]!).toBeCloseTo(20 + x * 0.1 + z * 0.2, 5)
    }
    // Grid nodes keep their own mesh-data height.
    for (let v = 0; v < NODE_COUNT; v++) expect(cut.position[v * 3 + 1]!).toBe(5)
  })

  it('two overlapping cutouts union their openings', () => {
    const data = flatMeshData(RESOLUTION)
    const a = discCutout(-1, 0, 1.2, 'a')
    const b = discCutout(1, 0, 1.2, 'b')
    const cut = buildCutChunkAttributes(data, RESOLUTION, CHUNK_SIZE, 0, 0, [a, b])
    expect(triangleCoversXZ(cut.position, cut.index, 0, 0, -1, 0)).toBe(false)
    expect(triangleCoversXZ(cut.position, cut.index, 0, 0, 1, 0)).toBe(false)
    expect(triangleCoversXZ(cut.position, cut.index, 0, 0, 0, 0)).toBe(false)
    expect(triangleCoversXZ(cut.position, cut.index, 0, 0, 0, 2)).toBe(true)
  })
})

describe('buildChunkGeometry with cutouts', () => {
  it('emits an indexed cut geometry with the attributes the shared terrain material needs', () => {
    const data = flatMeshData(RESOLUTION)
    const material = new MeshStandardMaterial()
    const full = buildChunkGeometry(data, RESOLUTION, CHUNK_SIZE, 0, 0, material, false)
    const cut = buildChunkGeometry(data, RESOLUTION, CHUNK_SIZE, 0, 0, material, false, [discCutout(0, 0, 1.4)])
    expect(full.mesh.geometry.index!.count).toBe(FULL_TRIANGLES * 3)
    expect(full.mesh.geometry.getAttribute('position').count).toBe(NODE_COUNT)
    // Contour vertices were appended after the grid nodes.
    expect(cut.mesh.geometry.getAttribute('position').count).toBeGreaterThan(NODE_COUNT)
    for (const name of ['position', 'normal', 'color', 'aBareGround', 'uv']) {
      expect(cut.mesh.geometry.getAttribute(name)).toBeDefined()
      expect(full.mesh.geometry.getAttribute(name)).toBeDefined()
    }
    expect(cut.mesh.position.x).toBe(0)
    full.dispose()
    cut.dispose()
  })
})
