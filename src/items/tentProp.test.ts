import { describe, expect, it } from 'vitest'
import { PLAYER_HEIGHT } from '../player/PlayerController'
import { tentRestPose } from './tentProp'

describe('tentRestPose', () => {
  const along = PLAYER_HEIGHT * 0.45

  it('places feet toward the entrance so the spine runs toward the back wall', () => {
    const pose = tentRestPose({ x: 10, z: 20, yaw: 0 })
    expect(pose.yaw).toBe(0)
    expect(pose.x).toBeCloseTo(10)
    expect(pose.z).toBeCloseTo(20 + along)
  })

  it('rotates the offset with tent yaw', () => {
    const yaw = Math.PI / 2
    const pose = tentRestPose({ x: 0, z: 0, yaw })
    expect(pose.yaw).toBe(yaw)
    expect(pose.x).toBeCloseTo(along)
    expect(pose.z).toBeCloseTo(0)
  })
})
