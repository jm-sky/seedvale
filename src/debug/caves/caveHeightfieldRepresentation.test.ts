import { describe, expect, it } from 'vitest'
import { STEP_DOWN_MAX } from '../../player/verticalMotion'
import { SLOPE_MAX_WALKABLE_DEG } from '../../terrain/slopeConstraint'
import { SURFACE_CLIP_EPS } from '../../world/caves/caveSdfQuery'
import {
  buildCaveHeightfieldFixture,
  CAVE_HEIGHTFIELD_ENTRANCE,
  CAVE_HEIGHTFIELD_FIXTURE_IDS,
  caveHeightfieldWalkSurfaceAt,
} from './caveHeightfieldFixtures'
import { buildHeightfieldMeshBuffers, buildMouthUndersideMaskBuffers } from './caveHeightfieldMesh'
import {
  buildCaveHeightfield,
  type CaveHeightfield,
  closure,
  crossSectionAt,
  DEFAULT_HEIGHTFIELD_CONFIG,
  heightfieldNodeGap,
  heightfieldNodeOpenSky,
  mouthOpeningAt,
  NC,
  NF,
  R_MIN,
  sampleHeightfieldAt,
  SMOOTH_K,
  U_CORE,
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

function caveWidthAt(field: CaveHeightfield, z: number): number {
  let minX = Infinity
  let maxX = -Infinity
  for (let ix = 0; ix < field.nx; ix++) {
    const x = field.originX + ix * field.cellSize
    if (sampleHeightfieldAt(field, x, z).gap <= 0) continue
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
  }
  return maxX >= minX ? maxX - minX : 0
}

describe('cave heightfield cross-section (design doc §5.3/§6)', () => {
  it('closure is flat at the axis and fully closed at the rim', () => {
    for (const n of [NF, NC]) {
      expect(closure(0, n)).toBe(0)
      expect(closure(1, n)).toBe(1)
      // Zero tangent at the axis: the first 10% of the band lifts almost nothing.
      expect(closure(0.1, n)).toBeLessThan(0.02)
      // Vertical tangent at the rim: the last 10% carries a large share.
      expect(closure(0.95, n)).toBeGreaterThan(0.35)
      for (let u = 0; u <= 1.0001; u += 0.05) {
        expect(closure(u, n)).toBeGreaterThanOrEqual(closure(Math.max(0, u - 0.05), n) - 1e-9)
      }
    }
  })

  it('floor and ceiling converge exactly at the rim and diverge outside it', () => {
    const coreRadius = 1.3
    const axisY = 10
    const height = 2.4
    const axis = crossSectionAt(0, coreRadius, axisY, height)
    expect(axis.f).toBeCloseTo(axisY, 6)
    expect(axis.c).toBeCloseTo(axisY + height, 6)

    // Declared usable width stays flat: the rounding is added outside it.
    const coreEdge = crossSectionAt(coreRadius, coreRadius, axisY, height)
    expect(coreEdge.f).toBeCloseTo(axisY, 6)

    let prevGap = Infinity
    for (let d = 0; d < 4; d += 0.05) {
      const cs = crossSectionAt(d, coreRadius, axisY, height)
      const gap = cs.c - cs.f
      expect(gap).toBeLessThanOrEqual(prevGap + 1e-9)
      prevGap = gap
    }
    // Meet at the rim, then open negative.
    const rim = coreRadius + 0.648
    expect(crossSectionAt(rim, coreRadius, axisY, height).c
      - crossSectionAt(rim, coreRadius, axisY, height).f).toBeCloseTo(0, 4)
    expect(crossSectionAt(rim + 1, coreRadius, axisY, height).c
      - crossSectionAt(rim + 1, coreRadius, axisY, height).f).toBeLessThan(-1)
  })
})

describe('cave heightfield field build (plan world-terrain-018)', () => {
  it('is deterministic: same topology + config → identical arrays', () => {
    const a = build('basic')
    const b = build('basic')
    expect(a.nx).toBe(b.nx)
    expect(a.nz).toBe(b.nz)
    expect(arraysEqual(a.floorY, b.floorY)).toBe(true)
    expect(arraysEqual(a.ceilY, b.ceilY)).toBe(true)
    expect(arraysEqual(a.coreT, b.coreT)).toBe(true)
  })

  it('contains no NaN or Infinity anywhere', () => {
    for (const id of CAVE_HEIGHTFIELD_FIXTURE_IDS) {
      const field = build(id)
      for (let i = 0; i < field.floorY.length; i++) {
        expect(Number.isFinite(field.floorY[i])).toBe(true)
        expect(Number.isFinite(field.ceilY[i])).toBe(true)
        expect(Number.isFinite(field.surfaceY[i])).toBe(true)
        expect(Number.isFinite(field.coreT[i])).toBe(true)
      }
    }
  })

  it('holds minClearance across the whole walkable core, and nowhere forces it at the rim', () => {
    for (const id of CAVE_HEIGHTFIELD_FIXTURE_IDS) {
      const topology = buildCaveHeightfieldFixture(id)
      const field = build(id)
      let coreNodes = 0
      let rimNodes = 0
      for (let i = 0; i < field.floorY.length; i++) {
        const gap = heightfieldNodeGap(field, i)
        if (field.coreT[i]! <= U_CORE && gap > 0) {
          coreNodes++
          expect(gap).toBeGreaterThanOrEqual(topology.minClearance - 1e-4)
        }
        // The §2.4 defect: a rim node must be free to converge below
        // minClearance, otherwise the section can never be rounded.
        if (gap > 0 && gap < topology.minClearance * 0.5) rimNodes++
      }
      expect(coreNodes).toBeGreaterThan(50)
      expect(rimNodes).toBeGreaterThan(20)
    }
  })

  it('gap reaches zero smoothly at the boundary — no binary footprint edge', () => {
    const field = build('basic')
    // Sweep laterally out of the passage: gap must decrease monotonically to
    // and through zero rather than stepping off a mask edge. Monotonicity is
    // what `resolveHeightfieldHorizontal` walks, so a bump here would push a
    // trapped capsule the wrong way.
    let prev = Infinity
    let sawSmallPositive = false
    for (let x = 0; x < 6; x += 0.1) {
      const gap = sampleHeightfieldAt(field, x, -8).gap
      expect(gap).toBeLessThanOrEqual(prev + 1e-6)
      if (gap > 0 && gap < 0.6) sawSmallPositive = true
      prev = gap
    }
    expect(sawSmallPositive).toBe(true)
    expect(prev).toBeLessThan(0)
  })

  it('the declared passage width stays walkable — rounding is added outside it', () => {
    const field = build('basic')
    const topology = buildCaveHeightfieldFixture('basic')
    const passage = topology.nodes.find((n) => n.id === 'passage')!
    const axis = sampleHeightfieldAt(field, 0, passage.position.z)
    const halfCore = passage.targetWidth / 2
    // Floor across the declared usable half-width has not climbed into a wall.
    for (let x = -halfCore + 0.1; x <= halfCore - 0.1; x += 0.1) {
      const s = sampleHeightfieldAt(field, x, passage.position.z)
      expect(s.gap).toBeGreaterThan(0)
      expect(s.floorY - axis.floorY).toBeLessThan(0.35)
    }
    // The footprint is wider than the declared width because of the rim band.
    expect(caveWidthAt(field, passage.position.z)).toBeGreaterThan(passage.targetWidth)
  })

  it('the passage runs unbroken from the mouth to the chamber', () => {
    const field = build('basic')
    for (let z = 0.5; z >= -17; z -= 0.25) {
      expect(sampleHeightfieldAt(field, 0, z).gap).toBeGreaterThan(0)
    }
  })

  it('floor descends smoothly: no step over STEP_DOWN_MAX along the centerline', () => {
    for (const id of CAVE_HEIGHTFIELD_FIXTURE_IDS) {
      const field = build(id)
      const topology = buildCaveHeightfieldFixture(id)
      for (const seg of topology.segments) {
        const pts = seg.centerline
        for (let i = 0; i + 1 < pts.length; i++) {
          const a = pts[i]!
          const b = pts[i + 1]!
          const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25))
          let prev = sampleHeightfieldAt(field, a.x, a.z).floorY
          for (let k = 1; k <= steps; k++) {
            const t = k / steps
            const s = sampleHeightfieldAt(field, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)
            expect(Math.abs(s.floorY - prev)).toBeLessThan(STEP_DOWN_MAX)
            prev = s.floorY
          }
        }
      }
    }
  })

  it('noise never makes the centerline floor unwalkable', () => {
    for (const id of CAVE_HEIGHTFIELD_FIXTURE_IDS) {
      const field = build(id)
      const topology = buildCaveHeightfieldFixture(id)
      const e = field.cellSize
      for (const seg of topology.segments) {
        for (const p of seg.centerline) {
          if (sampleHeightfieldAt(field, p.x, p.z).gap <= 0) continue
          const dx = sampleHeightfieldAt(field, p.x + e, p.z).floorY
            - sampleHeightfieldAt(field, p.x - e, p.z).floorY
          const dz = sampleHeightfieldAt(field, p.x, p.z + e).floorY
            - sampleHeightfieldAt(field, p.x, p.z - e).floorY
          const deg = (Math.atan(Math.hypot(dx, dz) / (2 * e)) * 180) / Math.PI
          expect(deg).toBeLessThan(SLOPE_MAX_WALKABLE_DEG)
        }
      }
    }
  })

  it('macro noise never chokes a passage below the minimum half-width', () => {
    const field = build('bend')
    const topology = buildCaveHeightfieldFixture('bend')
    for (const seg of topology.segments) {
      for (const p of seg.centerline) {
        expect(caveWidthAt(field, p.z)).toBeGreaterThan(R_MIN * 2)
      }
    }
  })
})

