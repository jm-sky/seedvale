import { describe, expect, it } from 'vitest'
import { buildLandmarkQuests, QUESTS } from './quests'

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

describe('QUESTS rewards (plan quests-progression-002)', () => {
  it('grants the rarest high-quality swords from existing world-problem quests', () => {
    const wolf = QUESTS.find((q) => q.id === 'grozny-wilk')
    const den = QUESTS.find((q) => q.id === 'wilcza-jama')
    const well = QUESTS.find((q) => q.id === 'woda-dla-marka')
    expect(wolf?.outcomes[0]?.reward).toEqual({ visibility: 'shown', items: [{ kind: 'damascus_long_sword', count: 1 }] })
    expect(den?.outcomes[0]?.reward).toEqual({ visibility: 'shown', items: [{ kind: 'obsidian_sword', count: 1 }] })
    expect(well?.outcomes[0]?.reward).toEqual({ visibility: 'shown', items: [{ kind: 'coin', count: 5 }] })
  })

  it('requires identity and at least one outcome on every authored quest', () => {
    for (const quest of [...QUESTS, ...buildLandmarkQuests((kind) => `${kind}:id`)]) {
      expect(quest.title.length).toBeGreaterThan(0)
      expect(quest.description.length).toBeGreaterThan(0)
      expect(quest.outcomes.length).toBeGreaterThan(0)
      const ids = quest.outcomes.map((o) => o.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
})

describe('QUESTS social consequence calibration (plan quests-progression-001 §6)', () => {
  it('grozny-wilk matches its authored magnitude calibration exactly', () => {
    const wolf = QUESTS.find((q) => q.id === 'grozny-wilk')
    expect(wolf?.outcomes[0]?.consequences?.social).toEqual({
      reputation: { competence: 10, courage: 12, benevolence: 4 },
      renown: 15,
    })
  })

  it('wilcza-jama matches its authored magnitude calibration exactly', () => {
    const den = QUESTS.find((q) => q.id === 'wilcza-jama')
    expect(den?.outcomes[0]?.consequences?.social).toEqual({
      reputation: { competence: 15, courage: 18, benevolence: 6 },
      renown: 25,
    })
  })

  it('neither wolf quest changes trust or integrity', () => {
    const wolf = QUESTS.find((q) => q.id === 'grozny-wilk')
    const den = QUESTS.find((q) => q.id === 'wilcza-jama')
    expect(wolf?.outcomes[0]?.consequences?.social?.reputation?.trust).toBeUndefined()
    expect(wolf?.outcomes[0]?.consequences?.social?.reputation?.integrity).toBeUndefined()
    expect(den?.outcomes[0]?.consequences?.social?.reputation?.trust).toBeUndefined()
    expect(den?.outcomes[0]?.consequences?.social?.reputation?.integrity).toBeUndefined()
  })

  it('no quest authors social consequence without a defined magnitude source (no accidental defaults)', () => {
    const withConsequence = QUESTS.filter((q) => q.outcomes.some((o) => o.consequences?.social))
    expect(withConsequence.map((q) => q.id).sort()).toEqual(['grozny-wilk', 'wilcza-jama'])
  })
})
