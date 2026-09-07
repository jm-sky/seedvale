import { describe, expect, it } from 'vitest'
import { applySocialConsequence, ReputationManager } from './ReputationManager'

describe('ReputationManager', () => {
  it('returns neutral reputation and renown 0 for an unknown settlement', () => {
    const rep = new ReputationManager()
    expect(rep.getReputation('anna-village')).toEqual({
      trust: 0, competence: 0, benevolence: 0, courage: 0, integrity: 0,
    })
    expect(rep.getReputationDimension('anna-village', 'trust')).toBe(0)
    expect(rep.getRenown('anna-village')).toBe(0)
  })

  it('a read does not materialize an entry for the settlement', () => {
    const rep = new ReputationManager()
    rep.getReputation('anna-village')
    rep.getRenown('anna-village')
    expect(rep.exportState().settlements).toEqual({})
  })

  it('keeps two settlements independent', () => {
    const rep = new ReputationManager()
    rep.changeReputation('a', 'trust', 10)
    rep.changeRenown('a', 15)
    expect(rep.getReputationDimension('b', 'trust')).toBe(0)
    expect(rep.getRenown('b')).toBe(0)
    expect(rep.getReputationDimension('a', 'trust')).toBe(10)
    expect(rep.getRenown('a')).toBe(15)
  })

  it('keeps the five dimensions independent', () => {
    const rep = new ReputationManager()
    rep.changeReputation('a', 'courage', 12)
    expect(rep.getReputationDimension('a', 'courage')).toBe(12)
    expect(rep.getReputationDimension('a', 'trust')).toBe(0)
    expect(rep.getReputationDimension('a', 'competence')).toBe(0)
    expect(rep.getReputationDimension('a', 'benevolence')).toBe(0)
    expect(rep.getReputationDimension('a', 'integrity')).toBe(0)
  })

  it('applies positive and negative reputation deltas', () => {
    const rep = new ReputationManager()
    rep.changeReputation('a', 'integrity', -8)
    rep.changeReputation('a', 'integrity', 3)
    expect(rep.getReputationDimension('a', 'integrity')).toBe(-5)
  })

  it('clamps reputation to -100..100', () => {
    const rep = new ReputationManager()
    rep.changeReputation('a', 'trust', 500)
    expect(rep.getReputationDimension('a', 'trust')).toBe(100)
    rep.changeReputation('a', 'trust', -1000)
    expect(rep.getReputationDimension('a', 'trust')).toBe(-100)
  })

  it('renown starts at 0', () => {
    const rep = new ReputationManager()
    expect(rep.getRenown('a')).toBe(0)
  })

  it('applies positive and negative renown deltas', () => {
    const rep = new ReputationManager()
    rep.changeRenown('a', 20)
    rep.changeRenown('a', -5)
    expect(rep.getRenown('a')).toBe(15)
  })

  it('clamps renown to 0..100', () => {
    const rep = new ReputationManager()
    rep.changeRenown('a', 500)
    expect(rep.getRenown('a')).toBe(100)
    rep.changeRenown('a', -1000)
    expect(rep.getRenown('a')).toBe(0)
  })

  it('keeps renown independent of reputation', () => {
    const rep = new ReputationManager()
    rep.changeReputation('a', 'trust', -80)
    rep.changeRenown('a', 40)
    expect(rep.getReputationDimension('a', 'trust')).toBe(-80)
    expect(rep.getRenown('a')).toBe(40)
  })

  it('round-trips through exportState/constructor', () => {
    const rep = new ReputationManager()
    rep.changeReputation('a', 'courage', 12)
    rep.changeReputation('b', 'integrity', -7)
    rep.changeRenown('a', 25)
    const restored = new ReputationManager(rep.exportState())
    expect(restored.getReputation('a')).toEqual(rep.getReputation('a'))
    expect(restored.getReputation('b')).toEqual(rep.getReputation('b'))
    expect(restored.getRenown('a')).toBe(rep.getRenown('a'))
  })

  it('reset drops every settlement back to neutral', () => {
    const rep = new ReputationManager()
    rep.changeReputation('a', 'trust', 10)
    rep.changeRenown('a', 10)
    rep.reset()
    expect(rep.getReputation('a')).toEqual({ trust: 0, competence: 0, benevolence: 0, courage: 0, integrity: 0 })
    expect(rep.getRenown('a')).toBe(0)
    expect(rep.exportState().settlements).toEqual({})
  })
})

describe('applySocialConsequence', () => {
  it('applies only the deltas present in the consequence', () => {
    const rep = new ReputationManager()
    applySocialConsequence(rep, { settlementId: 'a', reputation: { competence: 10, courage: 12 }, renown: 15 })
    expect(rep.getReputationDimension('a', 'competence')).toBe(10)
    expect(rep.getReputationDimension('a', 'courage')).toBe(12)
    expect(rep.getReputationDimension('a', 'trust')).toBe(0)
    expect(rep.getReputationDimension('a', 'integrity')).toBe(0)
    expect(rep.getRenown('a')).toBe(15)
  })

  it('only changes the named settlement', () => {
    const rep = new ReputationManager()
    applySocialConsequence(rep, { settlementId: 'a', renown: 20 })
    expect(rep.getRenown('b')).toBe(0)
  })

  it('is a no-op with neither reputation nor renown present', () => {
    const rep = new ReputationManager()
    applySocialConsequence(rep, { settlementId: 'a' })
    expect(rep.exportState().settlements).toEqual({})
  })
})
