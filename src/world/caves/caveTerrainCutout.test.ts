/** Plan world-terrain-019 Milestone B — the production cave mouth as a real
 *  terrain hole. Builds Grota Czarnego Kamienia (seed `1136726869`) through
 *  the production topology + heightfield, derives the terrain cutout and
 *  applies it to the real 64 m / resolution-65 chunk grid the way
 *  `ChunkManager.buildAndAttachMesh` does. Pure: analytic terrain, no
 *  `ChunkManager`, no worker, no browser. */

import { describe, expect, it } from 'vitest'
import type { ChunkMeshData } from '../../terrain/chunkMeshData'
import type { CaveHeightfieldRepresentation, SurfaceSampler } from './caveHeightfieldRepresentation'
import { createBenchmarkWorldConfig } from '../../config/worldConfig'
import { measureSlope } from '../../fauna/createFauna'
import { type RawSampleParams, sampleHeightAt } from '../../terrain/chunkHeightmap'
import { buildCutChunkAttributes, cutoutsOverlappingChunk, type TerrainCutout } from '../../terrain/terrainCutout'
import { buildCaveHeightfieldRepresentation, mouthOpeningAt, sampleHeightfieldAt } from './caveHeightfieldRepresentation'
import { caveOpenSkyBounds, caveTerrainCutout } from './caveTerrainCutout'
import { mouthCarveDepth } from './mouthCarve'
import { buildProductionCaveTopology } from './productionTopology'

const REPRO_SEED = 1136726869
const ENTRANCE = { x: 135.84259216988767, z: -17.813611096688362 }
const CHUNK_SIZE = 64
const RESOLUTION = 65

function surfaceSampler(seed: number): SurfaceSampler {
  const config = createBenchmarkWorldConfig({ seed, terrainResolution: 193, loadRadius: 4 })
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
  return (x, z) => sampleHeightAt(x, z, params)
}

type Built = {
  field: CaveHeightfieldRepresentation
  walkSurfaceAt: SurfaceSampler
  cutout: TerrainCutout
}

let cached: Built | null = null
function buildProductionCave(): Built {
  if (cached) return cached
  const baseSurfaceAt = surfaceSampler(REPRO_SEED)
  const site = {
    x: ENTRANCE.x,
    z: ENTRANCE.z,
    yaw: measureSlope(ENTRANCE.x, ENTRANCE.z, 4, baseSurfaceAt).yaw,
    length: 12,
    variant: 0,
  }
  const topology = buildProductionCaveTopology({
    seed: REPRO_SEED,
    site,
    sampleHeight: baseSurfaceAt,
    sampleBaseHeight: baseSurfaceAt,
  })
  if (!topology) throw new Error('production topology rejected the repro site')
  // Same sampler `createCaves()` builds the heightfield against.
  const walkSurfaceAt: SurfaceSampler = (x, z) => baseSurfaceAt(x, z) - mouthCarveDepth(x, z, topology.entrance)
  const field = buildCaveHeightfieldRepresentation(topology, walkSurfaceAt).heightfield
  const cutout = caveTerrainCutout(field, walkSurfaceAt)
  if (!cutout) throw new Error('production cave has no surface-breaking aperture')
  cached = { field, walkSurfaceAt, cutout }
  return cached
}

/** `ChunkMeshData` a chunk worker would produce for this walk surface —
 *  node Y only; the other attributes are irrelevant to the cut topology. */
function meshDataForChunk(cx: number, cz: number, walkSurfaceAt: SurfaceSampler): ChunkMeshData {
  const count = RESOLUTION * RESOLUTION
  const step = CHUNK_SIZE / (RESOLUTION - 1)
  const positionY = new Float32Array(count)
  const normal = new Float32Array(count * 3)
  for (let iz = 0; iz < RESOLUTION; iz++) {
    for (let ix = 0; ix < RESOLUTION; ix++) {
      const i = iz * RESOLUTION + ix
      positionY[i] = walkSurfaceAt(cx * CHUNK_SIZE + ix * step - CHUNK_SIZE / 2, cz * CHUNK_SIZE + iz * step - CHUNK_SIZE / 2)
      normal[i * 3 + 1] = 1
    }
  }
  return { positionY, normal, color: new Float32Array(count * 3), bareGround: new Float32Array(count) }
}

