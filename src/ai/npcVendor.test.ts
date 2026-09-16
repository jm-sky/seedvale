import { describe, expect, it } from 'vitest'
import { NPC_VENDOR_MARKER, npcVendorMarker, resolveNpcVendorKind } from './npcVendor'

describe('resolveNpcVendorKind (plan settlements-npcs-042)', () => {
  it('marks trader, blacksmith and hunter as vendors', () => {
    expect(resolveNpcVendorKind('trader')).toBe('merchant')
    expect(resolveNpcVendorKind('blacksmith')).toBe('blacksmith')
    expect(resolveNpcVendorKind('hunter')).toBe('hunter')
  })

  it('does not mark woodcutter, farmer, guard or other roles as vendors', () => {
    expect(resolveNpcVendorKind('woodcutter')).toBeNull()
    expect(resolveNpcVendorKind('farmer')).toBeNull()
    expect(resolveNpcVendorKind('guard')).toBeNull()
    expect(resolveNpcVendorKind('miner')).toBeNull()
    expect(resolveNpcVendorKind('shepherd')).toBeNull()
  })

  it('does not depend on stock or offers — empty-stock vendors stay vendors', () => {
    expect(resolveNpcVendorKind('trader')).toBe('merchant')
    expect(npcVendorMarker('trader')).toBe(NPC_VENDOR_MARKER)
    expect(npcVendorMarker('woodcutter')).toBeNull()
  })
})
