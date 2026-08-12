import { describe, expect, it } from 'vitest'
import { createWell } from './props'
import {
  buildWellInteractionQueueConfig,
  WELL_QUEUE_SERVING_OFFSET_ANCHOR,
  WELL_QUEUE_SERVING_OFFSET_FALLBACK,
} from './wellInteractionQueue'

describe('buildWellInteractionQueueConfig', () => {
  const rest = {
    spacing: 1.2,
    maxVisibleSlots: 8,
    servingCapacity: 1,
  }

  it('uses rim anchor metadata on the procedural well', () => {
    const well = createWell()
    well.position.set(10, 2, 20)
    well.updateMatrixWorld(true)

    const cfg = buildWellInteractionQueueConfig(
      well,
      { x: 10, y: 2, z: 20 },
      rest,
    )

    expect(cfg.servingOffset).toBe(WELL_QUEUE_SERVING_OFFSET_ANCHOR)
    expect(cfg.anchor.z).toBeCloseTo(20.85, 2)
    expect(cfg.anchor.y).toBeCloseTo(2.72, 2)
    expect(cfg.lineDir).toEqual({ x: 0, z: 1 })
  })

  it('keeps the same south serving distance as the legacy plaza-center queue', () => {
    const well = createWell()
    well.position.set(10, 2, 20)
    well.updateMatrixWorld(true)

    const cfg = buildWellInteractionQueueConfig(
      well,
      { x: 10, y: 2, z: 20 },
      rest,
    )

    const servingZ = cfg.anchor.z + cfg.servingOffset * cfg.lineDir.z
    expect(servingZ).toBeCloseTo(20 + WELL_QUEUE_SERVING_OFFSET_FALLBACK, 2)
  })
})
