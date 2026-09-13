# Implementation Notes: Distant Cave Mouth Occlusion

Plan: `docs/plans/world-terrain-026-cave-distant-mouth-occlusion.md`

## Current-code ownership

The bug is a presentation lifecycle mismatch between two intentionally different owners:

- `src/terrain/terrainCutout.ts` + `ChunkManager.registerTerrainCutouts()` own the persistent terrain aperture. The cutout is terrain mesh topology and must remain independent of player distance.
- `src/world/createCaves.ts` owns Cave V2 runtime/presentation lifetime.
- `src/world/caves/cavePresentationLifecycle.ts` owns only the **full cave presentation** relevance state (`55 m` activate / `80 m` deactivate) and generation/stale-build protection.
- `src/world/caves/caveHeightfieldPresentation.ts` assembles the current full cave group.
- `src/world/caves/caveHeightfieldMesh.ts` already owns pure CPU geometry generation around the cave mouth and contains the reusable mouth-rim sampling machinery used by `buildMouthUndersideMaskBuffers()`.

Do not move the terrain cutout into streaming state and do not add another cave spatial representation.

## Important correction to the plan wording: proxy coverage must extend beyond 80 m

The existing `createCaveStreamingController()` cannot be the relevance gate for the distant proxy. Its full-presentation state intentionally drops caves at `80 m`; a proxy created only while a cave is `wanted` would therefore recreate the original naked-hole bug at distances beyond 80 m.

`pickLargeCaveSites()` currently defaults to only `10` world-scale cave sites (`src/world/largeCaves.ts`, `DEFAULT_COUNT = 10`). The smallest robust implementation is therefore:

1. build one tiny mouth proxy for every **accepted** `CaveRuntime` during `createCaves()` setup, after heightfields are known;
2. attach those proxies to the scene eagerly;
3. keep them resident for the `Caves` lifetime;
4. toggle only `visible` (or attach/detach without rebuilding) when a full presentation is accepted/dropped;
5. dispose them once from `Caves.dispose()`.

This guarantees coverage at every terrain-visible distance without a new grid/relevance manager, per-frame geometry work, or terrain rebuilds. If cave counts become materially larger in a future plan, proxy streaming can be revisited then; do not optimize for that hypothetical now.

## Geometry implementation

### Preferred location

Add the pure geometry builder in `src/world/caves/caveHeightfieldMesh.ts`, next to `buildMouthUndersideMaskBuffers()`, because that file already owns mouth-rim geometry derivation and has access to the private `sampleMouthRim()` helper.

Suggested contract (exact names flexible):

```ts
export type CaveMouthOccluderBuffers = {
  positions: Float32Array
  indices: Uint32Array
  vertices: number
  triangles: number
}

export function buildCaveMouthOccluderBuffers(
  field: CaveHeightfieldRepresentation,
  mouthOpening: (x: number, z: number) => number,
  walkSurfaceAt: SurfaceSampler,
): CaveMouthOccluderBuffers
```

Then add a thin Three.js wrapper in `src/world/caves/caveHeightfieldPresentation.ts`, e.g. `createCaveMouthProxy(...)`.

### Reuse the actual mouth contour

Do not define a second fixed-width doorway from `LARGE_CAVE_MOUTH_WIDTH` or entrance constants. The authoritative visible aperture is already `mouthOpeningAt(field, walkSurfaceAt, x, z)` and the existing `sampleMouthRim()` follows that contour.

The occluder should derive its footprint from the same rim so terrain cutout and distant blocker cannot drift apart after future mouth-shape changes.

### Do not reuse the underside mask as the blocker

`buildMouthUndersideMaskBuffers()` is seam insurance, not an aperture closure. It emits a rectangular beam around the rim, deep mouth patches and an under-entrance plane; it intentionally leaves the doorway open. Creating that same mask earlier will not reliably stop background/sky visibility through the center of the mouth.

Add a separate minimal backing geometry.

### Recommended shape

Prefer a **shallow dark cap/backing inside the mouth**, not a fake terrain patch at surface level.

