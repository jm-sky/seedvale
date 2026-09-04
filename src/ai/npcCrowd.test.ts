import { describe, expect, it } from 'vitest'
import { createNpcCrowdPass, GROUP_REACTION_RADIUS, type NpcCrowdAgent } from './npcCrowd'

function agentAt(x: number, z: number, dead = false): NpcCrowdAgent {
  return { mesh: { position: { x, z } }, health: { dead } }
}

describe('createNpcCrowdPass', () => {
  it('counts a neighbor within GROUP_REACTION_RADIUS but not one beyond it', () => {
    const pass = createNpcCrowdPass()
    const near = pass.run([agentAt(0, 0), agentAt(3, 0)], 1 / 60)
    expect(near.nearbyCounts[0]).toBe(1)
    expect(near.nearbyCounts[1]).toBe(1)

    const far = pass.run([agentAt(0, 0), agentAt(GROUP_REACTION_RADIUS + 1, 0)], 1 / 60)
    expect(far.nearbyCounts[0]).toBe(0)
    expect(far.nearbyCounts[1]).toBe(0)
  })

  it('pushes two overlapping NPCs apart equally and oppositely', () => {
    const pass = createNpcCrowdPass()
    const result = pass.run([agentAt(0, 0), agentAt(0.2, 0)], 1 / 60)
    expect(result.pushX[0]).toBeLessThan(0)
    expect(result.pushX[1]).toBeGreaterThan(0)
    expect(result.pushX[0]).toBeCloseTo(-result.pushX[1]!, 10)
    expect(result.pushZ[0]).toBe(0)
    expect(result.pushZ[1]).toBe(0)
  })

  it('counts a dead NPC toward nearbyCounts but excludes it from separation, both directions', () => {
    const pass = createNpcCrowdPass()
    const result = pass.run([agentAt(0, 0), agentAt(0.2, 0, true)], 1 / 60)
    expect(result.nearbyCounts[0]).toBe(1)
    expect(result.nearbyCounts[1]).toBe(1)
    expect(result.pushX[0]).toBe(0)
    expect(result.pushZ[0]).toBe(0)
    expect(result.pushX[1]).toBe(0)
    expect(result.pushZ[1]).toBe(0)
  })

  it('pushes coincident NPCs along (1, 0) without producing NaN', () => {
    const pass = createNpcCrowdPass()
    const result = pass.run([agentAt(5, 5), agentAt(5, 5)], 1 / 60)
    expect(Number.isNaN(result.pushX[0])).toBe(false)
    expect(Number.isNaN(result.pushZ[0])).toBe(false)
    expect(result.pushX[0]).toBeGreaterThan(0)
    expect(result.pushZ[0]).toBe(0)
  })

  it('reuses the same buffer objects across calls with the same agent count', () => {
    const pass = createNpcCrowdPass()
    const first = pass.run([agentAt(0, 0), agentAt(1, 0)], 1 / 60)
    const second = pass.run([agentAt(2, 2), agentAt(3, 3)], 1 / 60)
    expect(second.nearbyCounts).toBe(first.nearbyCounts)
    expect(second.pushX).toBe(first.pushX)
    expect(second.pushZ).toBe(first.pushZ)
  })
})
