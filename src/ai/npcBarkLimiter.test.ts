import { describe, expect, it } from 'vitest'
import type { NpcVoiceResolveInput } from './npcVoiceLines'
import { configureNpcVoicePlayback } from '../audio/npcVoicePlayback'
import { NpcBarkLimiter } from './npcBarkLimiter'
import {
  NPC_OPTIONAL_BARK_MAX_PER_AREA,
  type NpcBarkIntent,
} from './npcBarkPolicies'
import { createRequestNpcBark, resolveNpcBarkVoiceUrl } from './npcBarkRequest'

function npc(id: string, area = 'settlement-a'): NpcVoiceResolveInput & { id: string; areaKey: string } {
  return {
    id,
    areaKey: area,
    gender: 'male',
    role: 'farmer',
    age: 40,
    voiceProfileId: 'general:male',
  }
}

describe('NpcBarkLimiter', () => {
  it('admits only maxPerAreaWindow exhausted barks in one area/300s and never exceeds optional global', () => {
    const limiter = new NpcBarkLimiter()
    const accepted: boolean[] = []
    for (let i = 0; i < 5; i++) {
      const d = limiter.tryAdmit({
        npcId: `npc-${i}`,
        areaKey: 'a',
        intent: 'exhausted',
        nowSim: 10 + i,
      })
      accepted.push(d.accepted)
    }
    // exhausted maxPerAreaWindow = 2; optional global = 4 — intent budget wins first
    expect(accepted.filter(Boolean)).toHaveLength(2)
    expect(accepted).toEqual([true, true, false, false, false])
  })

  it('keeps settlement area budgets independent', () => {
    const limiter = new NpcBarkLimiter()
    expect(limiter.tryAdmit({
      npcId: 'a0', areaKey: 'settlement-a', intent: 'exhausted', nowSim: 0,
    }).accepted).toBe(true)
    expect(limiter.tryAdmit({
      npcId: 'a1', areaKey: 'settlement-a', intent: 'exhausted', nowSim: 1,
    }).accepted).toBe(true)
    expect(limiter.tryAdmit({
      npcId: 'a2', areaKey: 'settlement-a', intent: 'exhausted', nowSim: 2,
    }).accepted).toBe(false)
    expect(limiter.tryAdmit({
      npcId: 'b0', areaKey: 'settlement-b', intent: 'exhausted', nowSim: 3,
    }).accepted).toBe(true)
  })

  it('rejects the same NPC + intent inside cooldown', () => {
    const limiter = new NpcBarkLimiter()
    expect(limiter.tryAdmit({
      npcId: 'n1', areaKey: 'a', intent: 'exhausted', nowSim: 0,
    }).accepted).toBe(true)
    const second = limiter.tryAdmit({
      npcId: 'n1', areaKey: 'a', intent: 'exhausted', nowSim: 100,
    })
    expect(second).toEqual({ accepted: false, reason: 'npc-cooldown' })
    expect(limiter.tryAdmit({
      npcId: 'n1', areaKey: 'a', intent: 'exhausted', nowSim: 1200,
    }).accepted).toBe(true)
  })

  it('expires area budget after the rolling window', () => {
    const limiter = new NpcBarkLimiter()
    expect(limiter.tryAdmit({
      npcId: 'n0', areaKey: 'a', intent: 'exhausted', nowSim: 0,
    }).accepted).toBe(true)
    expect(limiter.tryAdmit({
      npcId: 'n1', areaKey: 'a', intent: 'exhausted', nowSim: 1,
    }).accepted).toBe(true)
    expect(limiter.tryAdmit({
      npcId: 'n2', areaKey: 'a', intent: 'exhausted', nowSim: 2,
    }).accepted).toBe(false)
    expect(limiter.tryAdmit({
      npcId: 'n2', areaKey: 'a', intent: 'exhausted', nowSim: 301,
    }).accepted).toBe(true)
  })

  it('shares the optional ambient budget across mixed optional intents', () => {
    const limiter = new NpcBarkLimiter()
    const intents: NpcBarkIntent[] = [
      'exhausted',
      'hungry',
      'weather_shelter',
      'work_finished',
      'exhausted',
    ]
    const accepted = intents.map((intent, i) =>
      limiter.tryAdmit({
        npcId: `npc-${i}`,
        areaKey: 'a',
        intent,
        nowSim: i,
      }).accepted,
    )
    // work_finished max 1, exhausted max 2, hungry max 2, weather max 2 —
    // optional global caps at 4 so the 5th fails even if intent budget remains
    expect(accepted.filter(Boolean).length).toBeLessThanOrEqual(NPC_OPTIONAL_BARK_MAX_PER_AREA)
    expect(accepted[4]).toBe(false)
  })

  it('still admits a required bark after optional ambient budget is exhausted', () => {
    const limiter = new NpcBarkLimiter()
    for (let i = 0; i < NPC_OPTIONAL_BARK_MAX_PER_AREA; i++) {
      // Use hungry for slots after exhausted's area intent cap of 2
      const intent: NpcBarkIntent = i < 2 ? 'exhausted' : 'hungry'
      expect(limiter.tryAdmit({
        npcId: `opt-${i}`, areaKey: 'a', intent, nowSim: i,
      }).accepted).toBe(true)
    }
    expect(limiter.tryAdmit({
      npcId: 'opt-extra', areaKey: 'a', intent: 'weather_shelter', nowSim: 10,
    })).toEqual({ accepted: false, reason: 'optional-global-budget' })
    expect(limiter.tryAdmit({
      npcId: 'guard-1', areaKey: 'a', intent: 'danger_alert', nowSim: 11, episodeKey: 'threat:wolf-1',
    }).accepted).toBe(true)
  })

  it('suppresses repeated alarms for the same threat episode and allows a new episode', () => {
    const limiter = new NpcBarkLimiter()
    expect(limiter.tryAdmit({
      npcId: 'n1', areaKey: 'a', intent: 'danger_alert', nowSim: 0, episodeKey: 'threat:w1',
    }).accepted).toBe(true)
    expect(limiter.tryAdmit({
      npcId: 'n2', areaKey: 'a', intent: 'danger_alert', nowSim: 1, episodeKey: 'threat:w1',
    })).toEqual({ accepted: false, reason: 'episode-already-spoken' })
    expect(limiter.tryAdmit({
      npcId: 'n3', areaKey: 'a', intent: 'danger_alert', nowSim: 2, episodeKey: 'threat:w2',
    }).accepted).toBe(true)
  })
})

