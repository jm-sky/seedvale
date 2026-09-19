# Plan: System terrain modification rebuild idempotency

**Created:** 2026-09-19
**Status:** `planned` 📋
**Priority:** high · **Effort:** S
**Depends on:** none
**Domain:** `world-terrain`
**Type:** `bug`
**Roadmap:** -

## Problem

`ChunkManagerConfig.modifications` is a caller-owned array that intentionally survives an in-session `WorldBundle` rebuild. It currently contains both historical/player modifications and deterministic runtime `source: 'system'` modifications.

Fresh world construction then deterministically emits system modifications again:

- `src/world/createCaves.ts` replays cave-mouth recess discs through `chunkManager.modifyTerrain(..., 'system')`;
- `src/fauna/createFauna.ts` replays deterministic den depressions and restored burned-spawner terrain through `modifyTerrain/scorchTerrain(..., 'system')`.

Because `createApp.ts::rebuildWorld()` passes the same `modifications` array into `rebuildWorldBundle()`, old system entries are already present when the new `ChunkManager` starts. The newly-created cave/fauna systems append the same deterministic effects again. Additive `dig`/`scorch` entries therefore deepen repeatedly across same-session rebuilds.

Save/load does not have this exact defect because `buildSaveData()` serializes only `source === 'player'`.

## Goal

Make deterministic system terrain effects idempotent across an in-session rebuild while preserving:

- player terrain history across rebuild/save/load;
- deterministic system reconstruction on every fresh world build;
- the existing single terrain-modification application path in `ChunkManager`;
- current cave/fauna ownership; no second terrain-deformation registry.

## Current flow

```text
createApp-owned TerrainModification[]
  → buildChunkManager()
  → ChunkManager aliases the same array
  → caves/fauna append source:'system'
  → rebuildWorld()
  → same array passed to rebuildWorldBundle()
  → fresh ChunkManager replays existing entries
  → fresh caves/fauna append same source:'system' entries again
  → additive deformation doubles
```

## Implementation

### 1. Define the rebuild boundary explicitly

Before constructing the replacement world for the same seed, carry only terrain history that is supposed to survive reconstruction.

Preferred contract:

```text
rebuild carry = player-authored terrain modifications
system terrain modifications = deterministic projection of the freshly-built world
```

Do not persist or independently snapshot deterministic system effects.

The exact filtering location should be the narrowest ownership boundary that keeps `createApp` and `rebuildWorldBundle` semantics aligned. Avoid teaching caves/fauna to inspect or de-duplicate `ChunkManager` internals.

### 2. Preserve player modifications

All `source: 'player'` `dig`, `scorch` and `prepare` entries must survive a same-world rebuild exactly once and remain the only entries serialized by `buildSaveData()`.

Do not clear the entire array on an ordinary graphics/terrain rebuild.

### 3. Reconstruct system effects once

After the replacement `ChunkManager` is constructed:

- cave mouth carving runs once from deterministic cave definitions;
- fauna den depressions run once;
- restored burned-spawner visual terrain projection runs once from authoritative saved spawner state.

No producer should need special "already applied" flags.

### 4. Keep new-world reset unchanged

A genuine new world/new seed still resets the terrain-modification collection as today.

## Relevant files

- `src/app/createApp.ts`
- `src/app/worldBundle.ts`
- `src/app/saveState.ts`
- `src/terrain/chunkManager.ts`
- `src/world/createCaves.ts`
- `src/fauna/createFauna.ts`

## Tests

Add a focused automated regression around rebuild carry semantics:

1. start with at least one player additive modification and one deterministic system modification;
2. snapshot/carry into a same-seed rebuild;
3. assert player modification is present once;
4. assert pre-rebuild system entries are not carried as historical state;
5. run the deterministic producer/reconstruction step and assert one resulting system effect, not two;
6. repeat a second rebuild and assert the resulting deformation is unchanged.

Also retain save serialization coverage proving only `source: 'player'` entries persist.

## Guardrails

- Do not change cave geometry/heightfield generation.
- Do not turn system modifications into persisted save state.
- Do not introduce a cave-specific or fauna-specific terrain mutation store.
- Do not solve additive duplication with approximate coordinate matching.
- Keep `ChunkManager.applyModificationToTile()` as the shared mutation primitive.
- Browser verification is performed by the User.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
