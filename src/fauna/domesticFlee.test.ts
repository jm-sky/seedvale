import { describe, expect, it } from 'vitest'
import { fleeAnchorIsSafe, resolveDomesticFleeTarget } from './domesticFlee'

describe('domesticFlee (plan fauna-037)', () => {
  describe('fleeAnchorIsSafe', () => {
    it('accepts an anchor that increases separation from the threat', () => {
      // Threat west, anchor east — moving toward the anchor moves further away.
      expect(fleeAnchorIsSafe({ x: 0, z: 0 }, { x: -10, z: 0 }, { x: 10, z: 0 })).toBe(true)
    })

    it('rejects an anchor on the far side of the threat', () => {
      // Threat east, anchor further east still — reaching it means passing the threat first.
      expect(fleeAnchorIsSafe({ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 10, z: 0 })).toBe(false)
    })

    it('rejects a degenerate anchor that nearly coincides with the animal', () => {
      expect(fleeAnchorIsSafe({ x: 0, z: 0 }, { x: -10, z: 0 }, { x: 0.05, z: 0 })).toBe(false)
    })

    it('accepts a purely lateral anchor (non-negative separation change)', () => {
      // Threat directly south — an anchor due east neither approaches nor
      // retreats from the threat along the away axis (dot === 0).
      expect(fleeAnchorIsSafe({ x: 0, z: 0 }, { x: 0, z: -10 }, { x: 10, z: 0 })).toBe(true)
    })
  })

  describe('resolveDomesticFleeTarget', () => {
    const animalPosition = { x: 0, z: 0 }
    const threatPosition = { x: -10, z: 0 }

    it('prefers a valid shepherd/handler anchor over home and settlement', () => {
      const result = resolveDomesticFleeTarget({
        animalPosition,
        threatPosition,
        shepherdAnchor: { x: 5, z: 0 },
        homeAnchor: { x: 3, z: 0 },
        settlementAnchor: { x: 8, z: 0 },
      })
      expect(result).toEqual({ x: 5, z: 0 })
    })

    it('falls through to home when the shepherd anchor is absent', () => {
      const result = resolveDomesticFleeTarget({
        animalPosition,
        threatPosition,
        shepherdAnchor: null,
        homeAnchor: { x: 3, z: 0 },
        settlementAnchor: { x: 8, z: 0 },
      })
      expect(result).toEqual({ x: 3, z: 0 })
    })

    it('falls through to home when the shepherd anchor is invalid (moves toward the threat)', () => {
      const result = resolveDomesticFleeTarget({
        animalPosition,
        threatPosition,
        shepherdAnchor: { x: -20, z: 0 }, // beyond the threat
        homeAnchor: { x: 3, z: 0 },
        settlementAnchor: { x: 8, z: 0 },
      })
      expect(result).toEqual({ x: 3, z: 0 })
    })

    it('falls through to settlement when both shepherd and home are absent/invalid', () => {
      const result = resolveDomesticFleeTarget({
        animalPosition,
        threatPosition,
        shepherdAnchor: null,
        homeAnchor: { x: -20, z: 0 }, // beyond the threat
        settlementAnchor: { x: 8, z: 0 },
      })
      expect(result).toEqual({ x: 8, z: 0 })
    })

    it('returns null when no candidate is present or safe — the caller falls back to away-from-threat flee', () => {
      expect(resolveDomesticFleeTarget({ animalPosition, threatPosition })).toBeNull()
      const result = resolveDomesticFleeTarget({
        animalPosition,
        threatPosition,
        shepherdAnchor: { x: -20, z: 0 },
        homeAnchor: { x: -30, z: 0 },
        settlementAnchor: { x: -40, z: 0 },
      })
      expect(result).toBeNull()
    })
  })
})
