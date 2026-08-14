import { describe, expect, it } from 'vitest'
import { copyAndSort, percentile } from './percentile'

describe('percentile', () => {
  it('returns 0 for an empty series', () => {
    expect(percentile([], 0, 50)).toBe(0)
  })

  it('returns the only value for a singleton', () => {
    expect(percentile([12], 1, 0)).toBe(12)
    expect(percentile([12], 1, 100)).toBe(12)
  })

  it('interpolates between ranks on a known series', () => {
    const values = [10, 20, 30, 40, 50]
    expect(percentile(values, 5, 0)).toBe(10)
    expect(percentile(values, 5, 50)).toBe(30)
    expect(percentile(values, 5, 100)).toBe(50)
    expect(percentile(values, 5, 25)).toBe(20)
  })
})

describe('copyAndSort', () => {
  it('sorts a copy without mutating the source', () => {
    const source = new Float64Array([3, 1, 2])
    const scratch = new Float64Array(3)
    copyAndSort(source, 3, scratch)
    expect([...scratch]).toEqual([1, 2, 3])
    expect([...source]).toEqual([3, 1, 2])
  })
})
