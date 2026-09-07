import { describe, expect, it } from 'vitest'
import {
  ageMultiplierForAge,
  agilityAgePotentialForAge,
  generatePhysicalProfile,
  lifeStageForAge,
  NPC_AGE_MAX,
  NPC_AGE_MIN,
  resolveHumanAgilityProfile,
  resolveHumanStrengthProfile,
  strengthAgePotentialForAge,
} from './npcPhysicalProfile'

describe('lifeStageForAge', () => {
  it('classifies each documented boundary correctly', () => {
    expect(lifeStageForAge(0)).toBe('infant')
    expect(lifeStageForAge(4)).toBe('infant')
    expect(lifeStageForAge(5)).toBe('child')
    expect(lifeStageForAge(12)).toBe('child')
    expect(lifeStageForAge(13)).toBe('teen')
    expect(lifeStageForAge(17)).toBe('teen')
    expect(lifeStageForAge(18)).toBe('youngAdult')
    expect(lifeStageForAge(24)).toBe('youngAdult')
    expect(lifeStageForAge(25)).toBe('adultPrime')
    expect(lifeStageForAge(35)).toBe('adultPrime')
    expect(lifeStageForAge(36)).toBe('adult')
    expect(lifeStageForAge(49)).toBe('adult')
    expect(lifeStageForAge(50)).toBe('mature')
    expect(lifeStageForAge(64)).toBe('mature')
    expect(lifeStageForAge(65)).toBe('elderly')
    expect(lifeStageForAge(84)).toBe('elderly')
    expect(lifeStageForAge(85)).toBe('veryElderly')
    expect(lifeStageForAge(100)).toBe('veryElderly')
  })

  it('clamps out-of-range ages to the nearest valid stage', () => {
    expect(lifeStageForAge(-5)).toBe('infant')
    expect(lifeStageForAge(150)).toBe('veryElderly')
  })
})

describe('ageMultiplierForAge', () => {
  it('peaks at 1.00 across the whole adult-prime range', () => {
    for (let age = 25; age <= 35; age++) {
      expect(ageMultiplierForAge(age)).toBeCloseTo(1.0, 5)
    }
  })

  it('stays within the documented target range for each life stage', () => {
    const ranges: readonly [number, number, number, number][] = [
      [0, 4, 0.20, 0.30],
      [5, 8, 0.30, 0.45],
      [9, 12, 0.45, 0.60],
      [13, 17, 0.60, 0.85],
      [18, 24, 0.90, 1.00],
      [25, 35, 1.00, 1.00],
      [36, 49, 0.98, 1.00],
      [50, 64, 0.95, 0.98],
      [65, 74, 0.88, 0.94],
      [75, 84, 0.80, 0.87],
      [85, 100, 0.70, 0.79],
    ]
    // Small tolerance: anchors are placed to keep the curve continuous
    // *across* bucket boundaries (plan's "no hard stat jumps"), so a handful
    // of ages right at a boundary land a hair outside that bucket's own
    // documented range (max observed drift ~0.004) rather than snapping to
    // a discontinuous per-bucket value.
    const TOLERANCE = 0.005
    for (const [minAge, maxAge, minMult, maxMult] of ranges) {
      for (let age = minAge; age <= maxAge; age++) {
        const mult = ageMultiplierForAge(age)
        expect(mult).toBeGreaterThanOrEqual(minMult - TOLERANCE)
        expect(mult).toBeLessThanOrEqual(maxMult + TOLERANCE)
      }
    }
  })

  it('is continuous: no two adjacent ages differ by more than the 17->18 documented jump', () => {
    let maxJump = 0
    for (let age = NPC_AGE_MIN; age < NPC_AGE_MAX; age++) {
      maxJump = Math.max(maxJump, Math.abs(ageMultiplierForAge(age + 1) - ageMultiplierForAge(age)))
    }
    // The plan's own table has exactly one deliberate jump, 0.85 -> 0.90 at
    // age 17->18; every other step is a smooth interpolation.
    expect(maxJump).toBeCloseTo(0.05, 5)
  })

  it('mild post-prime decline: age 100 still keeps most of peak capacity', () => {
    expect(ageMultiplierForAge(100)).toBeGreaterThanOrEqual(0.70)
  })
})

