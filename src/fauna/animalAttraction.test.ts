import { describe, expect, it } from 'vitest'
import type { AnimalAttractionSource } from '../world/animalAttractionSource'
import { TRAP_DEFS } from '../world/animalTraps'
import {
  attractionScore,
  BLOOD_ATTRACTION_RADIUS,
  bloodAttractionStrength,
  canSenseBlood,
  FOOD_ATTRACTION_RADIUS,
  foodAttractionStrength,
  isAttractionCompatible,
  markAttractionIgnored,
  pruneAttractionIgnored,
  resolveAttractionTarget,
  trapBaitAttractionSource,
} from './animalAttraction'
import { ANIMAL_DEFS, dietAcceptsItem } from './animalDefs'
import { carcassFoodValue } from './animalForaging'

describe('dietAcceptsItem (plan fauna-014 §2 / fauna-023)', () => {
  it('accepts a diet-listed plant item for a herbivore', () => {
    expect(dietAcceptsItem(ANIMAL_DEFS.rabbit.diet, 'carrot')).toBe(true)
    expect(dietAcceptsItem(ANIMAL_DEFS.stag.diet, 'apple')).toBe(true)
  })

  it('rejects a non-diet item for a herbivore', () => {
    expect(dietAcceptsItem(ANIMAL_DEFS.rabbit.diet, 'raw_meat')).toBe(false)
  })

  it('accepts a diet-listed meat item for wolf/fox even though it never drives hunger', () => {
    expect(dietAcceptsItem(ANIMAL_DEFS.wolf.diet, 'raw_meat')).toBe(true)
    expect(dietAcceptsItem(ANIMAL_DEFS.fox.diet, 'deer_meat')).toBe(true)
  })

  it('rejects a plant item for wolf', () => {
    expect(dietAcceptsItem(ANIMAL_DEFS.wolf.diet, 'carrot')).toBe(false)
  })

  it('rejects everything for a species with no configured diet', () => {
    expect(dietAcceptsItem(ANIMAL_DEFS.boar.diet, 'carrot')).toBe(false)
    expect(dietAcceptsItem(ANIMAL_DEFS.boar.diet, 'raw_meat')).toBe(false)
  })

  it('bear diet accepts raw meat and omnivore plant/fish foods, not grass', () => {
    expect(dietAcceptsItem(ANIMAL_DEFS.bear.diet, 'raw_meat')).toBe(true)
    expect(dietAcceptsItem(ANIMAL_DEFS.bear.diet, 'fish')).toBe(true)
    expect(dietAcceptsItem(ANIMAL_DEFS.bear.diet, 'berries')).toBe(true)
    expect(dietAcceptsItem(ANIMAL_DEFS.bear.diet, 'apple')).toBe(true)
    expect(dietAcceptsItem(ANIMAL_DEFS.bear.diet, 'nuts')).toBe(true)
    expect(dietAcceptsItem(ANIMAL_DEFS.bear.diet, 'honey')).toBe(true)
    expect(ANIMAL_DEFS.bear.diet?.grass).toBeUndefined()
  })
})

describe('scavenging phases (plan fauna-023 §3a)', () => {
  it('bear accepts rotting but not bones; wolf keeps both; fox stays fresh-only', () => {
    expect(carcassFoodValue('fresh', ANIMAL_DEFS.bear.scavenging, 1)).toBe(1)
    expect(carcassFoodValue('rotting', ANIMAL_DEFS.bear.scavenging, 1)).toBe(0.35)
    expect(carcassFoodValue('bones', ANIMAL_DEFS.bear.scavenging, 1)).toBeNull()

    expect(carcassFoodValue('rotting', ANIMAL_DEFS.wolf.scavenging, 1)).toBe(0.4)
    expect(carcassFoodValue('bones', ANIMAL_DEFS.wolf.scavenging, 1)).toBe(0.15)

    expect(carcassFoodValue('rotting', ANIMAL_DEFS.fox.scavenging, 1)).toBeNull()
    expect(carcassFoodValue('bones', ANIMAL_DEFS.fox.scavenging, 1)).toBeNull()
  })

  it('does not move predator hunger onto the herbivore diet branch', () => {
    expect(ANIMAL_DEFS.bear.role).toBe('predator')
    expect(ANIMAL_DEFS.bear.diet).toBeDefined()
  })
})

