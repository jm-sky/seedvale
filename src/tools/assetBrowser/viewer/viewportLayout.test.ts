import { describe, expect, it } from 'vitest'
import { clampSplit, computeViewRects, DEFAULT_SPLIT } from './viewportLayout'

describe('viewportLayout', () => {
  it('clamps splits into the safe range', () => {
    expect(clampSplit(Number.NaN)).toBe(DEFAULT_SPLIT)
    expect(clampSplit(0)).toBe(0.15)
    expect(clampSplit(1)).toBe(0.85)
    expect(clampSplit(0.4)).toBe(0.4)
  })

  it('splits a quad into four panes from bottom-left origin', () => {
    expect(computeViewRects(200, 100, 'quad', 0, 0.5, 0.5)).toEqual([
      { x: 0, y: 50, w: 100, h: 50 },
      { x: 100, y: 50, w: 100, h: 50 },
      { x: 0, y: 0, w: 100, h: 50 },
      { x: 100, y: 0, w: 100, h: 50 },
    ])
  })

  it('fills the canvas for a single active view', () => {
    expect(computeViewRects(200, 100, 'single', 3, 0.3, 0.7)).toEqual([
      { x: 0, y: 0, w: 0, h: 0 },
      { x: 0, y: 0, w: 0, h: 0 },
      { x: 0, y: 0, w: 0, h: 0 },
      { x: 0, y: 0, w: 200, h: 100 },
    ])
  })
})