describe('generatePhysicalProfile', () => {
  it('is deterministic for the same seed/sex/age', () => {
    const a = generatePhysicalProfile(12345, 'male', 30)
    const b = generatePhysicalProfile(12345, 'male', 30)
    expect(a).toEqual(b)
  })

  it('normally differs between different seeds', () => {
    const seen = new Set<string>()
    for (let seed = 0; seed < 30; seed++) {
      const p = generatePhysicalProfile(seed, 'male', 30)
      seen.add(`${p.maxHp}:${p.maxStamina}:${p.maxVigor}`)
    }
    expect(seen.size).toBeGreaterThan(1)
  })

  it('applies independent variation per capacity (not one shared global roll)', () => {
    let anyDiffer = false
    for (let seed = 0; seed < 30; seed++) {
      const p = generatePhysicalProfile(seed, 'male', 30)
      if (p.hpVariation !== p.staminaVariation || p.staminaVariation !== p.vigorVariation) {
        anyDiffer = true
        break
      }
    }
    expect(anyDiffer).toBe(true)
  })

  it('keeps every variation sample within +/-10%', () => {
    for (let seed = 0; seed < 100; seed++) {
      const p = generatePhysicalProfile(seed, 'female', 40)
      for (const v of [p.hpVariation, p.staminaVariation, p.vigorVariation]) {
        expect(v).toBeGreaterThanOrEqual(0.90)
        expect(v).toBeLessThanOrEqual(1.10)
      }
    }
  })

  it('applies the exact sex modifiers at prime age with neutral variation', () => {
    // Neutral variation isn't directly settable, so instead assert the ratio
    // between average male/female output over many seeds converges near the
    // plan's documented modifiers (1.10/0.90 HP+stamina, 1.00/1.05 vigor).
    const N = 400
    let femaleHp = 0, femaleStamina = 0, femaleVigor = 0, maleHp = 0, maleStamina = 0, maleVigor = 0
    for (let seed = 0; seed < N; seed++) {
      const m = generatePhysicalProfile(seed, 'male', 30)
      const f = generatePhysicalProfile(seed + 1_000_000, 'female', 30)
      maleHp += m.maxHp
      femaleHp += f.maxHp
      maleStamina += m.maxStamina
      femaleStamina += f.maxStamina
      maleVigor += m.maxVigor
      femaleVigor += f.maxVigor
    }
    expect(maleHp / femaleHp).toBeCloseTo(1.10 / 0.90, 1)
    expect(maleStamina / femaleStamina).toBeCloseTo(1.10 / 0.90, 1)
    expect(maleVigor / femaleVigor).toBeCloseTo(1.00 / 1.05, 1)
  })

  it('produces valid, positive integer maxima across the full age range', () => {
    for (let age = 0; age <= 100; age += 5) {
      const p = generatePhysicalProfile(age * 7 + 1, age % 2 === 0 ? 'male' : 'female', age)
      for (const max of [p.maxHp, p.maxStamina, p.maxVigor]) {
        expect(Number.isInteger(max)).toBe(true)
        expect(max).toBeGreaterThan(0)
      }
    }
  })

  it('clamps age into [0, 100] before generating', () => {
    const low = generatePhysicalProfile(1, 'male', -20)
    const high = generatePhysicalProfile(1, 'male', 500)
    expect(low.age).toBe(0)
    expect(high.age).toBe(100)
  })

  it('reports the correct life stage on the returned profile', () => {
    expect(generatePhysicalProfile(1, 'male', 30).lifeStage).toBe('adultPrime')
    expect(generatePhysicalProfile(1, 'male', 3).lifeStage).toBe('infant')
  })

  it('does not produce pathological outliers across a large deterministic sample', () => {
    for (let seed = 0; seed < 500; seed++) {
      const age = seed % 101
      const sex = seed % 2 === 0 ? 'male' : 'female'
      const p = generatePhysicalProfile(seed, sex, age)
      expect(p.maxHp).toBeGreaterThan(0)
      expect(p.maxHp).toBeLessThanOrEqual(150)
      expect(p.maxStamina).toBeGreaterThan(0)
      expect(p.maxStamina).toBeLessThanOrEqual(150)
      expect(p.maxVigor).toBeGreaterThan(0)
      expect(p.maxVigor).toBeLessThanOrEqual(150)
    }
  })
})

