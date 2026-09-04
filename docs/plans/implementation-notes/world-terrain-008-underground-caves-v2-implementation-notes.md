# Implementation Notes: Underground Caves V2

> Plan: `docs/plans/world-terrain-008-underground-caves-v2.md`
> V1 plan: `docs/plans/world-terrain-007-underground-caves.md` (+ its notes/contract/review)
> Recon date: **2026-09-04**, against `main` @ `2ddd86ec`.

These notes are the code-level map for the agent implementing **Milestone A only**
(shared `CaveTopology` + Sweep spike + SDF spike + comparison harness + metrics).
They record what the current code actually does, not what the plan or the research
assumes. Where the plan and the code disagree, the code is recorded and the
divergence is called out in *Plan / Code Discrepancies*.

---

## Scope

**In scope for the agent reading this:** Milestone A, up to and including
technical verification. Stop before the architecture decision gate.

**Explicitly not in scope:** Milestone B, production spatial representation,
`CaveVolume` generalisation, collision refactor, camera fix, entrance rework,
V1 removal, `generatorVersion`, fauna/loot/persistence.

**Naming collision to know about before you grep:** there are *two* unrelated
"cave" things in this repository.

| | Real cave system (this plan) | Fauna habitat "cave" |
|---|---|---|
| Code | `src/world/cave*.ts`, `src/world/createCaves.ts`, `src/world/largeCave*.ts` | `src/fauna/createFauna.ts` `SPAWNER_SPECS` `{ type: 'cave' }` + `createCaveMouth()` in `src/settlement/props.ts` |
| What it is | Walk-in interior with volume/collision/streaming | A decorative rock-mouth prop + a `PreySpawner` spawn point (wolf/bear den) |
| Relation | none — separate placement, separate lifecycle, separate ids | none |

Do **not** touch the fauna one. It is not part of Cave V2 and re-anchoring it to a
real cave volume is a V1 §Faza-4 idea that was never implemented.

---

## Current V1 Architecture

### Files and their real responsibilities

| File | Lines | Owns |
|---|---|---|
| `src/world/largeCaves.ts` | 133 | World-scale **siting**: `pickLargeCaveSites()` → `LargeCaveSite[]`. Slope/coast/mountain-ridge/road/village/separation filtering. Pure. |
| `src/world/caveGenerator.ts` | 274 | **Layout + validation**: expands one `LargeCaveSite` into a `CaveDefinition`; overburden rejection; `makeCaveId()`. Pure. |
| `src/world/caveVolume.ts` | 211 | **Domain data + spatial queries**: `CaveDefinition`/`CaveNode`/`CaveTunnel`/`CaveEntrance`/`CaveBounds` types, `createCaveVolume()`, `computeCaveBounds()`. Pure. |
| `src/world/caveMesh.ts` | 141 | **Presentation**: `createCaveInteriorMesh(definition)` → one merged `THREE.Mesh`. |
| `src/world/caveColliders.ts` | 104 | **Collision derivation**: `buildCaveWallColliders(definition)` → `Collider[]` (circle beads with `minY`/`maxY`). Pure. |
| `src/world/largeCaveVisual.ts` | 70 | Mouth **rock framing** props: `createLargeCaveVisual()`, `placeLargeCaveVisual()`. |
| `src/world/createCaves.ts` | 210 | **Runtime owner**: `createCaves()` → `Caves`. Terrain carve, streaming grid, activate/deactivate, collider registration, world-facing queries, dispose. |

Tests: `caveGenerator.test.ts` (129), `caveVolume.test.ts` (91),
`caveColliders.test.ts` (57), `largeCaves.test.ts` (49).

`docs/CODE_INDEX.md` currently has **no cave entry at all** — that is why a plain
index lookup finds nothing. Use this table instead.

### Exact data flow

```text
WorldConfig.seed                                   (config/worldConfig.ts, parseSeedFromUrl)
   │
   ▼  app/worldBundle.ts:754-762   bootMark('createCaves')
createCaves(scene, chunkManager, seed, homeFootprintRadius, coastThreshold)
   │
   ├─► generateCaveDefinitions({ seed, sampleHeight, sampleContinentalness,
   │        sampleMountainRidge, waterLevel, coastThreshold, roadsNear, villages })
   │        │
   │        ├─► pickLargeCaveSites(input) ──────────────► LargeCaveSite[]
   │        │      random = createSeededRandom(seed ^ 0xca7e51)
   │        │      10 attempts-limited candidates, ring 130..620 m, ≥110 m from home
   │        │
   │        └─► buildCaveFromSite(seed, site, sampleHeight) ──► CaveDefinition | null
   │               random = createSeededRandom(seed ^ 0x51ed270b ^ x*97 ^ z*131)
   │               makeCaveId(seed, site)   →  "cave:xxxxxxxx"
   │               tunnelOverburdenOk() / overburdenOk()  →  null = site rejected
   │
   ├─► volumes = definitions.map(createCaveVolume)          (all caves, eagerly)
   │
   ├─► per cave: chunkManager.modifyTerrain(...,'system') × 2
   │        approach dip  r=3.2  d=1.35   at entrance + outDir*2.2
   │        mouth pit     r=1.65 d=2.40   at entrance
   │
   └─► grid: Map<"cx,cz", CaveDefinition[]>   CAVE_GRID_CELL = 500 m

bundle.caves : Caves                              (app/worldBundle.ts:138)
   │
   ├─ app/gameLoop.ts:1819   caves.update(playerX, playerZ)   — every frame, unthrottled
   │      3×3 grid cells → distanceToBoundsXZ
   │      ≤ ACTIVATE_DISTANCE   (55) → activate(def)
   │      ≥ DEACTIVATE_DISTANCE (80) → deactivate(caveId)
   │      activate:   Group("cave:<id>")
   │                    + createCaveInteriorMesh(def)
   │                    + createLargeCaveVisual/placeLargeCaveVisual (framing rocks)
   │                  scene.add(group)
   │                  chunkManager.registerColliders("cave:<caveId>", buildCaveWallColliders(def))
   │      deactivate: removeFromParent + disposeObject3D + chunkManager.clearColliders
   │
   ├─ app/createApp.ts:591  caveGroundQuery: CaveGroundQuery
   │      caves.contains(x,y,z) → caves.sampleFloor(x,z) → caves.sampleCeiling(x,z)
   │      → PlayerController.create(...) / player.setGround(...)
   │
   └─ world/locations/worldLocationCatalog.ts
          caves.definitions() → WorldLocation { id: "cave:<caveId>", kind:'cave',
                                                x/z = entrance }
```

### Ownership and lifecycle

| Concern | Owner | When |
|---|---|---|
| Siting + layout + identity | `caveGenerator.ts` / `largeCaves.ts` (pure) | once, at `createCaves()` |
| All `CaveDefinition`s | `createCaves()` closure | eagerly at world build — **never streamed** |
| All `CaveVolume`s | `createCaves()` closure | eagerly, one per definition |
| Mouth terrain recess | `ChunkManager.modifications` (`source: 'system'`) | once at world build, replayed every build, never persisted |
| Interior mesh + framing rocks | `createCaves()`'s `active: Map<caveId, Object3D>` | lazily, on streaming activate |
| Wall colliders | `ChunkManager`'s `ColliderRegistry` under key `cave:<caveId>` | lazily, on streaming activate |
| `Caves` handle | `WorldBundle.caves` | created in `buildWorldSystems`, disposed in both dispose paths (`worldBundle.ts:1152`, `:1226`) |

