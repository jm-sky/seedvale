import { describe, expect, it } from 'vitest'
import type { CaveDefinition, CaveEntrance, CaveNode, CaveTunnel } from './caveVolume'
import { buildCaveWallColliders } from './caveColliders'
import { computeCaveBounds } from './caveVolume'
import { colliderActiveAtY } from './collision'

function buildCave(): CaveDefinition {
  const entrance: CaveEntrance = { x: 0, y: 10, z: 0, yaw: 0, width: 3, height: 2.6 }
  const mouth: CaveNode = { id: 'mouth', kind: 'mouth', center: { x: 0, y: 10, z: 0 }, radius: 1.65, floorY: 10, ceilingY: 12.6 }
  const chamber: CaveNode = { id: 'chamber1', kind: 'chamber', center: { x: 0, y: 5.4, z: 12 }, radius: 4.5, floorY: 8.3, ceilingY: 12.5 }
  const tunnel: CaveTunnel = { id: 'tunnel1', from: 'mouth', to: 'chamber1', radius: 1.7, floorStartY: 10, floorEndY: 8.3, ceilingHeight: 2.6 }
  const nodes = [mouth, chamber]
  const tunnels = [tunnel]
  return { caveId: 'cave:test', entrance, nodes, tunnels, bounds: computeCaveBounds(entrance, nodes, tunnels), variant: 0.1 }
}

describe('buildCaveWallColliders', () => {
  const cave = buildCave()
  const colliders = buildCaveWallColliders(cave)

  it('produces a non-empty wall set', () => {
    expect(colliders.length).toBeGreaterThan(0)
  })

  it('every collider carries a vertical envelope', () => {
    for (const c of colliders) {
      expect(c.minY).not.toBeUndefined()
      expect(c.maxY).not.toBeUndefined()
    }
  })

  it('a surface point far above the cave is unaffected by any collider (colliderActiveAtY)', () => {
    const surfaceY = 40
    const activeAbove = colliders.filter((c) => colliderActiveAtY(c, surfaceY))
    expect(activeAbove.length).toBe(0)
  })

  it('a point inside the tunnel is within reach of at least one active wall bead', () => {
    const y = 9.5
    const active = colliders.filter((c) => colliderActiveAtY(c, y))
    expect(active.length).toBeGreaterThan(0)
  })

  it('leaves the chamber-to-tunnel junction passable (gap toward the mouth)', () => {
    // chamber1's only connection is back to "mouth" at (0,0) — from chamber1
    // (0,12) that bearing is angle=atan2(0,0-12)=π. No chamber wall bead
    // should sit right on that bearing (the tunnel opening).
    // Chamber wall beads sit exactly on the chamber's radius; tunnel wall
    // beads near the same junction don't, so a tight radius match isolates them.
    const chamberWalls = colliders.filter((c) => Math.abs(Math.hypot(c.x - 0, c.z - 12) - 4.5) < 0.05)
    for (const c of chamberWalls) {
      const angle = Math.atan2(c.x - 0, c.z - 12)
      const diffFromGap = Math.abs(Math.atan2(Math.sin(angle - Math.PI), Math.cos(angle - Math.PI)))
      expect(diffFromGap).toBeGreaterThan(0.05)
    }
  })
})
