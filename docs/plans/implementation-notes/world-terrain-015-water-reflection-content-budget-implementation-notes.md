# Implementation notes: Water Reflection Content Budget

**Companion to:** `docs/plans/world-terrain-015-water-reflection-content-budget.md`

## Current architecture to reuse

The mirror pipeline already has the mechanisms this plan should prefer instead of creating parallel visibility infrastructure:

- `src/world/waterMirror.ts`
  - owns the shared planar reflection pass,
  - `WATER_MIRROR_SIZE = 128`,
  - exposes `AGENT_RENDER_LAYER`, `REFLECTION_SKIPPED_LAYER` and `REFLECTION_DISTANT_LAYER`,
  - mirror camera intentionally renders only the normal reflection-visible layer,
  - mirror cadence is already bounded and shadow-map auto-update is suppressed during the pass.
- `src/app/renderStack.ts`
  - enables reflection-related layers for the main camera; do not accidentally make a mirror exclusion disappear from the main render.
- `src/world/createLights.ts`
  - the shadow camera enables `REFLECTION_DISTANT_LAYER`; this is why distant reflection exclusion can preserve shadow casting.
- `src/terrain/chunkManager.ts`
  - owns chunk-level reflection visibility synchronization,
  - existing reflection budget moves outer-ring terrain/non-instanced vegetation/environment between the normal layer and `REFLECTION_DISTANT_LAYER`,
  - synchronization is tied to chunk/content/LOD lifecycle rather than a per-frame scene walk.
- `src/terrain/vegetationRegionBatcher.ts`
  - vegetation/environment instancing is already region-scoped,
  - `syncReflectionVisibility()` tracks per-chunk visibility and applies a conservative “any member visible” rule to the region group,
  - do not create a second vegetation batching or reflection ownership path.

## Important historical result

Archived plan 144 (`docs/plans/archive/2026-08-17--144--water-reflection-gpu-optimization.md`) and its implementation notes are useful context, not a specification to reimplement.

Stage S already added `REFLECTION_DISTANT_LAYER` and excluded the outermost streaming ring. Its browser benchmark showed only a weak improvement: in the representative `current` run mirror draw calls moved roughly 206 → 197 with essentially unchanged WATER/FPS; `water` had a small draw-call reduction but was already GPU-light. The visual playtest was accepted.

Implication: **do not start by making the same distance budget more complicated.** First establish the current remaining mirror cost.

## Region batching is already implemented

Archived plan 143 (`docs/plans/archive/2026-08-17--143--cross-chunk-vegetation-batching.md`) is done. Current `vegetationRegionBatcher.ts` batches these kinds regionally:

- living trees,
- bush/cactus/reed/fern/lily/seaweed,
- large rocks/rock clusters/fallen logs.

`REGION_CHUNKS = 3`. The batcher already integrates LOD and reflection visibility. Any plan/research text describing vegetation as still fundamentally `(chunk × species)` should be checked against this current implementation before drawing conclusions.

## Settlement boundary

Settlement rendering is not owned by `chunkManager`/`vegetationRegionBatcher`. `src/settlement/createSettlement.ts` receives the root `group` from `buildSettlementProps()` and adds it to the scene. If current profiling identifies settlement content as the dominant remaining mirror cost, inspect `src/settlement/props.ts` / the returned hierarchy before choosing a mechanism.

Do not mechanically relayer the whole settlement root: large silhouette-relevant buildings and small decorative props have different reflection value, and point lights/shadows/other subtree consumers may share that hierarchy.

## Profiling rule

Prefer existing performance instrumentation and scene census. Add instrumentation only when a specific missing measurement blocks the decision.

The implementation session should answer only:

1. what meaningful category still dominates mirror submissions/geometry now,
2. whether it can be excluded/reduced using existing ownership/lifecycle,
3. whether that change stays small enough for this S plan.

If answer 2 or 3 is no, stop. Do not spend the session designing a replacement architecture.

## Safe integration pattern

If a cheap candidate is found, prefer assigning its reflection layer when the object/group is created, attached, rebuilt or otherwise already synchronized by its owner.

Avoid mirror-pass code shaped like:

```text
walk objects → mutate visible/count/material → render mirror → restore everything
```

That adds hot-path CPU work and fragile shared state to save GPU/submission work.

Also preserve the distinction between:

- `REFLECTION_SKIPPED_LAYER` — content that can be absent from reflection without needing the distant-layer shadow behavior,
- `REFLECTION_DISTANT_LAYER` — reflection-hidden content that still participates in the normal/shadow render paths.

Check current code before choosing either layer; do not infer shadow semantics from the name alone.

## Stop conditions

Stop without a production reflection change when:

- current mirror cost is already too small to justify work,
- no single category is a meaningful remaining contributor,
- the only promising solution requires reflection-specific HLOD/proxies,
- it requires broad settlement/chunk ownership changes,
- it requires a large per-frame visibility traversal/mutate-restore cycle,
- it turns into a general renderer refactor rather than a bounded mirror optimization.

Record the measured reason in these implementation notes if implementation reaches such a stop condition.

## Verification boundary

AI performs code-level checks only. Browser benchmark and visual acceptance belong to the user.

Do not continue to a second optimization before the first candidate has been benchmarked in browser. This preserves the ability to attribute any performance change and prevents the plan from expanding into an open-ended rendering session.
