/** Plan world-terrain-007 §16-18 — cave wall constraints for the shared
 *  `ColliderRegistry` (`world/collision.ts`). Walls are beaded circle
 *  colliders hugging the tunnel/chamber boundary (never the whole bounds as
 *  one primitive — that would block the walkable interior); each carries a
 *  vertical envelope (`minY`/`maxY`) so it can't leak onto a surface entity
 *  standing above the cave. Chamber walls skip an angular gap at every
 *  connected tunnel so the opening stays passable. */

import type { CaveDefinition, CaveNode } from './caveVolume'
import type { Collider } from './collision'

/** Distance between consecutive wall beads. Smaller than `2 * WALL_BEAD_RADIUS`
 *  so consecutive beads overlap and nothing can be squeezed between them. */
const WALL_STEP = 0.85
const WALL_BEAD_RADIUS = 0.5
/** Padding added above/below the local floor/ceiling so a bead's vertical
 *  envelope fully covers its cross-section (no seam at the exact boundary). */
const VERTICAL_PAD = 0.2

function nodeById(definition: CaveDefinition, id: string): CaveNode {
  const node = definition.nodes.find((n) => n.id === id)
  if (!node) throw new Error(`cave ${definition.caveId}: unknown node "${id}"`)
  return node
}

function tunnelWallColliders(definition: CaveDefinition): Collider[] {
  const out: Collider[] = []
  for (const tunnel of definition.tunnels) {
    const from = nodeById(definition, tunnel.from)
    const to = nodeById(definition, tunnel.to)
    const dx = to.center.x - from.center.x
    const dz = to.center.z - from.center.z
    const length = Math.hypot(dx, dz)
    if (length < 1e-6) continue
    const dirX = dx / length
    const dirZ = dz / length
    const perpX = -dirZ
    const perpZ = dirX
    const steps = Math.max(1, Math.ceil(length / WALL_STEP))
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const cx = from.center.x + dx * t
      const cz = from.center.z + dz * t
      const floorY = tunnel.floorStartY + (tunnel.floorEndY - tunnel.floorStartY) * t
      const ceilingY = floorY + tunnel.ceilingHeight
      for (const sign of [-1, 1]) {
        out.push({
          type: 'circle',
          x: cx + perpX * tunnel.radius * sign,
          z: cz + perpZ * tunnel.radius * sign,
          radius: WALL_BEAD_RADIUS,
          minY: floorY - VERTICAL_PAD,
          maxY: ceilingY + VERTICAL_PAD,
        })
      }
    }
  }
  return out
}

function chamberWallColliders(definition: CaveDefinition): Collider[] {
  const out: Collider[] = []
  for (const node of definition.nodes) {
    if (node.kind !== 'chamber') continue
    const connectedAngles: number[] = []
    for (const tunnel of definition.tunnels) {
      let other: CaveNode | null = null
      if (tunnel.from === node.id) other = nodeById(definition, tunnel.to)
      else if (tunnel.to === node.id) other = nodeById(definition, tunnel.from)
      if (!other) continue
      connectedAngles.push(Math.atan2(other.center.x - node.center.x, other.center.z - node.center.z))
      // Half-width (radians) of the gap left open for this tunnel's mouth —
      // sized so the gap comfortably spans the tunnel's own width.
    }
    const circumference = 2 * Math.PI * node.radius
    const steps = Math.max(6, Math.ceil(circumference / WALL_STEP))
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2
      const inGap = connectedAngles.some((tunnelAngle) => {
        const gapHalfAngle = Math.atan2(2.2, node.radius)
        let diff = Math.abs(angle - tunnelAngle) % (Math.PI * 2)
        if (diff > Math.PI) diff = Math.PI * 2 - diff
        return diff < gapHalfAngle
      })
      if (inGap) continue
      out.push({
        type: 'circle',
        x: node.center.x + Math.sin(angle) * node.radius,
        z: node.center.z + Math.cos(angle) * node.radius,
        radius: WALL_BEAD_RADIUS,
        minY: node.floorY - VERTICAL_PAD,
        maxY: node.ceilingY + VERTICAL_PAD,
      })
    }
  }
  return out
}

/** All wall colliders for one cave, ready for `ColliderRegistry.setColliders`
 *  under a stable `cave:<caveId>` owner key (never a chunk key — caves cross
 *  chunk boundaries and have their own streamed lifecycle). */
export function buildCaveWallColliders(definition: CaveDefinition): Collider[] {
  return [...tunnelWallColliders(definition), ...chamberWallColliders(definition)]
}
