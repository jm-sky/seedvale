import { describe, expect, it } from 'vitest'
import type { CaveEntrance } from '../caveVolume'
import { buildSpikeTestTopology } from './spikeTestCave'

function baseEntrance(): CaveEntrance {
  return { x: 100, y: 12.6, z: -40, yaw: 0.6, width: 3, height: 2.6 }
}

// Fields that would only make sense to one spike (SDF cell size,
// marching-cubes resolution, sweep profile index, noise octave count, ...)
// must never leak into the shared topology — that is the one thing keeping
// the representation boundary from eroding.
const FORBIDDEN_KEYS = ['resolution', 'cellSize', 'profileIndex', 'ringStep', 'octave', 'smoothK']

function collectKeys(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const v of value) collectKeys(v, out)
    return
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k)
      collectKeys(v, out)
    }
  }
}

describe('buildSpikeTestTopology (plan world-terrain-008)', () => {
  it('is deterministic for the same seed/entrance', () => {
    const a = buildSpikeTestTopology(42, baseEntrance())
    const b = buildSpikeTestTopology(42, baseEntrance())
    expect(a).toEqual(b)
  })

  it('produces the same structure (node kinds/count) for a different seed', () => {
    const a = buildSpikeTestTopology(42, baseEntrance())
    const b = buildSpikeTestTopology(1337, baseEntrance())
    expect(a.nodes.map((n) => n.kind)).toEqual(b.nodes.map((n) => n.kind))
    expect(a.nodes.length).toBe(b.nodes.length)
    expect(a).not.toEqual(b)
  })

  it('contains an entrance node, at least one constriction/widening, a chamber, and exactly one shelf|overhang feature', () => {
    const topology = buildSpikeTestTopology(42, baseEntrance())
    expect(topology.nodes.some((n) => n.kind === 'entrance')).toBe(true)
    expect(topology.nodes.some((n) => n.kind === 'widening' || n.kind === 'constriction')).toBe(true)
    expect(topology.nodes.some((n) => n.kind === 'chamber')).toBe(true)
    expect(topology.features.length).toBe(1)
    expect(['shelf', 'overhang']).toContain(topology.features[0]!.kind)
  })

  it('every segment references existing nodes', () => {
    const topology = buildSpikeTestTopology(42, baseEntrance())
    const ids = new Set(topology.nodes.map((n) => n.id))
    for (const seg of topology.segments) {
      expect(ids.has(seg.from)).toBe(true)
      expect(ids.has(seg.to)).toBe(true)
      expect(seg.centerline.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('route length (sum of segment centerline lengths) is in the 20-30 m band', () => {
    const topology = buildSpikeTestTopology(42, baseEntrance())
    let length = 0
    for (const seg of topology.segments) {
      for (let i = 0; i < seg.centerline.length - 1; i++) {
        const a = seg.centerline[i]!
        const b = seg.centerline[i + 1]!
        length += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
      }
    }
    expect(length).toBeGreaterThanOrEqual(20)
    expect(length).toBeLessThanOrEqual(30)
  })

  it('an optional short branch can be added as a controlled junction stress test', () => {
    const withBranch = buildSpikeTestTopology(42, baseEntrance(), { includeBranch: true })
    const withoutBranch = buildSpikeTestTopology(42, baseEntrance())
    expect(withBranch.nodes.length).toBe(withoutBranch.nodes.length + 1)
    expect(withBranch.segments.length).toBe(withoutBranch.segments.length + 1)
  })

  it('contains no representation-specific keys (SDF/sweep parameters)', () => {
    const topology = buildSpikeTestTopology(42, baseEntrance())
    const keys = new Set<string>()
    collectKeys(topology, keys)
    for (const forbidden of FORBIDDEN_KEYS) {
      expect(keys.has(forbidden)).toBe(false)
    }
  })
})
