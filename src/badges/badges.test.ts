import { describe, expect, it } from 'vitest'
import { BadgeManager } from './badges'

describe('BadgeManager', () => {
  it('does not re-earn an already-earned badge', () => {
    const badges = new BadgeManager()
    badges.recordHiddenFindDiscovered(true)
    const second = badges.recordHiddenFindDiscovered(true)
    expect(second.map((b) => b.id)).not.toContain('relic_seeker')
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

  it('round-trips through exportState/constructor', () => {
    const badges = new BadgeManager()
    badges.recordHiddenFindDiscovered(true)
    const state = badges.exportState()
    const restored = new BadgeManager(state)
    expect(restored.listEarned().map((b) => b.id).sort()).toEqual(badges.listEarned().map((b) => b.id).sort())
    expect(restored.exportState()).toEqual(state)
  })

  it('reset drops all progress', () => {
    const badges = new BadgeManager()
    badges.recordHiddenFindDiscovered(true)
    badges.reset()
    expect(badges.listEarned()).toHaveLength(0)
    expect(badges.exportState()).toEqual({ earned: [], hiddenFindsFound: 0 })
  })
})
