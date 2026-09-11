# Implementation Notes: Cave Heightfield Representation Spike

> Plan: `docs/plans/world-terrain-018-cave-heightfield-representation-spike.md`  
> Date: **2026-09-10**  
> Scope: isolated cave heightfield comparison harness only

## Current architecture facts

Current production Cave V2 is already split so the spike does not need to redesign topology ownership:

```text
CaveTopology
    ↓
CaveSdfSpatialRepresentation
    ↓
queries / colliders / presentation extraction
```

`src/world/caves/caveTopology.ts` is representation-neutral and contains the useful contract:

- `CaveTopology.nodes` with `position`, `targetWidth`, `targetHeight`;
- `CaveTopology.segments` with world-space `centerline`;
- `CaveTopology.features`;
- `CaveTopology.minClearance`;
- shared `CaveEntrance`.

Do not introduce a second topology type for the heightfield spike.

## Existing minimal-scene seam to reuse

`src/debug/createModelTestScene.ts` is the canonical lightweight scene pattern:

- `createRenderer(container)`;
- `Scene`;
- `PerspectiveCamera`;
- `OrbitControls`;
- simple lights;
- own RAF loop;
- own resize handler;
- explicit cleanup;
- no world/chunks/NPC/UI/audio/persistence.

Use this as the structural reference rather than creating another Vite app/package.

## Boot routing seam

Current routing is two-stage:

1. `src/main.ts` checks `isModelTestMode()` before save/start-screen work;
2. `src/app/createApp.ts` immediately returns `createModelTestScene(container)` before normal world bootstrap.

The cave heightfield test should follow the same early-return semantics.

Add an explicit flag in `src/debug/debugMode.ts`, e.g. `isCaveHeightfieldTestMode()`, using the existing private `urlFlag()` helper. Do not add a second URL parser or generic debug-app framework.

## Heightfield representation boundary

Keep the experimental representation pure and Three-free where practical.

Useful conceptual output:

```ts
type CaveHeightfieldRepresentation = {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
  cellSize: number
  width: number
  depth: number
  inside: Uint8Array
  floorY: Float32Array
  ceilingY: Float32Array
}
```

Exact naming/storage is implementation-owned. Important constraints:

- one canonical 2D grid;
- no THREE types in representation builder;
- floor/ceiling indexed by same grid;
- outside cells explicit through the mask;
- deterministic output from topology + config/seed;
- typed arrays preferred.

## Footprint derivation

Reuse `CaveTopology` semantics directly:

```text
segment.centerline
    ↓ fixed-distance resample
node targetWidth interpolation
    ↓
2D capsule/disc coverage
    ↓
inside mask
```

Do not use raw centerline point density as sampling density. Do not hardcode historical Sweep node ids or return to ring sweep geometry.

## Floor/ceiling derivation

For every inside grid sample resolve local centerline height and target height, then derive:

```text
floorY = baseFloorY + bounded floor detail
ceilingY = baseFloorY + targetHeight + bounded ceiling detail
```

Always enforce:

```text
ceilingY - floorY >= topology.minClearance
```

Do not derive ceiling as `surfaceHeight - constant`. Noise must not alter topology connectivity.

## Boundary wall extraction

A grid-edge implementation is sufficient for the first spike:

- inspect orthogonal neighbors of every inside cell;
- where neighbor is outside, emit wall faces between floor and ceiling;
- own each boundary edge once;
- ensure winding faces cave interior.

Only add contour tracing if the simple result is visibly inadequate at otherwise acceptable grid resolution.

## Surface fixture

Do not import `ChunkManager` or run terrain worker generation.

**Superseded by the 2026-09-10 review (see the follow-up section below).** The
hand-drawn approach/cliff/overburden fixture was too artificial to judge Cave
V2 against real world relief. The harness now samples the *production*
analytic terrain function directly — `chunkHeightmap.sampleHeightAt` +
`worldConfig.defaultTerrainConfig()` — which is the same pure seam
`ChunkManager` exposes as `sampleBaseHeight` and `createCaves()` passes to
Cave V2 as `analyticSurfaceHeight`. Still no `ChunkManager`, no worker, no
`WorldBundle`.

