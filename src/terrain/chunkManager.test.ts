import { describe, expect, it } from 'vitest'
import type { ChunkTileResult } from './chunkHeightmapProtocol'
import { apronOriginWorld } from './chunkHeightmap'
import {
  applyModificationToTile,
  drainByBudget,
  pickNearestQueuedKey,
  pickNextFinalizeKey,
  ringChunkOffsets,
  type TerrainModification,
} from './chunkManager'

// Small grid so texel math is easy to reason about by hand: resolution 5,
// chunkSize 32 -> step 8, apronRes 7 (world x/z per texel: -24,-16,-8,0,8,16,24
// for the cx=0 chunk).
const CHUNK_SIZE = 32
const RESOLUTION = 5

function fakeTile(apronRes: number, fill = 10): ChunkTileResult {
  const n = apronRes * apronRes
  return {
    heights: new Float32Array(n).fill(fill),
    floorHeights: new Float32Array(n).fill(fill),
    roadTint: new Float32Array(n).fill(0),
  } as unknown as ChunkTileResult
}

function heightAtWorld(tile: ChunkTileResult, cx: number, cz: number, wx: number, wz: number): number {
  const o = apronOriginWorld(cx, cz, CHUNK_SIZE, RESOLUTION)
  const ix = Math.round((wx - o.x) / o.step)
  const iz = Math.round((wz - o.z) / o.step)
  return tile.heights[iz * o.apronRes + ix]!
}

/** Issue 039 — the rendered mesh reads `floorHeights`, a separate field from
 *  the collision/query `heights` above; every mode must keep both in sync. */
function floorHeightAtWorld(tile: ChunkTileResult, cx: number, cz: number, wx: number, wz: number): number {
  const o = apronOriginWorld(cx, cz, CHUNK_SIZE, RESOLUTION)
  const ix = Math.round((wx - o.x) / o.step)
  const iz = Math.round((wz - o.z) / o.step)
  return tile.floorHeights[iz * o.apronRes + ix]!
}

