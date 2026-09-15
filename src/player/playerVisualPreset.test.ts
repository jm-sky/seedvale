import { describe, expect, it, vi } from 'vitest'
import {
  PLAYER_MODEL_URL,
} from './PlayerController'
import {
  PLAYER_UBC_ANIMATION_URL,
  PLAYER_UBC_PEASANT_BROWN_URL,
  PLAYER_UBC_PEASANT_URL,
  PLAYER_UBC_RANGER_BROWN_URL,
  PLAYER_UBC_RANGER_URL,
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

  it('maps leather and chainmail (and any other body armor) to Ranger', () => {
    expect(resolveEquipmentOutfit('leather_armor')).toBe('ranger')
    expect(resolveEquipmentOutfit('chainmail')).toBe('ranger')
    expect(resolveEquipmentOutfit('future_plate')).toBe('ranger')
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

  it('uses Ranger when body armor is worn and there is no URL override', () => {
    expect(resolvePlayerAppearance({ search: '', bodyKind: 'leather_armor' }).id).toBe('ranger')
    expect(resolvePlayerAppearance({ search: '', bodyKind: 'chainmail' }).modelUrl).toBe(
      PLAYER_UBC_RANGER_URL,
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

describe('ubcPreloadUrls', () => {
  it('warms the other UBC mesh and skips Adventurer', () => {
    expect(ubcPreloadUrls(PLAYER_UBC_PEASANT_URL)).toEqual([PLAYER_UBC_RANGER_URL])
    expect(ubcPreloadUrls(PLAYER_UBC_RANGER_URL)).toEqual([PLAYER_UBC_PEASANT_URL])
    expect(ubcPreloadUrls(PLAYER_MODEL_URL)).toEqual([])
  })
})
