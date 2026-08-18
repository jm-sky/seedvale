import { describe, expect, it } from 'vitest'
import { canCancelRestProgress, REST_CANCEL_PROGRESS_THRESHOLD } from '../items/items'

describe('canCancelRestProgress', () => {
  it('blocks at exactly 85%', () => {
    expect(canCancelRestProgress(REST_CANCEL_PROGRESS_THRESHOLD)).toBe(false)
  })

  it('allows just above 85%', () => {
    expect(canCancelRestProgress(REST_CANCEL_PROGRESS_THRESHOLD + 0.001)).toBe(true)
  })

  it('blocks null and zero progress', () => {
    expect(canCancelRestProgress(null)).toBe(false)
    expect(canCancelRestProgress(0)).toBe(false)
  })
})
