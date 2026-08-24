# 173 — Terrain-aware procedural placement — implementation notes

**Plan:** `2026-08-20--173--terrain-aware-procedural-placement.md`

## Review scope

These notes are based on the current `main` codebase, not on the assumptions in the original plan. The plan is still directionally valid, but parts of its description of the existing implementation are now stale.

The first implementation scope is intentionally limited to:

- shared terrain sampling / local terrain-orientation support,
- terrain-aware `stoneCircle`,
- terrain-aware cemetery with meaningful SM/MD/LG layouts,
- preserving the semantics of existing placement systems,
- leaving terrain-aware houses, roads and fields for later extensions.

Do **not** turn this plan into a general terrain-placement framework or redesign unrelated placement systems.

## Current architecture to reuse

### `src/terrain/chunkEnvironment.ts`

This remains the primary procedural placement point for environment/landmark objects. It already owns deterministic per-chunk generation, terrain suitability checks, landmark margins and environment placement data.

Extend this pipeline rather than introducing a second landmark generator, global landmark registry, or separate worker protocol.

The current code already has:

- deterministic seeded generation,
- terrain sampling through the chunk terrain data/apron,
- slope filtering,
- water/road/clearing checks,
- landmark-specific placement constraints,
- `stoneCircle` and `cemetery` support,
- chunk-local lifecycle through `ChunkManager`.

### `src/terrain/chunkManager.ts`

`ChunkManager` is the correct rendering/lifecycle owner. It receives procedural environment data and creates/disposes the corresponding Three.js objects with the chunk.

Do not introduce a global collection of landmark objects or another lifecycle manager.

### `src/settlement/props.ts`

Reuse the existing procedural prop constructors and templates. In particular, the current stone-circle and cemetery implementations are the starting point for the terrain-aware versions.

Do not create a generic procedural-construction framework for this work.

### Existing ground-placement utilities

The repository already has `evaluateGroundPlacement()` / `placeOnGround()` style helpers used by gameplay/world-object placement. They currently represent a specific placement contract, including a slope rejection rule.

**Do not globally change their semantics to make slopes acceptable.** Existing systems such as player placement can rely on the current rejection behaviour.

If terrain-aware landmarks need richer sampling/orientation, add a narrowly scoped helper or extend the utility with an explicitly different operation rather than weakening the existing contract.

## Architectural decision: sampling vs placement strategy

Keep these concerns separate:

1. **Terrain sampling** — determine terrain height and, where useful, local surface orientation from nearby samples.
2. **Placement strategy** — decide how a particular object uses that information.

The shared helper should answer questions such as:

- what is the ground height at world X/Z?
- what is the local terrain normal/plane around X/Z?
- is the local terrain within an allowed slope range?

The caller decides whether to:

- follow the surface normal,
- preserve upright orientation,
- reject the location,
- flatten/approximate the layout,
- use a different rule for individual sub-elements.

This avoids coupling all world-object placement to one universal terrain policy.

## Stone circle

`stoneCircle` is the preferred first implementation target because it is already a composition of individual stones and therefore provides a clean test of terrain-aware placement.

### Required behaviour

For each stone:

1. determine its deterministic local X/Z offset from the circle layout,
2. convert to world coordinates,
3. sample terrain height at that exact position,
4. place the stone on the sampled ground,
5. optionally derive pitch/roll from the local terrain plane,
6. preserve deterministic yaw/scale/variant variation.

Do not place the complete circle as one object and then apply one height/orientation to the whole group. That recreates the existing terrain mismatch on slopes.

The circle should remain recognisable as a circle in plan view; terrain adaptation must not destroy its deterministic layout.

## Cemetery

The current cemetery implementation should be treated as the base, not as proof that the plan is already complete.

Implement meaningful `SM` / `MD` / `LG` layouts rather than simply multiplying the complete cemetery group's scale.

A layout should define the actual arrangement of graves/rows/spacing/aisles. Individual grave elements should then be terrain-aware.

### Recommended process

```text
choose deterministic cemetery size/layout
        ↓
generate local grave positions
        ↓
transform local positions to world X/Z
        ↓
sample terrain for each grave
        ↓
apply ground height + optional local orientation
        ↓
create/place grave mesh
```

The cemetery group itself should not be used as the sole terrain-placement unit.

Keep the existing asset/template reuse. Do not create unique geometry/materials per grave when existing templates can be cloned/reused.

## Terrain orientation

A useful implementation is a small local plane estimate from neighbouring terrain samples, conceptually:

```text
hL = height(x - d, z)
hR = height(x + d, z)
hD = height(x, z - d)
hU = height(x, z + d)

normal ≈ normalize(cross((2d, hR-hL, 0), (0, hU-hD, 2d)))
```

The exact coordinate convention must follow the existing terrain/world axes in the codebase; do not copy the formula blindly.

For individual props, the orientation should normally be clamped/limited. A gravestone or stone should not rotate so far that a visually minor slope produces an obviously artificial lean.

Terrain slope validation and terrain orientation are separate decisions: an object may be rejected on a slope even though its normal can technically be calculated.

