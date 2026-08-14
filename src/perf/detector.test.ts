import { describe, expect, it } from 'vitest'
import { detectFrame, rankSuspects } from './detector'
import { PERF_CATEGORIES, PERF_CATEGORY_COUNT, PERF_CATEGORY_INDEX, type PerfCategory } from './types'

function cats(overrides: Partial<Record<PerfCategory, number>> = {}): Float64Array {
  const arr = new Float64Array(PERF_CATEGORY_COUNT)
  for (const name of PERF_CATEGORIES) {
    const ms = overrides[name]
    if (ms === undefined) continue
    arr[PERF_CATEGORY_INDEX[name]] = ms
  }
  return arr
}

describe('rankSuspects', () => {
  it('keeps the largest CPU shares and drops tiny ones', () => {
    const ranked = rankSuspects(
      cats({ GRASS: 8, NPC: 0.2, RENDER: 4 }),
      16,
      [],
    )
    expect(ranked.map((s) => s.category)).toEqual(['GRASS', 'RENDER'])
  })

  it('promotes a hitch that dominates the frame', () => {
    const ranked = rankSuspects(cats({ NPC: 1 }), 20, [
      { category: 'STREAMING', durationMs: 18, atMs: 0 },
    ])
    expect(ranked[0]?.category).toBe('STREAMING')
  })
})

describe('detectFrame', () => {
  const budget = 16.7

  it('ignores a single slow frame that is not a spike vs median', () => {
    expect(
      detectFrame({
        frameMs: 18,
        medianMs: 17,
        p95Ms: 16,
        budgetMs: budget,
        categoryMs: cats({ RENDER: 10 }),
        hitches: [],
        sustainedWindows: 0,
        sustainedNeeded: 3,
      }),
    ).toBeNull()
  })

  it('flags a spike when the frame is both over budget and well above median', () => {
    const detection = detectFrame({
      frameMs: 32,
      medianMs: 16,
      p95Ms: 16,
      budgetMs: budget,
      categoryMs: cats({ GRASS: 20, STREAMING: 5 }),
      hitches: [],
      sustainedWindows: 0,
      sustainedNeeded: 3,
    })
    expect(detection?.kind).toBe('spike')
    expect(detection?.suspects[0]?.category).toBe('GRASS')
  })

  it('flags average_over when p95 exceeds the budget', () => {
    const detection = detectFrame({
      frameMs: 18,
      medianMs: 17,
      p95Ms: 22,
      budgetMs: budget,
      categoryMs: cats({ RENDER: 12 }),
      hitches: [],
      sustainedWindows: 1,
      sustainedNeeded: 3,
    })
    expect(detection?.kind).toBe('average_over')
    expect(detection?.severity).toBe('warning')
  })

  it('flags sustained degradation after enough over-budget windows', () => {
    const detection = detectFrame({
      frameMs: 22,
      medianMs: 20,
      p95Ms: 24,
      budgetMs: budget,
      categoryMs: cats({ RENDER: 14 }),
      hitches: [],
      sustainedWindows: 3,
      sustainedNeeded: 3,
    })
    expect(detection?.kind).toBe('sustained')
    expect(detection?.severity).toBe('critical')
  })
})