describe('cave heightfield union (no fold bias)', () => {
  it('a node keeps roughly its declared clearance — the union does not inflate the cave', () => {
    // Regression: the union was a running `smin`/`smax` over one influence per
    // centerline *station*. `smin(a, a, k) = a - k/4`, so ~18 overlapping
    // capsules per segment silently deepened the floor and raised the ceiling
    // (a mouth declaring 2.6 m measured 3.55 m). One influence per run plus
    // blending only the two dominant operands bounds the bias at k/4 once.
    const noiseHeadroom = DEFAULT_HEIGHTFIELD_CONFIG.floorDetail.amplitude
      + DEFAULT_HEIGHTFIELD_CONFIG.ceilingDetail.amplitude
    const budget = SMOOTH_K / 2 + noiseHeadroom + 0.2
    for (const id of CAVE_HEIGHTFIELD_FIXTURE_IDS) {
      const topology = buildCaveHeightfieldFixture(id)
      const field = build(id)
      for (const node of topology.nodes) {
        if (node.kind === 'entrance') continue
        const s = sampleHeightfieldAt(field, node.position.x, node.position.z)
        expect(s.gap).toBeGreaterThan(0)
        expect(s.gap - node.targetHeight).toBeLessThan(budget)
      }
    }
  })
})

describe('cave heightfield chamber and features', () => {
  it('widens into the chamber without a discrete transition', () => {
    const field = build('basic')
    const widths: number[] = []
    for (let z = -9; z >= -17; z -= 0.5) widths.push(caveWidthAt(field, z))
    expect(widths[0]!).toBeGreaterThan(2)
    expect(widths[widths.length - 1]!).toBeGreaterThan(widths[0]! + 2)
    // Monotone-ish widening, no single jump that reads as "tunnel -> circle".
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]! - widths[i - 1]!).toBeLessThan(2.2)
    }
  })

  it('the main chamber reads as a room: far wider and taller than the passage', () => {
    const topology = buildCaveHeightfieldFixture('basic')
    const field = build('basic')
    const passage = topology.nodes.find((n) => n.id === 'passage')!
    const chamber = topology.nodes.find((n) => n.kind === 'chamber')!
    const passageSpan = caveWidthAt(field, passage.position.z)
    const chamberSpan = caveWidthAt(field, chamber.position.z)
    const passageGap = sampleHeightfieldAt(field, passage.position.x, passage.position.z).gap
    const chamberGap = sampleHeightfieldAt(field, chamber.position.x, chamber.position.z).gap
    expect(chamberSpan).toBeGreaterThan(passageSpan * 2.5)
    expect(chamberSpan).toBeGreaterThan(11)
    expect(chamberGap).toBeGreaterThan(passageGap * 2)
    expect(chamberGap).toBeGreaterThan(5)
  })

  it('the chamber is irregular — overlapping lobes, not a disc', () => {
    const field = build('basic')
    const chamber = buildCaveHeightfieldFixture('basic').nodes.find((n) => n.kind === 'chamber')!
    const radii: number[] = []
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 24) {
      let r = 0
      for (let d = 0.2; d < 10; d += 0.1) {
        const s = sampleHeightfieldAt(
          field,
          chamber.position.x + Math.cos(a) * d,
          chamber.position.z + Math.sin(a) * d,
        )
        if (s.gap <= 0) break
        r = d
      }
      radii.push(r)
    }
    const mean = radii.reduce((s, r) => s + r, 0) / radii.length
    const spread = (Math.max(...radii) - Math.min(...radii)) / mean
    expect(mean).toBeGreaterThan(1.5)
    // A disc would be ~0. Lobes must visibly break the circular silhouette.
    expect(spread).toBeGreaterThan(0.25)
  })

  it('shelf is an elevated floor region beside the lower floor — one floorY per column', () => {
    const topology = buildCaveHeightfieldFixture('basic')
    const shelf = topology.features.find((f) => f.kind === 'shelf')!
    const field = build('basic')
    const chamber = topology.nodes.find((n) => n.kind === 'chamber')!
    const onShelf = sampleHeightfieldAt(field, shelf.position.x, shelf.position.z)
    const besideShelf = sampleHeightfieldAt(field, chamber.position.x, chamber.position.z)
    expect(onShelf.gap).toBeGreaterThan(0)
    expect(besideShelf.gap).toBeGreaterThan(0)
    // Standing on the ledge is higher than the chamber floor next to it...
    expect(onShelf.floorY).toBeGreaterThan(besideShelf.floorY + 0.4)
    // ...and there is still exactly one floor/ceiling pair, never a void under it.
    expect(onShelf.ceilY).toBeGreaterThan(onShelf.floorY)
    expect(onShelf.floorY).toBeLessThan(onShelf.ceilY)
  })

  it('shelf keeps minClearance in the core: the guard lifts the ceiling over it', () => {
    const topology = buildCaveHeightfieldFixture('basic')
    const shelf = topology.features.find((f) => f.kind === 'shelf')!
    const field = build('basic')
    const s = sampleHeightfieldAt(field, shelf.position.x, shelf.position.z)
    expect(s.coreT).toBeLessThanOrEqual(U_CORE)
    expect(s.gap).toBeGreaterThanOrEqual(topology.minClearance - 1e-3)
  })

  it('overhang lowers the ceiling without closing the chamber', () => {
    const topology = buildCaveHeightfieldFixture('bend')
    const overhang = topology.features.find((f) => f.kind === 'overhang')!
    const field = build('bend')
    const under = sampleHeightfieldAt(field, overhang.position.x, overhang.position.z)
    const away = sampleHeightfieldAt(
      field,
      overhang.position.x + 3.4,
      overhang.position.z,
    )
    expect(under.gap).toBeGreaterThanOrEqual(topology.minClearance - 1e-3)
    if (away.gap > 0) expect(under.ceilY).toBeLessThan(away.ceilY)
  })
})

