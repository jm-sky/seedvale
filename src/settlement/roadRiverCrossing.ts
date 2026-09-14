import type { RiverChannelSegment } from '../terrain/chunkHeightmap'
import type { RoadSegmentKind } from './roadNetwork'
import { projectOntoSegment, yawToward } from '../math/segment'

/**
 * @domain world-terrain
 * @system roads
 * @role The single canonical road × river crossing authority (plan
 *   world-terrain-023). Decides *whether* a road polyline meets canonical
 *   river water, *where* exactly, and *what kind* of infrastructure that
 *   crossing is (`ford` / `bridge`) or that it is not supported at all. Pure
 *   and allocation-light so `roadNetwork.ts`'s A* can price every candidate
 *   edge through it.
 * @integration `roadNetwork.ts` is the only caller: it prices edges with
 *   {@link riverHitsOnEdge}/{@link evaluateRoadRiverCrossing} during the
 *   search and then derives the route's canonical {@link RoadRiverCrossing}
 *   records from the *final* polyline with {@link crossingsForPolyline}. No
 *   terrain, renderer or runtime stage may reclassify a crossing: terrain only
 *   projects a declared `ford` (`terrain/riverFord.ts`) and
 *   `world-terrain-033` only projects a declared `bridge`.
 */

export type RoadRiverCrossingKind = 'ford' | 'bridge'

/** Canonical, presentation-free facts about one road × river intersection,
 *  interpolated from the `RiverChannelSegment` the road actually meets.
 *  Hydrology (`waterH`/`naturalBedH`) is the *natural* channel — fording
 *  shapes terrain, it never moves the water surface (see `riverFord.ts`). */
export type RoadRiverCrossingFacts = {
  /** Crossing anchor — where the road centerline meets the river centerline
   *  (or its closest approach inside the water footprint). */
  x: number
  z: number
  /** Road heading through the crossing, `yawToward` convention. */
  angle: number
  /** Canonical water-surface width (m) at the crossing. */
  waterWidth: number
  /** Canonical bank-top channel width (m) at the crossing. */
  channelWidth: number
  /** Canonical water-surface height. */
  waterH: number
  /** Canonical (un-forded) streambed height. */
  naturalBedH: number
  /** `|sin|` of the angle between road and river centerline — 1 is a square
   *  crossing, small values are long oblique traversals. */
  crossSin: number
  /** Road-aligned length across the channel footprint (`channelWidth /
   *  crossSin`) — what a bridge would have to span. */
  span: number
}

/** A canonical crossing record: facts plus the one deterministic kind
 *  decision every downstream stage must reuse. `id` is stable for a given
 *  world/route and independent of which settlement resolved the route first
 *  (routes are computed in a canonical endpoint orientation, see
 *  `roadNetwork.ts`). */
export type RoadRiverCrossing = RoadRiverCrossingFacts & {
  id: string
  kind: RoadRiverCrossingKind
}

// --- Policy. Kept together here rather than scattered across A*, terrain and
// rendering: the thresholds below are the *only* place ford-vs-bridge is
// decided. ---

/** Water width (m) a cart can simply splash through — the historical
 *  `riverFord.ts` full-ford width, kept as production tuning. */
const FORD_FULL_WATER_WIDTH = 6
/** Water width (m) at/above which a ford is never declared: a real river needs
 *  a bridge, not a raised bar. */
const FORD_MAX_WATER_WIDTH = 9
/** Water column (m) a crossing may be forded through at all. Width alone is
 *  not enough — a narrow but deep channel must not become a ford. */
const FORD_MAX_WATER_DEPTH = 1.1
/** Water column (m) below which a ford is entirely comfortable; above it the
 *  ford is still allowed but progressively more expensive. */
const FORD_EASY_WATER_DEPTH = 0.5
/** Longest road-aligned span (m) a V1 bridge may cover. Beyond this the edge
 *  is rejected and the router must find another crossing or fail. */
