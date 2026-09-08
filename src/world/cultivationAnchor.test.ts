import { describe, expect, it } from 'vitest'
import { gardenClearingRadius } from '../settlement/gardenScale'
import {
  cultivationAnchorFromPlayerGarden,
  cultivationAnchorFromSettlementGarden,
  resolveCultivationAnchor,
} from './cultivationAnchor'
import { PLAYER_GARDEN_PLANT_RADIUS } from './playerGarden'

describe('CultivationAnchor (plan world-019)', () => {
  it('represents a settlement garden with its actual clearing radius', () => {
    expect(cultivationAnchorFromSettlementGarden({ x: 3, z: 4 }, 'L')).toEqual({
      position: { x: 3, z: 4 },
      radius: gardenClearingRadius('L'),
    })
  })

  it('represents a Player garden through the same contract', () => {
    expect(cultivationAnchorFromPlayerGarden({ x: 10, z: 12 })).toEqual({
      position: { x: 10, z: 12 },
      radius: PLAYER_GARDEN_PLANT_RADIUS,
    })
  })

  it('prefers a supplied Player-garden anchor over settlement landmarks', () => {
    const supplied = cultivationAnchorFromPlayerGarden({ x: 40, z: 50 })
    const resolved = resolveCultivationAnchor({
      supplied,
      settlementAnchors: [cultivationAnchorFromSettlementGarden({ x: 1, z: 1 }, 'M')],
      fallbackGarden: { x: 1, z: 1 },
    })
    expect(resolved).toEqual(supplied)
  })
})