**Persistent vs derived:** *nothing* about caves is in `SaveData` — no cave records,
no geometry, no terrain modification (the mouth carve is `'system'`, deliberately
excluded from `SaveData.terrainModifications`). The only persisted cave-derived
value is the **string** `"cave:<caveId>"` inside `SaveMap.discoveredLocations[].id`
and `SaveMap.targets` (plan world-012). `worldLocationCatalog.caveLocationFromCaveId()`
returns `null` for an unknown id and `navigationTargets.restore` re-validates, so a
changed id degrades gracefully (the player silently loses that discovery) rather
than corrupting a save.

**Rebuild:** `rebuildWorldBundle` disposes `bundle.caves` and builds a fresh one.
Nothing is carried across (unlike `carriedEconomies`/`carriedHouseholds`), which is
correct — cave state is fully derived from `(seed, terrain)`. `caveGroundQuery` in
`createApp.ts` deliberately reads `bundle.caves` **fresh on every call** instead of
capturing it, so it survives a rebuild without re-wiring.

---

## Reuse / Adapt / Replace Matrix

Judged for **Milestone A**. "Adapt (B)" means: leave alone now, expect change in
Milestone B.

| Mechanism | Symbol / file | Verdict | Note |
|---|---|---|---|
| Cave siting | `pickLargeCaveSites()` `largeCaves.ts` | **REUSE** | Works, deterministic, filters are sound. Not under test in the spike. |
| Entrance placement | `LargeCaveSite.yaw` + `openingDirection()`/`tunnelDirection()` | **REUSE** | The spike consumes the same entrance anchor. |
| Overburden validation | `tunnelOverburdenOk()`/`overburdenOk()` `caveGenerator.ts` | **REUSE (A) / ADAPT (B)** | Currently validates *straight segments between node centres*. A curved topology centerline needs it re-expressed over polyline samples — that is Milestone B. In Milestone A keep the V1 acceptance path untouched and take its already-accepted entrance. |
| Deterministic identity | `makeCaveId(seed, site)` | **REUSE** | Hash of `seed` + rounded site x/z. Order-independent, rebuild-stable. Persisted indirectly (see above) — do not change its inputs. |
| Seeded RNG | `createSeededRandom()` `world/parseSeed.ts` (mulberry32) | **REUSE** | The only RNG the world layer uses. Both spikes must derive from it. |
| Topology / layout generation | `buildCaveFromSite()` | **REPLACE (B)**, extend beside it in A | It is the thing producing the pipe look. See *CaveTopology Integration Point*. |
| `CaveDefinition` / `CaveNode` / `CaveTunnel` | `caveVolume.ts` | **REUSE as L1 adapter (A)** / **UNKNOWN (B)** | In A the spike derives one of these so it can reuse volume+colliders unchanged. Its fate is a post-gate decision (plan §17). |
| `CaveVolume` queries | `createCaveVolume()` | **REUSE (A)** / **UNKNOWN (B)** | Hard 2.5D — see *CaveVolume / Spatial Query Constraints*. Do not generalise before the gate. |
| Cave geometry | `createCaveInteriorMesh()` `caveMesh.ts` | **REPLACE** | This is exactly what the spike replaces. Keep it intact and untouched for the V1 path. |
| Mouth rock framing | `createLargeCaveVisual()`/`placeLargeCaveVisual()` | **REUSE** | Both spikes should keep it, so mouth appearance is not a comparison variable. |
| Terrain mouth carve | `createCaves.ts` `modifyTerrain` ×2 | **REUSE (A)** / **ADAPT (B)** | Known quality problem (loose end 2026-09-03) but identical for both variants, so it does not bias the comparison. |
| Collision derivation | `buildCaveWallColliders()` `caveColliders.ts` | **REUSE (A)** / **ADAPT (B)** | Both variants share the same proxy in A. See *Collision Integration*. |
| Collider registry | `ColliderRegistry` `world/collision.ts` + `chunkManager.registerColliders/clearColliders` | **REUSE — do not fork** | Plan invariant. Vertical envelope (`minY`/`maxY` + `colliderActiveAtY`) already exists. |
| Ground query seam | `CaveGroundQuery` `PlayerController.ts:162` + `createApp.ts:591` | **REUSE** | Already the right abstraction shape; the spike needs no change here. |
| Player vertical motion | `integrateVerticalMotion()` `verticalMotion.ts` (`maxY` ceiling clamp) | **REUSE** | Already cave-aware. |
| Camera boom | `resolveCameraBoom()` `player/cameraBoom.ts` | **DO NOT TOUCH IN A** | Broken in caves for a representation-independent reason — see *Camera Integration*. |
| Streaming | `Caves.update()` + `CAVE_GRID_CELL`/activate/deactivate | **REUSE** | Cheap and correct. Do not rebuild. |
| Lifecycle / disposal | `Caves.dispose()`, `WorldBundle` | **REUSE** | Plan invariant. |
| World location catalog | `worldLocationCatalog.ts` | **REUSE, unchanged** | Reads `definitions()` + `entrance` only. Any spike cave that keeps a `CaveDefinition` shows up on the map for free. |
| `largeCaveVisual`/`largeCaves` naming | — | **REMOVE AFTER MIGRATION (B)** | Legacy names from plan 090; still load-bearing today. Do not rename in A. |

---

## CaveTopology Integration Point

### What already looks like topology

`CaveDefinition` is already Three.js-free, deterministic, pure data, and already
carries `entrance`, a node/edge graph and bounds. That is ~60 % of a topology.

**But it is not topology**, because the *same* fields are simultaneously the exact
analytic geometry that three consumers independently re-derive:

- `caveVolume.ts` reads `node.radius` / `tunnel.radius` / `ceilingHeight` as a
  cylinder/half-pipe for containment and floor/ceiling sampling;
- `caveMesh.ts` reads them as the sweep parameters of the rendered arch;
- `caveColliders.ts` reads them as the bead ring radius.

So `CaveNode.radius` is at once "intended chamber size" (topology) and "the circle
the wall is on" (representation). That is the "geometry-derived topology
assumption" the plan wants split, and it is the reason a new representation cannot
simply be dropped in.

### Where the boundary belongs

```text
LargeCaveSite            ← siting        (largeCaves.ts, unchanged)
      ↓
CaveTopology             ← NEW: gameplay intent, no geometry parameters
      ↓
CaveSpatialRepresentation ← the thing under test (Sweep | SDF)
      ↓
CavePresentation         ← BufferGeometry / Mesh
```

Insertion point: **between `pickLargeCaveSites()` and everything else**. Concretely,
`buildCaveFromSite()` is where intent and representation are currently fused; the
new topology builder sits beside it, consuming the same `LargeCaveSite`.

### Minimal Milestone-A shape

Add `src/world/caves/caveTopology.ts` (a new `caves/` subfolder keeps the spike
visually separable; the existing `src/world/cave*.ts` files stay where they are).

Suggested contract — keep it this small:

```text
CaveTopologyNodeKind   'entrance' | 'passage' | 'constriction' | 'widening' | 'chamber'
CaveTopologyFeatureKind 'shelf' | 'overhang'

CaveTopologyNode    id, kind, position {x,y,z}, targetWidth, targetHeight
CaveTopologySegment id, from, to, centerline: readonly {x,y,z}[]   (control points,
                                                                    ≥2, world space)
CaveTopologyFeature id, kind, anchorNodeId, position, size
CaveTopology        caveId, seed, entrance: CaveEntrance,
                    nodes, segments, features, minClearance
```

Rules to hold the line:

- **No representation parameters.** No SDF cell size, no marching-cubes resolution,
  no ring step, no profile index, no noise octave count, no `THREE` import. If a
  field would only make sense to one of the two spikes, it belongs in that spike's
  own params type, not here.
- `targetWidth`/`targetHeight` are *intent* ("this should be walkable and about this
  big"), and each spike is free to interpret them; they are not the wall position.
- `centerline` is a polyline of control points, not a swept radius — it is what
  makes a bend expressible without either spike inventing its own path model.
- `features` is how the shelf/overhang is stated as intent so Sweep cannot quietly
  skip it.
- Reuse `CaveEntrance` from `caveVolume.ts` rather than defining a second entrance
  type — it is already representation-neutral (`x/y/z/yaw/width/height`).
- Add JSDoc with `@domain world-terrain` on `CaveTopology` and the builder function
  (`scripts/claude/pre-implementation.ts` preflight discovery relies on it).

Add `src/world/caves/spikeTestCave.ts` with a single deterministic builder for the
shared test cave (plan §8 / research §3, ~27 m):

```text
buildSpikeTestTopology(seed: number, entrance: CaveEntrance): CaveTopology
```

`entrance` comes from an existing accepted `CaveDefinition` — see the harness
below — so the spike is anchored in the real world, at real terrain, with the real
mouth carve, and both variants get bit-identical input.

**Do not** route V1's `buildCaveFromSite()` through `CaveTopology` in Milestone A.
V1 must keep working unchanged so it stays a comparison baseline and so a failed
spike costs nothing.

---

## Shared Comparison Harness

This is the part most likely to be over-built. Keep it to one branch in one file.

### Selection

Reuse the existing URL-flag convention in `src/debug/debugMode.ts` (`urlFlag` /
`urlParamValue` are already there — do not write a new parser):

```text
?caveSpike=sweep | sdf | off   (absent ⇒ off ⇒ pure V1 behaviour)
```

Add one exported reader next to the other `isXDebugMode()` functions, e.g.
`caveSpikeVariant(): 'sweep' | 'sdf' | null`, using `urlParamValue('caveSpike')`.
It is one function and one `export`, deleted in one edit after the gate.

### Wiring point

`createCaves()` (`src/world/createCaves.ts`) is the single place that knows about
both definitions and presentation, so it is the only place the branch belongs.

```text
createCaves()
  definitions = generateCaveDefinitions(...)          ← unchanged
  variant = caveSpikeVariant()
  if (variant) {
      spikeTarget = definitions[0]                     ← deterministic: pickLargeCaveSites
                                                         order is seed-stable
      topology    = buildSpikeTestTopology(seed, spikeTarget.entrance)
      spikeMesh   = variant === 'sweep' ? buildSweepCaveMesh(topology, params)
                                        : buildSdfCaveMesh(topology, params)
      spikeDef    = topologyToCaveDefinition(topology)  ← L1 walkable proxy, shared
  }
  activate(def):
      group.add(def === spikeTarget && variant ? spikeMesh() : createCaveInteriorMesh(def))
      ... framing rocks unchanged ...
      registerColliders(key, buildCaveWallColliders(def === spikeTarget && variant
                                                     ? spikeDef : def))
```

Consequences, all deliberate:

- **One cave** changes. Every other cave in the world stays on the V1 path, so V1 is
  never "half migrated".
- Both variants share the **same entrance, same seed, same mouth carve, same framing
  rocks, same material family, same lighting, same camera, same streaming** — plan
  §12 satisfied without a second scene.
- Both variants share the **same walkable proxy** (`spikeDef` → `createCaveVolume`
  + `buildCaveWallColliders`), so floor/collision quality is *not* a comparison
  variable and neither mesh becomes authoritative collision.
- Removal after the gate = delete `src/world/caves/`, delete the branch, delete the
  flag reader. No production type changes to unwind.

### Reaching the spike cave without writing a teleport

The spike cave sits 130–620 m from spawn. Existing `?debug=1` tooling already
covers this — do **not** add a teleport:

```js
seedvale.debug.worldLocations.list().filter(l => l.kind === 'cave')
seedvale.debug.teleportTo({ kind: 'village', position: { x, z }, distance: 0 })
```

`teleportTo` takes plain data and never branches on `kind`
(`src/debug/npcDebugApi.ts:263-272`). Additionally, log the chosen spike cave's
`caveId` and entrance x/z to the console once when the flag is on, so the player can
copy-paste it.

### Structural-vs-detail toggle (plan §11, mandatory test)

Reuse `DebugSystemName` in `src/debug/debugMode.ts` — it is exactly this seam
(`?debugDisableSystems=grass,trees`). Add one member, e.g. `'caveDetail'`, and have
both spike builders check `isSystemEnabled('caveDetail')` before applying
small-scale surface deformation. One union member, one call per builder; no new
flag, no new UI, no runtime toggle plumbing.

---

## Sweep Spike Boundary

New file: `src/world/caves/sweepCaveMesh.ts`.

- Input: `CaveTopology` + a *sweep-local* params type (profile keyframes, ring
  density, perturbation amplitudes, noise scales). Params live here, never in
  topology.
- Output: `{ geometry: THREE.BufferGeometry, metrics: CaveSpikeMetrics }` or a
  `THREE.Mesh` — pick one shape and use it for both spikes.
- Must genuinely attempt, per plan §9: asymmetric profiles, profile keyframes,
  variable width **and** height independently, independent floor/ceiling/wall
  shaping, centerline perturbation, local widening, chamber transition, multi-scale
  deformation. A `radius + noise` ring sweep is an explicit non-answer.
- Optional junction stress test: extend the topology's `segments` with the short
  side branch and inspect for overlap/seam/pinch/broken floor at the junction.
- **Reuse** `caveMesh.ts`'s existing builder pattern (`positions[]`/`indices[]`
  arrays + `pushVertex`/`pushQuad` + `computeVertexNormals`) — it is small, proven,
  allocation-cheap and keeps the two spikes structurally comparable. Copy the
  pattern into the spike file; do not import from or modify `caveMesh.ts`.
- Material: build both spikes with the same material config `caveMesh.ts` uses
  (`MeshStandardMaterial`, `ROCK_COLOR 0x4d453e`, `roughness 1`, `flatShading`,
  `DoubleSide`) so shading is not a comparison variable. If you want them literally
  identical, export the material factory from the spike's own shared module, not
  from `caveMesh.ts`.

## SDF Spike Boundary

New file: `src/world/caves/sdfCaveMesh.ts` (+ whatever local mesher file it needs).

- Local only: sample an SDF over a bounded grid covering `CaveTopology`'s bounds
  plus margin. **No global voxel terrain, no chunked volume system, no worker.**
