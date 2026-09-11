# Implementation notes: world-terrain-019 cave heightfield production migration

**Reviewed:** 2026-09-11  
**Plan:** `docs/plans/world-terrain-019-cave-heightfield-production-migration.md`  
**Baseline:** `main` at `81f9b1a550e67a03b8b3414eabed81a853a259ff`  
**Milestone A implemented:** 2026-09-11 — see “Milestone A — implemented” below.  
**Milestone B implemented:** 2026-09-11 — see “Milestone B — implemented” below. Heightfield is presentation + terrain-mouth authority; SDF remains gameplay / collision / camera authority until D.

These notes are a focused implementation handoff, not a restatement of the plan. Current code is authoritative. The final `world-terrain-018` spike differs materially from several earlier notes: production migration must copy the final floor/ceiling-convergence model, not the superseded binary-footprint/vertical-wall approach.

## Current ownership and migration boundary

Production cave ownership is concentrated in `src/world/createCaves.ts`.

Current construction chain (after Milestone A):

```text
pickLargeCaveSites()
  -> buildProductionCaveTopology()
  -> buildCaveSdfRepresentation()
  -> buildCaveHeightfieldRepresentation()   // retained, not yet authority
  -> buildCaveSdfColumnIndex()
  -> buildCaveSdfColliders()
  -> CaveRuntime { topology, definition, heightfield, representation, index, colliders }
```

Presentation is separately relevance-streamed through `createCaveStreamingController()` and the SDF-only extraction client/worker. Gameplay queries remain available even when presentation is inactive.

The migration should preserve that separation. In particular:

- A adds production heightfield representation without switching runtime authority.
- B switches presentation + terrain mouth geometry only.
- C introduces shared heightfield spatial/semantic query ownership.
- D moves gameplay, collision and camera consumers to heightfield-derived queries while preserving the public cave contracts where useful.
- E deletes obsolete SDF/extraction/adapter code only after no production caller remains.

Do not couple presentation streaming to gameplay truth during the migration.

## Production contracts that must survive A-E

- `CaveTopology` remains the representation-neutral cave identity/layout source: `src/world/caves/caveTopology.ts`.
- Production topology remains `buildProductionCaveTopology()` in `src/world/caves/productionTopology.ts`.
- `createCaves()` remains the world-level cave owner and `WorldBundle.caves` remains the rebuild lifetime boundary.
- `createCaveStreamingController()` keeps 55/80 m presentation hysteresis, generation IDs, stale-result protection and relevance-scoped collider registration unless a later milestone deliberately replaces only the collider hook.
- `definitions()` currently feeds location/discovery code and must not silently disappear in A/B.
- `queryGround()` is currently player-ground stateful via one closure-level hysteresis state; `queryInterior()` is likewise player-position hysteretic. Do not reuse either as generic multi-entity spatial queries in C/D.
- `occupancyAt()` is the current stateless camera/strict-space contract.
- `ChunkManager` owns terrain chunk lifecycle and rebuild; a cave mouth hole must survive chunk unload/reload and mesh rebuilds.
- `disposePresentation()` + `disposeObject3D()` and `Caves.dispose()` define the current scene/GPU/worker cleanup boundary.

## Milestone A — Production representation extraction

### Target ownership

Create the production representation under `src/world/caves/`, preferably:

```text
src/world/caves/caveHeightfieldRepresentation.ts
```

Use a production name such as `CaveHeightfieldRepresentation`; the spike currently calls the equivalent type `CaveHeightfield`. Do not leave production code importing representation logic from `src/debug/`.

The module must remain data/pure-math only: no Three.js, scene, player, camera, `ChunkManager` object, renderer or DOM dependency. A terrain sampler function is acceptable and required by the accepted mouth/surface seam.

Recommended production construction seam:

```ts
buildCaveHeightfieldRepresentation(
  topology: CaveTopology,
  walkSurfaceAt: SurfaceSampler,
  config?: CaveHeightfieldConfig,
): CaveHeightfieldBuildResult
```

`walkSurfaceAt` must be deterministic and representation-independent. In production `createCaves()` can derive it from the existing analytic base surface plus the existing deterministic mouth recess:

```text
walkSurfaceAt(x,z)
  = chunkManager.sampleBaseHeight(x,z)
    - mouthCarveDepth(x,z, topology.entrance)
```

Do not pass the mutable streamed `chunkManager.sampleHeight()` as representation authority. The existing production topology already separates the rendered mouth floor from interior overburden checks for this reason.

### Debug code to extract/reuse

Authoritative final spike source: `src/debug/caves/caveHeightfieldRepresentation.ts`.

Move/adapt these concepts rather than rewriting them:

- `CaveHeightfieldConfig` / `DEFAULT_HEIGHTFIELD_CONFIG`;
- representation bounds/grid data;
- `HeightfieldStation`, `HeightfieldSample`, build-result shape;
- `resampleSegmentStations()`;
- whole-run influence construction (one continuous polyline influence, not one union operand per station);
- `buildEntranceInfluence()`;
- `buildChamberLobes()`;
- `crossSectionAt()` and the rounded floor/ceiling closure model;
- topology feature footprints: shelf raises floor, overhang lowers ceiling;
- deterministic macro/floor/ceiling noise;
- top-two smooth union logic that avoids repeated `smin`/`smax` fold bias;
- `sampleHeightfieldAt()`;
- `heightfieldNodeGap()` / node position/index helpers;
- `heightfieldNodeOpenSky()`;
- `mouthOpeningAt()`;
- `heightfieldGapGradient()` for later D.

The final representation invariant is:

