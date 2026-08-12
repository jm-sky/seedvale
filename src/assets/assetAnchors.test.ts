import { describe, expect, it } from 'vitest'
import {
  isValidAnchorName,
  mergeAnchorDefs,
  normalizeGlbAnchorName,
  ORIGIN_ANCHOR_DEF,
  validateAnchorDefs,
} from './assetAnchors'

describe('assetAnchors', () => {
  it('validates anchor names', () => {
    expect(isValidAnchorName('grip')).toBe(true)
    expect(isValidAnchorName('hand.right')).toBe(true)
    expect(isValidAnchorName('lamp_mount')).toBe(true)
    expect(isValidAnchorName('Grip')).toBe(false)
    expect(isValidAnchorName('1bad')).toBe(false)
  })

  it('normalizes SV_ GLB node names', () => {
    expect(normalizeGlbAnchorName('SV_grip')).toBe('grip')
    expect(normalizeGlbAnchorName('sv_Grip.001')).toBe('grip')
    expect(normalizeGlbAnchorName('SV_hand.right')).toBe('hand.right')
    expect(normalizeGlbAnchorName('WristR')).toBeNull()
  })

  it('merges metadata over GLB with override-shadowed', () => {
    const discovered = [{ name: 'grip', node: 'SV_grip', space: 'node' as const }]
    const metadata = [{ name: 'grip', type: 'grip' as const, rotation: [0, 0, 0] as const }]
    const { defs, issues } = mergeAnchorDefs(discovered, metadata)
    expect(defs).toHaveLength(1)
    expect(defs[0]!.rotation).toEqual([0, 0, 0])
    expect(issues.some((i) => i.kind === 'override-shadowed')).toBe(true)
  })

  it('reports duplicate names', () => {
    const issues = validateAnchorDefs([
      { name: 'grip' },
      { name: 'grip' },
    ], { mode: 'none' })
    expect(issues.some((i) => i.kind === 'duplicate-name')).toBe(true)
  })

  it('reports missing orientation for grip/mount/attachment', () => {
    const issues = validateAnchorDefs([
      { name: 'grip', type: 'grip' },
      { name: 'lamp_mount', type: 'mount' },
    ], { mode: 'none' })
    expect(issues.filter((i) => i.kind === 'missing-orientation')).toHaveLength(2)
  })

  it('reports prepare-mismatch for assetLocal anchors', () => {
    const issues = validateAnchorDefs([
      {
        name: 'lamp_mount',
        type: 'mount',
        rotation: [0, 0, 0],
        authoredFor: { mode: 'height', value: 2 },
        space: 'assetLocal',
      },
    ], { mode: 'height', value: 3 })
    expect(issues.some((i) => i.kind === 'prepare-mismatch')).toBe(true)
  })

  it('includes synthetic origin anchor def', () => {
    expect(ORIGIN_ANCHOR_DEF.name).toBe('origin')
    expect(ORIGIN_ANCHOR_DEF.type).toBe('origin')
  })
})
