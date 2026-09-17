/** Deterministic low-value loot for adventure-cave crates
 *  (plan world-terrain-037). Separate from treasure profiles — these are
 *  environmental supplies, never coins/gems/quest items.
 *
 * @domain world-terrain
 */

import type { ItemKind } from '../../items/items'
import { createSeededRandom } from '../parseSeed'

/** Cheap ordinary kinds allowed in adventure cave crates. */
export const CAVE_CRATE_LOOT_KINDS = [
  'rope',
  'wooden_torch',
  'bread',
  'branch',
  'blanket',
  'hide',
] as const satisfies readonly ItemKind[]

export type CaveCrateLootKind = (typeof CAVE_CRATE_LOOT_KINDS)[number]

/** Chance the crate opens empty (plan: 20–35%). */
export const CAVE_CRATE_EMPTY_CHANCE = 0.3

/** Chance of a second distinct allowlisted kind after the primary roll. */
export const CAVE_CRATE_SECOND_ITEM_CHANCE = 0.2

const PRIMARY_WEIGHTS: readonly { kind: CaveCrateLootKind, weight: number }[] = [
  { kind: 'rope', weight: 2 },
  { kind: 'wooden_torch', weight: 2 },
  { kind: 'bread', weight: 2 },
  { kind: 'branch', weight: 2 },
  { kind: 'blanket', weight: 1 },
  { kind: 'hide', weight: 1 },
]

function hashMix(seed: number, salt: number): number {
  let h = (seed ^ salt) | 0
  h = Math.imul(h ^ (h >>> 16), 2246822519)
  h = Math.imul(h ^ (h >>> 13), 3266489917)
  return (h ^ (h >>> 16)) >>> 0
}

function hashString(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rngFor(worldSeed: number, ...parts: string[]): () => number {
  let h = worldSeed >>> 0
  for (const part of parts) h = hashMix(h, hashString(part))
  return createSeededRandom(h)
}

function pickWeighted<T>(rng: () => number, entries: readonly { kind: T, weight: number }[]): T {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0)
  let cursor = rng() * total
  for (const entry of entries) {
    cursor -= entry.weight
    if (cursor <= 0) return entry.kind
  }
  return entries[entries.length - 1]!.kind
}

function rollStack(rng: () => number): number {
  return rng() < 0.55 ? 1 : 2
}

/**
 * Pure deterministic cave-crate contents from world seed + stable anchor id.
 * May return `{}` (empty crate). Never rolls treasure-tier loot.
 *
 * @domain world-terrain
 */
export function generateCaveCrateLoot(
  worldSeed: number,
  anchorId: string,
): Partial<Record<ItemKind, number>> {
  const rng = rngFor(worldSeed, anchorId, 'cave-crate-loot')
  if (rng() < CAVE_CRATE_EMPTY_CHANCE) return {}

  const primary = pickWeighted(rng, PRIMARY_WEIGHTS)
  const counts: Partial<Record<ItemKind, number>> = {
    [primary]: rollStack(rng),
  }

  if (rng() < CAVE_CRATE_SECOND_ITEM_CHANCE) {
    const remaining = PRIMARY_WEIGHTS.filter((entry) => entry.kind !== primary)
    if (remaining.length > 0) {
      const secondary = pickWeighted(rng, remaining)
      counts[secondary] = rollStack(rng)
    }
  }

  return counts
}

/** True when every key is in the allowlist and every quantity is 1 or 2. */
export function isValidCaveCrateLoot(counts: Partial<Record<ItemKind, number>>): boolean {
  const allow = new Set<string>(CAVE_CRATE_LOOT_KINDS)
  for (const [kind, qty] of Object.entries(counts)) {
    if (!allow.has(kind)) return false
    if (qty === undefined || qty < 1 || qty > 2) return false
  }
  return true
}