```text
gap(x,z) = ceilY(x,z) - floorY(x,z)
gap > 0  => cave void
gap = 0  => geometric rim/wall contour
gap < 0  => solid/outside
```

There is deliberately no authoritative stored `inside` mask and no vertical wall primitive. Earlier spike notes describing those are superseded.

### Topology-owned vs representation-owned parameters

Keep in `CaveTopology` / production topology:

- `caveId`, seed identity;
- entrance position/yaw/width/height;
- node world positions and semantic `kind`;
- `targetWidth` / `targetHeight`;
- segment centerlines and graph connectivity;
- feature kind/position/size;
- `minClearance`;
- terrain-adapted route/descent already chosen by `buildProductionCaveTopology()`.

Keep in representation config/internal representation constants:

- heightfield `cellSize`;
- centerline resampling spacing;
- cross-section/rim shaping constants;
- smooth-union radius;
- macro footprint variation;
- floor/ceiling detail noise scales/amplitudes;
- interpolation/out-of-grid closure behavior;
- representation-specific mouth influence shaping.

Do not copy node dimensions, entrance dimensions, route descent or feature placement into config. They are topology intent.

Current spike exposes only the tunable grid/resampling/noise subset through `CaveHeightfieldConfig`; stable shape constants (`BETA`, `NF`, `NC`, `KAPPA`, rim band, etc.) are module constants. It is acceptable to keep them internal in A instead of creating a large public config object.

### Deterministic helpers and dependencies

Reuse existing production helpers where their ownership is already neutral:

- `createCaveRandom()` and `CAVE_RNG_SALT` from `caveRng.ts`;
- `openingDirection()`;
- `mouthAlong()` / `mouthCarveDepth()` from `mouthCarve.ts`;
- `createValueNoise2D()` from `spikeNoise.ts` if it remains production-safe and Three-free.

Two current debug imports should be neutralised during extraction:

1. `smin` comes from `caveSdfField.ts`. Production heightfield must not depend on the soon-to-be-retired SDF representation merely for one scalar helper. Prefer extracting the tiny smooth-min/max math to a representation-neutral cave math module used by both implementations during migration.
2. `SURFACE_CLIP_EPS` currently lives in `caveSdfQuery.ts` but is a representation-neutral cave/surface seam. Prefer moving/exporting it from a neutral cave spatial/surface module and keeping SDF query importing it. Do not make the new heightfield depend on `caveSdfQuery.ts` just for this constant.

A must not otherwise refactor SDF code.

### Production construction call-site

Extend the up-front cave build in `createCaves()` after accepted topologies are known. Recommended transitional runtime shape:

```ts
type CaveRuntime = {
  topology: CaveTopology
  definition: CaveDefinition
  heightfield: CaveHeightfieldRepresentation
  // retained until D/E:
  representation: CaveSdfSpatialRepresentation
  index: CaveSdfColumnIndex
  colliders: readonly Collider[]
}
```

Build one heightfield per accepted topology using the deterministic per-cave walk-surface sampler. Do not switch `queryGround`, `occupancyAt`, `queryInterior`, `contains`, `sampleFloor`, `sampleCeiling` or colliders in A.

A is complete when production owns and tests the representation while the visible/runtime cave remains SDF.

### Tests to move/adapt

Move production-relevant pure tests from `src/debug/caves/caveHeightfieldRepresentation.test.ts` close to the new production module. Keep the debug harness tests only for debug integration where useful.

High-value representation tests:

- identical topology/config -> identical typed arrays;
- all arrays finite;
- core `minClearance` preserved but rim can converge below it;
- gap decreases smoothly through zero at boundary;
- declared passage width remains usable;
- unbroken route mouth -> chamber;
- centerline floor steps/slopes remain walkable;
- detail/macro noise does not choke route;
- repeated union does not inflate cave due smooth-min fold bias;
- chamber widening/irregular lobes;
- shelf is elevated floor region, not a floating SDF slab;
- overhang remains a ceiling deformation;
- open-sky/mouth contour and bilinear sampling behavior;
- production `CaveTopology` fixtures in addition to spike fixtures where practical.

Do not make A depend on Three mesh tests or player-walker tests.

### SDF code A must leave in place

Do not remove or switch:

- `caveSdfField.ts` representation;
- `caveSdfQuery.ts` column index / ground / occupancy / hysteresis;
- `caveSdfColliders.ts`;
- `caveSdfExtraction.ts`;
- `caveExtractionClient.ts`, protocol and worker;
- `sdfCaveMesh.ts`;
- SDF presentation material/path;
- current `createCaves()` SDF consumers.

Any neutral-helper extraction should be behavior-preserving for SDF and covered by existing tests.

### Milestone A — implemented (2026-09-11)

Implemented on `main` after the recon above. Current code remains authoritative for B.

#### What landed

Production owns a pure heightfield representation and builds it up front for every accepted topology. SDF remains the live presentation / gameplay / collision / camera path. The debug harness no longer contains a second copy of the heightfield algorithm.

#### Final files and symbols

Production representation (`src/world/caves/caveHeightfieldRepresentation.ts`):

- `CaveHeightfieldRepresentation` — grid + `floorY` / `ceilY` / cached `surfaceY` / `coreT`
- `buildCaveHeightfieldRepresentation(topology, walkSurfaceAt, config?)` → `CaveHeightfieldBuildResult`
- `CaveHeightfieldConfig` / `DEFAULT_HEIGHTFIELD_CONFIG`
- `HeightfieldStation`, `HeightfieldSample`, `SurfaceSampler`
- `resampleSegmentStations()`, `buildEntranceInfluence()`, `buildChamberLobes()`, `crossSectionAt()`
- `sampleHeightfieldAt()`, `mouthOpeningAt()`, `heightfieldGapGradient()`
- `heightfieldNodeGap()` / `heightfieldNodeOpenSky()` / node index/position helpers
- internal shape constants unchanged from the spike (`BETA`, `NF`, `NC`, `KAPPA`, rim band, …)

