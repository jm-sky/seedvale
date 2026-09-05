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
    expect(preparations.find('terrainPrep:1')?.completedWork).toBe(4)
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
