import { describe, expect, it } from 'vitest'
import { ITEM_CATALOG } from '../items/itemCatalog'
import {
  createMeleeAttackLifecycle,
  type MeleeHitCandidate,
  resolveMeleeHits,
  yawToward,
} from './meleeAttack'

const KNIFE = ITEM_CATALOG.knife.melee!

describe('createMeleeAttackLifecycle', () => {
  it('starts idle and rejects update() input while idle', () => {
    const lifecycle = createMeleeAttackLifecycle()
    expect(lifecycle.state()).toBe('idle')
    expect(lifecycle.isAttacking()).toBe(false)
    expect(lifecycle.update(1).hitReady).toBe(false)
  })

  it('start() only succeeds from idle', () => {
    const lifecycle = createMeleeAttackLifecycle()
    expect(lifecycle.start(KNIFE)).toBe(true)
    expect(lifecycle.state()).toBe('windUp')
    expect(lifecycle.start(KNIFE)).toBe(false)
  })

  it('reaches exactly one hitReady edge at the start of hitWindow', () => {
    const lifecycle = createMeleeAttackLifecycle()
    lifecycle.start(KNIFE)
    let hitCount = 0
    let elapsed = 0
    const dt = 0.01
    while (elapsed < KNIFE.windUp + KNIFE.hitWindow + KNIFE.recovery + 0.05) {
      const tick = lifecycle.update(dt)
      if (tick.hitReady) hitCount++
      elapsed += dt
    }
    expect(hitCount).toBe(1)
    expect(lifecycle.state()).toBe('idle')
  })

  it('a single large dt cascades through every phase without a duplicate hit', () => {
    const lifecycle = createMeleeAttackLifecycle()
    lifecycle.start(KNIFE)
    const totalDuration = KNIFE.windUp + KNIFE.hitWindow + KNIFE.recovery
    const tick = lifecycle.update(totalDuration + 1)
    expect(tick.hitReady).toBe(true)
    expect(tick.config).toBe(KNIFE)
    expect(lifecycle.state()).toBe('idle')
    // No second hit from the same oversized dt.
    expect(lifecycle.update(0).hitReady).toBe(false)
  })

  it('reset() cancels an in-flight attack', () => {
    const lifecycle = createMeleeAttackLifecycle()
    lifecycle.start(KNIFE)
    lifecycle.update(KNIFE.windUp * 0.5)
    lifecycle.reset()
    expect(lifecycle.state()).toBe('idle')
    expect(lifecycle.isAttacking()).toBe(false)
  })
})

describe('resolveMeleeHits', () => {
  const candidate = (id: string, x: number, z: number, alive = true): MeleeHitCandidate => ({ id, x, z, alive })

  it('hits a candidate directly ahead within range', () => {
    const hits = resolveMeleeHits(0, 0, 0, KNIFE, [candidate('a', 0, -1)])
    expect(hits).toEqual(['a'])
  })

  it('excludes a candidate beyond range', () => {
    const hits = resolveMeleeHits(0, 0, 0, KNIFE, [candidate('a', 0, -(KNIFE.range + 1))])
    expect(hits).toEqual([])
  })

  it('excludes a candidate outside the facing arc', () => {
    const hits = resolveMeleeHits(0, 0, 0, KNIFE, [candidate('a', 0, 1)])
    expect(hits).toEqual([])
  })

  it('ignores dead candidates', () => {
    const hits = resolveMeleeHits(0, 0, 0, KNIFE, [candidate('a', 0, -1, false)])
    expect(hits).toEqual([])
  })

  it('returns every valid candidate, not just the nearest', () => {
    const hits = resolveMeleeHits(0, 0, 0, KNIFE, [candidate('a', -0.3, -1), candidate('b', 0.3, -1)])
    expect(hits.sort()).toEqual(['a', 'b'])
  })
})

describe('yawToward', () => {
  it('returns null for coincident points', () => {
    expect(yawToward(1, 1, 1, 1)).toBeNull()
  })

  it('produces a yaw whose forward direction resolveMeleeHits agrees with', () => {
    const yaw = yawToward(0, 0, 5, 5)!
    const hits = resolveMeleeHits(0, 0, yaw, { ...KNIFE, range: 20 }, [{ id: 't', x: 5, z: 5, alive: true }])
    expect(hits).toEqual(['t'])
  })

  // plan items-player-011 §Testy: `yawToward()` and `resolveMeleeHits()` must
  // agree on the same physical direction for every axis-aligned and diagonal
  // target, not just the one diagonal case above.
  it.each([
    ['+X', 5, 0],
    ['-X', -5, 0],
    ['+Z', 0, 5],
    ['-Z', 0, -5],
    ['+X+Z diagonal', 5, 5],
    ['-X+Z diagonal', -5, 5],
    ['+X-Z diagonal', 5, -5],
    ['-X-Z diagonal', -5, -5],
  ])('agrees with resolveMeleeHits for a target toward %s', (_label, toX, toZ) => {
    const yaw = yawToward(0, 0, toX, toZ)!
    const hits = resolveMeleeHits(0, 0, yaw, { ...KNIFE, range: 20 }, [{ id: 't', x: toX, z: toZ, alive: true }])
    expect(hits).toEqual(['t'])
  })

  it('a target outside the committed yaw\'s arc is still not hit', () => {
    // Committed toward +Z; a candidate toward +X sits well outside the arc.
    const yaw = yawToward(0, 0, 0, 5)!
    const hits = resolveMeleeHits(0, 0, yaw, KNIFE, [{ id: 't', x: 5, z: 0, alive: true }])
    expect(hits).toEqual([])
  })

  it('a later camera/live yaw does not affect a direction committed earlier', () => {
    // Simulates the gameLoop contract: `attackYaw` is computed once at
    // attack start and must keep resolving the same hit no matter what the
    // "current" yaw becomes afterwards.
    const committedYaw = yawToward(0, 0, 0, -5)!
    const liveYawAfterCameraTurn = committedYaw + Math.PI / 2
    const hits = resolveMeleeHits(0, 0, committedYaw, KNIFE, [{ id: 't', x: 0, z: -1, alive: true }])
    expect(hits).toEqual(['t'])
    const hitsWithLiveYaw = resolveMeleeHits(0, 0, liveYawAfterCameraTurn, KNIFE, [{ id: 't', x: 0, z: -1, alive: true }])
    expect(hitsWithLiveYaw).toEqual([])
  })
})
