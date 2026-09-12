/** Plan world-terrain-024 — the `dungeon` recipe's shape contract: larger
 *  than adventure, at least five chambers, two graph branch decisions, a
 *  side chamber and a deep/final end, all under the unchanged production
 *  guardrails plus a dungeon-specific footprint budget. */

import { describe, expect, it } from 'vitest'
import type { LargeCaveSite } from '../largeCaves'
import type { CaveTopology } from './caveTopology'
import { buildAdventureCaveTopology } from './adventureTopology'
import { estimateHeightfieldGrid } from './caveHeightfieldRepresentation'
import {
  MAX_TOTAL_DROP,
  MAX_TRAVERSABLE_FLOOR_GRADE,
  maxCenterlineFloorGrade,
  MIN_DISCONNECTED_CLEARANCE,
  minGapBetweenPaths,
} from './caveRoute'
import {
  buildDungeonCaveTopology,
  DUNGEON_CHAMBER_1_NODE_ID,
  DUNGEON_DEEP_CHAMBER_NODE_ID,
  DUNGEON_FINAL_CHAMBER_NODE_ID,
  DUNGEON_JUNCTION_1_NODE_ID,
  DUNGEON_JUNCTION_2_NODE_ID,
  DUNGEON_LAYOUT_ATTEMPTS,
  DUNGEON_MAX_HEIGHTFIELD_CELLS,
  DUNGEON_SIDE_CHAMBER_1_NODE_ID,
  DUNGEON_SIDE_CHAMBER_2_NODE_ID,
  dungeonBranchDecisionCount,
  fitsDungeonFootprintBudget,
  meetsDungeonSemanticContract,
} from './dungeonTopology'
import { mouthOverburdenRequirement } from './mouthOverburden'
import { buildProductionCaveTopology } from './productionTopology'
import { minSurfaceOverFootprint } from './terrainFootprint'
import { PROXY_MARGIN } from './topologyAdapter'

function baseSite(overrides: Partial<LargeCaveSite> = {}): LargeCaveSite {
  return { x: 420, z: -180, yaw: 0.6, length: 12, variant: 0.4, ...overrides }
}

function terrainAlongTunnel(site: LargeCaveSite, entranceHeight: number, riseRate: number): (x: number, z: number) => number {
  const intoDx = -Math.sin(site.yaw)
  const intoDz = -Math.cos(site.yaw)
  return (x, z) => entranceHeight + riseRate * ((x - site.x) * intoDx + (z - site.z) * intoDz)
}

function gentleHillFor(site: LargeCaveSite): (x: number, z: number) => number {
  return terrainAlongTunnel(site, 130, 0.5)
}

function dungeonFor(seed: number, site: LargeCaveSite): CaveTopology | null {
  const hill = gentleHillFor(site)
  return buildDungeonCaveTopology({ seed, site, sampleHeight: hill, sampleBaseHeight: hill })
}

function adventureFor(seed: number, site: LargeCaveSite): CaveTopology | null {
  const hill = gentleHillFor(site)
  return buildAdventureCaveTopology({ seed, site, sampleHeight: hill, sampleBaseHeight: hill })
}

function routeLength(topology: CaveTopology): number {
  let total = 0
  for (const seg of topology.segments) {
    for (let i = 1; i < seg.centerline.length; i++) {
      const a = seg.centerline[i - 1]!
      const b = seg.centerline[i]!
      total += Math.hypot(b.x - a.x, b.z - a.z)
    }
  }
  return total
}

function boundsOf(topology: CaveTopology): { width: number, depth: number } {
  let maxX = -Infinity, maxZ = -Infinity, minX = Infinity, minZ = Infinity
  for (const n of topology.nodes) {
    minX = Math.min(minX, n.position.x - n.targetWidth / 2)
    maxX = Math.max(maxX, n.position.x + n.targetWidth / 2)
    minZ = Math.min(minZ, n.position.z - n.targetWidth / 2)
    maxZ = Math.max(maxZ, n.position.z + n.targetWidth / 2)
  }
  return { width: maxX - minX, depth: maxZ - minZ }
}

