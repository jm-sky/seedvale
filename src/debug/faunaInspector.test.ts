import { describe, expect, it } from 'vitest'
import { pickNextFrenzyWolfId } from './faunaInspector'

describe('pickNextFrenzyWolfId (fauna debug tooling — getNextFrenzyWolf() selection)', () => {
  it('picks the first eligible wolf when nothing is currently selected', () => {
    const id = pickNextFrenzyWolfId(
      [
        { animalId: 'a', frenzied: true, dead: false },
        { animalId: 'b', frenzied: true, dead: false },
      ],
      null,
    )
    expect(id).toBe('a')
  })

  it('advances cyclically from the current selection', () => {
    const wolves = [
      { animalId: 'a', frenzied: true, dead: false },
      { animalId: 'b', frenzied: true, dead: false },
      { animalId: 'c', frenzied: true, dead: false },
    ]
    expect(pickNextFrenzyWolfId(wolves, 'a')).toBe('b')
    expect(pickNextFrenzyWolfId(wolves, 'b')).toBe('c')
  })

  it('wraps back to the first wolf past the end', () => {
    const wolves = [
      { animalId: 'a', frenzied: true, dead: false },
      { animalId: 'b', frenzied: true, dead: false },
    ]
    expect(pickNextFrenzyWolfId(wolves, 'b')).toBe('a')
  })

  it('excludes non-frenzied and dead wolves from selection', () => {
    const wolves = [
      { animalId: 'a', frenzied: true, dead: false },
      { animalId: 'b', frenzied: false, dead: false },
      { animalId: 'c', frenzied: true, dead: true },
      { animalId: 'd', frenzied: true, dead: false },
    ]
    expect(pickNextFrenzyWolfId(wolves, 'a')).toBe('d')
  })

  it('returns null when no wolf is eligible', () => {
    expect(pickNextFrenzyWolfId([{ animalId: 'a', frenzied: false, dead: false }], null)).toBeNull()
    expect(pickNextFrenzyWolfId([], 'a')).toBeNull()
  })

  it('starts over from the first wolf when the current selection is no longer eligible', () => {
    const wolves = [
      { animalId: 'a', frenzied: true, dead: false },
      { animalId: 'b', frenzied: true, dead: false },
    ]
    // 'stale' isn't in the eligible list at all (e.g. despawned/cured).
    expect(pickNextFrenzyWolfId(wolves, 'stale')).toBe('a')
  })
})
