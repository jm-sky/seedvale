import { createSeededRandom } from '../world/parseSeed'
import { type TreasureSiteDefinition, treasureSiteForContainer } from '../world/treasureSites'
import { Inventory } from './Inventory'
import { itemIsResilient } from './itemCatalog'
import { type ItemKind } from './items'

/**
 * Deterministic systemic treasure loot, force-entry and trap resolution
 * (plan items-player-026). Pure helpers plus one atomic commit of attempt
 * index + consequences. Does not own meshes, lock identity or player HP.
 *
 * @domain items-player
 */

export const TREASURE_COIN_MIN = 50
export const TREASURE_COIN_MAX = 200
export const BLADE_TRAP_DAMAGE = 22
export const FORCE_ENTRY_DURATION_SEC = 3.2

/** Adventure-cave chest loot tiers (plan world-terrain-020 Stage C). Ranges
 *  are deliberately disjoint — `CAVE_FINAL_COIN_MIN > CAVE_SIDE_COIN_MAX` —
 *  so "final is richer than side" is a provable range fact, not a
 *  probabilistic tendency. Final also always adds a guaranteed `gold` stack
 *  and a second, large-tier gemstone that `caveSide` never rolls. */
export const CAVE_SIDE_COIN_MIN = 60
export const CAVE_SIDE_COIN_MAX = 140
export const CAVE_FINAL_COIN_MIN = 220
export const CAVE_FINAL_COIN_MAX = 360
export const CAVE_FINAL_GOLD_MIN = 2
export const CAVE_FINAL_GOLD_MAX = 4

export type TreasureLootProfile = 'default' | 'caveSide' | 'caveFinal'

export type GenerateTreasureLootOptions = {
  profile?: TreasureLootProfile
}

export const GEMSTONE_KINDS = [
  'ruby_small',
  'ruby_medium',
  'ruby_large',
  'diamond_small',
  'diamond_medium',
  'diamond_large',
] as const

export type GemstoneKind = (typeof GEMSTONE_KINDS)[number]

export type TreasureTrapType = 'none' | 'fire' | 'blade'
export type TreasureMechanicalResult = 'opened_clean' | 'opened_damaged' | 'failed'
export type TreasureFireSeverity = 'contents_scorched' | 'chest_damaged' | 'chest_destroyed'

export type TreasureForceCapabilitySnapshot = {
  heldKind: ItemKind
  /** Quantized 0..20 so incidental float noise cannot reroll an attempt. */
  strengthBucket: number
}

export type TreasureChestMutation = {
  attemptIndex: number
  trapTriggered: boolean
  damaged: boolean
  destroyed: boolean
}

export const EMPTY_TREASURE_MUTATION: TreasureChestMutation = {
  attemptIndex: 0,
  trapTriggered: false,
  damaged: false,
  destroyed: false,
}

const GEMSTONE_WEIGHTS: ReadonlyArray<{ kind: GemstoneKind, weight: number }> = [
  { kind: 'ruby_small', weight: 22 },
  { kind: 'ruby_medium', weight: 22 },
  { kind: 'ruby_large', weight: 10 },
  { kind: 'diamond_small', weight: 18 },
  { kind: 'diamond_medium', weight: 18 },
  { kind: 'diamond_large', weight: 10 },
]

/** Guaranteed second gemstone for `caveFinal` — large tier only, so it is
 *  always at least as valuable as the best `caveSide` roll from
 *  `GEMSTONE_WEIGHTS`. */
const CAVE_FINAL_BONUS_GEMSTONE_WEIGHTS: ReadonlyArray<{ kind: GemstoneKind, weight: number }> = [
  { kind: 'ruby_large', weight: 1 },
  { kind: 'diamond_large', weight: 1 },
]

const ORDINARY_VULNERABLE_LOOT: readonly ItemKind[] = ['hide', 'bread', 'blanket']

const PRYING_QUALITY: Partial<Record<ItemKind, number>> = {
  pickaxe: 0.9,
  battle_axe: 0.75,
  axe: 0.55,
  pitchfork: 0.4,
}

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

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
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

