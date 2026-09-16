import { Bone, Group, Object3D } from 'three'
import { describe, expect, it } from 'vitest'
import type { AssetIndexEntry } from '../../../assets/assetIndex'
import { PLAYER_UBC_LEATHER_PAULDRON_URL } from '../../../player/playerEquipmentVisual'
import {
  type AccessoryPreviewSlot,
  applyAccessoryAlignment,
  computeAccessoryPreviewState,
  equipmentVisualForEntry,
} from './mountAccessoryPreview'

function entry(partial: Partial<AssetIndexEntry> & Pick<AssetIndexEntry, 'id' | 'url'>): AssetIndexEntry {
  return {
    label: partial.id,
    group: 'character',
    prepare: { mode: 'none' },
    skinned: true,
    anchors: [],
    ...partial,
  }
}

function slot(opts: {
  skinned?: boolean
  id?: string
  url?: string
  group?: AssetIndexEntry['group']
  bones?: boolean
}): AccessoryPreviewSlot {
  const model = new Group()
  if (opts.bones) {
    const bone = new Bone()
    bone.name = 'root'
    model.add(bone)
  }
  const id = opts.id ?? 'character:ubc-peasant'
  const url = opts.url ?? '/models/characters/ubc/male_peasant.glb'
  return {
    model,
    entry: entry({
      id,
      url,
      group: opts.group ?? (id.startsWith('held:') ? 'held' : 'character'),
      skinned: opts.skinned ?? true,
    }),
  }
}

describe('equipmentVisualForEntry', () => {
  it('resolves pauldron catalog URLs and ignores held tools', () => {
    expect(equipmentVisualForEntry(entry({
      id: 'character:ubc-leather-pauldron',
      url: PLAYER_UBC_LEATHER_PAULDRON_URL,
      group: 'accessory',
    }))?.tint).toBe('brown')
    expect(equipmentVisualForEntry(entry({
      id: 'held:axe',
      url: '/models/items/axe.glb',
      group: 'held',
      skinned: false,
    }))).toBeNull()
  })
})

describe('computeAccessoryPreviewState', () => {
  it('overlays a pauldron on a skinned UBC reference', () => {
    const state = computeAccessoryPreviewState(
      slot({ bones: true }),
      slot({
        id: 'character:ubc-leather-pauldron',
        url: PLAYER_UBC_LEATHER_PAULDRON_URL,
        group: 'accessory',
        bones: true,
      }),
    )
    expect(state.mode).toBe('overlay')
    expect(state.visual?.modelUrl).toBe(PLAYER_UBC_LEATHER_PAULDRON_URL)
  })

  it('does not overlay held tools', () => {
    const state = computeAccessoryPreviewState(
      slot({ bones: true }),
      slot({
        id: 'held:axe',
        url: '/models/items/axe.glb',
        group: 'held',
        skinned: false,
      }),
    )
    expect(state.mode).toBe('off')
    expect(state.visual).toBeNull()
  })

  it('skips overlay when the reference has no skeleton (Adventurer / empty)', () => {
    const state = computeAccessoryPreviewState(
      slot({ bones: false, id: 'character:player', url: '/models/characters/player.glb' }),
      slot({
        id: 'character:ubc-leather-pauldron',
        url: PLAYER_UBC_LEATHER_PAULDRON_URL,
        group: 'accessory',
      }),
    )
    expect(state.mode).toBe('off')
    expect(state.reason).toMatch(/no skeleton/i)
  })
})

describe('applyAccessoryAlignment', () => {
  it('applies identity when the catalog has no alignment', () => {
    const root = new Object3D()
    root.position.set(1, 2, 3)
    applyAccessoryAlignment(root, { modelUrl: PLAYER_UBC_LEATHER_PAULDRON_URL }, null)
    expect(root.position.toArray()).toEqual([0, 0, 0])
    expect(root.scale.x).toBe(1)
  })

  it('applies editor override over catalog defaults', () => {
    const root = new Object3D()
    applyAccessoryAlignment(
      root,
      { modelUrl: PLAYER_UBC_LEATHER_PAULDRON_URL, alignment: { scale: 2 } },
      { position: [0.1, 0, 0], rotation: [0, 0.2, 0], scale: 1.1 },
    )
    expect(root.position.x).toBeCloseTo(0.1)
    expect(root.rotation.y).toBeCloseTo(0.2)
    expect(root.scale.x).toBeCloseTo(1.1)
  })
})
