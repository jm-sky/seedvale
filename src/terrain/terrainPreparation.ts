import { WATER_MARGIN } from '../items/tentPlacement'
import { apronOriginWorld } from './chunkHeightmap'
import { type DigEnv, isRockGround } from './dig'

/**
 * Terrain modification & land preparation — pure domain logic (plan
 * `world-terrain-002`). Deliberately free of `THREE`/scene/`ChunkManager`,
 * same split as `world/playerWell.ts` vs `world/createPlayerWells.ts`: this
 * module only resolves which exact terrain-grid samples an action touches
 * and how much work it costs, never mutates terrain itself.
 *
 * `Wyrównaj`'s fixed 3×3 neighborhood and `Przygotuj teren`'s metre-sized
 * footprint both resolve onto the *same* global sample grid the streamed
 * terrain already uses (`chunkHeightmap.ts`'s `apronOriginWorld` step) —
 * reusing chunk (0,0)'s apron origin as the grid's phase is safe because
 * every chunk shares the identical step/phase by construction (that's what
 * keeps chunk-seam texels matching in `applyModificationToTile`).
 */

export type PreparationSize = 2 | 3 | 4 | 9

export type GridSample = { x: number, z: number }
export type HeightSample = GridSample & { height: number }

/** Active `Przygotuj teren` work (plan `world-terrain-002` §4) — a compact,
 *  serializable data record, not an `Object3D`/manager: the marker/visual is
 *  derived runtime state (`world/createTerrainPreparations.ts`), and the
 *  active long-running work session (`app/actions/terrainPreparationActions.ts`)
 *  is the only thing that ever advances `completedWork`. There is one active
 *  preparation identity and one lifecycle — no separate player/action/terrain
 *  copies of progress. `originalHeights` is captured once, at confirmation,
 *  and is immutable for the record's lifetime: every progressive height is
 *  always re-derived from it (`progressiveHeights`), never accumulated.
 *  Deleted outright on completion — there is no permanent `PreparedTerrain`
 *  state (plan §8/§12). */
export type TerrainPreparationRecord = {
  id: string
  center: GridSample
  size: PreparationSize
  targetHeight: number
  originalHeights: readonly HeightSample[]
  requiredWork: number
  completedWork: number
  /** Always `'active'` while a record exists — completion deletes the record
   *  outright rather than transitioning it to a terminal status (plan §4's
   *  field list, kept for forward-compatibility/clarity rather than a
   *  meaningful second state today). */
  status: 'active'
}

/** World-space grid step + phase, shared by every chunk (see module doc). */
function gridOrigin(chunkSize: number, resolution: number): { x: number, z: number, step: number } {
  const o = apronOriginWorld(0, 0, chunkSize, resolution)
  return { x: o.x, z: o.z, step: o.step }
}

/** Nearest terrain-grid vertex to an arbitrary world point — the anchor both
 *  `Wyrównaj` and `Przygotuj teren` snap their "selected point"/"central
 *  sample" to, so the target height always reads back exactly (bilinear
 *  sampling at an exact grid point degenerates to that point's own value). */
export function nearestGridPoint(x: number, z: number, chunkSize: number, resolution: number): GridSample {
  const o = gridOrigin(chunkSize, resolution)
  const ix = Math.round((x - o.x) / o.step)
  const iz = Math.round((z - o.z) / o.step)
  return { x: o.x + ix * o.step, z: o.z + iz * o.step }
}

/** `Wyrównaj` — the fixed 3×3 block of nearest terrain samples around
 *  `(x, z)` (the selected point's own nearest grid vertex, plus its 8 grid
 *  neighbors). Always exactly 9 samples, independent of the configured
 *  terrain resolution — a sample count, not a metre size. */
export function resolveLevelSamples(x: number, z: number, chunkSize: number, resolution: number): GridSample[] {
  const o = gridOrigin(chunkSize, resolution)
  const cx = Math.round((x - o.x) / o.step)
  const cz = Math.round((z - o.z) / o.step)
  const samples: GridSample[] = []
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      samples.push({ x: o.x + (cx + dx) * o.step, z: o.z + (cz + dz) * o.step })
    }
  }
  return samples
}

/** Number of samples per side `resolvePreparationSamples` resolves for a
 *  given metre size — exposed separately so the preview mesh
 *  (`world/terrainPreparationPreview.ts`) can size its interior grid lines
 *  without re-deriving the same formula. */
export function preparationSamplesPerSide(sizeMeters: PreparationSize, chunkSize: number, resolution: number): number {
  const step = gridOrigin(chunkSize, resolution).step
  return Math.max(2, Math.round(sizeMeters / step) + 1)
}

/** `Przygotuj teren` — every terrain-grid sample covered by a `sizeMeters` ×
 *  `sizeMeters` axis-aligned world-space square centered on `(x, z)`'s
 *  nearest grid vertex. The square's metre size is converted to a sample
 *  count via the terrain's own step (`Math.round(sizeMeters / step) + 1`
 *  samples per side, e.g. 3 at the default ~1 m step for a 2 m area) rather
 *  than hard-coding a sample count — a coarser/finer configured resolution
 *  changes how many samples a given metre size covers, per the plan's "use
 *  the terrain system's existing sampling/resolution." When that count is
 *  even, the footprint is centered as closely as the grid allows (offset by
 *  up to half a step) rather than snapping to an odd count — a documented,
 *  minor quantization, not a correctness issue. */
