import { describe, expect, it } from 'vitest'
import { AO_RESTORE_MS, AO_SUPPRESS_MS, shouldSuppressAo } from './aoBudget'

describe('shouldSuppressAo', () => {
  it('suppresses once renderMs crosses the heavy-frame threshold', () => {
    expect(shouldSuppressAo(false, AO_SUPPRESS_MS)).toBe(true)
    expect(shouldSuppressAo(false, AO_SUPPRESS_MS + 4)).toBe(true)
  })

  it('restores once renderMs drops to the light-frame threshold', () => {
    expect(shouldSuppressAo(true, AO_RESTORE_MS)).toBe(false)
    expect(shouldSuppressAo(true, AO_RESTORE_MS - 2)).toBe(false)
  })

  it('holds the previous state inside the hysteresis band', () => {
    const mid = (AO_SUPPRESS_MS + AO_RESTORE_MS) / 2
    expect(shouldSuppressAo(true, mid)).toBe(true)
    expect(shouldSuppressAo(false, mid)).toBe(false)
  })
})
