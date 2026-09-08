import { describe, expect, it } from 'vitest'
import { makeCaveId } from './caveIdentity'

describe('makeCaveId (plan world-terrain-008 B1 — moved from caveGenerator.ts)', () => {
  it('is deterministic for the same seed + site coordinates', () => {
    const site = { x: 123.45, z: -67.89 }
    expect(makeCaveId(42, site)).toBe(makeCaveId(42, site))
  })

  it('matches the exact id V1 produced before the move (pinned regression)', () => {
    // Locks the bit-mixing algorithm itself — a discovered-location id must
    // never drift for an existing save/seed just because this moved modules.
    expect(makeCaveId(42, { x: 100, z: -40 })).toBe('cave:92208775')
  })

  it('differs for different sites under the same seed', () => {
    expect(makeCaveId(42, { x: 100, z: -40 })).not.toBe(makeCaveId(42, { x: 200, z: 40 }))
  })

  it('differs for different seeds at the same site', () => {
    expect(makeCaveId(42, { x: 100, z: -40 })).not.toBe(makeCaveId(1337, { x: 100, z: -40 }))
  })
})
