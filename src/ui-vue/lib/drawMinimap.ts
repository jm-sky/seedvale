import type { NpcAgent } from '../../ai/NpcAgent'
import { getActiveNavigationTargets } from '../../world/locations/navigationTargets'
import { MAP_MINIMAP_ZOOM_MAX, MAP_MINIMAP_ZOOM_MIN } from '../../world/map/mapConfig'
import { getActiveMapData } from '../../world/map/mapData'
import { mapCellBounds } from '../../world/map/mapProjection'
import { MAP_FOG_FILL, mapCellFillStyle, targetSlotColor } from './mapColors'
import type { Vector3 } from 'three'

export type MinimapSettlement = {
  position: Vector3
  npcs: readonly NpcAgent[]
  name: string
}

/** Canvas size in CSS px (square) — smaller on touch so the expanded map has
 *  less chance of reaching into the bottom-right action-button cluster on a
 *  short landscape viewport. */
export function minimapSize(touch: boolean): number {
  return touch ? 130 : 200
}

/** World units → minimap px at zoom 1×. */
export const MINIMAP_SCALE = 2

let minimapZoom = 1

export function getMinimapZoom(): number {
  return minimapZoom
}

export function setMinimapZoom(zoom: number): void {
  minimapZoom = Math.min(MAP_MINIMAP_ZOOM_MAX, Math.max(MAP_MINIMAP_ZOOM_MIN, zoom))
}

export function adjustMinimapZoom(delta: number): void {
  setMinimapZoom(minimapZoom + delta)
}

export type MinimapDrawContext = {
  ctx: CanvasRenderingContext2D
  size: number
}

/** Small filled triangle at (x, y) pointing along the unit direction (dirX, dirY). */
function drawArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  tipSize = 7,
): void {
  const perpX = -dirY
  const perpY = dirX
  ctx.beginPath()
  ctx.moveTo(x + dirX * tipSize, y + dirY * tipSize)
  ctx.lineTo(x - dirX * tipSize + perpX * tipSize * 0.6, y - dirY * tipSize + perpY * tipSize * 0.6)
  ctx.lineTo(x - dirX * tipSize - perpX * tipSize * 0.6, y - dirY * tipSize - perpY * tipSize * 0.6)
  ctx.closePath()
  ctx.fill()
}

/**
 * Heading-up minimap: canvas up = player look direction (`MouseLook` yaw).
 * World −Z is north; with yaw=0 that already maps to canvas up, so rotating
 * world deltas by yaw keeps forward at the top.
 */
