import type { RawSampleParams } from '../terrain/chunkHeightmap'
import { deleteSeedRecord, getSeedRecord, putSeedRecord, touchSeedLastUsed } from '../persistence/seedDb'
import { minimalSeedRecord } from '../persistence/seedRecord'
import { deleteCacheForSeed } from '../persistence/worldgenCacheDb'
import { generateSeedName, sampleStartupTerrainProfile } from './locations/seedProfile'
import { randomSeed } from './parseSeed'

/**
 * @domain world
 * @system seed-library
 * @role New Game seed-intent resolution + lifecycle orchestration (plan
 *  world-015 §3/§10/§13) — the single seam both New Game entrypoints (boot
 *  `StartScreen`, in-app pause menu) go through, so "reuse an existing seed"
 *  can never quietly fall back to `randomSeed()`.
 * @uses SeedRecord
 */

export type SeedChoice = { kind: 'existing', seed: number } | { kind: 'generate' }

async function createSeedRecordForNewSeed(seed: number, buildSampleParams: (seed: number) => RawSampleParams): Promise<void> {
  // Cheap startup-area profile only (plan §5) — a handful of direct terrain
  // samples at fixed offsets, never `WorldLocationCatalog.landmarksInRange()`
  // or any chunk/location generation.
  const profile = sampleStartupTerrainProfile(buildSampleParams(seed))
  await putSeedRecord(minimalSeedRecord(seed, generateSeedName(seed, profile)))
}

/** New Game seed intent → concrete seed number. `buildSampleParams` lets the
 *  caller supply whatever `RawSampleParams` the actual new world will use
 *  (the live in-app `WorldConfig` for the pause-menu entrypoint, a fresh
 *  `createWorldConfig()` overlay for the boot entrypoint) without this
 *  module depending on either call site's config shape. */
export async function resolveNewGameSeed(choice: SeedChoice, buildSampleParams: (seed: number) => RawSampleParams): Promise<number> {
  if (choice.kind === 'existing') {
    await touchSeedLastUsed(choice.seed)
    return choice.seed
  }
  const seed = randomSeed()
  await createSeedRecordForNewSeed(seed, buildSampleParams)
  return seed
}

/** Lazy backfill (plan §3/§13) for saves that predate the Seed Library, or a
 *  totally-fresh boot seed with no save at all yet — never builds a world,
 *  just ensures a minimal record exists so the seed is visible/manageable.
 *  An existing record (user metadata included) is always left untouched. */
export async function ensureSeedRecordsForSeeds(seeds: readonly number[]): Promise<void> {
  for (const seed of new Set(seeds)) {
    const existing = await getSeedRecord(seed)
    if (existing) continue
    // No active world to sample here — same seed-only fallback
    // `generateSeedName` already defines for a missing profile.
    await putSeedRecord(minimalSeedRecord(seed, generateSeedName(seed)))
  }
}

export type DeleteSeedError = 'referenced'
export type DeleteSeedResult = { ok: true } | { ok: false, error: DeleteSeedError }

/** `Delete seed` (plan §10/§14) — guarded against the *current* save
 *  references (never a cached count on the record itself), and never
 *  cascades into deleting saves. */
export async function deleteSeedGuarded(seed: number, seedsInUseBySaves: ReadonlySet<number>): Promise<DeleteSeedResult> {
  if (seedsInUseBySaves.has(seed)) return { ok: false, error: 'referenced' }
  await deleteCacheForSeed(seed)
  await deleteSeedRecord(seed)
  return { ok: true }
}

/** `Clear cache` (plan §10) — disposable derived data only; `SeedRecord`
 *  metadata and every save referencing this seed are untouched. A caller
 *  with a live world running on this seed must separately invalidate that
 *  world's runtime/persistence catalog state — this module never holds a
 *  reference to a running `WorldBundle`. */
export async function clearSeedCache(seed: number): Promise<void> {
  await deleteCacheForSeed(seed)
}

export { listSeedRecords, renameSeedRecord, touchSeedLastUsed, updateSeedDescription, updateSeedTags } from '../persistence/seedDb'
export { displaySeedName } from '../persistence/seedRecord'
export type { SeedRecord } from '../persistence/seedRecord'
export { countCacheForSeed } from '../persistence/worldgenCacheDb'