This does not solve production mouth carving. `src/world/caves/mouthCarve.ts`
and production terrain integration remain untouched (the harness *calls*
`mouthCarveDepth`; it does not change it).

## Two mandatory test modes

The harness is not complete if it only supports OrbitControls.

### Inspect mode

Reuse the `OrbitControls` pattern from `createModelTestScene.ts`. It exists to inspect geometry from arbitrary angles and detect holes, bad normals, seams, footprint artifacts and surface/mouth issues.

### Walk mode

The Player must be able to spawn outside the entrance and physically walk through the same cave fixture.

Required behavior:

- visible current player/humanoid model in third person;
- WASD movement;
- gravity / ground following;
- collision against floor, walls and ceiling;
- enter from surface through the mouth and return outside;
- camera behavior close enough to production third person to expose traversal/camera problems.

Do **not** boot the full player/world stack just to obtain this. Start by inspecting reusable low-dependency pieces around:

```text
src/player/PlayerController.ts
src/player/cameraBoom.ts
src/world/collision.ts
src/input/Keyboard.ts
src/input/MouseLook.ts
```

Reuse a helper only if its dependency surface stays lightweight. If importing `PlayerController` pulls WorldBundle/gameplay ownership, create a small debug-only traversal controller instead.

The debug controller should own only test state such as position, velocity/yaw and camera relation. It must not duplicate inventory, needs, skills, interaction, combat, saves or other gameplay systems.

## Collision source of truth

Do not hand-author invisible collision boxes separately from generated cave shape.

Heightfield walk collision should be derived from the same representation:

- floor contact from `floorY(x,z)` or equivalent bilinear query;
- ceiling limit from `ceilingY(x,z)`;
- containment/wall response from footprint/boundary.

This is intentionally not the final production cave collision architecture. The purpose is to test whether the representation itself supports reliable traversal.

For SDF comparison, reuse existing SDF query/collision helpers if they are callable without production world boot; otherwise provide the smallest debug adapter from the SDF representation rather than inventing unrelated collider geometry.

## Player model

Prefer the current player model/asset path already used by production or `createModelTestScene.ts` if it can be loaded independently. The model serves two purposes:

- real third-person scale;
- traversal/camera readability.

Do not spend spike scope on full production animation state. Idle + walk/run if trivial is enough; even a single locomotion-compatible model is acceptable if geometry/traversal remains clear.

## Topology fixtures

Use the real `CaveTopology` type. Prefer small deterministic fixtures if production topology construction needs broad world context:

```text
basic   entrance → passage → chamber
bend    entrance → curved passage → widening → chamber
branch  trunk + one branch/junction
```

Each should be traversable in Walk mode unless intentionally constructed otherwise. Hand-authoring topology fixtures is acceptable; hand-authoring final footprint geometry is not.

## SDF baseline

Reuse current production SDF representation/extraction where callable without world boot. Inspect current signatures first; likely relevant files include:

```text
src/world/caves/caveSdfField.ts
src/world/caves/sdfCaveMesh.ts
src/world/caves/caveSdfQuery.ts
src/world/caves/caveSdfColliders.ts
```

Do not copy the SDF algorithm into debug code.

## Controls

Keep controls small and obvious. Suggested URL shape:

```text
?caveHeightfieldTest&variant=heightfield&fixture=basic
?caveHeightfieldTest&variant=sdf&fixture=basic
```

Add simple runtime controls for:

- `heightfield ↔ sdf`;
- `Walk ↔ Inspect`;
- fixture change if cheap.

Do not build a Vue observatory/panel for this spike.

## Metrics

Use `performance.now()` around pure representation/mesh stages. Do not include app boot, renderer creation or GL compilation.

Report at least:

