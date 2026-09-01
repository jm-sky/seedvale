/** Plan world-009 — short-lived environmental blood traces left where the
 *  player, an NPC or an animal takes real damage. This module owns the
 *  authoritative *environmental* state only: it never touches combat
 *  resolution, `HealthState` or death lifecycle (those stay owned by
 *  `playerDamage.ts`/`NpcAgent.ts`/`AnimalAgent.ts` — see the plan's
 *  Ownership section). Rendering is `terrain/bloodOverlay.ts`'s job; this
 *  file only decides *what* exists and *for how long*.
 *
 *  Not persisted (`SaveData`) — traces are capped at a few in-world days, so
 *  losing them across a save/load or a genuinely new world is an accepted
 *  simplification the plan explicitly allows ("nie rozszerzać pełnego
 *  SaveData wyłącznie dla krótkotrwałych blood traces"). `createWorldBundle`
 *  (worldBundle.ts)
 *  always starts a fresh, empty state; only an in-session
 *  `rebuildWorldBundle` (config change, not a new seed) carries the live
 *  state across, via `createBloodTraceSystem`'s `initialTraces` param —
 *  same "carried across rebuild, reset only on a genuinely new world"
 *  contract every other player-positioned world object already uses there. */

import type { HeightSampler } from '../player/PlayerController'
import type { DayNightState } from './dayNight'
import { type BloodOverlayPlacement, createBloodOverlaySystem } from '../terrain/bloodOverlay'
import { computeRainExposureDays } from './weather'
import type { Scene } from 'three'

export type BloodTrace = {
  id: number
  x: number
  z: number
  /** Meters, already saturated — see `computeBloodTraceSize`. */
  size: number
  variant: number
  rotation: number
  scaleJitter: number
  opacityJitter: number
  createdAtDays: number
  /** Base lifetime (world-days) before any weather acceleration. */
  lifetimeDays: number
}

export type BloodTraceWorldState = {
  traces: BloodTrace[]
  nextId: number
}

export const BLOOD_VARIANT_COUNT = 4
export const BLOOD_MIN_SIZE = 0.35
export const BLOOD_MAX_SIZE = 1.6
export const BLOOD_MIN_LIFETIME_DAYS = 1
export const BLOOD_MAX_LIFETIME_DAYS = 3
/** Rain's weight against a trace's own lifetime — 1 in-world day spent fully
 *  rained on shortens life by this many lifetime-days (plan §6: "prolonged/
 *  heavy rain → significantly faster fading", but "krótki deszcz nie
 *  usuwa automatycznie wszystkich śladów" — a brief shower's exposure stays
 *  a small fraction of a trace's `lifetimeDays`). */
export const BLOOD_RAIN_FADE_WEIGHT = 2.5
/** Bounded local-accumulation policy (plan §7/§9): traces within this radius
 *  of a new hit count toward one shared local cap instead of growing
 *  unbounded — the oldest local trace is replaced once the cap is hit. */
export const BLOOD_LOCAL_RADIUS = 1.2
export const BLOOD_LOCAL_CAP = 6
/** Hard global cap — safety net against unbounded GPU/array growth even when
 *  hits are spread across the whole map (plan §9). */
export const BLOOD_GLOBAL_CAP = 200

/** Same Wang-style integer hash as `world/weather.ts`'s private `hash01` —
 *  reimplemented locally rather than imported since callers here hash a
 *  trace `id`, not a `(seed, cycle)` pair, and the two are conceptually
 *  independent deterministic-variety sources (matches `weather.ts`'s own
 *  reasoning for not importing `terrain/worleyNoise.ts`'s copy). */
