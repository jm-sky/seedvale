# Implementation Notes: settlements-005 Residential House Construction

These notes are for the implementation agent. They record current-code integration points and decisions that should not need to be rediscovered. Follow the plan for scope/behaviour and current code when it has changed since these notes were written.

## Current architecture to reuse

- `src/app/actions/placementActions.ts` owns the canonical player ground-placement seam. `GroundPlacementDefinition`, `previewGroundPlacement()` and `evaluatePlacementSite()` keep preview and authoritative confirmation on the same validation path. Houses should enter this path rather than introduce a house-only placement controller.
- `src/world/createTerrainPreparations.ts` owns persistent `TerrainPreparationRecord`s and actor-neutral `contributeWork(id, amount)`. House footprint preparation must reuse this mechanism and revalidate normal placement after preparation completes.
- `src/world/createPalisades.ts` and `src/world/createStandingTorches.ts` are the closest incremental-construction references. Progress belongs to the target record; `contributeWork()` clamps to useful remaining work and reports only accepted work.
- `src/items/constructionMaterials.ts` is the shared construction-material seam. Reuse existing `ItemKind` values and inventory/material helpers. Do not add planks, thatch or house-only resource kinds for this plan.
- `src/world/workContract.ts` owns the authoritative `WorkContractRecord`; `src/world/createWorkContracts.ts` owns its runtime collection/mutations; `src/ai/NpcAgent.ts` executes target work. Contracts own commitments, not construction progress.
- `src/settlement/lodging.ts`, `src/settlement/lodgingResolver.ts` and `src/app/actions/restActions.ts` already own lodging selection, `LodgingQuality` and sleep restoration/time skip. House lodging must feed this path rather than mutate `PlayerNeeds` directly.
- `src/settlement/household.ts` and the existing `Place(type='home')` semantics remain the occupancy/home concepts. Do not make the residential-building subsystem a second household registry.
- `src/settlement/landOwnership.ts` is an existing player-facing land-plot ownership registry, but it is specifically a sparse `settlementId:plotId` set. Residential-building ownership is not the same thing; do not overload `LandOwnershipRegistry` to mean house ownership.

## Residential-building authority and identity

Add one domain-owned runtime collection for player-built residential buildings, following the lifecycle of other persistent player-built world systems. `SaveData`, Vue state, Work Contracts and `Place` must not become runtime authority for construction state.

One stable building identity must survive:

```text
placement
→ foundation
→ structure
→ roof
→ completed home
```

The authoritative record needs enough state to derive/restore:

- stable building id,
- `small_house` / `medium_house`,
- position and rotation,
- current stage and stage work progress,
- stage material-gate state,
- completion,
- owner,
- settlement association when present,
- stable completed `home` linkage.

Keep immutable footprint, capacity, required work and material requirements in definitions rather than copying them into every record unless persistence compatibility genuinely requires snapshots.

## House definitions

Both sizes use one definition-driven mechanism. The confirmed v1 capacities are fixed gameplay decisions, not values to rediscover during implementation:

- `small_house`: housing capacity **3**,
- `medium_house`: housing capacity **6**.

The medium house differs through definition data: larger footprint and higher work/material requirements. It must not get a separate construction pipeline.

Choose exact work/material quantities from existing `ItemKind` and current construction timings during implementation. Do not introduce new material kinds merely to make a more realistic recipe.

## Construction stages and material gates

Use exactly:

```text
foundation → structure → roof → completed
```

`completed` is the terminal state, not another work-bearing stage.

Materials are stage-gated. The intended mutation boundary is:

```text
supply all required materials for active stage
→ consume/commit them once
→ stage becomes work-enabled
→ Player/NPC contributions advance stage
→ stage completes
→ next stage starts blocked until its materials are supplied
```

Do not consume fractional materials per work tick. Do not spend anything during preview/query operations.

A contribution that finishes a stage must not spill excess work into the next stage before that stage's material gate is satisfied. Return only actually accepted work so Work Contract accounting stays correct.

Material-blocked must be distinguishable from completed/missing/invalid: it has zero useful work *now* but remains a valid construction target that can resume after supply.

NPC procurement, hauling and autonomous material resupply are outside this plan. Player-supplied materials are sufficient for v1.

