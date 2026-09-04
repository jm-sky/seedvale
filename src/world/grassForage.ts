import { createSeededRandom } from './parseSeed'

/**
 * Deterministic grass forage patch placement + depletion (plan fauna-010
 * §3/§4) — the physical, consumable replacement for the old abstract
 * "any suitable terrain point" herbivore forage. Pure domain logic, no
 * `THREE`/scene access (that lives in `createGrassForagePatches.ts`, the
 * same domain/runtime split `world/beehives.ts` vs `world/createBeehives.ts`
 * already uses).
 *
 * A patch's position/identity is never persisted: the same `(cellX, cellZ,
 * seed)` always regenerates the same candidate, so only the sparse
 * depletion override (`GrassForageOverrides`) needs to round-trip — same
 * "deterministic presence + sparse override + lazy world-time resolution"
 * idiom as `world/treeLifecycle.ts`.
 *
 * @domain fauna
 * @system grass-forage
 * @role Owns deterministic patch placement and depletion/regrowth state.
 * @owns GrassForageOverrides
 */
export const GRASS_PATCH_CELL_SIZE = 5
/** Fraction of grid cells that actually hold a patch — keeps forage a
 *  scattered, small set of gameplay sources, not a carpet (plan fauna-010
 *  "Performance"). */
export const GRASS_PATCH_EXISTS_CHANCE = 0.35
export const GRASS_PATCH_JITTER = GRASS_PATCH_CELL_SIZE * 0.35
/** In-game days a consumed patch stays depleted before it's available again
 *  — resolved lazily against `nowDays`, never a per-frame growth tick. */
export const GRASS_REGROWTH_DAYS = 1

export type GrassPatchCandidate = { id: string, x: number, z: number }

function hashCell(cx: number, cz: number, seed: number): number {
  let h = (cx * 668265263 + cz * 374761393 + seed * 2654435761) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  return (h ^ (h >>> 16)) >>> 0
}

export function grassPatchCellCoord(x: number, z: number): { cx: number, cz: number } {
  return { cx: Math.floor(x / GRASS_PATCH_CELL_SIZE), cz: Math.floor(z / GRASS_PATCH_CELL_SIZE) }
}

export function grassPatchId(cx: number, cz: number): string {
  return `gf:${cx}:${cz}`
}

/** Deterministic single-cell candidate — same `(cx, cz, seed)` always yields
 *  the same existence roll and jittered position. `null` when this cell
 *  doesn't hold a patch at all (`GRASS_PATCH_EXISTS_CHANCE`). */
export function grassPatchCandidate(cx: number, cz: number, seed: number): GrassPatchCandidate | null {
  const random = createSeededRandom(hashCell(cx, cz, seed))
  const exists = random() < GRASS_PATCH_EXISTS_CHANCE
  const jitterX = (random() * 2 - 1) * GRASS_PATCH_JITTER
  const jitterZ = (random() * 2 - 1) * GRASS_PATCH_JITTER
  if (!exists) return null
  const centerX = (cx + 0.5) * GRASS_PATCH_CELL_SIZE
  const centerZ = (cz + 0.5) * GRASS_PATCH_CELL_SIZE
  return { id: grassPatchId(cx, cz), x: centerX + jitterX, z: centerZ + jitterZ }
}

/** Every existing, terrain-suitable patch within `radius` of `(x, z)` —
 *  bounded grid scan, never a global sweep (plan fauna-010 "Performance").
 *  `isSuitable` (terrain-only: height/water/openness) is caller-supplied so
 *  this stays pure/testable; dynamic obstacles (colliders, player builds)
 *  are deliberately not consulted here — see `AnimalAgent.findGrassPatchTarget`,
 *  which applies its own live `isWalkable` on top without changing which
 *  cells "have grass". */
export function grassPatchCandidatesNear(
  x: number,
  z: number,
  radius: number,
  seed: number,
  isSuitable?: (x: number, z: number) => boolean,
): GrassPatchCandidate[] {
  const out: GrassPatchCandidate[] = []
  const { cx: cx0, cz: cz0 } = grassPatchCellCoord(x - radius, z - radius)
  const { cx: cx1, cz: cz1 } = grassPatchCellCoord(x + radius, z + radius)
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const candidate = grassPatchCandidate(cx, cz, seed)
      if (!candidate) continue
      if (Math.hypot(candidate.x - x, candidate.z - z) > radius) continue
      if (isSuitable && !isSuitable(candidate.x, candidate.z)) continue
      out.push(candidate)
    }
  }
  return out
}

/** Sparse depletion overrides — `patchId -> availableAtDays`. An id absent
 *  here is untouched (available). Mutated in place by `depleteGrassPatch`;
 *  round-trips directly as `SaveData.grassForagePatches`. */
export type GrassForageOverrides = Record<string, number>

export function isGrassPatchAvailable(overrides: GrassForageOverrides, id: string, nowDays: number): boolean {
  const availableAt = overrides[id]
  return availableAt === undefined || nowDays >= availableAt
}

/** Mutates `overrides` in place, depleting `id` until `nowDays +
 *  GRASS_REGROWTH_DAYS`. Returns `false` (no mutation) when already
 *  depleted, so two animals racing for the same patch can't both consume it
 *  — the first completed call wins (plan fauna-010 §3/§4). */
export function depleteGrassPatch(overrides: GrassForageOverrides, id: string, nowDays: number): boolean {
  if (!isGrassPatchAvailable(overrides, id, nowDays)) return false
  overrides[id] = nowDays + GRASS_REGROWTH_DAYS
  return true
}

/** Drops overrides that have regrown, keeping the persisted set sparse
 *  (plan fauna-010 "Persistence"). Idempotent, safe to call anytime. */
export function pruneGrassForageOverrides(overrides: GrassForageOverrides, nowDays: number): void {
  for (const id of Object.keys(overrides)) {
    if (nowDays >= overrides[id]!) delete overrides[id]
  }
}
