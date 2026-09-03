import { describe, expect, it } from 'vitest'
import { createWaterSource } from './WaterSource'

describe('createWaterSource (plan world-011)', () => {
  it('classifies well as safe', () => {
    expect(createWaterSource('well')).toEqual({ kind: 'well', quality: 'safe' })
  })

  it('classifies river as safe (mountain streams read as clean)', () => {
    expect(createWaterSource('river')).toEqual({ kind: 'river', quality: 'safe' })
  })

  it('classifies lake as unsafe', () => {
    expect(createWaterSource('lake')).toEqual({ kind: 'lake', quality: 'unsafe' })
  })

  it('classifies ocean as undrinkable', () => {
    expect(createWaterSource('ocean')).toEqual({ kind: 'ocean', quality: 'undrinkable' })
  })
})
