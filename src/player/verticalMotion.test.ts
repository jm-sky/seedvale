import { describe, expect, it } from 'vitest'
import {
  GRAVITY,
  integrateVerticalMotion,
  JUMP_HEIGHT,
  JUMP_SPEED,
  LAND_MIN_SPEED,
  STEP_DOWN_MAX,
  type VerticalMotionResult,
} from './verticalMotion'

const DT = 1 / 60

function step(
  state: { y: number; verticalVelocity: number; grounded: boolean },
  groundY: number,
  jumpRequested = false,
): VerticalMotionResult {
  return integrateVerticalMotion({
    ...state,
    groundY,
    dt: DT,
    jumpRequested,
  })
}

describe('integrateVerticalMotion', () => {
  it('stays glued to a 15–30° downhill without landing', () => {
    const walkSpeed = 8
    for (const deg of [15, 30]) {
      const slope = (deg * Math.PI) / 180
      let x = 0
      let y = 10
      let verticalVelocity = 0
      let grounded = true
      for (let i = 0; i < 180; i++) {
        x += walkSpeed * DT
        const groundY = 10 - x * Math.tan(slope)
        const next = step({ y, verticalVelocity, grounded }, groundY)
        expect(next.landed, `${deg}° frame ${i}`).toBe(false)
        expect(next.grounded, `${deg}° frame ${i}`).toBe(true)
        expect(next.tookOff).toBe(false)
        y = next.y
        verticalVelocity = next.verticalVelocity
        grounded = next.grounded
      }
      expect(y).toBeLessThan(10)
    }
  })

  it('snaps a small curb without going airborne', () => {
    const drop = 0.2
    expect(drop).toBeLessThan(STEP_DOWN_MAX)
    const next = step({ y: 2, verticalVelocity: 0, grounded: true }, 2 - drop)
    expect(next.grounded).toBe(true)
    expect(next.landed).toBe(false)
    expect(next.y).toBeCloseTo(2 - drop)
    expect(next.verticalVelocity).toBe(0)
  })

  it('walks off a ledge taller than STEP_DOWN_MAX, then lands with SFX', () => {
    const top = 4
    const bottom = top - STEP_DOWN_MAX - 0.1
    const leave = step({ y: top, verticalVelocity: 0, grounded: true }, bottom)
    expect(leave.grounded).toBe(false)
    expect(leave.landed).toBe(false)
    expect(leave.y).toBeLessThan(top)

    let y = leave.y
    let verticalVelocity = leave.verticalVelocity
    let grounded = leave.grounded
    let landed = false
    let frames = 0
    while (!grounded && frames < 120) {
      const next = step({ y, verticalVelocity, grounded }, bottom)
      y = next.y
      verticalVelocity = next.verticalVelocity
      grounded = next.grounded
      landed = next.landed
      frames += 1
    }
    expect(grounded).toBe(true)
    expect(y).toBe(bottom)
    expect(landed).toBe(true)
    const fallSpeed = Math.sqrt(2 * GRAVITY * (top - bottom))
    expect(fallSpeed).toBeGreaterThan(LAND_MIN_SPEED)
  })

  it('jumps ~0.6 m and lands hard enough for SFX', () => {
    const groundY = 1
    const takeoff = step(
      { y: groundY, verticalVelocity: 0, grounded: true },
      groundY,
      true,
    )
    expect(takeoff.tookOff).toBe(true)
    expect(takeoff.grounded).toBe(false)
    expect(takeoff.landed).toBe(false)
    expect(takeoff.verticalVelocity).toBeLessThan(JUMP_SPEED)
    expect(takeoff.verticalVelocity).toBeGreaterThan(0)

    let y = takeoff.y
    let verticalVelocity = takeoff.verticalVelocity
    let grounded = takeoff.grounded
    let apex = y
    let landed = false
    let frames = 0
    while (!grounded && frames < 120) {
      const next = step({ y, verticalVelocity, grounded }, groundY)
      y = next.y
      verticalVelocity = next.verticalVelocity
      grounded = next.grounded
      landed = next.landed
      apex = Math.max(apex, y)
      frames += 1
    }
    expect(grounded).toBe(true)
    expect(landed).toBe(true)
    expect(apex - groundY).toBeCloseTo(JUMP_HEIGHT, 1)
  })

  it('does not count a few-centimetre airborne drop as a land', () => {
    const groundY = 0
    let y = 0.05
    let verticalVelocity = 0
    let grounded = false
    let landed = false
    let frames = 0
    while (!grounded && frames < 60) {
      const next = step({ y, verticalVelocity, grounded }, groundY)
      y = next.y
      verticalVelocity = next.verticalVelocity
      grounded = next.grounded
      landed = next.landed
      frames += 1
    }
    expect(grounded).toBe(true)
    expect(landed).toBe(false)
    expect(Math.sqrt(2 * GRAVITY * 0.05)).toBeLessThan(LAND_MIN_SPEED)
  })

  it('ignores jump while already airborne', () => {
    const next = step(
      { y: 2, verticalVelocity: 1, grounded: false },
      0,
      true,
    )
    expect(next.tookOff).toBe(false)
    expect(next.grounded).toBe(false)
  })
})
