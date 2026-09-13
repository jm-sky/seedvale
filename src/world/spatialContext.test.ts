import { describe, expect, it } from 'vitest'
import {
  caveSpatialContext,
  spatialContextsEqual,
  WORLD_SPATIAL_CONTEXT_SURFACE,
} from './spatialContext'

describe('WorldSpatialContext (plan world-027)', () => {
  it('compares surface contexts semantically, not by reference', () => {
    expect(spatialContextsEqual(WORLD_SPATIAL_CONTEXT_SURFACE, { kind: 'surface' })).toBe(true)
    expect(spatialContextsEqual({ kind: 'surface' }, { kind: 'surface' })).toBe(true)
  })

  it('requires matching caveId for cave contexts', () => {
    const a = caveSpatialContext('cave:a')
    const b = caveSpatialContext('cave:a')
    const c = caveSpatialContext('cave:b')
    expect(spatialContextsEqual(a, b)).toBe(true)
    expect(spatialContextsEqual(a, c)).toBe(false)
    expect(spatialContextsEqual(a, WORLD_SPATIAL_CONTEXT_SURFACE)).toBe(false)
  })
})