export function drawMinimapFrame(
  { ctx, size }: MinimapDrawContext,
  playerPos: Vector3,
  settlements: readonly MinimapSettlement[],
  yaw: number,
): void {
  const scale = MINIMAP_SCALE * minimapZoom
  const halfRange = size / 2 / scale
  const arrowRadius = size / 2 - 14
  const northRadius = size / 2 - 10
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)

  ctx.fillStyle = MAP_FOG_FILL
  ctx.fillRect(0, 0, size, size)

  const centerX = size / 2
  const centerY = size / 2

  const toMap = (worldX: number, worldZ: number): { x: number, y: number } => {
    const dx = worldX - playerPos.x
    const dz = worldZ - playerPos.z
    const rx = dx * cos - dz * sin
    const ry = dx * sin + dz * cos
    return { x: centerX + rx * scale, y: centerY + ry * scale }
  }

  const rotateDelta = (dx: number, dz: number): { x: number, y: number } => ({
    x: dx * cos - dz * sin,
    y: dx * sin + dz * cos,
  })

  const mapData = getActiveMapData()
  const queryRange = halfRange * Math.SQRT2
  const viewport = {
    minX: playerPos.x - queryRange,
    maxX: playerPos.x + queryRange,
    minZ: playerPos.z - queryRange,
    maxZ: playerPos.z + queryRange,
  }
  if (mapData) {
    for (const cell of mapData.queryCells(viewport)) {
      const bounds = mapCellBounds(cell.cx, cell.cz)
      const corners = [
        toMap(bounds.minX, bounds.minZ),
        toMap(bounds.maxX, bounds.minZ),
        toMap(bounds.maxX, bounds.maxZ),
        toMap(bounds.minX, bounds.maxZ),
      ]
      ctx.fillStyle = mapCellFillStyle(cell)
      ctx.beginPath()
      ctx.moveTo(corners[0]!.x, corners[0]!.y)
      ctx.lineTo(corners[1]!.x, corners[1]!.y)
      ctx.lineTo(corners[2]!.x, corners[2]!.y)
      ctx.lineTo(corners[3]!.x, corners[3]!.y)
      ctx.closePath()
      ctx.fill()
    }
  }

  ctx.fillStyle = '#4a89e0'
  for (const settlement of settlements) {
    for (const npc of settlement.npcs) {
      const { x, y } = toMap(npc.mesh.position.x, npc.mesh.position.z)
      if (x < 0 || x > size || y < 0 || y > size) continue
      ctx.beginPath()
      ctx.arc(x, y, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Minimap shows only the 1-3 active navigation targets (plan world-012
  // §14) — never the full `knownLocations()` list; that stays the full
  // world map's job.
  const targets = getActiveNavigationTargets()?.list() ?? []
  for (const target of targets) {
    const location = mapData?.resolveKnown(target.id)
    if (!location) continue
    const color = targetSlotColor(target.slot)
    const dx = location.x - playerPos.x
    const dz = location.z - playerPos.z
    const dist = Math.hypot(dx, dz)
    if (dist <= halfRange) {
      const { x, y } = toMap(location.x, location.z)
      ctx.fillStyle = color
      ctx.fillRect(x - 4, y - 4, 8, 8)
      if (location.label) {
        ctx.font = '10px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillStyle = 'rgba(20, 24, 28, 0.85)'
        ctx.fillText(location.label, x + 1, y + 17)
        ctx.fillStyle = '#f2f6fa'
        ctx.fillText(location.label, x, y + 16)
      }
    } else if (dist > 1e-4) {
      const rotated = rotateDelta(dx, dz)
      const len = Math.hypot(rotated.x, rotated.y)
      const dirX = rotated.x / len
      const dirY = rotated.y / len
      ctx.fillStyle = color
      drawArrow(ctx, centerX + dirX * arrowRadius, centerY + dirY * arrowRadius, dirX, dirY)
    }
  }

  // True north (−Z) after heading rotation → rim marker.
  const northX = centerX + sin * northRadius
  const northY = centerY - cos * northRadius
  ctx.font = 'bold 12px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(20, 24, 28, 0.85)'
  ctx.fillText('N', northX + 1, northY + 1)
  ctx.fillStyle = '#f2f6fa'
  ctx.fillText('N', northX, northY)

  // Player: fixed upward triangle (canvas up = look direction).
  ctx.fillStyle = '#f2f6fa'
  drawArrow(ctx, centerX, centerY, 0, -1, 6)
}

type MinimapDrawer = (playerPos: Vector3, settlements: readonly MinimapSettlement[], yaw: number) => void

let registeredDrawer: MinimapDrawer | null = null
let lastPlayerX = 0
let lastPlayerZ = 0

export function lastMinimapPlayer(): { x: number, z: number } {
  return { x: lastPlayerX, z: lastPlayerZ }
}

/** MinimapScreen registers an imperative drawer so gameLoop can paint without
 *  putting per-frame positions into Vue reactive state. */
export function registerMinimapDrawer(drawer: MinimapDrawer | null): void {
  registeredDrawer = drawer
}

export function updateRegisteredMinimap(
  playerPos: Vector3,
  settlements: readonly MinimapSettlement[],
  yaw: number,
): void {
  lastPlayerX = playerPos.x
  lastPlayerZ = playerPos.z
  registeredDrawer?.(playerPos, settlements, yaw)
}
