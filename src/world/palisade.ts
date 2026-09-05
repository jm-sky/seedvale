import type { MaterialRequirement } from '../items/constructionMaterials'
import type { GroundPlacementReason } from '../items/tentPlacement'
import { formatHours } from './playerWell'

/**
 * Player-built palisade segment — pure domain logic (plan items-player-010).
 * Deliberately free of `THREE`/DOM, same split as `world/standingTorch.ts` vs
 * `world/createStandingTorches.ts`/`world/standingTorchProp.ts`. A palisade
 * is a chain of independent segments (§1 of the plan), never a single
 * monolithic world object — each segment is its own persistent record with
 * its own identity/position/rotation, snapped end-to-end at placement time.
 * Connection is derived from each segment's own transform (`palisadeEndpoints`
 * below), never persisted as a graph — there is no `PalisadeManager` and no
 * per-frame neighbour bookkeeping.
 *
 * Since plan items-player-017, placement creates a real but unfinished
 * segment (`completedWork` starts at 0) — the same persistent-identity
 * record gains progress through Player and/or NPC work
 * (`world/createPalisades.ts`'s `contributeWork`, the same actor-neutral
 * seam `TerrainPreparations.contributeWork` established) until it reaches
 * `PALISADE_REQUIRED_WORK` and becomes a normal functional segment. A
 * pre-plan save has no `completedWork` field at all — the migration in
 * `persistence/saveData.ts` defaults that to `PALISADE_REQUIRED_WORK`
 * (already complete), never to 0.
 *
 * @domain items-player
 */
export type PalisadeSegmentRecord = {
  id: string
  x: number
  z: number
  yaw: number
  /** Hours of active work applied so far (plan items-player-017 §3) — the
   *  only construction-progress field; `PALISADE_REQUIRED_WORK` (a fixed
   *  constant, not a per-record field, since every segment costs the same)
   *  is the single requirement authority every reader
   *  (`isPalisadeConstructionComplete`/`palisadeRemainingWork`) reads. */
  completedWork: number
}

/** World-space length of one segment (post to post) and its clearance radius
 *  against unrelated blockers (trees/houses/wells) — smaller than a tent/well,
 *  a single fence panel rather than a footprint the player stands inside. */
export const PALISADE_LENGTH = 2.2
export const PALISADE_HALF_LENGTH = PALISADE_LENGTH / 2
export const PALISADE_FOOTPRINT_RADIUS = 0.3
/** Minimum centre distance to another segment (plan §4) — deliberately less
 *  than `PALISADE_LENGTH` so two segments placed end-to-end via snapping
 *  (centres exactly `PALISADE_LENGTH` apart on a straight run, closer on a
 *  turn) are never rejected as "occupied", while a segment folded back onto
 *  an existing one (near-zero centre distance) still is. */
export const PALISADE_SEPARATION = 1.2
/** How far ahead of the player an unsnapped segment is placed — mirrors
 *  `WELL_PLACE_REACH`/`TRAP_PLACE_REACH`. */
export const PALISADE_PLACE_REACH = 1.8
/** Max distance from the aimed site to an existing segment's endpoint that
 *  still triggers a snap (plan §4) — bounded, local search only; never a
 *  global/per-frame scan over every segment. */
export const PALISADE_SNAP_RADIUS = 1.5
/** Busy-channel duration for the placement action itself. */
export const PALISADE_PLACE_DURATION_SEC = 3

export type PalisadePlacementReason = GroundPlacementReason | 'palisade'

/** `slope`'s message points at the existing terrain-preparation tool rather
 *  than silently flattening anything here (plan items-player-017 §5) —
 *  placement itself never modifies terrain; the player must run
 *  "Przygotuj teren" (Szybkie akcje) first, then retry. */
export const PALISADE_PLACEMENT_MESSAGE: Record<Exclude<PalisadePlacementReason, 'ok'>, string> = {
  water: 'Tu jest za mokro na palisadę.',
  slope: 'Teren jest zbyt stromy. Najpierw przygotuj teren (Szybkie akcje → Przygotuj teren).',
  object: 'Za mało miejsca — coś stoi w pobliżu.',
  occupied: 'Tu już stoi segment palisady.',
  palisade: 'Tu już stoi segment palisady.',
}

/** Materials consumed atomically on a successful placement (plan §2) — the
 *  existing `beam` structural-timber item (`items/items.ts`), same "closest
 *  existing recipe, no new material" choice `standingTorch.ts` made. Two
 *  beams per segment, a step up from a standing torch's single beam, since a
 *  palisade segment is a full fence panel rather than one post. */
export const PALISADE_MATERIAL_REQUIREMENTS: readonly MaterialRequirement[] = [
  { kind: 'beam', count: 2 },
]

/** Fraction of `PALISADE_MATERIAL_REQUIREMENTS` returned on removal (plan
 *  §6) — within the plan's typical 30–75% band. Attached to the palisade
 *  segment type itself, not a generic removal rule. */
export const PALISADE_RECOVERY_RATE = 0.5

/** Active-work hours required to finish a segment (plan items-player-017 §3/
 *  §4) — small and fixed (no stages, unlike `playerWell.ts`), so a fence
 *  panel stays practical to build manually while still leaving room for two
 *  work bouts (Player alone, or Player + a hired NPC, plan §9). */
export const PALISADE_REQUIRED_WORK = 1.5
/** Real-seconds length of one active-work bout — same busy-channel-cap
 *  reasoning as `world/playerWell.ts`'s `WELL_WORK_SESSION_SEC`. */