```text
representation/build time
mesh generation/extraction time
total generation time
vertices
triangles
geometryBytes
```

For heightfield also report grid resolution/cell size, inside cell count and boundary edge count.

## Files to inspect first during implementation

```text
src/debug/debugMode.ts
src/debug/createModelTestScene.ts
src/main.ts
src/app/createApp.ts
src/world/caves/caveTopology.ts
src/world/caves/caveSdfField.ts
src/world/caves/sdfCaveMesh.ts
src/world/caves/caveSdfQuery.ts
src/world/caves/caveSdfColliders.ts
src/player/PlayerController.ts
src/player/cameraBoom.ts
src/world/collision.ts
src/input/Keyboard.ts
src/input/MouseLook.ts
```

Inspect only the relevant symbols/dependency seams; do not broaden into a repository-wide player/world recon.

## Expected new files

Prefer keeping experimental code under debug scope:

```text
src/debug/caves/caveHeightfieldFixtures.ts
src/debug/caves/caveHeightfieldRepresentation.ts
src/debug/caves/caveHeightfieldMesh.ts
src/debug/caves/caveHeightfieldTraversal.ts
src/debug/createCaveHeightfieldTestScene.ts
```

Exact names are not mandatory if current code exposes a clearer existing seam.

## Tests worth writing

Focused pure tests only:

1. deterministic topology/config → deterministic arrays;
2. every inside cell satisfies min clearance;
3. straight passage has no internal holes;
4. widening increases footprint width;
5. branch creates one connected intended junction;
6. boundary wall extraction has no duplicate boundary faces;
7. floor/ceiling arrays contain no invalid values;
8. traversal query returns valid floor/ceiling inside and outside/blocked state beyond boundary;
9. a representative player capsule/point cannot pass through boundary or ceiling in pure movement tests, if the debug collision code is pure enough to test cheaply.

Avoid WebGL/DOM scene tests unless existing helpers make them trivial.

## Common mistakes to avoid

- Booting the real world and defeating the purpose of the harness.
- Using OrbitControls as the only validation path.
- Importing full `PlayerController` despite broad WorldBundle/gameplay dependencies.
- Creating a fake invisible collision layout unrelated to generated cave geometry.
- Creating an independent cave topology type.
- Hardcoding Sweep-specific topology ids.
- Creating walls through extreme height gradients.
- Reusing floor winding for ceiling.
- Comparing different topology between SDF and heightfield.
- Importing `ChunkManager` just to create entrance terrain.
- Hiding 2.5D limitations with special cases.
- Replacing production SDF/worker/collision during the spike.
- Running browser verification as the implementation agent.

## Completion output

Implementation is complete when the Player can open `?caveHeightfieldTest`, immediately receive the lightweight scene, switch between SDF/heightfield, switch between Inspect/Walk, and physically traverse the same deterministic cave topology without waiting for normal Seedvale world generation.

The implementation commit must not change production cave behavior.

After Player comparison, record measured results and architecture decision before planning any production migration.

---

## Review follow-up — 2026-09-10 (post-merge, PR #80)

Focused review of the merged spike found two things the harness could not
actually test. Both are fixed; production cave/player/world behaviour is
unchanged.

### 1. Surface fixture was too artificial

`sampleCaveHeightfieldSurface()` was a hand-rolled `approach + cliff + ridge`
function with a doorway band cut out of it. Flat approach, one smoothstep
wall, constant 9 m overburden — nothing a Cave V2 mouth actually meets.

Now (`src/debug/caves/caveHeightfieldTerrain.ts`):

```text
defaultTerrainConfig(65)                    → RawSampleParams (no localStorage/URL)
sampleHeightAt(x + anchor.x, z + anchor.z)  → production analytic height
  − mouthCarveDepth(x, z, entrance)         → production mouth recess
```