describe('cave heightfield mouth', () => {
  it('the entrance aperture breaks the walk surface, and the deep tunnel does not', () => {
    const field = build('basic')
    let openAtMouth = 0
    let openDeep = 0
    for (let i = 0; i < field.floorY.length; i++) {
      if (heightfieldNodeGap(field, i) <= 0) continue
      if (!heightfieldNodeOpenSky(field, i)) continue
      const iz = Math.floor(i / field.nx)
      const z = field.originZ + iz * field.cellSize
      if (z > -2.5) openAtMouth++
      else openDeep++
    }
    expect(openAtMouth).toBeGreaterThan(4)
    expect(openDeep).toBe(0)
  })

  it('never leaves a node of any fixture breaking the surface away from the mouth', () => {
    for (const id of CAVE_HEIGHTFIELD_FIXTURE_IDS) {
      const topology = buildCaveHeightfieldFixture(id)
      const field = build(id)
      for (const node of topology.nodes) {
        if (node.kind === 'entrance') continue
        const s = sampleHeightfieldAt(field, node.position.x, node.position.z)
        expect(s.ceilY).toBeLessThan(s.surfaceY - SURFACE_CLIP_EPS)
      }
    }
  })

  it('the terrain opening never exposes a column with no cave under it', () => {
    // The previous rule dropped a whole terrain quad if *any* corner was open,
    // cutting past the cave footprint entirely and leaving real holes.
    for (const id of CAVE_HEIGHTFIELD_FIXTURE_IDS) {
      const field = build(id)
      for (let z = 7; z >= -9; z -= 0.1) {
        for (let x = -8; x <= 8; x += 0.1) {
          if (mouthOpeningAt(field, walk, x, z) <= 0) continue
          expect(sampleHeightfieldAt(field, x, z).gap).toBeGreaterThan(0)
        }
      }
    }
  })

  it('cave ceiling and terrain meet at the same height on the opening contour', () => {
    // Both meshes clip to this contour, so agreeing here is what closes the
    // seam. They can only differ by SURFACE_CLIP_EPS plus interpolation.
    const field = build('basic')
    let checked = 0
    for (let z = 5; z >= -6; z -= 0.05) {
      for (let x = -6; x <= 6; x += 0.05) {
        const s = sampleHeightfieldAt(field, x, z)
        const sky = s.ceilY - (walk(x, z) - SURFACE_CLIP_EPS)
        if (sky > s.gap || Math.abs(sky) > 0.01) continue
        checked++
        expect(Math.abs(s.ceilY - walk(x, z))).toBeLessThan(0.15)
      }
    }
    expect(checked).toBeGreaterThan(20)
  })

  it('cave floor meets the walk surface at the mouth', () => {
    const field = build('basic')
    const s = sampleHeightfieldAt(field, CAVE_HEIGHTFIELD_ENTRANCE.x, CAVE_HEIGHTFIELD_ENTRANCE.z)
    expect(Math.abs(s.floorY - walk(CAVE_HEIGHTFIELD_ENTRANCE.x, CAVE_HEIGHTFIELD_ENTRANCE.z)))
      .toBeLessThan(0.5)
  })
})

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

  it('includes a flat 4 m plane 0.5 m under the entrance facing up', () => {
    const field = build('basic')
    const opening = (x: number, z: number): number => mouthOpeningAt(field, walk, x, z)
    const { positions, indices } = buildMouthUndersideMaskBuffers(field, opening, walk)
    const y0 = field.entrance.y - 0.5
    const xs: number[] = []
    const zs: number[] = []
    for (let i = 0; i < positions.length; i += 3) {
      if (Math.abs(positions[i + 1]! - y0) > 1e-4) continue
      xs.push(positions[i]!)
      zs.push(positions[i + 2]!)
    }
    expect(xs.length).toBeGreaterThanOrEqual(4)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(4, 5)
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(4, 5)
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

describe('cave heightfield fixtures', () => {
  it('does not invent a second topology type — fixtures are CaveTopology', () => {
    const topology = buildCaveHeightfieldFixture('basic')
    expect(topology.entrance).toEqual(CAVE_HEIGHTFIELD_ENTRANCE)
    expect(topology.nodes.some((n) => n.kind === 'entrance')).toBe(true)
    expect(topology.segments.length).toBeGreaterThan(0)
    expect(topology.minClearance).toBeGreaterThan(0)
    expect(topology.features.some((f) => f.kind === 'shelf')).toBe(true)
    expect(buildCaveHeightfieldFixture('bend').features.some((f) => f.kind === 'overhang')).toBe(true)
  })
})