export function isGemstoneKind(kind: ItemKind): kind is GemstoneKind {
  return (GEMSTONE_KINDS as readonly string[]).includes(kind)
}

export function quantizeStrength(strength: number): number {
  return Math.round(clamp01(strength) * 20)
}

export function pryingQuality(heldKind: ItemKind): number {
  return PRYING_QUALITY[heldKind] ?? 0
}

export function getTreasureMutation(
  mutations: ReadonlyMap<string, TreasureChestMutation>,
  containerId: string,
): TreasureChestMutation {
  return mutations.get(containerId) ?? EMPTY_TREASURE_MUTATION
}

export function mutationIsDefault(mutation: TreasureChestMutation): boolean {
  return (
    mutation.attemptIndex === 0
    && !mutation.trapTriggered
    && !mutation.damaged
    && !mutation.destroyed
  )
}

export function serializeTreasureMutations(
  mutations: ReadonlyMap<string, TreasureChestMutation>,
): Array<{
  containerId: string
  attemptIndex: number
  trapTriggered?: boolean
  damaged?: boolean
  destroyed?: boolean
}> {
  const rows: Array<{
    containerId: string
    attemptIndex: number
    trapTriggered?: boolean
    damaged?: boolean
    destroyed?: boolean
  }> = []
  for (const [containerId, mutation] of mutations) {
    if (mutationIsDefault(mutation)) continue
    rows.push({
      containerId,
      attemptIndex: mutation.attemptIndex,
      ...(mutation.trapTriggered ? { trapTriggered: true } : {}),
      ...(mutation.damaged ? { damaged: true } : {}),
      ...(mutation.destroyed ? { destroyed: true } : {}),
    })
  }
  return rows
}

/**
 * Initial physical chest contents. `profile` defaults to `'default'`, which
 * is the original systemic-treasure distribution (plan world-024/
 * items-player-026) and every existing caller keeps that exact behavior.
 * `caveSide` / `caveFinal` are the adventure-cave chest tiers (plan
 * world-terrain-020 Stage C): `caveFinal` is invariantly richer than
 * `caveSide` by disjoint coin ranges plus a guaranteed bonus gold stack and
 * large-tier gemstone `caveSide` never receives — see the tier constants
 * above.
 */
export function generateTreasureLoot(
  worldSeed: number,
  siteId: string,
  options?: GenerateTreasureLootOptions,
): Partial<Record<ItemKind, number>> {
  const profile = options?.profile ?? 'default'
  const rng = rngFor(worldSeed, siteId, 'loot')

  if (profile === 'caveSide') {
    const coins = CAVE_SIDE_COIN_MIN + Math.floor(rng() * (CAVE_SIDE_COIN_MAX - CAVE_SIDE_COIN_MIN + 1))
    const gem = pickWeighted(rng, GEMSTONE_WEIGHTS)
    return { coin: coins, [gem]: 1 }
  }

  if (profile === 'caveFinal') {
    const coins = CAVE_FINAL_COIN_MIN + Math.floor(rng() * (CAVE_FINAL_COIN_MAX - CAVE_FINAL_COIN_MIN + 1))
    const gold = CAVE_FINAL_GOLD_MIN + Math.floor(rng() * (CAVE_FINAL_GOLD_MAX - CAVE_FINAL_GOLD_MIN + 1))
    const gem = pickWeighted(rng, GEMSTONE_WEIGHTS)
    const bonusGem = pickWeighted(rng, CAVE_FINAL_BONUS_GEMSTONE_WEIGHTS)
    const counts: Partial<Record<ItemKind, number>> = { coin: coins, gold }
    counts[gem] = (counts[gem] ?? 0) + 1
    counts[bonusGem] = (counts[bonusGem] ?? 0) + 1
    return counts
  }

  const coins = TREASURE_COIN_MIN + Math.floor(rng() * (TREASURE_COIN_MAX - TREASURE_COIN_MIN + 1))
  const gem = pickWeighted(rng, GEMSTONE_WEIGHTS)
  const counts: Partial<Record<ItemKind, number>> = { coin: coins, [gem]: 1 }
  if (rng() < 0.4) {
    counts.gold = 1 + Math.floor(rng() * 3)
  }
  if (rng() < 0.35) {
    const extra = ORDINARY_VULNERABLE_LOOT[Math.floor(rng() * ORDINARY_VULNERABLE_LOOT.length)]!
    counts[extra] = 1
  }
  return counts
}

