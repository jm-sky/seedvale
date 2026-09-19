# Codebase domain audit 04 — Terrain, chunks & ground queries

**Date:** 2026-09-19
**Area:** 04 — Terrain, chunks & ground queries
**Master:** [tools-018](../../plans/tools-018-codebase-domain-and-flow-audit-master.md)
**Result:** ⚠️ reviewed with unresolved high findings
**Code basis:** `main` inspected on 2026-09-19

## 1. Scope

Focused end-to-end review of:

- chunk generation, persistent tile cache, load/finalize/unload/reload;
- runtime mesh rebuilds and stale async-job rejection;
- terrain/ground authority and analytical fallback semantics;
- `sampleHeight`, `sampleFloor`, `sampleBridgeDeck`, `sampleSurfaceGround`;
- player/NPC/fauna movement-ground consumers;
- dig/scorch/exact terrain preparation;
- cave terrain cutouts and mouth recesses;
- roads/rivers/fords/bridges only where they alter ground authority;
- chunk-boundary/apron behaviour;
- cache invalidation and rebuild continuity.

Water-body semantics beyond their direct dependency on terrain queries are deferred to area 05. Cave interior topology/occupancy beyond surface-ground arbitration is deferred to area 07. General navigation/path policy is deferred to area 08.

## 2. Entry points and state owners

### Authoritative/generated terrain

`terrain/chunkHeightmap.ts` owns deterministic tile generation from `ChunkTileParams`. Generated tiles include the terrain shaping inputs supplied to that generation pass, including road corridors, river shaping/fords and bridge projection masks.

`ChunkManager` owns resident runtime tile records and their lifecycle. A canonical generated tile is obtained from the persistent worldgen cache or worker, cloned through `cloneChunkTileForRuntime()`, then runtime terrain modifications are applied to that clone before presentation is finalized.

The persistent chunk-tile cache is disposable derived state; runtime mutation is deliberately applied only after cloning the canonical cache value.

### Runtime terrain modification state

`createApp.ts` owns the long-lived `TerrainModification[]` array and passes the same array into each rebuilt `ChunkManager`.

`ChunkManager` mutates that array through:

- `modifyTerrain(...)` — additive dig/mound;
- `scorchTerrain(...)` — additive shallow deformation + bare/charred presentation inputs;
- `applyExactHeights(...)` — id-keyed absolute grid samples for terrain preparation/leveling.

`source: 'player'` is persisted. `source: 'system'` is intended to be deterministic build-time projection and is excluded from save serialization.

### Surface movement ground

`ChunkManager.sampleHeight` is terrain-only.
`ChunkManager.sampleBridgeDeck` projects retained declared bridge specs.
`ChunkManager.sampleSurfaceGround` returns bridge deck Y when present, otherwise `sampleHeight`.

Cave interior ground is intentionally separate: player/cave-aware movement arbitrates cave ground first and surface ground second.

## 3. Flows traced

### 3.1 Chunk generation → cache → runtime clone → finalize

```text
ensureLoaded(coord)
→ retain river tiles / resolve river gameplay segments
→ paramsFor(coord, riverSegments)
→ retain fordProjections + bridgeSpecs on ChunkRecord
→ chunkTileFingerprint(params)
→ persistent tile cache hit OR chunk worker generation
→ cloneChunkTileForRuntime(canonical)
→ finalize queue
→ attachChunkMesh()
→ replay TerrainModification[] onto runtime clone
→ worker-backed mesh-data build/cache
→ buildChunkGeometry(...cutouts...)
→ water/river presentation
→ state = ready
→ content finalize
```

The canonical persistent tile is not mutated by runtime terrain changes.

### 3.2 Streaming / unload / stale async work

`ChunkManager.update()` keeps chunks within load radius and an unload hysteresis ring. Home chunks are pinned.

Unload:

- resolves/removes finalize waiters;
- cancels tile and mesh worker jobs;
- clears chunk colliders;
- unregisters tree presence;
- disposes terrain mesh, water, river, bridges, grass and chunk content;
- releases retained river tiles;
- deletes the record.

Async mesh attachment uses record identity plus `meshRequestSeq`, so superseded dig/scorch/prepare remesh results cannot overwrite a newer mesh.

### 3.3 Ground reads

Ready resident field:

```text
worldToChunk
→ ready ChunkRecord.tile
→ sampleApronGrid(runtime tile field)
```

Missing or not-ready record:

```text
readField()
→ sampleHeightAt/sampleFloorAt/... using fallbackParams
```

That fallback is analytical base terrain, not the equivalent of a fully generated/mutated runtime tile.

### 3.4 Terrain modifications

Initial/reloaded resident tile:

