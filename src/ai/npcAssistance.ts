import type { Inventory } from '../items/Inventory'
import type { ItemKind } from '../items/items'
import type { RelationLevel } from '../quests/quests'
import type { BigFivePersonality } from './dialogue'
import { type ConsumableNeed, ITEM_CATALOG } from '../items/itemCatalog'

/**
 * Plan 152 — NPC social-decision resolver for a player's "request food/drink"
 * dialogue action. Deliberately not a `NeedId`/strategy pipeline: this is a
 * synchronous social decision triggered by the player asking, never routed
 * through `generateNeedPressures()` / `pickNeed()` / `selectStrategy()`
 * (`Needs.ts` / `decisionModifiers.ts` / `npcStrategies.ts`).
 */
export type AssistanceRequestKind = 'food' | 'water'
export type AssistanceOutcome = 'given' | 'no_item' | 'unwilling'
export type AssistanceResult = { outcome: AssistanceOutcome, itemKind: ItemKind | null }

const REQUEST_NEED: Record<AssistanceRequestKind, ConsumableNeed> = { food: 'hunger', water: 'thirst' }

/** The one small central consumable-selection rule (plan 152 "Consumable
 *  selection") — first `ItemKind` in catalog declaration order (deterministic,
 *  no `Math.random()` needed here) whose `consumable.need` matches and that
 *  `carried` actually holds at least one of. Never assumes item instances —
 *  consumables are plain counts. */
export function findCarriedConsumableKind(carried: Inventory, need: ConsumableNeed): ItemKind | null {
  for (const kind of Object.keys(ITEM_CATALOG) as ItemKind[]) {
    if (ITEM_CATALOG[kind].consumable?.need === need && carried.has(kind, 1)) return kind
  }
  return null
}

export type AssistanceSocialInput = {
  personality: BigFivePersonality
  relationLevel: RelationLevel
  standing: number
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t)
}

/** Directly asking in dialogue is a much stronger signal than the ambient
 *  "does this NPC even notice the Hero" reaction `reactionChance.ts` models,
 *  so the base rate here is deliberately much higher than that file's
 *  `BASE_REACTION_CHANCE` — most NPCs will at least consider a direct ask. */
const BASE_WILLINGNESS = 0.3
const AGREEABLENESS_BONUS_MIN = -0.15
const AGREEABLENESS_BONUS_MAX = 0.25
/** Personal relation is the dominant factor (plan 152's "Osobista relacja
 *  powinna mieć największe znaczenie"). */
const RELATION_BONUS: Record<RelationLevel, number> = {
  stranger: 0,
  acquainted: 0.1,
  friendly: 0.25,
  trusted: 0.45,
}
/** General reputation matters, but less than the personal relationship. */
const STANDING_BONUS_MAX = 0.15

/** How willing an NPC is to hand over a carried consumable once the player
 *  has actually asked (plan 152 "Decyzja społeczna") — a distinct model from
 *  `computeReactionChance()`, which decides whether an NPC reacts to the
 *  Hero's mere presence, not whether it gives something away on request. */
export function computeAssistanceWillingness(input: AssistanceSocialInput): number {
  const agreeablenessBonus = lerp(AGREEABLENESS_BONUS_MIN, AGREEABLENESS_BONUS_MAX, input.personality.agreeableness)
  const relationBonus = RELATION_BONUS[input.relationLevel]
  const standingBonus = lerp(0, STANDING_BONUS_MAX, input.standing)
  return clamp01(BASE_WILLINGNESS + agreeablenessBonus + relationBonus + standingBonus)
}

/** Conservative own-needs guard (plan 152 "NPC own-needs guard") — no new
 *  reservation/ledger system, just a read of existing state: refuses only
 *  when giving away the *last* carried unit of a consumable would leave this
 *  NPC without one while its own matching need is already critical. */
const OWN_NEED_GUARD_THRESHOLD = 0.7

export function violatesOwnNeedsGuard(remainingAfterGive: number, ownNeedValue: number): boolean {
  return remainingAfterGive <= 0 && ownNeedValue >= OWN_NEED_GUARD_THRESHOLD
}

/** Synchronous resolver for one "request food/water" dialogue action. Never
 *  mutates `carried` — callers perform the actual transfer themselves only
 *  after confirming player-side capacity (`Inventory.canAdd`), so an NPC
 *  item is never removed before every transfer condition has passed
 *  (plan 152 "Inventory atomicity"). `roll` defaults to `Math.random` (the
 *  project's existing RNG convention, see `NpcAgent`'s reaction-chance roll)
 *  and is overridable for deterministic tests. */
export function resolveNpcAssistance(
  kind: AssistanceRequestKind,
  carried: Inventory,
  ownNeedValue: number,
  social: AssistanceSocialInput,
  roll: () => number = Math.random,
): AssistanceResult {
  const need = REQUEST_NEED[kind]
  const itemKind = findCarriedConsumableKind(carried, need)
  if (!itemKind) return { outcome: 'no_item', itemKind: null }
  if (roll() >= computeAssistanceWillingness(social)) return { outcome: 'unwilling', itemKind: null }
  if (violatesOwnNeedsGuard(carried.count(itemKind) - 1, ownNeedValue)) return { outcome: 'unwilling', itemKind: null }
  return { outcome: 'given', itemKind }
}