const MAX_BRIDGE_SPAN = 34
/** Most oblique road × river angle a bridge may use. Below this the deck would
 *  be a near-parallel causeway, not a crossing. */
const MIN_BRIDGE_CROSS_SIN = 0.35

/** A trivially cheap ford still costs something, so the router prefers an
 *  equally good dry alternative. Units are A* cost, i.e. metres of road. */
const FORD_COST_BASE = 10
/** Added to `FORD_COST_BASE` as a ford approaches its width/depth limits, so
 *  a comfortable ford a little further along beats a marginal one here. */
const FORD_COST_MARGINAL = 90
/** A bridge is deliberately expensive relative to `gridStep` (9 m): ~240 makes
 *  the router accept roughly a 250 m detour to a decent ford before building
 *  one, without making every small stream cause a huge detour. */
const BRIDGE_COST_BASE = 240
const BRIDGE_COST_PER_METRE = 14

/** True when `(x, z)` lies inside some canonical river's *water* footprint. */
function insideWater(x: number, z: number, segments: readonly RiverChannelSegment[]): boolean {
  for (const seg of segments) {
    const { distSq, t } = projectOntoSegment(x, z, seg.ax, seg.az, seg.bx, seg.bz)
    const halfWidth = lerp(seg.aWaterHalfWidth, seg.bWaterHalfWidth, t)
    if (distSq < halfWidth * halfWidth) return true
  }
  return false
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export type CrossingVerdict =
  | { kind: RoadRiverCrossingKind, cost: number }
  | { kind: 'reject' }

/**
 * The one ford-vs-bridge decision. `routeKind` is explicit policy input: an
 * inter-settlement `road` may build a bridge, a settlement↔minor-location
 * `path` may only use a safe ford (plan §12) — a bridge-required edge is
 * rejected there so the path detours or fails rather than silently
 * materializing a full road bridge.
 *
 * @domain world-terrain
 */
export function evaluateRoadRiverCrossing(
  facts: RoadRiverCrossingFacts,
  routeKind: RoadSegmentKind,
): CrossingVerdict {
  const depth = Math.max(0, facts.waterH - facts.naturalBedH)

  if (facts.waterWidth < FORD_MAX_WATER_WIDTH && depth <= FORD_MAX_WATER_DEPTH) {
    const widthT = clamp01(
      (facts.waterWidth - FORD_FULL_WATER_WIDTH) / (FORD_MAX_WATER_WIDTH - FORD_FULL_WATER_WIDTH),
    )
    const depthT = clamp01(
      (depth - FORD_EASY_WATER_DEPTH) / (FORD_MAX_WATER_DEPTH - FORD_EASY_WATER_DEPTH),
    )
    const marginal = Math.max(widthT, depthT)
    return { kind: 'ford', cost: FORD_COST_BASE + FORD_COST_MARGINAL * marginal }
  }

  if (routeKind !== 'road') return { kind: 'reject' }
  if (facts.crossSin < MIN_BRIDGE_CROSS_SIN) return { kind: 'reject' }
  if (facts.span > MAX_BRIDGE_SPAN) return { kind: 'reject' }
  return { kind: 'bridge', cost: BRIDGE_COST_BASE + BRIDGE_COST_PER_METRE * facts.span }
}

/** Interpolates canonical channel facts at river parameter `u` and resolves
 *  the road-relative geometry of the crossing. */
function factsAt(
  seg: RiverChannelSegment,
  u: number,
  x: number,
  z: number,
  edgeDirX: number,
  edgeDirZ: number,
): RoadRiverCrossingFacts {
  const rx = seg.bx - seg.ax
  const rz = seg.bz - seg.az
  const rLen = Math.hypot(rx, rz) || 1
  // |cross product| of two unit vectors = |sin| of the angle between them.
  const crossSin = Math.min(1, Math.abs(edgeDirX * (rz / rLen) - edgeDirZ * (rx / rLen)))
  const channelWidth = lerp(seg.aChannelHalfWidth, seg.bChannelHalfWidth, u) * 2
  return {
    x,
    z,
    angle: yawToward(edgeDirX, edgeDirZ),
    waterWidth: lerp(seg.aWaterHalfWidth, seg.bWaterHalfWidth, u) * 2,
    channelWidth,
    waterH: lerp(seg.aWaterH, seg.bWaterH, u),
    naturalBedH: lerp(seg.aBedH, seg.bBedH, u),
    crossSin,
    span: channelWidth / Math.max(crossSin, 1e-3),
  }
}

/** `t` along the road edge where the hit was resolved — routing needs the
 *  ordering, the facts carry everything else. */
export type RoadEdgeRiverHit = { t: number, facts: RoadRiverCrossingFacts }

/**
 * Canonical river water a single road edge `(ax,az)→(bx,bz)` meets.
 *
 * Deliberately **edge**-based, not node-based: a 9 m A* step can leap clean
 * across a 3 m stream with both endpoints on dry land, so a per-node water
 * test can never see that crossing (plan §5). The test is against the river's
 * *water footprint*, not just its centerline, so a tangent pass that clips a
 * bank is a crossing too rather than a naked road through water.
 *
 * `segments` should be the bounded set queried once for the whole route search
 * envelope — never re-query hydrology per neighbor expansion.
 *
 * @domain world-terrain
 */
export function riverHitsOnEdge(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  segments: readonly RiverChannelSegment[],
): RoadEdgeRiverHit[] {
  const ex = bx - ax
  const ez = bz - az
  const eLen = Math.hypot(ex, ez)
  if (eLen < 1e-6 || segments.length === 0) return []
  const edgeDirX = ex / eLen
  const edgeDirZ = ez / eLen
  const edgeMinX = Math.min(ax, bx)
  const edgeMaxX = Math.max(ax, bx)
  const edgeMinZ = Math.min(az, bz)
  const edgeMaxZ = Math.max(az, bz)

  const hits: RoadEdgeRiverHit[] = []
  for (const seg of segments) {
    const reach = Math.max(seg.aWaterHalfWidth, seg.bWaterHalfWidth)
    if (Math.min(seg.ax, seg.bx) - reach > edgeMaxX) continue
    if (Math.max(seg.ax, seg.bx) + reach < edgeMinX) continue
    if (Math.min(seg.az, seg.bz) - reach > edgeMaxZ) continue
    if (Math.max(seg.az, seg.bz) + reach < edgeMinZ) continue

    const rx = seg.bx - seg.ax
    const rz = seg.bz - seg.az
    const denom = ex * rz - ez * rx
    let t: number
    let u: number
    if (Math.abs(denom) > 1e-9) {
      const qx = seg.ax - ax
      const qz = seg.az - az
      t = (qx * rz - qz * rx) / denom
      u = (qx * ez - qz * ex) / denom
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        // Centerlines properly cross — unambiguously a crossing.
        hits.push({ t, facts: factsAt(seg, u, ax + ex * t, az + ez * t, edgeDirX, edgeDirZ) })
        continue
      }
    }
    // Parallel, or the crossing point falls outside one of the two spans:
    // the edge may still clip the water footprint near a bank.
    const near = closestApproach(ax, az, bx, bz, seg.ax, seg.az, seg.bx, seg.bz)
    const halfWidth = lerp(seg.aWaterHalfWidth, seg.bWaterHalfWidth, near.u)
    if (near.dist >= halfWidth) continue
    hits.push({
      t: near.t,
      facts: factsAt(seg, near.u, ax + ex * near.t, az + ez * near.t, edgeDirX, edgeDirZ),
    })
  }
  hits.sort((a, b) => a.t - b.t)
  return hits
}

