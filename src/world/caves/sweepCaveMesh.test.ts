import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CaveEntrance } from '../caveVolume'
import { buildSpikeTestTopology } from './spikeTestCave'
import { buildSweepCaveMesh } from './sweepCaveMesh'

function stubWindow(search: string): void {
  vi.stubGlobal('window', { location: { search } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function baseEntrance(): CaveEntrance {
  return { x: 100, y: 12.6, z: -40, yaw: 0.6, width: 3, height: 2.6 }
}

describe('buildSweepCaveMesh (plan world-terrain-008 Variant A)', () => {
  it('is deterministic: same topology + params -> identical vertex/index counts and bounds', () => {
    const topology = buildSpikeTestTopology(42, baseEntrance())
    const a = buildSweepCaveMesh(topology)
    const b = buildSweepCaveMesh(topology)
    expect(a.metrics.vertices).toBe(b.metrics.vertices)
    expect(a.metrics.triangles).toBe(b.metrics.triangles)
    expect(a.metrics.bounds).toEqual(b.metrics.bounds)
  })

  it('produces non-empty geometry with no NaN positions', () => {
    const topology = buildSpikeTestTopology(42, baseEntrance())
    const { geometry } = buildSweepCaveMesh(topology)
    const positions = geometry.getAttribute('position')
    expect(positions.count).toBeGreaterThan(0)
    for (let i = 0; i < positions.array.length; i++) {
      expect(Number.isNaN(positions.array[i])).toBe(false)
    }
  })

  it('disabling detail changes vertex positions but preserves structural bounds within tolerance', () => {
    const topology = buildSpikeTestTopology(42, baseEntrance())

    stubWindow('')
    const withDetail = buildSweepCaveMesh(topology)

    stubWindow('?debugDisableSystems=caveDetail')
    const withoutDetail = buildSweepCaveMesh(topology)

    expect(withoutDetail.metrics.detailEnabled).toBe(false)
    expect(withDetail.metrics.detailEnabled).toBe(true)

    // Same ring/vertex topology either way — only positions move.
    expect(withDetail.metrics.vertices).toBe(withoutDetail.metrics.vertices)

    const boundsTolerance = 1.0
    for (const axis of ['min', 'max'] as const) {
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(withDetail.metrics.bounds[axis][i] - withoutDetail.metrics.bounds[axis][i])).toBeLessThan(boundsTolerance)
      }
    }
  })

  it('honours the junction stress test branch without throwing and adds geometry', () => {
    const topology = buildSpikeTestTopology(42, baseEntrance(), { includeBranch: true })
    const withBranch = buildSweepCaveMesh(topology, undefined, true)
    const withoutBranch = buildSweepCaveMesh(topology, undefined, false)
    expect(withBranch.metrics.vertices).toBeGreaterThan(withoutBranch.metrics.vertices)
  })
})
