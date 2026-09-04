import type { WorldConfig } from '../../config/worldConfig'
import type { MapBiomeKind, MapCellData, MapCellKey, MapTerrainKind, MapViewport } from './mapTypes'
import { biomeWeightsAt, forestDensityAt } from '../../terrain/biomeRegions'
import {
  type RawSampleParams,
  sampleContinentalnessAt,
  sampleFloorAt,
  sampleHeightAt,
  sampleMoistureRegionAt,
  sampleMountainRidgeAt,
} from '../../terrain/chunkHeightmap'
import { isMountainRidge, isOceanMix, isWetFloor } from '../../terrain/terrainClassification'
import { MAP_CELL_SIZE, MAP_EXTENT_HALF } from './mapConfig'

/** Altitude fraction (of heightScale above water) where lowland becomes highland. */
const HIGHLAND_ALTITUDE = 0.45
/** Shore band above waterLevel, matching the sand-band scale (~0.6–3). */
const SHORE_BAND = 2.4
const BIOME_DOMINANT = 0.35
const FOREST_CANOPY = 0.4

export function mapCellKey(cx: number, cz: number): MapCellKey {
  return `${cx},${cz}`
}

export function worldToMapCell(worldX: number, worldZ: number): { cx: number, cz: number } {
  return {
    cx: Math.floor(worldX / MAP_CELL_SIZE),
    cz: Math.floor(worldZ / MAP_CELL_SIZE),
  }
}

export function mapCellCenter(cx: number, cz: number): { x: number, z: number } {
  return {
    x: (cx + 0.5) * MAP_CELL_SIZE,
    z: (cz + 0.5) * MAP_CELL_SIZE,
  }
}

export function mapCellBounds(cx: number, cz: number): {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
} {
  return {
    minX: cx * MAP_CELL_SIZE,
    maxX: (cx + 1) * MAP_CELL_SIZE,
    minZ: cz * MAP_CELL_SIZE,
    maxZ: (cz + 1) * MAP_CELL_SIZE,
  }
}

export function parseMapCellKey(key: MapCellKey): { cx: number, cz: number } | null {
  const comma = key.indexOf(',')
  if (comma <= 0) return null
  const cx = Number(key.slice(0, comma))
  const cz = Number(key.slice(comma + 1))
  if (!Number.isInteger(cx) || !Number.isInteger(cz)) return null
  return { cx, cz }
}

export function rawSampleParamsFromWorld(config: WorldConfig): RawSampleParams {
  return {
    seed: config.seed,
    heightScale: config.terrain.heightScale,
    waterLevel: config.terrain.waterLevel,
    noiseScale: config.terrain.noiseScale,
    detailAmplitude: config.terrain.detailAmplitude,
    hillsScale: config.terrain.hillsScale,
    hillsAmplitude: config.terrain.hillsAmplitude,
    hillsFbm: config.terrain.hillsFbm,
    fbm: config.terrain.fbm,
    biome: config.terrain.biome,
    region: config.terrain.region,
  }
}

export function projectCellAt(
  worldX: number, worldZ: number, params: RawSampleParams,
): Pick<MapCellData, 'terrain' | 'biome' | 'water'> {
  const floorH = sampleFloorAt(worldX, worldZ, params)
  const height = sampleHeightAt(worldX, worldZ, params)
  const continentalness = sampleContinentalnessAt(worldX, worldZ, params)
  const { waterLevel, heightScale, region } = params
  const wet = isWetFloor(floorH, waterLevel)
  if (wet) {
    const terrain: MapTerrainKind = isOceanMix(continentalness, region.oceanThreshold, region.coastThreshold) ? 'ocean' : 'inland_water'
    return { terrain, biome: 'none', water: true }
  }

  const altitude01 = Math.max(0, (height - waterLevel) / Math.max(heightScale, 0.001))
  const ridge = sampleMountainRidgeAt(worldX, worldZ, params)
  const moistureRegion = sampleMoistureRegionAt(worldX, worldZ, params)
  const weights = biomeWeightsAt(moistureRegion, altitude01, region)
  const forest = forestDensityAt(moistureRegion, altitude01, continentalness, ridge, region)

  let terrain: MapTerrainKind
  if (isMountainRidge(ridge)) terrain = 'mountain'
  else if (height - waterLevel < SHORE_BAND) terrain = 'shore'
  else if (altitude01 >= HIGHLAND_ALTITUDE) terrain = 'highland'
  else terrain = 'lowland'

  let biome: MapBiomeKind
  if (weights.desert >= weights.swamp && weights.desert >= weights.forest && weights.desert > BIOME_DOMINANT) {
    biome = 'desert'
  } else if (weights.swamp >= weights.desert && weights.swamp >= weights.forest && weights.swamp > BIOME_DOMINANT) {
    biome = 'swamp'
  } else if (forest > FOREST_CANOPY) {
    biome = 'forest'
  } else {
    biome = 'meadow'
  }

  return { terrain, biome, water: false }
}

export type MapProjection = {
  project(cx: number, cz: number): MapCellData
  cellsInViewport(viewport: MapViewport): MapCellData[]
  setParams(params: RawSampleParams): void
  invalidateCache(): void
}

export function createMapProjection(initial: RawSampleParams): MapProjection {
  let params = initial
  const cache = new Map<MapCellKey, MapCellData>()

  function project(cx: number, cz: number): MapCellData {
    const key = mapCellKey(cx, cz)
    const hit = cache.get(key)
    if (hit) return hit
    const { x, z } = mapCellCenter(cx, cz)
    const classified = projectCellAt(x, z, params)
    const cell: MapCellData = { key, cx, cz, ...classified }
    cache.set(key, cell)
    return cell
  }

  return {
    project,
    cellsInViewport(viewport) {
      const step = Math.max(1, viewport.lodStep ?? 1)
      const minX = Math.max(viewport.minX, -MAP_EXTENT_HALF)
      const maxX = Math.min(viewport.maxX, MAP_EXTENT_HALF)
      const minZ = Math.max(viewport.minZ, -MAP_EXTENT_HALF)
      const maxZ = Math.min(viewport.maxZ, MAP_EXTENT_HALF)
      if (minX >= maxX || minZ >= maxZ) return []
      const minCell = worldToMapCell(minX, minZ)
      const maxCell = worldToMapCell(maxX - 1e-6, maxZ - 1e-6)
      const out: MapCellData[] = []
      for (let cz = minCell.cz; cz <= maxCell.cz; cz += step) {
        for (let cx = minCell.cx; cx <= maxCell.cx; cx += step) {
          out.push(project(cx, cz))
        }
      }
      return out
    },
    setParams(next) {
      params = next
      cache.clear()
    },
    invalidateCache() {
      cache.clear()
    },
  }
}
