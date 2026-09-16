import { createNoise2D } from 'simplex-noise'
import type { HomeVillageSize } from '../config/worldConfig'
import type { HeightSampler } from '../player/PlayerController'
import type {
  ClearingSegment,
  RegionalSmoothingSegment,
  RegionParams,
  RiverChannelSegment,
  RoadCorridorSegment,
} from '../terrain/chunkHeightmap'
import type { FordProjection } from '../terrain/riverFord'
import type { RoadBridgeSpec } from '../terrain/roadBridge'
import type { RoadRiverCrossing } from './roadRiverCrossing'
import type { RoadRouteWorldgenCache } from './roadRouteWorldgenCache'
import type { TerrainSamplers } from './settlementTerrain'
import { directionFromYaw, yawToward } from '../math/segment'
import { clearCemeteryCaches } from '../terrain/cemeteryAssignment'
import { clearCemeteryPlacementCaches } from '../terrain/cemeteryPlacement'
import { createSeededRandom } from '../world/parseSeed'
import { villageSizeConfig } from './families'
import { clearMinorLocationCaches, minorLocationsFor } from './minorLocations'
import {
  crossingsForPolyline,
  evaluateRoadRiverCrossing,
  riverHitsOnEdge,
} from './roadRiverCrossing'
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
  worldRiverQuery,
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
 *  Corridor queries are data-only given this context; IndexedDB route
 *  persistence stays main-thread via `attachRoadRoutePersistence` (plan world-030). */
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

/**
 * One resolved inter-settlement road (or settlement↔minor-location path):
 * final geometry *and* the canonical road↔river crossing decisions made while
 * routing it. The route result is the single owner of crossing semantics
 * (plan world-terrain-023 §3) — terrain projects a declared `ford`, and
 * `world-terrain-033` will project a declared `bridge`, but no downstream
 * stage may decide that a crossing exists or reclassify its kind.
 *
 * Every crossing record is a real intersection of `points` with canonical
 * river water, and every such intersection has exactly one record.
 */
export type RoadRoute = {
  points: RoutePoint[]
  segments: RoadSegment[]
  kind: RoadSegmentKind
  crossings: RoadRiverCrossing[]
}

// Settlement defs resolve through the shared `settlementPlanCache` (plan 047
// §9.14–15) — do not keep a second authoritative layout/def cache here.
const routeCache = new Map<string, RoadRoute | null>()

/**
 * Optional IndexedDB adapter (plan world-terrain-029). Main thread attaches
 * it; the heightmap worker must not — it only uses in-memory `routeCache`
 * (plan world-030).
 */
let persistentRoutes: RoadRouteWorldgenCache | null = null

/**
 * Merge one hydrated persistent route into the runtime map without
 * overwriting a key this realm already computed.
 * @domain world-terrain
 */
export function ingestHydratedRoadRoute(key: string, route: RoadRoute | null): void {
  if (routeCache.has(key)) return
  routeCache.set(key, route)
}

/**
 * Bind the main-thread IndexedDB adapter. No-op to skip when running inside
 * the terrain worker.
 * @domain world-terrain
 */
export function attachRoadRoutePersistence(cache: RoadRouteWorldgenCache | null): void {
  persistentRoutes = cache
}

/**
 * Activate best-effort IndexedDB hydrate for this world identity. Route
 * consumers stay synchronous — a miss or in-flight hydrate just runs A*.
 *
 * @domain world-terrain
 * @system worldgen-cache
 */
export function activateRoadRouteWorldgenCache(seed: number, fingerprint: string): void {
  persistentRoutes?.activate(seed, fingerprint)
}

/** Test/lifecycle seam: resolves when the current activation's hydrate finishes. */
export function roadRouteWorldgenCacheReady(): Promise<void> {
  return persistentRoutes?.ready() ?? Promise.resolve()
}

/** Session lookup: `undefined` is a miss; `null` is a cached failed route. */
export function peekRoadRouteCache(key: string): RoadRoute | null | undefined {
  return routeCache.get(key)
}

/**
 * Order-independent settlement↔settlement route identity — the persistent
 * subkey and the runtime `routeCache` key.
 *
 * @domain world-terrain
 * @system worldgen-cache
 */
