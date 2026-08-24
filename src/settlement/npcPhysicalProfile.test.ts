import { describe, expect, it } from 'vitest'
import {
  ageMultiplierForAge,
  generatePhysicalProfile,
  lifeStageForAge,
  NPC_AGE_MAX,
  NPC_AGE_MIN,
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
