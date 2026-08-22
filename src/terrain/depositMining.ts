import type { EconomicKind } from '../economy/kinds'
import type { ItemKind } from '../items/items'

/** Visible ore piles streamed by `ResourceDeposits` (plan 090). */
export type MineableOre = 'coal' | 'gold' | 'iron'

export const ORE_ITEM: Record<MineableOre, ItemKind> = {
  coal: 'coal',
  gold: 'gold',
  iron: 'iron',
}

export const ORE_YIELD_LABEL: Record<MineableOre, string> = {
  coal: 'Węgiel',
  gold: 'Złoto',
  iron: 'Żelazo',
}

/** Real-time seconds for the player pickaxe channel (plan 090). */
export const MINE_DURATION_SEC = 1.6

export function isMineableOre(type: string): type is MineableOre {
  return type === 'coal' || type === 'gold' || type === 'iron'
}

/** 3–7 hits from deposit richness (0..1). */
export function hitsForRichness(richness: number): number {
  const t = Math.min(1, Math.max(0, richness))
  return 3 + Math.round(t * 4)
}

/** Authoritative mining-hits-remaining override, keyed by `NaturalResource.id`
 *  (plan 198) — sparse and caller-owned (same "survives its runtime
 *  representation's dispose/recreate, reset only on a genuinely new world"
 *  contract as `collectedItemIds`/`removedCropIds` in `worldBundle.ts`), so a
 *  `ResourceDeposits` runtime instance never re-derives an already-mined
 *  deposit's initial hit count from scratch. No entry means "use the
 *  deterministic `hitsForRichness` initial value"; an entry of `0` means the
 *  deposit is depleted — those two states must stay distinguishable. */
export type ResourceDepletionState = Map<string, number>

/** Hits remaining for `id` — an existing override (including `0`, meaning
 *  depleted) wins over the deterministic initial value from `richness`. */
export function resolveRemaining(
  state: ResourceDepletionState,
  id: string,
  richness: number,
): number {
  return state.get(id) ?? hitsForRichness(richness)
}

export function isDepleted(state: ResourceDepletionState, id: string): boolean {
  return state.get(id) === 0
}

/** Record a mining hit's result — call this at the same place `remaining` is
 *  decremented, never separately, so the two can't drift apart. */
export function recordMined(state: ResourceDepletionState, id: string, remaining: number): void {
  state.set(id, remaining)
}

export function yieldForOre(type: MineableOre): { kind: ItemKind, count: number } {
  return { kind: ORE_ITEM[type], count: 1 }
}

/** `MineableOre`'s literal names are also valid `EconomicKind`s (plan 131) —
 *  identity mapping from NPC-carried ore `ItemKind` to settlement raw stock,
 *  no lookup table needed (see `economy/kinds.ts`'s `EconomicKind` doc). */
export function oreEconomicKind(type: MineableOre): EconomicKind {
  return type
}