describe('resolveNpcBarkVoiceUrl', () => {
  it('resolves livestock_danger for shepherd and falls back to danger_alert otherwise', () => {
    const shepherd = resolveNpcBarkVoiceUrl(
      { id: 's', gender: 'male', role: 'shepherd', age: 40, voiceProfileId: 'shepherd:male' },
      'livestock_danger',
    )
    expect(shepherd?.url).toBe('/sounds/voices/shepherd_male_livestock_danger_01.mp3')
    expect(shepherd?.resolvedIntent).toBe('livestock_danger')

    const farmer = resolveNpcBarkVoiceUrl(
      { id: 'f', gender: 'male', role: 'farmer', age: 40, voiceProfileId: 'general:male' },
      'livestock_danger',
    )
    expect(farmer?.url).toBe('/sounds/voices/general_male_danger_alert_01.mp3')
    expect(farmer?.resolvedIntent).toBe('danger_alert')
  })
})

describe('createRequestNpcBark', () => {
  it('does not spend bark budget when no voice asset exists', () => {
    const played: string[] = []
    configureNpcVoicePlayback((url) => { played.push(url) })
    const limiter = new NpcBarkLimiter()
    const request = createRequestNpcBark(limiter)
    const femaleHungry = npc('f1')
    femaleHungry.gender = 'female'
    femaleHungry.voiceProfileId = 'general:female'
    // No general_female_hungry asset — should no-op without admitting
    const decision = request({
      npc: femaleHungry,
      position: { x: 0, z: 0 },
      areaKey: 'a',
      intent: 'hungry',
      nowSim: 0,
    })
    expect(decision).toEqual({ accepted: false, reason: 'no-voice-asset' })
    expect(played).toEqual([])
    // A later male hungry in the same area should still get the full intent budget
    expect(request({
      npc: npc('m1'),
      position: { x: 0, z: 0 },
      areaKey: 'a',
      intent: 'hungry',
      nowSim: 1,
    }).accepted).toBe(true)
    configureNpcVoicePlayback(null)
  })
})
