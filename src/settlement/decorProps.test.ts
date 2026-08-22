import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createCemetery, createStoneCircle, type TerrainPlacementContext } from './decorProps'

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
})
