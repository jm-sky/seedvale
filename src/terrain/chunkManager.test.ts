import { describe, expect, it } from 'vitest'
import type { ChunkTileResult } from './chunkHeightmapProtocol'
import { apronOriginWorld } from './chunkHeightmap'
import { applyModificationToTile, pickNearestQueuedKey, pickNextFinalizeKey, type TerrainModification } from './chunkManager'

// Small grid so texel math is easy to reason about by hand: resolution 5,
// chunkSize 32 -> step 8, apronRes 7 (world x/z per texel: -24,-16,-8,0,8,16,24
// for the cx=0 chunk).
const CHUNK_SIZE = 32
const RESOLUTION = 5

function fakeTile(apronRes: number, fill = 10): ChunkTileResult {
  return { heights: new Float32Array(apronRes * apronRes).fill(fill) } as unknown as ChunkTileResult
}

function heightAtWorld(tile: ChunkTileResult, cx: number, cz: number, wx: number, wz: number): number {
  const o = apronOriginWorld(cx, cz, CHUNK_SIZE, RESOLUTION)
  const ix = Math.round((wx - o.x) / o.step)
  const iz = Math.round((wz - o.z) / o.step)
  return tile.heights[iz * o.apronRes + ix]!
}

describe('applyModificationToTile', () => {
  it('lowers the center by approximately depth', () => {
    const tile = fakeTile(7)
    const mod: TerrainModification = { x: 0, z: 0, radius: 10, depth: 1, mode: 'dig' }
    applyModificationToTile(tile, { cx: 0, cz: 0 }, CHUNK_SIZE, RESOLUTION, mod)
    expect(heightAtWorld(tile, 0, 0, 0, 0)).toBeCloseTo(10 - 1, 5)
  })

  it('leaves height unchanged at/beyond the radius', () => {
    const tile = fakeTile(7)
    const mod: TerrainModification = { x: 0, z: 0, radius: 10, depth: 1, mode: 'dig' }
    applyModificationToTile(tile, { cx: 0, cz: 0 }, CHUNK_SIZE, RESOLUTION, mod)
    // world x=24 is 24 world units from the center, well outside radius 10.
    expect(heightAtWorld(tile, 0, 0, 24, 0)).toBe(10)
  })

  it('transitions smoothly, not as a hard step', () => {
    const tile = fakeTile(7)
    const mod: TerrainModification = { x: 0, z: 0, radius: 10, depth: 1, mode: 'dig' }
    applyModificationToTile(tile, { cx: 0, cz: 0 }, CHUNK_SIZE, RESOLUTION, mod)
    // world x=8 is inside the radius but off-center — should be lowered less
    // than the center, not by the full depth and not by zero.
    const mid = heightAtWorld(tile, 0, 0, 8, 0)
    expect(mid).toBeLessThan(10)
    expect(mid).toBeGreaterThan(10 - 1)
  })

  it('is additive across two nearby digs', () => {
    const tile = fakeTile(7)
    const mod: TerrainModification = { x: 0, z: 0, radius: 10, depth: 1, mode: 'dig' }
    applyModificationToTile(tile, { cx: 0, cz: 0 }, CHUNK_SIZE, RESOLUTION, mod)
    const afterOne = heightAtWorld(tile, 0, 0, 0, 0)
    applyModificationToTile(tile, { cx: 0, cz: 0 }, CHUNK_SIZE, RESOLUTION, mod)
    const afterTwo = heightAtWorld(tile, 0, 0, 0, 0)
    expect(afterTwo).toBeCloseTo(afterOne - 1, 5)
  })

  it('leaves the base procedural height (a fresh tile) untouched when no modification exists', () => {
    const tile = fakeTile(7)
    expect(heightAtWorld(tile, 0, 0, 0, 0)).toBe(10)
  })

  it('returns false and touches nothing when the modification is entirely outside this chunk', () => {
    const tile = fakeTile(7)
    // Chunk cx=0 covers world x in [-24, 24]; a dig centered far to the east
    // with a small radius never overlaps it.
    const mod: TerrainModification = { x: 500, z: 500, radius: 5, depth: 1, mode: 'dig' }
    const touched = applyModificationToTile(tile, { cx: 0, cz: 0 }, CHUNK_SIZE, RESOLUTION, mod)
    expect(touched).toBe(false)
    expect(heightAtWorld(tile, 0, 0, 0, 0)).toBe(10)
  })

  it('applies the identical delta on both sides of a chunk boundary (no seam crack)', () => {
    // cx=0 spans world x [-24, 24] (apron-inclusive); cx=1 spans [8, 56] —
    // world x=24 is a shared apron texel between them. A dig centered near
    // that boundary must lower both chunks' copies of that texel identically.
    const tileA = fakeTile(7)
    const tileB = fakeTile(7)
    const mod: TerrainModification = { x: 20, z: 0, radius: 10, depth: 1, mode: 'dig' }
    applyModificationToTile(tileA, { cx: 0, cz: 0 }, CHUNK_SIZE, RESOLUTION, mod)
    applyModificationToTile(tileB, { cx: 1, cz: 0 }, CHUNK_SIZE, RESOLUTION, mod)
    expect(heightAtWorld(tileA, 0, 0, 24, 0)).toBeCloseTo(heightAtWorld(tileB, 1, 0, 24, 0), 5)
  })

  it('raises toward base on level and never exceeds it', () => {
    const tile = fakeTile(7, 9)
    const mod: TerrainModification = { x: 0, z: 0, radius: 10, depth: 2, mode: 'level' }
    applyModificationToTile(tile, { cx: 0, cz: 0 }, CHUNK_SIZE, RESOLUTION, mod, () => 10)
    expect(heightAtWorld(tile, 0, 0, 0, 0)).toBeCloseTo(10, 5)
  })

  it('does not raise when already at base', () => {
    const tile = fakeTile(7, 10)
    const mod: TerrainModification = { x: 0, z: 0, radius: 10, depth: 2, mode: 'level' }
    const touched = applyModificationToTile(tile, { cx: 0, cz: 0 }, CHUNK_SIZE, RESOLUTION, mod, () => 10)
    expect(touched).toBe(false)
    expect(heightAtWorld(tile, 0, 0, 0, 0)).toBe(10)
  })
})

