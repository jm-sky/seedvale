import { describe, expect, it } from 'vitest'
import { createNavigationTargets, MAX_NAVIGATION_TARGETS } from './navigationTargets'

describe('createNavigationTargets', () => {
  it('assigns stable slots 1..3 and rejects a 4th target', () => {
    const targets = createNavigationTargets()
    expect(targets.set('a')).toBe('ok')
    expect(targets.set('b')).toBe('ok')
    expect(targets.set('c')).toBe('ok')
    expect(targets.list().map((t) => t.slot)).toEqual([1, 2, 3])
    expect(targets.set('d')).toBe('full')
    expect(targets.list()).toHaveLength(MAX_NAVIGATION_TARGETS)
  })

  it('reports already_set for a duplicate id without changing slots', () => {
    const targets = createNavigationTargets()
    targets.set('a')
    targets.set('b')
    expect(targets.set('a')).toBe('already_set')
    expect(targets.list().find((t) => t.id === 'a')?.slot).toBe(1)
  })

  it('frees a slot on remove and reuses the lowest free slot next', () => {
    const targets = createNavigationTargets()
    targets.set('a')
    targets.set('b')
    targets.set('c')
    expect(targets.remove('a')).toBe(true)
    expect(targets.set('d')).toBe('ok')
    expect(targets.list().find((t) => t.id === 'd')?.slot).toBe(1)
    // b/c keep their original slots — a target's colour never shifts just
    // because another target left.
    expect(targets.list().find((t) => t.id === 'b')?.slot).toBe(2)
    expect(targets.list().find((t) => t.id === 'c')?.slot).toBe(3)
  })

  it('remove() on an unknown id is a no-op', () => {
    const targets = createNavigationTargets()
    expect(targets.remove('nope')).toBe(false)
  })

  it('clear() empties every target', () => {
    const targets = createNavigationTargets()
    targets.set('a')
    targets.set('b')
    targets.clear()
    expect(targets.list()).toEqual([])
  })

  it('serialize() returns ids only, in slot order', () => {
    const targets = createNavigationTargets()
    targets.set('a')
    targets.set('b')
    expect(targets.serialize()).toEqual(['a', 'b'])
  })

  it('restore() drops ids that fail validation and caps at MAX_NAVIGATION_TARGETS', () => {
    const targets = createNavigationTargets()
    targets.restore(['a', 'gone', 'b', 'c', 'd'], (id) => id !== 'gone')
    expect(targets.serialize()).toEqual(['a', 'b', 'c'])
    expect(targets.list().map((t) => t.slot)).toEqual([1, 2, 3])
  })

  it('restore() rejects every id when the whole set is invalid (unknown target rejection)', () => {
    const targets = createNavigationTargets()
    targets.restore(['x', 'y'], () => false)
    expect(targets.list()).toEqual([])
  })
})
