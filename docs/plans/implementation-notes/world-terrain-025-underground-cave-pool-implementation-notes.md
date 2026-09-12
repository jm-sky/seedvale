# Implementation notes: world-terrain-025 underground cave pool

**Reviewed:** 2026-09-13  
**Plan:** `docs/plans/world-terrain-025-underground-cave-pool.md`  
**Baseline:** `main` at `e2a9b21f1ed24053bfe1bffd2266cbcc682811f6`

Focused handoff for the current Cave V2 code. The dependency `world-terrain-024` is already implemented on `main`; use its dungeon contracts rather than reconstructing dungeon semantics.

## Existing ownership to extend

Current chain:

```text
assignCaveArchetypes()
→ buildProductionCaveTopology()
→ buildCaveHeightfieldRepresentation()
→ CaveRuntime
→ distance-streamed cave presentation
```

Relevant code:

- `src/world/caves/dungeonTopology.ts` — authoritative dungeon recipe and rejection loop (`buildDungeonCaveTopology()`), stable chamber ids, deterministic purpose-scoped RNG.
- `src/world/caves/dungeonChambers.ts` — representation-neutral `DungeonChamber` view and semantic classes. Reuse this for pool chamber selection; do not inspect `topology.nodes[]` by index.
- `src/world/caves/caveHeightfieldRepresentation.ts` — sole production cave spatial authority. Basin deformation must end up in this retained field; do not add a second pool heightfield.
- `src/world/createCaves.ts` — constructs topology and retained heightfield for every accepted cave up front, stores one `CaveRuntime`, while meshes are relevance-streamed later.
- `src/world/caves/caveHeightfieldPresentation.ts` / `cavePresentationLifecycle.ts` — lifecycle boundary for cave-local presentation.
- `src/world/WaterSource.ts` — existing data-only gameplay water contract. `createWaterSource('lake')` already gives `{ kind: 'lake', quality: 'unsafe' }`.
- `src/app/interactables.ts` — current natural shoreline interaction discovery is surface-terrain based; do not fake a cave pool as a global lake.
- `src/player/worldWaterEligibility.ts` / `PlayerController.ts` — surface-water swim ownership. There is no separate shared “safe wading depth” authority today; `MAX_SWIM_DEPTH = 1.2` caps swim depth, it is not a wading threshold.
- `src/world/waterMaterial.ts` / `createWater.ts` — shared water shader family, but the chunk lake renderer is coupled to terrain masks/textures and the global surface-water pipeline.

## Architectural decisions

### Pool contract belongs to caves, not topology node kinds

Keep `CaveTopologyNodeKind` unchanged. Add a small cave-owned environmental contract, preferably a dedicated module such as `caveUndergroundPool.ts`, with a frozen data object along these lines:

```ts
type CaveUndergroundPool = {
  id: string
  caveId: string
  chamberNodeId: string
  waterSource: WaterSource
  waterLevel: number
  maxDepth: number
  footprint: /* pure deterministic footprint params */
  shorelineApproach: { x: number, y: number, z: number }
}
```

The footprint representation may differ, but one object must be the authority for basin deformation, water mesh clipping and future semantic queries. Stable id should derive from `caveId` + role, e.g. `${caveId}:underground-pool`.

Expose a narrow read-only `Caves` accessor (`undergroundPoolOf(caveId)` or equivalent) rather than raw topology/runtime state. Non-dungeon caves return `null`.

### Pool validity must participate in dungeon acceptance

The plan requires “accepted dungeon = valid topology + valid pool”. `createCaves()` currently builds the heightfield only after archetype/topology acceptance, so validating the basin only after `buildDungeonCaveTopology()` returns would allow an invalid dungeon to be treated as accepted.

Resolve this by extending the dungeon candidate path, not by post-hoc relabelling. Preferred structure:

1. `buildDungeonCaveTopology()` creates one topology attempt.
2. Deterministically choose/resolve a pool intent from `dungeonChambersFromTopology()` using a new pool RNG salt.
3. Build/validate the candidate retained field with that basin applied, or call a pure pool validator that uses the same deformation/query math as the final field.
4. Reject that dungeon layout attempt when no pool/chamber/basin satisfies guardrails.

Avoid duplicating a second independent “pre-validation geometry” algorithm. If heightfield construction needs the pool intent, extend `buildCaveHeightfieldRepresentation()` with an optional representation-neutral floor modifier/environment feature input used only by dungeon pools. Natural/adventure calls should remain byte-for-byte equivalent in behaviour when that input is absent.

Because `buildDungeonCaveTopology()` currently owns the bounded six-attempt retry loop, keep pool rejection inside that same deterministic attempt loop so a failed pool can try the next dungeon layout before the site falls back to another archetype/site.

### Chamber selection

Use `dungeonChambersFromTopology()` and stable semantic classes. Exclude at minimum `entrance-adjacent`; prefer `regular`/`deep`, then `side`; keep `final` lower priority so later content keeps usable space. Ranking/selection should be deterministic from a new `CAVE_RNG_SALT` stream and chamber ids, never array indexes.

Pool footprint must stay comfortably inside the chamber usable radius. `DungeonChamber.targetWidth`/`targetHeight` are available, but final standable geometry is the heightfield, so resolve shoreline Y/clearance against the built field before accepting.

### Basin deformation and traversal

Do not connect cave pool water to the surface-water swim branch. Current `PlayerController` treats applicable world water as swim-owned vertical motion; `MAX_SWIM_DEPTH` is not a “walk through water” threshold. The cave pool should remain cave-ground movement with a lowered `floorY`; water is semantic/presentation only in V1.