```text
canonical tile clone
→ replay all TerrainModification entries once
→ mesh build
```

Live mutation:

```text
append/replace modification
→ mutate each overlapping ready tile in place
→ bump modificationsEpoch
→ async remesh touched chunks
→ rebuild grass where applicable
```

The audit specifically checked for accidental double replay during an ordinary remesh: **not found**. `buildAndAttachMesh()` consumes the already-mutated tile and does not replay the modification list again.

### 3.5 Chunk seams

Runtime modification math uses `apronOriginWorld()` with one global grid phase. Overlapping neighboring apron texels receive the same world-space modification math. Exact preparation samples are checked against the same grid phase.

This is the correct seam model for ready/ready neighboring chunks.

### 3.6 Bridges and cave cutouts

Bridge authority is split intentionally:

- road routing produces canonical crossing records;
- deterministic `RoadBridgeSpec` projection feeds terrain masking, presentation and movement deck queries;
- bridge presentation lifetime is chunk-owned;
- movement reads bridge-aware surface ground;
- placement/worldgen remains terrain-only.

Cave cutouts are also intentionally presentation topology only. They remove the rendered outdoor sheet but do not alter `sampleHeight`; cave heightfield queries own traversable interior floor/ceiling. Loaded chunks are remeshed immediately when a cutout owner changes, and every later mesh rebuild reapplies current cutouts.

## 4. Findings

### F04-01 — HIGH — deterministic system terrain modifications accumulate across same-session WorldBundle rebuilds

**Evidence**

`createApp.ts` owns one `modifications: TerrainModification[]` and carries it into an ordinary `rebuildWorldBundle()`.

`ChunkManager` aliases that array and all mutation methods append/replace entries in it.

System producers append deterministic effects during each fresh world-system construction:

- `world/createCaves.ts`: cave mouth recess discs call `modifyTerrain(..., 'system')`;
- `fauna/createFauna.ts`: deterministic den depression calls `modifyTerrain(..., 'system')`;
- restored disabled/recovering fauna spawners replay their burned patch through `scorchTerrain/modifyTerrain(..., 'system')`.

Nothing removes old `source: 'system'` entries before the same array is passed into the replacement `ChunkManager`.

The replacement manager therefore starts with prior system entries, then fresh caves/fauna append the same deterministic effects again. Additive dig/scorch effects deepen repeatedly on successive rebuilds.

Save/load is different and correct in this respect: `buildSaveData()` filters to `source === 'player'`, so a process reload reconstructs system effects from scratch rather than carrying them.

**Impact**

Same-seed in-session rebuilds can progressively alter authoritative runtime terrain around cave mouths/dens/burned habitat sites. This violates the documented deterministic reconstruction contract and can desynchronize terrain from cave/fauna presentation assumptions.

**Plan**

[world-terrain-043-system-terrain-modification-rebuild-idempotency.md](../../plans/world-terrain-043-system-terrain-modification-rebuild-idempotency.md)

---

### F04-02 — HIGH — runtime movement ground silently downgrades to incomplete analytical terrain when a chunk is missing/generating

**Evidence**

`ChunkManager.readField()` returns a number even when no ready tile exists by calling analytical `sampleHeightAt` / `sampleFloorAt` with `fallbackParams`.

The ready runtime tile may additionally contain:

- road shaping;
- river/ford shaping;
- all runtime terrain modifications / exact preparation;
- other generation inputs encoded in full `ChunkTileParams`.

The fallback therefore has different semantics from the ready tile.

`sampleBridgeDeckAt()` depends on the owning `ChunkRecord.bridgeSpecs`. No record/specs means `null`, so `sampleSurfaceGround()` silently becomes raw analytical terrain too.

Bridge-aware movement samplers are used by:

- PlayerController;
- NpcAgent;
- settlement/detached AnimalAgent;
- wild fauna.

The shared slope constraint samples neighboring points via the injected height sampler. At a residency boundary a finite-difference probe can therefore compare a ready canonical tile point against a raw fallback point and infer an artificial slope/step.

Existing world-003 implementation notes already recognized the underlying mismatch at startup and deliberately retained `waitForChunks(homeChunks())` to avoid placement/spawn decisions on fallback noise. The mismatch remains a general API/runtime-ground issue.

**Impact**

A detailed mover or other runtime-ground consumer that reaches unavailable canonical terrain can receive plausible-looking but wrong ground rather than an explicit unavailable state. Differences are especially meaningful around roads, river crossings, bridges and modified terrain.

This is not an argument to remove analytical sampling: streaming-independent worldgen/off-screen queries require it. The defect is conflating analytical and runtime-ground semantics behind a permissive always-number API.

**Plan**

