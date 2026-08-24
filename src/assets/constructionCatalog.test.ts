import { describe, expect, it } from 'vitest'
import { buildAssetIndex } from './assetIndex'
import {
  buildConstructionCatalog,
  CONSTRUCTION_RULES,
  furnitureUrls,
  megakitUrls,
} from './constructionCatalog'
import { HOME_HOUSE_DEFINITIONS, TEST_HOUSE_01, TEST_HOUSE_02 } from './houseDefinitionExample'

describe('constructionCatalog: discovery', () => {
  const catalog = buildConstructionCatalog()

  it('covers all 176 MegaKit GLB', () => {
    expect(megakitUrls()).toHaveLength(176)
  })

  it('covers the plan 169 furniture GLB (bed/table/lamp)', () => {
    expect(furnitureUrls()).toHaveLength(3)
  })

  it('catalog parts = MegaKit + furniture', () => {
    expect(catalog.parts).toHaveLength(megakitUrls().length + furnitureUrls().length)
  })

  it('classifies known files into the right construction kind', () => {
    const kindOf = (name: string) => catalog.byAssetId.get(
      `parked:settlement/megakit/${name}`,
    )?.kind
    expect(kindOf('wall_plaster_straight')).toBe('wall')
    expect(kindOf('wall_plaster_door_flat')).toBe('wall')
    expect(kindOf('door_1_flat')).toBe('door')
    expect(kindOf('window_wide_flat1')).toBe('window')
    expect(kindOf('windowshutters_wide_flat_closed')).toBe('window')
    expect(kindOf('doorframe_flat_wooddark')).toBe('opening')
    expect(kindOf('floor_wooddark')).toBe('floor')
    expect(kindOf('roof_wooden_2x1')).toBe('roof')
    expect(kindOf('corner_exterior_wood')).toBe('corner')
    expect(kindOf('chimney')).toBe('decoration')
    // wagon is `wired` (settlement:wagon), not a `parked:` entry — still classified as decoration.
    const wagon = catalog.parts.find((p) => p.url.endsWith('/wagon.glb'))
    expect(wagon?.kind).toBe('decoration')
  })

  it('every part has a non-empty variant derived from its filename', () => {
    for (const part of catalog.parts) {
      expect(part.variant.length).toBeGreaterThan(0)
    }
  })
})

describe('constructionCatalog: dimensions (measured, not authored)', () => {
  const catalog = buildConstructionCatalog()
  const dimsOf = (name: string) => catalog.byAssetId.get(`parked:settlement/megakit/${name}`)!.dimensions

  it('wall module: ~2.00 x 3.12 x 0.41 m', () => {
    const d = dimsOf('wall_plaster_straight')
    expect(d.x).toBeCloseTo(2, 1)
    expect(d.y).toBeCloseTo(3.12, 1)
    expect(d.z).toBeCloseTo(0.41, 1)
  })

  it('floor tile: 2 x 2 m (thin Y)', () => {
    const d = dimsOf('floor_wooddark')
    expect(d.x).toBeCloseTo(2, 1)
    expect(d.z).toBeCloseTo(2, 1)
    expect(d.y).toBeLessThan(0.1)
  })

  it('corner post is not a 2 m L-wall (review 008 finding, confirmed by geometry)', () => {
    const d = dimsOf('corner_exterior_wood')
    expect(d.x).toBeLessThan(0.5)
    expect(d.z).toBeLessThan(0.5)
  })
})

describe('constructionCatalog: module + grid reliability', () => {
  const catalog = buildConstructionCatalog()

  it('walls and full floor tiles detect a 2 m X module', () => {
    const wall = catalog.byAssetId.get('parked:settlement/megakit/wall_plaster_straight')!
    const floor = catalog.byAssetId.get('parked:settlement/megakit/floor_wooddark')!
    expect(wall.module).toEqual({ axis: 'x', size: 2 })
    expect(floor.module).toEqual({ axis: 'x', size: 2 })
    expect(wall.gridReliable).toBe(true)
    expect(floor.gridReliable).toBe(true)
  })

  it('half floor tiles detect a 1 m X module', () => {
    const half = catalog.byAssetId.get('parked:settlement/megakit/floor_wooddark_half1')!
    expect(half.module).toEqual({ axis: 'x', size: 1 })
  })

  it('corner posts have no detected module (no 2 m corner mesh in the kit)', () => {
    const corner = catalog.byAssetId.get('parked:settlement/megakit/corner_exterior_wood')!
    expect(corner.module.size).toBeNull()
  })

  it('door leaves and window inserts are not grid-reliable (asset-specific pivot)', () => {
    const door = catalog.byAssetId.get('parked:settlement/megakit/door_1_flat')!
    const window = catalog.byAssetId.get('parked:settlement/megakit/window_wide_flat1')!
    expect(door.gridReliable).toBe(false)
    expect(window.gridReliable).toBe(false)
  })

  it('every part has all six face anchors', () => {
    for (const part of catalog.parts) {
      const sides = part.anchors.map((a) => a.side).sort()
      expect(sides).toEqual(['back', 'bottom', 'front', 'left', 'right', 'top'])
    }
  })
})