describe('applyModificationToTile', () => {
  it('lowers the center by approximately depth', () => {
    const tile = fakeTile(7)
    const mod: TerrainModification = { x: 0, z: 0, radius: 10, depth: 1, mode: 'dig' }
    applyModificationToTile(tile, { cx: 0, cz: 0 }, CHUNK_SIZE, RESOLUTION, mod)
    expect(heightAtWorld(tile, 0, 0, 0, 0)).toBeCloseTo(10 - 1, 5)
  })

  it('issue 039 — dig also lowers floorHeights (the rendered mesh Y), not just heights', () => {
    const tile = fakeTile(7)
    const mod: TerrainModification = { x: 0, z: 0, radius: 10, depth: 1, mode: 'dig' }
    applyModificationToTile(tile, { cx: 0, cz: 0 }, CHUNK_SIZE, RESOLUTION, mod)
    expect(floorHeightAtWorld(tile, 0, 0, 0, 0)).toBeCloseTo(10 - 1, 5)
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

  it('scorch lowers the center and bumps roadTint toward 1', () => {
    const tile = fakeTile(7)
    const mod: TerrainModification = { x: 0, z: 0, radius: 10, depth: 0.15, mode: 'scorch' }
    applyModificationToTile(tile, { cx: 0, cz: 0 }, CHUNK_SIZE, RESOLUTION, mod)
    expect(heightAtWorld(tile, 0, 0, 0, 0)).toBeCloseTo(10 - 0.15, 5)
    const o = apronOriginWorld(0, 0, CHUNK_SIZE, RESOLUTION)
    const ix = Math.round((0 - o.x) / o.step)
    const iz = Math.round((0 - o.z) / o.step)
    expect(tile.roadTint[iz * o.apronRes + ix]).toBeCloseTo(1, 5)
  })

  it('scorch does not overwrite a stronger existing roadTint', () => {
    const tile = fakeTile(7)
    tile.roadTint.fill(1)
    const mod: TerrainModification = { x: 0, z: 0, radius: 10, depth: 0.15, mode: 'scorch' }
    applyModificationToTile(tile, { cx: 0, cz: 0 }, CHUNK_SIZE, RESOLUTION, mod)
    const o = apronOriginWorld(0, 0, CHUNK_SIZE, RESOLUTION)
    const ix = Math.round((8 - o.x) / o.step)
    const iz = Math.round((0 - o.z) / o.step)
    expect(tile.roadTint[iz * o.apronRes + ix]).toBe(1)
  })

  it('prepare sets exact sample heights and clears grass eligibility (roadTint) at those samples only', () => {
    const tile = fakeTile(7)
    const o = apronOriginWorld(0, 0, CHUNK_SIZE, RESOLUTION)
    const mod: TerrainModification = {
      x: 0,
      z: 0,
      radius: 0,
      depth: 0,
      mode: 'prepare',
      id: 'prep:1',
      samples: [{ x: 0, z: 0, height: 12 }],
    }
    const touched = applyModificationToTile(tile, { cx: 0, cz: 0 }, CHUNK_SIZE, RESOLUTION, mod)
    expect(touched).toBe(true)
    expect(heightAtWorld(tile, 0, 0, 0, 0)).toBe(12)
    // Issue 039 — the rendered mesh reads floorHeights, not heights.
    expect(floorHeightAtWorld(tile, 0, 0, 0, 0)).toBe(12)
    const centerIx = Math.round((0 - o.x) / o.step)
    const centerIz = Math.round((0 - o.z) / o.step)
    expect(tile.roadTint[centerIz * o.apronRes + centerIx]).toBe(1)
    // An untouched neighboring sample keeps its original height and roadTint.
    expect(heightAtWorld(tile, 0, 0, 8, 0)).toBe(10)
    const otherIx = Math.round((8 - o.x) / o.step)
    expect(tile.roadTint[centerIz * o.apronRes + otherIx]).toBe(0)
  })

  it('prepare replacing the same id with new samples does not leave the old height write in place elsewhere', () => {
    const tile = fakeTile(7)
    const first: TerrainModification = { x: 0, z: 0, radius: 0, depth: 0, mode: 'prepare', id: 'prep:1', samples: [{ x: 0, z: 0, height: 11 }] }
    applyModificationToTile(tile, { cx: 0, cz: 0 }, CHUNK_SIZE, RESOLUTION, first)
    expect(heightAtWorld(tile, 0, 0, 0, 0)).toBe(11)
    // A second application with different samples (simulating a later
    // progress tick) only touches its own samples — the grid write itself
    // is not "undone," matching how `ChunkManager.applyExactHeights` always
    // re-derives the complete current sample set from the immutable
    // original, never a delta.
    const second: TerrainModification = { x: 0, z: 0, radius: 0, depth: 0, mode: 'prepare', id: 'prep:1', samples: [{ x: 0, z: 0, height: 12.5 }] }
    applyModificationToTile(tile, { cx: 0, cz: 0 }, CHUNK_SIZE, RESOLUTION, second)
    expect(heightAtWorld(tile, 0, 0, 0, 0)).toBe(12.5)
  })

  it('prepare ignores a sample that does not land on this chunk grid', () => {
    const tile = fakeTile(7)
    const mod: TerrainModification = {
      x: 0,
      z: 0,
      radius: 0,
      depth: 0,
      mode: 'prepare',
      id: 'prep:1',
      samples: [{ x: 0.37, z: 0, height: 99 }],
    }
    const touched = applyModificationToTile(tile, { cx: 0, cz: 0 }, CHUNK_SIZE, RESOLUTION, mod)
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

describe('ringChunkOffsets', () => {
  it('starts at the center and returns a deterministic, repeatable order (plan 132)', () => {
    const offsets = ringChunkOffsets(2)
    expect(offsets[0]).toEqual({ dx: 0, dz: 0 })
    expect(offsets).toEqual(ringChunkOffsets(2))
  })

  it('covers every offset within the radius exactly once, ring by ring', () => {
    const offsets = ringChunkOffsets(2)
    expect(offsets).toHaveLength(25) // (2*2+1)^2
    const seen = new Set(offsets.map((o) => `${o.dx}:${o.dz}`))
    expect(seen.size).toBe(25)
    for (let i = 1; i < offsets.length; i++) {
      const ring = (o: { dx: number, dz: number }) => Math.max(Math.abs(o.dx), Math.abs(o.dz))
      expect(ring(offsets[i]!)).toBeGreaterThanOrEqual(ring(offsets[i - 1]!))
    }
  })
})

describe('drainByBudget', () => {
  function fakeClock(startMs = 0) {
    let now = startMs
    return { now: () => now, advance: (ms: number) => { now += ms } }
  }

  it('spreads many pending jobs across ticks instead of draining them all at once', () => {
    // Regression case for review 017: many chunks finish at once (a whole
    // settlement's 3x3 block), each job costing more than a single frame's
    // budget should allow through in one go.
    const clock = fakeClock()
    let remaining = 20
    let ran = 0
    drainByBudget(
      () => {
        if (remaining <= 0) return false
        remaining--
        ran++
        clock.advance(3) // each job costs 3ms
        return true
      },
      8, // budget
      clock.now,
    )
    // 8ms budget / 3ms per job -> a handful of jobs run, not all 20.
    expect(ran).toBeGreaterThan(0)
    expect(ran).toBeLessThan(20)
    expect(remaining).toBeGreaterThan(0)
  })

  it('always runs at least one job even when a single job already exceeds the budget', () => {
    const clock = fakeClock()
    let ran = 0
    drainByBudget(
      () => {
        ran++
        clock.advance(50) // costs more than the whole budget by itself
        return ran < 1 // stop after one job
      },
      8,
      clock.now,
    )
    expect(ran).toBe(1)
  })

  it('stops immediately once the step function reports no work left', () => {
    const clock = fakeClock()
    let calls = 0
    drainByBudget(
      () => {
        calls++
        return false
      },
      1000,
      clock.now,
    )
    expect(calls).toBe(1)
  })
})