- `CAVE_HEIGHTFIELD_TERRAIN_ANCHOR = (-1638, -918)` on seed `1` — a real
  hillside: the approach descends outward, the ground climbs ~10 m over the
  20 m the fixtures run inward, and there is lateral relief for `bend` /
  `branch`. `caveHeightfieldTerrain.test.ts` asserts those properties, so a
  terrain-generation change fails loudly instead of quietly flattening the
  harness.
- Two samplers, mirroring production exactly:
  - `caveHeightfieldBaseSurfaceAt` — analytic base. **Both** representations
    (heightfield *and* SDF field/mesh/column index/colliders) are built on
    this one function.
  - `caveHeightfieldWalkSurfaceAt` — base minus the mouth recess. Outdoor
    player ground and the harness terrain mesh (1 m per texel, production
    grid density).
- Fixtures are still hand-authored `CaveTopology`, but Y is now *anchored*:
  entrance floor = `base(0,0) − CAVE_MOUTH_DEPTH` (as `productionTopology.ts`
  does it), each station authored as a descent below it and then clamped by
  `minSurfaceOverFootprint` + `mouthOverburdenRequirement` + a local
  `STATION_SAFETY` — the same two production rules.
- Result: the deepest station of every fixture sits **12–14 m under the
  hillside** (`basic` 14.0, `bend` 14.4, `branch` 12.1), which is the
  outdoor-surface ↔ cave-interior conflict the spike needed.

### 2. Walk mode did not preserve Cave V2 ground semantics

`queryHeightfieldGround()` invented its own rule (`inside → cave, else →
surface`, plus an ad-hoc `inColumn` window) and the SDF branch had no
continuity rule at all. With a real hillside overhead that is the exact
production regression the harness is supposed to catch:

- **Underground query miss → surface snap.** Any query that lands outside the
  footprint returned the surface. Fed to `integrateVerticalMotion` while
  grounded, `groundY ≥ y − STEP_DOWN_MAX` holds trivially when the surface is
  10 m up, so the player teleports onto the hillside. Production guards this
  with `applyCaveGroundHysteresis` (`CAVE_UNDERGROUND_MISS`); neither harness
  variant had it.
- **Slope probes read the hillside.** `applySlopeMovementConstraint` probes
  `SLOPE_SAMPLE_STEP` = 1.2 m sideways — wider than a 2.6 m tunnel. Measured
  at 0.4 m off the tunnel axis at `z = −8`: the old mixed sampler reported a
  **73.9°** slope inside a walkable passage (past `SLOPE_MAX_WALKABLE_DEG`,
  so the uphill component is fully removed); the production
  `withCaveFloorFallback` wrapper reports **7.6°**, the passage's own grade.
- **Camera occupancy was fictitious.** `heightfieldOccupancyAt` returned
  `ceilingY = floorY + 8` for open-sky columns and treated
  `signedDistance ∈ [0, 0.05)` as void — 460 sample points around the mouth
  reported cave void several metres *above* the terrain. `isInteriorFollowVoid`
  cannot classify a hood/portal correctly against a made-up ceiling.

Fixed by routing both variants through one seam instead of two ad-hoc paths:

```text
CaveWalkWorld            (caveHeightfieldWalkWorld.ts)
  ├ heightfield → heightfieldColumnIntervals → queryHeightfieldColumn
  └ sdf         → queryColumnIndex                       (production)
        ↓  pickInterval(y)                               (production)
        ↓  applyCaveGroundHysteresis(hit, y, surfaceY, last)  (production)
   ground.height / ground.ceiling / ground.caveFloorY
        ↓
  integrateVerticalMotion(maxY = rockCeilingMaxY(...))   (production)
  applySlopeMovementConstraint(withCaveFloorFallback(...))(production)
  resolveCameraBoom(occupancyAt = strict intervals)      (production)
```

- Heightfield columns are clipped to the analytic surface with production's
  `SURFACE_CLIP_EPS` (exported for this; no behaviour change), so a column
  whose ceiling pokes through the hillside is open-sky, not rock.
