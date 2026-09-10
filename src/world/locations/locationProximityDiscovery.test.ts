import { describe, expect, it } from 'vitest'
import type { CaveDefinition } from '../caveVolume'
import { createLocationKnowledge } from './locationKnowledge'
import { CAVE_ENTRANCE_DISCOVERY_RADIUS, revealCaveEntrancesInRange } from './locationProximityDiscovery'
import { emptyLocationScanDiagnostics, type WorldLocationCatalog } from './worldLocationCatalog'

function caveDef(caveId: string, x: number, z: number): CaveDefinition {
  return {
    caveId,
    entrance: { x, y: 0, z, yaw: 0, width: 2, height: 2 },
    nodes: [],
    tunnels: [],
    bounds: { minX: x, maxX: x, minY: 0, maxY: 1, minZ: z, maxZ: z },
    variant: 0,
  }
}

function fakeCatalog(names: Record<string, string>): WorldLocationCatalog {
  return {
    getById(id) {
      const name = names[id]
      if (name == null) return null
      return { id, kind: 'cave', x: 0, z: 0, name, discoveryWeight: 0 }
    },
    nearestSettlements: () => [],
    landmarksWithin: () => [],
    landmarksInRange: () => [],
    landmarksInRangeAsync: async () => [],
    invalidateScanCache: () => {},
    getScanDiagnostics: () => emptyLocationScanDiagnostics(),
  }
}

describe('revealCaveEntrancesInRange', () => {
  const caves = [caveDef('alpha', 100, 200)]
  const catalog = fakeCatalog({ 'cave:alpha': 'Grota Alpha' })

  it('confirms an unknown cave when the player is within the entrance radius', () => {
    const knowledge = createLocationKnowledge()
    const revealed = revealCaveEntrancesInRange(100, 200, caves, catalog, knowledge)
    expect(revealed).toEqual([{ id: 'cave:alpha', name: 'Grota Alpha' }])
    expect(knowledge.get('cave:alpha')).toEqual({ id: 'cave:alpha', state: 'confirmed', source: 'exploration' })
  })

  it('upgrades map/NPC discovered to confirmed', () => {
    const knowledge = createLocationKnowledge([{ id: 'cave:alpha', state: 'discovered', source: 'map' }])
    const revealed = revealCaveEntrancesInRange(100, 200, caves, catalog, knowledge)
    expect(revealed).toEqual([{ id: 'cave:alpha', name: 'Grota Alpha' }])
    expect(knowledge.get('cave:alpha')?.state).toBe('confirmed')
    expect(knowledge.get('cave:alpha')?.source).toBe('exploration')
  })

  it('is a no-op when already confirmed', () => {
    const knowledge = createLocationKnowledge([{ id: 'cave:alpha', state: 'confirmed', source: 'exploration' }])
    expect(revealCaveEntrancesInRange(100, 200, caves, catalog, knowledge)).toEqual([])
    expect(knowledge.list()).toHaveLength(1)
  })

  it('is a no-op outside the discovery radius', () => {
    const knowledge = createLocationKnowledge()
    const far = CAVE_ENTRANCE_DISCOVERY_RADIUS + 5
    expect(revealCaveEntrancesInRange(100 + far, 200, caves, catalog, knowledge)).toEqual([])
    expect(knowledge.has('cave:alpha')).toBe(false)
  })
})
