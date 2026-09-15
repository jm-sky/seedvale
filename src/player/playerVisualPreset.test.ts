import { describe, expect, it, vi } from 'vitest'
import {
  PLAYER_MODEL_URL,
} from './PlayerController'
import {
  companionAnimationUrl,
  PLAYER_UBC_ANIMATION_URL,
  PLAYER_UBC_KNIGHT_URL,
  PLAYER_UBC_PEASANT_BROWN_URL,
  PLAYER_UBC_PEASANT_URL,
  PLAYER_UBC_RANGER_BROWN_URL,
  PLAYER_UBC_RANGER_URL,
  PLAYER_UBC_WIZARD_URL,
  resolveEquipmentOutfit,
  resolvePlayerAppearance,
  resolvePlayerUrlOverride,
  resolvePlayerVisualPreset,
  ubcPreloadUrls,
} from './playerVisualPreset'

describe('resolvePlayerUrlOverride', () => {
  it('returns null when the param is absent', () => {
    expect(resolvePlayerUrlOverride('')).toBeNull()
    expect(resolvePlayerUrlOverride('?debug=1')).toBeNull()
  })

  it('accepts the whitelist without taking a raw path from the URL', () => {
    expect(resolvePlayerUrlOverride('?player=peasant')).toBe('peasant')
    expect(resolvePlayerUrlOverride('player=ranger')).toBe('ranger')
    expect(resolvePlayerUrlOverride('?player=adventurer')).toBe('adventurer')
    expect(resolvePlayerUrlOverride('?player=knight')).toBe('knight')
    expect(resolvePlayerUrlOverride('?player=knight_cloth')).toBe('knight_cloth')
    expect(resolvePlayerUrlOverride('?player=noble')).toBe('noble')
    expect(resolvePlayerUrlOverride('?player=wizard')).toBe('wizard')
  })

  it('returns null for unknown values', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolvePlayerUrlOverride('?player=../../secret')).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('resolveEquipmentOutfit', () => {
  it('maps an empty body slot to Peasant', () => {
    expect(resolveEquipmentOutfit(null)).toBe('peasant')
    expect(resolveEquipmentOutfit(undefined)).toBe('peasant')
  })

  it('maps leather to Ranger and other body armor to Knight', () => {
    expect(resolveEquipmentOutfit('leather_armor')).toBe('ranger')
    expect(resolveEquipmentOutfit('chainmail')).toBe('knight')
    expect(resolveEquipmentOutfit('future_plate')).toBe('knight')
  })
})

describe('resolvePlayerAppearance', () => {
  it('defaults to Peasant when the URL and body slot are empty', () => {
    const appearance = resolvePlayerAppearance({ search: '', bodyKind: null })
    expect(appearance.id).toBe('peasant')
    expect(appearance.modelUrl).toBe(PLAYER_UBC_PEASANT_URL)
    expect(appearance.animationUrl).toBe(PLAYER_UBC_ANIMATION_URL)
    expect(appearance.tint).toBe('default')
    expect(appearance.tintUrl).toBeNull()
  })

  it('uses Ranger for leather and Knight for chainmail when there is no URL override', () => {
    expect(resolvePlayerAppearance({ search: '', bodyKind: 'leather_armor' }).id).toBe('ranger')
    expect(resolvePlayerAppearance({ search: '', bodyKind: 'chainmail' }).modelUrl).toBe(
      PLAYER_UBC_KNIGHT_URL,
    )
  })

  it('lets ?player= win over equipped armor', () => {
    expect(
      resolvePlayerAppearance({ search: '?player=adventurer', bodyKind: 'leather_armor' }).id,
    ).toBe('adventurer')
    expect(
      resolvePlayerAppearance({ search: '?player=ranger', bodyKind: null }).id,
    ).toBe('ranger')
    expect(
      resolvePlayerAppearance({ search: '?player=peasant', bodyKind: 'chainmail' }).id,
    ).toBe('peasant')
    expect(
      resolvePlayerAppearance({ search: '?player=wizard', bodyKind: 'leather_armor' }).modelUrl,
    ).toBe(PLAYER_UBC_WIZARD_URL)
  })

  it('applies ?playerTint=brown only to UBC outfits', () => {
    expect(resolvePlayerAppearance({ search: '?playerTint=brown', bodyKind: null })).toMatchObject({
      id: 'peasant',
      tint: 'brown',
      tintUrl: PLAYER_UBC_PEASANT_BROWN_URL,
    })
    expect(
      resolvePlayerAppearance({ search: '?player=ranger&playerTint=brown', bodyKind: null }),
    ).toMatchObject({
      id: 'ranger',
      tint: 'brown',
      tintUrl: PLAYER_UBC_RANGER_BROWN_URL,
    })
    expect(
      resolvePlayerAppearance({ search: '?player=adventurer&playerTint=brown', bodyKind: null }),
    ).toMatchObject({
      id: 'adventurer',
      tint: 'default',
      tintUrl: null,
    })
  })
})

describe('resolvePlayerVisualPreset', () => {
  it('defaults to Peasant when the param is absent', () => {
    const preset = resolvePlayerVisualPreset('')
    expect(preset.id).toBe('peasant')
    expect(preset.modelUrl).toBe(PLAYER_UBC_PEASANT_URL)
    expect(preset.animationUrl).toBe(PLAYER_UBC_ANIMATION_URL)
  })

  it('still exposes Adventurer only through the whitelist', () => {
    expect(resolvePlayerVisualPreset('?player=adventurer')).toEqual({
      id: 'adventurer',
      modelUrl: PLAYER_MODEL_URL,
      animationUrl: null,
    })
  })
})

describe('companionAnimationUrl', () => {
  it('returns ual1_player for UBC outfit meshes and skips the clip GLB itself', () => {
    expect(companionAnimationUrl(PLAYER_UBC_PEASANT_URL)).toBe(PLAYER_UBC_ANIMATION_URL)
    expect(companionAnimationUrl(`${PLAYER_UBC_RANGER_URL}?r=3`)).toBe(PLAYER_UBC_ANIMATION_URL)
    expect(companionAnimationUrl(PLAYER_UBC_ANIMATION_URL)).toBeNull()
    expect(companionAnimationUrl(PLAYER_MODEL_URL)).toBeNull()
  })
})

describe('ubcPreloadUrls', () => {
  it('warms the other equipment-driven UBC meshes and skips Adventurer', () => {
    expect(ubcPreloadUrls(PLAYER_UBC_PEASANT_URL)).toEqual([
      PLAYER_UBC_RANGER_URL,
      PLAYER_UBC_KNIGHT_URL,
    ])
    expect(ubcPreloadUrls(PLAYER_UBC_RANGER_URL)).toEqual([
      PLAYER_UBC_PEASANT_URL,
      PLAYER_UBC_KNIGHT_URL,
    ])
    expect(ubcPreloadUrls(PLAYER_UBC_KNIGHT_URL)).toEqual([
      PLAYER_UBC_PEASANT_URL,
      PLAYER_UBC_RANGER_URL,
    ])
    expect(ubcPreloadUrls(PLAYER_MODEL_URL)).toEqual([])
    expect(ubcPreloadUrls(PLAYER_UBC_WIZARD_URL)).toEqual([])
  })
})