function hash01(a: number, b: number, salt: number): number {
  let h = (a * 374761393 + b * 668265263 + salt * 2246822519) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return (h >>> 0) / 4294967296
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

export function createBloodTraceWorldState(initialTraces: readonly BloodTrace[] = []): BloodTraceWorldState {
  const traces = [...initialTraces]
  const nextId = traces.reduce((max, t) => Math.max(max, t.id), 0) + 1
  return { traces, nextId }
}

/** Victim size + damage → a saturating mark size (plan §2): never fully
 *  linear, bounded to `[BLOOD_MIN_SIZE, BLOOD_MAX_SIZE]`, and well-behaved
 *  for very small (fractional starvation) damage — `damageFactor` stays
 *  finite and > 0 for any `damage > 0`, so the size clamp alone enforces the
 *  minimum instead of the formula needing a special case. */
export function computeBloodTraceSize(victimSize: number, damage: number): number {
  const damageFactor = 1 - Math.exp(-Math.max(0, damage) / 12)
  const raw = victimSize * (0.25 + damageFactor * 0.55)
  return clamp(raw, BLOOD_MIN_SIZE, BLOOD_MAX_SIZE)
}

type BloodTraceHashedFields = {
  variant: number
  rotation: number
  scaleJitter: number
  opacityJitter: number
  lifetimeDays: number
}

/** Deterministic per-trace variety from its own stable `id` (plan §4/§7 of
 *  the implementation notes) — never `Math.random()`, so re-deriving a
 *  trace's presentation (e.g. after a chunk reload) is stable. */
function hashedFields(id: number): BloodTraceHashedFields {
  return {
    variant: Math.floor(hash01(id, 0, 0x9e3779b1) * BLOOD_VARIANT_COUNT) % BLOOD_VARIANT_COUNT,
    rotation: hash01(id, 1, 0x517cc1b7) * Math.PI * 2,
    scaleJitter: 0.85 + hash01(id, 2, 0x27d4eb2f) * 0.3,
    opacityJitter: 0.8 + hash01(id, 3, 0x85ebca6b) * 0.2,
    lifetimeDays:
      BLOOD_MIN_LIFETIME_DAYS + hash01(id, 4, 0xc2b2ae35) * (BLOOD_MAX_LIFETIME_DAYS - BLOOD_MIN_LIFETIME_DAYS),
  }
}

function distanceSq(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx
  const dz = az - bz
  return dx * dx + dz * dz
}

/** 0 (fully faded) .. 1 (fresh) — age plus weather-accelerated exposure
 *  against the trace's own `lifetimeDays` (plan §5/§6). Pure given
 *  `(seed, elapsedDays)`, same "re-derive, don't replay" contract as
 *  `world/weather.ts` — no per-trace timer, no persisted weather history. */
export function bloodTraceRemainingFraction(trace: BloodTrace, seed: number, elapsedDays: number): number {
  const age = elapsedDays - trace.createdAtDays
  if (age <= 0) return 1
  const rainExposure = computeRainExposureDays(seed, trace.createdAtDays, elapsedDays)
  const effectiveAge = age + rainExposure * BLOOD_RAIN_FADE_WEIGHT
  return clamp01(1 - effectiveAge / trace.lifetimeDays)
}

/** Drops every trace whose lifetime has fully elapsed. Returns `true` if
 *  anything was actually removed, so callers can skip a render resync when
 *  nothing changed. */
export function pruneBloodTraces(state: BloodTraceWorldState, seed: number, elapsedDays: number): boolean {
  const before = state.traces.length
  if (before === 0) return false
  state.traces = state.traces.filter((t) => bloodTraceRemainingFraction(t, seed, elapsedDays) > 0)
  return state.traces.length !== before
}

/** Records one new trace for a positive damage event (plan §1/§2/§7).
 *  No-op for `damage <= 0` — "brak damage nie generuje śladu". Bounded
 *  accumulation: prunes expired traces first, then — if the new hit lands
 *  within `BLOOD_LOCAL_RADIUS` of already `BLOOD_LOCAL_CAP` other traces —
 *  replaces the oldest nearby trace instead of growing that cluster further
 *  (a simple bounded policy, not a merge — the plan only requires "ograniczyć
 *  liczbę reprezentacji", not preserve every individual mark). A hard
 *  `BLOOD_GLOBAL_CAP` additionally protects against unbounded growth spread
 *  across the whole map. */
export function recordBloodTrace(
  state: BloodTraceWorldState,
  seed: number,
  elapsedDays: number,
  x: number,
  z: number,
  victimSize: number,
  damage: number,
): BloodTrace | null {
  if (!(damage > 0)) return null
  pruneBloodTraces(state, seed, elapsedDays)

  const radiusSq = BLOOD_LOCAL_RADIUS * BLOOD_LOCAL_RADIUS
  const nearby = state.traces.filter((t) => distanceSq(t.x, t.z, x, z) <= radiusSq)
  if (nearby.length >= BLOOD_LOCAL_CAP) {
    const oldest = nearby.reduce((a, b) => (a.createdAtDays <= b.createdAtDays ? a : b))
    const idx = state.traces.indexOf(oldest)
    if (idx !== -1) state.traces.splice(idx, 1)
  } else if (state.traces.length >= BLOOD_GLOBAL_CAP) {
    let oldestIdx = 0
    for (let i = 1; i < state.traces.length; i++) {
      if (state.traces[i]!.createdAtDays < state.traces[oldestIdx]!.createdAtDays) oldestIdx = i
    }
    state.traces.splice(oldestIdx, 1)
  }

  const id = state.nextId++
  const trace: BloodTrace = {
    id,
    x,
    z,
    size: computeBloodTraceSize(victimSize, damage),
    createdAtDays: elapsedDays,
    ...hashedFields(id),
  }
  state.traces.push(trace)
  return trace
}

/** Traces within `radius` of `(x, z)` — the "active area" query the renderer
 *  uses so GPU representation is bounded to roughly the streamed region
 *  (plan §8/§9), independent of `ChunkManager`'s own `ChunkRecord` (the
 *  world-level state here is never written into a chunk record — see this
 *  file's header comment). */
export function bloodTracesNear(
  state: BloodTraceWorldState,
  x: number,
  z: number,
  radius: number,
): readonly BloodTrace[] {
  const radiusSq = radius * radius
  return state.traces.filter((t) => distanceSq(t.x, t.z, x, z) <= radiusSq)
}

export type BloodTraceSink = (x: number, z: number, victimSize: number, damage: number) => void

let activeSink: BloodTraceSink | null = null

/** Registers the sink `playerDamage.ts`/`NpcAgent.takeDamage`/
 *  `AnimalAgent.takeDamage` call directly via `recordBloodHit` below — a
 *  module-level "current world's live callback" idiom, same shape as
 *  `fauna/bloodSplat.ts`'s own module-level template cache, chosen instead
 *  of threading one more optional callback through `NpcAgent`/`AnimalAgent`'s
 *  already-long positional constructors. There is at most one live
 *  `WorldBundle` at a time, so a single mutable slot is enough — set at
 *  `createBloodTraceSystem` build time, cleared again in `dispose()`. */
export function setBloodTraceSink(sink: BloodTraceSink | null): void {
  activeSink = sink
}

/** Called directly from the three damage entry points on positive final
 *  damage (plan §1/§10) — a silent no-op before any `WorldBundle` has
 *  registered a sink (e.g. an agent constructed in isolation by a unit test). */
export function recordBloodHit(x: number, z: number, victimSize: number, damage: number): void {
  activeSink?.(x, z, victimSize, damage)
}

export type BloodTraceSystem = {
  tick: (dt: number, playerX: number, playerZ: number) => void
  /** Live traces, for `worldBundle.ts`'s in-session `rebuildWorldBundle` to
   *  carry across into the next `createBloodTraceSystem` call — same
   *  "carried across rebuild, reset only on a genuinely new world" contract
   *  every other player-positioned world object already uses there. */
  snapshot: () => readonly BloodTrace[]
  dispose: () => void
}

/** How often (real seconds) the render overlay passively resyncs to reflect
 *  lifetime/weather fading. A new hit sets `dirty` and resyncs on the very
 *  next `tick` regardless, so this only bounds fade-visual latency, not
 *  creation latency (plan verification: damage → trace appears right away). */
const SYNC_INTERVAL_SEC = 2

/** Composes the world-state (this file) with `terrain/bloodOverlay.ts`'s
 *  renderer and the damage-entry-point sink above into one lifecycle object
 *  — owned by `worldBundle.ts`, tied to `sampleHeight`'s chunk manager and
 *  `scene`. `activeRadius` bounds GPU representation to roughly the
 *  streamed/active area (plan §8/§9) without depending on `ChunkManager`
 *  internals — callers pass the terrain streaming footprint
 *  (`chunkSize * loadRadius`). */
export function createBloodTraceSystem(
  scene: Scene,
  sampleHeight: HeightSampler,
  seed: number,
  dayNight: DayNightState,
  activeRadius: number,
  initialTraces: readonly BloodTrace[] = [],
): BloodTraceSystem {
  const state = createBloodTraceWorldState(initialTraces)
  const overlay = createBloodOverlaySystem(sampleHeight)
  scene.add(overlay.group)

  let dirty = true
  let accumSec = 0

  setBloodTraceSink((x, z, victimSize, damage) => {
    recordBloodTrace(state, seed, dayNight.elapsedDays, x, z, victimSize, damage)
    dirty = true
  })

  function resync(playerX: number, playerZ: number): void {
    pruneBloodTraces(state, seed, dayNight.elapsedDays)
    const nearby = bloodTracesNear(state, playerX, playerZ, activeRadius)
    const placements: BloodOverlayPlacement[] = nearby.map((t) => ({
      x: t.x,
      z: t.z,
      rotation: t.rotation,
      scale: t.size * t.scaleJitter,
      variant: t.variant,
      opacity: bloodTraceRemainingFraction(t, seed, dayNight.elapsedDays) * t.opacityJitter,
    }))
    overlay.sync(placements)
    dirty = false
    accumSec = 0
  }

  return {
    tick(dt, playerX, playerZ) {
      accumSec += dt
      if (dirty || accumSec >= SYNC_INTERVAL_SEC) resync(playerX, playerZ)
    },
    snapshot: () => [...state.traces],
    dispose() {
      setBloodTraceSink(null)
      overlay.dispose()
    },
  }
}