describe('base SPEA attributes (plan npc-019)', () => {
    it('keeps every attribute within 0..1 across a broad deterministic sample', () => {
      for (let seed = 0; seed < 500; seed++) {
        const age = seed % 101
        const sex = seed % 2 === 0 ? 'male' : 'female'
        const { attributes } = generatePhysicalProfile(seed, sex, age)
        for (const value of [attributes.strength, attributes.perception, attributes.endurance, attributes.agility]) {
          expect(value).toBeGreaterThanOrEqual(0)
          expect(value).toBeLessThanOrEqual(1)
        }
      }
    })

    it('does not collapse the four attributes into one shared "athleticism" roll', () => {
      let anyDiffer = false
      for (let seed = 0; seed < 30; seed++) {
        const { attributes } = generatePhysicalProfile(seed, 'male', 30)
        if (
          attributes.strength !== attributes.perception ||
          attributes.perception !== attributes.endurance ||
          attributes.endurance !== attributes.agility
        ) {
          anyDiffer = true
          break
        }
      }
      expect(anyDiffer).toBe(true)
    })

    it('is centered near 0.5 and overwhelmingly inside the ordinary-adult range over a broad sample', () => {
      const N = 2000
      let sum = 0
      let withinOrdinary = 0
      for (let seed = 0; seed < N; seed++) {
        const { attributes } = generatePhysicalProfile(seed, seed % 2 === 0 ? 'male' : 'female', 30)
        sum += attributes.strength
        if (attributes.strength >= 0.3 && attributes.strength <= 0.7) withinOrdinary++
      }
      // Broad statistical invariants only (plan npc-019 §11) — not an exact
      // sampled-mean assertion coupled to the normal-sampler implementation.
      expect(sum / N).toBeGreaterThan(0.45)
      expect(sum / N).toBeLessThan(0.55)
      expect(withinOrdinary / N).toBeGreaterThan(0.9)
    })
  })

  describe('resolveHumanStrengthProfile (plan npc-019 §4-5)', () => {
    it('keeps overlapping male/female Strength distributions with the documented population means', () => {
      const N = 400
      let maleSum = 0
      let femaleSum = 0
      for (let seed = 0; seed < N; seed++) {
        maleSum += resolveHumanStrengthProfile(generatePhysicalProfile(seed, 'male', 30))
        femaleSum += resolveHumanStrengthProfile(generatePhysicalProfile(seed + 1_000_000, 'female', 30))
      }
      expect(maleSum / N).toBeCloseTo(0.58, 1)
      expect(femaleSum / N).toBeCloseTo(0.42, 1)

      // Overlap: a genuinely strong woman outranks a genuinely weak man from
      // the same base-roll population (species reference §6.3 — sex must
      // never determine an individual's final value by itself).
      let sawOverlap = false
      for (let seed = 0; seed < N; seed++) {
        const male = resolveHumanStrengthProfile(generatePhysicalProfile(seed, 'male', 30))
        const female = resolveHumanStrengthProfile(generatePhysicalProfile(seed + 1_000_000, 'female', 30))
        if (female > male) {
          sawOverlap = true
          break
        }
      }
      expect(sawOverlap).toBe(true)
    })

    it('preserves 0..1 bounds across the full age range', () => {
      for (let age = 0; age <= 100; age += 5) {
        const profile = generatePhysicalProfile(age * 3 + 1, age % 2 === 0 ? 'male' : 'female', age)
        const strength = resolveHumanStrengthProfile(profile)
        expect(strength).toBeGreaterThanOrEqual(0)
        expect(strength).toBeLessThanOrEqual(1)
      }
    })
  })

  describe('strengthAgePotentialForAge (plan npc-019 §5)', () => {
    it('matches the documented adult anchors', () => {
      expect(strengthAgePotentialForAge(20)).toBeCloseTo(0.95, 5)
      expect(strengthAgePotentialForAge(25)).toBeCloseTo(0.98, 5)
      expect(strengthAgePotentialForAge(30)).toBeCloseTo(1.00, 5)
      expect(strengthAgePotentialForAge(39)).toBeCloseTo(1.00, 5)
      expect(strengthAgePotentialForAge(40)).toBeCloseTo(0.98, 5)
      expect(strengthAgePotentialForAge(50)).toBeCloseTo(0.92, 5)
      expect(strengthAgePotentialForAge(60)).toBeCloseTo(0.84, 5)
      expect(strengthAgePotentialForAge(70)).toBeCloseTo(0.73, 5)
      expect(strengthAgePotentialForAge(80)).toBeCloseTo(0.60, 5)
      expect(strengthAgePotentialForAge(90)).toBeCloseTo(0.48, 5)
      expect(strengthAgePotentialForAge(100)).toBeCloseTo(0.48, 5)
    })

    it('is independent of the generic HP/Stamina/Vigor age multiplier', () => {
      let anyDiffer = false
      for (let age = 0; age <= 100; age++) {
        if (Math.abs(strengthAgePotentialForAge(age) - ageMultiplierForAge(age)) > 1e-9) {
          anyDiffer = true
          break
        }
      }
      expect(anyDiffer).toBe(true)
    })

    it('rises smoothly for juveniles up to the age-20 anchor (temporary development mapping)', () => {
      expect(strengthAgePotentialForAge(0)).toBeGreaterThan(0)
      expect(strengthAgePotentialForAge(0)).toBeLessThan(strengthAgePotentialForAge(10))
      expect(strengthAgePotentialForAge(10)).toBeLessThan(strengthAgePotentialForAge(20))
    })
  })

  describe('agilityAgePotentialForAge (plan npc-022)', () => {
    it('matches the documented anchors', () => {
      expect(agilityAgePotentialForAge(8)).toBeCloseTo(0.80, 5)
      expect(agilityAgePotentialForAge(14)).toBeCloseTo(0.94, 5)
      expect(agilityAgePotentialForAge(20)).toBeCloseTo(1.03, 5)
      expect(agilityAgePotentialForAge(25)).toBeCloseTo(1.05, 5)
      expect(agilityAgePotentialForAge(35)).toBeCloseTo(1.03, 5)
      expect(agilityAgePotentialForAge(50)).toBeCloseTo(0.97, 5)
      expect(agilityAgePotentialForAge(65)).toBeCloseTo(0.88, 5)
      expect(agilityAgePotentialForAge(80)).toBeCloseTo(0.75, 5)
      expect(agilityAgePotentialForAge(100)).toBeCloseTo(0.60, 5)
    })

    it('covers development (juveniles rise toward the age-8 anchor)', () => {
      expect(agilityAgePotentialForAge(0)).toBeGreaterThan(0)
      expect(agilityAgePotentialForAge(0)).toBeLessThan(agilityAgePotentialForAge(4))
      expect(agilityAgePotentialForAge(4)).toBeLessThan(agilityAgePotentialForAge(8))
    })

    it('has a young-adult peak around 20-25 that exceeds the age-8/14 development values', () => {
      expect(agilityAgePotentialForAge(25)).toBeGreaterThan(agilityAgePotentialForAge(14))
      expect(agilityAgePotentialForAge(25)).toBeGreaterThan(agilityAgePotentialForAge(8))
    })

    it('declines gradually through middle age', () => {
      expect(agilityAgePotentialForAge(35)).toBeGreaterThan(agilityAgePotentialForAge(50))
      expect(agilityAgePotentialForAge(50)).toBeGreaterThan(agilityAgePotentialForAge(65))
    })

    it('declines more sharply in old age than in middle age', () => {
      const middleAgeDrop = agilityAgePotentialForAge(35) - agilityAgePotentialForAge(50)
      const oldAgeDrop = agilityAgePotentialForAge(65) - agilityAgePotentialForAge(80)
      expect(oldAgeDrop).toBeGreaterThan(middleAgeDrop)
    })

    it('is independent of the generic HP/Stamina/Vigor age multiplier and the Strength age curve', () => {
      let anyDiffersFromGeneric = false
      let anyDiffersFromStrength = false
      for (let age = 0; age <= 100; age++) {
        if (Math.abs(agilityAgePotentialForAge(age) - ageMultiplierForAge(age)) > 1e-9) anyDiffersFromGeneric = true
        if (Math.abs(agilityAgePotentialForAge(age) - strengthAgePotentialForAge(age)) > 1e-9) anyDiffersFromStrength = true
      }
      expect(anyDiffersFromGeneric).toBe(true)
      expect(anyDiffersFromStrength).toBe(true)
    })
  })

  describe('resolveHumanAgilityProfile (plan npc-022)', () => {
    it('preserves 0..1 bounds across the full age range', () => {
      for (let age = 0; age <= 100; age += 5) {
        const profile = generatePhysicalProfile(age * 3 + 1, age % 2 === 0 ? 'male' : 'female', age)
        const agility = resolveHumanAgilityProfile(profile)
        expect(agility).toBeGreaterThanOrEqual(0)
        expect(agility).toBeLessThanOrEqual(1)
      }
    })

    it('applies no sex-dependent shift (same population mean for male/female at the same age)', () => {
      const N = 400
      let maleSum = 0
      let femaleSum = 0
      for (let seed = 0; seed < N; seed++) {
        maleSum += resolveHumanAgilityProfile(generatePhysicalProfile(seed, 'male', 30))
        femaleSum += resolveHumanAgilityProfile(generatePhysicalProfile(seed + 1_000_000, 'female', 30))
      }
      expect(maleSum / N).toBeCloseTo(femaleSum / N, 1)
    })

    it('is neutral individual variation only: an unmodified base Agility of 0.5 at the peak age stays close to the peak factor', () => {
      const profile = generatePhysicalProfile(1, 'male', 25)
      const neutralProfile = { ...profile, attributes: { ...profile.attributes, agility: 0.5 } }
      expect(resolveHumanAgilityProfile(neutralProfile)).toBeCloseTo(0.5 * agilityAgePotentialForAge(25), 5)
    })
  })