function worstOverburdenShortfall(topology: CaveTopology, sampleBaseHeight: (x: number, z: number) => number): number {
  const nodeById = new Map(topology.nodes.map((n) => [n.id, n]))
  let worst = -Infinity
  const consider = (x: number, y: number, z: number, width: number, height: number): void => {
    const distanceFromMouth = Math.hypot(x - topology.entrance.x, z - topology.entrance.z)
    const required = mouthOverburdenRequirement(topology.entrance, distanceFromMouth, PROXY_MARGIN)
    if (required === null) return
    const radius = width / 2 + PROXY_MARGIN
    const shortfall = y + height - (minSurfaceOverFootprint(sampleBaseHeight, x, z, radius) - required)
    if (shortfall > worst) worst = shortfall
  }
  for (const seg of topology.segments) {
    const from = nodeById.get(seg.from)!
    const to = nodeById.get(seg.to)!
    const pts = seg.centerline
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!
      const b = pts[i + 1]!
      for (let s = 0; s <= 6; s++) {
        const local = s / 6
        const global = pts.length > 1 ? (i + local) / (pts.length - 1) : 0
        const drop = from.position.y - to.position.y
        const y = a.y + (b.y - a.y) * local
        const tShape = drop > 1e-6 ? Math.min(1, Math.max(0, (from.position.y - y) / drop)) : global
        const width = from.targetWidth + (to.targetWidth - from.targetWidth) * tShape
        const height = from.targetHeight + (to.targetHeight - from.targetHeight) * tShape
        consider(a.x + (b.x - a.x) * local, y, a.z + (b.z - a.z) * local, width, height)
      }
    }
  }
  for (const f of topology.features) {
    consider(f.position.x, f.position.y - f.size.height / 2, f.position.z, Math.max(f.size.width, f.size.depth), f.size.height)
  }
  return worst
}

const FIXTURES = Array.from({ length: 10 }, (_, i) => {
  const site = baseSite({ x: 420 + i * 91, z: -180 + i * 37, yaw: 0.3 + i * 0.5 })
  return { seed: 42 + i, site, topology: dungeonFor(42 + i, site) }
})

