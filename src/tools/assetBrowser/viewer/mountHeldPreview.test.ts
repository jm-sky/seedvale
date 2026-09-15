import { Object3D } from 'three'
import { describe, expect, it } from 'vitest'
import type { AssetIndexEntry } from '../../../assets/assetIndex'
import { heldPreviewKind, heldPreviewSocket, provisionalHeldAttach } from './mountHeldPreview'

function heldEntry(id: string): AssetIndexEntry {
  return {
    id,
    url: `/models/items/${id.slice(5)}.glb`,
    label: id,
    group: 'held',
    prepare: { mode: 'fitMax', value: 0.5 },
    skinned: false,
    anchors: [],
  }
}

describe('heldPreviewKind', () => {
  it('maps game-held tools', () => {
    expect(heldPreviewKind(heldEntry('held:axe'))).toBe('axe')
    expect(heldPreviewKind(heldEntry('held:knife'))).toBe('knife')
    expect(heldPreviewKind(heldEntry('held:wooden_torch'))).toBe('wooden_torch')
  })

  it('maps lit branch', () => {
    expect(heldPreviewKind(heldEntry('held:branch'))).toBe('branch')
  })

  it('maps newly wired combat/mining/farm tools', () => {
    expect(heldPreviewKind(heldEntry('held:long_sword'))).toBe('long_sword')
    expect(heldPreviewKind(heldEntry('held:pickaxe'))).toBe('pickaxe')
    expect(heldPreviewKind(heldEntry('held:pitchfork'))).toBe('pitchfork')
    expect(heldPreviewKind(heldEntry('held:sickle'))).toBe('sickle')
  })

  it('returns null for non-held entries', () => {
    expect(heldPreviewKind({
      ...heldEntry('item:axe'),
      id: 'item:axe',
      group: 'item',
    })).toBeNull()
    expect(heldPreviewKind(null)).toBeNull()
  })
})

describe('heldPreviewSocket', () => {
  it('parents wooden_torch to UBC hand_l when present', () => {
    const root = new Object3D()
    const left = new Object3D()
    left.name = 'hand_l'
    const right = new Object3D()
    right.name = 'hand_r'
    root.add(left)
    root.add(right)
    expect(heldPreviewSocket(root, 'wooden_torch')).toBe(left)
    expect(heldPreviewSocket(root, 'axe')).toBe(right)
  })

  it('falls back to the right hand when there is no UBC hand_l', () => {
    const root = new Object3D()
    const wristL = new Object3D()
    wristL.name = 'WristL'
    const wristR = new Object3D()
    wristR.name = 'WristR'
    root.add(wristL)
    root.add(wristR)
    expect(heldPreviewSocket(root, 'wooden_torch')).toBe(wristR)
  })
})

describe('provisionalHeldAttach', () => {
  it('has no remaining browser-only grips now that sword is a ToolKind', () => {
    expect(provisionalHeldAttach(heldEntry('held:long_sword'))).toBeNull()
    expect(provisionalHeldAttach(heldEntry('held:pitchfork'))).toBeNull()
  })
})
