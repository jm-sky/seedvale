/** Debug harness mesh tests. Pure heightfield representation tests live next
 *  to the production module (`src/world/caves/caveHeightfieldRepresentation.test.ts`).
 */
import { describe, expect, it } from 'vitest'
import {
  buildCaveHeightfieldFixture,
  CAVE_HEIGHTFIELD_FIXTURE_IDS,
  caveHeightfieldWalkSurfaceAt,
} from './caveHeightfieldFixtures'
import { buildHeightfieldMeshBuffers, buildMouthUndersideMaskBuffers } from './caveHeightfieldMesh'
import {
  buildCaveHeightfield,
  type CaveHeightfield,
  DEFAULT_HEIGHTFIELD_CONFIG,
  mouthOpeningAt,
  sampleHeightfieldAt,
} from './caveHeightfieldRepresentation'

const TEST_CONFIG = { ...DEFAULT_HEIGHTFIELD_CONFIG, cellSize: 0.5 }
const walk = caveHeightfieldWalkSurfaceAt

function build(id: (typeof CAVE_HEIGHTFIELD_FIXTURE_IDS)[number]): CaveHeightfield {
  return buildCaveHeightfield(buildCaveHeightfieldFixture(id), walk, TEST_CONFIG).heightfield
}

function arraysEqual(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

describe('cave heightfield mesh', () => {
  it('produces a watertight welded surface with no boundary-wall pass', () => {
    for (const id of CAVE_HEIGHTFIELD_FIXTURE_IDS) {
      const field = build(id)
      const buffers = buildHeightfieldMeshBuffers(field)
      expect(buffers.vertices).toBeGreaterThan(0)
      expect(buffers.triangles).toBeGreaterThan(0)
      expect(buffers.rimVertexCount).toBeGreaterThan(20)
      for (let i = 0; i < buffers.positions.length; i++) {
        expect(Number.isFinite(buffers.positions[i])).toBe(true)
      }
    }
  })

  it('floor triangles face up and ceiling triangles face down', () => {
    const field = build('basic')
    const { positions, indices } = buildHeightfieldMeshBuffers(field)
    let up = 0
    let down = 0
    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t]! * 3
      const b = indices[t + 1]! * 3
      const c = indices[t + 2]! * 3
      // THREE.computeVertexNormals: n = (C - B) x (A - B)
      const u = [positions[c]! - positions[b]!, positions[c + 1]! - positions[b + 1]!, positions[c + 2]! - positions[b + 2]!]
      const v = [positions[a]! - positions[b]!, positions[a + 1]! - positions[b + 1]!, positions[a + 2]! - positions[b + 2]!]
      const ny = u[2]! * v[0]! - u[0]! * v[2]!
      if (ny > 1e-9) up++
      else if (ny < -1e-9) down++
    }
    // Both surfaces exist and neither is inverted — with FrontSide, an
    // inverted floor is an invisible floor (the merged spike's defect).
    expect(up).toBeGreaterThan(100)
    expect(down).toBeGreaterThan(100)
  })

  it('shares vertices between neighbouring cells — no per-cell flat quads', () => {
    const field = build('basic')
    const buffers = buildHeightfieldMeshBuffers(field)
    // Unshared per-cell quads would need >= 4 vertices per emitted triangle
    // pair. Shared corners bring it well under 1 vertex per triangle.
    expect(buffers.vertices).toBeLessThan(buffers.triangles)
    // Every index addresses a real vertex.
    for (let i = 0; i < buffers.indices.length; i++) {
      expect(buffers.indices[i]!).toBeLessThan(buffers.vertices)
    }
  })

  it('rim vertices are shared by the floor and the ceiling, welding the two surfaces', () => {
    const field = build('branch')
    const buffers = buildHeightfieldMeshBuffers(field)
    // A welded surface has no naked boundary edge except at the open mouth:
    // count edges used by exactly one triangle.
    const edgeUse = new Map<string, number>()
    for (let t = 0; t < buffers.indices.length; t += 3) {
      const tri = [buffers.indices[t]!, buffers.indices[t + 1]!, buffers.indices[t + 2]!]
      for (let k = 0; k < 3; k++) {
        const a = tri[k]!
        const b = tri[(k + 1) % 3]!
        const key = a < b ? `${a}:${b}` : `${b}:${a}`
        edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1)
      }
    }
    let naked = 0
    for (const uses of edgeUse.values()) if (uses === 1) naked++
    // Only the mouth portal may leave an open edge loop; a per-cell-quad mesh
    // would leave thousands.
    expect(naked).toBeLessThan(edgeUse.size * 0.05)
  })

  it('mouth underside mask sits under the terrain around the opening, not in the doorway', () => {
    for (const id of CAVE_HEIGHTFIELD_FIXTURE_IDS) {
      const field = build(id)
      const opening = (x: number, z: number): number => mouthOpeningAt(field, walk, x, z)
      const buffers = buildMouthUndersideMaskBuffers(field, opening, walk)
      expect(buffers.vertices).toBeGreaterThan(80)
      expect(buffers.triangles).toBeGreaterThan(80)
      let insideDoorway = 0
      for (let i = 0; i < buffers.vertices; i++) {
        const x = buffers.positions[i * 3]!
        const y = buffers.positions[i * 3 + 1]!
        const z = buffers.positions[i * 3 + 2]!
        expect(Number.isFinite(y)).toBe(true)
        expect(y).toBeLessThan(walk(x, z) - 0.01)
        expect(Math.hypot(x - field.entrance.x, z - field.entrance.z)).toBeLessThan(12)
        // The 4×4 under-entrance plane sits in the doorway XZ on purpose,
        // 0.5 m below the mouth floor — it must not count as blocking the
        // opening. Only geometry near walk height would.
        if (opening(x, z) > 0.12 && y > walk(x, z) - 0.35) insideDoorway++
        const sample = sampleHeightfieldAt(field, x, z)
        if (
          sample.gap > 0
          && !sample.outsideGrid
          && sample.surfaceY - sample.ceilY > 0.12
          && y >= sample.floorY - 0.05
        ) {
          expect(y).toBeGreaterThan(sample.ceilY - 0.02)
        }
      }
      expect(insideDoorway).toBe(0)
    }
  })

  it('mouth underside mask is deterministic', () => {
    const field = build('basic')
    const opening = (x: number, z: number): number => mouthOpeningAt(field, walk, x, z)
    const a = buildMouthUndersideMaskBuffers(field, opening, walk)
    const b = buildMouthUndersideMaskBuffers(field, opening, walk)
    expect(a.vertices).toBe(b.vertices)
    expect(a.triangles).toBe(b.triangles)
    expect(arraysEqual(a.positions, b.positions)).toBe(true)
    expect(Array.from(a.indices)).toEqual(Array.from(b.indices))
  })

  it('includes a flat 6 m plane 1 m under the entrance facing up', () => {
    const field = build('basic')
    const opening = (x: number, z: number): number => mouthOpeningAt(field, walk, x, z)
    const { positions, indices } = buildMouthUndersideMaskBuffers(field, opening, walk)
    const y0 = field.entrance.y - 1
    const xs: number[] = []
    const zs: number[] = []
    for (let i = 0; i < positions.length; i += 3) {
      if (Math.abs(positions[i + 1]! - y0) > 1e-4) continue
      xs.push(positions[i]!)
      zs.push(positions[i + 2]!)
    }
    expect(xs.length).toBeGreaterThanOrEqual(4)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(6, 5)
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(6, 5)
    let up = 0
    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t]! * 3
      const b = indices[t + 1]! * 3
      const c = indices[t + 2]! * 3
      if (
        Math.abs(positions[a + 1]! - y0) > 1e-4
        || Math.abs(positions[b + 1]! - y0) > 1e-4
        || Math.abs(positions[c + 1]! - y0) > 1e-4
      ) continue
      const u = [positions[c]! - positions[b]!, positions[c + 1]! - positions[b + 1]!, positions[c + 2]! - positions[b + 2]!]
      const v = [positions[a]! - positions[b]!, positions[a + 1]! - positions[b + 1]!, positions[a + 2]! - positions[b + 2]!]
      if (u[2]! * v[0]! - u[0]! * v[2]! > 1e-9) up++
    }
    expect(up).toBeGreaterThan(0)
  })
})
