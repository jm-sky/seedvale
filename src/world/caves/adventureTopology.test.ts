/** Plan world-terrain-020 Stage A — the `adventure` recipe's shape contract:
 *  much longer than natural, one readable junction, a guaranteed side branch
 *  with a side chamber and a deep/final chamber, all under the *unchanged*
 *  production guardrails (overburden, traversable grade, total drop,
 *  disconnected-passage clearance) plus an adventure-specific footprint
 *  budget. */

import { describe, expect, it } from 'vitest'
import type { LargeCaveSite } from '../largeCaves'
import type { CaveTopology } from './caveTopology'
import {
  ADVENTURE_FINAL_CHAMBER_NODE_ID,
  ADVENTURE_JUNCTION_NODE_ID,
  ADVENTURE_MAX_HEIGHTFIELD_CELLS,
  ADVENTURE_SIDE_CHAMBER_NODE_ID,
  buildAdventureCaveTopology,
  fitsAdventureFootprintBudget,
} from './adventureTopology'
import { estimateHeightfieldGrid } from './caveHeightfieldRepresentation'
import {
  MAX_TOTAL_DROP,
  MAX_TRAVERSABLE_FLOOR_GRADE,
  maxCenterlineFloorGrade,
  MIN_DISCONNECTED_CLEARANCE,
  minGapBetweenPaths,
} from './caveRoute'
import { mouthOverburdenRequirement } from './mouthOverburden'
import { buildProductionCaveTopology } from './productionTopology'
import { minSurfaceOverFootprint } from './terrainFootprint'
import { PROXY_MARGIN } from './topologyAdapter'

function baseSite(overrides: Partial<LargeCaveSite> = {}): LargeCaveSite {
  return { x: 200, z: -140, yaw: 0.6, length: 12, variant: 0.4, ...overrides }
}

/** Same hill fixture shape the natural suite uses: rises into the tunnel. */
function terrainAlongTunnel(site: LargeCaveSite, entranceHeight: number, riseRate: number): (x: number, z: number) => number {
  const intoDx = -Math.sin(site.yaw)
  const intoDz = -Math.cos(site.yaw)
  return (x, z) => entranceHeight + riseRate * ((x - site.x) * intoDx + (z - site.z) * intoDz)
}

function gentleHillFor(site: LargeCaveSite): (x: number, z: number) => number {
  return terrainAlongTunnel(site, 130, 0.5)
}

function adventureFor(seed: number, site: LargeCaveSite): CaveTopology | null {
  const hill = gentleHillFor(site)
  return buildAdventureCaveTopology({ seed, site, sampleHeight: hill, sampleBaseHeight: hill })
}

function naturalFor(seed: number, site: LargeCaveSite): CaveTopology | null {
  const hill = gentleHillFor(site)
  return buildProductionCaveTopology({ seed, site, sampleHeight: hill, sampleBaseHeight: hill })
}

/** Walked XZ length of the segments the player must traverse to reach `toId`
 *  from the mouth — gameplay route length, never `LargeCaveSite.length`. */
function routeLength(topology: CaveTopology, skip: (segmentId: string) => boolean = () => false): number {
  let total = 0
  for (const seg of topology.segments) {
    if (skip(seg.id)) continue
    for (let i = 1; i < seg.centerline.length; i++) {
      const a = seg.centerline[i - 1]!
      const b = seg.centerline[i]!
      total += Math.hypot(b.x - a.x, b.z - a.z)
    }
  }
  return total
}

const isSideSegment = (id: string): boolean => id.includes('side')

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

/** Worst (largest positive = violation) overburden shortfall, sampled along
 *  every segment's own terrain-adapted centerline. */
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

/** Every accepted layout across a spread of seeds/sites/orientations. */
const FIXTURES = Array.from({ length: 10 }, (_, i) => {
  const site = baseSite({ x: 200 + i * 91, z: -140 + i * 37, yaw: 0.3 + i * 0.5 })
  return { seed: 42 + i, site, topology: adventureFor(42 + i, site) }
})

