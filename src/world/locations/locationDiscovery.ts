import type { WorldLocationCatalog } from './worldLocationCatalog'
import type { DiscoveryRange, WorldLocation } from './worldLocationTypes'
import { FAR_RANGE_KM, kmToDays, MEDIUM_RANGE_KM, NEAR_RANGE_KM, worldUnitsToKm } from './locationConfig'

export function classifyRange(km: number): DiscoveryRange {
  if (km <= NEAR_RANGE_KM) return 'near'
  if (km <= MEDIUM_RANGE_KM) return 'medium'
  return 'far'
}

export function isWithinRange(km: number, range: DiscoveryRange): boolean {
  if (range === 'near') return km <= NEAR_RANGE_KM
  if (range === 'medium') return km <= MEDIUM_RANGE_KM
  return km <= FAR_RANGE_KM
}

/** "37 km · około 2 dni drogi" (plan §15) — player-facing, never the
 *  near/medium/far bucket itself. Polish `dzień/dni` isn't fully declined
 *  for every count (same accepted v1 simplification `ai/dialogueTemplates.ts`
 *  documents for its own flavor text). */
export function formatDistance(km: number): string {
  const rounded = Math.round(km)
  const days = kmToDays(km)
  const daysLabel = days < 1 ? 'mniej niż dzień drogi' : days < 1.5 ? '1 dzień drogi' : `około ${Math.round(days)} dni drogi`
  return `${rounded} km · ${daysLabel}`
}

/** Highest `discoveryWeight` first, `id` as a stable tie-break so an equal-
 *  weight pool never reorders between calls on the same seed (notes §13). */
export function weightedTopN(locations: readonly WorldLocation[], n: number): WorldLocation[] {
  return [...locations]
    .sort((a, b) => b.discoveryWeight - a.discoveryWeight || a.id.localeCompare(b.id))
    .slice(0, n)
}

/** Fisher-Yates using a caller-supplied `rng` (production: `Math.random`;
 *  tests: a seeded stream) — keeps the "which locations does this
 *  conversation reveal" pick testable without hard-coding `Math.random`
 *  into the selection logic itself (notes §11/§13). */
export function pickRandomSubset<T>(pool: readonly T[], count: number, rng: () => number): T[] {
  const shuffled = [...pool]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
  }
  return shuffled.slice(0, Math.min(count, shuffled.length))
}

/** Picks a random reveal count in `[min, max]` (plan §7 "1-3 lokacje"), then
 *  a random subset of that size from `pool` — both via the same `rng`. */
export function pickRandomReveal<T>(pool: readonly T[], min: number, max: number, rng: () => number): T[] {
  const count = min + Math.floor(rng() * (max - min + 1))
  return pickRandomSubset(pool, count, rng)
}

function locationDistanceKm(loc: WorldLocation, x: number, z: number): number {
  return worldUnitsToKm(Math.hypot(loc.x - x, loc.z - z))
}

/** `catalog.landmarksWithin` is always "everything up to `maxKm`" — this
 *  narrows that to a `(minKm, maxKm]` band, e.g. the merchant's Far Map
 *  (plan §9), which must draw only from its own `far` bucket (60-200 km)
 *  so it never repeats what the Near Map (0-20 km) already reveals. */
export function landmarksInBand(
  catalog: WorldLocationCatalog,
  x: number,
  z: number,
  minKm: number,
  maxKm: number,
): WorldLocation[] {
  return catalog.landmarksWithin(x, z, maxKm).filter((loc) => locationDistanceKm(loc, x, z) > minKm)
}

export function settlementsInBand(
  catalog: WorldLocationCatalog,
  x: number,
  z: number,
  minKm: number,
  maxKm: number,
): WorldLocation[] {
  return catalog.nearestSettlements(x, z, maxKm).filter((loc) => locationDistanceKm(loc, x, z) > minKm)
}
