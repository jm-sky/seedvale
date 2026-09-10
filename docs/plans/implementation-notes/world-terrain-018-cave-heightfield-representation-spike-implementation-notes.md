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

## Do not infer current runtime from old Cave V2 notes

Current `docs/STATE.md` says production presentation extraction is already asynchronous and uses a dedicated worker with 55/80 m hysteresis. Older B4 planning notes may describe async extraction as future work.

For this plan that distinction is mostly irrelevant because the spike bypasses production cave runtime entirely, but it matters for avoiding accidental "fixes" to work that is already implemented.

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

1. `src/main.ts`
   - checks `isModelTestMode()` before save/start-screen work;
   - calls `createApp(container, undefined, { modelTest: true })` and returns.

2. `src/app/createApp.ts`
   - checks `options?.modelTest` at the very beginning of app creation;
   - immediately returns `createModelTestScene(container)` before normal world/save/UI bootstrap.

The cave heightfield test should follow the same early-return semantics.

Implementation can either:

- add a parallel boolean option such as `caveHeightfieldTest`, or
- extract a tiny debug-scene routing seam if doing so is genuinely smaller/clearer.

Do **not** introduce a general debug-app framework as part of this plan.

## URL flag seam

`src/debug/debugMode.ts` owns URL-driven lightweight flags through its private `urlFlag()` helper.

Add one explicit function matching the existing style, e.g.:

```ts
isCaveHeightfieldTestMode()
```

Do not add a second URL parser.

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

Exact naming/storage is implementation-owned. The important constraints are:

- one canonical 2D grid;
- no THREE types in representation builder;
- floor/ceiling indexed by the same cell/grid coordinates;
- cells outside footprint are explicitly represented as outside, not via magic height values;
- deterministic output from topology + config/seed.

Typed arrays are preferable to nested arrays because they make cost/memory visible and keep a future worker seam possible without committing to workerization now.

## Footprint derivation

Reuse the semantics already encoded in `CaveTopology` instead of reverse-engineering the SDF primitives.

Recommended derivation:

```text
segment.centerline
    ↓ fixed-distance resample in XZ/3D arc length
node targetWidth interpolation
    ↓
2D capsule/disc coverage per station/segment
    ↓
inside mask
```

Important pitfall: topology centerlines may contain different control-point densities because production generation adapts to terrain. Coverage density must therefore depend on an explicit sampling step, not raw control-point count. This is the same reason production SDF uses fixed arc-length primitive spacing.

For width interpolation, identify segment `from`/`to` nodes by id. Do not hardcode the historical `MAIN_CHAIN` names from the rejected Sweep spike.

## Floor/ceiling derivation

For an inside grid sample, resolve a local centerline station / nearest relevant segment sample and derive:

```text
baseFloorY
local targetHeight
```

Then apply bounded deterministic detail:

```text
floorY = baseFloorY + floorDetail
ceilingY = baseFloorY + targetHeight + ceilingDetail
```

Enforce:

```text
ceilingY - floorY >= topology.minClearance
```

Do not derive ceiling as `surfaceHeight - constant`, because that would couple interior shape to surface and defeat the representation comparison.

Do not use noise amplitude large enough to alter topology connectivity.

## Boundary wall extraction

A naive and adequate spike implementation is grid-edge based:

- for every inside cell, inspect its 4 orthogonal neighbors;
- when neighbor is outside, emit the side quad(s) between local floor and ceiling along that grid edge;
- ensure consistent winding toward the cave interior;
- avoid duplicate faces by owning each boundary edge once.

This is intentionally simpler than contour tracing. Only add contour extraction if the grid-edge result is visually too stair-stepped at the resolution required for a fair comparison.

Do not solve wall quality by returning to a ring sweep around centerline.

## Floor and ceiling mesh

A simple regular-grid triangulation over inside cells is sufficient for the first comparison.

Watch for cells where only part of a quad is inside. The implementation must choose a deterministic policy that does not create holes or triangles spanning outside the footprint. A conservative cell-based mask is acceptable for the initial spike.

Ceiling winding must face inward/downward. Reusing floor indices without reversing them will make the ceiling invisible under normal back-face culling.

## Surface fixture

Do not import `ChunkManager` or run the worker terrain pipeline.

Use a tiny local fixture builder in the debug scope. It only needs to make the entrance readable:

```text
approach plane / gentle slope
→ steep wall/ridge near entrance
→ enough top surface above cave footprint
```

The fixture may be analytic or a small `PlaneGeometry` displaced by a deterministic function.

Do not claim this solves production terrain mouth carving. The current production mouth logic in `src/world/caves/mouthCarve.ts` / `caveSdfField.ts` remains untouched.

