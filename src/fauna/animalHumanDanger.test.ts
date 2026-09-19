import { describe, expect, it } from 'vitest'
import { ANIMAL_DEFS } from './animalDefs'
import { resolveHumanDangerProjection } from './animalHumanDanger'

describe('resolveHumanDangerProjection', () => {
  it('a normal (human-avoiding) fox resolves to a negligible danger', () => {
    const danger = resolveHumanDangerProjection({
      humanDanger: ANIMAL_DEFS.fox.humanDanger,
      aggressive: false,
      dangerSignificance: 1,
    })
    expect(danger).toBeGreaterThanOrEqual(0)
    expect(danger).toBeLessThan(0.1)
  })

  it('an aggressive/frenzied fox becomes meaningfully dangerous', () => {
    const calm = resolveHumanDangerProjection({
      humanDanger: ANIMAL_DEFS.fox.humanDanger,
      aggressive: false,
      dangerSignificance: 1,
    })
    const aggressive = resolveHumanDangerProjection({
      humanDanger: ANIMAL_DEFS.fox.humanDanger,
      aggressive: true,
      dangerSignificance: 1,
    })
    expect(aggressive).toBeGreaterThan(calm)
    expect(aggressive).toBeGreaterThanOrEqual(0.3)
  })

  it('a normal wolf is already meaningful risk before ever attacking', () => {
    const danger = resolveHumanDangerProjection({
      humanDanger: ANIMAL_DEFS.wolf.humanDanger,
      aggressive: false,
      dangerSignificance: 1,
    })
    expect(danger).toBeGreaterThanOrEqual(0.3)
  })

  it('a normal bear projects greater danger than a normal wolf', () => {
    const wolfDanger = resolveHumanDangerProjection({
      humanDanger: ANIMAL_DEFS.wolf.humanDanger,
      aggressive: false,
      dangerSignificance: 1,
    })
    const bearDanger = resolveHumanDangerProjection({
      humanDanger: ANIMAL_DEFS.bear.humanDanger,
      aggressive: false,
      dangerSignificance: 1,
    })
    expect(bearDanger).toBeGreaterThan(wolfDanger)
  })

  it('an exceptional/dangerous individual scales the same species baseline through dangerSignificance', () => {
    const normal = resolveHumanDangerProjection({
      humanDanger: ANIMAL_DEFS.wolf.humanDanger,
      aggressive: false,
      dangerSignificance: 1,
    })
    const alpha = resolveHumanDangerProjection({
      humanDanger: ANIMAL_DEFS.wolf.humanDanger,
      aggressive: false,
      dangerSignificance: 2,
    })
    expect(alpha).toBeCloseTo(normal * 2)
  })

  it('harmless prey/livestock (no humanDanger config) never becomes a destination blocker', () => {
    for (const kind of ['deer', 'stag', 'rabbit', 'duck', 'boar', 'sheep', 'cow', 'chicken', 'horse', 'donkey', 'dog', 'rat'] as const) {
      const def = ANIMAL_DEFS[kind]
      expect(resolveHumanDangerProjection({
        humanDanger: def.humanDanger,
        aggressive: true,
        dangerSignificance: 5,
      })).toBe(0)
    }
  })

  it('the aggressive floor never falls below the calm baseline', () => {
    for (const kind of ['wolf', 'fox', 'bear'] as const) {
      const cfg = ANIMAL_DEFS[kind].humanDanger!
      expect(cfg.aggressiveFloor).toBeGreaterThanOrEqual(cfg.baseline)
    }
  })
})
