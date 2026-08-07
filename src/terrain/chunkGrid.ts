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
