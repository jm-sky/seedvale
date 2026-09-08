import { describe, expect, it } from 'vitest'
import type { LargeCaveSite } from '../largeCaves'
import type { CaveTopology } from './caveTopology'
import { mouthOverburdenRequirement } from './mouthOverburden'
import { buildProductionCaveTopology, MIN_DISCONNECTED_CLEARANCE, minGapBetweenPaths } from './productionTopology'
import { minSurfaceOverFootprint } from './terrainFootprint'
import { PROXY_MARGIN } from './topologyAdapter'

function baseSite(overrides: Partial<LargeCaveSite> = {}): LargeCaveSite {
  return { x: 200, z: -140, yaw: 0.6, length: 12, variant: 0.4, ...overrides }
}

/** A hill whose surface height, at the site itself, is `entranceHeight`, and
 *  which rises (positive `riseRate`) or falls (negative) by `riseRate`
 *  metres per metre travelled *into* the tunnel — i.e. a real hill in the
 *  direction the cave actually goes, unlike a bare linear `(x, z)` plane
 *  (whose slope direction relative to an arbitrary `site.yaw` is easy to get
 *  backwards by accident). */
function terrainAlongTunnel(site: LargeCaveSite, entranceHeight: number, riseRate: number): (x: number, z: number) => number {
  const intoDx = -Math.sin(site.yaw)
  const intoDz = -Math.cos(site.yaw)
  return (x, z) => entranceHeight + riseRate * ((x - site.x) * intoDx + (z - site.z) * intoDz)
}

function gentleHillFor(site: LargeCaveSite): (x: number, z: number) => number {
  return terrainAlongTunnel(site, 130, 0.5)
}

const gentleHill = gentleHillFor(baseSite())
const steepSlope = terrainAlongTunnel(baseSite(), 130, -0.6)

/** Worst (largest positive = violation) shortfall between the required
 *  overburden and what the terrain actually provides, sampled densely along
 *  every segment's own (already terrain-adapted) centerline — mirrors
 *  `caveSurfaceIntegration.test.ts`'s regression pattern, generalized to an
 *  arbitrary production topology instead of one fixed spike fixture. */
function worstOverburdenShortfall(topology: CaveTopology, sampleBaseHeight: (x: number, z: number) => number): number {
  const nodeById = new Map(topology.nodes.map((n) => [n.id, n]))
  let worst = -Infinity
  const consider = (x: number, y: number, z: number, width: number, height: number): void => {
    const distanceFromMouth = Math.hypot(x - topology.entrance.x, z - topology.entrance.z)
    const required = mouthOverburdenRequirement(topology.entrance, distanceFromMouth, PROXY_MARGIN)
    if (required === null) return
    const radius = width / 2 + PROXY_MARGIN
    const allowedCeiling = minSurfaceOverFootprint(sampleBaseHeight, x, z, radius) - required
    const shortfall = y + height - allowedCeiling
    if (shortfall > worst) worst = shortfall
  }
  for (const seg of topology.segments) {
    const from = nodeById.get(seg.from)!
    const to = nodeById.get(seg.to)!
    const pts = seg.centerline
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!
      const b = pts[i + 1]!
      const steps = 6
      for (let s = 0; s <= steps; s++) {
        const local = s / steps
        const global = pts.length > 1 ? (i + local) / (pts.length - 1) : 0
        const width = from.targetWidth + (to.targetWidth - from.targetWidth) * global
        const height = from.targetHeight + (to.targetHeight - from.targetHeight) * global
        consider(a.x + (b.x - a.x) * local, a.y + (b.y - a.y) * local, a.z + (b.z - a.z) * local, width, height)
      }
    }
  }
  for (const f of topology.features) {
    consider(f.position.x, f.position.y - f.size.height / 2, f.position.z, Math.max(f.size.width, f.size.depth), f.size.height)
  }
  return worst
}

