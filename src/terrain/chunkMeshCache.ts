import type { ChunkMeshData } from './chunkMeshData'

/** Bounded, byte-budgeted runtime cache of already-computed `ChunkMeshData`
 *  (plan world-terrain-004 — never `THREE.BufferGeometry`/`THREE.Mesh`,
 *  whose lifecycle stays owned by `ChunkRecord.meshDispose`/`unload()`).
 *  Not persisted — first-session cache only, cleared on `dispose()`.
 *
 *  There is no existing generic bounded/LRU cache abstraction in the terrain
 *  code to reuse (`riverTileCache` is domain-specific and reference-counted),
 *  so this is a small standalone `Map`-based LRU keyed by insertion order:
 *  a `get` re-inserts its entry to mark it most-recently-used, and `set`
 *  evicts the oldest entries once the byte budget is exceeded. */
export type ChunkMeshDataCache = {
  get(key: string): ChunkMeshData | undefined
  set(key: string, data: ChunkMeshData): void
  clear(): void
  readonly size: number
  readonly bytes: number
}

function byteSizeOf(data: ChunkMeshData): number {
  return (
    data.positionY.byteLength +
    data.normal.byteLength +
    data.color.byteLength +
    data.bareGround.byteLength
  )
}

/** Default budget — generous enough to hold several hundred resolution-193
 *  chunks' mesh data (~180 KB each) without holding the whole streamed world
 *  in memory indefinitely. */
export const DEFAULT_MESH_CACHE_BUDGET_BYTES = 64 * 1024 * 1024

export function createChunkMeshDataCache(
  maxBytes = DEFAULT_MESH_CACHE_BUDGET_BYTES,
): ChunkMeshDataCache {
  const entries = new Map<string, { data: ChunkMeshData, bytes: number }>()
  let totalBytes = 0

  function evictToFit(): void {
    while (totalBytes > maxBytes && entries.size > 0) {
      const oldestKey = entries.keys().next().value as string
      const oldest = entries.get(oldestKey)!
      entries.delete(oldestKey)
      totalBytes -= oldest.bytes
    }
  }

  function get(key: string): ChunkMeshData | undefined {
    const entry = entries.get(key)
    if (!entry) return undefined
    // Re-insert to move this key to the "most recently used" end (`Map`
    // iterates in insertion order), so `evictToFit` drops the coldest entry.
    entries.delete(key)
    entries.set(key, entry)
    return entry.data
  }

  function set(key: string, data: ChunkMeshData): void {
    const existing = entries.get(key)
    if (existing) {
      totalBytes -= existing.bytes
      entries.delete(key)
    }
    const bytes = byteSizeOf(data)
    entries.set(key, { data, bytes })
    totalBytes += bytes
    evictToFit()
  }

  function clear(): void {
    entries.clear()
    totalBytes = 0
  }

  return {
    get,
    set,
    clear,
    get size() {
      return entries.size
    },
    get bytes() {
      return totalBytes
    },
  }
}
