# Implementation Notes: settlements-011 — Plaza layout, paving and core protection

## Recon summary

Current architecture is already plan-first for most settlement infrastructure, but the central area is not fully plan-owned yet:

- `VillagePlan` has `center`, `plots`, `buildings`, `landmarks`, `paths`, but no explicit plaza footprint.
- `layoutClearingsFromPlan()` derives `clearings.core` from `plan.center` + `plazaCoreRadius()`. That core is terrain/vegetation clearing, not a semantic plaza contract.
- well, stockpiles, campfire and market are planned through `pickPlot()` and converted to `VillageLandmarkPlan` by `buildingsAndLandmarksFromPlots()`.
- `props.ts` still chooses the notice-board position at materialization time (`placeFromLandmark(..., undefined, ...)`) and still micro-corrects planned landmark positions through `placeFromLandmark()`.
- MD/LG/XL cobbles are presentation-only random plates in `props.ts`, positioned from `clearings.core`; they do not know planned prop footprints.
- settlement campfires already use `createLitCampfireVisual('pit')`; `CampfireBodyKind = 'pit' | 'simple' | 'pile'`. The existing `pit` is already a small stone-ring fire, so the requested LG/XL masonry variant must be visually/footprint-wise distinct rather than just renaming `pit`.
- woodcutters select trees both from `landmarks.trees` and through `TreeLifecycle.findHarvestableNear()`. Protecting only the landmark list is insufficient.

## Plan data / ownership

Add an explicit plain-data plaza descriptor to `VillagePlan` rather than reusing `clearings.core`, e.g. a circular footprint centered in world space with a radius. Keep it deterministic and Three.js-free.

Recommended ownership:

- planner owns plaza center/radius and all gameplay-relevant central reserved footprints;
- `villageClearing.ts` consumes the plaza where useful for terrain clearing but remains terrain adaptation, not plaza authority;
- `props.ts` only materializes the planned positions/variants;
- tree protection derives from the planned plaza footprint geometrically; do not persist protected tree ids or create another tree registry.

A circle is sufficient for this plan because current central layout and `plazaCoreRadius()` are radial. Do not introduce a generic polygon/occupancy abstraction unless implementation proves it is required.

## Central footprints and planner integration

Reuse `pickPlot()` as the shared spacing mechanism. Do not add a second central-prop collision pass.

Important current gaps:

1. `noticeBoard` is not represented in `VillagePlan`. Add a planned infrastructure/landmark kind for it and place it through `pickPlot()` before `buildingsAndLandmarksFromPlots()` returns.
2. Check every central physical prop materialized around the plaza in `props.ts` for planner ownership. Presentation-only offsets attached to an already planned prop are fine; independent world-space bodies are not.
3. Once an anchor is planned, do not allow `props.ts` to relocate it with `findFlatSpot`/random fallback. Planned central props should use exact X/Z and only sample Y. Keep legacy fallback behavior only for genuinely absent legacy/test plan data if still needed.

Use actual physical radii, not the current single `INFRA_PLOT_RADIUS` where the masonry firepit or market/board needs more clearance. The planner needs the final footprint before spacing decisions; variant selection based on `VillageSize` therefore belongs in planner-side data/config, even if `props.ts` chooses the concrete mesh.

## Plaza sizing and paving

Do not equate `clearings.core.radius` with plaza size. Define one plaza-radius resolver and have both planner and terrain clearing consume it where appropriate; avoid duplicated size tables.

Current `plazaCoreRadius()` gives MD=10, LG=12, XL=14 (default base 9). Treat these as existing calibration input, not necessarily the final paved radii.

Paving rules:

- `SM`/`OUTPOST`: none;
- `MD`: retain the existing sparse `cobbleCountForSize()` treatment if desired;
- `LG/XL`: materialize a full plaza surface from the planned plaza footprint minus reserved central footprints.

