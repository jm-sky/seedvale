import { describe, expect, it } from 'vitest'
import { Inventory } from '../items/Inventory'
import {
  ANIMAL_DEFS,
  carcassCandidateScore,
  carcassFoodValue,
  forageEdgeScore,
  isCarcassEdible,
  nearestShoreProbePoint,
  selectDietFeedKind,
  shoreProbeHits,
} from './AnimalAgent'

describe('shoreProbeHits (plan 094)', () => {
  const flatAt = (h: number) => () => h

  it('is 0 for a point far from any water (all probes above threshold)', () => {
    expect(shoreProbeHits(0, 0, flatAt(10), 0)).toBe(0)
  })

  it('is 4 for a point fully submerged (all probes at/below threshold)', () => {
    expect(shoreProbeHits(0, 0, flatAt(-1), 0)).toBe(4)
  })

  it('is between 0 and 4 for a point straddling the shoreline', () => {
    // Water to the +x side only, dry land to -x/+z/-z.
    const sampleHeight = (x: number) => (x > 0 ? -1 : 10)
    const hits = shoreProbeHits(0, 0, sampleHeight, 0)
    expect(hits).toBeGreaterThan(0)
    expect(hits).toBeLessThan(4)
  })
})

describe('nearestShoreProbePoint (plan ui-input-006 ocean fishing fix)', () => {
  const flatAt = (h: number) => () => h

  it('is null for a point far from any water', () => {
    expect(nearestShoreProbePoint(5, -5, flatAt(10), 0)).toBeNull()
  })

  it('returns a real point distinct from the query position when water is nearby', () => {
    const point = nearestShoreProbePoint(5, -5, flatAt(-1), 0)
    expect(point).not.toBeNull()
    expect(point).not.toEqual({ x: 5, z: -5 })
    // Must be one of the actual probe offsets, not an arbitrary point.
    expect(Math.hypot(point!.x - 5, point!.z - (-5))).toBeCloseTo(1.5, 5)
  })

  it('only returns a point that actually reads as water', () => {
    // Water only on the +x side.
    const sampleHeight = (x: number) => (x > 5 ? -1 : 10)
    const point = nearestShoreProbePoint(5, 0, sampleHeight, 0)
    expect(point).toEqual({ x: 6.5, z: 0 })
  })
})

describe('forageEdgeScore (plan 094)', () => {
  it('peaks at forest-edge density (0.45)', () => {
    expect(forageEdgeScore(0.45)).toBe(1)
  })

  it('is lower for open meadow (low forestFactor) than for forest edge', () => {
    expect(forageEdgeScore(0)).toBeLessThan(forageEdgeScore(0.45))
  })

  it('is lower for deep forest (high forestFactor) than for forest edge', () => {
    expect(forageEdgeScore(1)).toBeLessThan(forageEdgeScore(0.45))
  })

  it('never goes negative', () => {
    expect(forageEdgeScore(0)).toBeGreaterThanOrEqual(0)
    expect(forageEdgeScore(1)).toBeGreaterThanOrEqual(0)
  })
})

describe('isCarcassEdible (plan 094)', () => {
  const eater = { id: 'wolf-a' }
  const other = { id: 'wolf-b' }

  it('allows an unclaimed dead prey that has not expired or been eaten', () => {
    expect(isCarcassEdible({
      dead: true,
      expired: false,
      consumed: false,
      claimedBy: null,
      eater,
    })).toBe(true)
  })

  it('allows the predator that already claimed the corpse', () => {
    expect(isCarcassEdible({
      dead: true,
      expired: false,
      consumed: false,
      claimedBy: eater,
      eater,
    })).toBe(true)
  })

  it('rejects a corpse claimed by another predator', () => {
    expect(isCarcassEdible({
      dead: true,
      expired: false,
      consumed: false,
      claimedBy: other,
      eater,
    })).toBe(false)
  })

  it('rejects a corpse after a completed eat, even for the original eater', () => {
    expect(isCarcassEdible({
      dead: true,
      expired: false,
      consumed: true,
      claimedBy: null,
      eater,
    })).toBe(false)
  })

  it('rejects a knife-harvested carcass — remains are not food (plan 137)', () => {
    expect(isCarcassEdible({
      dead: true,
      expired: false,
      consumed: false,
      harvested: true,
      claimedBy: null,
      eater,
    })).toBe(false)
  })

  it('rejects live or expired bodies', () => {
    expect(isCarcassEdible({
      dead: false,
      expired: false,
      consumed: false,
      claimedBy: null,
      eater,
    })).toBe(false)
    expect(isCarcassEdible({
      dead: true,
      expired: true,
      consumed: false,
      claimedBy: null,
      eater,
    })).toBe(false)
  })
})

