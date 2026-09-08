# Implementation Notes: settlements-005 Residential House Construction

These notes are for the implementation agent. They record current-code integration points and decisions that should not need to be rediscovered. Follow the plan for scope/behaviour and current code when it has changed since these notes were written.

## Existing construction seams to reuse

- `src/app/actions/placementActions.ts` owns the canonical ground-placement seam: `GroundPlacementDefinition`, `previewGroundPlacement()` and `evaluatePlacementSite()`. Preview is read-only; confirmation must re-resolve/revalidate. Add houses to this path rather than creating a house-only placement controller.
- Current suitability ultimately uses the shared ground-placement evaluation used by existing buildables. House definitions should supply their footprint/separation/rotation needs to that mechanism. The medium house is a larger instance of the same rule, not a separate placement mode.
- `src/world/createTerrainPreparations.ts` / `TerrainPreparationRecord` already represent persistent preparation work and expose actor-neutral `contributeWork(id, amount)`. Reuse this before house placement when the footprint requires preparation; do not make house placement silently flatten terrain.
- Existing incremental construction implementations in `src/world/createPalisades.ts` and `src/world/createStandingTorches.ts` are the closest small-object reference. Their important contract is: progress belongs to the target record; `contributeWork()` clamps to remaining useful work and returns/credits only accepted work.
- `src/items/constructionMaterials.ts` is the generic construction-material seam. Use the existing item/material vocabulary and inventory consumption helpers rather than introducing house-specific resource accounting. House stages may define different requirement sets, but material mechanics should stay shared.
- Well construction in `placementActions.ts` is also useful for the distinction between querying stage requirements and mutating/advancing construction. Keep requirement lookup pure enough for UI/validation; do not spend materials during preview.

## Residential-building ownership

Create one domain-owned runtime collection/registry for player-built residential buildings, analogous in lifecycle to other persistent player-built world systems. Do not store authoritative house state in Vue, `WorkContractRecord`, `Place`, or `SaveData`.

A record needs stable identity from initial placement through completion. At minimum the authoritative state must be sufficient to derive:

- house kind (`small_house` / `medium_house`),
- world transform,
- active construction stage and work progress,
- whether the active stage's material gate has been satisfied/consumed,
- completion,
- settlement association if one was resolved,
- stable home/place identity after completion.

Prefer definition data for footprint, capacity, stage work and stage materials; do not copy immutable definition constants into every persisted record unless restore requires a snapshot for compatibility.

Keep the three identities distinct:

```text
ResidentialBuildingRecord  physical structure + construction
Place(type='home')         semantic home location
Household                  occupants/resources
```

The building may exist completed with no Household. `Household.homeId` remains the household→home link; do not add a second occupancy mapping to the building subsystem.

## Construction stages and materials

Use the same stage vocabulary for both sizes: `foundation` → `structure` → `roof` → complete. Size differences belong in definitions.

A stage should consume/reserve its required materials once at the stage boundary, then accept work. Do not consume fractional materials per NPC/player work contribution. This is especially important once several actors can work concurrently.

Make stage transition atomic from the simulation's perspective: the work contribution that completes one stage must not accidentally spill into the next stage before that next stage's material gate is satisfied. Returning only actually accepted work preserves the existing Work Contract accounting contract.

A material-blocked house must report zero useful work until supplied. This must be distinguishable from a missing/invalid/completed target so Work Contracts can pause/retry rather than falsely complete or invalidate.

## Work Contracts

Current construction already has the correct ownership rule: Player and NPC work hit the same target `contributeWork` seam. Preserve it for houses.

`npc-028` is a real dependency for 1+ NPCs. Consume its resulting assignment/worker representation rather than adding worker arrays or crew logic to residential buildings. The house target only needs to expose position, remaining useful work, contribution and blocked/completed/invalid status through the Work Contract target resolver.

Do not put stage/material/house-size logic into `NpcAgent`. `NpcAgent` should continue executing a generic buildable contract work bout against the resolved target.

When a stage is material-blocked, avoid a tight NPC retry loop. Use whatever interruption/resumption/backoff semantics exist after `npc-028`; if that dependency does not provide an adequate blocked-target state, resolve that at the Work Contract seam rather than inside house AI.

## Placement and terrain preparation

The final house transform used for preparation, footprint reservation and construction must be identical. In particular, rotation affects a rectangular house footprint and therefore must be resolved before terrain/coverage validation.

Do not let preparation itself authorize placement. After preparation completes, run the normal authoritative house placement validation again. Other blockers may have appeared while preparation was in progress.

Once an unfinished house is placed, its footprint is occupied for collision/separation purposes. It must not be possible to overlap another buildable merely because the house is incomplete.

## Settlement, Place and Household integration

Current generated settlement layout uses `VillagePlan` / `VillageBuildingPlan` and residential house plots. Do not mutate deterministic `VillagePlan` to insert runtime-built houses: that plan describes generated layout and is not the persistence authority for later world changes.

Instead, after a runtime house completes, expose/register it through the existing semantic home/place layer with a stable `Place(type='home')` identity. Existing generated houses may keep their current representation; avoid a broad village-generation rewrite solely to unify storage types.