export const PALISADE_WORK_SESSION_SEC = 4
/** Active-work hours credited by one full-length bout (plan §3) — shared by
 *  the player's own work action and NPC contract execution, same "flat
 *  per-bout credit" shape as `WELL_WORK_SESSION_HOURS`/
 *  `TERRAIN_PREP_NPC_WORK_SESSION_HOURS`. */
export const PALISADE_WORK_SESSION_HOURS = 1

/** All useful work still required to finish `record` (plan items-player-017
 *  §16) — the remaining-work authority a Work Contract's snapshot reads,
 *  mirroring `world/playerWell.ts`'s `wellRemainingWork`/
 *  `terrain/terrainPreparation.ts`'s `terrainPreparationRemainingWork`. */
export function palisadeRemainingWork(record: Pick<PalisadeSegmentRecord, 'completedWork'>): number {
  return Math.max(0, PALISADE_REQUIRED_WORK - record.completedWork)
}

/** True once `record` has accumulated `PALISADE_REQUIRED_WORK` of active
 *  work (plan §12) — the single completion authority every system
 *  (collision, Work Contracts, interaction/HUD) reads instead of comparing
 *  `completedWork` directly. */
export function isPalisadeConstructionComplete(record: Pick<PalisadeSegmentRecord, 'completedWork'>): boolean {
  return record.completedWork >= PALISADE_REQUIRED_WORK
}

/** Gaze prompt for a segment (plan items-player-017 §15) — an unfinished
 *  segment offers `[E]` construction work alongside the existing `[R]`
 *  removal (plan §17: removal must stay available mid-construction); a
 *  completed segment keeps exactly its pre-plan removal-only prompt. */
export function palisadePromptLabel(record: Pick<PalisadeSegmentRecord, 'completedWork'>): string {
  if (isPalisadeConstructionComplete(record)) return '[R] Usuń segment palisady'
  return `[E] Buduj segment palisady (${formatHours(record.completedWork)}/${formatHours(PALISADE_REQUIRED_WORK)} h) · [R] Usuń`
}

/** World-space (x, z) of a segment's two ends — `back` is the end a new
 *  segment snaps *onto*, `front` the end it extends *from* when this segment
 *  is itself the one being placed. Derived purely from `(x, z, yaw)`, same
 *  rotate-then-translate convention `world/collision.ts`'s `ObbCollider`
 *  uses: `rotation.y = yaw` maps local +Z to world `(sin(yaw), cos(yaw))`. */
export function palisadeEndpoints(
  segment: { x: number, z: number, yaw: number },
): { back: { x: number, z: number }, front: { x: number, z: number } } {
  const dx = Math.sin(segment.yaw) * PALISADE_HALF_LENGTH
  const dz = Math.cos(segment.yaw) * PALISADE_HALF_LENGTH
  return {
    back: { x: segment.x - dx, z: segment.z - dz },
    front: { x: segment.x + dx, z: segment.z + dz },
  }
}

/** Nearest existing segment endpoint to `aim` within `radius`, or `null` if
 *  none qualifies (plan §4/implementation notes §4) — a bounded local search
 *  over already-placed segments, never a global scan. Deterministic
 *  tie-break: distance, then segment id, then `back` before `front`, so equal
 *  ties never depend on array/iteration order. */
export function nearestPalisadeConnection(
  aim: { x: number, z: number },
  segments: readonly PalisadeSegmentRecord[],
  radius: number,
): { x: number, z: number } | null {
  let best: { x: number, z: number, id: string, endpoint: 0 | 1, distSq: number } | null = null
  const radiusSq = radius * radius
  for (const segment of segments) {
    const { back, front } = palisadeEndpoints(segment)
    for (const [point, endpoint] of [[back, 0], [front, 1]] as const) {
      const dx = point.x - aim.x
      const dz = point.z - aim.z
      const distSq = dx * dx + dz * dz
      if (distSq > radiusSq) continue
      if (
        best === null
        || distSq < best.distSq
        || (distSq === best.distSq && (segment.id < best.id || (segment.id === best.id && endpoint < best.endpoint)))
      ) {
        best = { x: point.x, z: point.z, id: segment.id, endpoint, distSq }
      }
    }
  }
  return best ? { x: best.x, z: best.z } : null
}

/** Resolves the final placement transform for a new segment (plan §4): if
 *  `aim` lands within `snapRadius` of an existing segment's endpoint, the new
 *  segment's own `back` endpoint is snapped exactly onto that point and it
 *  extends along `aim.yaw` (the player's current facing — free to differ
 *  from the neighbour's own yaw, which is what forms a corner). Otherwise
 *  `aim` is used unchanged. Pure — callers must still re-run ground/object
 *  validation on the result (implementation notes §4: preview is never
 *  authoritative). */
export function resolvePalisadeSite(
  aim: { x: number, z: number, yaw: number },
  segments: readonly PalisadeSegmentRecord[],
  snapRadius: number = PALISADE_SNAP_RADIUS,
): { x: number, z: number, yaw: number } {
  const connection = nearestPalisadeConnection(aim, segments, snapRadius)
  if (!connection) return aim
  return {
    x: connection.x + Math.sin(aim.yaw) * PALISADE_HALF_LENGTH,
    z: connection.z + Math.cos(aim.yaw) * PALISADE_HALF_LENGTH,
    yaw: aim.yaw,
  }
}
