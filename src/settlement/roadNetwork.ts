import { createNoise2D } from 'simplex-noise'
import type { HomeVillageSize } from '../config/worldConfig'
import type { HeightSampler } from '../player/PlayerController'
import type {
  ClearingSegment,
  RegionalSmoothingSegment,
  RegionParams,
  RoadCorridorSegment,
} from '../terrain/chunkHeightmap'
import type { TerrainSamplers } from './settlementTerrain'
import { createSeededRandom } from '../world/parseSeed'
import { villageSizeConfig } from './families'
import { clearMinorLocationCaches, minorLocationsFor } from './minorLocations'
import {
  cellsWithinRadius,
  type SettlementCell,
  type SettlementDef,
  worldToCell,
} from './settlementGenerator'
import {
  clearSettlementDefCache,
  settlementDefFor,
  type SettlementResolveContext,
} from './settlementPlanCache'
import { pathPlansToCorridorData } from './villagePlanner'

export type RoutePoint = {
  x: number
  z: number
  /** Raw analytic terrain height at this waypoint. */
  h: number
  /** Smoothed height (moving average along the route's arc length) — what the
   *  terrain actually blends toward inside the corridor. */
  hs: number
}

export type RoadSegmentKind = 'road' | 'path'

export type RoadSegment = {
  a: RoutePoint
  b: RoutePoint
  kind: RoadSegmentKind
}

/** Everything `roadNetwork.ts` needs to resolve settlement defs / find routes,
 *  bundled so the many functions below don't each carry a dozen parameters.
 *  Main-thread only — pulls in `settlementGenerator.ts` (naming/character
 *  logic), never imported from `chunkHeightmap.worker.ts`. */
export type RoadNetworkContext = {
  seed: number
  sampleHeight: HeightSampler
  waterLevel: number
  terrainSamplers: TerrainSamplers
  heightScale: number
  region: RegionParams
  /** `findSettlementSite`'s local flat-site search radius — same value used
   *  everywhere else a `SettlementDef` gets generated (`HOME_RADIUS` in
   *  `createApp.ts`). */
  localSearchRadius: number
  /** Home village size override — must match `SettlementsManager` / world config. */
  homeSize?: HomeVillageSize
}

// Settlement defs resolve through the shared `settlementPlanCache` (plan 047
// §9.14–15) — do not keep a second authoritative layout/def cache here.
const routeCache = new Map<string, RoadSegment[] | null>()

/** Both module-level caches below are keyed by cell/id, not by seed — a new
 *  world (new seed, or GUI-driven terrain param change) must call this before
 *  any chunk generation, or stale roads/settlement defs from the previous
 *  world leak into the new one. */
export function clearRoadNetworkCaches(): void {
  clearSettlementDefCache()
  clearMinorLocationCaches()
  routeCache.clear()
}

function resolveCtx(ctx: RoadNetworkContext): SettlementResolveContext {
  return {
    seed: ctx.seed,
    sampleHeight: ctx.sampleHeight,
    waterLevel: ctx.waterLevel,
    localSearchRadius: ctx.localSearchRadius,
    terrainSamplers: ctx.terrainSamplers,
    heightScale: ctx.heightScale,
    region: ctx.region,
    homeSize: ctx.homeSize,
  }
}

function defFor(cell: SettlementCell, ctx: RoadNetworkContext): SettlementDef {
  return settlementDefFor(cell, resolveCtx(ctx))
}

/** Pick the entrance whose outward angle best faces `toward` (plan 047 §9.14).
 *  Falls back to the settlement site when no entrances exist. */
export function entranceToward(
  def: SettlementDef,
  toward: { x: number, z: number },
): { x: number, z: number } {
  const entrances = def.plan.entrances
  if (entrances.length === 0) return { x: def.x, z: def.z }
  const toTarget = Math.atan2(toward.z - def.z, toward.x - def.x)
  let best = entrances[0]!
  let bestScore = -Infinity
  for (const e of entrances) {
    const angDiff = Math.abs(Math.atan2(Math.sin(e.angle - toTarget), Math.cos(e.angle - toTarget)))
    const score = -angDiff
    if (score > bestScore) {
      bestScore = score
      best = e
    }
  }
  return { x: best.x, z: best.z }
}