export function roadRoutePairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`
}

/**
 * Settlement↔minor-location route identity. V1 has a single location per
 * supported kind, so this matches the current runtime cache key.
 *
 * @domain world-terrain
 * @system worldgen-cache
 */
export function roadRouteLocationKey(settlementId: string, locationKind: string): string {
  return `${settlementId}:${locationKind}`
}

function storeRoute(key: string, route: RoadRoute | null): RoadRoute | null {
  routeCache.set(key, route)
  persistentRoutes?.remember(key, route)
  return route
}

/** In-memory settlement/road/cemetery caches for this JS realm. The terrain
 *  worker calls this on world-knowledge epoch change without touching IndexedDB.
 * @domain world-terrain
 */
export function clearRoadNetworkMemoryCaches(): void {
  clearSettlementDefCache()
  clearMinorLocationCaches()
  routeCache.clear()
  clearCemeteryCaches()
  clearCemeteryPlacementCaches()
}

/** Both module-level caches below are keyed by cell/id, not by seed — a new
 *  world (new seed, or GUI-driven terrain param change) must call this before
 *  any chunk generation, or stale roads/settlement defs from the previous
 *  world leak into the new one. Also invalidates any in-flight persistent
 *  hydrate/flush so a previous seed cannot repopulate this map. */
export function clearRoadNetworkCaches(): void {
  clearRoadNetworkMemoryCaches()
  persistentRoutes?.invalidate()
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

function defFor(cell: SettlementCell, ctx: RoadNetworkContext): SettlementDef | null {
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
 *  `maxNeighborRoads`. Callers cap: `roadRoutesForSettlement` walks this
 *  list trying each in turn until `maxNeighborRoads` routes actually succeed
 *  (a nearby candidate across open water/impassable terrain shouldn't leave a
 *  settlement with zero roads when a slightly farther one would connect fine).
 *  Deterministic and effectively symmetric: both sides resolve the same
 *  `SettlementDef`s from the same seed, so whichever settlement asks first,
 *  the edge (and its cached route, keyed by sorted id pair) comes out the
 *  same either way. */
export function neighborsFor(cell: SettlementCell, ctx: RoadNetworkContext): SettlementDef[] {
  const self = defFor(cell, ctx)
  if (!self) return []
  return cellsWithinRadius(cell, 1)
    .filter((c) => !(c.gx === cell.gx && c.gz === cell.gz))
    .map((c) => defFor(c, ctx))
    .filter((def): def is SettlementDef => def !== null)
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
 *  water is still a hard reject. This is the *lake/ocean* gate: a node whose
 *  terrain sits at or below the sea is never road. Rivers are handled
 *  separately and analytically (`roadRiverCrossing.ts`) — their carved channel
 *  is often above this level, so elevation alone can never see them. */
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

/** Everything a single route search needs beyond its two endpoints. */
export type RouteSearchOptions = RoutingOptions & {
  sampleHeight: HeightSampler
  sampleMountainRidge: (x: number, z: number) => number
  waterLevel: number
  /** Canonical river geometry covering the whole search envelope, queried
   *  **once** by the caller (`riverSegmentsForEnvelope`) — never re-queried
   *  per neighbor expansion. Empty means river-agnostic routing, exactly the
   *  pre-world-terrain-023 behaviour. */
  riverSegments: readonly RiverChannelSegment[]
  /** Infrastructure policy: a `road` may ford or bridge, a `path` is ford-only
   *  (plan §12) — a bridge-required edge is rejected so the path detours. */
  routeKind: RoadSegmentKind
  /** Stable route identity; canonical crossing ids derive from it. */
  routeId: string
}

/**
 * Finds a route between two points that favors small elevation change over
 * the shortest straight line, via A* over a coarse world-space grid bounded
 * to the two points' bounding box (+ margin). Returns `null` if no walkable
 * route exists within the search grid (e.g. `b` is across open water, or every
 * remaining way across a river needs infrastructure this route kind may not
 * build). Pure/analytic — safe to call before any chunk around the route is
 * generated.
 *
 * River awareness is **edge**-based (plan §5): every candidate A* step is
 * tested against the canonical river water footprint, so a 9 m step can never
 * leap a 3 m stream unnoticed just because both its endpoints are dry. A
 * crossing step is priced through the one canonical evaluator
 * (`roadRiverCrossing.ts`) — a cheap ford, an expensive bridge, or a hard
 * reject — so a decent ford a few hundred metres away naturally beats an
 * unnecessary bridge.
 *
 * @domain world-terrain
 */
export function findRoute(
  a: { x: number, z: number },
  b: { x: number, z: number },
  opts: RouteSearchOptions,
): RoadRoute | null {
  const {
    gridStep,
    elevationWeight,
    smoothingWindow,
    meanderAmplitude,
    meanderScale,
    seed,
    sampleHeight,
    sampleMountainRidge,
    waterLevel,
    riverSegments,
    routeKind,
    routeId,
  } = opts
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

  // Undirected edge cache: a neighbour expansion re-reaches the same step from
  // both sides, and crossing evaluation is the only non-trivial part of an
  // edge's cost. Keyed on the sorted node-key pair.
  const edgeSpan = (maxCols + 1) * (maxRows + 1) + 1
  const crossingCostCache = new Map<number, number | null>()
  /** Deterministic infrastructure cost of the river crossings on one A* step,
   *  or `null` when the step needs a crossing this route kind cannot build. */
  const crossingCost = (k1: number, k2: number, ax: number, az: number, bx: number, bz: number): number | null => {
    if (riverSegments.length === 0) return 0
    const ek = k1 < k2 ? k1 * edgeSpan + k2 : k2 * edgeSpan + k1
    const cached = crossingCostCache.get(ek)
    if (cached !== undefined) return cached
    let total = 0
    for (const hit of riverHitsOnEdge(ax, az, bx, bz, riverSegments)) {
      const verdict = evaluateRoadRiverCrossing(hit.facts, routeKind)
      if (verdict.kind === 'reject') {
        crossingCostCache.set(ek, null)
        return null
      }
      total += verdict.cost
    }
    crossingCostCache.set(ek, total)
    return total
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

      const from = toWorld(cur.ix, cur.iz)
      const to = toWorld(nix, niz)
      const infrastructure = crossingCost(curKey, nKey, from.x, from.z, to.x, to.z)
      if (infrastructure === null) continue

      const stepDist = Math.hypot(dx * gridStep, dz * gridStep)
      const ridge = (ridgeAt(cur.ix, cur.iz) + ridgeAt(nix, niz)) * 0.5
      const cost =
        stepDist * (1 + MOUNTAIN_COST_WEIGHT * ridge * ridge) +
        elevationWeight * Math.abs(heightAt(nix, niz) - heightAt(cur.ix, cur.iz)) +
        infrastructure
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

  // Materialize the exact crossing points A* priced into the geometry itself,
  // and lock them (plus their immediate approaches) against lateral meander —
  // otherwise meander could slide the polyline off the crossing it paid for,
  // or through a river it never evaluated (plan §7).
  const anchored = withCrossingAnchors(raw, riverSegments, sampleHeight)
  const planned = crossingsForPolyline(anchored.points, riverSegments, routeKind, routeId)
  if (!planned) return null

  const meandered = meanderRoute(
    anchored.points,
    sampleHeight,
    meanderAmplitude,
    meanderScale,
    seed,
    anchored.locked,
  )
  let finalPoints = meandered
  let crossings = crossingsForPolyline(meandered, riverSegments, routeKind, routeId)
  if (!crossings || !sameCrossingTopology(crossings, planned)) {
    // Meander changed the route's river topology. Deterministically fall back
    // to the anchor-exact geometry rather than shipping a road whose crossing
    // records no longer describe it — "the meander is only a few metres" is
    // not an argument at stream/bank scale.
    finalPoints = anchored.points
    crossings = planned
  }

  const points = smoothProfile(finalPoints, smoothingWindow)
  return { points, segments: toSegments(points, routeKind), kind: routeKind, crossings }
}

/** Distance (m) under which a resolved crossing point is considered to already
 *  be a route waypoint rather than a new anchor to insert. */
const CROSSING_ANCHOR_EPSILON = 0.5

/** Inserts the exact road×river intersection points into an A* chain and
 *  reports which indices must not be meandered laterally (the anchors plus
 *  their immediate approach points). */
function withCrossingAnchors(
  points: readonly { x: number, z: number, h: number }[],
  riverSegments: readonly RiverChannelSegment[],
  sampleHeight: HeightSampler,
): { points: { x: number, z: number, h: number }[], locked: Set<number> } {
  if (riverSegments.length === 0 || points.length < 2) {
    return { points: [...points], locked: new Set() }
  }

  const out: { x: number, z: number, h: number }[] = []
  const anchors: { x: number, z: number }[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    out.push(a)
    for (const hit of riverHitsOnEdge(a.x, a.z, b.x, b.z, riverSegments)) {
      const { x, z } = hit.facts
      anchors.push({ x, z })
      const prev = out[out.length - 1]!
      if (Math.hypot(x - prev.x, z - prev.z) < CROSSING_ANCHOR_EPSILON) continue
      if (Math.hypot(x - b.x, z - b.z) < CROSSING_ANCHOR_EPSILON) continue
      out.push({ x, z, h: sampleHeight(x, z) })
    }
  }
  out.push(points[points.length - 1]!)

  // Lock by proximity rather than by insertion index: an anchor that collapsed
  // onto an existing waypoint still has to hold that waypoint in place.
  const locked = new Set<number>()
  for (const anchor of anchors) {
    let bestIdx = 0
    let bestDist = Infinity
    for (let i = 0; i < out.length; i++) {
      const d = Math.hypot(out[i]!.x - anchor.x, out[i]!.z - anchor.z)
      if (d < bestDist) {
        bestDist = d
        bestIdx = i
      }
    }
    locked.add(bestIdx)
    locked.add(bestIdx - 1)
    locked.add(bestIdx + 1)
  }
  return { points: out, locked }
}

/** Same number of crossings, in the same order, with the same kinds — the
 *  bijection the acceptance invariant asks for, checked against the finished
 *  polyline rather than assumed from the A* chain. */
function sameCrossingTopology(
  a: readonly RoadRiverCrossing[],
  b: readonly RoadRiverCrossing[],
): boolean {
  if (a.length !== b.length) return false
  return a.every((crossing, i) => crossing.kind === b[i]!.kind)
}

/**
 * Offsets interior waypoints perpendicular to the local path tangent so the
 * corridor centerline isn't a ruler between A* grid cells. Endpoints stay
 * fixed (settlement / dock anchors). Pure + deterministic for a given seed.
 *
 * `locked` holds indices that must keep their exact X/Z — canonical river
 * crossing anchors and their immediate approach points (plan
 * world-terrain-023 §7), so post-processing can never slide the road off the
 * crossing the route actually declared.
 */
export function meanderRoute(
  points: { x: number; z: number; h: number }[],
  sampleHeight: HeightSampler,
  amplitude: number,
  scale: number,
  seed: number,
  locked?: ReadonlySet<number>,
): { x: number; z: number; h: number }[] {
  if (points.length < 3 || amplitude <= 0) return points
  const noise = createNoise2D(createSeededRandom(seed ^ 0xa5f3c1e9))
  return points.map((p, i) => {
    if (i === 0 || i === points.length - 1) return p
    if (locked?.has(i)) return p
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
  return roadRoutePairKey(idA, idB)
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

/** Slack added to the A* search envelope when querying hydrology, so a channel
 *  whose carve reach just laps into the envelope is still seen. */
const RIVER_ENVELOPE_PADDING = 64

/** Canonical river geometry for one whole route search, queried **once** from
 *  the world-scoped analytical `RiverQuery` (plan §4/§15). Reading the single
 *  registration in `settlementPlanCache.ts` — rather than a per-context field —
 *  is what guarantees `ChunkManager`'s and `SettlementsManager`'s road contexts
 *  resolve the shared route cache against identical hydrology whichever asks
 *  first. Empty when no world query is registered (unit tests, hydrology-less
 *  callers): routing then behaves exactly as it did before this plan. */
function riverSegmentsForEnvelope(
  a: { x: number, z: number },
  b: { x: number, z: number },
  gridStep: number,
): RiverChannelSegment[] {
  const query = worldRiverQuery()
  if (!query) return []
  const margin = gridStep * 5
  const size =
    Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z)) + margin * 2 + RIVER_ENVELOPE_PADDING
  return query.segmentsNear((a.x + b.x) * 0.5, (a.z + b.z) * 0.5, size)
}

function searchOptionsFor(
  a: { x: number, z: number },
  b: { x: number, z: number },
  ctx: RoadNetworkContext,
  routeKind: RoadSegmentKind,
  routeId: string,
): RouteSearchOptions {
  const routing = routingOptionsFrom(ctx)
  return {
    ...routing,
    sampleHeight: ctx.sampleHeight,
    sampleMountainRidge: ctx.terrainSamplers.sampleMountainRidge,
    waterLevel: ctx.waterLevel,
    riverSegments: riverSegmentsForEnvelope(a, b, routing.gridStep),
    routeKind,
    routeId,
  }
}

/** The inter-settlement road between two settlements, resolved once and shared
 *  by roads, signposts and midpoint signposts.
 *
 *  Computed in a **canonical endpoint orientation** (sorted settlement id
 *  first): the route cache is order-independent by `pairKey`, so without this
 *  the A* direction — and therefore the geometry and crossing ids — would
 *  depend on which settlement happened to resolve the edge first. Consumers
 *  already orient the returned waypoints themselves by endpoint distance. */
function routeBetween(
  def: SettlementDef,
  neighbor: SettlementDef,
  ctx: RoadNetworkContext,
): RoadRoute | null {
  const key = pairKey(def.id, neighbor.id)
  const cached = routeCache.get(key)
  if (cached !== undefined) return cached

  const [first, second] = def.id < neighbor.id ? [def, neighbor] : [neighbor, def]
  const from = entranceToward(first, second)
  const to = entranceToward(second, first)
  const route = findRoute(from, to, searchOptionsFor(from, to, ctx, 'road', key))
  return storeRoute(key, route)
}

/** The settlement→minor-location path, resolved once and shared by path
 *  corridors and NPC waypoint lookups. `path` is ford-only in V1 (plan §12) —
 *  a crossing that would need a bridge rejects the edge, so the path detours
 *  to a safe ford or simply doesn't exist. */
function routeToLocation(
  def: SettlementDef,
  loc: { x: number, z: number, kind: string },
  ctx: RoadNetworkContext,
): RoadRoute | null {
  const key = roadRouteLocationKey(def.id, loc.kind)
  const cached = routeCache.get(key)
  if (cached !== undefined) return cached

  const from = entranceToward(def, loc)
  const route = findRoute(from, loc, searchOptionsFor(from, loc, ctx, 'path', key))
  return storeRoute(key, route)
}

/** Waypoints of a cached route oriented to start near `def` — `routeCache` is
 *  symmetric, so the stored orientation follows the canonical id order rather
 *  than the asking settlement. */
function orientedFrom(route: RoadRoute, def: { x: number, z: number }): RoutePoint[] {
  const { segments } = route
  const firstA = segments[0]!.a
  const lastB = segments[segments.length - 1]!.b
  const distFirst = Math.hypot(firstA.x - def.x, firstA.z - def.z)
  const distLast = Math.hypot(lastB.x - def.x, lastB.z - def.z)
  return distFirst <= distLast
    ? [segments[0]!.a, ...segments.map((s) => s.b)]
    : [segments[segments.length - 1]!.b, ...[...segments].reverse().map((s) => s.a)]
}

/** All road (inter-settlement) + path (settlement↔own minor location) routes
 *  belonging to one settlement, carrying geometry *and* their canonical river
 *  crossings. Cached per pair/location key, so resolving the same settlement
 *  from multiple nearby chunks is cheap after the first A* search. */
function roadRoutesForSettlement(def: SettlementDef, ctx: RoadNetworkContext): RoadRoute[] {
  const out: RoadRoute[] = []
  const maxRoads = Math.max(0, ctx.region.roadNetwork.maxNeighborRoads)

  // Walk candidates nearest-first, but count *successful* routes toward the
  // cap — a nearby candidate blocked by open water shouldn't leave this
  // settlement with fewer roads than a farther-but-reachable one would give.
  let connected = 0
  for (const neighbor of neighborsFor({ gx: def.gx, gz: def.gz }, ctx)) {
    if (connected >= maxRoads) break
    const route = routeBetween(def, neighbor, ctx)
    if (route) {
      out.push(route)
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
    const route = routeToLocation(def, loc, ctx)
    if (route) out.push(route)
  }

  return out
}

// Lives in `math/segment.ts` so `roadRiverCrossing.ts` can use the same
// convention without importing back into the road graph; re-exported here for
// this module's existing consumers.
export { yawToward }

export type SettlementSignpost = {
  position: { x: number, z: number }
  /** Radians — Three.js `rotation.y` so the board's +X faces the target. */
  angle: number
  targetName: string
}

/** One signpost per connected neighbor road, placed just past the
 *  settlement's own footprint (`clearings.regional.radius`) so it doesn't
 *  land among houses/props. Reuses the same `routeCache` as
 *  `roadRoutesForSettlement` — no duplicate A* search if that already ran
 *  for this def. */
export function signpostsForSettlement(def: SettlementDef, ctx: RoadNetworkContext): SettlementSignpost[] {
  const maxRoads = Math.max(0, ctx.region.roadNetwork.maxNeighborRoads)
  const minDist = def.clearings.regional.radius + 3
  const out: SettlementSignpost[] = []

  let connected = 0
  for (const neighbor of neighborsFor({ gx: def.gx, gz: def.gz }, ctx)) {
    if (connected >= maxRoads) break
    const route = routeBetween(def, neighbor, ctx)
    if (!route || route.segments.length === 0) continue
    connected++

    const points = orientedFrom(route, def)
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
  const route = routeBetween(def, neighbor, ctx)
  if (!route || route.segments.length === 0) return null

  const points = orientedFrom(route, def)
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
 *  same cache as `roadRoutesForSettlement`. */
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

  const route = routeToLocation(def, loc, ctx)
  if (!route || route.segments.length === 0) return []
  return [route.segments[0]!.a, ...route.segments.map((s) => s.b)]
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
    if (!def) continue
    for (const seg of roadRoutesForSettlement(def, ctx).flatMap((route) => route.segments)) {
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

/** Approach length (m) added either side of a crossing's channel span, so the
 *  ford's raised bar ties into dry road instead of ending at the bank. */
const FORD_APPROACH_MARGIN = 2

function fordProjectionOf(
  crossing: RoadRiverCrossing,
  kind: RoadSegmentKind,
  rn: RegionParams['roadNetwork'],
): FordProjection {
  const dir = directionFromYaw(crossing.angle)
  const halfWidth = (kind === 'road' ? rn.roadHalfWidth : rn.pathHalfWidth)
    * (1 + Math.max(0, rn.edgeWobbleAmplitude))
  return {
    x: crossing.x,
    z: crossing.z,
    dirX: dir.x,
    dirZ: dir.z,
    halfLength: crossing.span * 0.5 + FORD_APPROACH_MARGIN,
    halfWidth,
  }
}

/**
 * Declared ford crossings whose shaping footprint reaches a world-space box —
 * the crossing counterpart to `segmentsNear`, resolved from the exact same
 * cached routes, so terrain can only ever shape a ford the route itself
 * declared. Bridges are deliberately *not* projected here: their runtime
 * projection is `world-terrain-033`'s, and until then a canonical `bridge`
 * record simply has no terrain effect.
 *
 * Called by `chunkManager.paramsFor()` (chunk terrain) and its local-water
 * sampling wiring, main-thread only.
 *
 * @domain world-terrain
 */
export function fordsNear(
  worldX: number,
  worldZ: number,
  size: number,
  ctx: RoadNetworkContext,
): FordProjection[] {
  const cell = worldToCell(worldX, worldZ)
  const half = size / 2
  const minX = worldX - half
  const maxX = worldX + half
  const minZ = worldZ - half
  const maxZ = worldZ + half

  const out: FordProjection[] = []
  for (const c of cellsWithinRadius(cell, 1)) {
    const def = defFor(c, ctx)
    if (!def) continue
    for (const route of roadRoutesForSettlement(def, ctx)) {
      for (const crossing of route.crossings) {
        if (crossing.kind !== 'ford') continue
        const ford = fordProjectionOf(crossing, route.kind, ctx.region.roadNetwork)
        const reach = Math.max(ford.halfLength, ford.halfWidth)
        if (ford.x + reach < minX || ford.x - reach > maxX) continue
        if (ford.z + reach < minZ || ford.z - reach > maxZ) continue
        out.push(ford)
      }
    }
  }
  return out
}

/** Bank/abutment clearance (m) added either side of a bridge's channel span —
 *  mirrors `FORD_APPROACH_MARGIN`, just larger: a bridge deck needs real
 *  abutments on dry ground, not just a raised bar tying into the road. */
const BRIDGE_APPROACH_MARGIN = 3
/** Minimum clearance (m) the deck keeps above the canonical water surface,
 *  applied only when the route's own smoothed profile doesn't already clear
 *  it — an ordinary crossing keeps the real road profile untouched. */
const BRIDGE_WATER_CLEARANCE = 0.6
/** Visual deck slab thickness (m) — presentation-only; `riverFord.ts` has no
 *  equivalent since a ford has no deck to draw. */
const BRIDGE_DECK_THICKNESS = 0.3

/** Smoothed route-profile height at the route point nearest `(x, z)` — the
 *  crossing anchor is inserted into the final polyline by `world-terrain-023`,
 *  so the nearest point is the crossing itself (or immediately adjacent on a
 *  very short edge). Reading the already-built profile instead of re-sampling
 *  terrain/water avoids a renderer-time `sampleHeight()` feedback loop, since
 *  chunk terrain shaping itself depends on the bridge mask. */
function routeProfileHeightAt(route: RoadRoute, x: number, z: number): number {
  let best: RoutePoint | undefined
  let bestDistSq = Infinity
  for (const p of route.points) {
    const dx = p.x - x
    const dz = p.z - z
    const distSq = dx * dx + dz * dz
    if (distSq < bestDistSq) {
      bestDistSq = distSq
      best = p
    }
  }
  return best?.hs ?? 0
}

/** Canonical bridge crossing + final route profile -> deterministic
 *  presentation-free deck spec (plan world-terrain-033 §4). `span` reuses the
 *  crossing's own road-aligned span (obliqueness already folded in by
 *  `roadRiverCrossing.ts`) plus bank clearance; `deckY` prefers the real road
 *  profile and only lifts toward `waterH` when that profile would otherwise
 *  sit too low. */
export function bridgeSpecOf(
  crossing: RoadRiverCrossing,
  route: RoadRoute,
  rn: RegionParams['roadNetwork'],
): RoadBridgeSpec {
  const dir = directionFromYaw(crossing.angle)
  const halfWidth = (route.kind === 'road' ? rn.roadHalfWidth : rn.pathHalfWidth)
    * (1 + Math.max(0, rn.edgeWobbleAmplitude))
  const profileH = routeProfileHeightAt(route, crossing.x, crossing.z)
  const deckY = Math.max(profileH, crossing.waterH + BRIDGE_WATER_CLEARANCE)
  return {
    id: crossing.id,
    x: crossing.x,
    z: crossing.z,
    yaw: crossing.angle,
    dirX: dir.x,
    dirZ: dir.z,
    span: crossing.span + BRIDGE_APPROACH_MARGIN * 2,
    width: halfWidth * 2,
    deckY,
    deckThickness: BRIDGE_DECK_THICKNESS,
  }
}

/**
 * Declared bridge crossings whose deck footprint reaches a world-space box —
 * the bridge counterpart to `fordsNear`, resolved from the exact same cached
 * routes so a rendered bridge always traces back to one canonical
 * `RoadRiverCrossing(kind = 'bridge')`. Unlike `fordsNear` (pure shaping
 * influence, order/duplication-tolerant), this is runtime *identity*: results
 * are deduped by `RoadBridgeSpec.id` — the same inter-settlement route is
 * discoverable while iterating nearby settlement cells from both endpoints —
 * and returned in stable `id` order so no caller ever sees a different
 * instance for the same bridge depending on query origin. A bridge spanning a
 * chunk boundary therefore still resolves to exactly one spec everywhere.
 *
 * Called by `chunkManager.ts`'s `paramsFor()` (terrain mask) and its bridge
 * presentation / movement-ground-query wiring, main-thread only.
 *
 * @domain world-terrain
 */
export function bridgesNear(
  worldX: number,
  worldZ: number,
  size: number,
  ctx: RoadNetworkContext,
): RoadBridgeSpec[] {
  const cell = worldToCell(worldX, worldZ)
  const half = size / 2
  const minX = worldX - half
  const maxX = worldX + half
  const minZ = worldZ - half
  const maxZ = worldZ + half

  const byId = new Map<string, RoadBridgeSpec>()
  for (const c of cellsWithinRadius(cell, 1)) {
    const def = defFor(c, ctx)
    if (!def) continue
    for (const route of roadRoutesForSettlement(def, ctx)) {
      if (route.kind !== 'road') continue
      for (const crossing of route.crossings) {
        if (crossing.kind !== 'bridge') continue
        const spec = bridgeSpecOf(crossing, route, ctx.region.roadNetwork)
        const reach = Math.max(spec.span, spec.width) * 0.5
        if (spec.x + reach < minX || spec.x - reach > maxX) continue
        if (spec.z + reach < minZ || spec.z - reach > maxZ) continue
        byId.set(spec.id, spec)
      }
    }
  }
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
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
    if (!def) continue
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
        // Crop pads are small — keep a wide flat/dirt core so beds sit on packed
        // ground after plaza/house `CLEARING_INNER_FRACTION` was lowered to 0.45.
        innerFraction: 0.75,
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
