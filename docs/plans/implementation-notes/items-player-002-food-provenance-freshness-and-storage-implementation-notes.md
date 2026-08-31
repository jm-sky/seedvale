# Implementation notes: Food provenance, freshness and storage

**Reviewed:** 2026-09-01

## Current-state findings

- Inventory already owns FoodBatch[] and persists player batches through foodBatchesToJSON(). The current batch is only { count, acquiredAtDays }.
- Inventory.add() records perishable food with acquiredAtDays ?? 0. This is unsafe for new freshness semantics: every producer of perishable food must provide the real world-day timestamp.
- Current batch merging is lossy: timestamps within 0.2 days are merged using a weighted-average acquiredAtDays. This conflicts with the plan's exact-timestamp requirement. Do not retain this averaging once provenance/freshness depends on exact batch history.
- Inventory.remove() already consumes the oldest batch first. Preserve this FIFO behaviour.
- foodFreshness.ts already provides the derived Fresh/Medium/Spoiled resolver and catalog-driven durations. Keep freshness derived; do not add a decrementing timer.
- ITEM_CATALOG already owns hunger relief and freshness definitions. Put the new roasted-meat source-species nutrition lookup in this existing food domain rather than creating a second nutrition table.
- Cooking currently removes an ItemKind stack and adds roasted_meat with the current day. This loses raw batch/source species and must become batch-aware.
- Drying's TimedProcess currently stores only ItemStackInput/Output, so provenance cannot survive the process. Extend this existing process model.
- Player SaveData.foodBatches covers only player inventory. Placed/carried containers, household snapshots and settlement-economy food snapshots currently persist counts/instances but not food batches.
- Player containers, households and settlement economy all reuse Inventory. Extend those existing representations; do not create a second stored-food/container-inventory model.
- Dropped plain food persists only kind/count/position. If dropped food is expected to preserve age/provenance, its record must carry the corresponding batch metadata too.
- NPC food transfer helpers currently move only ItemKind + amount. That can reconstruct food with a new timestamp and lose provenance; make the existing transfer seam batch-aware.
- Some household/NPC food acquisition paths call Inventory.add() without a timestamp. Audit all concrete perishable-food producers and pass the authoritative dayNight.elapsedDays.

## Storage decay: architectural constraint

A single acquiredAtDays cannot represent repeated movement between storage environments. A batch can spend time in inventory, then a chest, then inventory again; the original timestamp alone cannot reconstruct the slower decay period.

Use lazy, event-based effective-age accounting:

- retain acquiredAtDays unchanged as provenance;
- retain enough batch-local decay state to materialize effective age when storage changes;
- on a storage transition, resolve effective age at the current world day using the old modifier, then continue under the new modifier;
- while stationary, effective age is derived from the last transition timestamp plus accumulated effective age;
- persist this accounting state.

Do not tick freshness every frame. Keep accounting on FoodBatch; storage should provide a decay context/modifier. The representation may be chosen during implementation, but it must support repeated inventory ↔ chest transfers without reset or double-counting.

## Provenance and processing

For cooking:

1. Select actual input batches in FIFO order.
2. Reject spoiled input; revalidate at completion because the busy action spans game time.
3. Preserve source species for every resulting unit/batch.
4. Start the output product's own freshness at processing completion while retaining source species.
5. If one cooking action consumes multiple source species, keep multiple roasted_meat batches rather than collapsing provenance.
6. Resolve roasted-meat nutrition from sourceSpecies; never add species-specific ItemKinds.

For drying, extend the existing TimedProcess metadata so source provenance travels from start to completion. Reuse startedAtDays and the existing lazy completion model.

Make the raw-state rule explicit: a process cannot be used to rescue spoiled input. Validate at start and, where required by the chosen rule, at completion.

## Inventory/API guidance

Add narrow batch-aware primitives to Inventory instead of exposing its private map. Useful seams are:

- inspect FIFO batches;
- consume units while returning consumed batch metadata;
- add output batches without lossy timestamp merging;
- transfer food batches between inventories without reconstructing age/provenance;
- materialize effective decay state on storage transitions.

Keep add/remove useful for ordinary items. Avoid requiring callers to manipulate raw batch arrays.

Keep foodItems.ts as the shared concrete-food layer, but make its transfer operations preserve batch metadata instead of reducing everything to ItemAmount.

## Persistence integration

Extend the existing plain-data shapes:

- player SaveData.foodBatches;
- SavePlacedContainer / SaveCarriedContainer;
- HouseholdSnapshot;
- SettlementEconomySnapshot;
- dropped food records if drops carry food batches.

Update validators and every corresponding restore path. Container/household/economy restoration currently passes counts + instances only; make food-batch restoration symmetrical.

The save schema is hard-cut v1. Follow the existing schema policy; do not create an isolated migration mechanism. Missing new metadata in old v1 saves should be handled deliberately rather than inventing current timestamps.

## Transfer paths to audit

Trace at least:

- animal harvest, fishing, crops/world food → player inventory;
- cooking and drying;
- inventory ↔ placed chest and carried chest;
- inventory → dropped food → pickup;
- household gathering/production;
- household ↔ settlement food exchange;
- NPC carried food → household;
- household food consumption;
- settlement food withdrawal/consumption;
- save/load for every persistent owner.

storageDestinations.ts remains only the shared WHERE resolver; it must not become the owner of food freshness.

## Presentation and tests

Keep one visible inventory group per ItemKind, even with multiple internal batches. If freshness is displayed, derive a Fresh/Medium/Spoiled summary and do not expose raw timestamps as the primary UI.

Prioritize tests for:

- exact timestamps remain distinct;
- FIFO consumption;
- mixed-species raw → roasted provenance and nutrition;
- spoiled input cannot be processed;
- drying preserves provenance;
- inventory → chest → inventory preserves effective age;
- player/chest/household/settlement save-load preserves batch metadata;
- dropped food round-trips with metadata;
- existing non-perishable/instance inventory behaviour remains unchanged.

Use deterministic nowDays values.

## JSDoc / implementation order

Add concise JSDoc with @domain items-player to important new batch/storage APIs so AI preflight can discover them.

Recommended order:

1. Finalize lossless FoodBatch + freshness/decay representation.
2. Add batch-aware Inventory primitives and remove lossy timestamp averaging.
3. Wire acquisition/consumption/transfer paths.
4. Extend cooking/drying provenance.
5. Extend chest/household/settlement/drop persistence.
6. Update UI and tests.
7. Run typecheck, lint, tests and build; browser verification remains manual.

> **Zrób git commit i push do main, rebase jeżeli trzeba**