/** All of a settlement's candidate neighbor settlements (by actual site
 *  distance, not grid distance — `findSettlementSite` jitters each cell's
 *  center), nearest first — the full ring-1 set (up to 8), *not* capped to
 *  `maxNeighborRoads`. Callers cap: `roadSegmentsForSettlement` walks this
 *  list trying each in turn until `maxNeighborRoads` routes actually succeed
 *  (a nearby candidate across open water/impassable terrain shouldn't leave a
 *  settlement with zero roads when a slightly farther one would connect fine).
 *  Deterministic and effectively symmetric: both sides resolve the same
 *  `SettlementDef`s from the same seed, so whichever settlement asks first,
 *  the edge (and its cached route, keyed by sorted id pair) comes out the
 *  same either way. */
export function neighborsFor(cell: SettlementCell, ctx: RoadNetworkContext): SettlementDef[] {
  const self = defFor(cell, ctx)
  return cellsWithinRadius(cell, 1)
    .filter((c) => !(c.gx === cell.gx && c.gz === cell.gz))
    .map((c) => defFor(c, ctx))
    .map((def) => ({ def, dist: Math.hypot(def.x - self.x, def.z - self.z) }))
    .sort((a, b) => a.dist - b.dist)
    .map((c) => c.def)
}

// --- Routing: coarse-grid A*, cost = distance + elevation change + a steep
// mountain-crossing penalty, rejecting only open water outright. Small,
// one-time, cached per pair — see `findRoute`'s doc comment. ---

const NEIGHBOR_OFFSETS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
] as const

/** Clearance above `waterLevel` a route needs to consider a cell dry land —
 *  water is still a hard reject (no bridges yet, see roads-and-paths plan). */
const ROUTE_WATER_CLEARANCE = 0.5
/** Mountains are *not* a hard reject — real roads cross mountains (passes,
 *  switchbacks), just at real cost. This multiplies a step's distance by
 *  `1 + weight * ridge²` (ridge ≈ 0..1, averaged over the step's endpoints),
 *  so the A* search strongly prefers routing around a ridge when a cheaper
 *  detour exists within the search grid, but will still push straight through
 *  when that's the only/shortest way to connect two settlements. */
const MOUNTAIN_COST_WEIGHT = 25

type RoutingOptions = {
  gridStep: number
  elevationWeight: number
  smoothingWindow: number
  meanderAmplitude: number
  meanderScale: number
  seed: number
}

const DEFAULT_ROUTING_OPTIONS: RoutingOptions = {
  gridStep: 9,
  elevationWeight: 6,
  smoothingWindow: 10,
  meanderAmplitude: 2,
  meanderScale: 0.04,
  seed: 0,
}

/**
 * Finds a route between two points that favors small elevation change over
 * the shortest straight line, via A* over a coarse world-space grid bounded
 * to the two points' bounding box (+ margin). Returns `null` if no walkable
 * route exists within the search grid (e.g. `b` is across open water). Pure/
 * analytic — safe to call before any chunk around the route is generated.
 */
