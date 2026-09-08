import { Scene } from 'three'
import { describe, expect, it } from 'vitest'
import type { ChunkManager } from '../terrain/chunkManager'
import type { TerrainPreparationRecord } from '../terrain/terrainPreparation'
import { createTerrainPreparations } from './createTerrainPreparations'

const sampleHeight = (): number => 0

function fakeChunkManager(): ChunkManager {
  return { applyExactHeights: () => true } as unknown as ChunkManager
}

function makeRecord(overrides: Partial<TerrainPreparationRecord> = {}): TerrainPreparationRecord {
  return {
    id: 'terrainPrep:1',
    center: { x: 0, z: 0 },
    size: 2,
    targetHeight: 1,
    originalHeights: [{ x: 0, z: 0, height: 0 }],
    requiredWork: 4,
    completedWork: 0,
    status: 'active',
    ...overrides,
  }
}

describe('createTerrainPreparations.contributeWork (plan npc-018 §15)', () => {
  it('accepts the full amount when it fits within remaining work', () => {
    const preparations = createTerrainPreparations(new Scene(), fakeChunkManager(), sampleHeight)
    preparations.place(makeRecord())
    const result = preparations.contributeWork('terrainPrep:1', 1.5)
    expect(result).toEqual({ acceptedWork: 1.5, completed: false })
    expect(preparations.find('terrainPrep:1')?.completedWork).toBe(1.5)
  })

  it('clamps accepted work to the remaining amount and reports completion', () => {
    const preparations = createTerrainPreparations(new Scene(), fakeChunkManager(), sampleHeight)
    preparations.place(makeRecord({ completedWork: 3 }))
    const result = preparations.contributeWork('terrainPrep:1', 5)
    expect(result).toEqual({ acceptedWork: 1, completed: true })
    expect(preparations.find('terrainPrep:1')).toBeUndefined()
    expect(preparations.completed()).toEqual([{ id: 'terrainPrep:1', center: { x: 0, z: 0 }, size: 2 }])
  })

  it('reports zero accepted work once nothing remains, without erroring', () => {
    const preparations = createTerrainPreparations(new Scene(), fakeChunkManager(), sampleHeight)
    preparations.place(makeRecord({ completedWork: 4 }))
    const result = preparations.contributeWork('terrainPrep:1', 2)
    expect(result).toEqual({ acceptedWork: 0, completed: true })
  })

  it('returns null for an unknown id', () => {
    const preparations = createTerrainPreparations(new Scene(), fakeChunkManager(), sampleHeight)
    expect(preparations.contributeWork('nope', 1)).toBeNull()
  })
})

describe('createTerrainPreparations.completed (plan world-019)', () => {
  it('creates exactly one completed-area record and removes active state', () => {
    const preparations = createTerrainPreparations(new Scene(), fakeChunkManager(), sampleHeight)
    preparations.place(makeRecord())
    preparations.contributeWork('terrainPrep:1', 4)
    expect(preparations.find('terrainPrep:1')).toBeUndefined()
    expect(preparations.nodes()).toHaveLength(0)
    expect(preparations.completed()).toEqual([{ id: 'terrainPrep:1', center: { x: 0, z: 0 }, size: 2 }])
    expect(preparations.wasCompleted('terrainPrep:1')).toBe(true)
  })

  it('cannot double-complete from a repeated or concurrent final contribution', () => {
    const preparations = createTerrainPreparations(new Scene(), fakeChunkManager(), sampleHeight)
    preparations.place(makeRecord())
    expect(preparations.contributeWork('terrainPrep:1', 4)).toEqual({ acceptedWork: 4, completed: true })
    expect(preparations.contributeWork('terrainPrep:1', 4)).toEqual({ acceptedWork: 0, completed: true })
    expect(preparations.contributeWork('terrainPrep:1', 1)).toEqual({ acceptedWork: 0, completed: true })
    expect(preparations.completed()).toHaveLength(1)
  })

  it('player setCompletedWork and NPC contributeWork produce the same terminal state', () => {
    const viaPlayer = createTerrainPreparations(new Scene(), fakeChunkManager(), sampleHeight)
    viaPlayer.place(makeRecord({ id: 'prep:player' }))
    viaPlayer.setCompletedWork('prep:player', 4)

    const viaNpc = createTerrainPreparations(new Scene(), fakeChunkManager(), sampleHeight)
    viaNpc.place(makeRecord({ id: 'prep:npc' }))
    viaNpc.contributeWork('prep:npc', 4)

    expect(viaPlayer.find('prep:player')).toBeUndefined()
    expect(viaNpc.find('prep:npc')).toBeUndefined()
    expect(viaPlayer.completed()).toEqual([{ id: 'prep:player', center: { x: 0, z: 0 }, size: 2 }])
    expect(viaNpc.completed()).toEqual([{ id: 'prep:npc', center: { x: 0, z: 0 }, size: 2 }])
  })

  it('restores completed facts from save without reviving active work', () => {
    const preparations = createTerrainPreparations(
      new Scene(),
      fakeChunkManager(),
      sampleHeight,
      [],
      [{ id: 'terrainPrep:old', center: { x: 8, z: -2 }, size: 6 }],
    )
    expect(preparations.nodes()).toHaveLength(0)
    expect(preparations.wasCompleted('terrainPrep:old')).toBe(true)
    expect(preparations.completed()[0]).toEqual({ id: 'terrainPrep:old', center: { x: 8, z: -2 }, size: 6 })
  })
})

describe('createTerrainPreparations.wasCompleted (plan npc-018 §16)', () => {
  it('is false before requiredWork is reached', () => {
    const preparations = createTerrainPreparations(new Scene(), fakeChunkManager(), sampleHeight)
    preparations.place(makeRecord())
    preparations.contributeWork('terrainPrep:1', 1)
    expect(preparations.wasCompleted('terrainPrep:1')).toBe(false)
  })

  it('stays true even after the record is removed — the only way to tell "completed" from "invalidated"', () => {
    const preparations = createTerrainPreparations(new Scene(), fakeChunkManager(), sampleHeight)
    preparations.place(makeRecord())
    preparations.contributeWork('terrainPrep:1', 4)
    expect(preparations.wasCompleted('terrainPrep:1')).toBe(true)
    preparations.remove('terrainPrep:1')
    expect(preparations.find('terrainPrep:1')).toBeUndefined()
    expect(preparations.wasCompleted('terrainPrep:1')).toBe(true)
  })

  it('is false for a target that was removed without ever completing (invalidation)', () => {
    const preparations = createTerrainPreparations(new Scene(), fakeChunkManager(), sampleHeight)
    preparations.place(makeRecord())
    preparations.contributeWork('terrainPrep:1', 1)
    preparations.remove('terrainPrep:1')
    expect(preparations.wasCompleted('terrainPrep:1')).toBe(false)
  })

  it('setCompletedWork also marks completion (the player-driven path)', () => {
    const preparations = createTerrainPreparations(new Scene(), fakeChunkManager(), sampleHeight)
    preparations.place(makeRecord())
    preparations.setCompletedWork('terrainPrep:1', 4)
    expect(preparations.wasCompleted('terrainPrep:1')).toBe(true)
  })
})
