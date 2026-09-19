import { describe, expect, it } from 'vitest'
import type { ItemKind } from '../items/items'
import { nearestWorldChunkItems, type WorldChunkItemRef } from './chunkWorldItems'

const KINDS = new Set<ItemKind>(['herb', 'mint'])
const CHUNK_SIZE = 16
const noOffscreen = (): readonly WorldChunkItemRef[] => []

describe('nearestWorldChunkItems', () => {
  it('returns loaded candidates nearest-first', () => {
    const loaded: WorldChunkItemRef[] = [
      { id: 'b', kind: 'herb', x: 8, z: 0 },
      { id: 'a', kind: 'herb', x: 2, z: 0 },
      { id: 'c', kind: 'herb', x: 5, z: 0 },
    ]
    const result = nearestWorldChunkItems(0, 0, 60, KINDS, CHUNK_SIZE, loaded, noOffscreen, 0, 5)
    expect(result.map((r) => r.id)).toEqual(['a', 'c', 'b'])
  })

  it('breaks an exact distance tie by ascending id, never by input order', () => {
    const loaded: WorldChunkItemRef[] = [
      { id: 'z', kind: 'herb', x: 2, z: 0 },
      { id: 'a', kind: 'herb', x: 2, z: 0 },
    ]
    const result = nearestWorldChunkItems(0, 0, 60, KINDS, CHUNK_SIZE, loaded, noOffscreen, 0, 5)
    expect(result.map((r) => r.id)).toEqual(['a', 'z'])
  })

  it('caps the result at the requested limit', () => {
    const loaded: WorldChunkItemRef[] = Array.from({ length: 10 }, (_, i) => ({
      id: `i${i}`,
      kind: 'herb' as const,
      x: i + 1,
      z: 0,
    }))
    const result = nearestWorldChunkItems(0, 0, 60, KINDS, CHUNK_SIZE, loaded, noOffscreen, 0, 3)
    expect(result).toHaveLength(3)
    expect(result.map((r) => r.id)).toEqual(['i0', 'i1', 'i2'])
  })

  it('excludes candidates outside the radius', () => {
    const loaded: WorldChunkItemRef[] = [
      { id: 'near', kind: 'herb', x: 1, z: 0 },
      { id: 'far', kind: 'herb', x: 100, z: 0 },
    ]
    const result = nearestWorldChunkItems(0, 0, 10, KINDS, CHUNK_SIZE, loaded, noOffscreen, 0, 5)
    expect(result.map((r) => r.id)).toEqual(['near'])
  })

  it('excludes kinds not in the requested set', () => {
    const loaded: WorldChunkItemRef[] = [
      { id: 'wood', kind: 'branch' as ItemKind, x: 1, z: 0 },
      { id: 'herb', kind: 'herb', x: 2, z: 0 },
    ]
    const result = nearestWorldChunkItems(0, 0, 60, KINDS, CHUNK_SIZE, loaded, noOffscreen, 0, 5)
    expect(result.map((r) => r.id)).toEqual(['herb'])
  })

  it('merges deterministic off-screen (procedural) placements with loaded ones, deduplicated by id', () => {
    const loaded: WorldChunkItemRef[] = [{ id: 'loaded-1', kind: 'herb', x: 1, z: 0 }]
    const resolveChunk = (): readonly WorldChunkItemRef[] => [
      { id: 'loaded-1', kind: 'herb', x: 1, z: 0 },
      { id: 'offscreen-1', kind: 'mint', x: 3, z: 0 },
    ]
    const result = nearestWorldChunkItems(0, 0, 60, KINDS, CHUNK_SIZE, loaded, resolveChunk, 3, 5)
    expect(result.map((r) => r.id)).toEqual(['loaded-1', 'offscreen-1'])
  })
})
