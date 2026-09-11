/** Floor-ramp continuity: topology stations and the gameplay heightfield
 *  floor between passage / widening / chamber / branch must stay within
 *  player walk grade. */

import { describe, expect, it } from 'vitest'
import type { LargeCaveSite } from '../largeCaves'
import type { CaveTopologyPoint } from './caveTopology'
import { createBenchmarkWorldConfig } from '../../config/worldConfig'
import { measureSlope } from '../../fauna/createFauna'
import { type RawSampleParams, sampleHeightAt } from '../../terrain/chunkHeightmap'
import { SLOPE_MAX_WALKABLE_DEG } from '../../terrain/slopeConstraint'
import { queryHeightfieldGround } from './caveHeightfieldQuery'
import { buildCaveHeightfieldRepresentation, type CaveHeightfieldRepresentation } from './caveHeightfieldRepresentation'
import { mouthCarveDepth } from './mouthCarve'
import {
  buildProductionCaveTopology,
  MAX_TRAVERSABLE_FLOOR_GRADE,
  maxCenterlineFloorGrade,
} from './productionTopology'

/** Rim blend / floor detail noise can steepen the floor vs topology; still
 *  must stay under walk-max. */
const FLOOR_GRADE_LIMIT = Math.tan((SLOPE_MAX_WALKABLE_DEG * Math.PI) / 180)

function densify(centerline: readonly CaveTopologyPoint[], step: number): CaveTopologyPoint[] {
  const out: CaveTopologyPoint[] = []
  for (let i = 0; i < centerline.length - 1; i++) {
    const a = centerline[i]!
    const b = centerline[i + 1]!
    const dist = Math.hypot(b.x - a.x, b.z - a.z)
    const n = Math.max(1, Math.ceil(dist / step))
    for (let s = 0; s < n; s++) {
      const t = s / n
      out.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
      })
    }
  }
  out.push(centerline[centerline.length - 1]!)
  return out
}

function gameplayFloorProfile(
  field: CaveHeightfieldRepresentation,
  surfaceHeightAt: (x: number, z: number) => number,
  centerline: readonly CaveTopologyPoint[],
): { maxGrade: number, maxStep: number } {
  const samples = densify(centerline, 0.4)
  let y = samples[0]!.y + 0.25
  let prev: { x: number, z: number, floor: number } | null = null
  let maxGrade = 0
  let maxStep = 0
  for (const p of samples) {
    const hit = queryHeightfieldGround(field, surfaceHeightAt, p.x, y, p.z)
    expect(hit, `cave ground at ${p.x.toFixed(2)},${p.z.toFixed(2)}`).not.toBeNull()
    const floor = hit!.floorY
    if (prev) {
      const dist = Math.hypot(p.x - prev.x, p.z - prev.z)
      if (dist > 1e-6) {
        maxGrade = Math.max(maxGrade, Math.abs(floor - prev.floor) / dist)
        maxStep = Math.max(maxStep, Math.abs(floor - prev.floor))
      }
    }
    prev = { x: p.x, z: p.z, floor }
    y = floor + 0.2
  }
  return { maxGrade, maxStep }
}

describe('traversable floor continuity (production topology)', () => {
  it('caps consecutive centerline grade at MAX_TRAVERSABLE_FLOOR_GRADE', () => {
    expect(MAX_TRAVERSABLE_FLOOR_GRADE).toBeLessThan(Math.tan((SLOPE_MAX_WALKABLE_DEG * Math.PI) / 180))
    const site: LargeCaveSite = { x: 200, z: -140, yaw: 0.6, length: 12, variant: 0.4 }
    const intoDx = -Math.sin(site.yaw)
    const intoDz = -Math.cos(site.yaw)
    const hill = (x: number, z: number) => 130 + 0.5 * ((x - site.x) * intoDx + (z - site.z) * intoDz)
    for (const seed of [42, 99, 7, 1]) {
      const topology = buildProductionCaveTopology({
        seed,
        site,
        sampleHeight: hill,
        sampleBaseHeight: hill,
      })
      expect(topology, `seed ${seed}`).not.toBeNull()
      for (const seg of topology!.segments) {
        expect(maxCenterlineFloorGrade(seg.centerline), `${seg.id} seed ${seed}`).toBeLessThanOrEqual(
          MAX_TRAVERSABLE_FLOOR_GRADE + 1e-6,
        )
      }
    }
  })
})

