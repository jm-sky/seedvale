import { describe, expect, it } from 'vitest'
import { PLAYER_UBC_ANIMATION_URL, PLAYER_UBC_PEASANT_URL, PLAYER_UBC_WIZARD_URL } from '../player/playerVisualPreset'
import {
  NPC_MODEL_URLS,
  NPC_UBC_FEMALE_PEASANT_URL,
  NPC_UBC_FEMALE_WIZARD_URL,
  NPC_UBC_PEASANT_TINT_URL,
  NPC_UBC_WIZARD_TINT_URL,
  NPC_UBC_WOODCUTTER_TINT_URL,
  resolveNpcAppearance,
} from './npcAppearance'

describe('resolveNpcAppearance', () => {
  it('maps adult farmer/woodcutter to Peasant UBC with distinct sidecars', () => {
    const anna = resolveNpcAppearance({ age: 34, gender: 'female', role: 'farmer', treeIndex: 0 })
    expect(anna.outfit).toBe('peasant')
    expect(anna.modelUrl).toBe(NPC_UBC_FEMALE_PEASANT_URL)
    expect(anna.animationUrl).toBe(PLAYER_UBC_ANIMATION_URL)
    expect(anna.tintUrl).toBe(NPC_UBC_PEASANT_TINT_URL)

    const piotr = resolveNpcAppearance({ age: 36, gender: 'male', role: 'woodcutter', treeIndex: 1 })
    expect(piotr.outfit).toBe('peasant')
    expect(piotr.modelUrl).toBe(PLAYER_UBC_PEASANT_URL)
    expect(piotr.tintUrl).toBe(NPC_UBC_WOODCUTTER_TINT_URL)
    expect(piotr.tintUrl).not.toBe(anna.tintUrl)
  })

  it('maps adult trader to Wizard UBC', () => {
    const kasia = resolveNpcAppearance({ age: 28, gender: 'female', role: 'trader', treeIndex: 2 })
    expect(kasia.outfit).toBe('wizard')
    expect(kasia.modelUrl).toBe(NPC_UBC_FEMALE_WIZARD_URL)
    expect(kasia.animationUrl).toBe(PLAYER_UBC_ANIMATION_URL)
    expect(kasia.tintUrl).toBe(NPC_UBC_WIZARD_TINT_URL)

    const maleTrader = resolveNpcAppearance({ age: 40, gender: 'male', role: 'trader', treeIndex: 3 })
    expect(maleTrader.modelUrl).toBe(PLAYER_UBC_WIZARD_URL)
  })

  it('keeps children and other roles on the Modular pool', () => {
    const childFarmer = resolveNpcAppearance({ age: 12, gender: 'female', role: 'farmer', treeIndex: 0 })
    expect(childFarmer.outfit).toBe('modular')
    expect(childFarmer.modelUrl).toBe(NPC_MODEL_URLS.female[0])
    expect(childFarmer.animationUrl).toBeNull()
    expect(childFarmer.tintUrl).toBeNull()

    const marek = resolveNpcAppearance({ age: 32, gender: 'male', role: 'guard', treeIndex: 3 })
    expect(marek.outfit).toBe('modular')
    expect(marek.modelUrl).toBe(NPC_MODEL_URLS.male[3 % NPC_MODEL_URLS.male.length])

    const hunter = resolveNpcAppearance({ age: 30, gender: 'male', role: 'hunter', treeIndex: 4 })
    expect(hunter.outfit).toBe('modular')
  })
})
