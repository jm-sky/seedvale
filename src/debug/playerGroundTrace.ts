/**
 * Debug-only ring buffer of player cave/surface ground resolution
 * (Cave V2 B3 chamber-snap recon). Filled from values already computed
 * on the walking tick — not a second spatial query. No per-frame console.
 *
 * Rolling pre-history latches on a suspicious vertical snap so standing
 * after the incident cannot overwrite the failing tick.
 *
 * @domain debug
 */

export const PLAYER_GROUND_TRACE_CAPACITY = 120
/** Extra walking ticks kept after the triggering tick, then recording stops. */
export const PLAYER_GROUND_TRACE_POST_TICKS = 10
/** Upward mesh-Y jump (m) that counts as a ground snap, not a jump/step. */
export const PLAYER_GROUND_SNAP_Y = 2

export type PlayerGroundSource = 'cave' | 'hysteresis' | 'surface'

export type PlayerGroundHitSnapshot = {
  floorY: number
  ceilingY: number
  openSky: boolean
} | null

export type PlayerGroundTraceWriter = 'vertical' | 'snap' | 'swim'

export type PlayerGroundSnapReason = 'upward-jump' | 'surface-takeover' | 'upward-jump+surface-takeover'

/** One walking-tick sample. Plain JSON — pasteable from DevTools. */
export type PlayerGroundTraceTick = {
  seq: number
  writer: PlayerGroundTraceWriter
  before: { x: number, y: number, z: number }
  after: { x: number, y: number, z: number }
  surfaceY: number
  raw: PlayerGroundHitSnapshot
  lastGroundHit: PlayerGroundHitSnapshot
  resolved: PlayerGroundHitSnapshot
  source: PlayerGroundSource
  groundY: number
  floorY: number | null
  ceilingY: number | null
  occupancy: boolean
  /**
   * Raw occupancy on the interior side of the mouth
   * (`along <= MOUTH_INTERIOR_ALONG`). Not hysteretic `Caves.queryInterior`.
   */
  queryInterior: boolean
  groundedBefore: boolean
  groundedAfter: boolean
  verticalVelocityBefore: number
  verticalVelocityAfter: number
  caveId: string | null
  along: number | null
  lateral: number | null
  /** Set only on the latched vertical tick; `null` on every other sample. */
  triggerReason: PlayerGroundSnapReason | null
}

export type PlayerGroundTraceSnapshot = {
  /** True once an anomaly has been captured — later walking ticks cannot drop it. */
  frozen: boolean
  triggerSeq: number | null
  triggerReason: PlayerGroundSnapReason | null
  ticks: PlayerGroundTraceTick[]
}

export type CaveGroundQueryDebug = {
  raw: PlayerGroundHitSnapshot
  lastHitBefore: PlayerGroundHitSnapshot
  resolved: PlayerGroundHitSnapshot
  source: PlayerGroundSource
  surfaceY: number
  occupancy: boolean
  queryInterior: boolean
  caveId: string | null
  along: number | null
  lateral: number | null
}

export type PlayerGroundTraceBuffer = {
  record: (tick: PlayerGroundTraceTick) => void
  snapshot: () => PlayerGroundTraceSnapshot
  clear: () => void
}

function copyHit(hit: PlayerGroundHitSnapshot): PlayerGroundHitSnapshot {
  if (!hit) return null
  return { floorY: hit.floorY, ceilingY: hit.ceilingY, openSky: hit.openSky }
}

function copyTick(src: PlayerGroundTraceTick): PlayerGroundTraceTick {
  return {
    seq: src.seq,
    writer: src.writer,
    before: { x: src.before.x, y: src.before.y, z: src.before.z },
    after: { x: src.after.x, y: src.after.y, z: src.after.z },
    surfaceY: src.surfaceY,
    raw: copyHit(src.raw),
    lastGroundHit: copyHit(src.lastGroundHit),
    resolved: copyHit(src.resolved),
    source: src.source,
    groundY: src.groundY,
    floorY: src.floorY,
    ceilingY: src.ceilingY,
    occupancy: src.occupancy,
    queryInterior: src.queryInterior,
    groundedBefore: src.groundedBefore,
    groundedAfter: src.groundedAfter,
    verticalVelocityBefore: src.verticalVelocityBefore,
    verticalVelocityAfter: src.verticalVelocityAfter,
    caveId: src.caveId,
    along: src.along,
    lateral: src.lateral,
    triggerReason: src.triggerReason,
  }
}

function emptyTick(): PlayerGroundTraceTick {
  return {
    seq: 0,
    writer: 'vertical',
    before: { x: 0, y: 0, z: 0 },
    after: { x: 0, y: 0, z: 0 },
    surfaceY: 0,
    raw: null,
    lastGroundHit: null,
    resolved: null,
    source: 'surface',
    groundY: 0,
    floorY: null,
    ceilingY: null,
    occupancy: false,
    queryInterior: false,
    groundedBefore: false,
    groundedAfter: false,
    verticalVelocityBefore: 0,
    verticalVelocityAfter: 0,
    caveId: null,
    along: null,
    lateral: null,
    triggerReason: null,
  }
}

function previousWasCaveOwned(prevSource: PlayerGroundSource | null, tick: PlayerGroundTraceTick): boolean {
  return prevSource === 'cave'
    || prevSource === 'hysteresis'
    || tick.lastGroundHit != null
}

/**
 * Latches a large runtime upward mesh write, including `writer: "swim"`.
 * `snap` (teleport / setGround) is excluded. Uses this tick's fields and
 * the previous walking `source` — no extra spatial queries.
 */