Neutral helpers extracted from SDF ownership:

- `src/world/caves/caveMath.ts` — `smin`, `smax`. `caveSdfField.ts` now imports `smin` from here and no longer exports it.
- `src/world/caves/caveSurface.ts` — `SURFACE_CLIP_EPS`. `caveSdfQuery.ts` imports and re-exports it so existing SDF/debug callers keep compiling. Production heightfield imports the constant from `caveSurface.ts`, not from `caveSdfQuery.ts`.

Production construction (`src/world/createCaves.ts`):

```text
pickLargeCaveSites()
  -> buildProductionCaveTopology()
  -> buildCaveSdfRepresentation()
  -> buildCaveHeightfieldRepresentation(topology, walkSurfaceAt)
  -> buildCaveSdfColumnIndex()
  -> buildCaveSdfColliders()
  -> CaveRuntime { topology, definition, heightfield, representation, index, colliders }
```

`walkSurfaceAt(x,z) = chunkManager.sampleBaseHeight(x,z) - mouthCarveDepth(x,z, topology.entrance)`.

`CaveRuntime.heightfield` is retained and unused by queries/presentation in A. Boot mark: `cave.heightfield`.

#### Debug reuse

`src/debug/caves/caveHeightfieldRepresentation.ts` is a re-export shim only. Spike names (`CaveHeightfield`, `buildCaveHeightfield`) alias the production types/functions so the harness, mesh, traversal and walker keep compiling without a second algorithm.

Debug modules that now consume production representation through that shim:

- `src/debug/caves/caveHeightfieldMesh.ts`
- `src/debug/caves/caveHeightfieldTraversal.ts`
- `src/debug/caves/caveHeightfieldWalkWorld.ts`
- `src/debug/caves/caveHeightfieldRepresentation.test.ts` (mesh-only)
- `src/debug/createCaveHeightfieldTestScene.ts`

#### Tests

Moved production-relevant pure tests to `src/world/caves/caveHeightfieldRepresentation.test.ts` (spike fixtures plus a `buildProductionCaveTopology` walk-surface seam test). Debug file keeps mesh/underside-mask tests only. Added `caveMath.test.ts` for the `smin(a,a,k)=a-k/4` identity.

#### Deviations from the pre-A recon

- `SURFACE_CLIP_EPS` lives in a new tiny `caveSurface.ts` rather than being folded into `mouthCarve.ts` or `clipBelowSurface.ts`. Those modules stay mouth-geometry and presentation-triangle owners. SDF query re-exports the constant to avoid churning existing callers.
- `smin` is no longer re-exported from `caveSdfField.ts`. The only pre-A importer was the debug heightfield.
- Debug mesh test “flat 4 m plane 0.5 m under the entrance” was already failing on pre-A `main`: mesh uses `UNDER_ENTRANCE_SIZE = 6` and `UNDER_ENTRANCE_DROP = 1`. The kept debug assertion was aligned to those constants. Mesh code itself was not changed.
- `docs/STATE.md` notes that production now retains a parallel heightfield; SDF is still authority.

#### Checks (A)

```text
vitest: caveHeightfieldRepresentation (production + debug mesh), caveMath, caveSdfField, caveSdfQuery, caveSdfColliders, caveSdfExtraction, caveHeightfieldTraversal, cavePresentationLifecycle
vue-tsc --noEmit
eslint .
pnpm run build
```

No browser verification. `pnpm docs:sync` was not run.

#### Handoff for Milestone B

Start from this implemented state, not from the pre-A recon alone.

Focused recon for B:

- `createCaves.ts`: `attachPresentation()`, `disposePresentation()`, `presentationJobs`, `createCaveStreamingController()`, `createCaveExtractionClient()`, `CaveRuntime.heightfield` (already built).
- `src/debug/caves/caveHeightfieldMesh.ts` — still the authoritative mesh/mask source; it already imports production field helpers via the debug shim.
- `src/world/caves/caveSurface.ts` — use `SURFACE_CLIP_EPS` from here (or the `caveSdfQuery` re-export) for ceiling clip / mouth opening.
- Terrain: `ChunkManager` / `buildChunkGeometry()` still emit a full indexed plane; mouth is still only `modifyTerrain()` height recess.
- Do not switch `queryGround` / `occupancyAt` / `queryInterior` / colliders.

`CaveRuntime.heightfield` is the retained representation B should mesh. Reconstructing the walk-surface sampler as `sampleBaseHeight - mouthCarveDepth(entrance)` matches A and the field's cached `surfaceY`. `mouthOpeningAt(field, walkSurfaceAt, x, z)` is the shared opening contour.

SDF extraction/worker/mesh files stay in place through B.

## Milestone B — Production presentation mesh + real terrain entrance

### Presentation creation call-site

The production presentation seam is inside `src/world/createCaves.ts`:

- `createCaveStreamingController()` decides relevance/lifecycle;
- `presentationJobs.request()` currently sends an SDF worker job;
- `createCaveExtractionClient()` owns SDF queue/worker execution;
- `attachPresentation()` currently finalizes SDF arrays, creates the cave group/mesh, adds mouth framing and attaches to `scene`;
- `disposePresentation()` removes and disposes the whole group.

B should preserve `createCaveStreamingController()` and its generation/stale-result rules. Replace the presentation producer, not the streaming state machine.

### Current SDF presentation ownership to replace

Runtime SDF presentation currently spans:

- `src/world/caves/caveSdfExtraction.ts` — CPU grid sampling + Surface Nets;
- `src/world/caves/caveExtractionClient.ts` — nearest-first single-worker queue;
- `src/world/caves/caveExtractionProtocol.ts`;
- `src/world/caves/caveExtraction.worker.ts`;
- `src/world/caves/sdfCaveMesh.ts` — main-thread clipping/final BufferGeometry;
- `createCaves.ts::attachPresentation()`.

Do not delete these files in B. Once runtime presentation stops using them they can remain dead/transitional until E, avoiding a combined migration+cleanup milestone.

Heightfield representation is already retained from A, so the heavy SDF worker rebuild is no longer necessary for heightfield presentation. Prefer a small heightfield presentation builder over generalising the SDF extraction protocol. If measured mesh assembly is cheap, build its data on activation on main; if a queue is retained for hitch control, keep the same request/cancel/generation semantics without serialising/rebuilding the representation. Do not introduce a worker mechanically.

`peekStreamingDebug()` currently reports SDF extraction queue counts; B must keep the debug API coherent (e.g. equivalent heightfield job counts or zero for synchronous build) rather than leaving references to a disposed extraction client.

### Heightfield mesh code to productionise

Authoritative source: `src/debug/caves/caveHeightfieldMesh.ts`.

Extract/adapt:

- `marchCellRing()` — shared contour triangulation helper;
- pure `buildHeightfieldMeshBuffers()`;
- geometry wrapper/finalizer as production presentation code;
- metrics useful for existing cave performance logging.

Final spike mesh rules are mandatory:

- floor and ceiling use the same `gap = 0` contour;
- shared rim vertices weld floor and ceiling;
- no vertical boundary-wall strip;
- ceiling is clipped where cave void reaches the walk surface;
- open-sky contour uses the same surface clip epsilon.

Keep Three.js wrappers in a presentation module, not in `CaveHeightfieldRepresentation`.

A reasonable split is:

```text
src/world/caves/caveHeightfieldMesh.ts          // CPU buffers + geometry helpers
src/world/caves/caveHeightfieldPresentation.ts  // THREE group/mesh/mask/framing if useful
```

Avoid a new manager; `createCaves()` already owns cave presentation lifecycle.

### Terrain mouth/cutout ownership

Current production mouth integration is only a height depression:

```text
createCaves()
  -> mouthCarveDiscs(def.entrance)
  -> chunkManager.modifyTerrain(..., 'system')
```

That must remain as the deterministic walk-surface recess, but it is not a real hole.

Current terrain render path:

```text
ChunkManager tile + runtime modifications
  -> requestChunkMeshData()/computeChunkMeshData() in chunk worker
  -> buildChunkGeometry()
  -> THREE.PlaneGeometry with the full regular-grid index
```

`buildChunkGeometry()` currently changes vertex Y/normal/color attributes but does not remove/clip terrain triangles. Therefore B needs a persistent cave-aware terrain cutout contract owned by `ChunkManager`/terrain mesh lifecycle, not a one-off edit of the currently loaded `THREE.BufferGeometry`.

Recommended ownership:

- `createCaves()` derives/registers deterministic mouth cutout descriptors after heightfields exist;
- `ChunkManager` retains those system cutouts for its own lifetime and triggers re-mesh of already-loaded affected chunks;
- every later chunk mesh attach/rebuild applies the same cutout, so unload/reload, dig, scorch and prepare rebuilds cannot restore the terrain lid;
- system cutouts are deterministic world-build state and should not be persisted as player terrain modifications.

Do not put cave representation objects into the chunk worker protocol. A cutout descriptor/query should be a narrow terrain-facing shape, ideally bounded and cave-id keyed.

### Exact cutout contour

Reuse the final spike's proven seam, not coarse whole-quad deletion:

```text
mouthOpeningAt(field, walkSurfaceAt, x, z)
  = min(
      sampleHeightfieldAt(field,x,z).gap,
      ceilY - (walkSurfaceAt(x,z) - SURFACE_CLIP_EPS)
    )
```

Positive means terrain must be absent. The debug harness `buildSurfaceMesh()` uses the same `marchCellRing()` contour to clip terrain exactly to that zero crossing. Production may implement equivalent indexed-grid clipping in terrain code, but it must preserve the shared contour principle.

Important terrain facts:

- debug `SURFACE_STEP = 0.5` is a fixture choice; production terrain is currently a regular chunk grid (`chunkSize/(resolution-1)`, normally ~1 m). Do not copy the debug surface mesh wholesale;
- dropping an entire production terrain quad when one corner is open recreates the spike's rejected side gaps;
- cutout must be correct across chunk boundaries;
- any mesh-cache key/data cache affected by cutout topology must include a cutout epoch/key, or the cached full-lid mesh data/index can be reused incorrectly;
- terrain sampling/collision height remains the walk surface; the hole is presentation topology. Gameplay cave ownership still stays SDF until D.

### Reuse the validated entrance seam

Keep/reuse:

- `mouthCarveDepth()` / `mouthCarveDiscs()` for the approach recess;
- topology entrance anchor/yaw/width/height;
- heightfield `buildEntranceInfluence()` for the actual cave aperture;
- `mouthOpeningAt()` as the shared opening contour;
- heightfield ceiling clipping on that contour;
- contour-driven presentation framing only as optional masking/visual dressing.

Do not blindly keep current production `createLargeCaveVisual()` framing. The final spike explicitly replaced that V1 rock-lined-trench arrangement for heightfield validation because it can cross the approach and uses the wrong surface anchor. If rocks remain, adapt the spike's contour-driven `buildMouthRocks()` idea: place presentation rocks just outside the actual opening contour, on `walkSurfaceAt`, with no gameplay/collision authority.

