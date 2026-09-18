import { Object3D } from 'three'
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

  it('resolves the same anchor from a bare transform-only Object3D as from the full render mesh (plan settlements-019)', () => {
    // `buildSettlementProps` now passes `wellTemplate.clone(false)` — a
    // childless transform carrier — instead of a full render clone, so the
    // drink queue never depends on the InstancedMesh render batch. The
    // `settlement:well` anchor is `space: 'assetLocal'`, resolved purely from
    // the root's own world matrix, so a mesh-less root must produce an
    // identical anchor to the fully-meshed one.
    const meshedWell = createWell()
    meshedWell.position.set(10, 2, 20)
    meshedWell.updateMatrixWorld(true)

    const bareWell = new Object3D()
    bareWell.position.set(10, 2, 20)
    bareWell.updateMatrixWorld(true)
    expect(bareWell.children.length).toBe(0)

    const meshedCfg = buildWellInteractionQueueConfig(meshedWell, { x: 10, y: 2, z: 20 }, rest)
    const bareCfg = buildWellInteractionQueueConfig(bareWell, { x: 10, y: 2, z: 20 }, rest)

    expect(bareCfg.anchor).toEqual(meshedCfg.anchor)
    expect(bareCfg.lineDir).toEqual(meshedCfg.lineDir)
    expect(bareCfg.servingOffset).toBe(meshedCfg.servingOffset)
  })
})