export function resolvePreparationSamples(
  x: number,
  z: number,
  sizeMeters: PreparationSize,
  chunkSize: number,
  resolution: number,
): { center: GridSample, samples: GridSample[] } {
  const o = gridOrigin(chunkSize, resolution)
  const cx = Math.round((x - o.x) / o.step)
  const cz = Math.round((z - o.z) / o.step)
  const perSide = preparationSamplesPerSide(sizeMeters, chunkSize, resolution)
  const before = Math.floor((perSide - 1) / 2)
  const after = Math.ceil((perSide - 1) / 2)
  const samples: GridSample[] = []
  for (let dz = -before; dz <= after; dz++) {
    for (let dx = -before; dx <= after; dx++) {
      samples.push({ x: o.x + (cx + dx) * o.step, z: o.z + (cz + dz) * o.step })
    }
  }
  return { center: { x: o.x + cx * o.step, z: o.z + cz * o.step }, samples }
}

/** Maximum single-sample height change a preparation may request (plan §3,
 *  raised from `3` by plan `ui-input-004` §8 — a balance value, not an
 *  architectural one, kept as this single exported constant so it can be
 *  retuned without touching validation code). */
export const MAX_PREPARATION_DELTA = 6

/** Every affected sample must stay within `MAX_PREPARATION_DELTA` of its own
 *  original height — checked against the immutable original snapshot, never
 *  the live terrain (plan §3/implementation notes §6). */
export function exceedsMaxDeformation(originalHeights: readonly HeightSample[], targetHeight: number): boolean {
  return originalHeights.some((s) => Math.abs(targetHeight - s.height) > MAX_PREPARATION_DELTA)
}

/** `minimumWork` — one in-game hour of active work at base (shovel-only) tool
 *  speed (plan §5). `workScale` is a chosen constant (not derived from a
 *  larger volume/soil model, per the plan's "deliberately simple work
 *  model") sized so a typical 2–4 m² area with a modest height change still
 *  lands within a few multiples of `minimumWork`, matching the scale of
 *  `world/playerWell.ts`'s `WELL_STAGE_WORK_HOURS`.
 *
 *  Future terrain simulation may want to account for actual soil/rock
 *  material and cut/fill volume instead of this flat area×delta proxy (plan
 *  §10) — intentionally out of scope here. */
export const MINIMUM_PREPARATION_WORK_HOURS = 1
const WORK_SCALE = 0.5

export function computeRequiredWork(area: number, averageAbsHeightDelta: number): number {
  return Math.max(MINIMUM_PREPARATION_WORK_HOURS, area * averageAbsHeightDelta * WORK_SCALE)
}

export function averageAbsHeightDelta(originalHeights: readonly HeightSample[], targetHeight: number): number {
  if (originalHeights.length === 0) return 0
  const total = originalHeights.reduce((sum, s) => sum + Math.abs(targetHeight - s.height), 0)
  return total / originalHeights.length
}

/** Tool speed multiplier (plan §5) — additive, shovel-mandatory. `hasKnife`/
 *  `hasPickaxe` are inventory *capability* checks (`branch_trimming`/
 *  `rock_mining`), not "currently held in the single tool slot" — matching
 *  `world/playerWell.ts`'s work-session tool resolution, since a player can
 *  own multiple tools at once but hold only one. */
export function toolSpeedMultiplier(hasKnife: boolean, hasPickaxe: boolean): number {
  let multiplier = 1
  if (hasKnife) multiplier += 0.05
  if (hasPickaxe) multiplier += 0.1
  return multiplier
}

/** Deterministic progressive height for one sample at a given progress
 *  fraction (plan §6) — always derived from the immutable original height,
 *  never accumulated, so repeated calls at the same `progress` are
 *  idempotent and interruption/resume/save-load reproduce the exact same
 *  result. */
export function progressiveHeight(originalHeight: number, targetHeight: number, progress: number): number {
  const clamped = Math.max(0, Math.min(1, progress))
  return originalHeight + (targetHeight - originalHeight) * clamped
}

export function progressiveHeights(
  originalHeights: readonly HeightSample[],
  targetHeight: number,
  progress: number,
): HeightSample[] {
  return originalHeights.map((s) => ({ x: s.x, z: s.z, height: progressiveHeight(s.height, targetHeight, progress) }))
}

export type PreparationValidationResult =
  | { ok: true, requiresPickaxe: boolean }
  | { ok: false, reason: 'water' | 'deformation' }

/** Full-area validation (plan §3) against the immutable original snapshot —
 *  every affected sample must clear the water margin and the deformation
 *  cap; no partial preparation may be created when one sample fails. Reuses
 *  `terrain/dig.ts`'s existing water-margin/mountain-ridge queries (the same
 *  ones shovel/pickaxe digging already use) rather than a parallel
 *  terrain-validity system. `requiresPickaxe` is true when any sample sits
 *  on bare mountain rock — mountain/rocky terrain needs both shovel and
 *  pickaxe (plan §3). */
export function validatePreparationSamples(
  originalHeights: readonly HeightSample[],
  targetHeight: number,
  env: DigEnv,
): PreparationValidationResult {
  for (const s of originalHeights) {
    if (s.height <= env.waterLevel + WATER_MARGIN) return { ok: false, reason: 'water' }
  }
  if (exceedsMaxDeformation(originalHeights, targetHeight)) return { ok: false, reason: 'deformation' }
  const requiresPickaxe = originalHeights.some((s) => isRockGround(s.x, s.z, env))
  return { ok: true, requiresPickaxe }
}

export function formatHeightDelta(meters: number): string {
  const sign = meters > 0 ? '+' : ''
  return `${sign}${meters.toFixed(2)} m`
}
