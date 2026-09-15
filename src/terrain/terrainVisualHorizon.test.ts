import { describe, expect, it } from 'vitest'
import { terrainVisualHorizon } from './terrainVisualHorizon'

describe('terrainVisualHorizon', () => {
  it('keeps fadeStart strictly before opaqueAt for the default config', () => {
    const horizon = terrainVisualHorizon({ chunkSize: 64, loadRadius: 3 })
    expect(horizon.fadeStart).toBeGreaterThan(0)
    expect(horizon.fadeStart).toBeLessThan(horizon.opaqueAt)
  })

  it('places opaqueAt inside the guaranteed loadRadius * chunkSize coverage', () => {
    const chunkSize = 64
    const loadRadius = 3
    const horizon = terrainVisualHorizon({ chunkSize, loadRadius })
    expect(horizon.opaqueAt).toBeLessThan(loadRadius * chunkSize)
    expect(horizon.opaqueAt).toBeGreaterThan(0)
  })

  it('scales predictably when chunkSize doubles', () => {
    const base = terrainVisualHorizon({ chunkSize: 64, loadRadius: 3 })
    const doubled = terrainVisualHorizon({ chunkSize: 128, loadRadius: 3 })
    expect(doubled.opaqueAt).toBeGreaterThan(base.opaqueAt)
    expect(doubled.fadeStart).toBeGreaterThan(base.fadeStart)
  })

  it('expands the horizon when loadRadius increases', () => {
    const small = terrainVisualHorizon({ chunkSize: 64, loadRadius: 2 })
    const large = terrainVisualHorizon({ chunkSize: 64, loadRadius: 5 })
    expect(large.opaqueAt).toBeGreaterThan(small.opaqueAt)
    expect(large.fadeStart).toBeGreaterThan(small.fadeStart)
  })

  it('is not affected by an unloadRadius-shaped extra input', () => {
    const horizon = terrainVisualHorizon({ chunkSize: 64, loadRadius: 3 })
    // @ts-expect-error — unloadRadius is intentionally not part of the contract
    const withUnload = terrainVisualHorizon({ chunkSize: 64, loadRadius: 3, unloadRadius: 999 })
    expect(withUnload).toEqual(horizon)
  })

  it('still produces a valid positive transition for a very small loadRadius', () => {
    const horizon = terrainVisualHorizon({ chunkSize: 64, loadRadius: 1 })
    expect(horizon.fadeStart).toBeGreaterThan(0)
    expect(horizon.opaqueAt).toBeGreaterThan(horizon.fadeStart)
  })
})
