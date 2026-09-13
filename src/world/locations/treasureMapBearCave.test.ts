import { describe, expect, it } from 'vitest'
import type { CaveContentAnchor } from '../caves/caveContentAnchors'
import { resolveCaveAdventureContentPolicy } from '../caves/caveAdventureContentPolicy'
import { caveTreasureContainerSpecs } from '../../app/worldBundle'
import {
  resolveTreasureMapBearCaveBinding,
  treasureMapBearCaveProfileReservation,
  treasureMapBearCaveReturnPayout,
  treasureMapBearCaveSourceContainerSpec,
  TREASURE_MAP_BEAR_CAVE_COINS,
  TREASURE_MAP_BEAR_CAVE_RESERVATION_KEY,
} from './treasureMapBearCave'

function anchor(caveId: string, role: CaveContentAnchor['role'], id: string): CaveContentAnchor {
  return { id, caveId, role, x: 1, y: -2, z: 3, yaw: 0 }
}

describe('resolveTreasureMapBearCaveBinding', () => {
  it('is deterministic and reserves QUEST_TREASURE over generic loot', () => {
    const caves = [
      { caveId: 'cave:a', entranceX: 200, entranceZ: 50 },
      { caveId: 'cave:b', entranceX: 220, entranceZ: 80 },
    ]
    const anchors = [
      anchor('cave:a', 'sideTreasure', 'cave:a:sideTreasure'),
      anchor('cave:a', 'finalTreasure', 'cave:a:finalTreasure'),
      anchor('cave:b', 'sideTreasure', 'cave:b:sideTreasure'),
      anchor('cave:b', 'finalTreasure', 'cave:b:finalTreasure'),
    ]
    const cemetery = {
      id: 'cemetery:home',
      x: 10,
      z: 10,
      rotationY: 0,
      scale: 1,
      cemeterySize: 'SM' as const,
    }
    const input = { seed: 42, homeX: 0, homeZ: 0, adventureCaves: caves, contentAnchors: anchors, cemetery }
    const a = resolveTreasureMapBearCaveBinding(input)
    const b = resolveTreasureMapBearCaveBinding(input)
    expect(a).toEqual(b)
    expect(a?.reservationKey).toBe(TREASURE_MAP_BEAR_CAVE_RESERVATION_KEY)

    const policy = resolveCaveAdventureContentPolicy(
      ['cave:a', 'cave:b'],
      anchors,
      { profileReservations: a ? [treasureMapBearCaveProfileReservation(a)] : [] },
    )
    expect(policy.profileOf(a!.caveId)).toBe('QUEST_TREASURE')
    const genericSpecs = caveTreasureContainerSpecs(anchors, 42, policy)
    expect(genericSpecs.some((s) => s.id.includes(a!.caveId))).toBe(false)

    const final = anchors.find((entry) => entry.id === a!.finalTreasureAnchorId)!
    const source = treasureMapBearCaveSourceContainerSpec(a!, final)
    expect(source.initialCounts).toEqual({})
    expect(source.y).toBe(final.y)
  })

  it('uses one coin tuning source for full treasure and the 30% hand-in', () => {
    expect(treasureMapBearCaveReturnPayout(TREASURE_MAP_BEAR_CAVE_COINS)).toBe(Math.floor(TREASURE_MAP_BEAR_CAVE_COINS * 0.30))
  })
})
