import { describe, expect, it } from 'vitest'
import type { NpcAccompanyCommitment } from './npcAccompanyCommitment'
import {
  NPC_ACCOMPANY_FOLLOW_START_DISTANCE,
  NPC_ACCOMPANY_FOLLOW_STOP_DISTANCE,
  resolveNpcAccompanyMovement,
  shouldRetargetFollowDestination,
} from './npcAccompanyExecution'

function followCommitment(): NpcAccompanyCommitment {
  return {
    target: { kind: 'player' },
    source: { kind: 'voluntary' },
    mode: 'follow',
    startedAtDays: 1,
  }
}

function stayCommitment(anchor = { x: 5, y: 0, z: 0 }): NpcAccompanyCommitment {
  return {
    target: { kind: 'player' },
    source: { kind: 'voluntary' },
    mode: 'stay',
    stayAnchor: anchor,
    startedAtDays: 1,
  }
}

describe('resolveNpcAccompanyMovement', () => {
  it('uses hysteresis so follow does not start/stop jitter around the band', () => {
    const hysteresis = {}
    const npc = { x: 0, z: 0 }
    expect(resolveNpcAccompanyMovement(
      followCommitment(),
      hysteresis,
      npc,
      { x: NPC_ACCOMPANY_FOLLOW_START_DISTANCE - 1, z: 0 },
    ).kind).toBe('hold')
    expect(resolveNpcAccompanyMovement(
      followCommitment(),
      hysteresis,
      npc,
      { x: NPC_ACCOMPANY_FOLLOW_START_DISTANCE + 1, z: 0 },
    )).toEqual({ kind: 'follow', x: NPC_ACCOMPANY_FOLLOW_START_DISTANCE + 1, z: 0 })
    const mid = (NPC_ACCOMPANY_FOLLOW_START_DISTANCE + NPC_ACCOMPANY_FOLLOW_STOP_DISTANCE) / 2
    expect(resolveNpcAccompanyMovement(followCommitment(), hysteresis, npc, { x: mid, z: 0 }).kind)
      .toBe('follow')
    expect(resolveNpcAccompanyMovement(
      followCommitment(),
      hysteresis,
      npc,
      { x: NPC_ACCOMPANY_FOLLOW_STOP_DISTANCE - 0.5, z: 0 },
    ).kind).toBe('hold')
  })

  it('stay walks back to the recorded anchor and never chases the player', () => {
    const hysteresis = {}
    expect(resolveNpcAccompanyMovement(
      stayCommitment({ x: 8, y: 0, z: 0 }),
      hysteresis,
      { x: 0, z: 0 },
      { x: 100, z: 0 },
    )).toEqual({ kind: 'follow', x: 8, z: 0 })
    expect(resolveNpcAccompanyMovement(
      stayCommitment({ x: 0.2, y: 0, z: 0 }),
      hysteresis,
      { x: 0, z: 0 },
      { x: 100, z: 0 },
    )).toEqual({ kind: 'hold', x: 0.2, z: 0 })
  })

  it('holds in place when the player is missing instead of abandoning', () => {
    expect(resolveNpcAccompanyMovement(followCommitment(), {}, { x: 3, z: 4 }, null))
      .toEqual({ kind: 'hold', x: 3, z: 4 })
    expect(resolveNpcAccompanyMovement(null, {}, { x: 0, z: 0 }, { x: 20, z: 0 }).kind).toBe('none')
  })

  it('retargets only after the player has moved far enough', () => {
    expect(shouldRetargetFollowDestination({ x: 0, z: 0 }, { x: 1.5, z: 0 })).toBe(false)
    expect(shouldRetargetFollowDestination({ x: 0, z: 0 }, { x: 2.5, z: 0 })).toBe(true)
  })
})