- Input: `CaveTopology` + an *sdf-local* params type (cell size, smooth-union k,
  noise scales, iso level).
- Mesh extraction: pick the simplest thing that produces an inspectable surface.
  There is **no existing marching-cubes/dual-contouring implementation in this
  repository** (verified: nothing under `src/` implements one, and `three` addons
  are not used for this anywhere) — so the mesher is part of the spike cost, which
  is itself a legitimate input to the decision. Keep it inside `src/world/caves/`.
- Must run the plan §10 accidental-union stress test: two spatially close but
  topologically disconnected sections, checked for a spurious smooth-union bridge.
- Same material/lighting as Sweep.

Neither spike may write to `ChunkManager`, the `ColliderRegistry`, `WorldBundle`, or
`SaveData`. They are pure `CaveTopology → geometry + metrics` functions. That purity
is what makes them unit-testable and disposable.

---

## Disposable Spike Boundary

What survives the gate, and what does not:

| Artefact | After gate |
|---|---|
| `src/world/caves/caveTopology.ts` | **Keeps** — shared contract, both Milestone B directions need it |
| `src/world/caves/spikeTestCave.ts` | Keeps initially (it is the L1 cave's shape source), may be re-derived |
| `src/world/caves/sweepCaveMesh.ts` / `sdfCaveMesh.ts` | One is deleted outright |
| `caveSpikeVariant()` flag + `createCaves()` branch | **Deleted** — must not become production architecture |
| `'caveDetail'` in `DebugSystemName` | Keep only if the structural/detail split survives into production |
| `CaveSpikeMetrics` + console reporting | Keep only if still useful; otherwise delete with the losing spike |

Enforcement, cheaply: keep **all** spike code under `src/world/caves/` except two
one-line touch points (`debugMode.ts` flag reader, `createCaves.ts` branch). If you
find yourself changing a fourth production file, the spike has leaked.

---

## CaveVolume / Spatial Query Constraints

### Exact API (`src/world/caveVolume.ts:105-124`)

```text
CaveVolume {
  definition
  containsHorizontal(x, z)                  → boolean   (broad-phase only)
  contains(x, y, z)                         → boolean
  sampleFloor(x, z)                         → number | null
  sampleCeiling(x, z)                       → number | null
  distanceToInteriorBoundary(x, y, z)       → number     (debug/broad-phase, not collision)
  bounds()                                  → CaveBounds
}
```

### The 2.5D limitation, confirmed in code

- `samplesAt(definition, x, z)` returns *all* primitives whose XZ footprint contains
  the point — so multiple floor/ceiling pairs genuinely exist internally.
- But `sampleFloor` collapses them with `Math.min(floorY)` (line 142) and
  `sampleCeiling` returns the ceiling **of whichever sample has the lowest floor**
  (lines 144-149). Both are **Y-independent**.
- `contains(x, y, z)` *is* Y-aware, so containment already supports stacked space —
  the collapse happens only in the floor/ceiling accessors.

So the limitation is narrower than "2.5D everywhere": it is specifically
`sampleFloor`/`sampleCeiling` discarding the caller's Y. A stacked upper/lower route
at the same X/Z would be *detected* by `contains` but the player would always be
given the lower floor.

### Call sites (complete)

| Caller | Uses |
|---|---|
| `createCaves.ts:183-205` `Caves.contains/sampleFloor/sampleCeiling` | folds over **every** volume (not only active ones) |
| `createApp.ts:591-597` `caveGroundQuery` | `contains` → `sampleFloor` → `sampleCeiling`, three separate folds |
| `PlayerController.groundAt()` (`:914-918`) | the only gameplay consumer |
| `caveVolume.test.ts` | contract coverage |

`containsHorizontal` and `distanceToInteriorBoundary` currently have **no production
callers** — only the type definition and tests. Do not build on them assuming they
are load-bearing.

### For Milestone A

**Do not change `CaveVolume` at all.** The spike's `topologyToCaveDefinition()`
adapter produces a node/tunnel `CaveDefinition` that approximates the topology's
walkable corridor, and `createCaveVolume` consumes it unchanged. This is exactly the
"L1 adapter" the plan §17 anticipates.

What would block later upper/lower routes (record, do not fix): the two accessors
above, and `PlayerController.groundAt()`'s assumption that one `(x, z)` yields one
floor. The fix shape is "return a floor *interval set*, pick by Y" — but designing
it now would prejudge the representation.

---

## Collision Integration

### Registry facts

- `src/world/collision.ts`: `Collider = CircleCollider | ObbCollider`, both
  extending `VerticalExtent { minY?, maxY? }`. `colliderActiveAtY(collider, y)` is
  the query-side filter.
- `ColliderRegistry`: `setColliders(ownerKey, colliders)` / `clearColliders(ownerKey)`
  / `query(x, z)`. **XZ-only spatial index**, buckets sized like a terrain chunk, 3×3
  neighbourhood query.
- `ChunkManager` re-exports these as `registerColliders` / `clearColliders` /
  `collidersNear`.
- Owner key for caves: `` `cave:${caveId}` `` (`createCaves.ts:64-66`) — stable,
  never a chunk key, registered on activate and cleared on deactivate.
- Cave wall model (`caveColliders.ts`): overlapping circle **beads**,
  `WALL_STEP 0.85`, `WALL_BEAD_RADIUS 0.5`, `VERTICAL_PAD 0.2`; chamber rings skip an
  angular gap at each connected tunnel so junctions stay passable.

### Who filters by Y

Only `PlayerController.collidersNearAtHeight()` (`:923-926`). NPCs, fauna and
navigation call `collidersNear` **without** the Y filter, so a surface NPC walking
over a cave tunnel is still pushed by that tunnel's invisible walls. That is a
pre-existing V1 gap, unchanged by Cave V2 — record it, do not fix it here.

### Milestone A position

Milestone A needs **zero production collision changes**. Both variants register
`buildCaveWallColliders(spikeDef)` under the same `cave:<caveId>` key through the
same `registerColliders` call that already exists. Do not:

- derive colliders from either spike mesh (render mesh must never become
  authoritative collision — plan §4);
- add a BVH/raycast collision path;
- introduce a second registry, a `CaveCollisionManager`, or a new `Collider` shape.

**Say this in the comparison report:** the walkable proxy is an approximation of both
meshes, so the player *will* be able to visually clip into wall bulges. Collision
fidelity is explicitly not under evaluation in Milestone A; that is Milestone B work
(a proxy derived from the chosen representation, still through `ColliderRegistry`).

### One trap worth knowing

If the spike geometry extends beyond the proxy's footprint and the player walks
there, `PlayerController.groundAt()` returns `null` from the cave query, falls back
to `sampleHeight` (the surface, tens of metres up), and
`integrateVerticalMotion`'s grounded branch (`groundY >= y - STEP_DOWN_MAX`,
`verticalMotion.ts:56-58`) **snaps the player instantly to the surface**. Make the
proxy generously cover the spike's walkable area, or expect this to be reported as a
spike bug.

---

## Player Ground Integration