describe('carcassFoodValue (plan fauna-005 — corpse/bone scavenging)', () => {
  const wolfScavenging = ANIMAL_DEFS.wolf.scavenging

  it('is always 1 for a fresh corpse, regardless of species or hunger', () => {
    expect(carcassFoodValue('fresh', wolfScavenging, 0)).toBe(1)
    expect(carcassFoodValue('fresh', undefined, 0)).toBe(1)
  })

  it('rejects rotting/bones outright for a species without the scavenging capability', () => {
    expect(carcassFoodValue('rotting', undefined, 1)).toBeNull()
    expect(carcassFoodValue('bones', undefined, 1)).toBeNull()
  })

  it('rejects rotting/bones for a scavenger below the hunger threshold', () => {
    expect(carcassFoodValue('rotting', wolfScavenging, 0.5)).toBeNull()
    expect(carcassFoodValue('bones', wolfScavenging, 0.7)).toBeNull()
  })

  it('returns the species preference value once hungry enough', () => {
    expect(carcassFoodValue('rotting', wolfScavenging, 0.65)).toBe(wolfScavenging!.rottingValue)
    expect(carcassFoodValue('bones', wolfScavenging, 0.8)).toBe(wolfScavenging!.bonesValue)
  })

  it('ranks fresh > rotting > bones for an eligible, sufficiently hungry scavenger', () => {
    const fresh = carcassFoodValue('fresh', wolfScavenging, 1)!
    const rotting = carcassFoodValue('rotting', wolfScavenging, 1)!
    const bones = carcassFoodValue('bones', wolfScavenging, 1)!
    expect(fresh).toBeGreaterThan(rotting)
    expect(rotting).toBeGreaterThan(bones)
  })

  it('bones requires a higher hunger threshold than rotting', () => {
    // Hungry enough for rotting but not yet for bones.
    expect(carcassFoodValue('rotting', wolfScavenging, 0.7)).not.toBeNull()
    expect(carcassFoodValue('bones', wolfScavenging, 0.7)).toBeNull()
  })
})

describe('carcassCandidateScore (plan fauna-005)', () => {
  const wolfScavenging = ANIMAL_DEFS.wolf.scavenging!

  it('a reachable fresh corpse always outscores rotting/bones within the food search radius', () => {
    const FOOD_SEARCH_RADIUS = 14
    const freshValue = carcassFoodValue('fresh', wolfScavenging, 1)!
    const rottingValue = carcassFoodValue('rotting', wolfScavenging, 1)!
    const bonesValue = carcassFoodValue('bones', wolfScavenging, 1)!
    // Worst case for fresh (far away) vs. best case for the lower tiers (right next to the eater).
    const freshScore = carcassCandidateScore(freshValue, FOOD_SEARCH_RADIUS)
    const rottingScore = carcassCandidateScore(rottingValue, 0)
    const bonesScore = carcassCandidateScore(bonesValue, 0)
    expect(freshScore).toBeGreaterThan(rottingScore)
    expect(freshScore).toBeGreaterThan(bonesScore)
    expect(rottingScore).toBeGreaterThan(bonesScore)
  })

  it('prefers a closer candidate of the same food value', () => {
    expect(carcassCandidateScore(1, 2)).toBeGreaterThan(carcassCandidateScore(1, 8))
  })

  it('a positive riskPenalty lowers the score without changing the ranking rule', () => {
    const base = carcassCandidateScore(0.4, 3)
    expect(carcassCandidateScore(0.4, 3, 5)).toBeLessThan(base)
  })
})

