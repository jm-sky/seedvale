import { describe, expect, it } from 'vitest'
import { landmarkName } from './worldLocationNames'

describe('landmarkName', () => {
  it('is a pure, stable function of (seed, kind, id)', () => {
    const a = landmarkName(42, 'cave', 'cave:cave-1')
    const b = landmarkName(42, 'cave', 'cave:cave-1')
    expect(a).toBe(b)
  })

  it('is never generated per-UI-call at random (two fresh calls agree)', () => {
    const names = new Set<string>()
    for (let i = 0; i < 5; i++) names.add(landmarkName(1, 'lake', 'lake:3,4'))
    expect(names.size).toBe(1)
  })

  it('reads as "<Noun> <Adjective>" for each landmark kind', () => {
    for (const kind of ['cave', 'cemetery', 'lake', 'mountainPeak'] as const) {
      const name = landmarkName(5, kind, `${kind}:x`)
      expect(name.split(' ').length).toBeGreaterThanOrEqual(2)
    }
  })

  it('different ids under the same seed vary (not a single fixed name per kind)', () => {
    const names = new Set<string>()
    for (let i = 0; i < 20; i++) names.add(landmarkName(1, 'lake', `lake:${i},0`))
    expect(names.size).toBeGreaterThan(1)
  })
})