describe('pickNearestQueuedKey', () => {
  it('picks the nearest valid key and skips stale ones', () => {
    const dist: Record<string, number | null> = { a: 3, b: null, c: 1, d: 2 }
    expect(pickNearestQueuedKey(['a', 'b', 'c', 'd'], (k) => dist[k] ?? null)).toBe('c')
  })

  it('keeps queue order when distances are equal', () => {
    expect(pickNearestQueuedKey(['far-old', 'far-new'], () => 4)).toBe('far-old')
  })

  it('returns undefined when every key is stale', () => {
    expect(pickNearestQueuedKey(['a', 'b'], () => null)).toBeUndefined()
  })
})

describe('pickNextFinalizeKey', () => {
  const distOf = (dist: Record<string, number | null>) => (k: string) => dist[k] ?? null

  it('prefers a mesh job over closer content', () => {
    const jobs = [
      { key: 'content-near', stage: 'content' as const },
      { key: 'mesh-far', stage: 'mesh' as const },
    ]
    expect(
      pickNextFinalizeKey(jobs, distOf({ 'content-near': 0, 'mesh-far': 3 }), () => true),
    ).toBe('mesh-far')
  })

  it('picks the nearest content when no mesh jobs remain', () => {
    const jobs = [
      { key: 'far', stage: 'content' as const },
      { key: 'near', stage: 'content' as const },
    ]
    expect(pickNextFinalizeKey(jobs, distOf({ far: 4, near: 1 }), () => true)).toBe('near')
  })

  it('skips content that cannot run so blocked jobs stay queued', () => {
    const jobs = [
      { key: 'blocked-near', stage: 'content' as const },
      { key: 'ready-far', stage: 'content' as const },
    ]
    expect(
      pickNextFinalizeKey(
        jobs,
        distOf({ 'blocked-near': 0, 'ready-far': 5 }),
        (k) => k === 'ready-far',
      ),
    ).toBe('ready-far')
  })

  it('returns undefined when only blocked content remains', () => {
    expect(
      pickNextFinalizeKey([{ key: 'a', stage: 'content' }], () => 1, () => false),
    ).toBeUndefined()
  })
})
