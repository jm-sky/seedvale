import { describe, expect, it } from 'vitest'
import { BadgeManager } from './badges'

describe('BadgeManager', () => {
  it('earns grave_robber on the first grave disturbance, not before', () => {
    const badges = new BadgeManager()
    expect(badges.listEarned()).toHaveLength(0)
    const newly = badges.recordGraveDisturbed()
    expect(newly.map((b) => b.id)).toEqual(['grave_robber'])
    expect(badges.listEarned().map((b) => b.id)).toEqual(['grave_robber'])
  })

  it('does not re-earn an already-earned badge', () => {
    const badges = new BadgeManager()
    badges.recordGraveDisturbed()
    const second = badges.recordGraveDisturbed()
    expect(second.map((b) => b.id)).not.toContain('grave_robber')
  })

  it('earns desecrator after enough grave disturbances', () => {
    const badges = new BadgeManager()
    let allNewly = badges.recordGraveDisturbed().map((b) => b.id)
    for (let i = 1; i < 10; i++) allNewly = [...allNewly, ...badges.recordGraveDisturbed().map((b) => b.id)]
    expect(allNewly).toContain('grave_robber')
    expect(allNewly).toContain('desecrator')
  })

  it('earns treasure_hunter after enough non-empty Hidden Finds', () => {
    const badges = new BadgeManager()
    let allNewly: string[] = []
    for (let i = 0; i < 10; i++) allNewly = [...allNewly, ...badges.recordHiddenFindDiscovered(false).map((b) => b.id)]
    expect(allNewly).toContain('treasure_hunter')
    expect(allNewly).not.toContain('relic_seeker')
  })

  it('earns relic_seeker immediately on a rare find', () => {
    const badges = new BadgeManager()
    const newly = badges.recordHiddenFindDiscovered(true)
    expect(newly.map((b) => b.id)).toContain('relic_seeker')
  })

  it('community standing penalty grows with disturbances but stays capped at 1', () => {
    const badges = new BadgeManager()
    expect(badges.communityOffensePenalty()).toBe(0)
    for (let i = 0; i < 3; i++) badges.recordGraveDisturbed()
    const penaltyAt3 = badges.communityOffensePenalty()
    expect(penaltyAt3).toBeGreaterThan(0)
    for (let i = 0; i < 50; i++) badges.recordGraveDisturbed()
    expect(badges.communityOffensePenalty()).toBeLessThanOrEqual(1)
  })

  it('round-trips through exportState/constructor', () => {
    const badges = new BadgeManager()
    badges.recordGraveDisturbed()
    badges.recordHiddenFindDiscovered(true)
    const state = badges.exportState()
    const restored = new BadgeManager(state)
    expect(restored.listEarned().map((b) => b.id).sort()).toEqual(badges.listEarned().map((b) => b.id).sort())
    expect(restored.communityOffensePenalty()).toBe(badges.communityOffensePenalty())
  })

  it('reset drops all progress', () => {
    const badges = new BadgeManager()
    badges.recordGraveDisturbed()
    badges.reset()
    expect(badges.listEarned()).toHaveLength(0)
    expect(badges.communityOffensePenalty()).toBe(0)
  })
})