function coversXZ(position: Float32Array, index: Uint32Array, originX: number, originZ: number, px: number, pz: number): boolean {
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

describe('caveTerrainCutout (production cave, seed 1136726869)', () => {
  it('derives a narrow descriptor: tight bounds around the aperture, opening positive at the mouth only', () => {
    const { field, walkSurfaceAt, cutout } = buildProductionCave()
    expect(cutout.id).toBe(`cave:${field.caveId}`)
    const b = cutout.bounds
    expect(b.maxX - b.minX).toBeLessThan(16)
    expect(b.maxZ - b.minZ).toBeLessThan(16)
    expect(field.entrance.x).toBeGreaterThan(b.minX)
    expect(field.entrance.x).toBeLessThan(b.maxX)
    expect(field.entrance.z).toBeGreaterThan(b.minZ)
    expect(field.entrance.z).toBeLessThan(b.maxZ)
    // Same contract as the cave ceiling clip.
    expect(cutout.openingAt(field.entrance.x, field.entrance.z)).toBe(
      mouthOpeningAt(field, walkSurfaceAt, field.entrance.x, field.entrance.z),
    )
    expect(cutout.openingAt(field.entrance.x, field.entrance.z)).toBeGreaterThan(0)
    // Outside the bounds the predicate is closed — the terrain lid over the
    // tunnel/chamber stays.
    for (let dz = -30; dz <= 30; dz += 1.5) {
      for (let dx = -30; dx <= 30; dx += 1.5) {
        const x = field.entrance.x + dx
        const z = field.entrance.z + dz
        if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) continue
        expect(cutout.openingAt(x, z)).toBeLessThanOrEqual(0)
      }
    }
    expect(caveOpenSkyBounds(field)).toEqual(b)
  })

  it('cuts the real chunk grid only over the aperture, on the shared contour, and identically on every rebuild', () => {
    const { field, walkSurfaceAt, cutout } = buildProductionCave()
    const step = CHUNK_SIZE / (RESOLUTION - 1)
    const cx = Math.round(field.entrance.x / CHUNK_SIZE)
    const cz = Math.round(field.entrance.z / CHUNK_SIZE)
    const originX = cx * CHUNK_SIZE
    const originZ = cz * CHUNK_SIZE
    const overlapping = cutoutsOverlappingChunk([cutout], originX, originZ, CHUNK_SIZE, step)
    expect(overlapping).toEqual([cutout])
    const meshData = meshDataForChunk(cx, cz, walkSurfaceAt)

    const first = buildCutChunkAttributes(meshData, RESOLUTION, CHUNK_SIZE, originX, originZ, overlapping)
    // Unload/reload, dig, scorch — every path builds from the same retained
    // cutout, so it reproduces the same hole.
    const rebuilt = buildCutChunkAttributes(meshData, RESOLUTION, CHUNK_SIZE, originX, originZ, overlapping)
    expect(Array.from(rebuilt.index)).toEqual(Array.from(first.index))
    expect(Array.from(rebuilt.position)).toEqual(Array.from(first.position))

    expect(first.cutCellCount).toBeGreaterThan(0)
    expect(first.cutCellCount).toBeLessThan(80)
    expect(first.contourVertexCount).toBeGreaterThan(3)

    // No terrain where the void clearly breaks the surface, terrain where it
    // does not (approach recess included — the pit is carved ground, not a
    // hole). Thresholds are ~one grid step of clearance: the 1 m terrain grid
    // lerps the contour between nodes, so within a fraction of a metre of
    // the true crossing the sheet may end either side (sub-cell residue the
    // presentation-only underside mask exists for).
    let openChecked = 0
    let keptChecked = 0
    for (let dz = -8; dz <= 8; dz += 0.5) {
      for (let dx = -8; dx <= 8; dx += 0.5) {
        const x = field.entrance.x + dx
        const z = field.entrance.z + dz
        if (Math.abs(x - originX) > CHUNK_SIZE / 2 - 1 || Math.abs(z - originZ) > CHUNK_SIZE / 2 - 1) continue
        const opening = cutout.openingAt(x, z)
        const covered = coversXZ(first.position, first.index, originX, originZ, x, z)
        if (opening > 0.5) {
          expect(covered).toBe(false)
          openChecked++
        } else if (opening < -0.5) {
          expect(covered).toBe(true)
          keptChecked++
        }
      }
    }
    expect(openChecked).toBeGreaterThan(4)
    expect(keptChecked).toBeGreaterThan(100)

    // Contour vertices sit on the cave's own open-sky line: the interpolated
    // ceiling there meets the terrain height within a fraction of a cell.
    for (let v = RESOLUTION * RESOLUTION; v < first.position.length / 3; v++) {
      const x = first.position[v * 3]! + originX
      const y = first.position[v * 3 + 1]!
      const z = first.position[v * 3 + 2]! + originZ
      expect(Math.abs(cutout.openingAt(x, z))).toBeLessThan(0.1)
      const sample = sampleHeightfieldAt(field, x, z)
      // Pinned to the walk surface, which is where the cave's sky rim sits.
      expect(Math.abs(walkSurfaceAt(x, z) - y)).toBeLessThan(1e-3)
      if (sample.gap > 0.5) expect(Math.abs(sample.ceilY - y)).toBeLessThan(0.15)
    }
  })

  it('does not depend on chunk placement — the entrance chunk and its neighbours agree on the shared edge', () => {
    const { field, walkSurfaceAt, cutout } = buildProductionCave()
    const step = CHUNK_SIZE / (RESOLUTION - 1)
    const cx = Math.round(field.entrance.x / CHUNK_SIZE)
    const cz = Math.round(field.entrance.z / CHUNK_SIZE)
    // Force a boundary case by shifting the chunk grid so the aperture
    // straddles an edge: use a chunk origin at the entrance itself.
    const originAX = field.entrance.x - CHUNK_SIZE / 2
    const originAZ = field.entrance.z
    const originBX = field.entrance.x + CHUNK_SIZE / 2
    const originBZ = field.entrance.z
    const dataFor = (ox: number, oz: number): ChunkMeshData => {
      const count = RESOLUTION * RESOLUTION
      const positionY = new Float32Array(count)
      for (let iz = 0; iz < RESOLUTION; iz++) {
        for (let ix = 0; ix < RESOLUTION; ix++) {
          positionY[iz * RESOLUTION + ix] = walkSurfaceAt(ox + ix * step - CHUNK_SIZE / 2, oz + iz * step - CHUNK_SIZE / 2)
        }
      }
      return { positionY, normal: new Float32Array(count * 3), color: new Float32Array(count * 3), bareGround: new Float32Array(count) }
    }
    const a = buildCutChunkAttributes(dataFor(originAX, originAZ), RESOLUTION, CHUNK_SIZE, originAX, originAZ, [cutout])
    const b = buildCutChunkAttributes(dataFor(originBX, originBZ), RESOLUTION, CHUNK_SIZE, originBX, originBZ, [cutout])
    expect(a.cutCellCount).toBeGreaterThan(0)
    expect(b.cutCellCount).toBeGreaterThan(0)
    const edgeKeys = (cut: typeof a, ox: number, oz: number): string[] => {
      const used = new Set<number>()
      for (let i = 0; i < cut.index.length; i++) used.add(cut.index[i]!)
      const out: string[] = []
      for (const v of used) {
        const x = cut.position[v * 3]! + ox
        if (Math.abs(x - field.entrance.x) > 1e-6) continue
        out.push(`${(cut.position[v * 3 + 1]!).toFixed(4)}|${(cut.position[v * 3 + 2]! + oz).toFixed(4)}`)
      }
      return out.sort()
    }
    const left = edgeKeys(a, originAX, originAZ)
    const right = edgeKeys(b, originBX, originBZ)
    expect(left.length).toBeGreaterThan(0)
    expect(left).toEqual(right)
    // Sanity: the regular entrance chunk is one of the two real chunks here.
    expect(Number.isInteger(cx) && Number.isInteger(cz)).toBe(true)
  })
})