export function resolveTreasureTrap(worldSeed: number, siteId: string): TreasureTrapType {
  const roll = rngFor(worldSeed, siteId, 'trap')()
  if (roll < 0.5) return 'none'
  if (roll < 0.75) return 'fire'
  return 'blade'
}

export function resolveTreasureLockDifficulty(worldSeed: number, siteId: string): number {
  return 0.2 + rngFor(worldSeed, siteId, 'lock')() * 0.65
}

export function resolveMechanicalResult(
  containerId: string,
  attemptIndex: number,
  snapshot: TreasureForceCapabilitySnapshot,
  lockDifficulty: number,
): TreasureMechanicalResult {
  const rng = rngFor(
    0,
    containerId,
    String(attemptIndex),
    snapshot.heldKind,
    String(snapshot.strengthBucket),
    'mech',
  )
  const quality = pryingQuality(snapshot.heldKind)
  const strength = snapshot.strengthBucket / 20
  const pFail = clamp01(0.12 + lockDifficulty * 0.55 - quality * 0.35 - (strength - 0.5) * 0.25)
  const pDamaged = clamp01(0.22 + lockDifficulty * 0.2 - quality * 0.1)
  const roll = rng()
  if (roll < pFail) return 'failed'
  if (roll < pFail + pDamaged) return 'opened_damaged'
  return 'opened_clean'
}

export function resolveFireSeverity(
  containerId: string,
  attemptIndex: number,
): TreasureFireSeverity {
  const roll = rngFor(0, containerId, String(attemptIndex), 'fire')()
  if (roll < 0.55) return 'contents_scorched'
  if (roll < 0.85) return 'chest_damaged'
  return 'chest_destroyed'
}

export type TreasureContentsSnapshot = {
  counts: Partial<Record<ItemKind, number>>
}

export function snapshotTreasureContents(inventory: Inventory): TreasureContentsSnapshot {
  return { counts: { ...inventory.toJSON() } }
}

/**
 * Deterministic vulnerable losses from a pre-resolution snapshot.
 * `all` removes every vulnerable stack; `subset` removes a hashed subset.
 */
export function selectDestroyedContents(
  snapshot: TreasureContentsSnapshot,
  mode: 'none' | 'subset' | 'all',
  containerId: string,
  attemptIndex: number,
): Partial<Record<ItemKind, number>> {
  if (mode === 'none') return {}
  const losses: Partial<Record<ItemKind, number>> = {}
  const rng = rngFor(0, containerId, String(attemptIndex), 'contents')
  for (const [kind, count] of Object.entries(snapshot.counts) as [ItemKind, number][]) {
    if (count <= 0 || itemIsResilient(kind)) continue
    if (mode === 'all' || rng() < 0.65) losses[kind] = count
  }
  return losses
}

export function applyTreasureContentsLosses(
  inventory: Inventory,
  losses: Partial<Record<ItemKind, number>>,
): void {
  for (const [kind, amount] of Object.entries(losses) as [ItemKind, number][]) {
    if (amount > 0) inventory.remove(kind, amount)
  }
}

export type TreasureContainerInteraction =
  | { kind: 'not-treasure' }
  | { kind: 'remains' }
  | { kind: 'locked' }
  | { kind: 'open' }

export function describeTreasureContainerInteraction(
  sites: readonly TreasureSiteDefinition[],
  unlockedIds: ReadonlySet<string>,
  mutations: ReadonlyMap<string, TreasureChestMutation>,
  containerId: string,
): TreasureContainerInteraction {
  const site = treasureSiteForContainer(sites, containerId)
  if (!site) return { kind: 'not-treasure' }
  if (getTreasureMutation(mutations, containerId).destroyed) return { kind: 'remains' }
  if (unlockedIds.has(containerId)) return { kind: 'open' }
  return { kind: 'locked' }
}

