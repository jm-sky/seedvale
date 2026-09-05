import { describe, expect, it } from 'vitest'
import {
  classifyWaterTraversal,
  shouldApplyDrowningDamage,
  swimStaminaExertion,
  wadeDepthFor,
} from './waterTraversal'

describe('classifyWaterTraversal (plan fauna-015)', () => {
  it('classifies zero/negative depth as dry', () => {
    expect(classifyWaterTraversal(0, 1, undefined)).toBe('dry')
    expect(classifyWaterTraversal(-0.1, 1, undefined)).toBe('dry')
  })

  it('classifies shallow depth (within the scale-derived wading depth) as wading', () => {
    const scale = 1
    const shallow = wadeDepthFor(scale) - 0.05
    expect(classifyWaterTraversal(shallow, scale, undefined)).toBe('wading')
  })

  it('classifies depth beyond the wading threshold as swimming for a default (unconfigured) species', () => {
    const scale = 1
    const deep = wadeDepthFor(scale) + 0.5
    expect(classifyWaterTraversal(deep, scale, undefined)).toBe('swimming')
  })

  it('a larger scale wades deeper before swimming is required', () => {
    const depth = 0.6
    expect(classifyWaterTraversal(depth, 0.4, undefined)).toBe('swimming')
    expect(classifyWaterTraversal(depth, 1.5, undefined)).toBe('wading')
  })

  it('a species without safe swimming cannot enter water deeper than its wading depth', () => {
    const scale = 1
    const deep = wadeDepthFor(scale) + 0.5
    expect(classifyWaterTraversal(deep, scale, { canSwim: false })).toBeNull()
  })

  it('a species without safe swimming can still wade shallow water', () => {
    const scale = 1
    const shallow = wadeDepthFor(scale) - 0.05
    expect(classifyWaterTraversal(shallow, scale, { canSwim: false })).toBe('wading')
  })

  it('waterAdapted (duck) still swims normally in deep water — the capability only affects stamina cost', () => {
    const scale = 0.4
    const deep = wadeDepthFor(scale) + 0.2
    expect(classifyWaterTraversal(deep, scale, { waterAdapted: true })).toBe('swimming')
  })
})

describe('swimStaminaExertion (plan fauna-015 §5/§6)', () => {
  it('defaults to the generic (sprint-equivalent) exertion when unconfigured', () => {
    expect(swimStaminaExertion(undefined)).toBe(1)
  })

  it('is much lower for a waterAdapted species (duck) than the generic default', () => {
    expect(swimStaminaExertion({ waterAdapted: true })).toBeLessThan(swimStaminaExertion(undefined))
  })
})

describe('shouldApplyDrowningDamage (plan fauna-015 §7)', () => {
  it('zero stamina on dry land does not drown', () => {
    expect(shouldApplyDrowningDamage('dry', true)).toBe(false)
  })

  it('zero stamina while wading does not drown', () => {
    expect(shouldApplyDrowningDamage('wading', true)).toBe(false)
  })

  it('zero stamina while swimming drowns', () => {
    expect(shouldApplyDrowningDamage('swimming', true)).toBe(true)
  })

  it('swimming with stamina remaining does not drown', () => {
    expect(shouldApplyDrowningDamage('swimming', false)).toBe(false)
  })

  it('leaving swimming for wading/dry stops drowning immediately, even still exhausted', () => {
    expect(shouldApplyDrowningDamage('wading', true)).toBe(false)
    expect(shouldApplyDrowningDamage('dry', true)).toBe(false)
  })
})