```text
PlayerController.update()
  → updateVerticalMotion(dt)                   (:953)
      → groundAt(x, z)                         (:914)
          → this.caveGround(x, this.mesh.position.y, z)      ← CaveGroundQuery
              → createApp.ts:591  bundle.caves.contains(x,y,z)
                                  bundle.caves.sampleFloor(x,z)
                                  bundle.caves.sampleCeiling(x,z)
          → cave hit  ⇒ { height: floorY, ceiling: ceilingY }
          → cave miss ⇒ { height: sampleHeight(x,z), ceiling: null }
      → integrateVerticalMotion({ groundY, maxY: ceiling - PLAYER_HEIGHT })
  → syncCamera() → groundAt() again, ~21× per frame (see Camera)
```

Answering the recon question directly: **the surface/cave decision is 3D
containment**, not X/Z. `Caves.contains(x, y, z)` requires the player's Y to fall
between a primitive's floor and ceiling. `sampleFloor`/`sampleCeiling` are then
Y-independent (above).

Assumptions a V2 representation must not break:

1. `contains` must be true throughout the walkable interior *at the player's actual
   Y* — including while jumping (up to `JUMP_HEIGHT 0.6`) and while stepping down
   (`STEP_DOWN_MAX 0.45`). A representation whose containment envelope hugs the floor
   too tightly will drop the player to the surface mid-jump.
2. Ceiling must be ≥ `floor + PLAYER_HEIGHT`, otherwise `maxY` clamps the player
   below the floor.
3. `caveGround` is called with the *previous frame's* Y. Rapid vertical transitions
   (a shelf drop) are resolved one frame late — acceptable today, worth remembering
   if V2 adds real vertical routes.
4. The query is called several times per frame and folds over **all** caves in the
   world (`createCaves.ts:183-205`), three times per `caveGroundQuery` call. With
   today's ~2 accepted caves × ~5 primitives that is trivial. A per-sample SDF
   evaluation dropped into this path would be evaluated ~60+ times per frame — a
   real, code-backed argument to keep an analytic/proxy query layer in front of any
   volumetric representation. Note it in the spike results; do not solve it now.

---

## Camera Integration

Owner: `PlayerController.syncCamera()` (`:1031-1072`) →
`resolveCameraBoom()` (`src/player/cameraBoom.ts:52`). There is no separate camera
class and no orbit/free camera in the game (`OrbitControls` exists only in
`src/debug/createModelTestScene.ts`, a standalone `?modelTest` scene that bypasses
the world entirely).

**Why the camera misbehaves in caves — two concrete, code-level causes:**

1. `syncCamera` passes `sampleHeight: (x, z) => this.groundAt(x, z).height`.
   `groundAt` resolves the cave using **the player's Y**, not the sample point's.
   So for any `(x, z)` outside the cave's XZ footprint it returns the *surface*
   height. `firstTerrainHitT` (`cameraBoom.ts:98-121`) marches 20 steps along the
   boom; in a `TUNNEL_RADIUS = 1.7 m` corridor the boom leaves that footprint almost
   immediately, reads "buried in terrain", and collapses to
   `minT = min(0.35/dist, 0.5)` — the camera jams onto the player. Where it does not
   collapse, the final clamp
   `y = max(originY + dy*t, sampleHeight(x,z) + CAMERA_GROUND_CLEARANCE)`
   (`cameraBoom.ts:91-94`) can lift the camera to *surface + 0.45 m* — this is the
   "camera escapes above terrain" symptom.
2. Cave wall beads have `radius 0.5`, below
   `CAMERA_OCCLUDER_MIN_RADIUS = 1.2` (`cameraBoom.ts:71`), so cave walls **never**
   occlude the boom. There is also no ceiling test anywhere in `resolveCameraBoom`.

**Milestone A instruction: do not fix this.** It is representation-independent — it
affects Sweep and SDF identically, so it does not bias the comparison, and fixing it
is Milestone B §22 work with its own design. It *will* make in-cave viewing awkward;
mitigations that cost nothing:

- compare mainly in the chamber (larger footprint ⇒ the boom survives);
- the player can zoom (`look.distance`) to taste — same setting for both runs;
- if structural inspection is genuinely impossible in-world, the *existing*
  `?modelTest` scene (`src/debug/createModelTestScene.ts`, OrbitControls, its own
  minimal renderer/light rig, bypasses world/save/UI) is the precedent to copy for a
  throwaway geometry viewer. Only do this if in-world inspection fails — it is extra
  disposable code.

For the record in the results document: measure "camera clearance" per plan §14 as
*how much the geometry would allow*, not as "does the current boom behave", since
the current boom cannot behave in either variant.

---

## Entrance / Terrain Integration

What V1 already gets **right** and both spikes must inherit unchanged:

- Entrance sits on real sloped ground chosen by `pickLargeCaveSites` (`MIN_SLOPE_DROP
  0.85`, off-road, off-coast, away from villages/mountain ridges).
- The interior starts at the **carved recess floor**, not the raw surface —
  `CAVE_MOUTH_DEPTH = 2.4` is shared between `caveGenerator.ts` (exported) and
  `createCaves.ts` (`MOUTH_DEPTH`) precisely so they cannot drift. This was the
  2026-09-03 regression fix; **do not reintroduce a topology anchored at
  `sampleHeight`**.
- `MOUTH_ROOF_MIN = 0.35` keeps a thin but positive roof over the leading section
  past the carved footprint (`MOUTH_FOOTPRINT_MARGIN`), so no interior geometry
  stands above the meadow.
- Terrain over the tunnel is untouched — vegetation/grass keep generating normally
  above a cave, which is the desired behaviour (no cave-awareness exists anywhere in
  `src/terrain/`, and none should be added).
- Mouth rock framing reuses `createLargeCaveVisual` at a synthetic
  `MOUTH_FRAMING_LENGTH = 3` site.

What is **part of the quality problem** (do not attempt to fix in Milestone A;
recorded because the player will see it in both variants and should not score it as a
representation difference):

- The "hole" is only two `modifyTerrain` calls (r=1.65/d=2.4 pit + r=3.2/d=1.35
  approach) on a **1 m heightmap grid** — entering reads as falling into a dip, not
  walking into a hillside (loose end, 2026-09-03).
- Acceptance rate: `pickLargeCaveSites` proposes ~10 sites, the overburden filter
  accepts ~2 on average (measured over 40 seeds, same loose end). If a given `?seed=`
  yields zero caves, `definitions[0]` is undefined — **guard the spike branch** and
  log a clear message telling the player to try another seed.

---

## Determinism

Sources, all real:

| Value | Source |
|---|---|
| World seed | `WorldConfig.seed` ← `parseSeedFromUrl()` / `randomSeed()` (`src/world/parseSeed.ts`) |
| Siting RNG | `createSeededRandom(seed ^ 0xca7e51)` (`largeCaves.ts:100`) |
| Per-cave layout RNG | `createSeededRandom((seed ^ 0x51ed270b ^ round(x*97) ^ round(z*131)) >>> 0)` (`caveGenerator.ts:155`) |
| Cave identity | `makeCaveId(seed, site)` — hash of seed + rounded site x/z, index-independent (`caveGenerator.ts:95-103`) |
| Geometry randomness | **none today** — `caveMesh.ts` is fully analytic, no noise at all |

Rules for the spike:

- Derive every spike RNG stream from `createSeededRandom` seeded off
  `(topology.seed, a per-purpose constant)` — one stream per purpose (centerline
  perturbation, profile jitter, surface detail), never one shared stream consumed in
  a call-order-dependent way, or toggling `'caveDetail'` will change the structural
  shape too.
