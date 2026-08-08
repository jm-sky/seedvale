import type { NpcAgent } from '../ai/NpcAgent'
import { isTouchDevice } from '../input/isTouchDevice'
import type { Vector3 } from 'three'

export type MinimapSettlement = {
  position: Vector3
  npcs: readonly NpcAgent[]
  name: string
}

/** Canvas size in CSS px (square) — smaller on touch so the expanded map has
 *  less chance of reaching into the bottom-right action-button cluster on a
 *  short landscape viewport (it starts collapsed there anyway — see below). */
const SIZE = isTouchDevice() ? 130 : 200
/** World units → minimap px. */
const SCALE = 2
/** Half-extent of the visible world window, in world units (SIZE / 2 / SCALE). */
const HALF_RANGE = SIZE / 2 / SCALE
/** How far from center the settlement direction arrow is drawn when the settlement
 *  itself is off-map. */
const ARROW_RADIUS = SIZE / 2 - 14

export type Minimap = {
  root: HTMLDivElement
  update: (playerPos: Vector3, settlements: readonly MinimapSettlement[]) => void
  toggle: () => void
  dispose: () => void
}

export function createMinimap(parent: HTMLElement): Minimap {
  const root = document.createElement('div')
  root.className = 'seedvale-minimap'
  root.innerHTML = `
    <button type="button" class="seedvale-minimap__toggle" data-toggle>[-]</button>
    <canvas class="seedvale-minimap__canvas" data-canvas></canvas>
  `
  parent.appendChild(root)

  const toggleButton = root.querySelector<HTMLButtonElement>('[data-toggle]')!
  const canvas = root.querySelector<HTMLCanvasElement>('[data-canvas]')!
  const ctx = canvas.getContext('2d')!

  const dpr = window.devicePixelRatio || 1
  canvas.width = SIZE * dpr
  canvas.height = SIZE * dpr
  canvas.style.width = `${SIZE}px`
  canvas.style.height = `${SIZE}px`
  ctx.scale(dpr, dpr)

  // Expanded by default, same as desktop — the minimap is useful enough on
  // touch that hiding it by default did more harm than good (reported). The
  // top-right cluster layout (see index.html's .seedvale-top-right-cluster)
  // now keeps it clear of the L/G/RUN/E action-button cluster instead.
  let collapsed = false
  canvas.hidden = collapsed
  toggleButton.textContent = collapsed ? '[+]' : '[-]'
  const onToggleClick = () => {
    collapsed = !collapsed
    canvas.hidden = collapsed
    toggleButton.textContent = collapsed ? '[+]' : '[-]'
  }
  toggleButton.addEventListener('click', onToggleClick)

  return {
    root,
    update(playerPos, settlements) {
      if (collapsed) return

      ctx.fillStyle = 'rgba(20, 24, 28, 0.72)'
      ctx.fillRect(0, 0, SIZE, SIZE)

      const centerX = SIZE / 2
      const centerY = SIZE / 2
      // World Z grows "south"; map down is +y, so this matches without flipping.
      const toMapX = (worldX: number) => centerX + (worldX - playerPos.x) * SCALE
      const toMapY = (worldZ: number) => centerY + (worldZ - playerPos.z) * SCALE

      // NPCs — blue dots, only when on-map.
      ctx.fillStyle = '#4a89e0'
      for (const settlement of settlements) {
        for (const npc of settlement.npcs) {
          const x = toMapX(npc.mesh.position.x)
          const y = toMapY(npc.mesh.position.z)
          if (x < 0 || x > SIZE || y < 0 || y > SIZE) continue
          ctx.beginPath()
          ctx.arc(x, y, 2.5, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // Settlements — yellow squares (+ name label), on-map or clamped to an
      // edge arrow. Label keeps the player oriented among lookalike villages.
      for (const settlement of settlements) {
        const dx = settlement.position.x - playerPos.x
        const dz = settlement.position.z - playerPos.z
        const dist = Math.hypot(dx, dz)
        if (dist <= HALF_RANGE) {
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
          drawArrow(ctx, centerX + dirX * ARROW_RADIUS, centerY + dirY * ARROW_RADIUS, dirX, dirY)
        }
      }

      // Player — white diamond, always centered.
      ctx.fillStyle = '#f2f6fa'
      ctx.beginPath()
      ctx.moveTo(centerX, centerY - 5)
      ctx.lineTo(centerX + 5, centerY)
      ctx.lineTo(centerX, centerY + 5)
      ctx.lineTo(centerX - 5, centerY)
      ctx.closePath()
      ctx.fill()
    },
    toggle: onToggleClick,
    dispose() {
      toggleButton.removeEventListener('click', onToggleClick)
      root.remove()
    },
  }
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
