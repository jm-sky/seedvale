import { describe, expect, it } from 'vitest'
import type { QuestListEntry } from '../../quests/QuestManager'
import type { QuestState } from '../../quests/quests'
import { projectQuestLog, questLogBucket } from './questLogBuckets'

function entry(id: string, state: QuestState): QuestListEntry {
  return {
    id,
    title: id,
    description: '',
    giverName: 'Giver',
    giverNpcId: 'home:npc:0',
    state,
    stageIndex: 0,
    totalStages: 1,
    currentObjective: null,
    promisedReward: null,
    notes: [],
  }
}

describe('questLogBucket', () => {
  it('maps explicit states and hides not_offered', () => {
    expect(questLogBucket('ready_to_report')).toBe('current')
    expect(questLogBucket('active')).toBe('current')
    expect(questLogBucket('offered')).toBe('offers')
    expect(questLogBucket('complete')).toBe('history')
    expect(questLogBucket('failed')).toBe('history')
    expect(questLogBucket('invalidated')).toBe('history')
    expect(questLogBucket('abandoned')).toBe('history')
    expect(questLogBucket('not_offered')).toBeNull()
  })
})

describe('projectQuestLog', () => {
  it('never lists or counts not_offered, including many 031-style hidden defs', () => {
    const hidden = Array.from({ length: 24 }, (_, i) => entry(`world:lost-livestock:${i}`, 'not_offered'))
    const projected = projectQuestLog([
      ...hidden,
      entry('offer-a', 'offered'),
      entry('active-a', 'active'),
    ])
    expect(projected.current.map((e) => e.id)).toEqual(['active-a'])
    expect(projected.offers.map((e) => e.id)).toEqual(['offer-a'])
    expect(projected.history).toEqual([])
    expect(projected.counts).toEqual({ current: 1, offers: 1, history: 0 })
    expect([...projected.current, ...projected.offers, ...projected.history].every((e) => e.state !== 'not_offered')).toBe(true)
  })

  it('keeps offered separate and ready_to_report first in current', () => {
    const projected = projectQuestLog([
      entry('z-active', 'active'),
      entry('a-ready', 'ready_to_report'),
      entry('m-offered', 'offered'),
      entry('b-ready', 'ready_to_report'),
    ])
    expect(projected.current.map((e) => e.id)).toEqual(['a-ready', 'b-ready', 'z-active'])
    expect(projected.offers.map((e) => e.id)).toEqual(['m-offered'])
    expect(projected.counts.current).toBe(3)
    expect(projected.counts.offers).toBe(1)
  })

  it('puts all four terminal states in history', () => {
    const projected = projectQuestLog([
      entry('t-abandoned', 'abandoned'),
      entry('t-complete', 'complete'),
      entry('t-failed', 'failed'),
      entry('t-invalidated', 'invalidated'),
      entry('still-offered', 'offered'),
    ])
    expect(projected.history.map((e) => e.id)).toEqual([
      't-complete',
      't-failed',
      't-invalidated',
      't-abandoned',
    ])
    expect(projected.offers.map((e) => e.id)).toEqual(['still-offered'])
    expect(projected.counts.history).toBe(4)
  })
})
