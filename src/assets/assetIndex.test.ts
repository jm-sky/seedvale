import { describe, expect, it } from 'vitest'
import { buildAssetIndex } from './assetIndex'

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
})
