import { describe, expect, it, vi } from 'vitest'
import {
  createSettlementNightCycle,
  NIGHT_FIRE_THRESHOLD,
  shouldAutoLightNightFire,
} from './settlementNightCycle'

function fakeFire(initiallyLit: boolean) {
  let lit = initiallyLit
  const light = vi.fn((_source?: string) => {
    lit = true
  })
  return {
    isLit: () => lit,
    light,
  } as unknown as import('./VillageFire').VillageFire
}

function fakeTorch() {
  return { setLit: vi.fn() } as unknown as import('./props').VillageTorch
}

function fakeHouseLight() {
  return { setNightIntensity: vi.fn() } as unknown as import('./props').HouseLight
}

describe('shouldAutoLightNightFire', () => {
  it('is stable for a fixed (seed, nightIndex, size) and varies across nightIndex', () => {
    const a = shouldAutoLightNightFire(12345, 1, 'XL')
    const b = shouldAutoLightNightFire(12345, 1, 'XL')
    expect(a).toBe(b)

    const results = new Set<boolean>()
    for (let i = 1; i <= 20; i++) results.add(shouldAutoLightNightFire(12345, i, 'MD'))
    expect(results.size).toBe(2)
  })

  it('OUTPOST/SM never light, XL always lights', () => {
    for (let i = 1; i <= 10; i++) {
      expect(shouldAutoLightNightFire(999, i, 'OUTPOST')).toBe(false)
      expect(shouldAutoLightNightFire(999, i, 'SM')).toBe(false)
      expect(shouldAutoLightNightFire(999, i, 'XL')).toBe(true)
    }
  })
})

describe('createSettlementNightCycle', () => {
  it('rolls fire autolight and toggles torches exactly on the upward crossing of the threshold', () => {
    const fire = fakeFire(false)
    const torch = fakeTorch()
    const cycle = createSettlementNightCycle({
      settlementSeed: 1,
      size: 'XL',
      fire,
      villageTorches: [torch],
      houseLights: [],
    })

    cycle.apply(NIGHT_FIRE_THRESHOLD - 0.1)
    expect(torch.setLit).not.toHaveBeenCalled()
    expect(fire.light).not.toHaveBeenCalled()

    cycle.apply(NIGHT_FIRE_THRESHOLD + 0.1)
    expect(torch.setLit).toHaveBeenCalledTimes(1)
    expect(torch.setLit).toHaveBeenCalledWith(true)
    expect(fire.light).toHaveBeenCalledTimes(1)
    expect(fire.light).toHaveBeenCalledWith('night')

    cycle.apply(NIGHT_FIRE_THRESHOLD + 0.2)
    expect(torch.setLit).toHaveBeenCalledTimes(1)
    expect(fire.light).toHaveBeenCalledTimes(1)
  })

  it('extinguishes torches exactly on the downward crossing', () => {
    const torch = fakeTorch()
    const cycle = createSettlementNightCycle({
      settlementSeed: 1,
      size: 'MD',
      fire: undefined,
      villageTorches: [torch],
      houseLights: [],
    })

    cycle.apply(NIGHT_FIRE_THRESHOLD + 0.1)
    expect(torch.setLit).toHaveBeenCalledWith(true)

    cycle.apply(NIGHT_FIRE_THRESHOLD - 0.1)
    expect(torch.setLit).toHaveBeenCalledWith(false)
    expect(torch.setLit).toHaveBeenCalledTimes(2)
  })

  it('applies house-light intensity on every call', () => {
    const light = fakeHouseLight()
    const cycle = createSettlementNightCycle({
      settlementSeed: 1,
      size: 'SM',
      fire: undefined,
      villageTorches: [],
      houseLights: [light],
    })

    cycle.apply(0.2)
    cycle.apply(0.8)
    expect(light.setNightIntensity).toHaveBeenNthCalledWith(1, 0.2)
    expect(light.setNightIntensity).toHaveBeenNthCalledWith(2, 0.8)
  })

  it('does not re-roll an already-lit fire', () => {
    const fire = fakeFire(true)
    const cycle = createSettlementNightCycle({
      settlementSeed: 1,
      size: 'XL',
      fire,
      villageTorches: [],
      houseLights: [],
    })
    cycle.apply(NIGHT_FIRE_THRESHOLD - 0.1)
    cycle.apply(NIGHT_FIRE_THRESHOLD + 0.1)
    expect(fire.light).not.toHaveBeenCalled()
  })
})