A completed empty house is valid. Do not create a Household, spawn residents, migrate an existing family, or infer occupancy from the Player who built it. Those are follow-up systems.

If settlement association can be derived through the existing settlement/world rules at placement/completion, persist the association. Do not derive it from camera distance or make one house create a settlement.

## Player lodging: preserve the bed requirement

The existing lodging system already models exactly the desired rest quality:

- `src/settlement/lodging.ts` defines `LodgingOption`, `LodgingType = 'bed' | 'friend' | 'paid' | 'hay'`, and `LodgingQuality = 'high' | 'normal' | 'low'`.
- `lodgingRestQuality('high')` maps to `1`, so high-quality lodging uses the existing sleep/`PlayerNeeds` restoration path; do not add a second comfort/rest formula for houses.
- `src/settlement/lodgingResolver.ts` already emits physical bed candidates as `type: 'bed'`, `quality: 'high'` using a bed position/approach/facing anchor.
- Existing generated-house furniture support in `src/settlement/props.ts` derives a bed/sleep point only when the built house definition actually contains bed furniture.

**Important scope correction:** completion of a residential building must make it *capable* of later providing high-quality lodging, but the house itself is not sufficient for sleep. A usable bed is the physical capability that enables `LodgingOption { type: 'bed', quality: 'high' }`.

Implement this incrementally:

1. Do not invent an implicit/virtual bed merely because `ResidentialBuildingRecord` is complete.
2. If this plan includes a bed asset/anchor as part of the completed house definition, expose lodging only when that actual bed capability exists.
3. If bed placement/installation for player-built houses is deferred, a completed house should initially provide housing/home semantics but **no Player lodging yet**. Leave a clean seam for a later bed/furniture step to register the existing lodging capability.
4. Do not create `houseComfort`, `houseRestQuality` or a player-house-only sleep action. The eventual bed should feed the existing lodging/rest path.

This also means an empty completed house can be residential capacity without being a valid Player sleep location until furnished with a bed.

## Rendering / assets

Generated houses already have a HouseBuilder/settlement-props path, including authored furniture and bed interaction points for supported definitions. Inspect `src/settlement/props.ts` and the current house definitions before choosing whether player-built houses can reuse those assemblies directly.

Do not couple authoritative construction state to scene objects. Render stage visuals from the record and rebuild them from persisted state. Prefer discrete stage representations over geometry mutation on every work tick.

If existing cottage assets fit small/medium definitions, reuse them; do not create duplicate near-identical assets or a second house renderer without a concrete need.

## Persistence / WorldBundle

Follow the established player-built object path:

- add the residential-building collection to the `WorldBundle` ownership/rebuild boundary,
- capture domain records in `src/app/saveState.ts`,
- extend `src/persistence/saveData.ts` validation/defaulting and the migration/version contract,
- restore records during world-bundle creation rather than hydrating `SaveData` as runtime state,
- add save parsing/round-trip coverage in `src/persistence/saveData.test.ts`.

Old saves need an empty/default residential-building collection. Do not regenerate player-built houses from seed.

A `Place(home)` linkage derived from a stable house id should preferably be reproducible rather than requiring a second unrelated persisted id. If current `Place` APIs require explicit registration/id storage, document that decision in code and ensure rebuild does not duplicate the Place.

## Removal / invalidation

Use the existing Work Contract target invalidation path when an unfinished house disappears/cancels. Do not leave assignments referencing a missing building.

Keep completed-house demolition out of this plan unless the current generic removal mechanism can support it without introducing household displacement semantics. An occupied/completed home being non-removable is safer than silently orphaning `Household.homeId`.

## Suggested implementation order

1. Definition + authoritative residential-building record/collection, with pure stage/remaining-work helpers.
2. Persistence/rebuild wiring and tests before UI integration.
3. Placement definition, rotated footprint and terrain-preparation integration.
4. Stage material gates + Player `contributeWork` path.
5. Discrete construction/completed visuals.
6. Work Contract target adapter, then multi-worker verification against `npc-028`.
7. Completed `Place(home)` registration/capacity semantics.
8. Bed/lodging integration only to the extent an actual bed capability exists; otherwise leave it deliberately unavailable and preserve the seam described above.

This order establishes persistent identity and target ownership before multiple systems begin referencing the house.

## High-value tests

Prefer unit/integration coverage around boundaries rather than scene snapshots:

- stage transition does not spill work through an unsatisfied next-stage material gate,
- `contributeWork` clamps and reports accepted work correctly,
- small/medium definitions share mechanics but differ in configured footprint/work/material/capacity,
- rotated placement uses the correct footprint and preview/confirm agree,
- prepared terrain is revalidated before placement,
- partial and completed houses round-trip through save/load,
- Work Contract resolution survives rebuild by stable house id,
- completed house registers exactly one stable home Place,
- completed house creates no Household automatically,
- completed house without a bed does **not** produce lodging,
- a house with a usable bed produces the existing high-quality bed lodging semantics rather than a new rest path.

Browser verification remains manual by the User; implementation agents should run automated tests/typecheck/build as appropriate, not browser verification.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
