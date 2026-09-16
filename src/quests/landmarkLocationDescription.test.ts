import { describe, expect, it } from 'vitest'
import { describeLandmarkLocation } from './landmarkLocationDescription'

describe('describeLandmarkLocation (plan quests-progression-047)', () => {
  it('composes kind, direction and settlement name', () => {
    expect(describeLandmarkLocation({
      landmarkKind: 'monolith',
      landmarkX: 0,
      landmarkZ: -40,
      originX: 0,
      originZ: 0,
      settlementName: 'Lipowa',
    })).toBe('monolit na północ od Lipowa')
  })

  it('falls back to the settlement when origin and target coincide', () => {
    expect(describeLandmarkLocation({
      landmarkKind: 'smallRuins',
      landmarkX: 10,
      landmarkZ: 10,
      originX: 10,
      originZ: 10,
      settlementName: 'Lasowa',
    })).toBe('ruiny przy osadzie Lasowa')
  })

  it('omits the settlement name when none is supplied', () => {
    expect(describeLandmarkLocation({
      landmarkKind: 'stoneCircle',
      landmarkX: 40,
      landmarkZ: 0,
      originX: 0,
      originZ: 0,
    })).toBe('krąg kamieni na wschód od osady')
  })
})
