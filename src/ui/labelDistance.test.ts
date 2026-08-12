import { describe, expect, it } from 'vitest'
import { barsVisibleForDistance, labelOpacityForDistance } from './labelDistance'

describe('barsVisibleForDistance (issue 017)', () => {
  it('matches LABEL_FADE_NEAR so bars hide once the name starts fading', () => {
    expect(barsVisibleForDistance(0)).toBe(true)
    expect(barsVisibleForDistance(20)).toBe(true)
    expect(barsVisibleForDistance(20.01)).toBe(false)
    expect(barsVisibleForDistance(32)).toBe(false)
    expect(labelOpacityForDistance(20)).toBe(1)
    expect(labelOpacityForDistance(20.01)).toBeLessThan(1)
  })
})