Implementation guidance:

- use `openingDirection(field.entrance.yaw)` / existing cave orientation helpers;
- derive the lateral/vertical extent from the sampled mouth rim / heightfield rather than hard-coding the surface hole size;
- place the blocking face a small distance inside the entrance, below/behind the terrain rim, so it cannot z-fight with or protrude through the surface;
- if a single face leaves oblique-angle leaks, extend it into a tiny shallow shell (back face + short sides/top/bottom) rather than increasing full cave streaming distance;
- geometry is presentation only: no collider, query, persistence, interaction or userData-based gameplay contract.

A successful helper should return empty/null only when the field has no valid surface-breaking mouth.

Do not reuse the full `buildHeightfieldMeshBuffers()` output for the proxy; that defeats the purpose of avoiding distant full-interior geometry.

## Material ownership

`createCaves()` already creates one shared `maskMaterial` through `createMouthUndersideMaskMaterial()` and marks it `userData.sharedGpu = true`.

Prefer reusing that dark matte material for the distant blocker unless visual verification shows a specific reason not to. It already has the desired cave-dark appearance and `fog: false`, and using it avoids another material/program lifecycle.

If the proxy wrapper uses `disposeObject3D()`, shared material ownership must remain protected by `userData.sharedGpu`; only proxy geometry is per-cave disposable.

Do not use the heavier cave surface material unless the proxy actually needs it.

## `createCaves()` lifecycle integration

Add a map owned beside `presentations`, for example:

```ts
const mouthProxies = new Map<string, THREE.Object3D>()
```

Build proxies once from `runtimes` after shared proxy material exists. Since `maskMaterial` is currently created after terrain cutout/grid setup, keep ordering simple: create the shared material, build all proxies, add them to `scene`, and store by `caveId` before normal update-driven full presentation activation matters.

A small helper is preferable to scattered `visible` writes:

```ts
function setMouthProxyVisible(caveId: string, visible: boolean): void
```

### Full presentation activation ordering

Current full build flow is:

```text
queue drain
  -> streaming.markBuilding(...)
  -> attachPresentation(...)
  -> streaming.accept(...)
```

Do not hide the proxy before `streaming.accept()` succeeds. `attachPresentation()` can throw, and stale generations can be rejected after the group was built.

Preferred transition:

```text
markBuilding
  -> build + attach full group
  -> accept succeeds
  -> proxy.visible = false
```

If build throws or `accept()` rejects the generation, leave/restore proxy visibility and dispose the rejected full group.

It is reasonable to move the hide operation into the queue callback immediately after successful `accept()` rather than inside `attachPresentation()`, because acceptance is the real lifecycle boundary.

### Full presentation deactivation ordering

`createCaveStreamingController.drop()` calls the hook `disposePresentation()` after transitioning the record to inactive. The hook is therefore the correct seam to guarantee the proxy becomes visible before the full group disappears.

At the beginning of `disposePresentation(caveId)`:

```text
show proxy
-> unregister lights / pool state
-> remove + dispose full group
```

This also covers normal 80 m deactivation and controller disposal.

Be careful with the existing early return:

```ts
const group = presentations.get(caveId)
if (!group) return
```

Proxy restoration must happen **before** that return, otherwise failed/stale/no-group teardown paths can leave the proxy hidden.

### World disposal

`Caves.dispose()` should:

- dispose streaming/full presentations through the existing path;
- remove every mouth proxy from the scene;
- dispose each proxy geometry exactly once;
- clear the proxy map;
- dispose the shared `maskMaterial` only once from the existing cave owner, not per proxy.

Do not let `streaming.dispose()` accidentally recreate visible proxy state after proxies have already been destroyed; order final teardown accordingly (restore callbacks may run, then destroy proxy objects).

## Streaming controller changes

Prefer **no semantic changes** to `createCaveStreamingController()`.

It correctly models expensive full cave presentation and should continue to own:

- 55/80 m hysteresis;
- queued/building/active phase;
- generation identity;
- stale build rejection.

