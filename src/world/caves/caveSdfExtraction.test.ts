/** Plan world-terrain-008 B4.2 — deterministic SDF extraction. */

import { describe, expect, it } from 'vitest'
import type { CaveEntrance } from '../caveVolume'
import { cavePresentationBounds, extractCaveSdfSurface } from './caveSdfExtraction'
import { buildCaveSdfRepresentation, DEFAULT_SDF_PARAMS } from './caveSdfField'
import { buildSpikeTestTopology } from './spikeTestCave'

function baseEntrance(): CaveEntrance {
  return { x: 100, y: 12.6, z: -40, yaw: 0.6, width: 3, height: 2.6 }
}

const TEST_PARAMS = { ...DEFAULT_SDF_PARAMS, cellSize: 1.0 }

describe('extractCaveSdfSurface (plan world-terrain-008 B4.2)', () => {
  it('is deterministic for identical topology and config', () => {
    const topology = buildSpikeTestTopology(42, baseEntrance())
    const field = buildCaveSdfRepresentation(topology, TEST_PARAMS, true)
    const meshBounds = cavePresentationBounds(field.bounds, topology, TEST_PARAMS)
    const a = extractCaveSdfSurface({
      topology,
      params: TEST_PARAMS,
      detailEnabled: true,
      meshBounds,
      representation: field,
    })
    const b = extractCaveSdfSurface({
      topology,
      params: TEST_PARAMS,
      detailEnabled: true,
      meshBounds,
      representation: field,
    })
    expect(a.vertices).toBe(b.vertices)
    expect(a.triangles).toBe(b.triangles)
    expect(a.positions).toEqual(b.positions)
    expect(a.indices).toEqual(b.indices)
  })

  it('rebuilding the field from topology matches a retained representation', () => {
    const topology = buildSpikeTestTopology(42, baseEntrance())
    const field = buildCaveSdfRepresentation(topology, TEST_PARAMS, true)
    const meshBounds = cavePresentationBounds(field.bounds, topology, TEST_PARAMS)
    const retained = extractCaveSdfSurface({
      topology,
      params: TEST_PARAMS,
      detailEnabled: true,
      meshBounds,
      representation: field,
    })
    const rebuilt = extractCaveSdfSurface({
      topology,
      params: TEST_PARAMS,
      detailEnabled: true,
      meshBounds,
    })
    expect(rebuilt.positions).toEqual(retained.positions)
    expect(rebuilt.indices).toEqual(retained.indices)
  })
})
