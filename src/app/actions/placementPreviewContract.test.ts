import { describe, expect, it } from 'vitest'
import { type GroundPlacementDefinition, previewGroundPlacement } from './placementActions'

describe('previewGroundPlacement', () => {
  it('copies the presentational footprint independently of clearance radius', () => {
    const def: GroundPlacementDefinition<'ok' | 'no'> = {
      aim: () => ({ x: 3, z: 4, yaw: 0.25 }),
      evaluate: () => 'ok',
      footprintRadius: 0.3,
      previewFootprint: { kind: 'box', width: 2.2, depth: 0.6 },
      reasonLabel: () => 'no',
    }
    expect(previewGroundPlacement(def)).toEqual({
      x: 3,
      z: 4,
      yaw: 0.25,
      footprintRadius: 0.3,
      footprint: { kind: 'box', width: 2.2, depth: 0.6 },
      valid: true,
      reasonLabel: '',
      state: 'ready',
      canConfirm: true,
      confirmKind: 'place',
      requirements: [],
    })
  })
})
