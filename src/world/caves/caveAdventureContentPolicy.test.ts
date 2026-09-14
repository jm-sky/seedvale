/** Plan world-terrain-028 — adventure content profile roll + reservation tests. */

import { describe, expect, it } from 'vitest'
import type { CaveContentAnchor } from './caveContentAnchors'
import {
  DOUBLE_TREASURE_PROFILE_THRESHOLD,
  resolveCaveAdventureContentPolicy,
} from './caveAdventureContentPolicy'
import { CAVE_RNG_SALT, createCaveRandom } from './caveRng'

function anchor(caveId: string, id: string): CaveContentAnchor {
  return {
    id,
    caveId,
    role: 'sideTreasure',
    x: 0,
    y: -1,
    z: 0,
    yaw: 0,
  }
}

describe('resolveCaveAdventureContentPolicy (plan world-terrain-028)', () => {
  it('rolls DOUBLE_TREASURE on the dedicated profile RNG stream at the 20% threshold', () => {
    const caveId = 'cave:profile-threshold'
    const random = createCaveRandom(caveId, CAVE_RNG_SALT.adventureContentProfile)
    const roll = random()
    const policy = resolveCaveAdventureContentPolicy([caveId], [])
    const expected = roll < DOUBLE_TREASURE_PROFILE_THRESHOLD ? 'DOUBLE_TREASURE' : 'EMPTY'
    expect(policy.profileOf(caveId)).toBe(expected)
  })

  it('does not consume adventureContent RNG for profile rolls', () => {
    const caveId = 'cave:stream-isolation'
    const contentBefore = createCaveRandom(caveId, CAVE_RNG_SALT.adventureContent)()
    resolveCaveAdventureContentPolicy([caveId], [])
    const contentAfter = createCaveRandom(caveId, CAVE_RNG_SALT.adventureContent)()
    expect(contentAfter).toBe(contentBefore)
  })

  it('applies authored profile reservations before the generic roll', () => {
    const caveId = 'cave:reserved-empty'
    const policy = resolveCaveAdventureContentPolicy([caveId], [], {
      profileReservations: [{ reservationKey: 'quest-025', caveId, profile: 'EMPTY' }],
    })
    expect(policy.profileOf(caveId)).toBe('EMPTY')
  })

  it('rejects duplicate profile reservations on the same cave', () => {
    const caveId = 'cave:conflict'
    const policy = resolveCaveAdventureContentPolicy([caveId], [], {
      profileReservations: [
        { reservationKey: 'a', caveId, profile: 'EMPTY' },
        { reservationKey: 'b', caveId, profile: 'QUEST_TREASURE' },
      ],
    })
    expect(policy.profileOf(caveId)).toBe('EMPTY')
    expect(policy.unresolved).toEqual([{ reservationKey: 'b', reason: 'profile_conflict' }])
  })

  it('fails duplicate anchor claims explicitly', () => {
    const caveId = 'cave:adv'
    const anchorId = `${caveId}:sideTreasure`
    const anchors = [anchor(caveId, anchorId)]
    const policy = resolveCaveAdventureContentPolicy([caveId], anchors, {
      anchorClaims: [
        { reservationKey: 'first', anchorId },
        { reservationKey: 'second', anchorId },
      ],
    })
    expect(policy.claimOf('first')?.anchorId).toBe(anchorId)
    expect(policy.unresolved).toEqual([{ reservationKey: 'second', reason: 'anchor_already_claimed' }])
  })

  it('reconstructs the same profiles for the same cave ids without save data', () => {
    const ids = ['cave:a', 'cave:b', 'cave:c'].sort()
    const first = resolveCaveAdventureContentPolicy(ids, [])
    const second = resolveCaveAdventureContentPolicy(ids, [])
    for (const id of ids) {
      expect(second.profileOf(id)).toBe(first.profileOf(id))
    }
  })

  it('accepts dungeon loot and sideTreasure anchor claims without adventure membership', () => {
    const caveId = 'cave:dungeon-1'
    const lootId = `${caveId}:loot:deep`
    const sideId = `${caveId}:sideTreasure:side-a`
    const anchors: CaveContentAnchor[] = [
      { ...anchor(caveId, sideId), role: 'sideTreasure' },
      { ...anchor(caveId, lootId), role: 'loot' },
    ]
    const policy = resolveCaveAdventureContentPolicy([], anchors, {
      anchorClaims: [
        { reservationKey: 'quests-progression-026:side:' + sideId, anchorId: sideId },
        { reservationKey: 'quests-progression-026:deep', anchorId: lootId },
      ],
    })
    expect(policy.claimOf('quests-progression-026:deep')).toEqual({
      reservationKey: 'quests-progression-026:deep',
      anchorId: lootId,
      caveId,
    })
    expect(policy.claimOf('quests-progression-026:side:' + sideId)?.anchorId).toBe(sideId)
    expect(policy.profileOf(caveId)).toBeUndefined()
    expect(policy.unresolved).toEqual([])
  })

  it('allows 026 deep/side claims to coexist with a disjoint 027 finalTreasure claim', () => {
    const caveId = 'cave:shared-dungeon'
    const lootId = `${caveId}:loot:deep`
    const sideId = `${caveId}:sideTreasure:side-a`
    const finalId = `${caveId}:finalTreasure`
    const anchors: CaveContentAnchor[] = [
      { ...anchor(caveId, sideId), role: 'sideTreasure' },
      { ...anchor(caveId, lootId), role: 'loot' },
      { ...anchor(caveId, finalId), role: 'finalTreasure' },
    ]
    const policy = resolveCaveAdventureContentPolicy([], anchors, {
      anchorClaims: [
        { reservationKey: 'quests-progression-026:deep', anchorId: lootId },
        { reservationKey: 'quests-progression-026:side:' + sideId, anchorId: sideId },
        { reservationKey: 'quests-progression-027:final', anchorId: finalId },
      ],
    })
    expect(policy.claimOf('quests-progression-026:deep')?.anchorId).toBe(lootId)
    expect(policy.claimOf('quests-progression-026:side:' + sideId)?.anchorId).toBe(sideId)
    expect(policy.claimOf('quests-progression-027:final')?.anchorId).toBe(finalId)
    expect(policy.unresolved).toEqual([])
  })
})
