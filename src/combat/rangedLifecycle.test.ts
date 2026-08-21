import { describe, expect, it } from 'vitest'
import { ITEM_CATALOG } from '../items/itemCatalog'
import { createRangedAttackLifecycle } from './rangedLifecycle'

const SHORT_BOW = ITEM_CATALOG.short_bow.ranged!

describe('createRangedAttackLifecycle', () => {
  it('starts idle and rejects update() input while idle', () => {
    const lifecycle = createRangedAttackLifecycle()
    expect(lifecycle.state()).toBe('idle')
    expect(lifecycle.isDrawing()).toBe(false)
    expect(lifecycle.update(1).fireReady).toBe(false)
  })

  it('start() only succeeds from idle', () => {
    const lifecycle = createRangedAttackLifecycle()
    expect(lifecycle.start(SHORT_BOW)).toBe(true)
    expect(lifecycle.state()).toBe('draw')
    expect(lifecycle.start(SHORT_BOW)).toBe(false)
  })

  it('fires exactly once when draw completes, then recovers to idle', () => {
    const lifecycle = createRangedAttackLifecycle()
    lifecycle.start(SHORT_BOW)

    const beforeFire = lifecycle.update(SHORT_BOW.drawTime - 0.01)
    expect(beforeFire.fireReady).toBe(false)

    const fireTick = lifecycle.update(0.02)
    expect(fireTick.fireReady).toBe(true)
    expect(fireTick.config).toBe(SHORT_BOW)
    expect(lifecycle.state()).toBe('release')

    let refired = false
    let guard = 0
    while (lifecycle.state() !== 'idle' && guard < 50) {
      const tick = lifecycle.update(0.05)
      if (tick.fireReady) refired = true
      guard++
    }
    expect(refired).toBe(false)
    expect(lifecycle.state()).toBe('idle')
  })

  it('a single large dt cascades through every phase without a duplicate fire', () => {
    const lifecycle = createRangedAttackLifecycle()
    lifecycle.start(SHORT_BOW)
    const total = SHORT_BOW.drawTime + 0.06 + SHORT_BOW.recovery
    const tick = lifecycle.update(total + 1)
    expect(tick.fireReady).toBe(true)
    expect(lifecycle.state()).toBe('idle')
    expect(lifecycle.update(0).fireReady).toBe(false)
  })

  it('reset() cancels an in-flight draw', () => {
    const lifecycle = createRangedAttackLifecycle()
    lifecycle.start(SHORT_BOW)
    lifecycle.update(SHORT_BOW.drawTime * 0.5)
    lifecycle.reset()
    expect(lifecycle.state()).toBe('idle')
    expect(lifecycle.isDrawing()).toBe(false)
  })

  describe('manualRelease (real press-to-draw/release-to-fire input)', () => {
    it('update() never auto-fires a manualRelease draw, even held well past drawTime', () => {
      const lifecycle = createRangedAttackLifecycle()
      lifecycle.start(SHORT_BOW, { manualRelease: true })
      const tick = lifecycle.update(SHORT_BOW.drawTime * 5)
      expect(tick.fireReady).toBe(false)
      expect(lifecycle.state()).toBe('draw')
      expect(lifecycle.phaseProgress()).toBe(1)
    })

    it('release() before drawTime cancels back to idle with no fire', () => {
      const lifecycle = createRangedAttackLifecycle()
      lifecycle.start(SHORT_BOW, { manualRelease: true })
      lifecycle.update(SHORT_BOW.drawTime * 0.5)
      const result = lifecycle.release()
      expect(result.fireReady).toBe(false)
      expect(result.config).toBeNull()
      expect(lifecycle.state()).toBe('idle')
    })

    it('release() at/after drawTime fires and enters release', () => {
      const lifecycle = createRangedAttackLifecycle()
      lifecycle.start(SHORT_BOW, { manualRelease: true })
      lifecycle.update(SHORT_BOW.drawTime)
      const result = lifecycle.release()
      expect(result.fireReady).toBe(true)
      expect(result.config).toBe(SHORT_BOW)
      expect(lifecycle.state()).toBe('release')
    })

    it('release() while not drawing is a no-op', () => {
      const lifecycle = createRangedAttackLifecycle()
      expect(lifecycle.release()).toEqual({ fireReady: false, config: null })
      expect(lifecycle.state()).toBe('idle')
    })

    it('start() without opts (NPC callers) keeps auto-firing on the timer, unaffected by manualRelease existing', () => {
      const lifecycle = createRangedAttackLifecycle()
      lifecycle.start(SHORT_BOW)
      const tick = lifecycle.update(SHORT_BOW.drawTime + 0.01)
      expect(tick.fireReady).toBe(true)
      expect(lifecycle.state()).toBe('release')
    })
  })
})
