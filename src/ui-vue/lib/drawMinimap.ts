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
): void {
  const size = 7
  const perpX = -dirY
  const perpY = dirX
  ctx.beginPath()
  ctx.moveTo(x + dirX * size, y + dirY * size)
  ctx.lineTo(x - dirX * size + perpX * size * 0.6, y - dirY * size + perpY * size * 0.6)
  ctx.lineTo(x - dirX * size - perpX * size * 0.6, y - dirY * size - perpY * size * 0.6)
  ctx.closePath()
  ctx.fill()
}

export function drawMinimapFrame(
  { ctx, size }: MinimapDrawContext,
  playerPos: Vector3,
  settlements: readonly MinimapSettlement[],
): void {
  const scale = MINIMAP_SCALE
  const halfRange = size / 2 / scale
  const arrowRadius = size / 2 - 14

  ctx.fillStyle = 'rgba(20, 24, 28, 0.72)'
  ctx.fillRect(0, 0, size, size)

  const centerX = size / 2
  const centerY = size / 2
  // World Z grows "south"; map down is +y, so this matches without flipping.
  const toMapX = (worldX: number) => centerX + (worldX - playerPos.x) * scale
  const toMapY = (worldZ: number) => centerY + (worldZ - playerPos.z) * scale

  ctx.fillStyle = '#4a89e0'
  for (const settlement of settlements) {
    for (const npc of settlement.npcs) {
      const x = toMapX(npc.mesh.position.x)
      const y = toMapY(npc.mesh.position.z)
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
      const x = toMapX(settlement.position.x)
      const y = toMapY(settlement.position.z)
      ctx.fillStyle = '#e0b34a'
      ctx.fillRect(x - 4, y - 4, 8, 8)
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(20, 24, 28, 0.85)'
      ctx.fillText(settlement.name, x + 1, y + 17)
      ctx.fillStyle = '#f2f6fa'
      ctx.fillText(settlement.name, x, y + 16)
    } else if (dist > 1e-4) {
      const dirX = dx / dist
      const dirY = dz / dist
      ctx.fillStyle = '#e0b34a'
      drawArrow(ctx, centerX + dirX * arrowRadius, centerY + dirY * arrowRadius, dirX, dirY)
    }
  }

  ctx.fillStyle = '#f2f6fa'
  ctx.beginPath()
  ctx.moveTo(centerX, centerY - 5)
  ctx.lineTo(centerX + 5, centerY)
  ctx.lineTo(centerX, centerY + 5)
  ctx.lineTo(centerX - 5, centerY)
  ctx.closePath()
  ctx.fill()
}

type MinimapDrawer = (playerPos: Vector3, settlements: readonly MinimapSettlement[]) => void

let registeredDrawer: MinimapDrawer | null = null

/** MinimapScreen registers an imperative drawer so gameLoop can paint without
 *  putting per-frame positions into Vue reactive state. */
export function registerMinimapDrawer(drawer: MinimapDrawer | null): void {
  registeredDrawer = drawer
}

export function updateRegisteredMinimap(
  playerPos: Vector3,
  settlements: readonly MinimapSettlement[],
): void {
  registeredDrawer?.(playerPos, settlements)
}