The distant proxy is resident fallback presentation owned by `createCaves()`, not another phase in that state machine.

Do not add a second `proxyWanted` set, second distance pair, or another nearest-first queue for this plan.

`peekStreamingDebug()` does not need a new proxy counter unless implementation/debugging benefits from it. If added, keep it presentation-only and clearly separate resident proxy count from active full presentations.

## Tests to extend

### `src/world/caves/caveHeightfieldMesh.test.ts`

Add direct tests for the pure occluder buffer builder using the existing production cave heightfield fixtures.

Useful assertions:

- production mouth fixtures produce non-empty vertices/indices;
- indices are in range and triangles are finite/non-degenerate;
- generated vertices stay inside/below the mouth region expected by the heightfield rather than creating a terrain-level cover plate;
- geometry size stays intentionally small (use a generous upper bound, not a brittle exact vertex count);
- a field with no surface-breaking mouth produces empty buffers if such a fixture/helper is already available.

Do not assert exact floating-point coordinates unless they are part of an existing fixture contract.

### `src/world/createCaves.test.ts`

Use the existing fake scene/chunk manager setup and test lifecycle, not browser rendering.

Cover these state transitions:

1. after `createCaves()`, accepted caves have resident mouth proxies even when the observer is farther than `80 m` and no full presentation is active;
2. moving inside activation range and draining the one-build-per-update queue accepts the full presentation and hides the corresponding proxy;
3. moving beyond deactivation range restores proxy visibility before/removing the full presentation;
4. failed or rejected/stale full presentation paths never leave both the full presentation absent and the proxy hidden;
5. cave spatial query results are unchanged by proxy visibility;
6. `dispose()` removes proxy scene objects/resources.

If current public test seams do not expose proxy state, prefer inspecting named scene children (`cave-mouth-proxy:<caveId>`) in tests over adding a new gameplay/public `Caves` API solely for tests.

Give the proxy object a deterministic name for diagnostics/tests.

## Files expected to change

Primary:

- `src/world/caves/caveHeightfieldMesh.ts`
- `src/world/caves/caveHeightfieldMesh.test.ts`
- `src/world/caves/caveHeightfieldPresentation.ts`
- `src/world/createCaves.ts`
- `src/world/createCaves.test.ts`

Possibly, only if diagnostics are genuinely useful:

- `src/world/caves/cavePresentationLifecycle.ts` for type/debug output only; avoid changing lifecycle semantics.

No changes should be required in:

- `src/terrain/terrainCutout.ts`
- `src/terrain/chunkManager.ts`
- cave ground/occupancy/horizontal query modules
- persistence/save schema
- topology/archetype generation

## Guardrails / likely mistakes

- **Do not gate the proxy at 80 m.** That leaves the original bug at long distance.
- **Do not toggle terrain cutouts.** It couples terrain topology to observer distance and forces remesh/pop behaviour.
- **Do not hide proxy when build merely starts.** Hide only after the full presentation is accepted.
- **Do not rebuild proxy geometry per frame or per threshold crossing.** Build once.
- **Do not use the full cave mesh as distant fallback.** The plan exists to avoid that cost.
- **Do not make the proxy spatial authority.** It must never participate in `queryGround`, `occupancyAt`, `queryInterior`, `resolveHorizontal`, fauna/NPC traversal or interaction targeting.
- **Do not create per-cave materials.** Reuse the shared dark mask material where practical.
- **Do not depend on camera orientation.** The world continues independently of camera/player; the proxy is a world presentation fallback.

## Verification

Technical minimum:

```text
npx tsc --noEmit
pnpm run test -- src/world/caves/caveHeightfieldMesh.test.ts src/world/createCaves.test.ts
```

Use the repository's actual test CLI syntax if the wrapper requires different argument forwarding.

Manual browser verification remains the User's responsibility. Important visual checks are distant frontal and oblique views, the 55 m activation transition, the 80 m deactivation transition, and repeated approach/retreat without a one-frame bright hole.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
