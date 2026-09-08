import { describe, expect, it } from 'vitest'
import {
  resolveSocialExposure,
  socialExposureEventRoll,
  socialExposureRisk,
} from './socialExposure'

describe('socialExposureRisk', () => {
  it('is 50% by day with Sneak inactive', () => {
    expect(socialExposureRisk({ night: false, sneakActive: false, sneakValue: 0 })).toBe(0.5)
  })

  it('is 20% at night with Sneak inactive', () => {
    expect(socialExposureRisk({ night: true, sneakActive: false, sneakValue: 0 })).toBe(0.2)
  })

  it('applies linear Sneak reduction to the remaining risk', () => {
    expect(socialExposureRisk({ night: false, sneakActive: true, sneakValue: 0.5 })).toBe(0.25)
    expect(socialExposureRisk({ night: true, sneakActive: true, sneakValue: 0.5 })).toBe(0.1)
    expect(socialExposureRisk({ night: false, sneakActive: true, sneakValue: 0.75 })).toBe(0.125)
    expect(socialExposureRisk({ night: true, sneakActive: true, sneakValue: 0.75 })).toBeCloseTo(0.05)
    expect(socialExposureRisk({ night: false, sneakActive: true, sneakValue: 0.25 })).toBe(0.375)
    expect(socialExposureRisk({ night: true, sneakActive: true, sneakValue: 0.25 })).toBeCloseTo(0.15)
  })

  it('floors Sneak 100% at 2%', () => {
    expect(socialExposureRisk({ night: false, sneakActive: true, sneakValue: 1 })).toBe(0.02)
    expect(socialExposureRisk({ night: true, sneakActive: true, sneakValue: 1 })).toBe(0.02)
  })

  it('ignores sneak.value when Sneak is inactive', () => {
    expect(socialExposureRisk({ night: false, sneakActive: false, sneakValue: 1 })).toBe(0.5)
    expect(socialExposureRisk({ night: true, sneakActive: false, sneakValue: 0.75 })).toBe(0.2)
  })

  it('clamps sneak.value to 0..1', () => {
    expect(socialExposureRisk({ night: false, sneakActive: true, sneakValue: -1 })).toBe(0.5)
    expect(socialExposureRisk({ night: false, sneakActive: true, sneakValue: 2 })).toBe(0.02)
    expect(socialExposureRisk({ night: false, sneakActive: true, sneakValue: Number.NaN })).toBe(0.5)
  })

  it('keeps final risk in 0..1', () => {
    for (const night of [false, true]) {
      for (const sneakActive of [false, true]) {
        for (const sneakValue of [-10, 0, 0.2, 0.5, 1, 4, Number.NaN]) {
          const risk = socialExposureRisk({ night, sneakActive, sneakValue })
          expect(risk).toBeGreaterThanOrEqual(0)
          expect(risk).toBeLessThanOrEqual(1)
        }
      }
    }
  })
})

describe('socialExposureEventRoll', () => {
  it('is identical for the same spot identity', () => {
    const a = socialExposureEventRoll('cemetery:1:2:0:abc:0')
    const b = socialExposureEventRoll('cemetery:1:2:0:abc:0')
    expect(a).toBe(b)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(1)
  })

  it('changes when the spot identity changes', () => {
    expect(socialExposureEventRoll('cemetery:a:0')).not.toBe(socialExposureEventRoll('cemetery:b:0'))
  })
})

describe('resolveSocialExposure', () => {
  it('compares the event roll against the threshold without changing the roll', () => {
    const eventRoll = 0.18
    const day = resolveSocialExposure({
      night: false, sneakActive: false, sneakValue: 0, eventRoll,
    })
    const night = resolveSocialExposure({
      night: true, sneakActive: false, sneakValue: 0, eventRoll,
    })
    const nightSneak = resolveSocialExposure({
      night: true, sneakActive: true, sneakValue: 0.5, eventRoll,
    })
    expect(day.eventRoll).toBe(eventRoll)
    expect(night.eventRoll).toBe(eventRoll)
    expect(nightSneak.eventRoll).toBe(eventRoll)
    expect(day.exposed).toBe(true)
    expect(night.exposed).toBe(true)
    expect(nightSneak.exposed).toBe(false)
  })

  it('does not mix night or Sneak into a spot-identity roll', () => {
    const spotId = 'cemetery:roll-source:0'
    const eventRoll = socialExposureEventRoll(spotId)
    const a = resolveSocialExposure({
      night: false, sneakActive: false, sneakValue: 0, eventRoll,
    })
    const b = resolveSocialExposure({
      night: true, sneakActive: true, sneakValue: 0.9, eventRoll,
    })
    expect(a.eventRoll).toBe(eventRoll)
    expect(b.eventRoll).toBe(eventRoll)
    expect(socialExposureEventRoll(spotId)).toBe(eventRoll)
  })

  it('clamps an out-of-range event roll before comparing', () => {
    expect(resolveSocialExposure({
      night: false, sneakActive: false, sneakValue: 0, eventRoll: -1,
    }).exposed).toBe(true)
    expect(resolveSocialExposure({
      night: false, sneakActive: false, sneakValue: 0, eventRoll: 2,
    }).exposed).toBe(false)
  })
})
