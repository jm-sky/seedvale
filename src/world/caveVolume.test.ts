import { describe, expect, it } from 'vitest'
import type { CaveDefinition, CaveEntrance, CaveNode, CaveTunnel } from './caveVolume'
import { computeCaveBounds, createCaveVolume } from './caveVolume'

function buildSimpleCave(): CaveDefinition {
  const entrance: CaveEntrance = { x: 0, y: 10, z: 0, yaw: 0, width: 3, height: 2.6 }
  const mouth: CaveNode = {
    id: 'mouth',
    kind: 'mouth',
    center: { x: 0, y: 10, z: 0 },
    radius: 1.65,
    floorY: 10,
    ceilingY: 12.6,
  }
  const chamber: CaveNode = {
    id: 'chamber1',
    kind: 'chamber',
    center: { x: 0, y: 5.4, z: 12 },
    radius: 4.5,
    floorY: 8.3,
    ceilingY: 12.5,
  }
  const tunnel: CaveTunnel = {
    id: 'tunnel1',
    from: 'mouth',
    to: 'chamber1',
    radius: 1.7,
    floorStartY: 10,
    floorEndY: 8.3,
    ceilingHeight: 2.6,
  }
  const nodes = [mouth, chamber]
  const tunnels = [tunnel]
  return {
    caveId: 'cave:test',
    entrance,
    nodes,
    tunnels,
    bounds: computeCaveBounds(entrance, nodes, tunnels),
    variant: 0.5,
  }
}

describe('createCaveVolume', () => {
  const volume = createCaveVolume(buildSimpleCave())

  it('contains a point inside the tunnel', () => {
    expect(volume.containsHorizontal(0, 6)).toBe(true)
    const floor = volume.sampleFloor(0, 6)
    expect(floor).not.toBeNull()
    expect(volume.contains(0, floor! + 0.1, 6)).toBe(true)
  })

  it('rejects a point outside the tunnel radius', () => {
    expect(volume.containsHorizontal(5, 6)).toBe(false)
    expect(volume.sampleFloor(5, 6)).toBeNull()
  })

  it('contains a point inside the chamber', () => {
    expect(volume.containsHorizontal(0, 12)).toBe(true)
    expect(volume.contains(0, 9, 12)).toBe(true)
  })

  it('rejects a point above the ceiling', () => {
    expect(volume.contains(0, 20, 6)).toBe(false)
  })

  it('rejects a point below the floor', () => {
    expect(volume.contains(0, 0, 6)).toBe(false)
  })

  it('a surface point directly above the tunnel is not "inside" without the right Y', () => {
    // Same X/Z as the tunnel centerline, but far above the cave ceiling —
    // simulates a surface entity standing on the hill above the tunnel.
    expect(volume.contains(0, 40, 6)).toBe(false)
  })

  // Regression (plan world-terrain-008, 2026-09-05 repro): `sampleFloor`
  // collapses overlapping primitives to their minimum, so an entity standing
  // on the floor this very query reported can end up below the *local*
  // primitive's floor one step later. `contains` used to reject it, which made
  // `PlayerController.groundAt()` fall back to the surface heightfield and
  // teleport the player out of the cave onto the hillside.
  it('keeps an entity standing on the reported floor contained at every adjacent point', () => {
    const definition = buildSimpleCave()
    const volume = createCaveVolume(definition)
    const step = 0.1
    for (let x = -6; x <= 6; x += step) {
      for (let z = -3; z <= 18; z += step) {
        const floor = volume.sampleFloor(x, z)
        if (floor === null) continue
        for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]] as const) {
          if (volume.sampleFloor(x + dx, z + dz) === null) continue
          expect(volume.contains(x + dx, floor, z + dz)).toBe(true)
        }
      }
    }
  })

  it('floor sampling is deterministic', () => {
    const a = volume.sampleFloor(0, 6)
    const b = volume.sampleFloor(0, 6)
    expect(a).toBe(b)
  })

  it('bounds contain all primitives', () => {
    const bounds = volume.bounds()
    expect(bounds.minX).toBeLessThanOrEqual(-1.7)
    expect(bounds.maxX).toBeGreaterThanOrEqual(4.5)
    expect(bounds.minZ).toBeLessThanOrEqual(0)
    expect(bounds.maxZ).toBeGreaterThanOrEqual(12 + 4.5)
  })
})
