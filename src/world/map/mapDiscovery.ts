import type { MapCellKey } from './mapTypes'
import { MAP_CELL_SIZE, MAP_DISCOVERY_RADIUS } from './mapConfig'
import { mapCellCenter, mapCellKey, worldToMapCell } from './mapProjection'

export type MapDiscovery = {
  isDiscovered(key: MapCellKey): boolean
  /** Reveal cells around `(worldX, worldZ)`. No-op when the player is still
   *  in the same map cell as the last update. Returns newly discovered keys. */
  update(worldX: number, worldZ: number): readonly MapCellKey[]
  serialize(): string[]
  restore(cells: readonly string[]): void
  clear(): void
  size(): number
}

function cellRadius(): number {
  return Math.ceil(MAP_DISCOVERY_RADIUS / MAP_CELL_SIZE)
}

export function cellsInDiscoveryRadius(worldX: number, worldZ: number): MapCellKey[] {
  const origin = worldToMapCell(worldX, worldZ)
  const r = cellRadius()
  const keys: MapCellKey[] = []
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const cx = origin.cx + dx
      const cz = origin.cz + dz
      const { x, z } = mapCellCenter(cx, cz)
      if (Math.hypot(x - worldX, z - worldZ) <= MAP_DISCOVERY_RADIUS) {
        keys.push(mapCellKey(cx, cz))
      }
    }
  }
  return keys
}

export function createMapDiscovery(initial?: readonly string[]): MapDiscovery {
  const discovered = new Set<MapCellKey>(initial)
  let lastCx = Number.NaN
  let lastCz = Number.NaN

  return {
    isDiscovered(key) {
      return discovered.has(key)
    },
    update(worldX, worldZ) {
      const { cx, cz } = worldToMapCell(worldX, worldZ)
      if (cx === lastCx && cz === lastCz) return []
      lastCx = cx
      lastCz = cz
      const added: MapCellKey[] = []
      for (const key of cellsInDiscoveryRadius(worldX, worldZ)) {
        if (discovered.has(key)) continue
        discovered.add(key)
        added.push(key)
      }
      return added
    },
    serialize() {
      return [...discovered]
    },
    restore(cells) {
      discovered.clear()
      for (const key of cells) discovered.add(key)
      lastCx = Number.NaN
      lastCz = Number.NaN
    },
    clear() {
      discovered.clear()
      lastCx = Number.NaN
      lastCz = Number.NaN
    },
    size() {
      return discovered.size
    },
  }
}
