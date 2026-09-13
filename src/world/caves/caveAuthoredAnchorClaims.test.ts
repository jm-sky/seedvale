import { describe, expect, it } from 'vitest'
import { CaveAuthoredAnchorClaims } from './caveAuthoredAnchorClaims'

describe('CaveAuthoredAnchorClaims', () => {
  it('claims natural story pairs atomically', () => {
    const claims = new CaveAuthoredAnchorClaims()
    expect(claims.tryClaimNaturalStoryPair('story', 'loot')).toBe(true)
    expect(claims.isClaimed('story')).toBe(true)
    expect(claims.isClaimed('loot')).toBe(true)
    expect(claims.tryClaimNaturalStoryPair('story', 'loot')).toBe(false)
    expect(claims.tryClaimAnchor('other')).toBe(true)
  })

  it('skips a later loot-only claim on an already reserved pair', () => {
    const claims = new CaveAuthoredAnchorClaims()
    expect(claims.tryClaimNaturalStoryPair('story-a', 'loot-a')).toBe(true)
    expect(claims.tryClaimAnchor('loot-a')).toBe(false)
    expect(claims.tryClaimAnchor('loot-b')).toBe(true)
  })
})