describe('constructionCatalog: rules stay consistent with the measured catalog', () => {
  const catalog = buildConstructionCatalog()

  it('declares one rule per id, matching the audit report', () => {
    const ids = CONSTRUCTION_RULES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('wall-wall-module')
    expect(ids).toContain('corner-is-a-post-not-an-l-wall')
  })

  it('wall-wall-module rule: every wall part with a detected module shares size 2', () => {
    const walls = catalog.byKind.get('wall') ?? []
    const modularWalls = walls.filter((w) => w.module.size !== null)
    expect(modularWalls.length).toBeGreaterThan(0)
    for (const w of modularWalls) expect(w.module.size).toBe(2)
  })

  it('wall-door-requires-leaf-and-frame rule: door walls, door leaves and doorframes all exist', () => {
    const doorWalls = (catalog.byKind.get('wall') ?? []).filter((w) => w.variant.includes('door'))
    const doorLeaves = catalog.byKind.get('door') ?? []
    const frames = catalog.byKind.get('opening') ?? []
    expect(doorWalls.length).toBeGreaterThan(0)
    expect(doorLeaves.length).toBeGreaterThan(0)
    expect(frames.length).toBeGreaterThan(0)
  })

  it('roof-wooden-2x1-family rule: the modular sub-family exists and the rest are single caps', () => {
    const roofs = catalog.byKind.get('roof') ?? []
    const modularFamily = roofs.filter((r) => r.variant.startsWith('wooden_2x1'))
    expect(modularFamily.length).toBeGreaterThanOrEqual(6)
    expect(roofs.length - modularFamily.length).toBeGreaterThan(0)
  })

  it('floor-wall-base rule: wall and floor share module size and both are grid-reliable', () => {
    const wall = catalog.byAssetId.get('parked:settlement/megakit/wall_plaster_straight')!
    const floor = catalog.byAssetId.get('parked:settlement/megakit/floor_wooddark')!
    expect(wall.module.size).toBe(floor.module.size)
    expect(wall.gridReliable && floor.gridReliable).toBe(true)
  })
})

describe('houseDefinitionExample: TEST_HOUSE_01 references real, correctly-kinded parts', () => {
  const catalog = buildConstructionCatalog(buildAssetIndex())

  it('floor asset exists and is a floor', () => {
    expect(catalog.byAssetId.get(TEST_HOUSE_01.floor.assetId)?.kind).toBe('floor')
  })

  it('every wall placement resolves to a wall part', () => {
    for (const w of TEST_HOUSE_01.walls) {
      expect(catalog.byAssetId.get(w.assetId)?.kind, w.assetId).toBe('wall')
    }
  })

  it('every corner placement resolves to a corner part', () => {
    for (const c of TEST_HOUSE_01.corners) {
      expect(catalog.byAssetId.get(c.assetId)?.kind, c.assetId).toBe('corner')
    }
  })

  it('the door opening resolves to a wall+frame+leaf triple of the right kinds', () => {
    const opening = TEST_HOUSE_01.openings[0]
    expect(opening).toBeDefined()
    expect(catalog.byAssetId.get(opening!.wallAssetId)?.kind).toBe('wall')
    expect(catalog.byAssetId.get(opening!.frameAssetId!)?.kind).toBe('opening')
    expect(catalog.byAssetId.get(opening!.fillAssetId)?.kind).toBe('door')
  })

  it('every roof part resolves to a roof', () => {
    const parts = TEST_HOUSE_01.roof.parts ?? []
    expect(parts.length).toBeGreaterThan(0)
    for (const part of parts) {
      expect(catalog.byAssetId.get(part.assetId)?.kind, part.assetId).toBe('roof')
    }
  })

  it('TEST_HOUSE_02 window opening resolves to a wall+insert pair', () => {
    const window = TEST_HOUSE_02.openings.find((o) => o.type === 'window')
    expect(window).toBeDefined()
    expect(catalog.byAssetId.get(window!.wallAssetId)?.kind).toBe('wall')
    expect(catalog.byAssetId.get(window!.fillAssetId)?.kind).toBe('window')
  })

  it('footprint is a multiple of the wall/floor module (2 m)', () => {
    expect(TEST_HOUSE_01.footprint.width % 2).toBe(0)
    expect(TEST_HOUSE_01.footprint.depth % 2).toBe(0)
  })

  it('every village home resolves to real, correctly-kinded parts', () => {
    expect(HOME_HOUSE_DEFINITIONS.length).toBeGreaterThanOrEqual(10)
    for (const def of HOME_HOUSE_DEFINITIONS) {
      expect(def.footprint.width * def.footprint.depth).toBeGreaterThanOrEqual(16)
      expect(catalog.byAssetId.get(def.floor.assetId)?.kind, def.id).toBe('floor')
      for (const wall of def.walls) {
        expect(catalog.byAssetId.get(wall.assetId)?.kind, `${def.id}:${wall.assetId}`).toBe('wall')
      }
      for (const part of def.roof.parts ?? []) {
        expect(catalog.byAssetId.get(part.assetId)?.kind, `${def.id}:${part.assetId}`).toBe('roof')
      }
      const door = def.openings.find((o) => o.type === 'door')
      expect(door, def.id).toBeDefined()
      expect(catalog.byAssetId.get(door!.fillAssetId)?.kind).toBe('door')
      for (const deco of def.decorations ?? []) {
        expect(catalog.byAssetId.has(deco.assetId), `${def.id}:${deco.assetId}`).toBe(true)
      }
    }
  })
})
