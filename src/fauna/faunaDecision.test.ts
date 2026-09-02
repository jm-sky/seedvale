import { describe, expect, it } from 'vitest'
import {
  decideFaunaBehaviour,
  FAUNA_BEHAVIOUR_PRIORITY,
  type FaunaBehaviourKind,
  type FaunaDecisionInput,
  scoreFaunaBehaviours,
} from './faunaDecision'

// `rabid` is a hard gate handled by `AnimalAgent.update()` above this module
// (implementation notes §2.2/F6) — not unit-testable here, and not part of
// `FaunaBehaviourKind`. Verified by code review only.

const base: FaunaDecisionInput = {
  role: 'prey',
  frenzied: false,
  playerActive: false,
  playerIntent: null,
  npcThreat: false,
  npcIntent: null,
  fireNearby: false,
  hasStrategicVillage: false,
  arrivedAtStrategicVillage: false,
}

/** One row per implementation-notes §2.1 priority table entry (#2-#9). */
describe('decideFaunaBehaviour — priority table (implementation notes §2.1)', () => {
  it('#2 player-attack: playerActive predator with attack intent', () => {
    expect(decideFaunaBehaviour({
      ...base, role: 'predator', playerActive: true, playerIntent: 'attack',
    })).toBe('player-attack')
  })

  it('#2 player-ignore: playerActive predator with ignore intent', () => {
    expect(decideFaunaBehaviour({
      ...base, role: 'predator', playerActive: true, playerIntent: 'ignore',
    })).toBe('player-ignore')
  })

  it('#2 player-flee: playerActive predator with flee intent', () => {
    expect(decideFaunaBehaviour({
      ...base, role: 'predator', playerActive: true, playerIntent: 'flee',
    })).toBe('player-flee')
  })

  it('#3 player-flee-prey: playerActive non-predator role, regardless of playerIntent', () => {
    expect(decideFaunaBehaviour({ ...base, role: 'prey', playerActive: true })).toBe('player-flee-prey')
    expect(decideFaunaBehaviour({ ...base, role: 'livestock', playerActive: true })).toBe('player-flee-prey')
  })

  it('#4 npc-attack-frenzied: npcThreat while frenzied, even with playerActive false', () => {
    expect(decideFaunaBehaviour({
      ...base, role: 'predator', frenzied: true, npcThreat: true,
    })).toBe('npc-attack-frenzied')
  })

  it('#5 npc-attack / npc-ignore / npc-flee: npcThreat without frenzy (F1 — currently unreachable from AnimalAgent, see below)', () => {
    expect(decideFaunaBehaviour({
      ...base, role: 'predator', npcThreat: true, npcIntent: 'attack',
    })).toBe('npc-attack')
    expect(decideFaunaBehaviour({
      ...base, role: 'predator', npcThreat: true, npcIntent: 'ignore',
    })).toBe('npc-ignore')
    expect(decideFaunaBehaviour({
      ...base, role: 'predator', npcThreat: true, npcIntent: 'flee',
    })).toBe('npc-flee')
  })

  it('#6 fire-avoid: fireNearby and not frenzied', () => {
    expect(decideFaunaBehaviour({ ...base, fireNearby: true })).toBe('fire-avoid')
  })

  it('#7 frenzy-beeline: predator, frenzied, has an unarrived strategic village', () => {
    expect(decideFaunaBehaviour({
      ...base, role: 'predator', frenzied: true, hasStrategicVillage: true, arrivedAtStrategicVillage: false,
    })).toBe('frenzy-beeline')
  })

  it('#8 predator-normal: predator with no higher-priority candidate valid', () => {
    expect(decideFaunaBehaviour({ ...base, role: 'predator' })).toBe('predator-normal')
  })

  it('#9 prey-normal: terminal fallback, always valid', () => {
    expect(decideFaunaBehaviour(base)).toBe('prey-normal')
    expect(decideFaunaBehaviour({ ...base, role: 'livestock' })).toBe('prey-normal')
  })
})

