import { describe, expect, it } from 'vitest'
import type { ChunkMeshData } from './chunkMeshData'
import { createChunkMeshDataCache } from './chunkMeshCache'

function meshData(count: number): ChunkMeshData {
  return {
    positionY: new Float32Array(count),
    normal: new Float32Array(count * 3),
    color: new Float32Array(count * 3),
    bareGround: new Float32Array(count),
  }
}

describe('createChunkMeshDataCache', () => {
  it('returns a stored entry on a matching key', () => {
    const cache = createChunkMeshDataCache()
    const data = meshData(25)
    cache.set('a', data)
    expect(cache.get('a')).toBe(data)
  })

  it('misses on an unknown key', () => {
    const cache = createChunkMeshDataCache()
    expect(cache.get('missing')).toBeUndefined()
  })

  it('evicts the coldest entry once the byte budget is exceeded', () => {
    // Each entry is 4 * (25 + 75 + 75 + 25) = 800 bytes (Float32Array = 4
    // bytes/element); budget just over two entries' worth.
    const cache = createChunkMeshDataCache(1700)
    cache.set('a', meshData(25))
    cache.set('b', meshData(25))
    cache.set('c', meshData(25))
    // 'a' was coldest (never re-accessed) and should have been evicted first.
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBeDefined()
    expect(cache.get('c')).toBeDefined()
  })

  it('a `get` refreshes recency, protecting an entry from the next eviction', () => {
    const cache = createChunkMeshDataCache(1700)
    cache.set('a', meshData(25))
    cache.set('b', meshData(25))
    // Touch 'a' so 'b' becomes the coldest entry.
    cache.get('a')
    cache.set('c', meshData(25))
    expect(cache.get('a')).toBeDefined()
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('c')).toBeDefined()
  })

  it('clear() drops every entry and resets byte accounting', () => {
    const cache = createChunkMeshDataCache()
    cache.set('a', meshData(25))
    cache.clear()
    expect(cache.get('a')).toBeUndefined()
    expect(cache.size).toBe(0)
    expect(cache.bytes).toBe(0)
  })

  it('overwriting an existing key does not double-count its bytes', () => {
    const cache = createChunkMeshDataCache()
    cache.set('a', meshData(25))
    const before = cache.bytes
    cache.set('a', meshData(25))
    expect(cache.bytes).toBe(before)
    expect(cache.size).toBe(1)
  })
})
