import { describe, expect, it } from 'vitest'
import { cemeteryGraveLayout } from '../settlement/props'
import { rotateOffsetY } from '../settlement/propUtils'
import { findHiddenFindSpot, type HiddenFindLandmark, resolveHiddenFindLoot } from './hiddenFinds'

const NEVER_RESOLVED = () => false

function cemetery(id: string, size: HiddenFindLandmark['cemeterySize'] = 'SM'): HiddenFindLandmark {
  return { id, kind: 'cemetery', x: 100, z: 50, rotationY: 0.7, scale: 1, cemeterySize: size }
}

function stoneCircle(id: string): HiddenFindLandmark {
  return { id, kind: 'stoneCircle', x: 20, z: -30, rotationY: 0, scale: 1 }
}

/** World position of grave `index` for `landmark` — same derivation
 *  `resolveHiddenFindLoot`/`findHiddenFindSpot` use internally, so tests can
 *  dig at an exact real grave position instead of the landmark's anchor
 *  (which sits outside any single grave's dig tolerance). */
function gravePosition(landmark: HiddenFindLandmark, index: number): { x: number, z: number } {
  const local = cemeteryGraveLayout(landmark.cemeterySize ?? 'SM', landmark.scale)[index]!
  const rotated = rotateOffsetY(local.x, local.z, landmark.rotationY)
  return { x: landmark.x + rotated.x, z: landmark.z + rotated.z }
}

describe('findHiddenFindSpot', () => {
  it('is deterministic for the same landmark and dig point', () => {
    const landmark = cemetery('cemetery:1:2:0:abc')
    const dig = gravePosition(landmark, 0)
    const first = findHiddenFindSpot([landmark], dig.x, dig.z, NEVER_RESOLVED)
    const second = findHiddenFindSpot([landmark], dig.x, dig.z, NEVER_RESOLVED)
    expect(first?.spotId).toBe(second?.spotId)
    expect(first?.spotId).toBe(`${landmark.id}:0`)
  })

  it('never matches a landmark far outside its footprint', () => {
    const landmark = cemetery('cemetery:far')
    const match = findHiddenFindSpot([landmark], landmark.x + 500, landmark.z + 500, NEVER_RESOLVED)
    expect(match).toBeNull()
  })

  it('excludes already-resolved spots (idempotency)', () => {
    const landmark = cemetery('cemetery:idempotent')
    const dig = gravePosition(landmark, 0)
    const first = findHiddenFindSpot([landmark], dig.x, dig.z, NEVER_RESOLVED)
    expect(first?.spotId).toBe(`${landmark.id}:0`)
    const resolved = new Set([first!.spotId])
    const second = findHiddenFindSpot([landmark], dig.x, dig.z, (id) => resolved.has(id))
    expect(second?.spotId).not.toBe(first!.spotId)
  })

  it('bounds total cemetery loot regardless of grave count', () => {
    const landmark = cemetery('cemetery:bounded', 'LG')
    const graveCount = cemeteryGraveLayout('LG', landmark.scale).length
    expect(graveCount).toBeGreaterThan(20)
    const resolved = new Set<string>()
    let nonEmpty = 0
    for (let i = 0; i < graveCount; i++) {
      const dig = gravePosition(landmark, i)
      const match = findHiddenFindSpot([landmark], dig.x, dig.z, (id) => resolved.has(id))
      expect(match).not.toBeNull()
      resolved.add(match!.spotId)
      const loot = resolveHiddenFindLoot(landmark, match!.spotId, match!.spotIndex, 'LG')
      if (loot.kind !== 'empty') nonEmpty++
    }
    expect(resolved.size).toBe(graveCount)
    // Bounded well below the full grave count — the plan's economic-limit
    // requirement, not a farmable amount.
    expect(nonEmpty).toBeGreaterThan(0)
    expect(nonEmpty).toBeLessThan(graveCount / 2)
  })

  it('single-roll landmarks (stoneCircle/monolith) yield at most one spot', () => {
    for (let i = 0; i < 50; i++) {
      const landmark = stoneCircle(`stoneCircle:${i}`)
      const resolved = new Set<string>()
      const first = findHiddenFindSpot([landmark], landmark.x, landmark.z, (id) => resolved.has(id))
      if (!first) continue
      resolved.add(first.spotId)
      const second = findHiddenFindSpot([landmark], landmark.x, landmark.z, (id) => resolved.has(id))
      expect(second).toBeNull()
    }
  })

  it('stoneCircle existence roll is deterministic and not all-or-nothing', () => {
    const results: boolean[] = []
    for (let i = 0; i < 20; i++) {
      const landmark = stoneCircle(`stoneCircle:det:${i}`)
      const match = findHiddenFindSpot([landmark], landmark.x, landmark.z, NEVER_RESOLVED)
      results.push(match !== null)
      const matchAgain = findHiddenFindSpot([landmark], landmark.x, landmark.z, NEVER_RESOLVED)
      expect(matchAgain !== null).toBe(match !== null)
    }
    // ~25% chance — with 20 samples, expect neither "always" nor "never".
    expect(results.some((r) => r)).toBe(true)
    expect(results.every((r) => r)).toBe(false)
  })
})

describe('resolveHiddenFindLoot', () => {
  it('is deterministic for the same spot', () => {
    const landmark = cemetery('cemetery:loot-det', 'MD')
    const a = resolveHiddenFindLoot(landmark, `${landmark.id}:0`, 0, 'MD')
    const b = resolveHiddenFindLoot(landmark, `${landmark.id}:0`, 0, 'MD')
    expect(a).toEqual(b)
  })

  it('scales cemetery coin amounts up with settlement size', () => {
    // Same landmark id/spot across settlement sizes isolates the loot-table
    // effect from the found/empty roll (which only depends on landmark id).
    const landmark = cemetery('cemetery:scale', 'LG')
    const graveCount = cemeteryGraveLayout('LG', landmark.scale).length
    let smMax = 0
    let lgMax = 0
    for (let index = 0; index < graveCount; index++) {
      const spotId = `${landmark.id}:${index}`
      const sm = resolveHiddenFindLoot(landmark, spotId, index, 'SM')
      const lg = resolveHiddenFindLoot(landmark, spotId, index, 'LG')
      if (sm.kind === 'coins') smMax = Math.max(smMax, sm.amount)
      if (lg.kind === 'coins') lgMax = Math.max(lgMax, lg.amount)
    }
    expect(lgMax).toBeGreaterThan(smMax)
  })
})