/** Closest approach between two 2D segments, as the clamped parameters on
 *  each plus the distance. Good enough for the near-bank case above: exact
 *  when at least one closest point is an endpoint, which is always true once
 *  the interiors do not properly cross. */
function closestApproach(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number,
): { t: number, u: number, dist: number } {
  let best = { t: 0, u: 0, distSq: Infinity }
  const consider = (t: number, u: number, distSq: number) => {
    if (distSq < best.distSq) best = { t, u, distSq }
  }
  const onEdge = (px: number, pz: number, u: number) => {
    const p = projectOntoSegment(px, pz, ax, az, bx, bz)
    consider(p.t, u, p.distSq)
  }
  const onRiver = (px: number, pz: number, t: number) => {
    const p = projectOntoSegment(px, pz, cx, cz, dx, dz)
    consider(t, p.t, p.distSq)
  }
  onEdge(cx, cz, 0)
  onEdge(dx, dz, 1)
  onRiver(ax, az, 0)
  onRiver(bx, bz, 1)
  return { t: best.t, u: best.u, dist: Math.sqrt(best.distSq) }
}

/**
 * The canonical crossing set of a **final** road polyline — the acceptance
 * invariant of plan §7 holds by construction here: every intersection of the
 * polyline with canonical river water becomes exactly one record, and every
 * record is a real intersection of that same polyline. Deriving the records
 * from the finished geometry (rather than from the A* chain the geometry was
 * later meandered away from) is what makes meander unable to invent or erase
 * a crossing.
 *
 * Hits from consecutive polyline edges that describe the same physical
 * traversal merge into a single record: an inserted crossing anchor splits one
 * traversal in two, and a river wider than the A* grid step is met by several
 * edges in a row. Two hits belong to the same traversal exactly when the road
 * between them never leaves the water.
 *
 * Returns `null` when any crossing is not supported for `routeKind` (a bridge
 * on a minor-location path, an excessive span, a near-parallel traversal):
 * the caller must then re-route or fail rather than emit naked road.
 *
 * @domain world-terrain
 */
