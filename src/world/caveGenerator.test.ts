import { describe, expect, it } from 'vitest'
import { generateCaveDefinitions } from './caveGenerator'
import { createCaveVolume } from './caveVolume'

const hill = (x: number, z: number) => 80 + x * 0.55 + z * 0.1

function baseInput() {
  return {
    seed: 42,
    sampleHeight: hill,
    sampleContinentalness: () => 0.8,
    sampleMountainRidge: () => 0.1,
    waterLevel: 0,
    coastThreshold: 0.45,
    roadsNear: () => [],
    villages: [{ x: 0, z: 0, radius: 48 }],
    count: 8,
  }
}

describe('generateCaveDefinitions (plan world-terrain-007)', () => {
  it('is deterministic for the same seed', () => {
    const a = generateCaveDefinitions(baseInput())
    const b = generateCaveDefinitions(baseInput())
    expect(a).toEqual(b)
  })

  it('produces different placement for a different seed', () => {
    const a = generateCaveDefinitions(baseInput())
    const b = generateCaveDefinitions({ ...baseInput(), seed: 1337 })
    expect(a.map((c) => c.caveId)).not.toEqual(b.map((c) => c.caveId))
  })

  it('gives every cave a stable, non-index id', () => {
    const caves = generateCaveDefinitions(baseInput())
    expect(caves.length).toBeGreaterThan(0)
    for (const cave of caves) {
      expect(cave.caveId).not.toMatch(/^cave-\d+$/)
      expect(cave.caveId.startsWith('cave:')).toBe(true)
    }
    const ids = new Set(caves.map((c) => c.caveId))
    expect(ids.size).toBe(caves.length)
  })

  it('every cave has an entrance node and every tunnel references existing nodes', () => {
    const caves = generateCaveDefinitions(baseInput())
    for (const cave of caves) {
      const ids = new Set(cave.nodes.map((n) => n.id))
      expect(ids.has('mouth')).toBe(true)
      for (const tunnel of cave.tunnels) {
        expect(ids.has(tunnel.from)).toBe(true)
        expect(ids.has(tunnel.to)).toBe(true)
      }
    }
  })

  it('rejects caves whose interior would break the surface (overburden)', () => {
    // A perfectly flat, low surface leaves no room for a tunnel ceiling
    // under it anywhere except right at the mouth — every candidate site
    // should be dropped rather than poking through the ground.
    const flat = { ...baseInput(), sampleHeight: () => 6, sampleMountainRidge: () => 0.1 }
    const caves = generateCaveDefinitions(flat)
    expect(caves).toEqual([])
  })

  it('all cave geometry lies within its own bounds', () => {
    const caves = generateCaveDefinitions(baseInput())
    for (const cave of caves) {
      const volume = createCaveVolume(cave)
      const { bounds } = cave
      for (const node of cave.nodes) {
        expect(node.center.x - node.radius).toBeGreaterThanOrEqual(bounds.minX - 1e-6)
        expect(node.center.x + node.radius).toBeLessThanOrEqual(bounds.maxX + 1e-6)
        expect(node.center.z - node.radius).toBeGreaterThanOrEqual(bounds.minZ - 1e-6)
        expect(node.center.z + node.radius).toBeLessThanOrEqual(bounds.maxZ + 1e-6)
      }
      expect(volume.contains(cave.entrance.x, cave.entrance.y + 0.5, cave.entrance.z)).toBe(true)
    }
  })
})
