import type { MapKnownLocation, MapViewport } from '../../world/map/mapTypes'

export function minimapHalfRange(size: number, scale: number): number {
  return size / 2 / scale
}

export function minimapQueryRange(halfRange: number): number {
  return halfRange * Math.SQRT2
}

export function minimapQueryViewport(
  playerX: number,
  playerZ: number,
  size: number,
  scale: number,
): MapViewport {
  const halfRange = minimapHalfRange(size, scale)
  const queryRange = minimapQueryRange(halfRange)
  return {
    minX: playerX - queryRange,
    maxX: playerX + queryRange,
    minZ: playerZ - queryRange,
    maxZ: playerZ + queryRange,
  }
}

export function isMinimapCanvasPoint(x: number, y: number, size: number): boolean {
  return x >= 0 && x <= size && y >= 0 && y <= size
}

/** Known locations visible on the minimap canvas that are not active navigation
 *  targets (plan world-012 minimap POI follow-up). */
export function selectNearbyMinimapPois(
  known: readonly MapKnownLocation[],
  activeTargetIds: ReadonlySet<string>,
  isVisibleOnCanvas: (location: MapKnownLocation) => boolean,
): MapKnownLocation[] {
  const out: MapKnownLocation[] = []
  for (const location of known) {
    if (activeTargetIds.has(location.id)) continue
    if (!isVisibleOnCanvas(location)) continue
    out.push(location)
  }
  return out
}

export type NavigationTargetMinimapPlacement =
  | { type: 'marker', id: string, slot: number }
  | { type: 'edge_arrow', id: string, slot: number }

/** Classifies one navigation target relative to the minimap's world-space radius
 *  (`halfRange`) — mirrors `drawMinimapFrame()` target handling. */
export function classifyNavigationTargetMinimap(
  locationX: number,
  locationZ: number,
  playerX: number,
  playerZ: number,
  halfRange: number,
  id: string,
  slot: number,
): NavigationTargetMinimapPlacement | null {
  const dx = locationX - playerX
  const dz = locationZ - playerZ
  const dist = Math.hypot(dx, dz)
  if (dist <= halfRange) return { type: 'marker', id, slot }
  if (dist > 1e-4) return { type: 'edge_arrow', id, slot }
  return null
}
