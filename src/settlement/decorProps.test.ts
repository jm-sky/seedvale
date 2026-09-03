import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  cemeteryGraveLayout,
  createCemetery,
  createMonolith,
  createSmallRuins,
  createStoneCircle,
  type TerrainPlacementContext,
} from './decorProps'

/** A simple inclined plane — enough slope to make every element's terrain
 *  sample differ from its neighbours, without triggering the "flat terrain"
 *  edge cases in `applyTerrainTilt`. */
function planeHeight(x: number, z: number): number {
  return 0.15 * x - 0.08 * z
}

function makeTerrain(worldX: number, worldZ: number, rotationY: number): TerrainPlacementContext {
  return { worldX, worldZ, rotationY, sampleHeight: planeHeight }
}

describe('createStoneCircle terrain-aware placement (plan 173)', () => {
  it('grounds every stone at its own exact world position, not one shared height', () => {
    const terrain = makeTerrain(12, -7, 0.6)
    const group = createStoneCircle(1, 0.4, terrain)
    const baseY = planeHeight(terrain.worldX, terrain.worldZ)

    expect(group.children.length).toBeGreaterThan(0)
    for (const child of group.children) {
      const stone = child as THREE.Mesh<THREE.CylinderGeometry>
      const worldX = terrain.worldX + stone.position.x
      const worldZ = terrain.worldZ + stone.position.z
      const expectedGroundY = planeHeight(worldX, worldZ) - baseY
      const halfHeight = stone.geometry.parameters.height / 2
      expect(stone.position.y).toBeCloseTo(expectedGroundY + halfHeight, 5)
    }

    // On a real slope, stones on opposite sides of the ring must land at
    // different local heights — a single shared group height would fail this.
    const ys = group.children.map((c) => c.position.y)
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.05)
  })

  it('stays deterministic for identical inputs', () => {
    const terrain = makeTerrain(3, 3, 1.1)
    const a = createStoneCircle(1.1, 0.7, terrain)
    const b = createStoneCircle(1.1, 0.7, terrain)
    expect(a.children.length).toBe(b.children.length)
    for (let i = 0; i < a.children.length; i++) {
      expect(a.children[i]!.position.toArray()).toEqual(b.children[i]!.position.toArray())
      expect(a.children[i]!.rotation.y).toBeCloseTo(b.children[i]!.rotation.y, 10)
    }
  })

  it('without a terrain context, falls back to the flat single-height ring', () => {
    const group = createStoneCircle(1, 0.4)
    const ys = group.children.map((c) => c.position.y)
    // Flat mode: y is only ever half the stone's own height, never terrain-shifted.
    for (const child of group.children) {
      const stone = child as THREE.Mesh<THREE.CylinderGeometry>
      expect(stone.position.y).toBeCloseTo(stone.geometry.parameters.height / 2, 10)
    }
    expect(ys.length).toBeGreaterThan(0)
  })
})

describe('createMonolith terrain-aware placement (world-terrain-006)', () => {
  it('grounds the main stone and rubble at their own exact world position, not one shared height', () => {
    const terrain = makeTerrain(9, -14, 0.4)
    const group = createMonolith(1, 0.5, terrain)
    const baseY = planeHeight(terrain.worldX, terrain.worldZ)

    expect(group.children.length).toBeGreaterThan(1) // main stone + rubble
    for (const child of group.children) {
      const worldX = terrain.worldX + child.position.x
      const worldZ = terrain.worldZ + child.position.z
      const expectedGroundY = planeHeight(worldX, worldZ) - baseY
      // Each element's y sits at ground height plus its own half-height
      // above ground — i.e. never below its expected ground contact point.
      expect(child.position.y).toBeGreaterThanOrEqual(expectedGroundY - 1e-6)
    }

    // Rubble scattered around the base must land at different local
    // heights on a real slope — a single shared group height would fail this.
    const rubbleYs = group.children.slice(1).map((c) => c.position.y)
    expect(Math.max(...rubbleYs) - Math.min(...rubbleYs)).toBeGreaterThan(0.01)
  })

  it('stays deterministic for identical inputs', () => {
    const terrain = makeTerrain(2, -2, 0.9)
    const a = createMonolith(1.1, 0.7, terrain)
    const b = createMonolith(1.1, 0.7, terrain)
    expect(a.children.length).toBe(b.children.length)
    for (let i = 0; i < a.children.length; i++) {
      expect(a.children[i]!.position.toArray()).toEqual(b.children[i]!.position.toArray())
    }
  })

  it('without a terrain context, falls back to the flat single-height layout', () => {
    const group = createMonolith(1, 0.5)
    const rubble = group.children.slice(1)
    for (const r of rubble) {
      expect(r.position.y).toBeCloseTo(0.1, 10)
    }
  })
})

