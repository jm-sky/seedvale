import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import type { CampfireFlame } from './props'
import { createVillageFire } from './VillageFire'

/** Minimal `CampfireFlame` stub — `getFuelRatio` never reads the flame, only
 *  `VillageFire`'s own fuel counter, so nothing here needs to be real. */
function fakeFlame(): CampfireFlame {
  return {
    object: { visible: false } as CampfireFlame['object'],
    update: () => {},
    setSize: () => {},
    setIntensity: () => {},
    igniteBurst: () => {},
  }
}

describe('VillageFire.getFuelRatio (plan items-player-015)', () => {
  it('is 0 while unlit', () => {
    const fire = createVillageFire(new Vector3(), fakeFlame())
    expect(fire.getFuelRatio()).toBe(0)
  })

  it('is 1 right after lighting (one branch worth of fuel)', () => {
    const fire = createVillageFire(new Vector3(), fakeFlame(), 75)
    fire.light()
    expect(fire.getFuelRatio()).toBe(1)
  })

  it('adds a full unit per addFuel(), on top of whatever remains', () => {
    const fire = createVillageFire(new Vector3(), fakeFlame(), 75)
    fire.light()
    fire.addFuel()
    fire.addFuel()
    expect(fire.getFuelRatio()).toBeCloseTo(3)
  })

  it('decays continuously with update(dt), then drops to 0 once burnt out', () => {
    const fire = createVillageFire(new Vector3(), fakeFlame(), 75)
    fire.light()
    fire.update(30)
    expect(fire.getFuelRatio()).toBeCloseTo(45 / 75)
    fire.update(1000)
    expect(fire.isLit()).toBe(false)
    expect(fire.getFuelRatio()).toBe(0)
  })

  it('repeated ignition resets to exactly one unit, never stacking with leftover fuel', () => {
    const fire = createVillageFire(new Vector3(), fakeFlame(), 75)
    fire.light()
    fire.addFuel()
    fire.light()
    expect(fire.getFuelRatio()).toBe(1)
  })
})
