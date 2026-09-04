import { describe, expect, it } from 'vitest'
import { createCaveVolume } from '../caveVolume'
import { buildSpikeTestTopology } from './spikeTestCave'
import { topologyToCaveDefinition } from './topologyAdapter'

describe('topologyToCaveDefinition (plan world-terrain-008 §17 L1 walkable proxy)', () => {
  it('covers the topology centerline: every sampled point is contained at floor + 1 m', () => {
    const topology = buildSpikeTestTopology(42, { x: 100, y: 12.6, z: -40, yaw: 0.6, width: 3, height: 2.6 })
    const def = topologyToCaveDefinition(topology)
    const volume = createCaveVolume(def)

    for (const seg of topology.segments) {
      for (let i = 0; i < seg.centerline.length - 1; i++) {
        const a = seg.centerline[i]!
        const b = seg.centerline[i + 1]!
        for (let s = 0; s <= 4; s++) {
          const t = s / 4
          const x = a.x + (b.x - a.x) * t
          const y = a.y + (b.y - a.y) * t
          const z = a.z + (b.z - a.z) * t
          expect(volume.contains(x, y + 1, z)).toBe(true)
        }
      }
    }
  })

  it('is deterministic for the same topology', () => {
    const topology = buildSpikeTestTopology(42, { x: 100, y: 12.6, z: -40, yaw: 0.6, width: 3, height: 2.6 })
    const a = topologyToCaveDefinition(topology)
    const b = topologyToCaveDefinition(topology)
    expect(a).toEqual(b)
  })

  it('every tunnel references existing nodes', () => {
    const topology = buildSpikeTestTopology(42, { x: 100, y: 12.6, z: -40, yaw: 0.6, width: 3, height: 2.6 })
    const def = topologyToCaveDefinition(topology)
    const ids = new Set(def.nodes.map((n) => n.id))
    for (const tunnel of def.tunnels) {
      expect(ids.has(tunnel.from)).toBe(true)
      expect(ids.has(tunnel.to)).toBe(true)
    }
  })
})
