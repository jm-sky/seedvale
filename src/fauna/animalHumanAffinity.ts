/**
 * @domain fauna
 * @role Stable human identity + sparse per-animal affinity helpers (plan
 *  fauna-013). Affinity is individual animal → concrete person; it does not
 *  replace `ownerHouseId` / household familiarity.
 */

/** Stable namespaced id for the player in fauna-facing systems. */
export const FAUNA_PLAYER_HUMAN_ID = 'player'

/** Future NPC hand-feed / dog familiarity uses the same namespace. */
export function faunaNpcHumanId(npcId: string): string {
  return `npc:${npcId}`
}

export type AnimalAffinitySaveEntry = { humanId: string, value: number }

export type SparseHumanAffinity = Map<string, number>

export function clampAffinity(value: number, max: number): number {
  return Math.max(0, Math.min(max, value))
}

/** Applies a bounded gain; creates the map entry on first real change. */
export function applyAffinityGain(
  map: SparseHumanAffinity,
  humanId: string,
  gain: number,
  max: number,
): number {
  const prev = map.get(humanId) ?? 0
  const next = clampAffinity(prev + gain, max)
  map.set(humanId, next)
  return next
}

export function isAffinityTrusted(value: number, trustedThreshold: number): boolean {
  return value >= trustedThreshold
}

export function serializeHumanAffinity(map: SparseHumanAffinity | null): AnimalAffinitySaveEntry[] | undefined {
  if (!map || map.size === 0) return undefined
  return [...map.entries()].map(([humanId, value]) => ({ humanId, value }))
}

export function deserializeHumanAffinity(entries: AnimalAffinitySaveEntry[] | undefined): SparseHumanAffinity | null {
  if (!entries || entries.length === 0) return null
  const map = new Map<string, number>()
  for (const entry of entries) map.set(entry.humanId, entry.value)
  return map
}
