import { describe, expect, it } from 'vitest'
import {
  MERCHANT_WAGON_HORSE_DIST,
  MERCHANT_WAGON_PREFERRED_YAW,
  MERCHANT_WAGON_RADIUS,
  MERCHANT_WAGON_STALL_DIST,
  pickMerchantWagonPose,
} from './merchantWagon'

describe('pickMerchantWagonPose', () => {
  it('keeps the historic +X heading when the stall side is clear', () => {
    const pose = pickMerchantWagonPose(10, 20, [])
    expect(pose.yaw).toBeCloseTo(MERCHANT_WAGON_PREFERRED_YAW, 8)
    expect(pose.wagonX).toBeCloseTo(10 + Math.cos(MERCHANT_WAGON_PREFERRED_YAW) * MERCHANT_WAGON_STALL_DIST, 6)
    expect(pose.wagonZ).toBeCloseTo(20 + Math.sin(MERCHANT_WAGON_PREFERRED_YAW) * MERCHANT_WAGON_STALL_DIST, 6)
    const horseDist = Math.hypot(pose.horseX - pose.wagonX, pose.horseZ - pose.wagonZ)
    expect(horseDist).toBeCloseTo(MERCHANT_WAGON_HORSE_DIST, 6)
  })

  it('rotates away when a stockpile sits on the preferred wagon spot', () => {
    const stallX = 0
    const stallZ = 0
    const blockedX = Math.cos(MERCHANT_WAGON_PREFERRED_YAW) * MERCHANT_WAGON_STALL_DIST
    const blockedZ = Math.sin(MERCHANT_WAGON_PREFERRED_YAW) * MERCHANT_WAGON_STALL_DIST
    const pose = pickMerchantWagonPose(stallX, stallZ, [
      { x: blockedX, z: blockedZ, r: MERCHANT_WAGON_RADIUS },
    ])
    expect(Math.abs(pose.yaw - MERCHANT_WAGON_PREFERRED_YAW)).toBeGreaterThan(0.4)
    const dist = Math.hypot(pose.wagonX - blockedX, pose.wagonZ - blockedZ)
    expect(dist).toBeGreaterThan(MERCHANT_WAGON_RADIUS + 0.5)
  })
})
