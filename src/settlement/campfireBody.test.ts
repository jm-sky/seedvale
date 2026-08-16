import { describe, expect, it } from 'vitest'
import { createCampfire, createCampfireFlame, createSimpleFireBase } from './props'

describe('campfire body fallback (no GLB preload)', () => {
  it('pit has a stone ring plus wood, simple is a smaller pile', () => {
    const pit = createCampfire()
    const simple = createSimpleFireBase()
    // ash + 8 stones + 3 branches vs ash + 2 branches
    expect(pit.children.length).toBe(12)
    expect(simple.children.length).toBe(3)
  })

  it('procedural flame starts hidden and exposes igniteBurst', () => {
    const flame = createCampfireFlame()
    expect(flame.object.visible).toBe(false)
    expect(typeof flame.igniteBurst).toBe('function')
    flame.setIntensity(0)
    flame.setSize(1)
    flame.update(0.016)
  })
})
