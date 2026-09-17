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

describe('BadgeManager settlement Known Deeds (plan quests-progression-059)', () => {
  it('keeps caretaker progress independent for two settlements', () => {
    const badges = new BadgeManager()
    for (let i = 0; i < 4; i++) badges.recordAnimalCorpseBuried('village-a')
    badges.recordAnimalCorpseBuried('village-b')
    expect(badges.listSettlementEarned('village-a')).toHaveLength(0)
    expect(badges.listSettlementEarned('village-b')).toHaveLength(0)
  })

  it('earns caretaker exactly at the fifth recorded burial and not before', () => {
    const badges = new BadgeManager()
    let unlock = null
    for (let i = 0; i < 4; i++) unlock = badges.recordAnimalCorpseBuried('village-a')
    expect(unlock).toBeNull()
    unlock = badges.recordAnimalCorpseBuried('village-a')
    expect(unlock?.badge.id).toBe('caretaker')
    expect(unlock?.settlementId).toBe('village-a')
    expect(unlock?.consequence).toEqual({ settlementId: 'village-a', reputation: { benevolence: 6 }, renown: 3 })
  })

  it('does not re-pay the unlock consequence for events after the threshold', () => {
    const badges = new BadgeManager()
    for (let i = 0; i < 5; i++) badges.recordAnimalCorpseBuried('village-a')
    const again = badges.recordAnimalCorpseBuried('village-a')
    expect(again).toBeNull()
  })

  it('earns healer exactly at the fifth successful treatment', () => {
    const badges = new BadgeManager()
    let unlock = null
    for (let i = 0; i < 4; i++) unlock = badges.recordSuccessfulTreatment('village-a')
    expect(unlock).toBeNull()
    unlock = badges.recordSuccessfulTreatment('village-a')
    expect(unlock?.badge.id).toBe('healer')
  })

  it('earns grave_robber on the first exposed grave disturbance, with no unlock consequence', () => {
    const badges = new BadgeManager()
    const unlock = badges.recordExposedGraveDisturbance('village-a')
    expect(unlock?.badge.id).toBe('grave_robber')
    expect(unlock?.consequence).toBeUndefined()

    const again = badges.recordExposedGraveDisturbance('village-a')
    expect(again).toBeNull()
  })

  it('listSettlementEarned returns only the requested settlement', () => {
    const badges = new BadgeManager()
    badges.recordExposedGraveDisturbance('village-a')
    expect(badges.listSettlementEarned('village-a').map((b) => b.id)).toEqual(['grave_robber'])
    expect(badges.listSettlementEarned('village-b')).toHaveLength(0)
  })

  it('round-trips settlement progress through exportState/constructor', () => {
    const badges = new BadgeManager()
    for (let i = 0; i < 5; i++) badges.recordAnimalCorpseBuried('village-a')
    badges.recordSuccessfulTreatment('village-b')
    const state = badges.exportState()
    const restored = new BadgeManager(state)
    expect(restored.listSettlementEarned('village-a').map((b) => b.id)).toEqual(['caretaker'])
    expect(restored.exportState()).toEqual(state)
  })

  it('reset clears settlement progress too', () => {
    const badges = new BadgeManager()
    for (let i = 0; i < 5; i++) badges.recordAnimalCorpseBuried('village-a')
    badges.reset()
    expect(badges.listSettlementEarned('village-a')).toHaveLength(0)
    expect(badges.exportState()).toEqual({ earned: [], hiddenFindsFound: 0 })
  })
})
