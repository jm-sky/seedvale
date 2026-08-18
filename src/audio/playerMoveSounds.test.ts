import { afterEach, describe, expect, it } from 'vitest'
import {
  applyFootstepPackFromUrl,
  FOOTSTEP_PACK_IDS,
  footstepUrlsFor,
  getFootstepPack,
  playJumpLand,
  setFootstepPack,
} from './playerMoveSounds'

describe('footstep packs', () => {
  afterEach(() => {
    setFootstepPack('anton')
  })

  it('defaults to anton with 7 sand/grass/stone variants', () => {
    expect(getFootstepPack()).toBe('anton')
    expect(footstepUrlsFor('sand')).toHaveLength(7)
    expect(footstepUrlsFor('grass')).toHaveLength(7)
    expect(footstepUrlsFor('stone')).toHaveLength(7)
    expect(footstepUrlsFor('sand')[0]).toBe('/sounds/footstep-sand-01.ogg')
    expect(footstepUrlsFor('dirt')).toEqual(footstepUrlsFor('sand'))
  })

  it('legacy pack keeps the previous Fantozzi/swuing files', () => {
    setFootstepPack('legacy')
    expect(footstepUrlsFor('sand')).toEqual([
      '/sounds/footstep-sand-legacy-01.ogg',
      '/sounds/footstep-sand-legacy-02.ogg',
      '/sounds/footstep-sand-legacy-03.ogg',
      '/sounds/footstep-sand-legacy-04.ogg',
      '/sounds/footstep-sand-legacy-05.ogg',
      '/sounds/footstep-sand-legacy-06.ogg',
    ])
    expect(footstepUrlsFor('dirt')[0]).toBe('/sounds/footstep-dirt-legacy-01.ogg')
  })

  it('mayra pack is a small A/B set, not a full variant pool', () => {
    setFootstepPack('mayra')
    expect(footstepUrlsFor('sand')).toEqual(['/sounds/footstep-sand-alt-mayra-01.ogg'])
    expect(footstepUrlsFor('road')).toHaveLength(2)
  })

  it('reads ?footsteps= from the query string and ignores unknowns', () => {
    expect(applyFootstepPackFromUrl('?footsteps=legacy')).toBe('legacy')
    expect(getFootstepPack()).toBe('legacy')
    expect(applyFootstepPackFromUrl('?footsteps=nope')).toBe('legacy')
    expect(applyFootstepPackFromUrl('?footsteps=mayra')).toBe('mayra')
    expect(FOOTSTEP_PACK_IDS).toContain(getFootstepPack())
  })

  it('plays a terrain-pack clip on land, not Kenney generic footsteps', () => {
    const played: string[] = []
    const playAt = (url: string) => {
      played.push(url)
    }
    for (let i = 0; i < 20; i++) {
      playJumpLand(playAt, { x: 0, z: 0 }, 'grass')
    }
    expect(played).toHaveLength(20)
    const grass = footstepUrlsFor('grass')
    for (const url of played) {
      expect(grass).toContain(url)
      expect(url).not.toMatch(/\/footstep-0\d\.ogg$/)
    }
  })
})