- `heightfieldOccupancyAt` now mirrors `occupancyIntervalAt` exactly
  (`CAVE_OCCUPANCY_EPS`, strict containment, real ceiling).
- `createDebugCaveGroundResolver` owns exactly one piece of state — the
  remembered cave hit `applyCaveGroundHysteresis` needs. It is not a second
  player-movement or cave-state system; the walker still owns only pose.
- The camera boom gets the **raw** walk surface as `sampleHeight`, exactly
  like `PlayerController.syncCamera` — `occupancyAt` + `isInteriorFollowVoid`
  are what keep an interior boom off the hillside, and substituting the cave
  floor there would defeat that test.

### Known divergences from production Cave V2

- Production `PlayerController` feeds the **raw** surface sampler to
  `applySlopeMovementConstraint`, so inside a cave it constrains movement by
  the hillside gradient overhead rather than the cave floor. The harness uses
  `withCaveFloorFallback` there. Recorded in `LOOSE-ENDS.md`; not changed in
  production as part of this spike.
- Debug player constants (`MOVE_SPEED`, `SPRINT_MULTIPLIER`,
  `HEIGHTFIELD_PLAYER_RADIUS/HEIGHT`, `heightfieldRockCeilingMaxY`) are
  duplicated rather than imported, so the harness bundle does not pull the
  gameplay/WorldBundle graph. `caveHeightfieldTraversal.test.ts` asserts they
  equal the production ones.
- No water, no encumbrance/sneak/stamina modifiers, no footstep/audio, no
  `queryInterior` hysteresis (ambience only) — Walk mode stays traversal-only.
- 2.5D still cannot express stacked/crossing passages, shafts, bridges or true
  overhangs. Unchanged, and deliberately not papered over.

### Tests added

`caveHeightfieldTerrain.test.ts` (7) — deterministic sampling, anchor
properties (above water, doorway slope, rise over the tunnel, lateral relief),
walk-surface = base − mouth carve, entrance anchoring, ≥ 8 m of hillside over
the deepest station of every fixture, production overburden past the mouth
transition, repeatable topology.

`caveHeightfieldTraversal.test.ts` (26) — debug-vs-production constant
parity, surface clipping of columns, and, **run against both variants**:
outdoor ground before the entrance, cave floor (never the hillside) when
stably inside, no > 0.5 m vertical jump anywhere along entrance → chamber →
exit, ground handed back to the surface on exit, mouth transition bounded by
the production approach disc, underground-miss beside the tunnel keeping the
cave floor, a surface entity above the tunnel *not* being assigned the cave,
jump clamped by the rock ceiling, third-person boom never parking on the
overburden, and strict occupancy only inside real void.

### Verification

`npx tsc --noEmit`, `pnpm run lint`, `pnpm run build`, `pnpm run test`
(413 files / 4611 tests) all pass. **Browser verification is still the
Player's** — the spike is not complete on automated checks alone.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

---

## Iteration 2 — rounded 2.5D representation (2026-09-11)

Implements `docs/design/caves/06-heightfield-cave-representation-design.md`.
The design doc stays the reference for the maths; this section records what
was actually built, what was deleted, and what was deliberately left out.

### Implemented

**Field — `src/debug/caves/caveHeightfieldRepresentation.ts` (rewritten).**
`buildCaveHeightfield(topology, walkSurfaceAt, config)` produces one
node-sampled grid holding `floorY`, `ceilY`, plus two cached derived arrays
(`surfaceY`, `coreT`). `gap = ceilY - floorY > 0` *is* the footprint; there
is no `inside`, no `openSky` and no `signedDistance` array any more.

- Cross-section (`crossSectionAt`) is the complementary superellipse
  `closure(u, n) = 1 - (1 - u^n)^(1/n)` about a waist at `BETA * H`, floor
  exponent `NF = 2.5`, ceiling exponent `NC = 2`.
