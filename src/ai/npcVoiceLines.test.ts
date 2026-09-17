import { describe, expect, it } from 'vitest'
import {
  buildNpcVoiceLookupKeys,
  type NpcVoiceResolveInput,
  resolveNpcVoiceLine,
  resolveNpcVoiceLineWithManifest,
  voiceAgeBandForAge,
  voiceScopeForRole,
} from './npcVoiceLines'

function npc(partial: Partial<NpcVoiceResolveInput> = {}): NpcVoiceResolveInput {
  return {
    id: 'village:npc:0',
    gender: 'male',
    role: 'farmer',
    age: 30,
    voiceActor: 'alex',
    ...partial,
  }
}

describe('voiceAgeBandForAge', () => {
  it('maps youngAdult boundary (24) to young and 25 to null', () => {
    expect(voiceAgeBandForAge(24)).toBe('young')
    expect(voiceAgeBandForAge(25)).toBeNull()
  })

  it('maps elderly boundary (65) to old and 64 to null', () => {
    expect(voiceAgeBandForAge(64)).toBeNull()
    expect(voiceAgeBandForAge(65)).toBe('old')
  })
})

describe('voiceScopeForRole', () => {
  it('maps trader to merchant and leaves other roles unchanged', () => {
    expect(voiceScopeForRole('trader')).toBe('merchant')
    expect(voiceScopeForRole('guard')).toBe('guard')
    expect(voiceScopeForRole('hunter')).toBe('hunter')
  })
})

describe('buildNpcVoiceLookupKeys', () => {
  it('orders most-specific to least-specific, including age when present', () => {
    expect(buildNpcVoiceLookupKeys(npc({ id: 'n1', role: 'hunter', age: 70 }), 'greeting')).toEqual([
      'npc:n1:greeting',
      'hunter:male:old:greeting',
      'hunter:male:greeting',
      'general:male:old:greeting',
      'general:male:greeting',
    ])
  })

  it('skips age-keyed steps when age band is null', () => {
    expect(buildNpcVoiceLookupKeys(npc({ id: 'n1', role: 'hunter', age: 40 }), 'greeting')).toEqual([
      'npc:n1:greeting',
      'hunter:male:greeting',
      'general:male:greeting',
    ])
  })
})

describe('resolveNpcVoiceLineWithManifest hierarchy', () => {
  const hierarchyManifest = {
    'npc:special:greeting': ['/npc-greeting'],
    'hunter:male:old:greeting': ['/hunter-old-greeting'],
    'hunter:male:greeting': ['/hunter-greeting'],
    'general:male:old:greeting': ['/general-old-greeting'],
    'general:male:greeting': ['/general-greeting'],
    'merchant:female:greeting': ['/m1', '/m2', '/m3'],
  } as const

  it('prefers NPC-specific over profession', () => {
    expect(
      resolveNpcVoiceLineWithManifest(
        hierarchyManifest,
        npc({ id: 'special', role: 'hunter', age: 70 }),
        'greeting',
      ),
    ).toBe('/npc-greeting')
  })

  it('prefers profession + gender + age over profession + gender', () => {
    expect(
      resolveNpcVoiceLineWithManifest(
        hierarchyManifest,
        npc({ id: 'other', role: 'hunter', age: 70 }),
        'greeting',
      ),
    ).toBe('/hunter-old-greeting')
  })

  it('prefers profession + gender over general', () => {
    expect(
      resolveNpcVoiceLineWithManifest(
        hierarchyManifest,
        npc({ id: 'other', role: 'hunter', age: 40 }),
        'greeting',
      ),
    ).toBe('/hunter-greeting')
  })

  it('prefers general + gender + age over general + gender', () => {
    const manifest = {
      'general:male:old:greeting': ['/general-old-greeting'],
      'general:male:greeting': ['/general-greeting'],
    }
    expect(
      resolveNpcVoiceLineWithManifest(manifest, npc({ role: 'farmer', age: 70 }), 'greeting'),
    ).toBe('/general-old-greeting')
  })

  it('falls back to general + gender', () => {
    const manifest = { 'general:male:greeting': ['/general-greeting'] }
    expect(
      resolveNpcVoiceLineWithManifest(manifest, npc({ role: 'farmer', age: 40 }), 'greeting'),
    ).toBe('/general-greeting')
  })

  it('picks from the matching multi-variant pool', () => {
    const urls = new Set<string>()
    for (let i = 0; i < 40; i++) {
      const url = resolveNpcVoiceLineWithManifest(
        hierarchyManifest,
        npc({ id: 'kasia', gender: 'female', role: 'trader', age: 35, voiceActor: 'karen' }),
        'greeting',
      )
      if (url) urls.add(url)
    }
    expect([...urls].sort()).toEqual(['/m1', '/m2', '/m3'])
  })

  it('returns only the generated URL when the manifest matches (no legacy dual result)', () => {
    const url = resolveNpcVoiceLineWithManifest(
      { 'general:male:greeting': ['/generated-only'] },
      npc({ voiceActor: 'sean' }),
      'greeting',
    )
    expect(url).toBe('/generated-only')
    expect(url).not.toMatch(/sean|male-greeting/)
  })

  it('uses legacy voiceActor fallback when the generated manifest has no match', () => {
    const url = resolveNpcVoiceLineWithManifest({}, npc({ voiceActor: 'sean' }), 'greeting')
    expect(url).toMatch(/^\/sounds\/male-greeting-sean-\d{2}\.ogg$/)
  })

  it('returns undefined when neither generated nor legacy assets exist', () => {
    expect(
      resolveNpcVoiceLineWithManifest({}, npc({ voiceActor: 'sean' }), 'quest_declined'),
    ).toBeUndefined()
  })
})

describe('resolveNpcVoiceLine production manifest', () => {
  it('resolves merchant female greeting to the merchant-specific generated pool', () => {
    const url = resolveNpcVoiceLine(
      npc({ gender: 'female', role: 'trader', age: 35, voiceActor: 'karen' }),
      'greeting',
    )
    expect(url).toMatch(/^\/sounds\/voices\/merchant_female_greeting_0[1-3]\.mp3$/)
  })

  it('falls a male farmer without profession audio back to general male greeting', () => {
    expect(resolveNpcVoiceLine(npc({ role: 'farmer', age: 40 }), 'greeting')).toBe(
      '/sounds/voices/general_male_greeting_01.mp3',
    )
  })

  it('resolves guard male quest_declined to the guard-specific generated pool', () => {
    const url = resolveNpcVoiceLine(npc({ role: 'guard', age: 40 }), 'quest_declined')
    expect(url).toMatch(/^\/sounds\/voices\/guard_male_quest_declined_0[12]\.mp3$/)
  })

  it('does not invent a legacy Super Dialogue fallback for quest_declined', () => {
    expect(resolveNpcVoiceLine(npc({ role: 'farmer', age: 40 }), 'quest_declined')).toBeUndefined()
  })

  it('resolves merchant female confirmation via agree filename', () => {
    expect(
      resolveNpcVoiceLine(
        npc({ gender: 'female', role: 'trader', age: 35, voiceActor: 'karen' }),
        'confirmation',
      ),
    ).toBe('/sounds/voices/merchant_female_agree_01.mp3')
  })
})