## Chunk boundaries

Reuse the existing landmark margin/apron approach.

Do not introduce cross-chunk ownership or a second landmark lifecycle system.

For this implementation, prefer keeping the entire landmark footprint inside its owning chunk. If an existing margin calculation already guarantees that, extend it rather than inventing another boundary mechanism.

This is especially important for cemetery and stone-circle layouts because their footprint is larger than a single small prop.

## Determinism

All layout and terrain-aware placement must remain deterministic for:

- world seed,
- chunk coordinate,
- landmark type,
- landmark variant.

Do not use `Math.random()`.

Do not add a global RNG.

Do not persist generated landmark placement merely to compensate for non-deterministic generation.

The same seed must produce the same result after:

- page reload,
- chunk unload/load,
- returning to an earlier area.

## Performance

Terrain sampling is acceptable because landmarks are deliberately rare, but avoid turning the new helper into a high-frequency per-frame operation.

Sampling should happen during procedural generation / chunk content creation, not in an update loop.

Avoid unnecessary allocations inside loops over cemetery graves or stone-circle elements.

Do not add a worker unless the existing worker-side terrain data is genuinely insufficient. The current chunk generation pipeline already performs the relevant deterministic data work in the worker.

The main-thread implementation should continue to create Three.js objects only after procedural data is resolved.

## Do not modify existing placement semantics globally

A major trap is to interpret “terrain-aware placement” as “make every placement accept arbitrary terrain”. That is not the goal.

Existing systems may intentionally reject steep terrain. Preserve those contracts.

The new functionality should primarily serve procedural environment/landmark composition and may use a richer, explicit helper for local terrain sampling/orientation.

## Scope deliberately deferred

Do not implement these as part of the first pass merely because they appear in the larger plan:

- terrain-aware house placement,
- terrain-aware road/spline placement,
- terrain-aware field/plot segmentation,
- generic modular building placement,
- cross-chunk landmark ownership,
- navigation/pathfinding changes,
- new persistence for procedural landmarks,
- new global landmark manager,
- unrelated refactors.

These can consume the shared sampling mechanism later if the implementation proves useful.

## Suggested implementation order

1. Inspect the exact current `chunkEnvironment.ts`, `settlement/props.ts` and chunk attachment path before editing.
2. Introduce the smallest reusable terrain-sampling/orientation helper that fits the existing APIs.
3. Convert `stoneCircle` element placement to use exact world terrain samples.
4. Verify deterministic reload/unload behaviour and visual grounding.
5. Implement cemetery SM/MD/LG layouts using the same sampling helper.
6. Terrain-align individual cemetery elements where visually appropriate, with a sensible orientation clamp.
7. Re-check chunk margins and existing water/road/clearing/slope constraints.
8. Leave houses/roads/fields for later.

## Important implementation traps

- **Do not use one terrain height for an entire multi-element landmark.**
- **Do not globally relax slope checks.**
- **Do not create a second terrain classifier.** Reuse the existing chunk terrain data.
- **Do not create a second RNG or landmark generator.**
- **Do not create a global landmark collection.**
- **Do not turn local terrain orientation into arbitrary object rotation.** Clamp it where needed.
- **Do not solve large layouts by scaling a single finished group.** Generate meaningful element positions.
- **Do not optimise prematurely with a new worker.** The current chunk worker pipeline is already the appropriate data-generation boundary.
- **Do not refactor unrelated settlement/rendering code while doing this plan.**

## Verification targets

Technical checks should cover the modified TypeScript code.

For visual/gameplay correctness, browser/manual verification should specifically inspect:

1. stone circles on flat terrain,
2. stone circles on moderate slopes,
3. cemeteries on uneven but acceptable terrain,
4. cemetery SM/MD/LG layouts,
5. no floating/sunken individual elements,
6. chunk unload/reload stability,
7. several world seeds,
8. landmark behaviour near water, roads and settlement clearings,
9. chunk-boundary cases,
10. no obvious performance regression from additional sampling.

Visual correctness is not established by TypeScript/build success alone.

## Current-code discrepancies from the original plan

The original plan should not be treated as a snapshot of the repository. In particular:

- landmark generation is already substantially implemented,
- `stoneCircle` and `cemetery` already exist,
- cemetery asset/template support already exists,
- landmark-specific margins and biases already exist,
- chunk lifecycle integration already exists.

Therefore this plan is an **incremental terrain-awareness improvement**, not a new landmark-generation implementation.

## Source files to inspect first

- `src/terrain/chunkEnvironment.ts`
- `src/terrain/chunkManager.ts`
- `src/terrain/chunkHeightmap.ts`
- `src/terrain/chunkHeightmap.worker.ts`
- `src/terrain/chunkHeightmapProtocol.ts`
- `src/settlement/props.ts`
- the current ground-placement utility containing `evaluateGroundPlacement()` / `placeOnGround()`

Also check the current `docs/STATE.md` and the plan itself before implementation; if code has moved again, trust the current code over these notes.

**Zrób git commit i push do main, rebase jeżeli trzeba**