- **Deviation from the design doc, §5.3.** The doc used one coordinate
  `u = d / (targetWidth / 2)` for both surfaces. The implementation splits
  them so the rounding does not eat the declared usable width (task §6):
  the **floor** uses `t = (d - coreRadius) / band` (flat across the whole
  declared width, curving only inside the rim band) and the **ceiling** uses
  `q = d / (coreRadius + band)` (a dome across the whole section). Both reach
  `1` at the same rim, so convergence is unchanged. `band = clamp(RIM_ASPECT *
  BETA * H, 0.35, 0.9)`; the cap is `PROXY_MARGIN`, so the rounded fringe
  stays inside the radius `minSurfaceOverFootprint` already checks overburden
  against.
- Union is `smin` / soft-max over influences, reusing the **production**
  `smin` from `caveSdfField.ts`. Influences are the entrance capsule, one
  capsule per resampled centerline span, and chamber lobes.
- `FAR_GAP` / `OUTSIDE_REACH`: the diverging extension is clamped to one
  plateau so `gap` is non-increasing outward everywhere. Without the clamp a
  capsule's bounding box (sized by its widest station) let `gap` dip below the
  far-field constant and rise again at the box edge — a gradient bump that
  would push a trapped capsule the wrong way. Caught by a unit test.
- **Deviation from the design doc, §17.** The doc rejected a surface-based
  floor base outright. The reconciliation actually implemented: the walk
  surface is offered to `smin` as a floor *candidate*, pushed away by
  `SURFACE_BLEND_PUSH * max(0, (surfaceY - SURFACE_CLIP_EPS) - ceilY)`. At the
  mouth the cave ceiling reaches the surface, the push is zero and the two
  floors blend continuously (task §4). Twelve metres under the hillside the
  candidate is pushed ~36 m out of range and the floor follows the topology
  centerline exactly, so hillside relief never leaks into the tunnel floor.
- Features: `shelf` raises `floorY` to the authored box's **top face** over an
  elliptical footprint (an elevated floor region beside the lower floor — one
  `floorY` per column, no void underneath); `overhang` lowers `ceilY`. Both
  fade across the rim band so they cannot break the floor/ceiling weld, and
  both run *before* the clearance guard so the guard wins in the walkable core.
- Noise: macro perturbs the **radius** (so floor and ceiling move together and
  the rim never tears), tapered to zero across the mouth; floor/ceiling detail
  is additive and attenuated by `1 - closure(...)` so it vanishes at the rim.
  New salts `lobes` / `macro` / `floorDetail` / `ceilDetail` in the production
  owner `CAVE_RNG_SALT`; new `createValueNoise2D` in `spikeNoise.ts` replaces
  the spike's private copy.
- Clearance guard is **corridor-only** (`U_CORE` / `U_FADE` on the floor's rim
  coordinate) and raises the ceiling, never lowers the floor.

**Mesh — `src/debug/caves/caveHeightfieldMesh.ts` (rewritten).** Marching
squares on `gap` over the node grid. Interior floor/ceiling vertices are
shared between neighbouring cells; the rim vertex on each `gap = 0` crossing
is shared **between the floor and the ceiling**, so the surface folds over at
the rim and the cave is closed with no wall pass at all. Winding is
`(v00, v01, v10)` / `(v10, v01, v11)` for the floor (+Y) and the exact reverse
for the ceiling (−Y) — verified numerically against
`computeVertexNormals()`'s `(C - B) x (A - B)` by a unit test.
`flatShading: false`; `FrontSide` kept on purpose as the permanent winding
detector.

**Traversal — `caveHeightfieldTraversal.ts`.** Same production chain as
before (`pickInterval` → `applyCaveGroundHysteresis` → `integrateVerticalMotion`
→ `applySlopeMovementConstraint` → `resolveCameraBoom`); only the field under
it changed. Lateral containment now pushes out of the
`gap = HEIGHTFIELD_MIN_STANDING_GAP` contour along `∇gap` instead of out of a
footprint mask, and takes the entity's `y`: above the local walk surface, or
outside the cave-local grid, it is a no-op, mirroring `colliderActiveAtY`.
`caveHeightfieldPlayer.ts` is unchanged.

