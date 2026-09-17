import { describe, expect, it } from 'vitest'
import { SKILL_AIM_SCREEN_RADIUS, pickInteractableNearScreen } from './skillAimPick'
import type { PerspectiveCamera } from 'three'

describe('pickInteractableNearScreen', () => {
  it('returns null for an empty candidate list', () => {
    expect(pickInteractableNearScreen(
      [],
      { x: 0, z: 0 },
      {} as PerspectiveCamera,
      { x: 0.5, y: 0.5 },
      10,
    )).toBeNull()
  })

  it('exports a bounded screen radius', () => {
    expect(SKILL_AIM_SCREEN_RADIUS).toBeGreaterThan(0)
    expect(SKILL_AIM_SCREEN_RADIUS).toBeLessThan(0.5)
  })
})