export function detectPlayerGroundSnap(
  tick: PlayerGroundTraceTick,
  prevSource: PlayerGroundSource | null,
): PlayerGroundSnapReason | null {
  if (tick.writer === 'snap') return null
  const upwardJump = tick.after.y - tick.before.y > PLAYER_GROUND_SNAP_Y
  const overburden = tick.surfaceY - tick.before.y > PLAYER_GROUND_SNAP_Y
  const surfaceTakeover = tick.source === 'surface' && overburden && previousWasCaveOwned(prevSource, tick)
  if (upwardJump && surfaceTakeover) return 'upward-jump+surface-takeover'
  if (upwardJump) return 'upward-jump'
  if (surfaceTakeover) return 'surface-takeover'
  return null
}

/**
 * Bounded ring of the last `capacity` ground-resolution ticks.
 * `record` mutates preallocated slots while rolling (no per-tick array growth).
 * An anomaly copies the ring once, keeps a few post ticks, then ignores input.
 * `snapshot` clones for DevTools (allocation only on explicit read / latch).
 */
export function createPlayerGroundTraceBuffer(
  capacity: number = PLAYER_GROUND_TRACE_CAPACITY,
  postTicks: number = PLAYER_GROUND_TRACE_POST_TICKS,
): PlayerGroundTraceBuffer {
  const size = Math.max(1, capacity)
  const postLimit = Math.max(0, postTicks)
  const slots: PlayerGroundTraceTick[] = Array.from({ length: size }, emptyTick)
  let next = 0
  let filled = 0
  let seq = 0
  let prevVerticalSource: PlayerGroundSource | null = null
  let latched: PlayerGroundTraceTick[] | null = null
  let postRemaining = 0
  let triggerSeq: number | null = null
  let triggerReason: PlayerGroundSnapReason | null = null

  function writeSlot(tick: PlayerGroundTraceTick): PlayerGroundTraceTick {
    seq += 1
    const slot = slots[next]!
    slot.seq = seq
    slot.writer = tick.writer
    slot.before.x = tick.before.x
    slot.before.y = tick.before.y
    slot.before.z = tick.before.z
    slot.after.x = tick.after.x
    slot.after.y = tick.after.y
    slot.after.z = tick.after.z
    slot.surfaceY = tick.surfaceY
    slot.raw = copyHit(tick.raw)
    slot.lastGroundHit = copyHit(tick.lastGroundHit)
    slot.resolved = copyHit(tick.resolved)
    slot.source = tick.source
    slot.groundY = tick.groundY
    slot.floorY = tick.floorY
    slot.ceilingY = tick.ceilingY
    slot.occupancy = tick.occupancy
    slot.queryInterior = tick.queryInterior
    slot.groundedBefore = tick.groundedBefore
    slot.groundedAfter = tick.groundedAfter
    slot.verticalVelocityBefore = tick.verticalVelocityBefore
    slot.verticalVelocityAfter = tick.verticalVelocityAfter
    slot.caveId = tick.caveId
    slot.along = tick.along
    slot.lateral = tick.lateral
    slot.triggerReason = null
    next = (next + 1) % size
    if (filled < size) filled += 1
    return slot
  }

  function snapshotRing(): PlayerGroundTraceTick[] {
    const out: PlayerGroundTraceTick[] = []
    const start = filled < size ? 0 : next
    for (let i = 0; i < filled; i++) {
      out.push(copyTick(slots[(start + i) % size]!))
    }
    return out
  }

  return {
    record(tick) {
      if (latched && postRemaining <= 0) return

      if (latched) {
        seq += 1
        const copy = copyTick(tick)
        copy.seq = seq
        copy.triggerReason = null
        latched.push(copy)
        postRemaining -= 1
        if (tick.writer === 'vertical') prevVerticalSource = tick.source
        return
      }

      const slot = writeSlot(tick)
      const reason = detectPlayerGroundSnap(slot, prevVerticalSource)
      if (tick.writer === 'vertical') prevVerticalSource = tick.source
      if (!reason) return

      slot.triggerReason = reason
      triggerReason = reason
      triggerSeq = slot.seq
      latched = snapshotRing()
      postRemaining = postLimit
    },
    snapshot() {
      return {
        frozen: latched != null,
        triggerSeq,
        triggerReason,
        ticks: latched ? latched.map(copyTick) : snapshotRing(),
      }
    },
    clear() {
      next = 0
      filled = 0
      seq = 0
      prevVerticalSource = null
      latched = null
      postRemaining = 0
      triggerSeq = null
      triggerReason = null
    },
  }
}

export function snapshotCaveGroundHit(
  hit: { floorY: number, ceilingY: number, openSky?: boolean } | null,
): PlayerGroundHitSnapshot {
  if (!hit) return null
  return { floorY: hit.floorY, ceilingY: hit.ceilingY, openSky: Boolean(hit.openSky) }
}

/** Mutates `slot` and returns it, or `null` — no allocation. */
export function writeHitSnapshot(
  slot: { floorY: number, ceilingY: number, openSky: boolean },
  hit: { floorY: number, ceilingY: number, openSky?: boolean } | null,
): PlayerGroundHitSnapshot {
  if (!hit) return null
  slot.floorY = hit.floorY
  slot.ceilingY = hit.ceilingY
  slot.openSky = Boolean(hit.openSky)
  return slot
}

export function emptyPlayerGroundTrace(): PlayerGroundTraceSnapshot {
  return { frozen: false, triggerSeq: null, triggerReason: null, ticks: [] }
}
