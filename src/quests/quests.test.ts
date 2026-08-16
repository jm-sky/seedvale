import { describe, expect, it } from 'vitest'
import { buildLandmarkQuests } from './quests'

describe('buildLandmarkQuests', () => {
  it('omits a landmark kind the resolver has no candidate for', () => {
    const quests = buildLandmarkQuests(() => undefined)
    expect(quests).toHaveLength(0)
  })

  it('builds one quest per resolved kind, binding its stage to the resolved landmarkId', () => {
    const quests = buildLandmarkQuests((kind) => `${kind}:resolved`)
    expect(quests).toHaveLength(3)
    for (const quest of quests) {
      const objective = quest.stages[0]!.objective
      expect(objective.type).toBe('interact_landmark')
      if (objective.type === 'interact_landmark') {
        expect(objective.landmarkId.endsWith(':resolved')).toBe(true)
      }
    }
  })

  it('resolves each expected landmark kind exactly once', () => {
    const requested: string[] = []
    buildLandmarkQuests((kind) => {
      requested.push(kind)
      return `${kind}:id`
    })
    expect(requested.sort()).toEqual(['cemetery', 'monolith', 'smallRuins'])
  })

  it('produces quest ids that are stable and distinct', () => {
    const quests = buildLandmarkQuests((kind) => `${kind}:id`)
    const ids = quests.map((q) => q.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(quests.every((q) => Boolean(q.giverName))).toBe(true)
  })
})
