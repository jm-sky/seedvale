import type { NpcAgent } from '../../ai/NpcAgent'
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

/** World units → minimap px. */
export const MINIMAP_SCALE = 2

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
  const scale = MINIMAP_SCALE
  const halfRange = size / 2 / scale
  const arrowRadius = size / 2 - 14
  const northRadius = size / 2 - 10
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)

  ctx.fillStyle = 'rgba(20, 24, 28, 0.72)'
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

  for (const settlement of settlements) {
    const dx = settlement.position.x - playerPos.x
    const dz = settlement.position.z - playerPos.z
    const dist = Math.hypot(dx, dz)
    if (dist <= halfRange) {
      const { x, y } = toMap(settlement.position.x, settlement.position.z)
      ctx.fillStyle = '#e0b34a'
      ctx.fillRect(x - 4, y - 4, 8, 8)
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(20, 24, 28, 0.85)'
      ctx.fillText(settlement.name, x + 1, y + 17)
      ctx.fillStyle = '#f2f6fa'
      ctx.fillText(settlement.name, x, y + 16)
    } else if (dist > 1e-4) {
      const rotated = rotateDelta(dx, dz)
      const len = Math.hypot(rotated.x, rotated.y)
      const dirX = rotated.x / len
      const dirY = rotated.y / len
      ctx.fillStyle = '#e0b34a'
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
  registeredDrawer?.(playerPos, settlements, yaw)
}