[world-terrain-044-runtime-ground-query-authority-and-missing-chunk-fallbacks.md](../../plans/world-terrain-044-runtime-ground-query-authority-and-missing-chunk-fallbacks.md)

---

### F04-03 — MEDIUM — global terrain-modification epoch over-invalidates the mesh-data cache

Every dig/scorch/prepare write increments one global `modificationsEpoch`. The mesh-data cache key for **every** chunk includes that epoch.

A local terrain write therefore invalidates cache identity globally, even for untouched chunks. Progressive terrain preparation deliberately emits updates at 5% progress steps, so one preparation can advance the epoch repeatedly.

This is correctness-safe and explicitly simpler than per-chunk dependency tracking, but it reduces the bounded 64 MB mesh cache's usefulness during terrain work and can force avoidable worker recomputation if streaming/rebuild work overlaps.

No gameplay correctness defect was established from static inspection, so no implementation plan is created in this audit. Revisit under area 24/performance with measurements before adding localized invalidation complexity.

---

### F04-04 — LOW/observation — query authority leads presentation briefly during async remesh

Live dig/scorch/prepare mutates the runtime tile synchronously, then starts an async worker/cache remesh. `sampleHeight` immediately sees the new authoritative value while the old mesh can remain visible until the new request attaches.

This is a short-lived presentation lag, not a second source of truth. Request sequencing correctly prevents stale geometry from winning. No change is recommended without observed UX impact.

## 5. Architecture observations

- The canonical-cache → runtime-clone boundary is sound. Persistent cached tiles remain deterministic/generated and runtime terrain history is layered afterward.
- Ready/ready chunk seams use the correct shared apron/grid phase. No separate seam reconciliation layer is needed.
- `sampleSurfaceGround` is intentionally **not** a universal visible-surface query: it means outdoor movement ground with bridge projection. Cave ground remains a higher-priority caller-owned layer. The current comments communicate this correctly.
- Raw `sampleHeight` remains correct for terrain placement/worldgen code where a bridge deck must not become terrain.
- Cutouts correctly stay presentation topology instead of mutating terrain collision/height. Cave gameplay authority comes from cave heightfield queries.
- Runtime modifications correctly update both `heights` and `floorHeights`; this avoids the historical presentation/query drift where geometry read a different field.
- Modification remeshes do not accidentally replay the entire modification list; replay occurs on a fresh runtime tile clone during initial/reload finalization only.

## 6. Cross-domain dependencies / follow-ups

### Area 05 — Water system

Review missing-chunk semantics of `sampleLocalWater()` and `riverShoreDistance()`. River gameplay segments are retained on chunk records, while field fallback can be analytical; verify that water consumers do not silently infer dry/no-river from missing runtime data.

### Area 07 — World locations & caves

Verify cave mouth transition arbitration and heightfield/cutout agreement end-to-end. This audit only established the terrain-side contract.

### Area 08 — Navigation & movement surface

Trace how far detailed NPC/fauna/merchant movement may travel beyond terrain residency and how road itineraries interact with ground availability. F04-02 establishes the terrain API defect; area 08 should verify all movement lifecycle guarantees.

### Area 24 — Performance & workers

Measure the real impact of global `modificationsEpoch` invalidation before considering localized cache versions.

## 7. Existing plans that already cover findings

No active existing plan covers F04-01 or F04-02.

Relevant completed/implemented foundations that should be reused rather than replaced:

- `world-terrain-004` — worker-backed chunk mesh generation and runtime mesh-data cache;
- `world-terrain-019` — production cave heightfield/cutout terrain integration;
- `world-terrain-031` — persistent canonical chunk-tile worldgen cache;
- `world-terrain-033` — bridge projection/presentation/shared movement surface;
- `world-003` implementation notes — explicitly document startup risk from the raw fallback and preserve home-chunk readiness.

## 8. New plans required

1. [world-terrain-043-system-terrain-modification-rebuild-idempotency.md](../../plans/world-terrain-043-system-terrain-modification-rebuild-idempotency.md) — fix F04-01.
2. [world-terrain-044-runtime-ground-query-authority-and-missing-chunk-fallbacks.md](../../plans/world-terrain-044-runtime-ground-query-authority-and-missing-chunk-fallbacks.md) — fix F04-02.

No plan created for F04-03 pending performance evidence.

## 9. Verification limits

This was a focused static/code-flow review of current `main` plus existing plans/implementation notes.

No browser/manual verification was performed; project policy assigns that to the User.

No finding was implemented in this session.

## 10. Master status update

Area 04 should be marked:

**⚠️ reviewed with unresolved high/critical findings**

because F04-01 and F04-02 remain open and now have focused implementation plans.
