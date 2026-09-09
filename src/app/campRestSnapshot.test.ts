import { describe, expect, it } from 'vitest'
import { campRestQuality } from './campRest'
import { resolveCampRestSnapshot } from './campRestSnapshot'

function tent(id: string, x: number, z: number, condition: number) {
  return { id, x, z, yaw: 0, condition, lastConditionUpdateAtDays: 0 }
}

function bedroll(id: string, x: number, z: number, condition: number) {
  return { id, x, z, yaw: 0, variant: 'leather' as const, condition, lastConditionUpdateAtDays: 0 }
}

function platform(id: string, x: number, z: number, condition: number) {
  return { id, x, z, yaw: 0, condition, lastConditionUpdateAtDays: 0 }
}

function fire(id: string, x: number, z: number, lit: boolean) {
  return { id, x, z, habitatBurn: false, fire: { isLit: () => lit } }
}

function snapshot(over: Partial<Parameters<typeof resolveCampRestSnapshot>[0]> = {}) {
  const tents = over.tents ?? { list: () => [], conditionOf: () => null }
  const bedrolls = over.bedrolls ?? { list: () => [], conditionOf: () => null }
  const platforms = over.platforms ?? { list: () => [], conditionOf: () => null }
  return resolveCampRestSnapshot({
    x: 0,
    z: 0,
    tents,
    bedrolls,
    platforms,
    fires: [],
    nowDays: 0,
    hasBlanket: true,
    survivalValue: 0,
    ...over,
  })
}

describe('resolveCampRestSnapshot', () => {
  it('uses the same quality as campRestQuality for the resolved context', () => {
    const tents = [tent('t1', 0, 0, 80)]
    const bedrolls = [bedroll('b1', 0.5, 0, 70)]
    const platforms = [platform('p1', 0.5, 0, 60)]
    const result = snapshot({
      tents: { list: () => tents, conditionOf: (id) => tents.find((t) => t.id === id)?.condition ?? null },
      bedrolls: { list: () => bedrolls, conditionOf: (id) => bedrolls.find((b) => b.id === id)?.condition ?? null },
      platforms: { list: () => platforms, conditionOf: (id) => platforms.find((p) => p.id === id)?.condition ?? null },
      fires: [fire('f1', 1, 0, true)],
      survivalValue: 0.3,
    })
    expect(result.quality).toBe(campRestQuality(result.context, 0.3))
    expect(result.tentCondition).toBe(80)
    expect(result.bedrollCondition).toBe(70)
    expect(result.platformCondition).toBe(60)
    expect(result.fire?.lit).toBe(true)
  })

  it('treats a degraded tent as tentCondition 0 shelter', () => {
    const tents = [tent('t1', 0, 0, 0)]
    const result = snapshot({
      tents: { list: () => tents, conditionOf: () => 0 },
    })
    expect(result.context.tentCondition).toBe(0)
    expect(result.quality).toBe(campRestQuality({ hasBlanket: true, hasWarmFire: false, tentCondition: 0, bedrollCondition: 0, platformCondition: 0 }, 0))
  })

  it('ignores settlement-owned fires (habitatBurn)', () => {
    const result = snapshot({
      fires: [{ id: 'burn', x: 0, z: 0, habitatBurn: true, fire: { isLit: () => true } }],
    })
    expect(result.fire).toBeNull()
    expect(result.context.hasWarmFire).toBe(false)
  })

  it('reuses an unlit player fire without counting it as warmth', () => {
    const result = snapshot({
      fires: [fire('f1', 0, 0, false)],
    })
    expect(result.fire?.id).toBe('f1')
    expect(result.fire?.lit).toBe(false)
    expect(result.context.hasWarmFire).toBe(false)
  })
})