For LG/XL, do not scatter hundreds of `Object3D`s. Prefer one/few merged meshes or a small number of `InstancedMesh` batches using existing `buildInstancedProps()` if the plate asset remains appropriate. Generate placements deterministically once during settlement materialization; no update loop.

The paving generator must receive planned exclusion circles (well, fire/firepit, market, stockpiles, notice board, other physical central plots) rather than discover scene objects after construction. Paths/entrances do not need subtraction unless visual overlap proves problematic; avoid expanding scope into road paving.

`cobbleCountForSize()` and its test should remain the MD sparse-paving mechanism or be narrowed to MD. Do not silently reinterpret it as full-plaza density.

## Masonry firepit

Keep `VillageFire` completely unchanged. It owns fuel, ignition, grate capability and flame lifecycle and is independent of body geometry.

The variant seam is `campfireProps.ts`:

- current settlement body is `createLitCampfireVisual('pit')`;
- add a distinct masonry body/variant for LG/XL, or equivalent explicit visual selector;
- keep the returned `CampfireFlame` and `landmarks.campfire` contract unchanged;
- give the masonry variant a larger planner footprint than the current campfire if its geometry warrants it.

Do not use settlement size alone to create a fire. `villageSizeConfig(size).infrastructure.campfires` / the planned `campfire` landmark remains the existence gate.

## Tree protection / woodcutter target selection

Protection should be a pure geometric eligibility rule against the planned plaza footprint, optionally with a small explicit margin. Trees remain normal `TreePresence` / `SettlementTreeLandmark` entries with unchanged `TreeId`, lifecycle and rendering.

Two selection paths must respect the same predicate:

1. `places.ts::workplaceFor()` currently round-robins `landmarks.trees` by `treeIndex`.
2. `NpcAgent` `chopDeposit` can replace that landmark with `forest.lifecycle.findHarvestableNear(...)`.

Prefer one reusable `isTreeWorkEligible(...)` / plaza-protection predicate and apply it to both paths. For the lifecycle query, the cleanest small extension is an optional eligibility predicate on `TreeLifecycle.findHarvestableNear()` so the search can skip protected candidates while preserving nearest-tree semantics for all existing callers. Keep the new parameter optional to avoid changing player harvesting behavior.

Do not filter `landmarks.trees` destructively; other systems may still need the complete canonical settlement tree set.

## Relevant files / tests

Primary implementation surface:

- `src/settlement/villagePlan.ts` — plaza descriptor / planned landmark kind or central prop metadata.
- `src/settlement/villagePlanner.ts` — authoritative plaza and central prop placement; shared `pickPlot()` spacing.
- `src/settlement/villageClearing.ts` — terrain clearing consumes planned plaza semantics without becoming authority.
- `src/settlement/props.ts` — exact-anchor materialization, sparse MD cobbles, LG/XL batched paving, fire visual selection.
- `src/settlement/campfireProps.ts` — masonry body variant only; no fire state.
- `src/settlement/places.ts`, `src/ai/NpcAgent.ts`, `src/world/treeLifecycle.ts` — shared protected-tree work eligibility.
- `src/settlement/villagePlanner.test.ts`, `src/settlement/families.test.ts`, `src/world/treeLifecycle.test.ts` — deterministic layout/paving eligibility/lifecycle-query coverage.

Add tests around plan data rather than rendered meshes where possible: no overlapping planned central footprints, notice board planned, stable plaza radius by size, fire footprint variant only when a campfire landmark exists, protected-tree predicate skipped by both round-robin and lifecycle query, and unprotected nearest trees still selected.

## Implementation order

1. Extend plan data with plaza + missing central planned prop(s), then make planner tests pass.
2. Remove central X/Z relocation from materialization.
3. Add paving generation from plaza + exclusions.
4. Add masonry fire body/footprint while reusing `VillageFire`.
5. Apply one plaza-protection predicate to both woodcutter tree-selection paths.

Avoid unrelated settlement-layout refactors; the existing planner/plot/landmark pipeline is the mechanism to strengthen.