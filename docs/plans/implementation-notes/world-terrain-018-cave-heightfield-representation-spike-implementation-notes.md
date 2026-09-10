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

Use a tiny deterministic local fixture with:

```text
approach plane / gentle slope
→ steep wall/ridge near entrance
→ cave mouth
→ enough top surface above cave footprint
```

This does not solve production mouth carving. `src/world/caves/mouthCarve.ts` and production terrain integration remain untouched.

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

> **Zrób git commit i push do main, rebase jeżeli trzeba**
