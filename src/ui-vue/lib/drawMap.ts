import type { MapKnownLocation, MapViewport } from '../../world/map/mapTypes'
import { getActiveNavigationTargets } from '../../world/locations/navigationTargets'
import {
  MAP_CELL_SIZE,
  MAP_EXTENT_HALF,
  MAP_WORLD_MAX_CELLS_PER_AXIS,
  MAP_WORLD_ZOOM_MAX,
  MAP_WORLD_ZOOM_MIN,
} from '../../world/map/mapConfig'
import { getActiveMapData } from '../../world/map/mapData'
import { mapCellBounds } from '../../world/map/mapProjection'
import { MAP_FOG_FILL, MAP_UNAVAILABLE_FILL, mapCellFillStyle, targetSlotColor } from './mapColors'

export type WorldMapView = {
  viewX: number
  viewZ: number
  zoom: number
}

export type WorldMapDrawContext = {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
}

export function clampWorldMapZoom(zoom: number): number {
  return Math.min(MAP_WORLD_ZOOM_MAX, Math.max(MAP_WORLD_ZOOM_MIN, zoom))
}

export function worldToCanvas(
  worldX: number,
  worldZ: number,
  view: WorldMapView,
  width: number,
  height: number,
): { x: number, y: number } {
  return {
    x: width / 2 + (worldX - view.viewX) * view.zoom,
    y: height / 2 + (worldZ - view.viewZ) * view.zoom,
  }
}

export function canvasToWorld(
  canvasX: number,
  canvasY: number,
  view: WorldMapView,
  width: number,
  height: number,
): { x: number, z: number } {
  return {
    x: view.viewX + (canvasX - width / 2) / view.zoom,
    z: view.viewZ + (canvasY - height / 2) / view.zoom,
  }
}

export function viewportFor(
  view: WorldMapView,
  width: number,
  height: number,
): MapViewport {
  const halfW = width / 2 / view.zoom
  const halfH = height / 2 / view.zoom
  const lodStep = lodStepFor(view, width, height)
  return {
    minX: view.viewX - halfW,
    maxX: view.viewX + halfW,
    minZ: view.viewZ - halfH,
    maxZ: view.viewZ + halfH,
    lodStep,
  }
}

export function lodStepFor(view: WorldMapView, width: number, _height: number): number {
  const worldW = width / Math.max(view.zoom, 1e-6)
  const cellsAcross = worldW / MAP_CELL_SIZE
  return Math.max(1, Math.ceil(cellsAcross / MAP_WORLD_MAX_CELLS_PER_AXIS))
}

function drawUnavailable(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = MAP_UNAVAILABLE_FILL
  ctx.fillRect(0, 0, width, height)
}

/**
 * North-up world map. Canvas +Y follows world +Z (world −Z / north is up).
 * Call only when the overlay is visible — not every game frame.
 */
export function drawWorldMapFrame(
  { ctx, width, height }: WorldMapDrawContext,
  view: WorldMapView,
  playerX: number,
  playerZ: number,
): void {
  drawUnavailable(ctx, width, height)

  const viewport = viewportFor(view, width, height)
  const step = viewport.lodStep ?? 1
  const cellPx = MAP_CELL_SIZE * step * view.zoom
  const mapData = getActiveMapData()

  ctx.fillStyle = MAP_FOG_FILL
  const fogOrigin = worldToCanvas(-MAP_EXTENT_HALF, -MAP_EXTENT_HALF, view, width, height)
  const fogSize = MAP_EXTENT_HALF * 2 * view.zoom
  ctx.fillRect(fogOrigin.x, fogOrigin.y, fogSize, fogSize)

  if (mapData) {
    for (const cell of mapData.queryCells(viewport)) {
      const bounds = mapCellBounds(cell.cx, cell.cz)
      const { x, y } = worldToCanvas(bounds.minX, bounds.minZ, view, width, height)
      ctx.fillStyle = mapCellFillStyle(cell)
      ctx.fillRect(x, y, cellPx + 0.6, cellPx + 0.6)
    }

    const targetSlotById = new Map((getActiveNavigationTargets()?.list() ?? []).map((t) => [t.id, t.slot]))

    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (const location of mapData.knownLocations(viewport)) {
      const { x, y } = worldToCanvas(location.x, location.z, view, width, height)
      const targetSlot = targetSlotById.get(location.id)
      ctx.fillStyle = targetSlot != null ? targetSlotColor(targetSlot) : '#e0b34a'
      // `estimated`/`discovered`/`confirmed` read as outline / translucent /
      // solid (plan §16/§22 — visually distinguishable without extra UI).
      if (location.state === 'estimated') {
        ctx.globalAlpha = 1
        ctx.strokeStyle = ctx.fillStyle
        ctx.lineWidth = 1.5
        ctx.strokeRect(x - 5, y - 5, 10, 10)
      } else {
        ctx.globalAlpha = location.state === 'discovered' ? 0.65 : 1
        ctx.fillRect(x - 5, y - 5, 10, 10)
        ctx.globalAlpha = 1
      }
      if (location.label) {
        ctx.fillStyle = 'rgba(20, 24, 28, 0.85)'
        ctx.fillText(location.label, x + 1, y + 9)
        ctx.fillStyle = '#f2f6fa'
        ctx.fillText(location.label, x, y + 8)
      }
    }
  }

  const player = worldToCanvas(playerX, playerZ, view, width, height)
  ctx.fillStyle = '#f2f6fa'
  ctx.beginPath()
  ctx.moveTo(player.x, player.y - 7)
  ctx.lineTo(player.x + 5, player.y + 5)
  ctx.lineTo(player.x - 5, player.y + 5)
  ctx.closePath()
  ctx.fill()

  ctx.font = 'bold 13px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(20, 24, 28, 0.85)'
  ctx.fillText('N', width / 2 + 1, 16)
  ctx.fillStyle = '#f2f6fa'
  ctx.fillText('N', width / 2, 15)
}

/** Nearest known location to a canvas click, within `maxCanvasPx` (plan §12
 *  "Kliknięcie lokacji na mapie otwiera informacje o niej" — a hit-test
 *  against world data, never canvas pixel colour, and never a discovery
 *  side effect). `null` when nothing known is close enough. */
export function findLocationAtCanvasPoint(
  view: WorldMapView,
  width: number,
  height: number,
  canvasX: number,
  canvasY: number,
  maxCanvasPx = 10,
): MapKnownLocation | null {
  const mapData = getActiveMapData()
  if (!mapData) return null
  const { x: worldX, z: worldZ } = canvasToWorld(canvasX, canvasY, view, width, height)
  const maxWorldDist = maxCanvasPx / view.zoom
  const viewport = {
    minX: worldX - maxWorldDist,
    maxX: worldX + maxWorldDist,
    minZ: worldZ - maxWorldDist,
    maxZ: worldZ + maxWorldDist,
  }
  let nearest: MapKnownLocation | null = null
  let nearestDist = Infinity
  for (const location of mapData.knownLocations(viewport)) {
    const dist = Math.hypot(location.x - worldX, location.z - worldZ)
    if (dist <= maxWorldDist && dist < nearestDist) {
      nearest = location
      nearestDist = dist
    }
  }
  return nearest
}
