import { describe, expect, it } from 'vitest'
import {
  WEATHER_PARTICLE_FRAGMENT_SHADER,
  weatherParticleVisibleFraction,
} from './weatherParticles'

describe('weatherParticleVisibleFraction', () => {
  it('raises density with intensity and respects the quality ceiling', () => {
    const low = weatherParticleVisibleFraction(0.2, 1)
    const high = weatherParticleVisibleFraction(1, 1)
    const capped = weatherParticleVisibleFraction(1, 0.25)
    expect(high).toBeGreaterThan(low)
    expect(capped).toBeLessThan(high)
    expect(capped).toBeGreaterThanOrEqual(0.12)
    expect(high).toBeLessThanOrEqual(1)
  })
})

describe('snow flake mask (GPU emitter contract)', () => {
  it('masks snow with a procedural gl_PointCoord flake and does not sample a texture', () => {
    expect(WEATHER_PARTICLE_FRAGMENT_SHADER).toContain('uFlakeMask')
    expect(WEATHER_PARTICLE_FRAGMENT_SHADER).toContain('gl_PointCoord')
    expect(WEATHER_PARTICLE_FRAGMENT_SHADER).toContain('atan')
    expect(WEATHER_PARTICLE_FRAGMENT_SHADER).not.toContain('sampler2D')
    expect(WEATHER_PARTICLE_FRAGMENT_SHADER).toContain('uWidthFrac')
  })
})
