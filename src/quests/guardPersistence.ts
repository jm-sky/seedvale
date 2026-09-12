import type { NpcId } from '../settlement/npcState'
import type { SaveGuardClaimState } from './guardRewards'

export type GuardWorldProgress = {
  alphaWolfDeedEarned: boolean
  guardClaims: Record<NpcId, SaveGuardClaimState>
  /** Legacy boolean — sword consumed before per-guard claims (plan 021). */
  guardSwordGifted: boolean
}

export function emptyGuardWorldProgress(): GuardWorldProgress {
  return { alphaWolfDeedEarned: false, guardClaims: {}, guardSwordGifted: false }
}

export function getGuardClaimState(progress: GuardWorldProgress, guardId: NpcId): SaveGuardClaimState {
  return progress.guardClaims[guardId] ?? {}
}

export function applyGuardClaimMutation(
  progress: GuardWorldProgress,
  guardId: NpcId,
  patch: Partial<SaveGuardClaimState>,
): void {
  progress.guardClaims[guardId] = { ...getGuardClaimState(progress, guardId), ...patch }
}

/**
 * After the home guard is known, map legacy `guardSwordGifted` onto that guard's
 * `swordRewardConsumed` without inferring routes or torch gift.
 */
export function migrateLegacyGuardSwordGift(progress: GuardWorldProgress, homeGuardId: NpcId | undefined): void {
  if (!progress.guardSwordGifted || !homeGuardId) return
  const claims = getGuardClaimState(progress, homeGuardId)
  if (!claims.swordRewardConsumed) {
    applyGuardClaimMutation(progress, homeGuardId, { swordRewardConsumed: true })
  }
}

export function isSwordRewardConsumedForGuard(progress: GuardWorldProgress, guardId: NpcId): boolean {
  const claims = getGuardClaimState(progress, guardId)
  return Boolean(claims.swordRewardConsumed || progress.guardSwordGifted)
}