### Underside gap masking

The final spike contains `buildMouthUndersideMaskBuffers()` / `createMouthUndersideMask()` in `src/debug/caves/caveHeightfieldMesh.ts`.

This is presentation-only insurance against grazing camera angles seeing tiny residual terrain/cave seam gaps. Production ownership should sit beside the heightfield presentation mesh (same cave group), not in representation, gameplay queries or terrain collision.

Lifecycle contract:

- create when cave presentation activates;
- add to the same cave presentation group;
- no colliders;
- remove/dispose with `disposePresentation()` / `disposeObject3D()`;
- do not use it to hide a structurally wrong cutout. The raw entrance should remain valid without decorative rocks; the mask is for sub-cell residual seams only.

### B must not switch gameplay/collision/camera

Leave the following SDF-backed in B:

- `Caves.queryGround()`;
- `Caves.occupancyAt()`;
- `Caves.queryInterior()`;
- `contains()` / `sampleFloor()` / `sampleCeiling()`;
- `buildCaveSdfColumnIndex()`;
- `buildCaveSdfColliders()` and `caveMouthColliderFilter()`;
- player ground wiring in `src/app/createApp.ts`;
- camera boom occupancy wiring;
- cave interior signal in `src/app/gameLoop.ts`.

This intentionally creates a temporary B state where render/terrain mouth is heightfield while gameplay/collision is SDF. That is acceptable only if A/B tests verify both representations still agree enough at the entrance for traversal. C/D remove this split.

### B lifecycle/disposal checks

Preserve:

- `presentations: Map<caveId, Object3D>` ownership;
- group naming / scene attach pattern where diagnostics depend on it;
- `createCaveStreamingController()` activation/deactivation hysteresis;
- stale generation rejection;
- `disposePresentation()` on deactivation and stale completion;
- `Caves.dispose()` -> streaming cleanup before shared presentation material disposal;
- shared material ownership: do not let `disposeObject3D()` dispose a shared material per cave unless the existing `userData.sharedGpu` convention handles it; mirror current material lifetime.

Targeted B tests should cover repeated activate/deactivate, stale/cancelled build results if any async path remains, and repeated chunk rebuild/load around the mouth.

### Milestone B — implemented (2026-09-11)

Implemented on `main` after the recon above. Current code remains authoritative for C.

#### What landed

```text
heightfield → production presentation mesh (main-thread, streamed)
heightfield → real terrain mouth aperture (persistent ChunkManager cutout)

SDF → queryGround / queryInterior / contains / sampleFloor / sampleCeiling
SDF → occupancyAt (camera) / colliders
```

No gameplay, collision, camera, fauna/NPC or location consumer changed. `createCaves.test.ts` asserts `queryGround` / `occupancyAt` / `queryInterior` still call the SDF column index and that relevance colliders are the SDF beads.

#### Production mesh ownership

- `src/world/caves/caveHeightfieldMesh.ts` — pure CPU buffers: `buildHeightfieldMeshBuffers(field)` (floor + ceiling from `floorY`/`ceilY`, shared `gap = 0` rim vertices, no wall strip, ceiling clipped on `ceilY = surfaceY − SURFACE_CLIP_EPS`, deterministic, `HeightfieldMeshBuffers` metrics) and `buildMouthUndersideMaskBuffers(field, mouthOpening, walkSurfaceAt)`.
- `src/world/caves/caveHeightfieldPresentation.ts` — Three.js only: `createCaveHeightfieldMaterial()` (vertex colours, smooth normals, `FrontSide`), `createMouthUndersideMaskMaterial()`, `createCaveHeightfieldGeometry()`, `createMouthUndersideMask()`, `createMouthRocks()`, `createCaveHeightfieldPresentation({ field, walkSurfaceAt, caveMaterial, maskMaterial, rocks })` → `{ group, buffers, maskVertices, rockCount, assembleMs }`.
- `src/terrain/gridContour.ts` — `CELL_RING`, `marchCellRing()` (moved out of debug; shared by cave mesher and terrain cutout).
- `src/debug/caves/caveHeightfieldMesh.ts` is now a re-export shim (spike names preserved); the debug mesh test file was folded into `src/world/caves/caveHeightfieldMesh.test.ts`.

Group layout per cave: `cave:<id>` → `cave-interior:<id>` (mesh), `cave-mouth-mask` (optional), `cave-mouth-rocks` (optional). Materials are owned by `createCaves()` (`userData.sharedGpu = true`, disposed once in `Caves.dispose()`); `disposeObject3D()` disposes per-cave geometry and per-rock materials.

#### Presentation lifecycle

`createCaveStreamingController()` is unchanged (55/80 m, generations, `markBuilding`/`accept`/`fail`). The producer is `createCavePresentationQueue()` in `cavePresentationLifecycle.ts`: a nearest-first list of pending *synchronous* builds with `request` / `reprioritise` / `cancel` / `drain(maxJobs)` / `queuedCount`. `Caves.update()` calls `drain(PRESENTATION_BUILDS_PER_UPDATE = 1)` after `streaming.apply()`, so the nearest cave builds the same frame it becomes wanted and several activations spread over frames. No worker: buffer assembly for a production cave (cell 0.3 m) is a single pass over the grid; `cave presentation` hitch is still recorded through `getMonitor().recordHitch('STREAMING', …)` and `?bootMark` logs `cave.meshBuffers` / `cave.assemble` / vertices / triangles / rim / sky / mask / rocks.

`peekStreamingDebug()` now returns `CaveStreamingStats & { queuedJobs }` — pending main-thread builds; `inFlightJobs` was removed (no async path).

