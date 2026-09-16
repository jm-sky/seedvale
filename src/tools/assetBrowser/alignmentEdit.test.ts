import { describe, expect, it } from 'vitest'
import { PLAYER_UBC_LEATHER_PAULDRON_URL } from '../../player/playerEquipmentVisual'
import {
  alignmentEdit,
  alignmentEditToOverride,
  formatAlignmentSnippet,
  loadAlignmentEditor,
} from './alignmentEdit'

describe('alignment editor', () => {
  it('starts at identity for catalog pauldrons with no stored alignment', () => {
    loadAlignmentEditor({
      id: 'character:ubc-leather-pauldron',
      url: PLAYER_UBC_LEATHER_PAULDRON_URL,
      label: 'leather',
      group: 'accessory',
      prepare: { mode: 'none' },
      skinned: true,
      anchors: [],
    })
    expect(alignmentEdit.active).toBe(true)
    expect(alignmentEdit.position).toEqual([0, 0, 0])
    expect(alignmentEdit.rotationDeg).toEqual([0, 0, 0])
    expect(alignmentEdit.scale).toBe(1)
    expect(alignmentEditToOverride()).toEqual({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: 1,
    })
  })

  it('formats a pasteable playerEquipmentVisual alignment field', () => {
    loadAlignmentEditor({
      id: 'character:ubc-leather-pauldron',
      url: PLAYER_UBC_LEATHER_PAULDRON_URL,
      label: 'leather',
      group: 'accessory',
      prepare: { mode: 'none' },
      skinned: true,
      anchors: [],
    })
    alignmentEdit.position = [0.01, -0.02, 0]
    alignmentEdit.rotationDeg = [0, 90, 0]
    alignmentEdit.scale = 1.05
    const snippet = formatAlignmentSnippet()
    expect(snippet).toContain('alignment: {')
    expect(snippet).toContain('position: [0.01, -0.02, 0]')
    expect(snippet).toMatch(/rotation: \[0, 1\.5708, 0\]/)
    expect(snippet).toContain('scale: 1.05')
  })

  it('deactivates when the target is not an equipment visual', () => {
    loadAlignmentEditor({
      id: 'held:axe',
      url: '/models/items/axe.glb',
      label: 'axe',
      group: 'held',
      prepare: { mode: 'fitMax', value: 0.5 },
      skinned: false,
      anchors: [],
    })
    expect(alignmentEdit.active).toBe(false)
  })
})