Therefore define a small local cave-pool depth cap based on geometry/traversal rather than importing `MAX_SWIM_DEPTH`. Keep it conservative and documented next to the pool generator. The important invariant is that floor slope/step remains compatible with normal cave movement and `resolveHorizontal`/ground queries; no swim state is entered at all.

Apply a smooth radial/elliptical depression with low-frequency deterministic perturbation. The deformation should be zero outside the footprint, smooth at the rim, and only lower `floorY`; ceiling remains unchanged. Re-run minimum standing-clearance checks after deformation even though lowering floor usually increases vertical clearance—the risk is route/edge geometry and abrupt grades, not headroom.

Validate with the actual retained field:

- center/interior samples are below `waterLevel`;
- rim samples blend back to original floor;
- max `waterLevel - floorY` is within the local pool cap;
- no abrupt floor grade/step along representative crossing rays;
- at least one dry shoreline approach sample has valid occupancy/standing clearance;
- required chamber connections remain reachable without a discontinuity/trap.

Do not modify global `DEFAULT_HEIGHTFIELD_CONFIG` or dungeon cell budgets.

## Presentation

`createWater.ts` is not a drop-in primitive: it depends on chunk masks/height textures/global water-level assumptions. Reuse `createWaterMaterial()` directly if practical, but build a small cave-local mesh from the authoritative pool footprint instead of instantiating the chunk lake renderer.

Keep the water mesh inside the footprint; a simple triangulated footprint/fan at `waterLevel` is enough. Do not add mirror/reflection infrastructure for this pool. The current shader can animate small lake ripples without a new render pass.

Presentation resource ownership must sit with the cave presentation object/job so activation/unload disposes pool geometry/material resources together with the cave. The semantic `CaveUndergroundPool` stays in `CaveRuntime` and is available while presentation is unloaded.

If a shared material instance can safely be reused across active cave pools, prefer it; otherwise explicitly dispose per-presentation material instances. Do not create a global pool manager/update loop.

## Player drink/fill integration

The existing drink/fill actions already accept `WaterSource`; the missing piece is discovery/interaction. Current natural shoreline discovery in `app/interactables.ts` derives shore points from surface terrain/global water and should not receive cave-specific exceptions pretending the pool is a terrain lake.

A bounded integration is acceptable only if it is a small cave semantic adapter: while inside/near the pool's `shorelineApproach`, expose the same interaction action carrying `pool.waterSource`. Reuse `drinkFromWaterSource` / fill handling unchanged.

If this requires invasive changes to shoreline target selection or interaction ownership, leave player drink/fill out of this plan exactly as its bounded-scope clause permits. The pool contract must still expose `waterSource` + shoreline approach for a follow-up.

## Determinism and RNG

Add new pool-specific entries to `CAVE_RNG_SALT`; do not consume `dungeonLayout`, `dungeonShape`, `dungeonBranch`, `dungeonCenterline` or `dungeonFeature` streams. Structural dungeon output for seeds that later fail pool validation may change only because the candidate is intentionally rejected, not because RNG consumption shifted.

Footprint parameters, chamber selection and shoreline choice must derive from `caveId`/stable chamber ids and those dedicated salts. No runtime UUIDs or streaming-order dependence.

## Performance/lifecycle

All retained cave heightfields are currently built at boot, including dungeon. Pool validation/deformation therefore adds boot CPU, not streaming CPU. Keep it O(number of cells in the chosen chamber/field) with no second high-resolution grid and no per-frame spatial regeneration.

Water presentation is rare and streamed. No new worker is justified for this scope.

No persistence changes: semantic pool state is pure from seed + accepted dungeon topology + pool salts.

## Highest-value tests

Prefer focused tests around existing cave suites:

- new `caveUndergroundPool.test.ts`: deterministic chamber/footprint/id/source; excludes non-dungeon; stable shoreline point; max depth/footprint invariants.
- `dungeonTopology.test.ts`: a dungeon attempt with no valid pool is rejected/retried; accepted dungeon always has one valid pool intent; existing graph/footprint guards still hold.
- `caveHeightfieldRepresentation.test.ts` or a focused pool-heightfield suite: deformation only inside footprint, smooth rim, lowered floor, unchanged ceiling/outside samples, bounded depth/grade.
- `createCaves.archetype.test.ts`: every accepted dungeon runtime exposes exactly one pool; natural/adventure expose none; dungeon guarantee/fallback still uses existing sites.
- presentation test if current cave presentation tests have a suitable seam: mesh bounds do not exceed the semantic footprint and resources dispose on unload.
- if player drink/fill is wired: interaction resolves the existing `{ kind: 'lake', quality: 'unsafe' }` source without changing surface lake/river/ocean behaviour.

Do not add tests asserting that `MAX_SWIM_DEPTH` is the pool limit; it is not the current authority for wading.

## Suggested implementation order

1. Add the pure pool contract/resolver + dedicated RNG salts and tests.
2. Thread optional pool floor deformation through heightfield construction without changing non-pool output.
3. Make pool validation part of dungeon attempt acceptance/retry.
4. Store/expose the frozen semantic pool on `CaveRuntime`/`Caves`.
5. Add streamed cave-local water presentation.
6. Add bounded player drink/fill adapter only if it stays small; otherwise document follow-up.
7. Update current-state docs after the implementation reflects reality.

## Model recommendation

**Model:** Opus, Sonnet

This touches the dungeon rejection loop, the single cave spatial authority, streaming presentation and an existing but surface-coupled water interaction path. Opus is the safest primary choice because preserving deterministic fallback/acceptance while avoiding a second geometry authority is the main risk. With these concrete seams and tests, Sonnet is the cheaper fallback with limited extra risk.
