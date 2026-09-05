/**
 * @domain persistence
 * @system seed-library
 * @role Owns the `SeedRecord` shape and its validation (plan world-015 §1/§9).
 * @integration `SaveData.config.seed` (`saveData.ts`) stays the authoritative
 *  world identity for a given save; a `SeedRecord` is optional/manageable
 *  catalog metadata for the same number, never a requirement to load a save.
 */
export type SeedRecord = {
  seed: number
  createdAt: number
  lastUsedAt: number
  /** Set once at creation/profiling time and never changed automatically
   *  afterwards (plan §6) — a later gameplay session computing more of the
   *  world must not make the seed appear to change identity. */
  generatedName: string
  /** User metadata (plan §9) — independent of cache lifecycle; `Clear cache`
   *  and namespace/version invalidation must never touch these. */
  customName?: string
  description?: string
  tags: string[]
}

export function displaySeedName(record: Pick<SeedRecord, 'customName' | 'generatedName'>): string {
  return record.customName?.trim() || record.generatedName
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

export function isSeedRecord(value: unknown): value is SeedRecord {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  if (typeof r.seed !== 'number' || !Number.isFinite(r.seed)) return false
  if (typeof r.createdAt !== 'number') return false
  if (typeof r.lastUsedAt !== 'number') return false
  if (typeof r.generatedName !== 'string' || !r.generatedName) return false
  if (r.customName !== undefined && typeof r.customName !== 'string') return false
  if (r.description !== undefined && typeof r.description !== 'string') return false
  if (!isStringArray(r.tags)) return false
  return true
}

/** Minimal, self-consistent record for a seed we know nothing else about —
 *  used for lazy backfill (existing saves predating the Seed Library) and as
 *  a corruption fallback (plan §13): never guesses user metadata. */
export function minimalSeedRecord(seed: number, generatedName: string, now = Date.now()): SeedRecord {
  return { seed, createdAt: now, lastUsedAt: now, generatedName, tags: [] }
}