- No `Math.random()`, no `Date.now()`, no iteration over a `Map`/`Set` whose
  insertion order depends on activation order.
- Both variants must consume the **same** `CaveTopology` object built once — build
  the topology outside the variant branch so it is provably shared.

**`generatorVersion`:** there is no world-generation versioning mechanism in the
repository. The only versioning is save-schema (`CURRENT_SAVE_VERSION = 1` +
`SAVE_MIGRATIONS` in `src/persistence/saveData.ts`), which is not applicable — cave
geometry is never persisted. The single persisted cave-derived value is the
`"cave:<caveId>"` string in `SaveMap.discoveredLocations`/`targets`, and it degrades
gracefully when unresolvable. **Do not build a `generatorVersion` framework in
Milestone A.** Record for the Milestone B decision: it only becomes necessary if
cave *identity* inputs (`makeCaveId`'s seed/site) change, not when geometry changes.

---

## Streaming / Disposal

| Stage | What actually happens |
|---|---|
| **Precomputed globally** | Every `CaveDefinition` + every `CaveVolume`, eagerly in `createCaves()`. Also the mouth terrain carve for every cave. |
| **Lazily materialized** | Interior mesh, framing rocks, wall colliders — per cave, on `activate()`. |
| **Per frame** | `caves.update(playerX, playerZ)` from `gameLoop.ts:1819`, unthrottled: one 3×3 grid lookup over 500 m cells + a bounds distance per candidate. Plus the ground/camera queries described above. |
| **References held** | `active: Map<caveId, THREE.Object3D>` inside the `createCaves` closure; collider sets inside `ColliderRegistry.byOwner` + bucket arrays; the `Caves` handle on `WorldBundle.caves`. |
| **Deactivate** | `removeFromParent()` + `disposeObject3D(group)` + `chunkManager.clearColliders('cave:'+id)` + `active.delete`. |
| **Dispose** | `Caves.dispose()` deactivates everything; called from both `worldBundle.ts` teardown paths. |

Milestone A must not restructure any of this. Two leak risks specific to running a
spike:

1. **Cache the spike mesh, or rebuild it, but be explicit.** If you build the spike
   geometry once at `createCaves()` and re-`add()` the same `Mesh` on every
   activation, `deactivate()`'s `disposeObject3D` will dispose its geometry and the
   next activation renders nothing (or throws). Safest: build the geometry **inside
   `activate()`** (measuring the cost is a metric you want anyway), or clone/guard
   explicitly. Do not silently share a disposed geometry.
2. Only one variant may be materialized per session. Never build both meshes into
   the same scene — the flag is single-valued for exactly this reason.

`disposeObject3D` (`src/assets/loadGltf.ts:189`) walks the group and disposes every
mesh geometry/material **unless** it carries `userData.sharedGpu` — that flag is the
existing escape hatch if you deliberately want to cache a spike geometry across
activations. Use it consciously, not by accident.

---

## Performance Instrumentation

Existing mechanisms to reuse — do **not** build a `CaveDebugManager`:

| Mechanism | File | Use |
|---|---|---|
| `useBootMark(group)` → `bootMark`/`bootMarkEnd`/`bootMarksSummary` | `src/shared/bootMark.ts` | Gated by `?bootMark`; already wraps `createCaves` (`worldBundle.ts:754/762`). Zero-cost when off. Console `console.log`/`console.table`. |
| `createPerfMonitor` / `withCategory` / `PERF_CATEGORIES` | `src/perf/monitor.ts`, `types.ts` | Per-frame categorised timings (`?perf=1`); appropriate for the *steady-state* cost, not one-shot generation. |
| `censusScene()` / `SCENE_BUCKETS` | `src/perf/sceneCensus.ts` | Draw calls + triangles per bucket. Note: cave groups are named `cave:<id>` and `classifyObject` has no branch for them, so they currently fall into `'other'`. |
| `?debug=1` console API | `src/debug/npcDebugApi.ts` | Precedent for exposing structured data via `window.seedvale.debug`. |
| lil-gui debug panel | `src/ui/createDebugGui.ts` | Exists; **not** worth extending for a spike. |

Minimal recommended reporting — one `CaveSpikeMetrics` type in
`src/world/caves/`, returned by each builder, printed once with `console.table`
behind the `?caveSpike` flag:

```text
CaveSpikeMetrics {
  variant                'sweep' | 'sdf'
  topologyBuildMs        (shared stage, measured once)
  representationMs       sweep: profile/centerline solve; sdf: field construction
  meshBuildMs            geometry assembly / extraction
  vertices, triangles
  geometryBytes          position+normal+index attribute byte lengths (exact, cheap)
  peakTempBytes          estimate where practical (sdf: grid cells × 4 bytes; sweep: n/a)
  bounds                 {min,max} of the produced geometry
  params                 the variant's own params object, verbatim
  detailEnabled          isSystemEnabled('caveDetail')
}
```

Run generation **N times (e.g. 9) and report the median** per plan §13 — trivially
done inside the builder call site, and it removes single-sample noise. Do not set ms
budgets before a baseline exists.

---

## Tests

Existing entry points (vitest, `pnpm run test`):

- `src/world/caveGenerator.test.ts` — determinism, distinct ids, node/tunnel
  referential integrity, overburden rejection. **The template to copy.**
- `src/world/caveVolume.test.ts` — containment/floor/ceiling contract, incl. the
  "surface point above a tunnel is not inside" case.
- `src/world/caveColliders.test.ts` — vertical envelope present, `colliderActiveAtY`
  excludes surface Y, junction gap left open.
- `src/world/largeCaves.test.ts` — siting determinism/separation.
- `src/player/cameraBoom.test.ts` — boom pull-in behaviour (do not modify).

Targeted tests to add for Milestone A (keep them pure — no Three.js scene, no
`ChunkManager`):

1. `src/world/caves/caveTopology.test.ts`
   - `buildSpikeTestTopology(seed, entrance)` is deterministic for the same inputs
     (`toEqual` on two calls).
   - Different seed ⇒ different topology, same *structure* (same node kinds/count).
   - Topology contains the plan-required elements: an entrance node, ≥1
     `constriction`/`widening`, a `chamber`, and exactly one `shelf|overhang` feature.
   - Every `segment.from`/`to` references an existing node id (mirrors
     `caveGenerator.test.ts`'s referential-integrity test).
   - Route length is in the 20–30 m band (sum of segment centerline lengths).
   - **Contract guard:** topology JSON contains no representation keys — a simple
     assertion over serialized keys against a forbidden list
     (`resolution`, `cellSize`, `profileIndex`, `segments`-per-ring, …). Cheap, and it
     is the one thing that stops the boundary eroding.
2. `src/world/caves/sweepCaveMesh.test.ts` and `sdfCaveMesh.test.ts`
   - Same topology + same params ⇒ identical vertex/index counts and identical
     bounds (determinism), run twice.
   - Non-empty geometry; no `NaN` in positions.
   - Disabling detail (`caveDetail`) changes vertex positions but leaves the
     structural bounds within a tolerance — the plan §11 invariant, as an assertion.
3. `src/world/caves/topologyAdapter.test.ts`
   - `topologyToCaveDefinition(topology)` produces a definition whose
     `createCaveVolume().contains()` is true at sampled points along the topology
     centerline at floor + 1 m (the walkable-proxy coverage guarantee that prevents
     the surface-snap trap).

`THREE.BufferGeometry` works fine under vitest (no WebGL context needed for geometry
construction) — `caveMesh.ts` is untested today only because nothing asked for it.

---

## Exact Files and Symbols

### Read first (in this order)

```text
src/world/createCaves.ts          — the runtime owner; start here
  createCaves()                   REUSE   the single wiring point for the spike branch
  Caves (type)                    REUSE   definitions/update/contains/sampleFloor/sampleCeiling/dispose
  activate(def) / deactivate(id)  ADAPT   one branch each for the spike cave
  colliderOwnerKey(caveId)        REUSE   `cave:<caveId>`
  CAVE_GRID_CELL / ACTIVATE_DISTANCE / DEACTIVATE_DISTANCE   REUSE

src/world/caveVolume.ts           — the domain contract everything derives from
  CaveDefinition, CaveNode, CaveTunnel, CaveEntrance, CaveBounds   REUSE (A)
  createCaveVolume(definition)    REUSE   spike proxy consumes it unchanged
  computeCaveBounds(...)          REUSE
  CaveVolume.sampleFloor/sampleCeiling    2.5D collapse lives here — do not change

src/world/caveGenerator.ts        — layout + validation + identity
  generateCaveDefinitions(input)  REUSE   unchanged; spike takes definitions[0]
  buildCaveFromSite(...)          REPLACE (Milestone B) — the pipe-look source
  makeCaveId(seed, site)          REUSE   persisted-id stability
  CAVE_MOUTH_DEPTH (exported 2.4) REUSE   topology entrance must anchor here
  tunnelOverburdenOk/overburdenOk REUSE (A) / ADAPT (B) — straight-segment only
  MOUTH_ROOF_MIN / MOUTH_FOOTPRINT_MARGIN / MIN_OVERBURDEN   REUSE (constraints)

src/world/largeCaves.ts           — siting
  pickLargeCaveSites(input)       REUSE
  LargeCaveSite, LargeCavePlacementInput   REUSE
  tunnelDirection(yaw) / openingDirection(yaw)   REUSE
  LARGE_CAVE_MOUTH_WIDTH (3)      REUSE   entrance width intent

src/world/caveMesh.ts             — V1 presentation
  createCaveInteriorMesh(def)     REPLACE (for the spike cave only; keep the file)
  GeometryBuilder/pushVertex/pushQuad   PATTERN TO COPY (not to import)
  ROCK_COLOR / material config    COPY    so both spikes shade identically

src/world/caveColliders.ts        — collision derivation
  buildCaveWallColliders(def)     REUSE   both variants share it via the proxy
  WALL_STEP / WALL_BEAD_RADIUS / VERTICAL_PAD   REUSE

src/world/largeCaveVisual.ts
  createLargeCaveVisual / placeLargeCaveVisual   REUSE   mouth framing, unchanged
```

### Integration surface (touch minimally)

```text
src/debug/debugMode.ts
  urlFlag / urlParamValue         REUSE   do not write a new URL parser
  isSystemEnabled(name)           REUSE
  DebugSystemName                 ADAPT   + 'caveDetail'  (one union member)
  (new) caveSpikeVariant()        ADD     one exported reader, deleted after the gate

src/world/createCaves.ts          ADAPT   the single spike branch (see harness above)

src/shared/bootMark.ts
  useBootMark(group)              REUSE   `?bootMark` timing, already wraps createCaves
```

### Do not modify in Milestone A

```text
src/app/worldBundle.ts            (:138 field, :754-762 create, :1152/:1226 dispose)
src/app/createApp.ts              (:591 caveGroundQuery, :608/:1061 player wiring)
src/app/gameLoop.ts               (:1819 caves.update)
src/player/PlayerController.ts    (CaveGroundQuery :162, groundAt :914,
                                   collidersNearAtHeight :923, syncCamera :1031)
src/player/cameraBoom.ts          (resolveCameraBoom — broken in caves, Milestone B)
src/player/verticalMotion.ts      (integrateVerticalMotion maxY clamp)
src/world/collision.ts            (Collider / ColliderRegistry / colliderActiveAtY)
src/terrain/chunkManager.ts       (registerColliders/clearColliders/collidersNear/
                                   modifyTerrain/sampleHeight/sampleBaseHeight)
src/world/locations/worldLocationCatalog.ts   (reads definitions()/entrance only)
src/fauna/createFauna.ts          (unrelated 'cave' habitat spawner)
```

### New files (expected)

```text
src/world/caves/caveTopology.ts        CaveTopology + node/segment/feature types + JSDoc @domain
src/world/caves/spikeTestCave.ts       buildSpikeTestTopology(seed, entrance)
src/world/caves/topologyAdapter.ts     topologyToCaveDefinition(topology) — L1 walkable proxy
src/world/caves/caveSpikeMetrics.ts    CaveSpikeMetrics + median/report helper
src/world/caves/sweepCaveMesh.ts       Variant A
src/world/caves/sdfCaveMesh.ts         Variant B (+ its local mesher, same folder)
src/world/caves/*.test.ts              targeted tests above
```

Six or seven new files, two touched production files. If the count grows, stop and
re-read *Disposable Spike Boundary*.

---

## Recommended Implementation Order

Each step ends in a state that compiles and passes tests.

1. **Topology contract.** `caveTopology.ts` — types + JSDoc (`@domain world-terrain`).
   No builders yet. *Verify:* `npx tsc --noEmit`.
2. **Shared test cave.** `spikeTestCave.ts` → `buildSpikeTestTopology(seed, entrance)`
   producing the plan §8 / research §3 shape (mouth → wide transition → irregular
   descending passage → constriction+widening → chamber → shelf **or** overhang;
   optional short branch behind a parameter). Anchor Y at
   `entrance.y` (already the carved recess floor — never `sampleHeight`).
   *Verify:* `caveTopology.test.ts` (determinism, structure, 20–30 m route,
   no-representation-keys guard); `pnpm run test`.
3. **Walkable proxy adapter.** `topologyAdapter.ts` → `topologyToCaveDefinition()`
   emitting `CaveNode`/`CaveTunnel` along the centerline, generous enough to cover
   the intended walkable corridor. Reuse `computeCaveBounds`. *Verify:*
   `topologyAdapter.test.ts` (centerline points contained by `createCaveVolume`).
4. **Flag + harness wiring, still on V1 geometry.** Add `caveSpikeVariant()` to
   `debugMode.ts`; add the `createCaves()` branch so that with `?caveSpike=sweep` the
   first cave uses the *proxy* definition for volume/colliders but still renders
   `createCaveInteriorMesh`. Guard the empty-`definitions` case. Log the spike cave's
   id + entrance coords. *Verify:* `tsc`, `pnpm run lint`, boot the app with and
   without the flag; without the flag nothing changes.
   **This step is the risk-retiring one — do it before writing either mesher.**
5. **Metrics scaffolding.** `caveSpikeMetrics.ts` + median-of-N runner + one
   `console.table` at the wiring point. *Verify:* `tsc`.
6. **Sweep spike.** `sweepCaveMesh.ts`, wired as the `'sweep'` branch. Implement the
   plan §9 feature list properly (asymmetric profiles, keyframes, independent
   floor/ceiling/wall shaping, centerline perturbation, multi-scale detail behind
   `caveDetail`). *Verify:* `sweepCaveMesh.test.ts`; browse with
   `?caveSpike=sweep&debug=1`.
7. **SDF spike.** `sdfCaveMesh.ts` + local mesher, wired as `'sdf'`. Bounded local
   grid only. Include the accidental-union stress configuration. *Verify:*
   `sdfCaveMesh.test.ts`; browse with `?caveSpike=sdf&debug=1`.
8. **Structural/detail toggle.** Add `'caveDetail'` to `DebugSystemName`; both
   builders honour `isSystemEnabled('caveDetail')`. *Verify:* the detail-off test
   asserting structural bounds are preserved.
9. **Stress-test configurations.** Sweep: enable the short side branch, inspect the
   junction for overlap/seams/pinching/floor breaks. SDF: place the two close-but-
   disconnected sections, check for a spurious bridge. Record findings; these are
   inspection outputs, not new production features.
10. **Technical verification.** `npx tsc --noEmit` · `pnpm run lint` ·
    `pnpm run build` · `pnpm run test`.
11. **Write up and stop.** Fill `docs/design/caves/04-sweep-vs-sdf-spike-results.md`
    with technical + benchmark results and the technical half of the §14 rubric.
    Leave the gameplay/visual scores and the decision **empty**. Report status as:

    ```text
    Architecture spike implemented
    Technical comparison complete
    Manual comparison required
    Decision pending
    ```

    Give the player exact repro steps: URLs (`?seed=<n>&caveSpike=sweep&debug=1`,
    same with `sdf`, plus `&debugDisableSystems=caveDetail`), the spike cave's
    entrance coordinates, and the `seedvale.debug.teleportTo(...)` snippet.

    **Do not** update the plan's `Status:`, do not choose a representation, do not
    delete either spike, do not start Milestone B.

---

## Risks / Pitfalls

1. **Geometry disposal on re-activation.** `deactivate()` calls `disposeObject3D` on
   the whole group. A cached spike `Mesh` re-added on the next activation will have
   a disposed geometry. Build inside `activate()` (also gives you a real activation
   cost measurement) or guard explicitly.
2. **Zero caves for a seed.** ~10 candidate sites, ~2 accepted. `definitions[0]` can
   be `undefined`. Guard and log.
3. **Surface snap.** Walkable spike geometry not covered by the proxy ⇒
   `groundAt` falls back to `sampleHeight` ⇒ `integrateVerticalMotion` teleports the
   player to the surface. Make the proxy cover the corridor generously.
4. **Anchoring the topology at `sampleHeight`.** This is the exact 2026-09-03
   regression. Use `entrance.y` (= carved recess floor, `CAVE_MOUTH_DEPTH` below the
   surface).
5. **Letting representation params leak into topology.** The keys-guard test exists
   for this. A `resolution` field in `CaveTopology` silently makes the two spikes
   incomparable and pre-commits the architecture.
6. **Order-dependent RNG.** One shared random stream consumed in a
   detail-flag-dependent order makes `caveDetail=off` change structural geometry,
   invalidating the plan §11 test. Use one stream per purpose.
7. **Comparing different caves.** Build the topology once, outside the variant
   branch, and assert in a test that both builders receive an identical object.
8. **Reading the camera as a representation difference.** The boom is broken
   identically for both. Say so explicitly in the results document.
9. **Scoring collision quality in Milestone A.** Both variants use the same
   approximate proxy. Say so explicitly.
10. **Scope creep into `CaveVolume`.** Any temptation to add multi-interval floor
    queries is Milestone B and pre-judges the representation.

---

## Plan / Code Discrepancies

| Plan §31 expects | Reality |
|---|---|
| `src/world/caveGenerator.ts` | exists ✔ |
| `src/world/caveVolume.ts` | exists ✔ |
| `src/world/caveMesh.ts` | exists ✔ |
| `src/world/createCaves.ts` | exists ✔ |
| `src/world/collision.ts` | exists ✔ (`ColliderRegistry`, `Collider`, `colliderActiveAtY`) |
| `src/app/worldBundle.ts` | exists ✔ (`WorldBundle.caves`, `worldBundle.ts:138`) |
| `src/player/PlayerController.ts` | exists ✔ (`CaveGroundQuery`, `groundAt`) |
| cave-related tests | exist ✔ (4 files) |

Additional facts the plan does not state:

- `src/world/caveColliders.ts` and `src/world/largeCaveVisual.ts` are also part of
  the cave surface and are both **reuse**, not replace.
- `src/world/largeCaves.ts` still exists and is **live** (it owns siting), despite
  the V1 review's "`LargeCaves` should eventually be replaced" — what was replaced
  was `createLargeCaves.ts`'s trench carving, not the siting module. Do not delete
  it.
- **Plan §26 "camera escape" cause is not the cave geometry** — it is
  `resolveCameraBoom`'s use of a player-Y-resolved `sampleHeight` plus its final
  ground clamp. Documented above with line references. This means a better
  representation alone will not fix the camera; §22 remains genuinely necessary.
- Plan §6 asks whether a `generatorVersion` is needed. Code answer: no world-gen
  versioning mechanism exists, and cave geometry is never persisted; only the
  `"cave:<caveId>"` string reaches `SaveData` (via `SaveMap.discoveredLocations` /
  `targets`) and it degrades gracefully. Decide in Milestone B, build nothing now.
- Plan §17's "`x/z → one floor + one ceiling`" is accurate but slightly imprecise:
  `contains()` is already fully 3D; only `sampleFloor`/`sampleCeiling` collapse.
- `docs/CODE_INDEX.md` has **no cave entries**. Regenerating docs (`pnpm docs:sync`)
  is the correct mechanism if this needs fixing — never hand-edit the generated
  section.
- No marching-cubes / dual-contouring / SDF meshing code exists anywhere in `src/`.
  The SDF spike must bring its own; that cost is legitimate decision input.
- Fauna, NPCs and navigation call `collidersNear` **without** the `colliderActiveAtY`
  filter, so cave wall colliders can still affect surface NPCs/animals above a
  tunnel. Pre-existing V1 gap, unrelated to representation choice, out of scope here
  — but it will need addressing before cave fauna.

---

## Open Decisions After Spike

Deliberately left open — record them in
`docs/design/caves/04-sweep-vs-sdf-spike-results.md`, do not pre-answer:

- Which representation wins (or neither — plan §15 allows that outcome).
- Whether `CaveVolume` becomes an L1 adapter, is generalised, or is replaced (§17).
- What the production gameplay-space query API looks like, and whether floor/ceiling
  become interval sets keyed by Y.
- The minimal sufficient collision model for the chosen representation, still inside
  `ColliderRegistry`.
- Whether the camera fix (§22) is cave-specific or a shared boom improvement.
- Whether the entrance/mouth carve gets a real sculpted ramp (loose end, 2026-09-03)
  and whether overburden validation moves to polyline sampling.
- Whether cave-site acceptance rate needs the calibration spike plan world-terrain-007
  §5 anticipated and never got.
- Whether a `generatorVersion` is warranted once cave-anchored persistent state
  exists.