export function findRoute(
  a: { x: number, z: number },
  b: { x: number, z: number },
  sampleHeight: HeightSampler,
  sampleMountainRidge: (x: number, z: number) => number,
  waterLevel: number,
  opts: RoutingOptions = DEFAULT_ROUTING_OPTIONS,
): RoutePoint[] | null {
  const { gridStep, elevationWeight, smoothingWindow, meanderAmplitude, meanderScale, seed } = opts
  // Wide enough that the search grid has room to route *around* a mountain
  // when that's cheaper, not just straight through it (see MOUNTAIN_COST_WEIGHT).
  const margin = gridStep * 5

  const minX = Math.min(a.x, b.x) - margin
  const minZ = Math.min(a.z, b.z) - margin
  const maxCols = Math.max(1, Math.ceil((Math.max(a.x, b.x) + margin - minX) / gridStep))
  const maxRows = Math.max(1, Math.ceil((Math.max(a.z, b.z) + margin - minZ) / gridStep))

  const toWorld = (ix: number, iz: number) => ({ x: minX + ix * gridStep, z: minZ + iz * gridStep })
  const toGrid = (x: number, z: number) => ({
    ix: Math.round((x - minX) / gridStep),
    iz: Math.round((z - minZ) / gridStep),
  })
  const key = (ix: number, iz: number) => ix * (maxRows + 1) + iz

  const heightCache = new Map<number, number>()
  const heightAt = (ix: number, iz: number): number => {
    const k = key(ix, iz)
    let h = heightCache.get(k)
    if (h === undefined) {
      const w = toWorld(ix, iz)
      h = sampleHeight(w.x, w.z)
      heightCache.set(k, h)
    }
    return h
  }
  const walkable = (ix: number, iz: number): boolean => heightAt(ix, iz) > waterLevel + ROUTE_WATER_CLEARANCE

  const ridgeCache = new Map<number, number>()
  const ridgeAt = (ix: number, iz: number): number => {
    const k = key(ix, iz)
    let r = ridgeCache.get(k)
    if (r === undefined) {
      const w = toWorld(ix, iz)
      r = sampleMountainRidge(w.x, w.z)
      ridgeCache.set(k, r)
    }
    return r
  }

  const start = toGrid(a.x, a.z)
  const goal = toGrid(b.x, b.z)
  const startKey = key(start.ix, start.iz)
  const goalKey = key(goal.ix, goal.iz)
  const dist = (ix: number, iz: number) => Math.hypot((ix - goal.ix) * gridStep, (iz - goal.iz) * gridStep)

  const gScore = new Map<number, number>([[startKey, 0]])
  const cameFrom = new Map<number, number>()
  const open = new Map<number, { ix: number, iz: number, f: number }>()
  open.set(startKey, { ix: start.ix, iz: start.iz, f: dist(start.ix, start.iz) })
  const closed = new Set<number>()

  while (open.size > 0) {
    let curKey = -1
    let cur: { ix: number, iz: number, f: number } | null = null
    for (const [k, node] of open) {
      if (!cur || node.f < cur.f) {
        cur = node
        curKey = k
      }
    }
    if (!cur) break
    if (curKey === goalKey) break
    open.delete(curKey)
    closed.add(curKey)

    for (const [dx, dz] of NEIGHBOR_OFFSETS) {
      const nix = cur.ix + dx
      const niz = cur.iz + dz
      if (nix < 0 || nix > maxCols || niz < 0 || niz > maxRows) continue
      const nKey = key(nix, niz)
      if (closed.has(nKey) || !walkable(nix, niz)) continue

      const stepDist = Math.hypot(dx * gridStep, dz * gridStep)
      const ridge = (ridgeAt(cur.ix, cur.iz) + ridgeAt(nix, niz)) * 0.5
      const cost =
        stepDist * (1 + MOUNTAIN_COST_WEIGHT * ridge * ridge) +
        elevationWeight * Math.abs(heightAt(nix, niz) - heightAt(cur.ix, cur.iz))
      const tentativeG = (gScore.get(curKey) ?? Infinity) + cost

      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, curKey)
        gScore.set(nKey, tentativeG)
        open.set(nKey, { ix: nix, iz: niz, f: tentativeG + dist(nix, niz) })
      }
    }
  }

  if (!gScore.has(goalKey)) return null

  const chain: number[] = [goalKey]
  let k = goalKey
  while (k !== startKey) {
    const prev = cameFrom.get(k)
    if (prev === undefined) return null
    chain.push(prev)
    k = prev
  }
  chain.reverse()

  const raw = chain.map((k2) => {
    const iz = k2 % (maxRows + 1)
    const ix = (k2 - iz) / (maxRows + 1)
    const w = toWorld(ix, iz)
    return { x: w.x, z: w.z, h: heightAt(ix, iz) }
  })

  const meandered = meanderRoute(raw, sampleHeight, meanderAmplitude, meanderScale, seed)
  return smoothProfile(meandered, smoothingWindow)
}

/**
 * Offsets interior waypoints perpendicular to the local path tangent so the
 * corridor centerline isn't a ruler between A* grid cells. Endpoints stay
 * fixed (settlement / dock anchors). Pure + deterministic for a given seed.
 */
