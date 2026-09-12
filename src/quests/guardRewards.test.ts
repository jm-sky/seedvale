import { describe, expect, it } from 'vitest'
import { tradeValue } from '../items/tradeCatalog'
import { resolveNextGuardReward, type GuardRewardDecision } from './guardRewards'

const baseInput = {
  guardNpcId: 'home:npc:guard',
  relationLevel: 'stranger' as const,
  settlementRenown: 0,
  alphaWolfDeedEarned: false,
  playerHasLongSword: false,
  claims: {},
  legacySwordGifted: false,
}

function expectReward(decision: GuardRewardDecision): Exclude<GuardRewardDecision, { kind: 'none' }> {
  if (decision.kind === 'none') throw new Error('expected a reward decision')
  return decision
}

describe('resolveNextGuardReward (plan quests-progression-021)', () => {
  it('does not grant a sword for low relation alone', () => {
    const result = resolveNextGuardReward({
      ...baseInput,
      relationLevel: 'acquainted',
      settlementRenown: 0,
    })
    expect(result.kind).toBe('none')
  })

  it('grants torch gift once at friendly or renown 6', () => {
    const friendly = expectReward(resolveNextGuardReward({ ...baseInput, relationLevel: 'friendly' }))
    expect(friendly.kind).toBe('torch_gift')
    expect(friendly.items).toEqual([{ kind: 'wooden_torch', count: 2 }])

    const renown = expectReward(resolveNextGuardReward({ ...baseInput, settlementRenown: 6 }))
    expect(renown.kind).toBe('torch_gift')
  })

  it('grants long_sword on renown route when eligible', () => {
    const result = expectReward(resolveNextGuardReward({
      ...baseInput,
      settlementRenown: 12,
      claims: { torchGiftClaimed: true },
    }))
    expect(result.kind).toBe('sword_renown')
    expect(result.items).toEqual([{ kind: 'long_sword', count: 1 }])
  })

  it('substitutes coins when player already carries a sword', () => {
    const result = expectReward(resolveNextGuardReward({
      ...baseInput,
      settlementRenown: 12,
      playerHasLongSword: true,
      claims: { torchGiftClaimed: true },
    }))
    expect(result.kind).toBe('coin_substitute_renown')
    expect(result.items).toEqual([{ kind: 'coin', count: tradeValue('long_sword') }])
  })

  it('allows alpha route after renown sword was consumed', () => {
    const result = expectReward(resolveNextGuardReward({
      ...baseInput,
      alphaWolfDeedEarned: true,
      claims: { renownRouteClaimed: true, swordRewardConsumed: true },
    }))
    expect(result.kind).toBe('coin_substitute_alpha')
    expect(result.items).toEqual([{ kind: 'coin', count: tradeValue('long_sword') }])
  })

  it('respects legacy guardSwordGifted as consumed sword only', () => {
    const result = expectReward(resolveNextGuardReward({
      ...baseInput,
      settlementRenown: 12,
      legacySwordGifted: true,
      claims: { torchGiftClaimed: true },
    }))
    expect(result.kind).toBe('coin_substitute_renown')
    expect(result.markRenownRoute).toBe(true)
    expect(result.markTorchGift).toBeUndefined()
  })
})
