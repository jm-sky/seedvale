import type { ItemKind } from '../items/items'
import { tradeValue } from '../items/tradeCatalog'
import type { NpcId } from '../settlement/npcState'
import type { RelationLevel } from './quests'
import { relationLevelMeetsMinimum } from './quests'

/** Per-stable-guard claim facts persisted in save (plan quests-progression-021). */
export type SaveGuardClaimState = {
  torchGiftClaimed?: boolean
  swordRewardConsumed?: boolean
  renownRouteClaimed?: boolean
  alphaRouteClaimed?: boolean
}

export const GUARD_TORCH_GIFT_RENOWN_MIN = 6
export const GUARD_SWORD_RENOWN_MIN = 12

export type GuardRewardKind =
  | 'torch_gift'
  | 'sword_renown'
  | 'sword_alpha'
  | 'coin_substitute_renown'
  | 'coin_substitute_alpha'

export type GuardRewardDecision =
  | { kind: 'none', line: string }
  | {
      kind: GuardRewardKind
      line: string
      items: ReadonlyArray<{ kind: ItemKind, count: number }>
      markTorchGift?: boolean
      markSwordConsumed?: boolean
      markRenownRoute?: boolean
      markAlphaRoute?: boolean
    }

export type GuardRewardInput = {
  guardNpcId: NpcId
  relationLevel: RelationLevel
  settlementRenown: number
  alphaWolfDeedEarned: boolean
  playerHasLongSword: boolean
  claims: SaveGuardClaimState
  /** Legacy save: sword already granted before per-guard claims existed. */
  legacySwordGifted: boolean
}

function coinSubstituteForSword(): ReadonlyArray<{ kind: ItemKind, count: number }> {
  return [{ kind: 'coin', count: tradeValue('long_sword') }]
}

function swordItems(playerHasLongSword: boolean, swordAlreadyConsumed: boolean): {
  items: ReadonlyArray<{ kind: ItemKind, count: number }>
  markSwordConsumed: boolean
} {
  if (swordAlreadyConsumed || playerHasLongSword) {
    return { items: coinSubstituteForSword(), markSwordConsumed: true }
  }
  return { items: [{ kind: 'long_sword', count: 1 }], markSwordConsumed: true }
}

/**
 * Pure guard reward eligibility — no inventory/save mutation (plan
 * quests-progression-021).
 *
 * @domain quests-progression
 */
export function resolveNextGuardReward(input: GuardRewardInput): GuardRewardDecision {
  const claims = input.claims
  const swordConsumed = Boolean(claims.swordRewardConsumed || input.legacySwordGifted)

  if (!claims.torchGiftClaimed) {
    const torchEligible = relationLevelMeetsMinimum(input.relationLevel, 'friendly')
      || input.settlementRenown >= GUARD_TORCH_GIFT_RENOWN_MIN
    if (torchEligible) {
      return {
        kind: 'torch_gift',
        line: 'Weź te pochodnie — wieczorem przyda się światło przy studni i na placu.',
        items: [{ kind: 'wooden_torch', count: 2 }],
        markTorchGift: true,
      }
    }
  }

  const renownEligible = input.settlementRenown >= GUARD_SWORD_RENOWN_MIN
  if (renownEligible && !claims.renownRouteClaimed) {
    const sword = swordItems(input.playerHasLongSword, swordConsumed)
    const kind = swordConsumed || input.playerHasLongSword ? 'coin_substitute_renown' : 'sword_renown'
    return {
      kind,
      line: swordConsumed || input.playerHasLongSword
        ? 'Osada pamięta twoje zasługi. Nie mam drugiego miecza — weź te monety zamiast uznania.'
        : 'Zasłużyłeś na ten miecz. Pilnuj go — okolica nie zawsze jest spokojna.',
      items: sword.items,
      markRenownRoute: true,
      markSwordConsumed: sword.markSwordConsumed,
    }
  }

  if (input.alphaWolfDeedEarned && !claims.alphaRouteClaimed) {
    const sword = swordItems(input.playerHasLongSword, swordConsumed)
    const kind = swordConsumed || input.playerHasLongSword ? 'coin_substitute_alpha' : 'sword_alpha'
    return {
      kind,
      line: swordConsumed || input.playerHasLongSword
        ? 'Słyszałem o alfa wilku — dobra robota. Masz już broń, więc weź monety.'
        : 'Zabiłeś alfa wilka własną ręką. Weź ten miecz — zasłużyłeś.',
      items: sword.items,
      markAlphaRoute: true,
      markSwordConsumed: sword.markSwordConsumed,
    }
  }

  if (!claims.torchGiftClaimed && !renownEligible && !input.alphaWolfDeedEarned) {
    return {
      kind: 'none',
      line: 'Najpierw pokaż, że można na Ciebie liczyć. Pomóż osadzie, a pogadamy o nagrodach.',
    }
  }

  return { kind: 'none', line: 'Na dziś nie mam dla ciebie nic nowego.' }
}

/** Whether any guard recognition topic should appear in dialogue. */
export function guardRewardTopicAvailable(input: GuardRewardInput): boolean {
  return resolveNextGuardReward(input).kind !== 'none'
}
