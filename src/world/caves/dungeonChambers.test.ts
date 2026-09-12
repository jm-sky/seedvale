/** Plan world-terrain-024 — dungeon chamber identity is role-based, not
 *  `nodes[]` position, and later systems read it through the pure helper. */

import { describe, expect, it } from 'vitest'
import type { LargeCaveSite } from '../largeCaves'
import { buildAdventureCaveTopology } from './adventureTopology'
import {
  classifyDungeonChamberId,
  dungeonChambersFromTopology,
} from './dungeonChambers'
import {
  buildDungeonCaveTopology,
  DUNGEON_CHAMBER_1_NODE_ID,
  DUNGEON_CHAMBER_2_NODE_ID,
  DUNGEON_DEEP_CHAMBER_NODE_ID,
  DUNGEON_FINAL_CHAMBER_NODE_ID,
  DUNGEON_SIDE_CHAMBER_1_NODE_ID,
} from './dungeonTopology'
import { buildNaturalCaveTopology } from './productionTopology'

function baseSite(overrides: Partial<LargeCaveSite> = {}): LargeCaveSite {
  return { x: 420, z: -180, yaw: 0.6, length: 12, variant: 0.4, ...overrides }
}

function hill(site: LargeCaveSite): (x: number, z: number) => number {
  const intoDx = -Math.sin(site.yaw)
  const intoDz = -Math.cos(site.yaw)
  return (x, z) => 130 + 0.5 * ((x - site.x) * intoDx + (z - site.z) * intoDz)
}

describe('dungeonChambersFromTopology', () => {
  it('exposes stable ids and classes in topology order, never by array index', () => {
    const site = baseSite()
    const sample = hill(site)
    const topology = buildDungeonCaveTopology({ seed: 42, site, sampleHeight: sample, sampleBaseHeight: sample })!
    const chambers = dungeonChambersFromTopology(topology)
    expect(chambers.map((c) => c.nodeId)).toEqual(
      topology.nodes.filter((n) => n.kind === 'chamber').map((n) => n.id),
    )
    expect(chambers.find((c) => c.nodeId === DUNGEON_CHAMBER_1_NODE_ID)!.class).toBe('entrance-adjacent')
    expect(chambers.find((c) => c.nodeId === DUNGEON_CHAMBER_2_NODE_ID)!.class).toBe('regular')
    expect(chambers.find((c) => c.nodeId === DUNGEON_SIDE_CHAMBER_1_NODE_ID)!.class).toBe('side')
    expect(chambers.find((c) => c.nodeId === DUNGEON_DEEP_CHAMBER_NODE_ID)!.class).toBe('deep')
    expect(chambers.find((c) => c.nodeId === DUNGEON_FINAL_CHAMBER_NODE_ID)!.class).toBe('final')
    expect(classifyDungeonChamberId(DUNGEON_FINAL_CHAMBER_NODE_ID)).toBe('final')
    expect(classifyDungeonChamberId('chamber')).toBeNull()
    expect(classifyDungeonChamberId('adventure-final-chamber')).toBeNull()
  })

  it('is empty for natural and adventure topologies', () => {
    const site = baseSite({ x: 200, z: -140 })
    const sample = hill(site)
    const natural = buildNaturalCaveTopology({ seed: 21, site, sampleHeight: sample, sampleBaseHeight: sample })!
    const adventure = buildAdventureCaveTopology({ seed: 21, site, sampleHeight: sample, sampleBaseHeight: sample })!
    expect(dungeonChambersFromTopology(natural)).toEqual([])
    expect(dungeonChambersFromTopology(adventure)).toEqual([])
  })

  it('is identical for the same seed/site and frozen', () => {
    const site = baseSite()
    const sample = hill(site)
    const a = dungeonChambersFromTopology(buildDungeonCaveTopology({ seed: 9, site, sampleHeight: sample, sampleBaseHeight: sample })!)
    const b = dungeonChambersFromTopology(buildDungeonCaveTopology({ seed: 9, site, sampleHeight: sample, sampleBaseHeight: sample })!)
    expect(b).toEqual(a)
    expect(Object.isFrozen(a)).toBe(true)
  })
})