**Mouth — `createCaveHeightfieldTestScene.ts`.** The terrain mesh is built
directly (0.5 m cells, hillside still the production analytic sampler) and
**drops any quad with a corner where the cave void reaches the walk surface**
— the same `ceilY >= surfaceY - SURFACE_CLIP_EPS` predicate the cave mesher
uses to drop its ceiling, so the hole and the portal stop on one contour. The
entrance influence (`buildEntranceInfluence`) straddles the mouth plane and is
sized by `APERTURE_LIFT`, which is what makes the aperture break the surface
at all. Production `createLargeCaveVisual` rocks mask the half-metre cutout
stair, toggleable with `[4]` / `&rocks=0`.

**Fixtures.** `basic` gains a `shelf`, `bend` gains an `overhang`. Chamber
scale is unchanged (task §7).

### Measured (node, median of 5; `cellSize = 0.4`)

| fixture | HF rep | HF mesh | HF total | SDF rep | SDF mesh | SDF index+colliders | SDF total |
|---|---:|---:|---:|---:|---:|---:|---:|
| basic | 11.0 ms | 0.8 ms | **11.8 ms** | 0.2 ms | 99.8 ms | 93.6 ms | **193.7 ms** |
| bend | 16.3 ms | 1.1 ms | **17.4 ms** | 0.2 ms | 165.7 ms | 143.6 ms | **309.5 ms** |
| branch | 17.2 ms | 1.0 ms | **18.2 ms** | 0.1 ms | 132.1 ms | 130.3 ms | **262.6 ms** |

| fixture | HF verts | HF tris | HF geom | HF field | SDF verts | SDF tris | SDF geom |
|---|---:|---:|---:|---:|---:|---:|---:|
| basic | 1,892 | 3,602 | 87 KB | 32 KB | 2,350 | 4,655 | 110 KB |
| bend | 2,244 | 4,300 | 103 KB | 57 KB | 3,217 | 6,391 | 150 KB |
| branch | 2,574 | 4,974 | 119 KB | 55 KB | 3,433 | 6,811 | 160 KB |

~16× cheaper end to end, ~25–35% fewer triangles, and the SDF column index +
collider stages have no counterpart at all — the grid *is* the index.

Cost split for `basic` (2,030 nodes): the production analytic terrain sampler
alone costs **5.1 ms** and the influence/noise loop **4.6 ms**. So roughly
half the field build is terrain sampling that the SDF path also pays (inside
`buildCaveSdfColumnIndex`), not representation work. No optimisation was
applied beyond per-influence bounding-box rejection — measure before tuning.

### Intentionally deferred

- **Genuine 3D overhang.** Only the ceiling-dip reading is implemented; a real
  volumetric undercut needs two void intervals per column and is out of 2.5D.
  No second geometry system was added to hide this.
- **Production migration.** `createCaves()`, the SDF field, the extraction
  worker, collision and streaming ownership are untouched.
- **Chamber scale.** Fixtures keep their current size; production 9–10 m
  chambers are a later comparison.
- **Field-build optimisation.** Station spatial hashing and coarse-node
  rejection are known and unimplemented.
- **Marching-squares saddle cells** merge the two diagonal islands into one
  polygon rather than separating them, and non-convex cell rings are
  fan-triangulated. Both are sub-cell (0.4 m) artefacts.
- **Terrain cutout granularity** is 0.5 m in the harness (production terrain
  is 1 m); the residual stair is masked by rock props.

### Manual verification pending

Everything visual. Automated checks passed (`npx tsc --noEmit`,
`pnpm run lint`, `pnpm run build`, `pnpm run test` — 422 files / 4801 tests),
but geometry quality, the mouth reading as a real opening, traversal feel and
camera behaviour are the Player's call. See design doc §15 for the checklist.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
