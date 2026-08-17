import { describe, expect, it } from 'vitest'
import { regionCoordOf, regionKey } from './chunkGrid'

describe('regionCoordOf / regionKey', () => {
  it('groups chunks within the same region to the same coord/key', () => {
    const regionChunks = 3
    const members = [
      { cx: 0, cz: 0 },
      { cx: 1, cz: 0 },
      { cx: 2, cz: 2 },
      { cx: 0, cz: 2 },
    ]
    const coords = members.map((c) => regionCoordOf(c, regionChunks))
    for (const coord of coords) expect(coord).toEqual({ rx: 0, rz: 0 })

    const keys = new Set(members.map((c) => regionKey(c, regionChunks)))
    expect(keys.size).toBe(1)
  })

  it('puts adjacent-region chunks into different regions', () => {
    const regionChunks = 3
    expect(regionKey({ cx: 2, cz: 0 }, regionChunks)).not.toBe(regionKey({ cx: 3, cz: 0 }, regionChunks))
    expect(regionCoordOf({ cx: 3, cz: 0 }, regionChunks)).toEqual({ rx: 1, rz: 0 })
  })

  it('handles negative chunk coords consistently (floor division, not truncation)', () => {
    const regionChunks = 3
    expect(regionCoordOf({ cx: -1, cz: 0 }, regionChunks)).toEqual({ rx: -1, rz: 0 })
    expect(regionCoordOf({ cx: -3, cz: 0 }, regionChunks)).toEqual({ rx: -1, rz: 0 })
    expect(regionCoordOf({ cx: -4, cz: 0 }, regionChunks)).toEqual({ rx: -2, rz: 0 })
    expect(regionKey({ cx: -1, cz: 0 }, regionChunks)).toBe(regionKey({ cx: -3, cz: 0 }, regionChunks))
  })

  it('is deterministic', () => {
    const coord = { cx: 17, cz: -5 }
    expect(regionKey(coord, 3)).toBe(regionKey(coord, 3))
  })
})
