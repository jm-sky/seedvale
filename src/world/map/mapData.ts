import type { LocationKnowledge } from '../locations/locationKnowledge'
import type { WorldLocationCatalog } from '../locations/worldLocationCatalog'
import type { MapDiscovery } from './mapDiscovery'
import type { MapProjection } from './mapProjection'
import type {
  MapCellData,
  MapKnownLocation,
  MapLocationKind,
  MapViewport,
} from './mapTypes'
import { MAP_EXTENT_HALF } from './mapConfig'

export type MapData = {
  queryCells(viewport: MapViewport): MapCellData[]
  /** Every location the player currently *knows about* (plan world-012 §3)
   *  that falls within `viewport` — resolved from `LocationKnowledge` via
   *  `WorldLocationCatalog`, never from cell Fog of War. A settlement (or
   *  any other location) sitting on an explored map cell is *not* known
   *  just because of that (plan §11 — "Nie zostawiać obecnego automatycznego
   *  settlement reveal"). */
  knownLocations(viewport: MapViewport): MapKnownLocation[]
  /** Resolves one known location by id (no viewport filter) — used for a
   *  navigation target's minimap projection and the full map's popover,
   *  neither of which wants to re-filter the whole `knownLocations()` list.
   *  `null` if `id` isn't in `LocationKnowledge` or the catalog can no
   *  longer resolve it. */
  resolveKnown(id: string): MapKnownLocation | null
  isDiscovered(key: string): boolean
  discovery: MapDiscovery
  projection: MapProjection
  catalog: WorldLocationCatalog
  knowledge: LocationKnowledge
}

/** `WorldLocationKind` (`settlement`/`cave`/`cemetery`/`lake`/`mountainPeak`)
 *  → the coarser `MapLocationKind` the existing map/minimap renderer already
 *  understands. Every non-settlement kind reads as a generic "landmark" pin
 *  on the map today — only the popover (plan §12) needs the finer kind, and
 *  it resolves that itself via `WorldLocationCatalog.getById`. */
function toMapLocationKind(kind: string): MapLocationKind {
  return kind === 'settlement' ? 'settlement' : 'landmark'
}

export function createMapData(opts: {
  projection: MapProjection
  discovery: MapDiscovery
  catalog: WorldLocationCatalog
  knowledge: LocationKnowledge
}): MapData {
  const { projection, discovery, catalog, knowledge } = opts

  function project(entryId: string): MapKnownLocation | null {
    const entry = knowledge.get(entryId)
    if (!entry) return null
    const location = catalog.getById(entryId)
    if (!location) return null
    return {
      id: location.id,
      kind: toMapLocationKind(location.kind),
      x: location.x,
      z: location.z,
      state: entry.state,
      source: entry.source,
      label: location.name,
    }
  }

  return {
    discovery,
    projection,
    catalog,
    knowledge,
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
    resolveKnown(id) {
      return project(id)
    },
    knownLocations(viewport) {
      const minX = Math.max(viewport.minX, -MAP_EXTENT_HALF)
      const maxX = Math.min(viewport.maxX, MAP_EXTENT_HALF)
      const minZ = Math.max(viewport.minZ, -MAP_EXTENT_HALF)
      const maxZ = Math.min(viewport.maxZ, MAP_EXTENT_HALF)
      if (minX >= maxX || minZ >= maxZ) return []
      const locations: MapKnownLocation[] = []
      for (const entry of knowledge.list()) {
        const location = project(entry.id)
        if (!location) continue
        if (location.x < minX || location.x > maxX || location.z < minZ || location.z > maxZ) continue
        locations.push(location)
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
