import { describe, expect, it } from 'vitest'
import {
  DEFAULT_POINT_LIGHT_BUDGET,
  parsePointLightBudgetFlag,
  pointLightBudgetFromUrl,
} from './flags'

describe('parsePointLightBudgetFlag — production default 16', () => {
  it('defaults to 16 when the URL param is absent', () => {
    expect(parsePointLightBudgetFlag(null, false)).toBe(DEFAULT_POINT_LIGHT_BUDGET)
    expect(DEFAULT_POINT_LIGHT_BUDGET).toBe(16)
  })

  it('treats a bare / true / yes flag as the production default', () => {
    expect(parsePointLightBudgetFlag('', true)).toBe(16)
    expect(parsePointLightBudgetFlag('true', true)).toBe(16)
    expect(parsePointLightBudgetFlag('yes', true)).toBe(16)
  })

  it('accepts an explicit integer budget', () => {
    expect(parsePointLightBudgetFlag('16', true)).toBe(16)
    expect(parsePointLightBudgetFlag('24', true)).toBe(24)
  })

  it('disables pad/cull for 0 / false / no / off', () => {
    expect(parsePointLightBudgetFlag('0', true)).toBeNull()
    expect(parsePointLightBudgetFlag('false', true)).toBeNull()
    expect(parsePointLightBudgetFlag('no', true)).toBeNull()
    expect(parsePointLightBudgetFlag('off', true)).toBeNull()
  })

  it('rejects non-integer or sub-1 values as disabled', () => {
    expect(parsePointLightBudgetFlag('-1', true)).toBeNull()
    expect(parsePointLightBudgetFlag('abc', true)).toBeNull()
  })
})

describe('pointLightBudgetFromUrl', () => {
  it('returns the production default when window/URL is unavailable', () => {
    expect(pointLightBudgetFromUrl()).toBe(DEFAULT_POINT_LIGHT_BUDGET)
  })
})