The SDF extraction client / protocol / worker / `sdfCaveMesh.ts` / `caveSpikeMaterial.ts` / `largeCaveVisual.ts` are no longer imported by `createCaves.ts` but remain in place for E.

#### Terrain cutout ownership

- `src/terrain/terrainCutout.ts` — narrow terrain-facing contract `TerrainCutout { id, bounds, openingAt(x,z), surfaceYAt?(x,z) }`, `cutoutsOverlappingChunk()`, and pure `buildCutChunkAttributes(meshData, resolution, chunkSize, originX, originZ, cutouts)` → `CutChunkAttributes { position, normal, color, bareGround, uv, index, cutCellCount, contourVertexCount }`.
- `src/terrain/buildChunkGeometry.ts` — `buildChunkGeometry(…, cutouts = [])`: regular `PlaneGeometry` path untouched when no cutout overlaps; otherwise an indexed `BufferGeometry` from `buildCutChunkAttributes` (same attributes incl. `uv` for the detail normal map).
- `src/terrain/chunkManager.ts` — `registerTerrainCutouts(ownerKey, cutouts)` / `clearTerrainCutouts(ownerKey)`; retained `Map` for the manager lifetime; `buildAndAttachMesh()` always passes `cutoutsOverlappingChunk(allTerrainCutouts, …)`, so initial load, unload/reload, dig, scorch and prepare rebuilds all reproduce the hole; register/clear re-meshes already-loaded overlapping chunks (cache hit → Three.js assembly only). Cleared in `dispose()`.
- `src/world/caves/caveTerrainCutout.ts` — `caveOpenSkyBounds(field)` (box of `gap > 0 ∧ openSky` nodes + 1.5 m margin) and `caveTerrainCutout(field, walkSurfaceAt)` → `{ id: 'cave:<id>', bounds, openingAt: mouthOpeningAt(field, walkSurfaceAt, …), surfaceYAt: walkSurfaceAt }`.
- `createCaves()` registers all cutouts once under owner key `'caves'` after heightfields exist (boot mark `cave.terrainCutout`) and clears them in `dispose()`. `mouthCarveDiscs` → `modifyTerrain(…, 'system')` recess is unchanged and still shapes the approach.

Cutouts are deterministic world-build state: not a `TerrainModification`, never persisted, never touch `tile.heights` / `sampleHeight` / terrain collision.

#### Mouth contour contract

