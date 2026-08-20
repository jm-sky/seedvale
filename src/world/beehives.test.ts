import { describe, expect, it } from 'vitest'
import { burnHive, collectHoney, HONEY_MAX_ACCUMULATION, honeyAvailable } from './beehives'

describe('beehives (plan 159)', () => {
  it('accrues honey over time, capped', () => {
    const hive = { lastCollectedAtDay: 0, burned: false }
    expect(honeyAvailable(hive, 0.5)).toBe(0)
    expect(honeyAvailable(hive, 2)).toBe(2)
    expect(honeyAvailable(hive, 100)).toBe(HONEY_MAX_ACCUMULATION)
  })

  it('a burned hive never produces honey', () => {
    expect(honeyAvailable({ lastCollectedAtDay: 0, burned: true }, 100)).toBe(0)
  })

  it('collecting resets the clock only when something was collected', () => {
    const hive = { lastCollectedAtDay: 0, burned: false }
    const empty = collectHoney(hive, 0.5)
    expect(empty).toEqual({ lastCollectedAtDay: 0, amount: 0 })
    const full = collectHoney(hive, 3)
    expect(full.amount).toBe(3)
    expect(full.lastCollectedAtDay).toBe(3)
  })

  it('burning grants the reward exactly once', () => {
    const fresh = { burned: false, burnRewardCollected: false }
    const result = burnHive(fresh)
    expect(result.alreadyBurned).toBe(false)
    expect(result.reward).toBeGreaterThan(0)

    const alreadyRewarded = { burned: false, burnRewardCollected: true }
    expect(burnHive(alreadyRewarded).reward).toBe(0)

    const burnedAlready = { burned: true, burnRewardCollected: true }
    expect(burnHive(burnedAlready)).toEqual({ alreadyBurned: true, reward: 0 })
  })
})
