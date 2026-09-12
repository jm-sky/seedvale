import { describe, expect, it } from 'vitest'
import type { LargeCaveSite } from '../world/largeCaves'
import { dungeonChambersFromTopology } from '../world/caves/dungeonChambers'
import { buildDungeonCaveTopology } from '../world/caves/dungeonTopology'
import { ANIMAL_DEFS } from './animalDefs'
import {
  buildDungeonResidentsPlan,
  dungeonResidentRoll,
} from './dungeonResidents'

function baseSite(): LargeCaveSite {
  return { x: 200, z: -140, yaw: 0.6, length: 12, variant: 0.4 }
}

function hillSample(site: LargeCaveSite): (x: number, z: number) => number {
  const intoDx = -Math.sin(site.yaw)
  const intoDz = -Math.cos(site.yaw)
  return (x, z) => 130 + 0.5 * ((x - site.x) * intoDx + (z - site.z) * intoDz)
}

function dungeonInput(seed: number) {
  const site = baseSite()
  const sample = hillSample(site)
  const topology = buildDungeonCaveTopology({ seed, site, sampleHeight: sample, sampleBaseHeight: sample })!
  return {
    caveId: topology.caveId,
    entrance: { x: topology.entrance.x, z: topology.entrance.z },
    chambers: dungeonChambersFromTopology(topology),
  }
}

describe('buildDungeonResidentsPlan (plan fauna-027)', () => {
  it('is deterministic and iteration-order independent', () => {
    const a = dungeonInput(42)
    const b = { ...dungeonInput(42) }
    const forward = buildDungeonResidentsPlan([a])
    const reversed = buildDungeonResidentsPlan([b])
    expect(forward).toEqual(reversed)
  })

  it('places at least one resident and at most chamberCount - 1', () => {
    const input = dungeonInput(7)
    const plan = buildDungeonResidentsPlan([input])
    expect(plan.decls.length).toBeGreaterThanOrEqual(1)
    expect(plan.decls.length).toBeLessThanOrEqual(input.chambers.length - 1)
  })

  it('never assigns entrance-adjacent chamber or uses unstable habitat ids', () => {
    const input = dungeonInput(11)
    const plan = buildDungeonResidentsPlan([input])
    const entranceAdjacent = input.chambers.find((c) => c.class === 'entrance-adjacent')!
    const occupiedNodeIds = plan.decls.map((d) => d.habitatId.split(':').pop()!)
    for (const decl of plan.decls) {
      expect(decl.habitatId.startsWith(`${input.caveId}:dungeon-chamber:`)).toBe(true)
      expect(occupiedNodeIds).not.toContain(entranceAdjacent.nodeId)
      expect(decl.occupantKey).toBe('resident')
    }
  })

  it('reserves exactly one eligible chamber from initial home assignment', () => {
    const input = dungeonInput(3)
    const eligible = input.chambers.filter((c) => c.class !== 'entrance-adjacent')
    const plan = buildDungeonResidentsPlan([input])
    const occupied = new Set(plan.decls.map((d) => d.habitatId.split(':').pop()))
    const unoccupiedEligible = eligible.filter((c) => !occupied.has(c.nodeId))
    expect(unoccupiedEligible.length).toBe(1)
  })

  it('includes at least one predator resident', () => {
    const plan = buildDungeonResidentsPlan([dungeonInput(99)])
    const kinds = plan.decls.map((d) => d.kind)
    expect(kinds.some((k) => ANIMAL_DEFS[k].role === 'predator')).toBe(true)
  })

  it('uses per-purpose hashed rolls that do not depend on call order', () => {
    const caveId = 'cave:test'
    const r1 = dungeonResidentRoll(caveId, 'dungeon-chamber-2', 'optional-chamber')
    const r2 = dungeonResidentRoll(caveId, 'dungeon-chamber-2', 'optional-chamber')
    expect(r1).toBe(r2)
    expect(r1).not.toBe(dungeonResidentRoll(caveId, 'dungeon-chamber-3', 'optional-chamber'))
  })
})
