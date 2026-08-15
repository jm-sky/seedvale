import { describe, expect, it } from 'vitest'
import { MIN_RENDERER_SIZE, shouldApplyRendererResize } from './rendererResize'

describe('shouldApplyRendererResize', () => {
  it('rejects zero and sub-minimum sizes (orientation / keyboard blips)', () => {
    expect(shouldApplyRendererResize(0, 800, -1, -1)).toBe(false)
    expect(shouldApplyRendererResize(400, 0, -1, -1)).toBe(false)
    expect(shouldApplyRendererResize(8, 8, -1, -1)).toBe(false)
    expect(shouldApplyRendererResize(MIN_RENDERER_SIZE - 1, 400, -1, -1)).toBe(false)
  })

  it('rejects non-finite sizes', () => {
    expect(shouldApplyRendererResize(Number.NaN, 400, -1, -1)).toBe(false)
    expect(shouldApplyRendererResize(400, Number.POSITIVE_INFINITY, -1, -1)).toBe(false)
  })

  it('applies the first valid size', () => {
    expect(shouldApplyRendererResize(390, 844, -1, -1)).toBe(true)
  })

  it('skips a resize that does not change the integer drawing-buffer size', () => {
    expect(shouldApplyRendererResize(390, 844, 390, 844)).toBe(false)
    expect(shouldApplyRendererResize(390.4, 844.2, 390, 844)).toBe(false)
  })

  it('applies when the integer size actually changed', () => {
    expect(shouldApplyRendererResize(844, 390, 390, 844)).toBe(true)
  })
})
