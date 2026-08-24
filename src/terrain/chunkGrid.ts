export type ChunkCoord = { cx: number; cz: number }

export function chunkKey(coord: ChunkCoord): string {
  return `${coord.cx},${coord.cz}`
}

export function keyToCoord(key: string): ChunkCoord {
  const [cx, cz] = key.split(',').map(Number)
  return { cx: cx!, cz: cz! }
}

/** Which chunk a world position belongs to — chunks are centered on multiples of `chunkSize`. */
export function worldToChunk(x: number, z: number, chunkSize: number): ChunkCoord {
  return { cx: Math.round(x / chunkSize), cz: Math.round(z / chunkSize) }
}

export function chunkCenter(coord: ChunkCoord, chunkSize: number): { x: number; z: number } {
  return { x: coord.cx * chunkSize, z: coord.cz * chunkSize }
}

export function chebyshevDistance(a: ChunkCoord, b: ChunkCoord): number {
  return Math.max(Math.abs(a.cx - b.cx), Math.abs(a.cz - b.cz))
}

/** The 3×3 block of chunks centered on the chunk containing `(x, z)` — used
 *  wherever something needs its immediate terrain neighborhood generated
 *  before building on top of it (see `SettlementsManager.ensureLoaded`'s use,
 *  and `debug/npcDebugApi.ts`'s teleport wiring, which reuses this same
 *  helper instead of duplicating it). */
export function chunksNear(x: number, z: number, chunkSize: number): ChunkCoord[] {
  const center = worldToChunk(x, z, chunkSize)
  const coords: ChunkCoord[] = []
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) coords.push({ cx: center.cx + dx, cz: center.cz + dz })
  }
  return coords
}

export type RegionCoord = { rx: number; rz: number }

/** Groups chunks into fixed-size, world-space-aligned regions (plan 143) —
 *  a pure function of chunk coord, `Math.floor` so negative coords group
 *  correctly (e.g. cx -1..-3 with regionChunks 3 all map to rx -1). */
export function regionCoordOf(coord: ChunkCoord, regionChunks: number): RegionCoord {
  return { rx: Math.floor(coord.cx / regionChunks), rz: Math.floor(coord.cz / regionChunks) }
}

export function regionKey(coord: ChunkCoord, regionChunks: number): string {
  const { rx, rz } = regionCoordOf(coord, regionChunks)
  return `${rx},${rz}`
}
