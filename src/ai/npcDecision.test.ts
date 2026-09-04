import { describe, expect, it } from 'vitest'
import { decideNpcAction, NPC_DECISION_PRIORITY, scoreNpcDecisions, shouldInterruptAction } from './npcDecision'
import { WEATHER_SEVERE_SHELTER_THRESHOLD } from './weatherPressure'

describe('decideNpcAction', () => {
  it('collapse outranks everything else', () => {
    expect(decideNpcAction({
      collapsing: true,
      wonNeed: 'seekShelter',
      scheduleActivity: 'sleep',
    })).toBe('collapseSleep')
  })

  it('seekShelter wins when the pressure arbitration picked it', () => {
    expect(decideNpcAction({
      collapsing: false,
      wonNeed: 'seekShelter',
      scheduleActivity: 'work',
    })).toBe('seekShelter')
  })

  it('a real need beats scheduled sleep', () => {
    expect(decideNpcAction({
      collapsing: false,
      wonNeed: 'food',
      scheduleActivity: 'sleep',
    })).toBe('need')
  })

  it('scheduledSleep wins over idle but never over an active need', () => {
    expect(decideNpcAction({
      collapsing: false,
      wonNeed: 'idle',
      scheduleActivity: 'sleep',
    })).toBe('scheduledSleep')
    expect(decideNpcAction({
      collapsing: false,
      wonNeed: 'food',
      scheduleActivity: 'sleep',
    })).not.toBe('scheduledSleep')
  })

  it('falls back to idle when nothing else applies', () => {
    expect(decideNpcAction({
      collapsing: false,
      wonNeed: 'idle',
      scheduleActivity: 'work',
    })).toBe('idle')
  })
})

describe('scoreNpcDecisions', () => {
  it('lists every currently-valid outcome in descending priority order', () => {
    const scored = scoreNpcDecisions({ collapsing: false, wonNeed: 'idle', scheduleActivity: 'sleep' })
    expect(scored.map((s) => s.kind)).toEqual(['scheduledSleep', 'idle'])
    expect(scored[0]!.score).toBeGreaterThan(scored[1]!.score)
  })

  it('matches decideNpcAction’s winner as its own top entry', () => {
    const input = { collapsing: false, wonNeed: 'water' as const, scheduleActivity: 'work' as const }
    const scored = scoreNpcDecisions(input)
    expect(scored[0]!.kind).toBe(decideNpcAction(input))
  })

  it('every score matches NPC_DECISION_PRIORITY', () => {
    const scored = scoreNpcDecisions({ collapsing: true, wonNeed: 'seekShelter', scheduleActivity: 'sleep' })
    for (const s of scored) expect(s.score).toBe(NPC_DECISION_PRIORITY[s.kind])
  })
})

describe('shouldInterruptAction', () => {
  it('collapse always interrupts, regardless of activeNeed', () => {
    expect(shouldInterruptAction({
      collapsing: true,
      activeNeed: 'water',
      criticalNeed: 'idle',
      weatherPressure: 0,
    })).toBe(true)
  })

  it('never interrupts an already-active need, even a critical one or severe weather', () => {
    expect(shouldInterruptAction({
      collapsing: false,
      activeNeed: 'food',
      criticalNeed: 'water',
      weatherPressure: WEATHER_SEVERE_SHELTER_THRESHOLD + 1,
    })).toBe(false)
  })

  it('a critical need interrupts an idle (schedule-driven) action', () => {
    expect(shouldInterruptAction({
      collapsing: false,
      activeNeed: 'idle',
      criticalNeed: 'water',
      weatherPressure: 0,
    })).toBe(true)
  })

  it('severe weather interrupts an idle action when no critical need fired', () => {
    expect(shouldInterruptAction({
      collapsing: false,
      activeNeed: 'idle',
      criticalNeed: 'idle',
      weatherPressure: WEATHER_SEVERE_SHELTER_THRESHOLD,
    })).toBe(true)
    expect(shouldInterruptAction({
      collapsing: false,
      activeNeed: 'idle',
      criticalNeed: 'idle',
      weatherPressure: WEATHER_SEVERE_SHELTER_THRESHOLD - 0.01,
    })).toBe(false)
  })

  it('does nothing when idle, no critical need, and mild weather', () => {
    expect(shouldInterruptAction({
      collapsing: false,
      activeNeed: 'idle',
      criticalNeed: 'idle',
      weatherPressure: 0,
    })).toBe(false)
  })

  it('precedence differs from decideNpcAction on purpose: a critical need never interrupts an active need, but decideNpcAction would still route to it fresh from choose()', () => {
    // Same inputs a fresh choose() tick would use: a real need already won
    // arbitration (wonNeed='water') — decideNpcAction happily returns
    // 'need'. The interrupt check for an NPC already mid-'food' must NOT
    // fire just because water is also critical — that's the deliberate gap
    // between the two precedences the doc comments describe.
    expect(decideNpcAction({ collapsing: false, wonNeed: 'water', scheduleActivity: 'work' })).toBe('need')
    expect(shouldInterruptAction({
      collapsing: false,
      activeNeed: 'food',
      criticalNeed: 'water',
      weatherPressure: 0,
    })).toBe(false)
  })
})