describe('createSmallRuins terrain-aware placement (world-terrain-006)', () => {
  it('grounds walls and rubble at their own exact world position, not one shared height', () => {
    const terrain = makeTerrain(-6, 11, 0.5)
    const group = createSmallRuins(1, 0.5, terrain)
    const baseY = planeHeight(terrain.worldX, terrain.worldZ)

    // child 0 is the foundation slab (kept flat/rigid by design); the rest
    // (walls + rubble) are individually grounded.
    for (const child of group.children.slice(1)) {
      const worldX = terrain.worldX + child.position.x
      const worldZ = terrain.worldZ + child.position.z
      const expectedGroundY = planeHeight(worldX, worldZ) - baseY
      expect(child.position.y).toBeGreaterThanOrEqual(expectedGroundY - 1e-6)
    }

    const ys = group.children.slice(1).map((c) => c.position.y)
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.01)
  })

  it('stays deterministic for identical inputs', () => {
    const terrain = makeTerrain(4, 4, 0.15)
    const a = createSmallRuins(1, 0.6, terrain)
    const b = createSmallRuins(1, 0.6, terrain)
    expect(a.children.length).toBe(b.children.length)
    for (let i = 0; i < a.children.length; i++) {
      expect(a.children[i]!.position.toArray()).toEqual(b.children[i]!.position.toArray())
    }
  })

  it('without a terrain context, falls back to the flat single-height layout', () => {
    const group = createSmallRuins(1, 0.5)
    const rubble = group.children.slice(3) // foundation, wall1, wall2, then rubble
    for (const r of rubble) {
      expect(r.position.y).toBeCloseTo(0.11, 10)
    }
  })
})

describe('createCemetery SM/MD/LG layouts (plan 173)', () => {
  it('grounds every grave at its own exact world position', () => {
    const terrain = makeTerrain(-4, 20, 0.3)
    const group = createCemetery(1, 0.5, undefined, 'MD', terrain)
    const baseY = planeHeight(terrain.worldX, terrain.worldZ)

    // child 0 is the plot centerpiece; the rest are individual graves.
    for (const grave of group.children.slice(1)) {
      const worldX = terrain.worldX + grave.position.x
      const worldZ = terrain.worldZ + grave.position.z
      const expectedY = planeHeight(worldX, worldZ) - baseY
      expect(grave.position.y).toBeCloseTo(expectedY, 5)
    }
  })

  it('grows footprint and grave count from SM to MD to LG, not just a scale multiplier', () => {
    const widthOf = (group: THREE.Group): number => {
      const xs = group.children.slice(1).map((c) => c.position.x)
      return Math.max(...xs) - Math.min(...xs)
    }

    const sm = createCemetery(1, 0.5, undefined, 'SM')
    const md = createCemetery(1, 0.5, undefined, 'MD')
    const lg = createCemetery(1, 0.5, undefined, 'LG')

    // grave count strictly grows
    expect(md.children.length).toBeGreaterThan(sm.children.length)
    expect(lg.children.length).toBeGreaterThan(md.children.length)

    // footprint width strictly grows (aisles between blocks, not one bigger block)
    expect(widthOf(md)).toBeGreaterThan(widthOf(sm))
    expect(widthOf(lg)).toBeGreaterThan(widthOf(md))
  })

  it('stays deterministic for identical inputs', () => {
    const terrain = makeTerrain(1, 1, 0.2)
    const a = createCemetery(1, 0.6, undefined, 'LG', terrain)
    const b = createCemetery(1, 0.6, undefined, 'LG', terrain)
    expect(a.children.length).toBe(b.children.length)
    for (let i = 0; i < a.children.length; i++) {
      expect(a.children[i]!.position.toArray()).toEqual(b.children[i]!.position.toArray())
    }
  })

  it('defaults to the SM layout when size is omitted', () => {
    const withDefault = createCemetery(1, 0.5)
    const explicitSm = createCemetery(1, 0.5, undefined, 'SM')
    expect(withDefault.children.length).toBe(explicitSm.children.length)
  })

  it('spaces graves naturally apart, not packed shoulder-to-shoulder (world-terrain-006)', () => {
    // Nearest-neighbour spot spacing (before per-grave jitter) — was ~1 m,
    // which left barely half a meter of clear ground between adjacent
    // ~0.5 m-wide grave stones.
    for (const size of ['SM', 'MD', 'LG'] as const) {
      const layout = cemeteryGraveLayout(size, 1)
      let nearest = Infinity
      for (let i = 0; i < layout.length; i++) {
        for (let j = i + 1; j < layout.length; j++) {
          const d = Math.hypot(layout[i]!.x - layout[j]!.x, layout[i]!.z - layout[j]!.z)
          if (d < nearest) nearest = d
        }
      }
      expect(nearest).toBeGreaterThan(1.3)
    }
  })

  it('keeps jittered graves from overlapping even at the widened jitter amplitude', () => {
    // Across several variants/sizes, no two actual (post-jitter) grave
    // positions should ever land closer than a grave's own footprint.
    for (const size of ['SM', 'MD', 'LG'] as const) {
      for (const variant of [0.05, 0.35, 0.5, 0.72, 0.95]) {
        const group = createCemetery(1, variant, undefined, size)
        const graves = group.children.slice(1)
        let nearest = Infinity
        for (let i = 0; i < graves.length; i++) {
          for (let j = i + 1; j < graves.length; j++) {
            const d = graves[i]!.position.distanceTo(graves[j]!.position)
            if (d < nearest) nearest = d
          }
        }
        expect(nearest).toBeGreaterThan(0.6)
      }
    }
  })
})
