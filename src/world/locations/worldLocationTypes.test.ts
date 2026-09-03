import { describe, expect, it } from 'vitest'
import { worldLocationKindFromId } from './worldLocationTypes'

describe('worldLocationKindFromId', () => {
  it('reads the kind prefix for every WorldLocationKind id shape', () => {
    expect(worldLocationKindFromId('settlement:0,0')).toBe('settlement')
    expect(worldLocationKindFromId('cave:abc123')).toBe('cave')
    expect(worldLocationKindFromId('cemetery:1:2:0:x7f')).toBe('cemetery')
    expect(worldLocationKindFromId('lake:3,4')).toBe('lake')
    expect(worldLocationKindFromId('mountainPeak:5,6')).toBe('mountainPeak')
  })

  it('returns null for an id with no kind prefix or an unknown kind', () => {
    expect(worldLocationKindFromId('no-colon-here')).toBeNull()
    expect(worldLocationKindFromId('unknownKind:123')).toBeNull()
  })
})