export function treasureWorldContainerPrompt(
  sites: readonly TreasureSiteDefinition[],
  unlockedIds: ReadonlySet<string>,
  mutations: ReadonlyMap<string, TreasureChestMutation>,
  containerId: string,
): string | null {
  const interaction = describeTreasureContainerInteraction(sites, unlockedIds, mutations, containerId)
  if (interaction.kind === 'not-treasure') return null
  if (interaction.kind === 'remains') return '[E] Przeszukaj szczątki'
  if (interaction.kind === 'locked') return '[E] Otwórz skrzynię · [R] Wyłam'
  return '[E] Otwórz skrzynię'
}

export type ForcedEntryCommitInput = {
  worldSeed: number
  site: TreasureSiteDefinition
  inventory: Inventory
  unlockedIds: Set<string>
  mutations: Map<string, TreasureChestMutation>
  snapshot: TreasureForceCapabilitySnapshot
}

export type ForcedEntryCommitResult = {
  mechanical: TreasureMechanicalResult
  trap: TreasureTrapType
  trapTriggeredNow: boolean
  fireSeverity: TreasureFireSeverity | null
  destroyedVulnerable: Partial<Record<ItemKind, number>>
  opened: boolean
  damaged: boolean
  destroyed: boolean
  bladeDamage: number
  attemptIndex: number
}

/**
 * Atomically advances `attemptIndex` and applies mechanical/trap consequences.
 * Callers must invoke this only at the BusyAction completion/commit boundary.
 */
export function commitForcedEntry(input: ForcedEntryCommitInput): ForcedEntryCommitResult {
  const { worldSeed, site, inventory, unlockedIds, mutations, snapshot } = input
  const containerId = site.chest.containerId
  const current = getTreasureMutation(mutations, containerId)
  const lockDifficulty = resolveTreasureLockDifficulty(worldSeed, site.id)
  const mechanical = resolveMechanicalResult(containerId, current.attemptIndex, snapshot, lockDifficulty)
  const trap = resolveTreasureTrap(worldSeed, site.id)
  const trapTriggeredNow = trap !== 'none' && !current.trapTriggered
  const contents = snapshotTreasureContents(inventory)

  let fireSeverity: TreasureFireSeverity | null = null
  let destroyMode: 'none' | 'subset' | 'all' = 'none'
  if (mechanical === 'opened_damaged') destroyMode = 'subset'
  if (trapTriggeredNow && trap === 'fire') {
    fireSeverity = resolveFireSeverity(containerId, current.attemptIndex)
    destroyMode = 'all'
  }

  const destroyedVulnerable = selectDestroyedContents(
    contents,
    destroyMode,
    containerId,
    current.attemptIndex,
  )
  applyTreasureContentsLosses(inventory, destroyedVulnerable)

  const opened = mechanical === 'opened_clean' || mechanical === 'opened_damaged'
  const destroyed = fireSeverity === 'chest_destroyed'
  const damaged = mechanical === 'opened_damaged'
    || fireSeverity === 'chest_damaged'
    || fireSeverity === 'chest_destroyed'
    || current.damaged

  if (opened || destroyed) unlockedIds.add(containerId)

  const next: TreasureChestMutation = {
    attemptIndex: current.attemptIndex + 1,
    trapTriggered: current.trapTriggered || trapTriggeredNow,
    damaged: current.damaged || damaged,
    destroyed: current.destroyed || destroyed,
  }
  mutations.set(containerId, next)

  return {
    mechanical,
    trap,
    trapTriggeredNow,
    fireSeverity,
    destroyedVulnerable,
    opened,
    damaged: next.damaged,
    destroyed: next.destroyed,
    bladeDamage: trapTriggeredNow && trap === 'blade' ? BLADE_TRAP_DAMAGE : 0,
    attemptIndex: next.attemptIndex,
  }
}
