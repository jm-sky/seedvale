import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  buildAssetIndex,
  customUrlEntry,
  filterAssetIndex,
  formatAssetLabel,
  kindFromBasename,
  mergeParkedManifest,
  parkedIdFromUrl,
  resolveLoadEntry,
} from './assetIndex'

describe('assetIndex', () => {
  it('has unique ids', () => {
    const index = buildAssetIndex()
    const ids = index.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every entry has url and prepare', () => {
    for (const entry of buildAssetIndex()) {
      expect(entry.url).toMatch(/^\/models\//)
      expect(entry.prepare.mode).toBeTruthy()
    }
  })

  it('held:axe and item:axe differ in prepare (registry drift guard)', () => {
    const index = buildAssetIndex()
    const held = index.find((e) => e.id === 'held:axe')
    const ground = index.find((e) => e.id === 'item:axe')
    expect(held).toBeDefined()
    expect(ground).toBeDefined()
    expect(held!.prepare).not.toEqual(ground!.prepare)
    expect(held!.url).toBe(ground!.url)
  })

  it('includes all player holdable GLB tools in held group', () => {
    const index = buildAssetIndex()
    const ids = new Set(index.map((e) => e.id))
    for (const id of [
      'held:knife',
      'held:axe',
      'held:shovel',
      'held:wooden_torch',
      'held:branch',
      'held:pickaxe',
      'held:long_sword',
      'held:pitchfork',
      'held:sickle',
      'held:spear',
      'held:short_sword',
      'held:damascus_knife',
      'held:damascus_short_sword',
      'held:damascus_long_sword',
      'held:obsidian_sword',
      'held:battle_axe',
      'held:masterwork_sword',
    ]) {
      expect(ids.has(id), id).toBe(true)
    }
  })

  it('includes roadmap held tools for grip alignment work', () => {
    const index = buildAssetIndex()
    const ids = new Set(index.map((e) => e.id))
    for (const id of ['held:pitchfork', 'held:sickle', 'held:pickaxe', 'held:long_sword']) {
      expect(ids.has(id), id).toBe(true)
    }
  })

  it('marks registry entries wired and includes the Kupiec wagon once', () => {
    const index = buildAssetIndex()
    const wagon = index.find((e) => e.url === '/models/settlement/megakit/wagon.glb')
    expect(wagon).toBeDefined()
    expect(wagon!.id).toBe('settlement:wagon')
    expect(wagon!.status).toBe('wired')
    expect(wagon!.prepare).toEqual({ mode: 'fitMax', value: 3.8 })
    expect(wagon!.pack).toBe('megakit')
  })

  it('house labels include catalog id so Chałupa is unique', () => {
    const index = buildAssetIndex()
    const hutA = index.find((e) => e.id === 'house:hut_a')
    const hutB = index.find((e) => e.id === 'house:hut_b')
    const hutD = index.find((e) => e.id === 'house:hut_d')
    expect(hutA?.label).toBe('hut_a — Chałupa')
    expect(hutB?.label).toBe('hut_b — Chałupa')
    expect(hutD?.label).toBe('hut_d — Chata')
    expect(hutA!.label).not.toBe(hutB!.label)
  })

  it('labels the RTS palisade distinctly from MegaKit walls', () => {
    const wall = buildAssetIndex().find((e) => e.id === 'settlement:wall')
    expect(wall?.label).toMatch(/palisade/i)
  })
})

describe('MegaKit kind + parked merge', () => {
  it('maps doorway walls to wall, leaves to door, roofs to roof', () => {
    expect(kindFromBasename('wall_plaster_door_flat')).toBe('wall')
    expect(kindFromBasename('door_1_flat')).toBe('door')
    expect(kindFromBasename('doorframe_flat_wooddark')).toBe('doorframe')
    expect(kindFromBasename('roof_wooden_2x1')).toBe('roof')
    expect(kindFromBasename('window_wide_flat1')).toBe('window')
    expect(kindFromBasename('chimney_2')).toBe('chimney')
  })

  it('merges parked megakit without duplicating wagon', () => {
    const wired = buildAssetIndex()
    const merged = mergeParkedManifest(wired, [
      '/models/settlement/megakit/wagon.glb',
      '/models/settlement/megakit/wall_plaster_straight.glb',
      '/models/settlement/megakit/roof_wooden_2x1.glb',
    ])
    expect(merged.filter((e) => e.url.endsWith('/wagon.glb'))).toHaveLength(1)
    const ids = merged.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)

    const wall = merged.find((e) => e.id === 'parked:settlement/megakit/wall_plaster_straight')
    expect(wall).toBeDefined()
    expect(wall!.status).toBe('parked')
    expect(wall!.prepare).toEqual({ mode: 'none' })
    expect(wall!.pack).toBe('megakit')
    expect(wall!.kind).toBe('wall')
    expect(formatAssetLabel(wall!)).toBe('wall_plaster_straight [parked]')

    const roof = merged.find((e) => e.id === parkedIdFromUrl('/models/settlement/megakit/roof_wooden_2x1.glb'))
    expect(roof?.kind).toBe('roof')
  })

  it('search roof finds parked roofs and wall finds palisade + plaster', () => {
    const merged = mergeParkedManifest(buildAssetIndex(), [
      '/models/settlement/megakit/wall_plaster_straight.glb',
      '/models/settlement/megakit/wall_brick_straight.glb',
      '/models/settlement/megakit/roof_wooden_2x1.glb',
      '/models/settlement/megakit/roof_roundtiles_4x4.glb',
    ])
    const roofs = filterAssetIndex(merged, 'roof')
    expect(roofs.length).toBe(2)
    expect(roofs.every((e) => e.status === 'parked')).toBe(true)

    const walls = filterAssetIndex(merged, 'wall')
    expect(walls.some((e) => e.id === 'settlement:wall')).toBe(true)
    expect(walls.some((e) => e.id.includes('wall_plaster_straight'))).toBe(true)
    expect(walls.some((e) => e.id.includes('wall_brick_straight'))).toBe(true)
  })

  it('empty-state search returns 0 rather than the full list', () => {
    const merged = mergeParkedManifest(buildAssetIndex(), [
      '/models/settlement/megakit/roof_wooden_2x1.glb',
    ])
    expect(filterAssetIndex(merged, 'xyzzy-no-such-asset')).toEqual([])
  })

  it('custom URL entries use prepare none (authored meters)', () => {
    const entry = customUrlEntry('/models/settlement/megakit/chimney.glb')
    expect(entry.prepare).toEqual({ mode: 'none' })
    expect(entry.pack).toBe('megakit')
    expect(entry.kind).toBe('chimney')
  })

  it('resolveLoadEntry prefers parked index rows over synthetic custom:url', () => {
    const merged = mergeParkedManifest(buildAssetIndex(), [
      '/models/settlement/megakit/chimney.glb',
    ])
    const fromUrl = resolveLoadEntry(merged, { url: '/models/settlement/megakit/chimney.glb' })
    expect(fromUrl?.id).toBe('parked:settlement/megakit/chimney')
    expect(fromUrl?.prepare.mode).toBe('none')
    const unknown = resolveLoadEntry(merged, { url: '/models/settlement/megakit/not_a_real_file.glb' })
    expect(unknown?.id).toBe('custom:url')
    expect(unknown?.prepare.mode).toBe('none')
  })

  it('public megakit kit is complete enough for parked discovery (~39 roofs)', () => {
    const files = readdirSync('public/models/settlement/megakit')
      .filter((f) => f.endsWith('.glb'))
      .map((f) => `/models/settlement/megakit/${f}`)
    expect(files.length).toBe(176)
    const merged = mergeParkedManifest(buildAssetIndex(), files)
    const roofs = filterAssetIndex(merged, 'roof')
    expect(roofs.length).toBeGreaterThanOrEqual(39)
    expect(roofs.every((e) => e.status === 'parked')).toBe(true)
    expect(merged.filter((e) => e.url.endsWith('/wagon.glb'))).toHaveLength(1)
  })
})