describe('resolveAttractionTarget (plan fauna-023)', () => {
  const trap = (overrides: Partial<AnimalAttractionSource> & { trapId?: string } = {}): AnimalAttractionSource => {
    const trapKind = overrides.trapKind ?? 'simple'
    const trapId = overrides.trapId ?? '1'
    return trapBaitAttractionSource({
      trapId,
      trapKind,
      x: overrides.x ?? 0,
      z: overrides.z ?? 0,
      baitKind: (overrides.itemKind ?? 'carrot') as 'carrot',
    })
  }

  const food = (overrides: Partial<AnimalAttractionSource> = {}): AnimalAttractionSource => ({
    id: overrides.id ?? 'food:1',
    kind: 'food',
    x: overrides.x ?? 0,
    z: overrides.z ?? 0,
    strength: overrides.strength ?? 1,
    radius: overrides.radius ?? FOOD_ATTRACTION_RADIUS,
    itemKind: overrides.itemKind ?? 'raw_meat',
    freshnessStage: overrides.freshnessStage ?? 'fresh',
  })

  const blood = (overrides: Partial<AnimalAttractionSource> = {}): AnimalAttractionSource => ({
    id: overrides.id ?? 'blood:1',
    kind: 'blood',
    x: overrides.x ?? 0,
    z: overrides.z ?? 0,
    strength: overrides.strength ?? 1,
    radius: overrides.radius ?? BLOOD_ATTRACTION_RADIUS,
  })

  it('finds a diet-compatible, trap-kind-compatible lure within range', () => {
    const target = resolveAttractionTarget([trap({})], ANIMAL_DEFS.rabbit, 1, 0)
    expect(target?.id).toBe('trap:1')
  })

  it('rejects a species the trap kind cannot catch (stag vs. simple)', () => {
    expect(resolveAttractionTarget([trap({})], ANIMAL_DEFS.stag, 1, 0)).toBeNull()
  })

  it('accepts a predator-eligible good trap with matching meat bait', () => {
    const target = resolveAttractionTarget(
      [trap({ trapKind: 'good', itemKind: 'raw_meat', trapId: 'w' })],
      ANIMAL_DEFS.wolf,
      1,
      0,
    )
    expect(target?.itemKind).toBe('raw_meat')
  })

  it('rejects a diet-incompatible bait (wolf ignores carrot)', () => {
    expect(
      resolveAttractionTarget([trap({ trapKind: 'good', itemKind: 'carrot' })], ANIMAL_DEFS.wolf, 1, 0),
    ).toBeNull()
  })

  it('rejects a lure outside the trap kind\'s lure radius', () => {
    expect(resolveAttractionTarget([trap({ x: 1000 })], ANIMAL_DEFS.rabbit, 0, 0)).toBeNull()
  })

  it('picks the nearer of several equal-strength candidates', () => {
    const near = trap({ trapId: 'near', x: 1 })
    const far = trap({ trapId: 'far', x: 4 })
    expect(resolveAttractionTarget([far, near], ANIMAL_DEFS.rabbit, 0, 0)?.id).toBe('trap:near')
  })

  it('breaks equal-score ties deterministically by source id', () => {
    const a = trap({ trapId: 'a', x: 2 })
    const b = trap({ trapId: 'b', x: -2 })
    // Equal distance from origin → equal score at strength 1; id 'trap:a' wins.
    expect(resolveAttractionTarget([b, a], ANIMAL_DEFS.rabbit, 0, 0)?.id).toBe('trap:a')
    expect(resolveAttractionTarget([a, b], ANIMAL_DEFS.rabbit, 0, 0)?.id).toBe('trap:a')
  })

  it('returns null with no sources at all', () => {
    expect(resolveAttractionTarget([], ANIMAL_DEFS.rabbit, 0, 0)).toBeNull()
  })

  it('selects diet-compatible dropped meat for wolf/fox/bear', () => {
    expect(resolveAttractionTarget([food({})], ANIMAL_DEFS.wolf, 1, 0)?.kind).toBe('food')
    expect(resolveAttractionTarget([food({})], ANIMAL_DEFS.fox, 1, 0)?.kind).toBe('food')
    expect(resolveAttractionTarget([food({})], ANIMAL_DEFS.bear, 1, 0)?.kind).toBe('food')
  })

  it('selects plant food for bear but not wolf/fox', () => {
    const berries = food({ itemKind: 'berries', id: 'food:b' })
    expect(resolveAttractionTarget([berries], ANIMAL_DEFS.bear, 1, 0)?.itemKind).toBe('berries')
    expect(resolveAttractionTarget([berries], ANIMAL_DEFS.wolf, 1, 0)).toBeNull()
    expect(resolveAttractionTarget([berries], ANIMAL_DEFS.fox, 1, 0)).toBeNull()
  })

  it('allows spoiled meat for scavenging wolf/bear but not fox', () => {
    const spoiled = food({ freshnessStage: 'spoiled', strength: 0.35 })
    expect(foodAttractionStrength(ANIMAL_DEFS.wolf, 'raw_meat', 'spoiled')).not.toBeNull()
    expect(foodAttractionStrength(ANIMAL_DEFS.bear, 'raw_meat', 'spoiled')).not.toBeNull()
    expect(foodAttractionStrength(ANIMAL_DEFS.fox, 'raw_meat', 'spoiled')).toBeNull()
    expect(resolveAttractionTarget([spoiled], ANIMAL_DEFS.wolf, 1, 0)?.kind).toBe('food')
    expect(resolveAttractionTarget([spoiled], ANIMAL_DEFS.bear, 1, 0)?.kind).toBe('food')
    expect(resolveAttractionTarget([spoiled], ANIMAL_DEFS.fox, 1, 0)).toBeNull()
  })

  it('lets predators sense blood but not dog or herbivores', () => {
    expect(canSenseBlood(ANIMAL_DEFS.wolf)).toBe(true)
    expect(canSenseBlood(ANIMAL_DEFS.fox)).toBe(true)
    expect(canSenseBlood(ANIMAL_DEFS.bear)).toBe(true)
    expect(canSenseBlood(ANIMAL_DEFS.dog)).toBe(false)
    expect(canSenseBlood(ANIMAL_DEFS.rabbit)).toBe(false)
    expect(resolveAttractionTarget([blood({})], ANIMAL_DEFS.wolf, 1, 0)?.kind).toBe('blood')
    expect(resolveAttractionTarget([blood({})], ANIMAL_DEFS.dog, 1, 0)).toBeNull()
    expect(resolveAttractionTarget([blood({})], ANIMAL_DEFS.rabbit, 1, 0)).toBeNull()
  })

  it('bear rejects baited simple/good traps despite diet-compatible bait', () => {
    const baited = trap({ trapKind: 'good', itemKind: 'raw_meat', trapId: 'g' })
    expect(isAttractionCompatible(ANIMAL_DEFS.bear, baited)).toBe(false)
    expect(resolveAttractionTarget([baited], ANIMAL_DEFS.bear, 1, 0)).toBeNull()
  })

  it('ignores sources outside radius and prefers higher effective score', () => {
    const farStrong = food({ id: 'food:far', x: FOOD_ATTRACTION_RADIUS + 1, strength: 10 })
    const nearWeak = food({ id: 'food:near', x: 1, strength: 0.4 })
    expect(attractionScore(farStrong, 0, 0)).toBeNull()
    expect(resolveAttractionTarget([farStrong, nearWeak], ANIMAL_DEFS.wolf, 0, 0)?.id).toBe('food:near')
  })

  it('blood strength falls with remaining fraction; expired is not a candidate', () => {
    expect(bloodAttractionStrength(1.2, 1)).toBeGreaterThan(bloodAttractionStrength(1.2, 0.2))
    expect(bloodAttractionStrength(1.2, 0)).toBe(0)
    expect(resolveAttractionTarget([blood({ strength: 0 })], ANIMAL_DEFS.wolf, 0, 0)).toBeNull()
  })

  it('ignored blood ids are skipped so a trail can continue', () => {
    const a = blood({ id: 'blood:a', x: 1 })
    const b = blood({ id: 'blood:b', x: 2 })
    expect(resolveAttractionTarget([a, b], ANIMAL_DEFS.wolf, 0, 0)?.id).toBe('blood:a')
    expect(resolveAttractionTarget([a, b], ANIMAL_DEFS.wolf, 0, 0, new Set(['blood:a']))?.id).toBe('blood:b')
  })

  it('trap bait radius still comes from TRAP_DEFS', () => {
    expect(trap({ trapKind: 'simple' }).radius).toBe(TRAP_DEFS.simple.lureRadius)
    expect(trap({ trapKind: 'good' }).radius).toBe(TRAP_DEFS.good.lureRadius)
  })
})

describe('attraction ignore memory (plan fauna-023 §8)', () => {
  it('prunes expired entries and stays bounded', () => {
    const memory = new Map<string, number>()
    markAttractionIgnored(memory, 'a', 5, 2)
    markAttractionIgnored(memory, 'b', 3, 2)
    markAttractionIgnored(memory, 'c', 10, 2)
    expect(memory.size).toBeLessThanOrEqual(2)
    pruneAttractionIgnored(memory, 4)
    for (const until of memory.values()) expect(until).toBeGreaterThan(4)
  })
})