describe('buildProductionCaveTopology (plan world-terrain-008 B1)', () => {
  it('is deterministic for the same seed + cave identity', () => {
    const a = buildProductionCaveTopology({ seed: 42, site: baseSite(), sampleHeight: gentleHill, sampleBaseHeight: gentleHill })
    const b = buildProductionCaveTopology({ seed: 42, site: baseSite(), sampleHeight: gentleHill, sampleBaseHeight: gentleHill })
    expect(a).not.toBeNull()
    expect(a).toEqual(b)
  })

  it('gives different sites in the same world seed independent structural RNG, not clones', () => {
    const a = buildProductionCaveTopology({ seed: 42, site: baseSite({ x: 200, z: -140 }), sampleHeight: gentleHill, sampleBaseHeight: gentleHill })
    const b = buildProductionCaveTopology({ seed: 42, site: baseSite({ x: -310, z: 260 }), sampleHeight: gentleHill, sampleBaseHeight: gentleHill })
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(a!.caveId).not.toBe(b!.caveId)
    // Relative shape (widths/heights per node role), not just absolute
    // position, must differ — the Milestone-A bug this guards against kept
    // every cave's *local* layout identical, only translated/rotated.
    const shapeOf = (t: CaveTopology): string => t.nodes.map((n) => `${n.kind}:${n.targetWidth.toFixed(3)}x${n.targetHeight.toFixed(3)}`).join('|')
    expect(shapeOf(a!)).not.toBe(shapeOf(b!))
  })

  it('is independent of build/iteration order', () => {
    const siteA = baseSite({ x: 200, z: -140 })
    const siteB = baseSite({ x: -310, z: 260 })
    const aFirst = buildProductionCaveTopology({ seed: 7, site: siteA, sampleHeight: gentleHill, sampleBaseHeight: gentleHill })
    buildProductionCaveTopology({ seed: 7, site: siteB, sampleHeight: gentleHill, sampleBaseHeight: gentleHill })
    const aAfterB = buildProductionCaveTopology({ seed: 7, site: siteA, sampleHeight: gentleHill, sampleBaseHeight: gentleHill })
    expect(aAfterB).toEqual(aFirst)
  })

  it('keeps the required overburden over the whole footprint on gentle terrain', () => {
    const topology = buildProductionCaveTopology({ seed: 99, site: baseSite(), sampleHeight: gentleHill, sampleBaseHeight: gentleHill })
    expect(topology).not.toBeNull()
    // Generation adapts at each control/wobble station (~1.5-2 m apart), not
    // at an arbitrarily dense probe grid, and leaves `STATION_SAFETY` (0.35 m)
    // of margin against exactly the kind of between-station dip this denser
    // re-check can surface — see `productionTopology.ts`'s `adaptStation`.
    // The residual must stay within that documented margin, not hit zero.
    const STATION_SAFETY_TOLERANCE = 0.4
    expect(worstOverburdenShortfall(topology!, gentleHill)).toBeLessThanOrEqual(STATION_SAFETY_TOLERANCE)
  })

  it('produces production-scale cross-sections (wider/taller than the Milestone-A spike)', () => {
    const topology = buildProductionCaveTopology({ seed: 99, site: baseSite(), sampleHeight: gentleHill, sampleBaseHeight: gentleHill })
    expect(topology).not.toBeNull()
    const chamber = topology!.nodes.find((n) => n.kind === 'chamber' && n.id === 'chamber')!
    expect(chamber.targetWidth).toBeGreaterThanOrEqual(9)
    expect(chamber.targetWidth).toBeLessThanOrEqual(10)
    expect(chamber.targetHeight).toBeGreaterThanOrEqual(9)
    expect(chamber.targetHeight).toBeLessThanOrEqual(11)
    const passage = topology!.nodes.find((n) => n.id === 'passage')!
    expect(passage.targetWidth).toBeGreaterThanOrEqual(3.5)
    expect(passage.targetWidth).toBeLessThanOrEqual(4.5)
  })

  it('on steep terrain either adapts and still satisfies overburden, or rejects deterministically', () => {
    const a = buildProductionCaveTopology({ seed: 1, site: baseSite(), sampleHeight: steepSlope, sampleBaseHeight: steepSlope })
    const b = buildProductionCaveTopology({ seed: 1, site: baseSite(), sampleHeight: steepSlope, sampleBaseHeight: steepSlope })
    expect(a).toEqual(b)
    if (a) expect(worstOverburdenShortfall(a, steepSlope)).toBeLessThanOrEqual(0.4)
  })

  it('rejects a site outright rather than forcing geometry above a surface that drops away faster than any reasonable route can follow', () => {
    const cliff = terrainAlongTunnel(baseSite(), 30, -3)
    const topology = buildProductionCaveTopology({ seed: 3, site: baseSite(), sampleHeight: cliff, sampleBaseHeight: cliff })
    expect(topology).toBeNull()
  })

  it('sometimes produces a branch, and the branch stays well separated from the main route', () => {
    let found: CaveTopology | null = null
    for (let i = 0; i < 40 && !found; i++) {
      const topology = buildProductionCaveTopology({
        seed: 500 + i,
        site: baseSite({ x: 150 + i * 37, z: -220 + i * 53 }),
        sampleHeight: gentleHill,
        sampleBaseHeight: gentleHill,
      })
      if (topology?.nodes.some((n) => n.id === 'branch-chamber')) found = topology
    }
    expect(found).not.toBeNull()
    const branchSeg = found!.segments.find((s) => s.id === 'seg-branch')!
    expect(branchSeg.from).toBe('widening-bend')
    expect(branchSeg.to).toBe('branch-chamber')
  })
})

describe('minGapBetweenPaths (plan §9 accidental-union separation constraint)', () => {
  const junction = { x: 0, z: 0 }

  it('reports a large gap for well-separated paths', () => {
    const main = [{ x: 0, z: 0, radius: 3 }, { x: 5, z: 0, radius: 2 }, { x: 10, z: 0, radius: 2 }]
    const branch = [{ x: 0, z: 0, radius: 3 }, { x: 0, z: 20, radius: 2 }]
    const gap = minGapBetweenPaths(main, branch, junction, 4)
    expect(gap).toBeGreaterThan(MIN_DISCONNECTED_CLEARANCE)
  })

  it('reports a small/negative gap when a branch path passes close to the main route', () => {
    const main = [{ x: 0, z: 0, radius: 3 }, { x: 5, z: 0, radius: 2 }, { x: 10, z: 0, radius: 2 }]
    const branch = [{ x: 0, z: 0, radius: 3 }, { x: 10, z: 0.5, radius: 2 }]
    const gap = minGapBetweenPaths(main, branch, junction, 1)
    expect(gap).toBeLessThan(MIN_DISCONNECTED_CLEARANCE)
  })

  it('ignores proximity within the shared junction radius', () => {
    const main = [{ x: 0, z: 0, radius: 3 }]
    const branch = [{ x: 0.1, z: 0.1, radius: 3 }]
    const gap = minGapBetweenPaths(main, branch, junction, 5)
    expect(gap).toBe(Infinity)
  })
})