describe('decideFaunaBehaviour — ordering pairs that matter (implementation notes §5.5)', () => {
  it('player beats fire: playerActive predator ignores a nearby fire', () => {
    expect(decideFaunaBehaviour({
      ...base, role: 'predator', playerActive: true, playerIntent: 'attack', fireNearby: true,
    })).toBe('player-attack')
  })

  it('player beats npcThreat even while frenzied', () => {
    expect(decideFaunaBehaviour({
      ...base,
      role: 'predator',
      frenzied: true,
      playerActive: true,
      playerIntent: 'flee',
      npcThreat: true,
    })).toBe('player-flee')
  })

  it('fire beats frenzy-beeline unless frenzied (the !frenzied fire bypass)', () => {
    expect(decideFaunaBehaviour({
      ...base, role: 'predator', fireNearby: true, hasStrategicVillage: true,
    })).toBe('fire-avoid')
    // Frenzied: fire is bypassed, so npcThreat/beeline can win instead.
    expect(decideFaunaBehaviour({
      ...base,
      role: 'predator',
      frenzied: true,
      fireNearby: true,
      hasStrategicVillage: true,
      arrivedAtStrategicVillage: false,
    })).toBe('frenzy-beeline')
  })

  it('npcThreat beats fire for a frenzied predator', () => {
    expect(decideFaunaBehaviour({
      ...base, role: 'predator', frenzied: true, npcThreat: true, fireNearby: true,
    })).toBe('npc-attack-frenzied')
  })

  it('frenzy-beeline beats predator-normal until arrived', () => {
    expect(decideFaunaBehaviour({
      ...base, role: 'predator', frenzied: true, hasStrategicVillage: true, arrivedAtStrategicVillage: false,
    })).toBe('frenzy-beeline')
    expect(decideFaunaBehaviour({
      ...base, role: 'predator', frenzied: true, hasStrategicVillage: true, arrivedAtStrategicVillage: true,
    })).toBe('predator-normal')
  })
})

describe('scoreFaunaBehaviours', () => {
  it('returns only valid candidates, ranked by FAUNA_BEHAVIOUR_PRIORITY', () => {
    const scored = scoreFaunaBehaviours({
      ...base, role: 'predator', fireNearby: true,
    })
    const kinds = scored.map((s) => s.kind)
    expect(kinds).toContain('fire-avoid')
    expect(kinds).toContain('predator-normal')
    expect(kinds).toContain('prey-normal')
    expect(kinds).not.toContain('player-attack')
    const fire = scored.find((s) => s.kind === 'fire-avoid')!
    const predatorNormal = scored.find((s) => s.kind === 'predator-normal')!
    expect(fire.score).toBeGreaterThan(predatorNormal.score)
  })

  it('agrees with decideFaunaBehaviour on the winner for every table row', () => {
    const cases: FaunaDecisionInput[] = [
      { ...base, role: 'predator', playerActive: true, playerIntent: 'attack' },
      { ...base, role: 'predator', frenzied: true, npcThreat: true },
      { ...base, fireNearby: true },
      { ...base, role: 'predator', frenzied: true, hasStrategicVillage: true },
      { ...base, role: 'predator' },
      base,
    ]
    for (const input of cases) {
      const winner = decideFaunaBehaviour(input)
      const scored = scoreFaunaBehaviours(input)
      const best = scored.reduce((a, b) => (b.score > a.score ? b : a))
      expect(best.kind).toBe(winner)
    }
  })
})

describe('FAUNA_BEHAVIOUR_PRIORITY', () => {
  it('has an entry for every FaunaBehaviourKind, all rankable behaviours covered', () => {
    const kinds: FaunaBehaviourKind[] = [
      'player-attack', 'player-ignore', 'player-flee', 'player-flee-prey',
      'npc-attack-frenzied', 'npc-attack', 'npc-ignore', 'npc-flee',
      'fire-avoid', 'frenzy-beeline', 'predator-normal', 'prey-normal',
    ]
    for (const kind of kinds) {
      expect(typeof FAUNA_BEHAVIOUR_PRIORITY[kind]).toBe('number')
    }
  })
})
