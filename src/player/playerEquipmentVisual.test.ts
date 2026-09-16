import { describe, expect, it } from 'vitest'
import {
  PLAYER_UBC_KNIGHT_PAULDRON_ROUND_URL,
  PLAYER_UBC_KNIGHT_PAULDRON_SPIKE_URL,
  PLAYER_UBC_LEATHER_PAULDRON_URL,
  PLAYER_UBC_RANGER_PAULDRON_URL,
  resolvePlayerEquipmentVisual,
  resolvePlayerEquipmentVisualTintUrl,
} from './playerEquipmentVisual'

describe('resolvePlayerEquipmentVisual', () => {
  it('maps each pauldron kind to its accessory GLB', () => {
    expect(resolvePlayerEquipmentVisual('leather_pauldron')).toEqual({
      modelUrl: PLAYER_UBC_LEATHER_PAULDRON_URL,
      tint: 'brown',
    })
    expect(resolvePlayerEquipmentVisual('ranger_pauldron')).toEqual({
      modelUrl: PLAYER_UBC_RANGER_PAULDRON_URL,
    })
    expect(resolvePlayerEquipmentVisual('knight_pauldron_spike')).toEqual({
      modelUrl: PLAYER_UBC_KNIGHT_PAULDRON_SPIKE_URL,
    })
    expect(resolvePlayerEquipmentVisual('knight_pauldron_round')).toEqual({
      modelUrl: PLAYER_UBC_KNIGHT_PAULDRON_ROUND_URL,
    })
  })

  it('keeps leather as the only brown variant and alignment unset until manual tuning', () => {
    const leather = resolvePlayerEquipmentVisual('leather_pauldron')
    expect(leather?.tint).toBe('brown')
    expect(leather?.alignment).toBeUndefined()
    expect(resolvePlayerEquipmentVisual('ranger_pauldron')?.tint).toBeUndefined()
    expect(resolvePlayerEquipmentVisual('knight_pauldron_spike')?.alignment).toBeUndefined()
    expect(resolvePlayerEquipmentVisual('knight_pauldron_round')?.alignment).toBeUndefined()
  })

  it('returns null for non-accessory kinds', () => {
    expect(resolvePlayerEquipmentVisual('leather_armor')).toBeNull()
    expect(resolvePlayerEquipmentVisual('chainmail')).toBeNull()
    expect(resolvePlayerEquipmentVisual('knife')).toBeNull()
  })

  it('resolves leather brown to the Noble brown sidecar, independent of player tint', () => {
    const leather = resolvePlayerEquipmentVisual('leather_pauldron')!
    expect(resolvePlayerEquipmentVisualTintUrl(leather)).toBe('/models/characters/ubc/male_noble_brown.webp')
    expect(resolvePlayerEquipmentVisualTintUrl(resolvePlayerEquipmentVisual('ranger_pauldron')!)).toBeNull()
  })
})