describe('buildDungeonCaveTopology', () => {
  it('accepts the gentle-hill fixtures rather than rejecting the longer route wholesale', () => {
    expect(FIXTURES.every((f) => f.topology !== null)).toBe(true)
  })

  it('is deterministic for the same seed + cave identity, and independent of build order', () => {
    const site = baseSite()
    const other = baseSite({ x: -310, z: 260 })
    const first = dungeonFor(7, site)
    dungeonFor(7, other)
    dungeonFor(11, site)
    expect(dungeonFor(7, site)).toEqual(first)
    expect(first).not.toBeNull()
  })

  it('gives different sites in one world independent layouts, not clones', () => {
    const a = dungeonFor(7, baseSite({ x: 420, z: -180 }))!
    const b = dungeonFor(7, baseSite({ x: -310, z: 260 }))!
    const shapeOf = (t: CaveTopology): string =>
      t.nodes.map((n) => `${n.id}:${n.targetWidth.toFixed(3)}x${n.targetHeight.toFixed(3)}`).join('|')
    expect(a.caveId).not.toBe(b.caveId)
    expect(shapeOf(a)).not.toBe(shapeOf(b))
  })

  it('is reached through the archetype dispatcher', () => {
    const site = baseSite()
    const hill = gentleHillFor(site)
    expect(buildProductionCaveTopology({ seed: 42, site, sampleHeight: hill, sampleBaseHeight: hill, archetype: 'dungeon' }))
      .toEqual(dungeonFor(42, site))
  })

  it('has two graph branch decisions, each a readable fork', () => {
    for (const { seed, topology } of FIXTURES) {
      expect(dungeonBranchDecisionCount(topology!), `seed ${seed}`).toBeGreaterThanOrEqual(2)
      for (const junctionId of [DUNGEON_JUNCTION_1_NODE_ID, DUNGEON_JUNCTION_2_NODE_ID]) {
        const junction = topology!.nodes.find((n) => n.id === junctionId)
        expect(junction, `seed ${seed} ${junctionId}`).toBeDefined()
        const outgoing = topology!.segments.filter((s) => s.from === junctionId)
        expect(outgoing.length, `seed ${seed} ${junctionId}`).toBe(2)
        const nodeById = new Map(topology!.nodes.map((n) => [n.id, n]))
        for (const seg of outgoing) {
          expect(nodeById.get(seg.to)!.targetWidth, `seed ${seed} ${seg.to}`).toBeGreaterThanOrEqual(topology!.minClearance + 1)
        }
        expect(junction!.targetWidth, `seed ${seed}`).toBeGreaterThan(6.5)
      }
    }
  })

  it('always has the side, deep and final chambers addressed by stable role ids', () => {
    for (const { seed, topology } of FIXTURES) {
      const ids = new Set(topology!.nodes.map((n) => n.id))
      for (const id of [
        DUNGEON_CHAMBER_1_NODE_ID,
        DUNGEON_SIDE_CHAMBER_1_NODE_ID,
        DUNGEON_SIDE_CHAMBER_2_NODE_ID,
        DUNGEON_DEEP_CHAMBER_NODE_ID,
        DUNGEON_FINAL_CHAMBER_NODE_ID,
      ]) {
        expect(ids.has(id), `seed ${seed} missing ${id}`).toBe(true)
      }
      expect(topology!.segments.some((s) => s.from === DUNGEON_SIDE_CHAMBER_1_NODE_ID), `seed ${seed}`).toBe(false)
      expect(topology!.segments.some((s) => s.from === DUNGEON_FINAL_CHAMBER_NODE_ID), `seed ${seed}`).toBe(false)
      expect(topology!.nodes.filter((n) => n.kind === 'chamber').length, `seed ${seed}`).toBeGreaterThanOrEqual(5)
      expect(topology!.nodes.filter((n) => n.kind === 'chamber').length, `seed ${seed}`).toBeLessThanOrEqual(8)
      expect(meetsDungeonSemanticContract(topology!), `seed ${seed}`).toBe(true)
    }
  })

  it('is clearly longer than the adventure baseline for the same site', () => {
    for (const { seed, site, topology } of FIXTURES) {
      const adventure = adventureFor(seed, site)
      expect(adventure, `seed ${seed}`).not.toBeNull()
      expect(routeLength(topology!) / routeLength(adventure!), `seed ${seed}`).toBeGreaterThan(1.35)
    }
  })

  it('folds instead of running away in one direction: the footprint stays proportionate to the route', () => {
    for (const { seed, topology } of FIXTURES) {
      const { width, depth } = boundsOf(topology!)
      const length = routeLength(topology!)
      expect(Math.max(width, depth) / length, `seed ${seed}`).toBeLessThan(0.85)
      expect(Math.max(width, depth) / Math.min(width, depth), `seed ${seed}`).toBeLessThan(2.8)
    }
  })

  it('prices its rectangular grid before building one, and stays inside the dungeon cell budget', () => {
    for (const { seed, topology } of FIXTURES) {
      const cells = estimateHeightfieldGrid(topology!).cells
      expect(fitsDungeonFootprintBudget(topology!), `seed ${seed}`).toBe(true)
      expect(cells, `seed ${seed}`).toBeLessThanOrEqual(DUNGEON_MAX_HEIGHTFIELD_CELLS)
    }
  })

  it('rejects a layout over the budget instead of relaxing the global heightfield config', () => {
    const topology = FIXTURES[0]!.topology!
    const cells = estimateHeightfieldGrid(topology).cells
    expect(fitsDungeonFootprintBudget(topology, cells)).toBe(true)
    expect(fitsDungeonFootprintBudget(topology, cells - 1)).toBe(false)
  })

  it('keeps the traversable floor grade on every segment, side branches included', () => {
    for (const { seed, topology } of FIXTURES) {
      for (const seg of topology!.segments) {
        expect(maxCenterlineFloorGrade(seg.centerline), `${seg.id} seed ${seed}`)
          .toBeLessThanOrEqual(MAX_TRAVERSABLE_FLOOR_GRADE + 1e-6)
      }
    }
  })

  it('spends no more than the unchanged total drop budget despite the extra length', () => {
    for (const { seed, topology } of FIXTURES) {
      const deepest = Math.min(...topology!.nodes.map((n) => n.position.y))
      expect(topology!.entrance.y - deepest, `seed ${seed}`).toBeLessThanOrEqual(MAX_TOTAL_DROP)
    }
  })

  it('keeps the required overburden over the whole footprint', () => {
    // Same residual the natural/adventure suites document: generation adapts
    // at ~1.5 m stations and leaves `STATION_SAFETY` against the denser
    // between-station re-check. Dungeon's longer interpolated segments leave
    // a slightly larger residual than adventure's 0.5 — still far inside
    // `MIN_OVERBURDEN`, never at zero.
    const STATION_SAFETY_TOLERANCE = 0.7
    for (const { seed, site, topology } of FIXTURES) {
      expect(worstOverburdenShortfall(topology!, gentleHillFor(site)), `seed ${seed}`)
        .toBeLessThanOrEqual(STATION_SAFETY_TOLERANCE)
    }
  })

  it('keeps disconnected branches clear of the main route and of each other', () => {
    for (const { seed, topology } of FIXTURES) {
      const nodeById = new Map(topology!.nodes.map((n) => [n.id, n]))
      const stationsFor = (pred: (id: string) => boolean): { x: number, z: number, radius: number }[] =>
        topology!.segments
          .filter((s) => pred(s.id))
          .flatMap((s) => {
            const to = nodeById.get(s.to)!
            return s.centerline.map((p) => ({ x: p.x, z: p.z, radius: to.targetWidth / 2 }))
          })
      const main = stationsFor((id) => !id.includes('side'))
      const side1 = stationsFor((id) => id.includes('side-passage-1') || id.includes('side-chamber-1'))
      const side2 = stationsFor((id) => id.includes('side-passage-2') || id.includes('side-chamber-2'))
      const j1 = nodeById.get(DUNGEON_JUNCTION_1_NODE_ID)!
      const j2 = nodeById.get(DUNGEON_JUNCTION_2_NODE_ID)!
      expect(minGapBetweenPaths(main, side1, j1.position, j1.targetWidth / 2 + 1), `seed ${seed} side1`)
        .toBeGreaterThanOrEqual(MIN_DISCONNECTED_CLEARANCE)
      expect(minGapBetweenPaths(main, side2, j2.position, j2.targetWidth / 2 + 1), `seed ${seed} side2`)
        .toBeGreaterThanOrEqual(MIN_DISCONNECTED_CLEARANCE)
      expect(minGapBetweenPaths(side1, side2, { x: Infinity, z: Infinity }, 0), `seed ${seed} sides`)
        .toBeGreaterThanOrEqual(MIN_DISCONNECTED_CLEARANCE)
    }
  })

  it('carries a genuine 3D feature in its chambers, like every other production cave', () => {
    for (const { seed, topology } of FIXTURES) {
      expect(topology!.features.length, `seed ${seed}`).toBeGreaterThanOrEqual(1)
      const anchors = new Set(topology!.features.map((f) => f.anchorNodeId))
      expect(anchors.has(DUNGEON_FINAL_CHAMBER_NODE_ID), `seed ${seed}`).toBe(true)
    }
  })

  it('rejects a site outright rather than forcing the long route above a collapsing surface', () => {
    const site = baseSite()
    const cliff = terrainAlongTunnel(site, 30, -3)
    const a = buildDungeonCaveTopology({ seed: 3, site, sampleHeight: cliff, sampleBaseHeight: cliff })
    const b = buildDungeonCaveTopology({ seed: 3, site, sampleHeight: cliff, sampleBaseHeight: cliff })
    expect(a).toBeNull()
    expect(b).toBeNull()
  })

  it('does not accept a layout that fails the chamber contract as a dungeon', () => {
    const adventure = adventureFor(42, baseSite())!
    expect(meetsDungeonSemanticContract(adventure)).toBe(false)
  })

  it('keeps generation attempts bounded', () => {
    expect(DUNGEON_LAYOUT_ATTEMPTS).toBeGreaterThan(0)
    expect(DUNGEON_LAYOUT_ATTEMPTS).toBeLessThanOrEqual(8)
  })
})