## Topology fixtures

Prefer explicit small `CaveTopology` fixtures under the debug/spike scope if the production topology builder needs world placement/terrain context.

Fixtures should preserve the real type and semantics and cover:

```text
basic      entrance → passage → chamber
bend       entrance → curved passage → widening → chamber
branch     trunk + one branch/junction
```

Keep coordinates, widths and heights deterministic and plausible for third-person scale.

Do not hand-author a final footprint; hand-authoring topology fixtures is fine because topology, not geometry, is the comparison input.

## SDF baseline

For the comparison variant, reuse current production SDF builder/extraction functions where they can be called without bringing world boot dependencies.

Likely relevant:

```text
src/world/caves/caveSdfField.ts
  buildCaveSdfRepresentation()

src/world/caves/sdfCaveMesh.ts
  buildSdfCaveMesh() / current extraction-facing API
```

Inspect current signatures before wiring. Do not copy the SDF algorithm into the debug folder.

If current SDF presentation requires a surface sampler for clipping, provide the same local fixture's analytic surface function rather than production terrain/chunk state.

## Comparison controls

Keep controls deliberately small. Preferred order:

1. URL params for initial fixture/variant;
2. one keyboard toggle for `heightfield ↔ sdf` if trivial;
3. minimal on-screen text only if needed to avoid reading console repeatedly.

Do not build a Vue panel or generic observatory for this spike.

Useful URL shape, exact names implementation-owned:

```text
?caveHeightfieldTest&variant=heightfield&fixture=basic
?caveHeightfieldTest&variant=sdf&fixture=basic
```

## Metrics

Use `performance.now()` around pure stages. Keep stage boundaries comparable and report with `console.table()`.

Heightfield suggested stages:

```text
footprint
floorCeiling
mesh
normalsBounds
 total
```

SDF should reuse/print current extraction metrics where available rather than inventing incompatible approximations.

Report:

```text
vertices
triangles
geometryBytes
```

For typed arrays, raw byte cost is `byteLength`; for final `BufferGeometry`, sum actual attribute/index array byte lengths where practical.

Do not include renderer creation, GL compilation or app boot in the representation benchmark.

## Files to inspect first during implementation

```text
src/debug/debugMode.ts
src/debug/createModelTestScene.ts
src/main.ts
src/app/createApp.ts
src/world/caves/caveTopology.ts
src/world/caves/caveSdfField.ts
src/world/caves/sdfCaveMesh.ts
src/world/caves/productionTopology.ts
src/world/caves/mouthCarve.ts
```

Only inspect broader terrain/world code if a concrete missing contract requires it.

## Expected new files

Prefer keeping experimental code out of production cave modules until the spike passes:

```text
src/debug/caves/caveHeightfieldFixtures.ts
src/debug/caves/caveHeightfieldRepresentation.ts
src/debug/caves/caveHeightfieldMesh.ts
src/debug/createCaveHeightfieldTestScene.ts
```

If pure builder tests become useful, colocate them with these files.

Moving a successful representation into `src/world/caves/` belongs to a later migration plan, not this spike.

## Tests worth writing

Focused pure tests only:

1. identical topology/config produces identical typed arrays;
2. every inside cell satisfies `ceilingY - floorY >= minClearance`;
3. straight passage footprint has no internal holes;
4. widening increases footprint width;
5. branch fixture forms one connected footprint at intended junction;
6. boundary wall extraction emits no duplicate boundary edge faces;
7. no generated floor/ceiling triangle references outside array bounds / NaN heights.

Avoid broad scene tests requiring WebGL/DOM scaffolding unless current test helpers already make them trivial.

## Common mistakes to avoid

- Booting the real world from the test mode and defeating the point of the harness.
- Creating an independent `CaveHeightfieldTopology`.
- Hardcoding production node ids / `MAIN_CHAIN`.
- Using raw centerline point count as sampling density.
- Creating "walls" by forcing huge height gradients in floor/ceiling grids.
- Reusing floor winding for ceiling.
- Comparing different cave layouts between SDF and heightfield.
- Importing production `ChunkManager` just to obtain a hill for the entrance.
- Adding special cases for stacked tunnels/overhangs to hide the representation's 2.5D limitation.
- Replacing current production SDF or cave worker during the spike.
- Treating historical Sweep code as a base implementation.
- Running browser verification as the implementation agent.

## Completion output

Implementation is complete when the Player can open the lightweight URL directly and switch/compare SDF and heightfield on the same deterministic topology without waiting for Seedvale world generation.

The implementation commit should not change production cave behaviour.

After Player comparison, record measured results and the architecture decision in a dedicated review/decision note before planning any migration.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
