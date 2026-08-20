import { describe, expect, it } from 'vitest'
import { ITEM_CATALOG } from '../items/itemCatalog'
import { createStaminaState } from '../shared/StaminaState'
import { createPlayerRanged } from './playerRanged'

const SHORT_BOW = ITEM_CATALOG.short_bow.ranged!
const LONG_BOW = ITEM_CATALOG.long_bow.ranged!

describe('itemCatalog ranged config (plan 162)', () => {
  it('every bow has a positive damage/range/drawTime', () => {
    for (const kind of ['short_bow', 'hunting_bow', 'long_bow'] as const) {
      const config = ITEM_CATALOG[kind].ranged!
      expect(config.damage).toBeGreaterThan(0)
      expect(config.range).toBeGreaterThan(0)
      expect(config.drawTime).toBeGreaterThan(0)
      expect(config.ammoKinds.length).toBeGreaterThan(0)
    }
  })

  it('long_bow outranges and outdamages short_bow, at a slower draw', () => {
    expect(LONG_BOW.range).toBeGreaterThan(SHORT_BOW.range)
    expect(LONG_BOW.damage).toBeGreaterThan(SHORT_BOW.damage)
    expect(LONG_BOW.drawTime).toBeGreaterThan(SHORT_BOW.drawTime)
  })

  it('melee tools have no ranged config and bows have no melee config', () => {
    expect(ITEM_CATALOG.knife.ranged ?? null).toBeNull()
    expect(ITEM_CATALOG.short_bow.melee).toBeNull()
  })
})

describe('createPlayerRanged lifecycle', () => {
  it('rejects a draw request with insufficient stamina', () => {
    const ranged = createPlayerRanged()
    const stamina = createStaminaState(SHORT_BOW.staminaCost - 1)
    expect(ranged.requestDraw(SHORT_BOW, stamina)).toBe(false)
    expect(ranged.state()).toBe('idle')
  })

  it('drains stamina and enters draw on a successful request', () => {
    const ranged = createPlayerRanged()
    const stamina = createStaminaState(100)
    expect(ranged.requestDraw(SHORT_BOW, stamina)).toBe(true)
    expect(ranged.state()).toBe('draw')
    expect(stamina.current).toBe(100 - SHORT_BOW.staminaCost)
  })

  it('ignores a second request while already drawing', () => {
    const ranged = createPlayerRanged()
    const stamina = createStaminaState(100)
    ranged.requestDraw(SHORT_BOW, stamina)
    expect(ranged.requestDraw(SHORT_BOW, stamina)).toBe(false)
  })

  it('fires exactly once when draw completes, then recovers to idle', () => {
    const ranged = createPlayerRanged()
    const stamina = createStaminaState(100)
    ranged.requestDraw(SHORT_BOW, stamina)

    const beforeFire = ranged.update(SHORT_BOW.drawTime - 0.01)
    expect(beforeFire.fireReady).toBe(false)

    const fireTick = ranged.update(0.02)
    expect(fireTick.fireReady).toBe(true)
    expect(fireTick.config).toBe(SHORT_BOW)
    expect(ranged.state()).toBe('release')

    // A large dt after firing must not fire a second time.
    let refired = false
    let guard = 0
    while (ranged.state() !== 'idle' && guard < 50) {
      const tick = ranged.update(0.05)
      if (tick.fireReady) refired = true
      guard++
    }
    expect(refired).toBe(false)
    expect(ranged.state()).toBe('idle')
  })

  it('reset cancels an in-flight draw', () => {
    const ranged = createPlayerRanged()
    const stamina = createStaminaState(100)
    ranged.requestDraw(SHORT_BOW, stamina)
    ranged.reset()
    expect(ranged.state()).toBe('idle')
    expect(ranged.isDrawing()).toBe(false)
  })
})