export function crossingsForPolyline(
  points: readonly { x: number, z: number }[],
  segments: readonly RiverChannelSegment[],
  routeKind: RoadSegmentKind,
  routeId: string,
): RoadRiverCrossing[] | null {
  if (segments.length === 0 || points.length < 2) return []

  /** One physical traversal: where the road entered and left the water, plus
   *  the most demanding facts seen anywhere along it. */
  type Traversal = { entry: { x: number, z: number }, exit: { x: number, z: number }, worst: RoadRiverCrossingFacts }
  const traversals: Traversal[] = []

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    for (const hit of riverHitsOnEdge(a.x, a.z, b.x, b.z, segments)) {
      const open = traversals[traversals.length - 1]
      const continues = open !== undefined
        && insideWater(
          (open.exit.x + hit.facts.x) * 0.5,
          (open.exit.z + hit.facts.z) * 0.5,
          segments,
        )
      if (continues) {
        open.exit = { x: hit.facts.x, z: hit.facts.z }
        // Classify against the widest water the traversal actually meets.
        if (hit.facts.waterWidth > open.worst.waterWidth) open.worst = hit.facts
        continue
      }
      traversals.push({
        entry: { x: hit.facts.x, z: hit.facts.z },
        exit: { x: hit.facts.x, z: hit.facts.z },
        worst: hit.facts,
      })
    }
  }

  const out: RoadRiverCrossing[] = []
  for (let i = 0; i < traversals.length; i++) {
    const { entry, exit, worst } = traversals[i]!
    // Anchor the record at the middle of the traversal — the channel centre
    // for a square crossing, and the point the ford projection is built around.
    const facts: RoadRiverCrossingFacts = {
      ...worst,
      x: (entry.x + exit.x) * 0.5,
      z: (entry.z + exit.z) * 0.5,
    }
    const verdict = evaluateRoadRiverCrossing(facts, routeKind)
    if (verdict.kind === 'reject') return null
    out.push({ ...facts, id: `${routeId}#${i}`, kind: verdict.kind })
  }
  return out
}