export function meanderRoute(
  points: { x: number; z: number; h: number }[],
  sampleHeight: HeightSampler,
  amplitude: number,
  scale: number,
  seed: number,
): { x: number; z: number; h: number }[] {
  if (points.length < 3 || amplitude <= 0) return points
  const noise = createNoise2D(createSeededRandom(seed ^ 0xa5f3c1e9))
  return points.map((p, i) => {
    if (i === 0 || i === points.length - 1) return p
    const prev = points[i - 1]!
    const next = points[i + 1]!
    const tx = next.x - prev.x
    const tz = next.z - prev.z
    const len = Math.hypot(tx, tz) || 1
    const nx = -tz / len
    const nz = tx / len
    const n = noise(p.x * scale, p.z * scale)
    const x = p.x + nx * n * amplitude
    const z = p.z + nz * n * amplitude
    return { x, z, h: sampleHeight(x, z) }
  })
}

/** Moving-average smoothing pass over a route's raw elevation profile, by
 *  arc-length window rather than point count — robust to `gridStep` changes.
 *  `window` is a rough starting point (the user's own "10% per 10 meters"
 *  guess), meant to be tuned visually, not a precise spec. */
function smoothProfile(
  points: { x: number, z: number, h: number }[],
  window: number,
): RoutePoint[] {
  const arc: number[] = [0]
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!
    const prev = points[i - 1]!
    arc.push(arc[i - 1]! + Math.hypot(p.x - prev.x, p.z - prev.z))
  }
  const half = window / 2
  return points.map((p, i) => {
    let sum = 0
    let count = 0
    for (let j = 0; j < points.length; j++) {
      if (Math.abs(arc[j]! - arc[i]!) <= half) {
        sum += points[j]!.h
        count++
      }
    }
    return { x: p.x, z: p.z, h: p.h, hs: count > 0 ? sum / count : p.h }
  })
}

function toSegments(points: RoutePoint[], kind: RoadSegment['kind']): RoadSegment[] {
  const segments: RoadSegment[] = []
  for (let i = 0; i < points.length - 1; i++) {
    segments.push({ a: points[i]!, b: points[i + 1]!, kind })
  }
  return segments
}

/** Route cache keyed by a sorted, order-independent pair id — whichever
 *  settlement resolves an edge first, the other reuses the same result.
 *  Declared near the top of this module with `clearRoadNetworkCaches`. */
function pairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`
}

function routingOptionsFrom(ctx: RoadNetworkContext): RoutingOptions {
  const rn = ctx.region.roadNetwork
  return {
    gridStep: DEFAULT_ROUTING_OPTIONS.gridStep,
    elevationWeight: DEFAULT_ROUTING_OPTIONS.elevationWeight,
    smoothingWindow: rn.smoothingWindow,
    meanderAmplitude: rn.meanderAmplitude,
    meanderScale: rn.meanderScale,
    seed: ctx.seed,
  }
}

/** Extra AABB margin so noise-widened corridor edges aren't clipped when a
 *  segment barely touches a chunk. */
function corridorHalfWidthMargin(halfWidth: number, edgeWobbleAmplitude: number): number {
  return halfWidth * (1 + Math.max(0, edgeWobbleAmplitude)) + 2
}

/** All road (inter-settlement) + path (settlement↔own minor location)
 *  segments belonging to one settlement. Cached per pair/location key, so
 *  resolving the same settlement from multiple nearby chunks is cheap after
 *  the first A* search. */
function roadSegmentsForSettlement(def: SettlementDef, ctx: RoadNetworkContext): RoadSegment[] {
  const out: RoadSegment[] = []
  const opts = routingOptionsFrom(ctx)
  const maxRoads = Math.max(0, ctx.region.roadNetwork.maxNeighborRoads)

  // Walk candidates nearest-first, but count *successful* routes toward the
  // cap — a nearby candidate blocked by open water shouldn't leave this
  // settlement with fewer roads than a farther-but-reachable one would give.
  let connected = 0
  for (const neighbor of neighborsFor({ gx: def.gx, gz: def.gz }, ctx)) {
    if (connected >= maxRoads) break
    const key = pairKey(def.id, neighbor.id)
    let segments = routeCache.get(key)
    if (segments === undefined) {
      const points = findRoute(
        entranceToward(def, neighbor),
        entranceToward(neighbor, def),
        ctx.sampleHeight,
        ctx.terrainSamplers.sampleMountainRidge,
        ctx.waterLevel,
        opts,
      )
      segments = points ? toSegments(points, 'road') : null
      routeCache.set(key, segments)
    }
    if (segments) {
      out.push(...segments)
      connected++
    }
  }

  const locations = minorLocationsFor(
    def,
    ctx.sampleHeight,
    ctx.terrainSamplers.sampleContinentalness,
    ctx.region,
    ctx.region.roadNetwork.dockSearchRadius,
  )
  for (const loc of locations) {
    const key = `${def.id}:${loc.kind}`
    let segments = routeCache.get(key)
    if (segments === undefined) {
      const points = findRoute(
        entranceToward(def, loc),
        loc,
        ctx.sampleHeight,
        ctx.terrainSamplers.sampleMountainRidge,
        ctx.waterLevel,
        opts,
      )
      segments = points ? toSegments(points, 'path') : null
      routeCache.set(key, segments)
    }
    if (segments) out.push(...segments)
  }

  return out
}

/**
 * Three.js `rotation.y` so a prop whose long axis is local +X points toward
 * world direction `(dx, dz)`. (`atan2(dz, dx)` alone is wrong: Y-rotation maps
 * +X to `(cos θ, −sin θ)` in XZ.)
 */
export function yawToward(dx: number, dz: number): number {
  return Math.atan2(-dz, dx)
}

export type SettlementSignpost = {
  position: { x: number, z: number }
  /** Radians — Three.js `rotation.y` so the board's +X faces the target. */
  angle: number
  targetName: string
}

/** One signpost per connected neighbor road, placed just past the
 *  settlement's own footprint (`clearings.regional.radius`) so it doesn't
 *  land among houses/props. Reuses the same `routeCache` as
 *  `roadSegmentsForSettlement` — no duplicate A* search if that already ran
 *  for this def. */
export function signpostsForSettlement(def: SettlementDef, ctx: RoadNetworkContext): SettlementSignpost[] {
  const opts = routingOptionsFrom(ctx)
  const maxRoads = Math.max(0, ctx.region.roadNetwork.maxNeighborRoads)
  const minDist = def.clearings.regional.radius + 3
  const out: SettlementSignpost[] = []

  let connected = 0
  for (const neighbor of neighborsFor({ gx: def.gx, gz: def.gz }, ctx)) {
    if (connected >= maxRoads) break
    const key = pairKey(def.id, neighbor.id)
    let segments = routeCache.get(key)
    if (segments === undefined) {
      const points = findRoute(
        entranceToward(def, neighbor),
        entranceToward(neighbor, def),
        ctx.sampleHeight,
        ctx.terrainSamplers.sampleMountainRidge,
        ctx.waterLevel,
        opts,
      )
      segments = points ? toSegments(points, 'road') : null
      routeCache.set(key, segments)
    }
    if (!segments || segments.length === 0) continue
    connected++

    // routeCache is symmetric (pairKey) — whichever settlement resolved this
    // edge first becomes `a`, so orient the waypoint list to start near `def`
    // regardless of which side that was.
    const firstA = segments[0]!.a
    const lastB = segments[segments.length - 1]!.b
    const distFirst = Math.hypot(firstA.x - def.x, firstA.z - def.z)
    const distLast = Math.hypot(lastB.x - def.x, lastB.z - def.z)
    const points = distFirst <= distLast
      ? [segments[0]!.a, ...segments.map((s) => s.b)]
      : [segments[segments.length - 1]!.b, ...[...segments].reverse().map((s) => s.a)]

    let idx = points.findIndex((p) => Math.hypot(p.x - def.x, p.z - def.z) >= minDist)
    if (idx <= 0) idx = points.length - 1
    const at = points[idx]!
    const prev = points[idx - 1] ?? points[0]!
    const angle = yawToward(at.x - prev.x, at.z - prev.z)
    out.push({ position: { x: at.x, z: at.z }, angle, targetName: neighbor.name })
  }
  return out
}

export type MidpointSignpost = {
  position: { x: number, z: number }
  angle: number
  targetName: string
}

/** Two signposts roughly at the midpoint (by arc length) of the road between
 *  `def` and `neighbor`, one facing each way — `[0]` faces toward `neighbor`
 *  (labeled with `neighbor.name`), `[1]` faces back toward `def` (labeled
 *  with `def.name`), offset a bit sideways from each other so they don't
 *  clip. Doesn't belong to either settlement's own `group`/lifecycle —
 *  `SettlementsManager` owns placing/removing these (see its dedup: created
 *  once either endpoint is a known entry, removed once neither is). Returns
 *  `null` if there's no road between them (no cached/reachable route). */
export function midpointSignpostsFor(
  def: SettlementDef,
  neighbor: SettlementDef,
  ctx: RoadNetworkContext,
): [MidpointSignpost, MidpointSignpost] | null {
  const key = pairKey(def.id, neighbor.id)
  let segments = routeCache.get(key)
  if (segments === undefined) {
    const points = findRoute(
      entranceToward(def, neighbor),
      entranceToward(neighbor, def),
      ctx.sampleHeight,
      ctx.terrainSamplers.sampleMountainRidge,
      ctx.waterLevel,
      routingOptionsFrom(ctx),
    )
    segments = points ? toSegments(points, 'road') : null
    routeCache.set(key, segments)
  }
  if (!segments || segments.length === 0) return null

  const firstA = segments[0]!.a
  const lastB = segments[segments.length - 1]!.b
  const distFirst = Math.hypot(firstA.x - def.x, firstA.z - def.z)
  const distLast = Math.hypot(lastB.x - def.x, lastB.z - def.z)
  const points = distFirst <= distLast
    ? [segments[0]!.a, ...segments.map((s) => s.b)]
    : [segments[segments.length - 1]!.b, ...[...segments].reverse().map((s) => s.a)]
  if (points.length < 2) return null

  const arc: number[] = [0]
  for (let i = 1; i < points.length; i++) {
    arc.push(arc[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z))
  }
  const half = arc[arc.length - 1]! / 2
  let idx = 1
  for (let i = 1; i < arc.length; i++) {
    idx = i
    if (arc[i]! >= half) break
  }
  const at = points[idx]!
  const prev = points[idx - 1]!
  const dirX = at.x - prev.x
  const dirZ = at.z - prev.z
  const dirLen = Math.hypot(dirX, dirZ) || 1
  const nx = dirX / dirLen
  const nz = dirZ / dirLen
  // Perp + slight along-road split so the pair doesn't read as one cluttered post.
  const side = 2.4
  const along = 0.55
  const toNeighborAngle = yawToward(nx, nz)

  return [
    {
      position: { x: at.x - nz * side + nx * along, z: at.z + nx * side + nz * along },
      angle: toNeighborAngle,
      targetName: neighbor.name,
    },
    {
      position: { x: at.x + nz * side - nx * along, z: at.z - nx * side - nz * along },
      angle: yawToward(-nx, -nz),
      targetName: def.name,
    },
  ]
}

/** Resolved route (waypoints, not corridor data) from a settlement to its own
 *  minor location of `kind`, if it has one — used by `createSettlement.ts` to
 *  give NPCs real waypoints to walk instead of a straight line. Reuses the
 *  same cache as `roadSegmentsForSettlement`. */
export function routeToMinorLocation(
  def: SettlementDef,
  kind: 'dock',
  ctx: RoadNetworkContext,
): RoutePoint[] {
  const locations = minorLocationsFor(
    def,
    ctx.sampleHeight,
    ctx.terrainSamplers.sampleContinentalness,
    ctx.region,
    ctx.region.roadNetwork.dockSearchRadius,
  )
  const loc = locations.find((l) => l.kind === kind)
  if (!loc) return []

  const key = `${def.id}:${loc.kind}`
  let segments = routeCache.get(key)
  if (segments === undefined) {
    const points = findRoute(
      entranceToward(def, loc),
      loc,
      ctx.sampleHeight,
      ctx.terrainSamplers.sampleMountainRidge,
      ctx.waterLevel,
      routingOptionsFrom(ctx),
    )
    segments = points ? toSegments(points, 'path') : null
    routeCache.set(key, segments)
  }
  if (!segments || segments.length === 0) return []
  return [segments[0]!.a, ...segments.map((s) => s.b)]
}

/** Road/path corridor segments near a chunk's world-space footprint —
 *  resolves (or reuses cached) settlement/route data for the grid cells
 *  within 1 of the chunk's cell, filtered to segments whose corridor could
 *  actually reach into this chunk. Called by `chunkManager.paramsFor()`,
 *  main-thread only, once per chunk request. */
export function segmentsNear(
  worldX: number,
  worldZ: number,
  chunkSize: number,
  ctx: RoadNetworkContext,
): RoadCorridorSegment[] {
  const cell = worldToCell(worldX, worldZ)
  const half = chunkSize / 2
  const minX = worldX - half
  const maxX = worldX + half
  const minZ = worldZ - half
  const maxZ = worldZ + half

  const out: RoadCorridorSegment[] = []
  for (const c of cellsWithinRadius(cell, 1)) {
    const def = defFor(c, ctx)
    for (const seg of roadSegmentsForSettlement(def, ctx)) {
      const isRoad = seg.kind === 'road'
      const halfWidth = isRoad ? ctx.region.roadNetwork.roadHalfWidth : ctx.region.roadNetwork.pathHalfWidth
      const margin = corridorHalfWidthMargin(halfWidth, ctx.region.roadNetwork.edgeWobbleAmplitude)
      const segMinX = Math.min(seg.a.x, seg.b.x) - margin
      const segMaxX = Math.max(seg.a.x, seg.b.x) + margin
      const segMinZ = Math.min(seg.a.z, seg.b.z) - margin
      const segMaxZ = Math.max(seg.a.z, seg.b.z) + margin
      if (segMaxX < minX || segMinX > maxX || segMaxZ < minZ || segMinZ > maxZ) continue

      out.push({
        ax: seg.a.x,
        az: seg.a.z,
        ah: seg.a.hs,
        bx: seg.b.x,
        bz: seg.b.z,
        bh: seg.b.hs,
        halfWidth,
        heightStrength: isRoad ? ctx.region.roadNetwork.roadHeightStrength : ctx.region.roadNetwork.pathHeightStrength,
        tintStrength: isRoad ? ctx.region.roadNetwork.roadTintStrength : ctx.region.roadNetwork.pathTintStrength,
      })
    }
  }
  return out
}

export type VillageSegments = {
  clearings: ClearingSegment[]
  regional: RegionalSmoothingSegment[]
  /** House↔core paths — narrow, barely-reshaping corridors (same "path" tier
   *  as a settlement↔minor-location path, see `pathHalfWidth` etc. below),
   *  one straight line per family from its house to the settlement's core
   *  clearing. Meant to merge into the caller's `roadSegments`, not a
   *  separate `ChunkTileParams` field — it's the same `RoadCorridorSegment`
   *  shape and blend as everything else there. */
  paths: RoadCorridorSegment[]
}

/** Village terrain-shaping data near a chunk's world-space footprint — same
 *  "resolve nearby settlement defs, filter to what could reach this chunk"
 *  shape as `segmentsNear`, just reading `SettlementDef.clearings` (already
 *  laid out by `villageClearing.ts`'s `layoutClearings` when the def was
 *  resolved) instead of routing, plus deriving one house↔core path segment
 *  per family. One pass over `cellsWithinRadius`/`defFor` for all three
 *  (clearings/regional/paths) rather than three near-identical loops. Kept
 *  here rather than in `villageClearing.ts` itself to reuse this module's
 *  existing `defFor` cache/`RoadNetworkContext` and avoid a circular import:
 *  `villageClearing.ts` stays a pure leaf module `settlementGenerator.ts` can
 *  import without this module importing back into it. Called by
 *  `chunkManager.ts`'s `paramsFor()`, main-thread only, once per chunk request. */
export function villageSegmentsNear(
  worldX: number,
  worldZ: number,
  chunkSize: number,
  ctx: RoadNetworkContext,
): VillageSegments {
  const cell = worldToCell(worldX, worldZ)
  const half = chunkSize / 2
  const minX = worldX - half
  const maxX = worldX + half
  const minZ = worldZ - half
  const maxZ = worldZ + half
  const inBounds = (x: number, z: number, margin: number) =>
    !(x + margin < minX || x - margin > maxX || z + margin < minZ || z - margin > maxZ)

  const { heightStrength, tintStrength } = ctx.region.village
  const houseHeightStrength = Math.min(1, Math.max(heightStrength, 0.95))
  const {
    pathHalfWidth,
    pathHeightStrength,
    pathTintStrength,
    roadHalfWidth,
    roadHeightStrength,
    roadTintStrength,
    edgeWobbleAmplitude,
  } = ctx.region.roadNetwork

  const clearings: ClearingSegment[] = []
  const regional: RegionalSmoothingSegment[] = []
  const paths: RoadCorridorSegment[] = []

  for (const c of cellsWithinRadius(cell, 1)) {
    const def = defFor(c, ctx)
    const { core, houses, gardens, regional: reg } = def.clearings
    const center = def.plan.center
    const sizeCfg = villageSizeConfig(def.size)
    const fullWearR = Math.max(core.radius * 1.15, sizeCfg.houseRingMax * 0.35)
    const softWearR = Math.max(fullWearR + 4, sizeCfg.houseRingMax * 0.95)

    if (inBounds(core.x, core.z, core.radius + 2)) {
      clearings.push({
        x: core.x,
        z: core.z,
        radius: core.radius,
        targetH: core.targetH,
        heightStrength,
        tintStrength,
      })
    }
    for (const area of houses) {
      if (!inBounds(area.x, area.z, area.radius + 2)) continue
      clearings.push({
        x: area.x,
        z: area.z,
        radius: area.radius,
        targetH: area.targetH,
        heightStrength: houseHeightStrength,
        tintStrength,
      })
    }
    for (const area of gardens ?? []) {
      if (!inBounds(area.x, area.z, area.radius + 2)) continue
      clearings.push({
        x: area.x,
        z: area.z,
        radius: area.radius,
        targetH: area.targetH,
        heightStrength: houseHeightStrength,
        tintStrength,
      })
    }

    if (inBounds(reg.x, reg.z, reg.radius + 2)) {
      regional.push({ x: reg.x, z: reg.z, radius: reg.radius, targetH: reg.targetH, heightStrength: reg.heightStrength })
    }

    // Local paths come from VillagePlan (plan 047) — not a second house↔core layout.
    for (const seg of pathPlansToCorridorData(def.plan.paths, ctx.sampleHeight)) {
      const isRoad = seg.kind === 'road'
      const halfWidth = seg.halfWidth || (isRoad ? Math.min(roadHalfWidth, LOCAL_ROAD_HALF_WIDTH_CAP) : pathHalfWidth)
      const margin = corridorHalfWidthMargin(halfWidth, edgeWobbleAmplitude)
      const segMinX = Math.min(seg.ax, seg.bx) - margin
      const segMaxX = Math.max(seg.ax, seg.bx) + margin
      const segMinZ = Math.min(seg.az, seg.bz) - margin
      const segMaxZ = Math.max(seg.az, seg.bz) + margin
      if (segMaxX < minX || segMinX > maxX || segMaxZ < minZ || segMinZ > maxZ) continue

      const baseHeight = isRoad ? roadHeightStrength : Math.max(pathHeightStrength, 0.45)
      // Local footpaths used pathTint 0.4 × radial wear → center tint ~0.2 and
      // grass grew on the strip (fade ends at roadTint 0.38). Keep village
      // corridors clearly packed dirt; outer wear still softens via `wear`.
      const baseTint = isRoad ? roadTintStrength : Math.max(pathTintStrength, 0.78)
      const wear = localPathRadialWear(
        (seg.ax + seg.bx) * 0.5,
        (seg.az + seg.bz) * 0.5,
        center.x,
        center.z,
        fullWearR,
        softWearR,
      )
      paths.push({
        ax: seg.ax,
        az: seg.az,
        ah: seg.ah,
        bx: seg.bx,
        bz: seg.bz,
        bh: seg.bh,
        halfWidth,
        heightStrength: baseHeight * (0.65 + 0.35 * wear),
        tintStrength: baseTint * wear,
      })
    }
  }

  return { clearings, regional, paths }
}

/** Cap local village "road" half-width — wider than a footpath, narrower than
 *  inter-settlement highways (`roadHalfWidth` ~5). */
const LOCAL_ROAD_HALF_WIDTH_CAP = 2.8

/** Full wear near plaza; outer ring can look a bit softer but still dirt
 *  (floor ~0.72 — pathTint×0.5 previously left grass in the corridor). */
function localPathRadialWear(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  fullWearR: number,
  softWearR: number,
): number {
  const d = Math.hypot(x - centerX, z - centerZ)
  if (d <= fullWearR) return 1
  if (d >= softWearR) return 0.72
  const t = (d - fullWearR) / Math.max(1e-6, softWearR - fullWearR)
  return 1 - 0.28 * t
}