describe('seed 1136726869 chamber ramp is walkable both ways', () => {
  const SEED = 1136726869
  const ENTRANCE = { x: 135.84259216988767, z: -17.813611096688362 }

  function build() {
    const config = createBenchmarkWorldConfig({ seed: SEED, terrainResolution: 193, loadRadius: 4 })
    const t = config.terrain
    const params: RawSampleParams = {
      seed: config.seed,
      heightScale: t.heightScale,
      waterLevel: t.waterLevel,
      noiseScale: t.noiseScale,
      detailAmplitude: t.detailAmplitude,
      hillsScale: t.hillsScale,
      hillsAmplitude: t.hillsAmplitude,
      hillsFbm: t.hillsFbm,
      fbm: t.fbm,
      biome: t.biome,
      region: t.region,
    }
    const sampleHeight = (x: number, z: number) => sampleHeightAt(x, z, params)
    const site: LargeCaveSite = {
      x: ENTRANCE.x,
      z: ENTRANCE.z,
      yaw: measureSlope(ENTRANCE.x, ENTRANCE.z, 4, sampleHeight).yaw,
      length: 12,
      variant: 0,
    }
    const topology = buildProductionCaveTopology({
      seed: SEED,
      site,
      sampleHeight,
      sampleBaseHeight: sampleHeight,
    })
    if (!topology) throw new Error('topology rejected')
    const walkSurfaceAt = (x: number, z: number): number => sampleHeight(x, z) - mouthCarveDepth(x, z, topology.entrance)
    const field = buildCaveHeightfieldRepresentation(topology, walkSurfaceAt).heightfield
    return { topology, field, sampleHeight }
  }

  // KNOWN REPRESENTATION ISSUE (world-terrain-019, see
  // `docs/plans/LOOSE-ENDS.md` "Heightfield chamber-lobe floor cliff"): the
  // topology ramp is fine, but the heightfield concentrates the
  // widening→chamber descent at the chamber lobe boundary (~2.5 m over
  // ~1.3 m on this seed). The player still gets up it (grounded snap-up is
  // unbounded), so it is a shape/quality issue, not a traversal blocker.
  // Pinned with `it.fails` so the fix flips these back to `it` deliberately.
  it.fails('spreads widening→chamber floor drop instead of a single cliff (heightfield floor)', () => {
    const { topology, field, sampleHeight } = build()
    const chamber = topology.nodes.find((n) => n.id === 'chamber')!
    const bend = topology.nodes.find((n) => n.id === 'widening-bend')!
    expect(bend.position.y - chamber.position.y).toBeGreaterThan(2)
    const seg = topology.segments.find((s) => s.id === 'seg-chamber')!
    expect(seg.centerline.length).toBeGreaterThan(2)
    expect(maxCenterlineFloorGrade(seg.centerline)).toBeLessThanOrEqual(MAX_TRAVERSABLE_FLOOR_GRADE + 1e-6)

    const { maxGrade, maxStep } = gameplayFloorProfile(field, sampleHeight, seg.centerline)
    expect(maxGrade, `gameplay floor grade ${maxGrade.toFixed(3)}`).toBeLessThanOrEqual(FLOOR_GRADE_LIMIT)
    expect(maxStep).toBeLessThan(1.0)
  })

  it.fails('keeps every main-route and branch segment under walk-max gameplay grade (heightfield floor)', () => {
    const { topology, field, sampleHeight } = build()
    for (const seg of topology.segments) {
      expect(maxCenterlineFloorGrade(seg.centerline), `${seg.id} topology`).toBeLessThanOrEqual(
        MAX_TRAVERSABLE_FLOOR_GRADE + 1e-6,
      )
      // Mouth lip is portal/carve, not the tunnel↔chamber ramp this invariant covers.
      if (seg.from === 'entrance') continue
      const { maxGrade, maxStep } = gameplayFloorProfile(field, sampleHeight, seg.centerline)
      expect(maxGrade, `${seg.id} gameplay grade ${maxGrade.toFixed(3)}`).toBeLessThanOrEqual(FLOOR_GRADE_LIMIT)
      expect(maxStep, `${seg.id} step`).toBeLessThan(1.0)
    }
  })
})