describe('ANIMAL_DEFS herbivore diet/metabolism (plan fauna-010)', () => {
  const herbivores = ['horse', 'donkey', 'cow', 'sheep', 'deer', 'stag', 'rabbit'] as const

  it('every planned herbivore has a diet with grass and household-feed items', () => {
    for (const kind of herbivores) {
      const diet = ANIMAL_DEFS[kind].diet
      expect(diet).toBeDefined()
      expect(diet!.grass).toBeGreaterThan(0)
      expect(diet!.items?.hay).toBeGreaterThan(0)
    }
  })

  it('out-of-scope predators/prey have no diet (unchanged abstract forage)', () => {
    expect(ANIMAL_DEFS.bear.diet).toBeUndefined()
    expect(ANIMAL_DEFS.duck.diet).toBeUndefined()
    expect(ANIMAL_DEFS.boar.diet).toBeUndefined()
  })

  it('wolf/fox carry a meat diet (plan fauna-014 §2) but findFoodTarget still takes the carcass branch', () => {
    // `diet` is set only for `dietAcceptsItem()` (trap-bait attraction) — a
    // predator's own hunger search never reads it (`findFoodTarget()`'s
    // `role === 'predator'` branch always resolves via `findCarcassTarget`).
    expect(ANIMAL_DEFS.wolf.diet?.items?.raw_meat).toBeGreaterThan(0)
    expect(ANIMAL_DEFS.wolf.diet?.grass).toBeUndefined()
    expect(ANIMAL_DEFS.fox.diet?.items?.raw_meat).toBeGreaterThan(0)
    expect(ANIMAL_DEFS.fox.diet?.grass).toBeUndefined()
  })

  it('every species declares a metabolism block', () => {
    for (const kind of Object.keys(ANIMAL_DEFS) as (keyof typeof ANIMAL_DEFS)[]) {
      const metabolism = ANIMAL_DEFS[kind].metabolism
      expect(metabolism.hungerRate).toBeGreaterThan(0)
      expect(metabolism.thirstRate).toBeGreaterThan(0)
      expect(metabolism.staminaCapacity).toBeGreaterThan(0)
      expect(metabolism.staminaDrainRate).toBeGreaterThan(0)
      expect(metabolism.staminaRegenRate).toBeGreaterThan(0)
    }
  })
})

describe('ANIMAL_DEFS.dog diet (plan fauna-011 §3/§4)', () => {
  it('eats meat: diet.items lists the raw/bait-tagged meat kinds', () => {
    const diet = ANIMAL_DEFS.dog.diet
    expect(diet).toBeDefined()
    expect(diet!.items?.raw_meat).toBeGreaterThan(0)
    expect(diet!.items?.deer_meat).toBeGreaterThan(0)
    expect(diet!.items?.wolf_meat).toBeGreaterThan(0)
    expect(diet!.items?.boar_meat).toBeGreaterThan(0)
    expect(diet!.items?.rabbit_meat).toBeGreaterThan(0)
    expect(diet!.items?.beef).toBeGreaterThan(0)
  })

  it('does not forage like a herbivore: no grass in its diet', () => {
    expect(ANIMAL_DEFS.dog.diet!.grass).toBeUndefined()
  })

  it('does not automatically hunt prey: role is livestock, not predator', () => {
    expect(ANIMAL_DEFS.dog.role).not.toBe('predator')
  })

  it('does not scavenge a carcass on its own: no scavenging config', () => {
    expect(ANIMAL_DEFS.dog.scavenging).toBeUndefined()
  })

  it('selectDietFeedKind resolves a compatible meat item from a player/household inventory', () => {
    const items = new Inventory({}, Infinity)
    items.add('raw_meat', 1)
    expect(selectDietFeedKind(items, ANIMAL_DEFS.dog.diet!.items!)).toBe('raw_meat')
  })

  it('selectDietFeedKind ignores a herbivore-only feed item the dog does not eat', () => {
    const items = new Inventory({}, Infinity)
    items.add('hay', 5)
    expect(selectDietFeedKind(items, ANIMAL_DEFS.dog.diet!.items!)).toBeNull()
  })
})

describe('selectDietFeedKind (plan fauna-010 §3/§7)', () => {
  const dietItems = { hay: 0.9, apple: 0.6, carrot: 0.5 }

  it('returns null when the household holds none of the diet items', () => {
    const items = new Inventory({}, Infinity)
    expect(selectDietFeedKind(items, dietItems)).toBeNull()
  })

  it('picks the first diet-item kind (declaration order) actually present', () => {
    const items = new Inventory({}, Infinity)
    items.add('carrot', 1)
    items.add('apple', 1)
    // `hay` is first in `dietItems` but absent — `apple` is the first
    // present kind in declaration order.
    expect(selectDietFeedKind(items, dietItems)).toBe('apple')
  })

  it('prefers hay when it is present, matching dietItems declaration order', () => {
    const items = new Inventory({}, Infinity)
    items.add('hay', 1)
    items.add('apple', 1)
    expect(selectDietFeedKind(items, dietItems)).toBe('hay')
  })

  it('ignores an item kind not present in the household even if diet-eligible', () => {
    const items = new Inventory({}, Infinity)
    items.add('bread', 5)
    expect(selectDietFeedKind(items, dietItems)).toBeNull()
  })
})
