# Implementation notes: Household wells and population scaling

Plan: `docs/plans/settlements-npcs-035-household-wells-and-population-scaling.md`

## Current ownership and control flow

The current settlement-water path is split across four existing owners. Keep those owners; do not introduce a new water/well manager.

- `src/settlement/villagePlanner.ts` owns deterministic settlement layout. It currently creates one forced `plot-infra-well` at `VillageCenter` before house plots. `pickPlot()` already owns terrain height, slope, river-footprint rejection, spacing, deterministic candidate scoring and bounded fallback placement.
- `src/settlement/villagePlan.ts` already allows multiple `VillageLandmarkPlan` entries of kind `well`; `index` is the existing same-kind discriminator. The missing multiplicity is primarily in runtime projection, not in the plain-data plan shape.
- `src/settlement/props.ts` owns physical materialization and `SettlementLandmarks`. Today `SettlementLandmarks.well` / `wellProp` are the singleton compatibility surface consumed by runtime code.
- `src/settlement/createSettlement.ts` owns runtime composition: households, props, interaction queues and construction of each `NpcAgent`. It currently creates one queue from `wellQueueId(def.id)` and `landmarks.well` / `wellProp`.
- `src/ai/NpcAgent.ts` owns water-source choice at action start. `resolveWaterWellTarget()` currently compares the singleton settlement well against a nearby completed player-built well, using distance from `home`. `water` and `waterDuty` both consume that resolver.
- `src/simulation/interactionQueue.ts` is already the correct reservation/capacity primitive. One queue per generated well is enough; do not add queue scheduling infrastructure.
- `src/settlement/household.ts` / `Household.water` remain the authoritative household water reserve. A household well is only a source/interaction location, not a second water stock.

## Deterministic household-well selection

Add one pure resolver near settlement-generation ownership, preferably in a small settlement module if keeping it inside `villagePlanner.ts` would make the planner policy-heavy. The resolver should consume only stable generation inputs: settlement/family seed, `FamilyDef[]` and their stable `familyIndex` ordering.

Recommended output shape is minimal, e.g. a `Set<number>` / `number[]` of family indices selected for household wells. Do not return Three.js objects or runtime `Household` instances.

Selection order:

1. family member count `>= 3` => selected;
2. member count `=== 2` => independent deterministic 50% roll using a family-index-specific seed stream;
3. single-person households are initially unselected;
4. compute `floor(totalPopulation / 6)` minimum additional wells;
5. if under minimum, promote failed 2-person households first in stable deterministic order;
6. if still under minimum, select remaining households by descending household size, then stable `familyIndex` (or a dedicated deterministic tie-break if desired);
7. never select one household twice.

Important: do not use the same RNG stream as names/roles/ages. Use the project pattern of xor/multiplied dedicated seed salt so this feature does not reshuffle unrelated generated properties.

## VillagePlan integration

Central well semantics must stay unchanged: the existing `plot-infra-well` remains the plaza well and continues to be the stable central landmark.

Household wells should be added only after house plots exist, because the house plot is the natural attractor. For each selected `familyIndex`:

- resolve the corresponding `plot-house-{familyIndex}`;
- create a separate `role: 'infrastructure'` plot with stable id such as `plot-household-well-{familyIndex}`;
- use the residential zone (or house plot vicinity) plus `attractor: { x: house.x, z: house.z }`;
- set a preferred ring outside the house footprint/yard clearance, not at the house center;
- let existing `pickPlot()` perform slope, dry-path, river, spacing and fallback handling;
- emit a `VillageLandmarkPlan` of kind `well` with a stable non-central index/id tied to `familyIndex`.

Do not materialize these via `houseYardPlacements()`. `householdYardRadius()` currently guarantees clearance only for the existing barrel/trough/wood/storage offsets; silently adding a full well there would invalidate that contract and its tests.

Watch the fallback behavior in `pickPlot()`: its final fallback is intentionally permissive except for river push-out. If a household-well preferred ring is too tight in dense LG/XL villages, prefer tuning that placement request/ring over creating a second placement algorithm.

## Runtime projection: remove only the harmful singleton assumption

The least disruptive runtime change is to add a collection while preserving the current central aliases.

Suggested conceptual shape in `props.ts` / `SettlementLandmarks`:

```ts
type SettlementWellLandmark = {
  id: string
  position: THREE.Vector3
  prop?: THREE.Object3D
  familyIndex: number | null
  isCentral: boolean
}

wells: SettlementWellLandmark[]
well: THREE.Vector3       // compatibility alias to central well
wellProp?: THREE.Object3D // compatibility alias to central well prop
```

Exact naming can follow local style. The important invariant is that `well` / `wellProp` remain central-only compatibility fields while all new targeting/queue code uses the collection.

When materializing props, derive household-well identity from the plan landmark/plot id, never mesh identity or array position alone. Keep `familyIndex` affinity as generation/runtime metadata; it is not ownership state and does not belong in `Household` persistence.

## Interaction queues

`createSettlement.ts` already owns the `Map<string, InteractionQueue>`. Extend that same map with one queue per settlement well.

Do not change `InteractionQueue` unless a tiny helper for stable ids is useful. Its existing `servingCapacity: 1`, waiting slots and anchor resolution are sufficient.

The current helper `wellQueueId(settlementId)` encodes singleton semantics. Either:

- widen it to accept a stable well discriminator while preserving the old central id where compatibility matters, or
- add a sibling helper for household-well ids.

Prefer stable ids derived from settlement id + well identity/family index. Avoid runtime array indices if those can change independently of plan identity.

For each well with a prop, reuse `buildWellInteractionQueueConfig()` from `wellInteractionQueue.ts`; for fallback/procedural cases keep the existing `WELL_QUEUE_SERVING_OFFSET_FALLBACK` path.

## NPC source selection

Keep source selection inside `NpcAgent.resolveWaterWellTarget()` or a small pure helper called by it. Do not add a manager or per-frame lookup.

The resolver should compare all settlement wells plus the existing nearby completed player well from the NPC household home position. Return enough context to execute the chosen source correctly, not only a position. Minimum useful result:

```ts
{
  position,
  queueId: string | null,
  isSettlementWell: boolean,
}
```

A stronger result may carry the concrete well id/position for SFX/facing. The essential point is that queue membership, SFX and facing must refer to the same selected well.

Preserve current semantics:

- household stored water and personal container strategies still outrank the `well` strategy according to existing strategy selection;
- both `water` and `waterDuty` use the same selected source logic;
- source choice happens when the action starts, not on every update tick;
- distance remains measured from `home`, giving stable household-local behavior;
- no congestion score in this plan.

## SFX / facing trap

There are hard-coded central-well assumptions in `NpcAgent` around queued drinking presentation. Existing code checks `action.queueId === this.wellQueueId` and/or compares the action destination against `this.landmarks.well`, then plays well SFX at `landmarks.well`.

With multiple wells, do not infer presentation source from one global queue id. Carry the selected well position/id on the planned action or resolve it from the selected queue context so:

- draw SFX plays at the actual selected well;
- facing points at the actual selected well;
- player-built wells remain valid non-queued targets;
- household wells use their own queue.

Avoid introducing a special household-well action kind; `kind: 'drink'` plus source context is sufficient.

## Household/runtime indexing seams to reuse

`createSettlement.ts` already establishes stable aligned mappings:

```text
def.families[familyIndex]
→ homePlaces[familyIndex]
→ households[familyIndex]
```

Reuse that alignment when attaching local-well affinity. Do not create a second household lookup registry.

The existing household storage and blacksmith-workplace code are useful patterns for family-index-bound local props. Household well differs only because it needs a real planner-level infrastructure plot rather than an offset yard prop.

## Persistence and rebuild

No `SaveData` change is required.

Settlement generation / `VillagePlan` is deterministic reconstruction; household water quantity is already persisted through `HouseholdRegistry`. Therefore:

- do not add well arrays to save data;
- do not bump `CURRENT_SAVE_VERSION`;
- do not add migration code;
- in-session `WorldBundle` rebuild should regenerate the same household wells from the same seed/families automatically.

There is currently no persistent worldgen-cache namespace owning settlement-plan geometry; settlement plan memoization is derived/in-session. Do not bump unrelated cache versions.

Future condition/broken/build-progress state is explicitly out of scope; when added later it should be an override/delta over the deterministic well identity, ideally reusing settlement structure condition/repair ownership rather than creating a parallel well registry.

## Tests worth adding/updating

Prefer pure tests around the new selection resolver before integration tests.

- 3+ members always selected.
- known two-person family seeds exercise both sides of the deterministic 50% branch.
- total population 6/12/18 enforces 1/2/3 additional wells respectively when base selection is short.
- fallback promotes unselected 2-person households before singles.
- no duplicate family index.
- same seed + families returns the same selected set.
- village plan retains central `plot-infra-well` at center and adds stable household-well plots/landmarks only for selected family indices.
- household-well plots do not overlap ordinary spacing/rivers in existing planner fixtures.
- runtime queue map contains one distinct queue per settlement well.
- source selection chooses nearest settlement well from `home`, can still choose a closer player-built well, and returns the corresponding queue id.
- update fixtures that construct `SettlementLandmarks`; preserve central `well` fields so unrelated tests do not need broad rewrites.

Likely existing test files:

- `src/settlement/villagePlanner.test.ts`
- `src/settlement/settlementGenerator.test.ts`
- `src/settlement/places.test.ts` and other `SettlementLandmarks` fixtures
- focused `NpcAgent`/water strategy tests if present after current-main search

`src/simulation/interactionQueue.test.ts` should not need behavioral changes unless the queue-id helper contract itself is changed.

## Documentation after implementation

`docs/state/settlements.md` currently documents one settlement-wide well queue. Update that standing/current-state description after code lands so it states that central + household wells each use the existing `InteractionQueue` and that household wells are deterministic settlement infrastructure, not persisted household water state.

Do not rewrite `docs/state/water.md` unless implementation changes physical/natural water-source semantics; this plan is settlement logistics/layout, not terrain hydrology.

## Guardrails

- No new `WaterSystem`, well manager, queue manager or resource registry.
- No new save schema fields.
- No `Math.random()`.
- No genealogy/household clustering in this plan.
- No quest/build-progress/condition/repair behavior yet.
- No least-loaded/congestion routing.
- No change to `Household.water` ownership.
- No browser automation; manual gameplay verification is performed by the User.

> **Zrób git commit i push do main, rebase jeżeli trzeba**