`mouthOpeningAt(field, walkSurfaceAt, x, z) = min(gap, ceilY − (walkSurfaceAt − SURFACE_CLIP_EPS))` is the single contour for: the cave ceiling clip (per heightfield node via `field.surfaceY`), the terrain cutout (`openingAt`), the underside mask march and the rock framing march. Terrain-side clipping is marching squares on `keep = −openingAt` per 1 m chunk node; a cell with all four nodes kept emits `PlaneGeometry`'s own two triangles, a touched cell emits the `marchCellRing` polygon — never whole-quad deletion, never a rectangle. Because the terrain grid (1 m) is much coarser than the cave grid (0.3 m), each cut edge's crossing is bisected on the real predicate (`refineCrossing`, 6 steps) rather than lerped, and the contour vertex Y is pinned to `surfaceYAt` (the cave's sky rim sits on the walk surface). `caveTerrainCutout.test.ts` checks the production cave's contour vertices against `|openingAt| < 0.1` and `|ceilY − y| < 0.15`.

Chunk boundaries: two chunks evaluate identical world-space node values and identical bisection on the shared edge, so contour vertices coincide (tested with a disc straddling an edge and with the production cave on a shifted grid).

Cache: `ChunkMeshData` (worker output, per node) does not depend on cutouts, so `meshCacheKeyFor` / `modificationsEpoch` are unchanged; the cut index/contour vertices are rebuilt on the main thread on every attach. A cached full-lid *mesh* cannot be restored because `THREE.BufferGeometry` is never cached.

#### Underside mask ownership

Reused as-is from the spike (`buildMouthUndersideMaskBuffers`): rim beam + deep patches + 6 m under-entrance plane. Presentation-only, in the cave group, no colliders, created in `createCaveHeightfieldPresentation()` and disposed by `disposePresentation()`. It still earns its place: the 1 m terrain edge is now within centimetres of the cave rim, but between contour vertices both meshes are piecewise-linear on different grids and the terrain node heights come from the tile (roads/rivers/player digs), so hairline seams remain possible.

#### Framing ownership

`createLargeCaveVisual()` / `placeLargeCaveVisual()` are no longer used by production (`largeCaveVisual.ts` retained for E). Rocks now come from `createMouthRocks()` — the spike's contour-driven arrangement (`createLargeRock` from `decorProps`, placed 0.35 m outside the `mouthOpeningAt = 0` line on `walkSurfaceAt`, six steps along the opening axis). Presentation-only, no colliders. Toggle: `?debugDisableSystems=caveMouthRocks` (new `DebugSystemName`); the entrance must be correct without them.

#### Deviations from the pre-B recon

- `marchCellRing` lives in `src/terrain/gridContour.ts`, not in the cave mesher, because terrain code needs it and must not import cave modules for a generic grid helper.
- `TerrainCutout` grew an optional `surfaceYAt` — without it the terrain edge over the steep pit wall was ~0.3 m above/below the cave rim at 1 m resolution.
- Contour crossings are bisected on the predicate rather than lerped from node values (see contract above).
- No presentation worker/queue protocol; a 40-line main-thread queue in `cavePresentationLifecycle.ts` replaces `createCaveExtractionClient()` for production.

#### Tests (B)

- `src/world/caves/caveHeightfieldMesh.test.ts` — finite/welded buffers, determinism, winding, vertex sharing, rim shared by floor+ceiling, no ceiling over the aperture, sky rim at walk surface, mask placement/determinism.
- `src/terrain/terrainCutout.test.ts` — overlap query, no-hole == regular sheet (same index/diagonal), exact disc contour (≤ 2 cm), attribute interpolation incl. `uv`, determinism, chunk-boundary identity, surface pinning, union of cutouts, `buildChunkGeometry` cut path.
- `src/world/caves/caveTerrainCutout.test.ts` — production cave (seed `1136726869`) descriptor bounds, real 64 m / 65-node chunk cut, rebuild identity, shared-edge identity.
- `src/world/caves/cavePresentationLifecycle.test.ts` — queue ordering/cancel/generation, controller + queue activate/deactivate/stale.
- `src/world/createCaves.test.ts` — cutout registration, scene attach/detach/dispose via `update()`, shared material, SDF authority spies, dispose clears cutouts.

#### Checks (B)

```text
vitest: src/world/caves, src/world/createCaves.test.ts, src/terrain, src/debug (70 files, 730 tests)
vue-tsc --noEmit
eslint .
pnpm run build
```

No browser verification. `pnpm docs:sync` was not run.

#### Known risks after B

- Terrain node heights are tile `floorHeights` (roads, rivers, player digs applied) while the cave rim is `sampleBaseHeight − mouthCarveDepth`; a road/river corridor or a player dig at a mouth would open a vertical seam the mask may not fully cover.
- Gameplay is still SDF: the player walks the SDF floor/colliders while seeing the heightfield floor/walls; any place the two disagree by more than a step height at the entrance reads as floating/sinking until D.
- Two grids: the cave rim is piecewise-linear at 0.3 m, the terrain edge at ≤ 1 m with bisected crossings — hairline seams between contour vertices are possible at grazing angles; the underside mask is the intended cover.
- Presentation assembly is synchronous; a very large cave (many chambers) would be a single-frame hitch. Metrics are logged under `?bootMark`; no worker was added on purpose.
- `cutoutsOverlappingChunk` runs per mesh build for every chunk (cheap bounds test over a handful of cutouts).

#### Handoff for Milestone C

Start from this implemented state.

- `CaveRuntime` now carries `heightfield` and `walkSurfaceAt` (the sampler the field was built against). C's shared spatial API should take those two, not rebuild the sampler.
- Neutral contracts still to lift out of `caveSdfQuery.ts`: `CaveVerticalInterval`, `CaveGroundHit`, hysteresis helpers, `pickInterval`; `SURFACE_CLIP_EPS` already lives in `caveSurface.ts`.
- Heightfield query primitives available: `sampleHeightfieldAt`, `heightfieldNodeGap`/`heightfieldNodeOpenSky`, `mouthOpeningAt`, `heightfieldGapGradient`; debug `caveHeightfieldTraversal.ts` demonstrates column intervals / occupancy / horizontal resolve.
- `caveOpenSkyBounds()` is a cheap "where does this cave reach the surface" box that C's identity/location lookup can reuse.
- Do not touch `terrainCutout.ts` / `ChunkManager` cutout ownership in C; it is complete for the mouth. D may need `walkSurfaceAt` to stay the walk authority at the mouth (terrain `sampleHeight` there is the carved recess; the hole is presentation only).
- `definitions()` / `topologyToCaveDefinition` remain used by streaming bounds (`distanceToBoundsXZ`) and location code.

## Milestone C — Shared spatial queries + semantic cave locations

C should productionise the useful pure parts of `src/debug/caves/caveHeightfieldTraversal.ts`, not the walker/harness itself.

Candidate shared contracts:

- heightfield column -> at most one `CaveVerticalInterval`;
- Y-aware ground hit;
- strict occupancy;
- floor/ceiling/openSky sampling;
- cave identity/location lookup by representation bounds + actual `gap`/occupancy, not a camera/player state machine.

The current SDF types/helpers in `caveSdfQuery.ts` mix representation-neutral contracts (`CaveVerticalInterval`, `CaveGroundHit`, hysteresis, surface clip epsilon, `pickInterval`) with SDF index implementation. C should separate neutral contracts before deleting SDF code.

Preserve player-specific hysteresis as per-consumer state. Do not expose current `createCaves()` closure-level `lastGroundHit`/`lastInteriorRaw` as generic NPC/fauna queries.

Semantic cave identity should come from retained `CaveRuntime.topology.caveId` and topology graph. `definitions()` / `topologyToCaveDefinition()` are still used by location/discovery code (`createApp.ts`, `worldLocationCatalog.ts`, world-bundle treasure-map resolution); replace those consumers deliberately rather than deleting the adapter early.

Downstream `npc-027` needs stateless identity-bearing spatial context, not the player's hysteretic `queryGround()`.

## Milestone D — Runtime consumers, collision, camera and lifecycle

D is the authority switch.

Current production consumers to recon again immediately before implementation:

- `src/app/createApp.ts`: wraps `bundle.caves.queryGround()` for `PlayerController` and passes `bundle.caves.occupancyAt()` as cave occupancy;
- `src/player/cameraBoom.ts`: marches strict occupancy;
- `src/app/gameLoop.ts`: calls player-position `bundle.caves.queryInterior()` for cave interior effects/audio state;
- `src/world/createCaves.ts`: all public cave query methods;
- `src/world/caves/caveSdfColliders.ts`: occupancy-derived wall beads registered through `ChunkManager.registerColliders()`;
- `src/terrain/chunkManager.ts`: collider registry ownership.

The final spike demonstrates `heightfieldColumnIntervals()`, `queryHeightfieldColumn()`, `heightfieldOccupancyAt()` and `resolveHeightfieldHorizontal()`. Production D should derive collision from heightfield geometry/clearance rather than keep an SDF iso-snap dependency.

Do not blindly port debug constants for player dimensions into the cave domain. The debug traversal file intentionally duplicates player radius/height only to avoid importing the player graph; production should use a neutral collision/query contract or caller-provided dimensions so NPC/fauna can reuse the cave space.

Keep `WorldBundle` rebuild ownership unchanged and ensure no representation/query closure survives `Caves.dispose()`.

## Milestone E — SDF cleanup and final documentation

Only after repository search shows no production call-sites should E remove:

- `caveSdfField.ts` and SDF-only helpers;
- `caveSdfExtraction.ts`;
- `caveExtractionClient.ts` / protocol / worker if no generic presentation queue remains;
- `sdfCaveMesh.ts`;
- `caveSdfQuery.ts` implementation pieces after neutral contracts are moved;
- `caveSdfColliders.ts`;
- SDF-specific presentation material/config;
- transitional topology/CaveDefinition adapters no longer needed by catalog/streaming;
- debug SDF comparison paths that no longer serve diagnostics.

Before deletion, search by symbol, not filename assumptions. Some currently SDF-named modules contain neutral contracts that C/D should have moved first.

Also update stale ownership comments. Current examples of docs/code migration debt:

- `CaveTopology` is representation-neutral but imports `CaveEntrance` from legacy `caveVolume.ts` as a type;
- `productionTopology.ts` still has SDF-shaped names/comments such as `extraRunForSdf()` and `MIN_DISCONNECTED_CLEARANCE` commentary tied to `DEFAULT_SDF_PARAMS.smoothK`;
- `productionTopology.ts` imports `CAVE_MOUTH_DEPTH` through legacy `caveGenerator.ts`, while `mouthCarve.ts` is the current shared mouth owner;
- several SDF files describe themselves as final spatial authority; after D those comments/tests must move with authority.

Do not combine broad documentation cleanup with A/B implementation.

## Docs vs current code discrepancies relevant to implementation

1. Older world-terrain-018 notes describing an `inside` mask / vertical boundary wall are superseded by the final code and design doc. Final code uses floor/ceiling convergence and `gap > 0`.
2. Production has no real terrain aperture today. `modifyTerrain()` changes height samples only; `buildChunkGeometry()` still constructs a complete indexed `PlaneGeometry`.
3. Production mouth rocks in `createCaves()` still use `createLargeCaveVisual()` / `placeLargeCaveVisual()` on base terrain. The accepted spike's contour-driven rocks are different and presentation-only.
4. SDF presentation is worker-extracted, but heightfield representation is already retained data. B should not assume a worker is architecturally required just because V2 needed one.
5. Current `CaveRuntime.definition` is still needed by `definitions()` consumers and streaming bounds/grid. It is transitional, but A/B cannot simply delete it.
6. Current public cave queries expose player-oriented hysteresis in `createCaves()`. C/D must distinguish player continuity from stateless multi-entity cave-location queries.

## Largest migration risks

- Reintroducing the rejected footprint-mask/vertical-wall model from stale spike notes.
- Making production heightfield depend on SDF modules, preventing clean E deletion.
- Using streamed/mutable terrain sampling for representation build and making cave shape depend on chunk load order.
- Treating the existing mouth depression as a real terrain hole.
- Removing whole terrain quads around the mouth and recreating side gaps seen in the spike.
- Applying the terrain cutout only to currently loaded meshes, so it disappears after chunk reload/dig/rebuild.
- Switching render in B and accidentally switching query/collision/camera authority before C/D.
- Deleting the SDF worker/adapter in B and mixing migration with cleanup.
- Keeping `createLargeCaveVisual()` placement unchanged even though final heightfield entrance validation replaced that arrangement.
- Letting presentation rocks or underside mask acquire collision/gameplay authority.
- Breaking `definitions()` consumers/location IDs while removing `CaveDefinition` too early.
- Reusing stateful player hysteresis for NPC/fauna spatial context.

## Suggested targeted checks by milestone

A:

```text
vitest: production heightfield representation tests
vitest: existing SDF field/query tests touched by neutral helper extraction
tsc / project typecheck
```

B:

```text
vitest: heightfield mesh buffer + mouth contour tests
vitest: terrain cutout/grid/chunk-boundary/rebuild tests
vitest: cave presentation lifecycle tests
tsc / project typecheck
```

C:

```text
vitest: heightfield column/openSky/identity/stateless query tests
existing cave location/discovery tests
tsc / project typecheck
```

D:

```text
vitest: player cave ground regressions
vitest: cameraBoom cave occupancy regressions
vitest: collision/entrance traversal regressions
vitest: cave presentation lifecycle/disposal tests
tsc / project typecheck
```

E:

```text
repository symbol search for SDF/adapter production call-sites
cave/world-location regression tests
full targeted cave suite + typecheck/build as appropriate
```

Browser verification remains manual by the user; agents must not perform it.

## Milestone handoff protocol

Each agent implementing a milestone must:

1. read `world-terrain-019` plan + these implementation notes;
2. perform only focused recon of files relevant to that milestone and re-check symbols against current `main`;
3. implement only its assigned milestone;
4. run targeted checks for that milestone;
5. update this file with:
   - what was actually changed,
   - new/changed symbols and files,
   - architectural decisions,
   - deviations from this recon,
   - risks/required follow-up for the next milestone;
6. commit and push to `main` (rebase first if `main` moved);
7. stop — do not begin the next milestone.

Do not run `pnpm docs:sync` as part of these milestone handoffs unless explicitly requested separately.