## Shared Player/NPC work

There is one authoritative building progress regardless of actor. Player and NPC work must hit the same residential-building `contributeWork(id, amount)` seam.

Do not store worker ids, crew state or duplicated progress on `ResidentialBuildingRecord`. Work Contracts own commitments; the building owns useful work.

Current `main` still has the Work Contract architecture centered on `WorkContractRecord`. `npc-028` is the planned multi-worker generalization. If it has not landed when implementation starts, treat it as a real dependency for the “many NPCs on one house” requirement rather than implementing house-specific crews. After it lands, consume its generic worker representation.

Extend the generic contract-target resolution seam with the residential building (or a generalized construction target if dependencies have already introduced one). The target adapter needs to resolve stable id, world position, useful remaining work, blocked/completed/invalid state and contribution. Keep house stage/material constants out of `NpcAgent`.

Long-lived material blocking must not leave NPCs in a hot work/retry loop. Reuse the Work Contract interruption/resumption/backoff semantics available on current code at implementation time.

## Placement and terrain preparation

House placement uses the existing preview/confirm pipeline with a definition-provided footprint. Rotation must be resolved before evaluating a rectangular footprint.

If terrain is unsuitable:

```text
house placement intent
→ TerrainPreparationRecord for the same intended transform/footprint
→ Player/NPC preparation work
→ preparation completes
→ authoritative house placement revalidation
→ unfinished building placement
```

Preparation does not reserve permission to build forever; placement must be revalidated because blockers may have appeared.

Once the unfinished building is placed, its footprint is occupied/reserved. Incomplete houses must participate in collision/separation checks.

Do not silently flatten terrain and do not create house-specific terrain-preparation state.

## Construction visuals

Rendering derives from authoritative stage state. Use discrete representations corresponding to:

- foundation,
- structure,
- roof,
- completed.

Do not morph geometry continuously with work percentage and do not add a per-building update loop. Stage transition is the visual transition boundary.

Inspect existing generated house assemblies/definitions and `src/settlement/props.ts` before deciding whether completed small/medium houses can reuse them. Reuse compatible assets/components rather than creating near-duplicates. Scene objects are never authoritative and must rebuild from records after load/rebuild.

## Home, settlement and occupancy

Keep these concepts separate:

```text
ResidentialBuildingRecord = physical building + construction + ownership
Place(type='home')        = semantic world location
Household.homeId          = where a household lives
settlement association    = which settlement the building belongs to, if any
```

Completion exposes/registers one stable `home` Place and activates configured housing capacity. It does **not** create a Household, generate NPCs or move a family.

Do not mutate deterministic `VillagePlan` / `VillageBuildingPlan` to insert runtime-built houses. Generated layout and persistent runtime world changes have different ownership.

A completed house may remain empty. A house reliably located in an existing settlement may retain that settlement association; a house outside settlements remains an independent home. One house must not implicitly create a settlement. Never derive association from Player/camera proximity.

## Residential ownership

This is intentionally separate from occupancy and from existing land-plot ownership.

The target ownership vocabulary should be capable of representing:

```text
Player | Household | Settlement | unowned
```

Use the narrowest representation consistent with current shared identity conventions; do not introduce an elaborate property/economy subsystem.

For **settlements-005 v1**, only Player-initiated ordinary residential construction needs an acquisition flow:

```text
Player initiates house construction
→ same building identity progresses
→ house owner = Player
```

NPCs contributing labour do not gain ownership. There is no “build for NPC/Household” flow yet, no settlement-initiated residential construction, and no sale/transfer UI. The data boundary should nevertheless avoid baking in an assumption that every residential building is forever Player-owned.

Ownership and occupancy remain independent. A Player-owned house may be empty or, in future, house a Household without requiring ownership transfer. Conversely a future Household may occupy settlement-owned housing.

Do not reuse `LandOwnershipRegistry` as the house owner store: it models ownership of settlement plots via composite plot keys and has no owner variants. If plot ownership matters to placement, treat it as a separate permission/input to construction.

## Player lodging v1 and furniture v2

The confirmed v1 rule is deliberately temporary but playable:

```text
completed Player-owned house
→ high-quality Player lodging
→ existing lodging/rest action
→ existing sleep/time skip
→ existing high-quality needs restoration
```

A physical bed is **not required in v1**. Furniture, including the real bed requirement, belongs to v2.

Current lodging code already has the desired quality semantics: `lodgingRestQuality('high')` maps high-quality lodging into the existing sleep restoration path. Reuse that. Do not add `houseComfort`, custom restoration percentages or a player-house-only sleep implementation.

Because `LodgingType` currently describes existing settlement lodging forms (including physical `bed`), do not pretend a virtual v1 house sleep point is a real furniture bed if that would corrupt semantics. Add/extend the narrow lodging-provider representation needed to express an owned completed house while keeping the downstream rest path shared.

Use a stable entrance/approach anchor for v1 movement/interactions; no enterable interior is required. A Player-owned completed house outside a settlement must still expose lodging without creating a fake settlement.

Design the provider/eligibility boundary so v2 can change only the capability rule to:

```text
completed house + access + usable physical bed → lodging
```

Do not persist a fake `hasBed` flag in v1.

An unfinished house never provides lodging. A completed house that is not accessible to the Player must not become Player lodging merely because it is residential capacity.

## Persistence and WorldBundle

Follow the existing domain-owned player-built-object pattern:

- add residential buildings to the `WorldBundle` lifecycle/rebuild boundary,
- capture records once through `src/app/saveState.ts`,
- extend `src/persistence/saveData.ts` schema/defaulting/migration contract,
- restore by constructing the residential-building runtime from saved records,
- cover parse/round-trip/migration behaviour in persistence tests.

Old saves must default to no runtime-built residential houses.

Persist ownership as authoritative building state. Do not persist derived `LodgingOption` data. Lodging is derived from completed state + ownership/access in v1 and later from the real furniture capability.

Prefer a deterministic home-place id derived from stable building id if current `Place` APIs allow it. Otherwise persist exactly the linkage required to guarantee one stable home across reload/rebuild. Never duplicate the `Place` during rebuild.

## Removal and target invalidation

Cancelling/removing an unfinished house must invalidate/terminate Work Contracts through the existing target invalidation path.

Do not implement sale, ownership transfer, completed-house demolition or household displacement in this plan. If generic removal cannot safely handle a completed residential home, keeping completed houses non-removable is preferable to orphaning semantic/occupancy references.

## Suggested implementation order

1. Residential definition + authoritative record/collection, including owner representation and pure stage helpers.
2. Persistence/rebuild wiring and tests.
3. Placement footprint/rotation + terrain-preparation integration.
4. Stage material gates and Player `contributeWork` path.
5. Discrete construction/completed visuals.
6. Generic Work Contract target adapter; consume `npc-028` for multi-worker behaviour if available/required.
7. Stable completed `Place(home)` + capacity/settlement association.
8. Player-ownership access + v1 high-quality lodging through the existing rest path.

This order establishes stable identity before Work Contracts, Place and lodging begin referencing the building.

## High-value automated tests

Prefer boundary tests over scene snapshots:

- small capacity is 3 and medium capacity is 6,
- both sizes share the same stage mechanics,
- only existing `ItemKind` materials are used,
- stage materials are consumed/committed once before stage work,
- a blocked stage accepts zero work,
- stage-completing contribution cannot spill into an unsupplied next stage,
- `contributeWork` clamps and reports accepted work correctly with multiple actors contributing sequentially/interleaved,
- rotated placement evaluates the correct footprint and preview/confirm agree,
- prepared terrain is revalidated before placement,
- partial and completed houses round-trip through save/load,
- Work Contract target resolves after rebuild by stable house id,
- completion registers exactly one stable home Place,
- completion creates no Household,
- Player-initiated house persists Player ownership,
- NPC labour does not alter ownership,
- ownership and `Household.homeId` remain independent,
- completed Player-owned house exposes existing high-quality rest semantics without a physical bed,
- unfinished house does not expose lodging,
- lodging remains derivable after reload rather than being persisted separately.

Browser verification is performed manually by the User. The implementation agent should run the relevant automated tests, typecheck/build/lint checks required by the repository, but must not perform browser verification.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
