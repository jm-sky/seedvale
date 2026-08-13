import type { MapDiscovery } from './mapDiscovery'
import type {
  MapCellData,
  MapKnownLocation,
  MapSettlementLookup,
  MapViewport,
} from './mapTypes'
import { SETTLEMENT_GRID_STEP, worldToCell } from '../../settlement/settlementGenerator'
import { MAP_EXTENT_HALF } from './mapConfig'
import { mapCellKey, type MapProjection, worldToMapCell } from './mapProjection'

export type MapData = {
  queryCells(viewport: MapViewport): MapCellData[]
  knownLocations(viewport: MapViewport): MapKnownLocation[]
  isDiscovered(key: string): boolean
  discovery: MapDiscovery
  projection: MapProjection
}

export function createMapData(opts: {
  projection: MapProjection
  discovery: MapDiscovery
  lookupSettlement: MapSettlementLookup
}): MapData {
  const { projection, discovery, lookupSettlement } = opts

  return {
    discovery,
    projection,
    isDiscovered(key) {
      return discovery.isDiscovered(key)
    },
    queryCells(viewport) {
      const cells = projection.cellsInViewport(viewport)
      const out: MapCellData[] = []
      for (const cell of cells) {
        if (discovery.isDiscovered(cell.key)) out.push(cell)
      }
      return out
    },
    knownLocations(viewport) {
      const minX = Math.max(viewport.minX, -MAP_EXTENT_HALF)
      const maxX = Math.min(viewport.maxX, MAP_EXTENT_HALF)
      const minZ = Math.max(viewport.minZ, -MAP_EXTENT_HALF)
      const maxZ = Math.min(viewport.maxZ, MAP_EXTENT_HALF)
      if (minX >= maxX || minZ >= maxZ) return []
      const minCell = worldToCell(minX, minZ)
      const maxCell = worldToCell(maxX, maxZ)
      const pad = 1
      const locations: MapKnownLocation[] = []
      for (let gz = Math.min(minCell.gz, maxCell.gz) - pad; gz <= Math.max(minCell.gz, maxCell.gz) + pad; gz++) {
        for (let gx = Math.min(minCell.gx, maxCell.gx) - pad; gx <= Math.max(minCell.gx, maxCell.gx) + pad; gx++) {
          const def = lookupSettlement(gx, gz)
          if (!def) continue
          const cell = worldToMapCell(def.x, def.z)
          if (!discovery.isDiscovered(mapCellKey(cell.cx, cell.cz))) continue
          if (
            def.x < minX - SETTLEMENT_GRID_STEP ||
            def.x > maxX + SETTLEMENT_GRID_STEP ||
            def.z < minZ - SETTLEMENT_GRID_STEP ||
            def.z > maxZ + SETTLEMENT_GRID_STEP
          ) continue
          locations.push({
            id: def.id,
            kind: 'settlement',
            x: def.x,
            z: def.z,
            state: 'confirmed',
            source: 'exploration',
            label: def.name,
          })
        }
      }
      return locations
    },
  }
}

let activeMapData: MapData | null = null

/** Imperative handle so canvas drawers can query without Vue reactivity. */
export function setActiveMapData(data: MapData | null): void {
  activeMapData = data
}

export function getActiveMapData(): MapData | null {
  return activeMapData
}