describe('buildAdventureCaveTopology', () => {
  it('accepts the gentle-hill fixtures rather than rejecting the longer route wholesale', () => {
    expect(FIXTURES.every((f) => f.topology !== null)).toBe(true)
  })

  it('is deterministic for the same seed + cave identity, and independent of build order', () => {
    const site = baseSite()
    const other = baseSite({ x: -310, z: 260 })
    const first = adventureFor(7, site)
    adventureFor(7, other)
    adventureFor(11, site)
    expect(adventureFor(7, site)).toEqual(first)
    expect(first).not.toBeNull()
  })

  it('gives different sites in one world independent layouts, not clones', () => {
    const a = adventureFor(7, baseSite({ x: 200, z: -140 }))!
    const b = adventureFor(7, baseSite({ x: -310, z: 260 }))!
    const shapeOf = (t: CaveTopology): string =>
      t.nodes.map((n) => `${n.id}:${n.targetWidth.toFixed(3)}x${n.targetHeight.toFixed(3)}`).join('|')
    expect(a.caveId).not.toBe(b.caveId)
    expect(shapeOf(a)).not.toBe(shapeOf(b))
  })

  it('is reached through the archetype dispatcher', () => {
    const site = baseSite()
    const hill = gentleHillFor(site)
    expect(buildProductionCaveTopology({ seed: 42, site, sampleHeight: hill, sampleBaseHeight: hill, archetype: 'adventure' }))
      .toEqual(adventureFor(42, site))
  })

  it('has one readable junction that genuinely forks: two ways out, both walkable width', () => {
    for (const { seed, topology } of FIXTURES) {
      const junction = topology!.nodes.find((n) => n.id === ADVENTURE_JUNCTION_NODE_ID)
      expect(junction, `seed ${seed}`).toBeDefined()
      const outgoing = topology!.segments.filter((s) => s.from === ADVENTURE_JUNCTION_NODE_ID)
      expect(outgoing.map((s) => s.to).sort(), `seed ${seed}`).toEqual(['adventure-deep-passage', 'adventure-side-passage'])
      // Neither way may be a crack beside the corridor.
      const nodeById = new Map(topology!.nodes.map((n) => [n.id, n]))
      for (const seg of outgoing) {
        expect(nodeById.get(seg.to)!.targetWidth, `seed ${seed} ${seg.to}`).toBeGreaterThanOrEqual(topology!.minClearance + 1)
      }
      expect(junction!.targetWidth, `seed ${seed}`).toBeGreaterThan(6.5)
    }
  })

  it('always has the side branch, the side chamber and the deep/final chamber, addressed by stable role ids', () => {
    for (const { seed, topology } of FIXTURES) {
      const ids = new Set(topology!.nodes.map((n) => n.id))
      for (const id of ['adventure-chamber-1', 'adventure-deep-chamber', ADVENTURE_SIDE_CHAMBER_NODE_ID, ADVENTURE_FINAL_CHAMBER_NODE_ID]) {
        expect(ids.has(id), `seed ${seed} missing ${id}`).toBe(true)
      }
      // The side chamber is a dead end hung off the junction; the final
      // chamber terminates the main route.
      expect(topology!.segments.some((s) => s.from === ADVENTURE_SIDE_CHAMBER_NODE_ID), `seed ${seed}`).toBe(false)
      expect(topology!.segments.some((s) => s.from === ADVENTURE_FINAL_CHAMBER_NODE_ID), `seed ${seed}`).toBe(false)
      expect(topology!.nodes.filter((n) => n.kind === 'chamber').length, `seed ${seed}`).toBeGreaterThanOrEqual(4)
    }
  })

  it('is several sections long: roughly 3x the natural main route for the same site', () => {
    for (const { seed, site, topology } of FIXTURES) {
      const natural = naturalFor(seed, site)
      expect(natural, `seed ${seed}`).not.toBeNull()
      const naturalLength = routeLength(natural!, (id) => id === 'seg-branch')
      const adventureLength = routeLength(topology!, isSideSegment)
      expect(adventureLength / naturalLength, `seed ${seed}`).toBeGreaterThan(2.8)
      // Passages and chambers alternate over several stages, not one long tunnel.
      expect(topology!.segments.length, `seed ${seed}`).toBeGreaterThanOrEqual(10)
    }
  })

  it('folds instead of running away in one direction: the footprint stays proportionate to the route', () => {
    for (const { seed, topology } of FIXTURES) {
      const { width, depth } = boundsOf(topology!)
      const length = routeLength(topology!, isSideSegment)
      expect(Math.max(width, depth) / length, `seed ${seed}`).toBeLessThan(0.8)
      // ...and not by fanning out sideways instead.
      expect(Math.max(width, depth) / Math.min(width, depth), `seed ${seed}`).toBeLessThan(2.5)
    }
  })

  it('prices its rectangular grid before building one, and stays inside the adventure cell budget', () => {
    for (const { seed, topology } of FIXTURES) {
      const cells = estimateHeightfieldGrid(topology!).cells
      expect(fitsAdventureFootprintBudget(topology!), `seed ${seed}`).toBe(true)
      expect(cells, `seed ${seed}`).toBeLessThanOrEqual(ADVENTURE_MAX_HEIGHTFIELD_CELLS)
    }
  })

  it('rejects a layout over the budget instead of relaxing the global heightfield config', () => {
    const topology = FIXTURES[0]!.topology!
    const cells = estimateHeightfieldGrid(topology).cells
    expect(fitsAdventureFootprintBudget(topology, cells)).toBe(true)
    expect(fitsAdventureFootprintBudget(topology, cells - 1)).toBe(false)
  })

  it('keeps the traversable floor grade on every segment, side branch included', () => {
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
    // Same residual the natural suite documents: generation adapts at
    // ~1.5 m stations and leaves `STATION_SAFETY` against exactly the
    // between-station dip this denser re-check surfaces. Adventure's budget is
    // a touch larger because its chambers are reached over longer interpolated
    // segments — still far inside `MIN_OVERBURDEN`, never at zero.
    const STATION_SAFETY_TOLERANCE = 0.5
    for (const { seed, site, topology } of FIXTURES) {
      expect(worstOverburdenShortfall(topology!, gentleHillFor(site)), `seed ${seed}`)
        .toBeLessThanOrEqual(STATION_SAFETY_TOLERANCE)
    }
  })

  it('keeps the side branch clear of the main route outside the junction itself', () => {
    for (const { seed, topology } of FIXTURES) {
      const nodeById = new Map(topology!.nodes.map((n) => [n.id, n]))
      const stationsFor = (side: boolean): { x: number, z: number, radius: number }[] =>
        topology!.segments
          .filter((s) => isSideSegment(s.id) === side)
          .flatMap((s) => {
            const to = nodeById.get(s.to)!
            return s.centerline.map((p) => ({ x: p.x, z: p.z, radius: to.targetWidth / 2 }))
          })
      const junction = nodeById.get(ADVENTURE_JUNCTION_NODE_ID)!
      const gap = minGapBetweenPaths(
        stationsFor(false),
        stationsFor(true),
        junction.position,
        junction.targetWidth / 2 + 1,
      )
      expect(gap, `seed ${seed}`).toBeGreaterThanOrEqual(MIN_DISCONNECTED_CLEARANCE)
    }
  })

  it('carries a genuine 3D feature in its chambers, like every other production cave', () => {
    for (const { seed, topology } of FIXTURES) {
      expect(topology!.features.length, `seed ${seed}`).toBeGreaterThanOrEqual(1)
      const anchors = new Set(topology!.features.map((f) => f.anchorNodeId))
      expect(anchors.has(ADVENTURE_FINAL_CHAMBER_NODE_ID), `seed ${seed}`).toBe(true)
    }
  })

  it('rejects a site outright rather than forcing the long route above a collapsing surface', () => {
    const site = baseSite()
    const cliff = terrainAlongTunnel(site, 30, -3)
    const a = buildAdventureCaveTopology({ seed: 3, site, sampleHeight: cliff, sampleBaseHeight: cliff })
    const b = buildAdventureCaveTopology({ seed: 3, site, sampleHeight: cliff, sampleBaseHeight: cliff })
    expect(a).toBeNull()
    expect(b).toBeNull()
  })
})
