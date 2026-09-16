import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PLAYER_UBC_ANIMATION_URL, PLAYER_UBC_PEASANT_URL, PLAYER_UBC_RANGER_URL, PLAYER_UBC_WIZARD_URL } from '../player/playerVisualPreset'
import {
  NPC_CLOTHING_HUE,
  NPC_HAIR_COLOR,
  NPC_MODEL_URLS,
  NPC_UBC_FEMALE_PEASANT_URL,
  NPC_UBC_FEMALE_RANGER_URL,
  NPC_UBC_FEMALE_WIZARD_URL,
  NPC_UBC_HAIR_1_URL,
  NPC_UBC_HAIR_2_URL,
  NPC_UBC_KNIGHT_TINT_URL,
  NPC_UBC_MALE_KNIGHT_UNHELMETED_URL,
  NPC_UBC_PEASANT_TINT_URL,
  NPC_UBC_RANGER_TINT_URL,
  NPC_UBC_WIZARD_TINT_URL,
  NPC_UBC_WOODCUTTER_TINT_URL,
  resolveNpcAppearance,
  ubcVariantModelUrl,
} from './npcAppearance'

const ANNA = 'home:npc:0'
const PIOTR = 'home:npc:1'
const KASIA = 'home:npc:2'

describe('resolveNpcAppearance', () => {
  it('maps adult farmer/woodcutter to Peasant UBC with distinct sidecars', () => {
    const anna = resolveNpcAppearance({
      age: 34,
      gender: 'female',
      npcId: ANNA,
      role: 'farmer',
      treeIndex: 0,
    })
    expect(anna.outfit).toBe('peasant')
    expect(anna.modelUrl).toMatch(/female_peasant/)
    expect(anna.animationUrl).toBe(PLAYER_UBC_ANIMATION_URL)
    expect(anna.tintUrl).toBe(NPC_UBC_PEASANT_TINT_URL)
    expect(Object.values(NPC_HAIR_COLOR)).toContain(anna.hairColor)
    expect(Object.values(NPC_CLOTHING_HUE)).toContain(anna.clothingHue)

    const piotr = resolveNpcAppearance({
      age: 36,
      gender: 'male',
      npcId: PIOTR,
      role: 'woodcutter',
      treeIndex: 1,
    })
    expect(piotr.outfit).toBe('peasant')
    expect(piotr.modelUrl).toMatch(/male_peasant/)
    expect(piotr.tintUrl).toBe(NPC_UBC_WOODCUTTER_TINT_URL)
    expect(piotr.tintUrl).not.toBe(anna.tintUrl)
  })

  it('maps adult hunter to Ranger UBC with a tint the player does not use', () => {
    const hunter = resolveNpcAppearance({
      age: 30,
      gender: 'male',
      npcId: 'home:npc:4',
      role: 'hunter',
      treeIndex: 4,
    })
    expect(hunter.outfit).toBe('ranger')
    expect(hunter.modelUrl).toMatch(/male_ranger/)
    expect(hunter.animationUrl).toBe(PLAYER_UBC_ANIMATION_URL)
    expect(hunter.tintUrl).toBe(NPC_UBC_RANGER_TINT_URL)
    expect(Object.values(NPC_HAIR_COLOR)).toContain(hunter.hairColor)

    const huntress = resolveNpcAppearance({
      age: 28,
      gender: 'female',
      npcId: 'woods:npc:5',
      role: 'hunter',
      treeIndex: 5,
    })
    expect(huntress.outfit).toBe('ranger')
    expect(huntress.modelUrl).not.toMatch(/_simple|_buzzed|_buns/)
    expect(huntress.modelUrl).not.toBe(NPC_UBC_FEMALE_RANGER_URL)
    expect(huntress.modelUrl).toBe('/models/characters/ubc/npc/female_ranger_long.glb')
    expect(huntress.tintUrl).toBe(NPC_UBC_RANGER_TINT_URL)
  })

  it('maps adult male guard to a single unhelmeted Knight UBC', () => {
    const marek = resolveNpcAppearance({
      age: 32,
      gender: 'male',
      npcId: 'home:npc:3',
      role: 'guard',
      treeIndex: 3,
    })
    expect(marek.outfit).toBe('knight')
    expect(marek.modelUrl).toBe(NPC_UBC_MALE_KNIGHT_UNHELMETED_URL)
    expect(marek.animationUrl).toBe(PLAYER_UBC_ANIMATION_URL)
    expect(marek.tintUrl).toBe(NPC_UBC_KNIGHT_TINT_URL)
    expect(Object.values(NPC_HAIR_COLOR)).toContain(marek.hairColor)
    expect(Object.values(NPC_CLOTHING_HUE)).toContain(marek.clothingHue)

    const otherGuard = resolveNpcAppearance({
      age: 40,
      gender: 'male',
      npcId: 'closed:npc:8',
      role: 'guard',
      treeIndex: 8,
    })
    expect(otherGuard.outfit).toBe('knight')
    expect(otherGuard.modelUrl).toBe(NPC_UBC_MALE_KNIGHT_UNHELMETED_URL)
  })

  it('maps adult trader to Wizard UBC', () => {
    const kasia = resolveNpcAppearance({
      age: 28,
      gender: 'female',
      npcId: KASIA,
      role: 'trader',
      treeIndex: 2,
    })
    expect(kasia.outfit).toBe('wizard')
    expect(
      kasia.modelUrl === '/models/characters/ubc/npc/female_wizard_long.glb'
      || kasia.modelUrl === '/models/characters/ubc/npc/female_wizard_buns.glb',
    ).toBe(true)
    expect(kasia.animationUrl).toBe(PLAYER_UBC_ANIMATION_URL)
    expect(kasia.tintUrl).toBe(NPC_UBC_WIZARD_TINT_URL)

    for (let i = 0; i < 16; i++) {
      const trader = resolveNpcAppearance({
        age: 28,
        gender: 'female',
        npcId: `market:npc:${i}`,
        role: 'trader',
        treeIndex: i,
      })
      expect(trader.modelUrl).not.toMatch(/_simple|_buzzed/)
      expect(trader.modelUrl).not.toBe(NPC_UBC_FEMALE_WIZARD_URL)
      expect(
        trader.modelUrl.endsWith('female_wizard_long.glb')
        || trader.modelUrl.endsWith('female_wizard_buns.glb'),
      ).toBe(true)
    }

    const maleTrader = resolveNpcAppearance({
      age: 40,
      gender: 'male',
      npcId: 'home:npc:3',
      role: 'trader',
      treeIndex: 3,
    })
    expect(maleTrader.modelUrl).toMatch(/male_wizard/)
  })

  it('keeps hair/beard/hue stable for the same npcId across farmer vs woodcutter', () => {
    const shared = {
      age: 34,
      gender: 'male' as const,
      npcId: 'field:npc:4',
      treeIndex: 4,
    }
    const farmer = resolveNpcAppearance({ ...shared, role: 'farmer' })
    const woodcutter = resolveNpcAppearance({ ...shared, role: 'woodcutter' })
    expect(farmer.modelUrl).toBe(woodcutter.modelUrl)
    expect(farmer.hairColor).toBe(woodcutter.hairColor)
    expect(farmer.clothingHue).toBe(woodcutter.clothingHue)
    expect(farmer.tintUrl).toBe(NPC_UBC_PEASANT_TINT_URL)
    expect(woodcutter.tintUrl).toBe(NPC_UBC_WOODCUTTER_TINT_URL)
  })

  it('is deterministic for a given npcId', () => {
    const opts = {
      age: 30,
      gender: 'male' as const,
      npcId: 'stable:npc:7',
      role: 'farmer' as const,
      treeIndex: 7,
    }
    expect(resolveNpcAppearance(opts)).toEqual(resolveNpcAppearance(opts))
  })

  it('spreads male farmer looks across more than one mesh', () => {
    const urls = new Set<string>()
    let sawBeard = false
    let sawBare = false
    for (let i = 0; i < 32; i++) {
      const look = resolveNpcAppearance({
        age: 30,
        gender: 'male',
        npcId: `spread:npc:${i}`,
        role: 'farmer',
        treeIndex: i,
      })
      urls.add(look.modelUrl)
      if (look.modelUrl.includes('_beard')) sawBeard = true
      else sawBare = true
    }
    expect(urls.size).toBeGreaterThan(1)
    expect(sawBeard).toBe(true)
    expect(sawBare).toBe(true)
  })

  it('never assigns a beard variant or short hair to women', () => {
    for (let i = 0; i < 40; i++) {
      const look = resolveNpcAppearance({
        age: 28,
        gender: 'female',
        npcId: `village:npc:${i}`,
        role: i % 2 === 0 ? 'farmer' : 'trader',
        treeIndex: i,
      })
      expect(look.modelUrl).not.toMatch(/_beard|_simple|_buzzed/)
    }
  })

  it('never requests male buns or female ranger buns GLBs', () => {
    for (let i = 0; i < 48; i++) {
      const male = resolveNpcAppearance({
        age: 30,
        gender: 'male',
        npcId: `nobuns:male:${i}`,
        role: i % 3 === 0 ? 'farmer' : i % 3 === 1 ? 'trader' : 'hunter',
        treeIndex: i,
      })
      expect(male.modelUrl).not.toMatch(/_buns/)

      const huntress = resolveNpcAppearance({
        age: 28,
        gender: 'female',
        npcId: `nobuns:huntress:${i}`,
        role: 'hunter',
        treeIndex: i,
      })
      expect(huntress.modelUrl).not.toMatch(/female_ranger_buns/)
      expect(huntress.modelUrl).toBe('/models/characters/ubc/npc/female_ranger_long.glb')
    }
  })

  it('reuses player default GLBs for the baked npc-039 / hunter combos', () => {
    expect(ubcVariantModelUrl('male', 'peasant', 'simple', false)).toBe(PLAYER_UBC_PEASANT_URL)
    expect(ubcVariantModelUrl('female', 'peasant', 'long', false)).toBe(NPC_UBC_FEMALE_PEASANT_URL)
    expect(ubcVariantModelUrl('male', 'wizard', 'simple', false)).toBe(PLAYER_UBC_WIZARD_URL)
    expect(ubcVariantModelUrl('male', 'ranger', 'simple', false)).toBe(PLAYER_UBC_RANGER_URL)
    expect(ubcVariantModelUrl('female', 'wizard', 'long', false)).toBe(
      '/models/characters/ubc/npc/female_wizard_long.glb',
    )
    expect(ubcVariantModelUrl('female', 'ranger', 'long', false)).toBe(
      '/models/characters/ubc/npc/female_ranger_long.glb',
    )
    expect(ubcVariantModelUrl('male', 'peasant', 'simple', true)).toBe(
      '/models/characters/ubc/npc/male_peasant_simple_beard.glb',
    )
    expect(ubcVariantModelUrl('female', 'wizard', 'buns', false)).toBe(
      '/models/characters/ubc/npc/female_wizard_buns.glb',
    )
    expect(ubcVariantModelUrl('male', 'ranger', 'long', true)).toBe(
      '/models/characters/ubc/npc/male_ranger_long_beard.glb',
    )
    expect(ubcVariantModelUrl('male', 'knight', 'simple', false)).not.toMatch(/male_knight\.glb$/)
    expect(ubcVariantModelUrl('male', 'knight', 'simple', false)).not.toBe(
      NPC_UBC_MALE_KNIGHT_UNHELMETED_URL,
    )
  })

  it('ships every baked variant GLB and hair sidecar', () => {
    const maleHairs = ['simple', 'long', 'buzzed'] as const
    const femaleHairs = ['long', 'buns'] as const
    for (const outfit of ['peasant', 'wizard', 'ranger'] as const) {
      for (const hair of maleHairs) {
        for (const beard of [false, true]) {
          const url = ubcVariantModelUrl('male', outfit, hair, beard)
          expect(existsSync(`public${url}`), url).toBe(true)
        }
      }
      for (const hair of femaleHairs) {
        if (hair === 'buns' && outfit === 'ranger') continue
        const url = ubcVariantModelUrl('female', outfit, hair, false)
        expect(existsSync(`public${url}`), url).toBe(true)
      }
    }
    expect(existsSync(`public${NPC_UBC_HAIR_1_URL}`)).toBe(true)
    expect(existsSync(`public${NPC_UBC_HAIR_2_URL}`)).toBe(true)
    expect(existsSync('public/models/characters/ubc/npc_ranger.webp')).toBe(true)
    expect(existsSync(`public${NPC_UBC_MALE_KNIGHT_UNHELMETED_URL}`)).toBe(true)
    expect(existsSync(`public${NPC_UBC_KNIGHT_TINT_URL}`)).toBe(true)
  })

  it('never assigns grey hair to an adult NPC under 50', () => {
    for (const age of [18, 25, 34, 49]) {
      for (let i = 0; i < 40; i++) {
        const look = resolveNpcAppearance({
          age,
          gender: i % 2 === 0 ? 'male' : 'female',
          npcId: `young:npc:${age}:${i}`,
          role: 'farmer',
          treeIndex: i,
        })
        expect(look.hairColor).not.toBe(NPC_HAIR_COLOR.grey)
      }
    }
  })

  it('can assign grey hair to a 50-59 year old NPC, roughly at the documented rate', () => {
    const sampleSize = 400
    let greyCount = 0
    for (let i = 0; i < sampleSize; i++) {
      const look = resolveNpcAppearance({
        age: 50 + (i % 10),
        gender: i % 2 === 0 ? 'male' : 'female',
        npcId: `midlife:npc:${i}`,
        role: 'farmer',
        treeIndex: i,
      })
      if (look.hairColor === NPC_HAIR_COLOR.grey) greyCount++
    }
    // ~15% target; wide bounds keep this non-flaky while still catching a broken roll.
    expect(greyCount).toBeGreaterThan(0)
    expect(greyCount).toBeLessThan(sampleSize * 0.35)
  })

  it('gives a 60+ NPC a clearly higher grey-hair rate than a 50-59 NPC', () => {
    const sampleSize = 400
    const countGrey = (ageOf: (i: number) => number): number => {
      let count = 0
      for (let i = 0; i < sampleSize; i++) {
        const look = resolveNpcAppearance({
          age: ageOf(i),
          gender: i % 2 === 0 ? 'male' : 'female',
          npcId: `senior:npc:${i}`,
          role: 'woodcutter',
          treeIndex: i,
        })
        if (look.hairColor === NPC_HAIR_COLOR.grey) count++
      }
      return count
    }
    const midlifeGrey = countGrey(i => 50 + (i % 10))
    const seniorGrey = countGrey(i => 60 + (i % 20))
    // ~15% vs ~75% target; loose bounds avoid flakiness while asserting the ordering.
    expect(seniorGrey).toBeGreaterThan(sampleSize * 0.5)
    expect(seniorGrey).toBeGreaterThan(midlifeGrey)
  })

  it('is deterministic for the same npcId + age, including hair color', () => {
    const opts = {
      age: 62,
      gender: 'female' as const,
      npcId: 'stable:npc:senior',
      role: 'trader' as const,
      treeIndex: 9,
    }
    expect(resolveNpcAppearance(opts)).toEqual(resolveNpcAppearance(opts))
  })

  it('still assigns non-grey hair color, hue and hair-kind variety for a 60+ NPC', () => {
    const hairColors = new Set<number>()
    const hues = new Set<number>()
    for (let i = 0; i < 60; i++) {
      const look = resolveNpcAppearance({
        age: 65,
        gender: 'male',
        npcId: `elder:npc:${i}`,
        role: 'farmer',
        treeIndex: i,
      })
      expect(Object.values(NPC_HAIR_COLOR)).toContain(look.hairColor)
      expect(Object.values(NPC_CLOTHING_HUE)).toContain(look.clothingHue)
      hairColors.add(look.hairColor)
      hues.add(look.clothingHue)
    }
    expect(hairColors.size).toBeGreaterThan(1)
    expect(hues.size).toBeGreaterThan(1)
  })

  it('keeps children and other roles on the Modular pool', () => {
    const childFarmer = resolveNpcAppearance({
      age: 12,
      gender: 'female',
      npcId: ANNA,
      role: 'farmer',
      treeIndex: 0,
    })
    expect(childFarmer.outfit).toBe('modular')
    expect(childFarmer.modelUrl).toBe(NPC_MODEL_URLS.female[0])
    expect(childFarmer.animationUrl).toBeNull()
    expect(childFarmer.tintUrl).toBeNull()
    expect(childFarmer.hairColor).toBe(0xffffff)
    expect(childFarmer.clothingHue).toBe(NPC_CLOTHING_HUE.identity)

    const femaleGuard = resolveNpcAppearance({
      age: 30,
      gender: 'female',
      npcId: 'watch:npc:2',
      role: 'guard',
      treeIndex: 2,
    })
    expect(femaleGuard.outfit).toBe('modular')
    expect(femaleGuard.modelUrl).toBe(NPC_MODEL_URLS.female[2 % NPC_MODEL_URLS.female.length])

    const blacksmith = resolveNpcAppearance({
      age: 32,
      gender: 'male',
      npcId: 'home:npc:3',
      role: 'blacksmith',
      treeIndex: 3,
    })
    expect(blacksmith.outfit).toBe('modular')
    expect(blacksmith.modelUrl).toBe(NPC_MODEL_URLS.male[3 % NPC_MODEL_URLS.male.length])

    const childHunter = resolveNpcAppearance({
      age: 12,
      gender: 'male',
      npcId: 'home:npc:4',
      role: 'hunter',
      treeIndex: 4,
    })
    expect(childHunter.outfit).toBe('modular')
  })
})
