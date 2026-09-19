# Implementation notes: fauna-040 — Settlement rat reconciliation checkpoint

**Recon date:** 2026-09-19  
**Target:** `main`  
**Source plan:** `docs/plans/fauna-040-settlement-rat-reconciliation-checkpoint.md`

## Current code state

The defect in the plan is real, but the surrounding persistence model is newer than the older state-audit material.

`src/settlement/rats.ts::createSettlementRats()` owns the live rat roster for one currently materialized settlement. It restores persisted individuals through `RatPersistence.getSaved()` / `getRemoved()`, creates new `AnimalAgent` instances, updates them, tombstones rats that reach `readyToRemove()`, and runs the population/food reconciliation pass.

The reconciliation cadence is still runtime-local:

- `RAT_RECONCILE_INTERVAL_DAYS = 0.5`;
- `let lastReconcileDay = -Infinity` is recreated with every `createSettlementRats()`;
- `update()` runs `reconcile(dogCount, nowDays)` plus `maybeEatFood(nowDays)` when the local timestamp gate opens;
- both `reconcile()` and `maybeEatFood()` derive deterministic outcomes from `Math.floor(nowDays / RAT_RECONCILE_INTERVAL_DAYS)`, but deterministic replay still repeats mutations.

Rat individuals themselves are already persistent. `src/settlement/ratPersistence.ts::createRatRegistry()` owns manager-lifetime saved `RatSaveRecord` entries and removed-id tombstones. This is the correct owner to extend with the settlement-level cadence checkpoint.

## Ownership

### Persistent authoritative state

`src/settlement/ratPersistence.ts::RatRegistry` is the long-lived owner for settlement-rat persistence during one `SettlementsManager` lifetime:

- `bySettlement`: persisted `RatSaveRecord` snapshots;
- `removedBySettlement`: tombstones keyed by settlement;
- `capture(settlementId, animals)`: refreshes live individual snapshots;
- `serialize()`: emits the state used by rebuild/save;
- `clear()`: resets the registry.

The new **last processed reconciliation bucket belongs here**, keyed by `settlementId`. It is settlement cadence state, not an `AnimalSaveState` field and not an infestation fact.

`src/settlement/ratInfestation.ts` remains authoritative only for storage/nest facts. Do not store this checkpoint there.

### Runtime-only state

`createSettlementRats()` owns:

- the currently materialized `agents` array;
- `nextRatIndex`;
- the seeded spawn-position RNG cursor;
- per-agent runtime/presentation state;
- currently, incorrectly, `lastReconcileDay`.

The implementation removes `lastReconcileDay` as an authoritative gate. The module may cache nothing more than what is safe to lose; whether a reconciliation bucket already mutated the world must be resolved through `RatRegistry`.

### Seed-derived / deterministic inputs

Do not persist or duplicate:

- `ratPopulationTarget()` / `ratNormalPopulationTarget()` results;
- `infestationReplenishmentRoll(settlementId, settlementSeed, dayBucket)`;
- per-rat food-eat rolls keyed by rat id + bucket;
- settlement seed / deterministic spawn naming rules.

Those remain derived from current world state + existing deterministic inputs.

## Lifecycle and call-sites

### Materialization / restore

`src/settlement/createSettlement.ts` constructs `createSettlementRats(...)` for each loaded settlement and injects `CreateSettlementDeps.ratPersistence`.

`src/settlement/SettlementsManager.ts::createSettlementsManager()` constructs one `RatRegistry` and passes that same instance through `settlementDeps.ratPersistence` to the home settlement and every streamed settlement. This is the shared lifetime required for exact-once reconciliation across ordinary stream-out/in.

### Live update

`src/settlement/rats.ts::createSettlementRats().update()` is the only reconciliation execution point. Keep the existing low-frequency shape; replace the local elapsed-time gate with a durable bucket claim/check.

The pass remains:

1. update live rat agents;
2. tombstone/dispose rats that reached removal;
3. derive current half-day bucket;
4. execute `reconcile()` + `maybeEatFood()` only if the registry accepts that bucket as not previously processed.

The registry operation should be narrow and synchronous, e.g. a compare-and-mark/claim operation returning whether the caller owns this bucket. This avoids a read-then-write protocol spread across `rats.ts`.

### Settlement stream-out

`src/settlement/SettlementsManager.ts::unload()` already calls:

- `livestock.capture(...)`;
- `rats.capture(id, entry.settlement.rats)`;
- then tears down the settlement runtime.

The checkpoint must not depend on this capture call. It is mutated at reconciliation time in the registry and therefore already survives an unload even if no rat individual changed afterward.

### Snapshot / save

`src/settlement/SettlementsManager.ts::snapshotRats()` refreshes all currently loaded rat-agent snapshots and then serializes the registry.

`src/app/saveState.ts::buildSaveData()` is the SaveData assembly point; it calls `snapshotRats()` and currently writes only `rats` + `removedRatIds`.

Extend the existing rat snapshot payload to also expose the reconciliation checkpoint map, and write that map into `SaveData`.

### WorldBundle rebuild

`src/app/worldBundle.ts::rebuildWorldBundle()` already obtains `carriedRats = bundle.settlementsManager.snapshotRats()` before disposing/rebuilding the world and forwards `carriedRats.entries` / `carriedRats.removedIds` into the new world seed.

Carry the checkpoint through this same object. Do not create another rebuild-only store.

When `resetCollectedItems === true` (genuinely reset world), the existing rat carry is discarded; the checkpoint must be discarded with it.

### Save/load restore

`src/app/createApp.ts` currently forwards `initialSave?.rats` and `initialSave?.removedRatIds` into world construction.

`src/app/worldBundle.ts::WorldSystemsSeed` carries those values to `createSettlementsManager()`.

Add the checkpoint beside these existing rat fields all the way through this same constructor path.

## Required persisted shape

Recommended narrow shape:

`ratReconcileBuckets?: Record<string, number>`

where the value is the last processed integer half-day bucket for that settlement.

The concrete field name may follow nearby naming conventions, but preserve these invariants:

- one value per settlement, not per rat;
- integers only;
- absence means “no bucket has been processed under this contract yet”;
- a new/legacy settlement may process its current bucket once, then records it;
- no historical catch-up list.

`RatRegistry.serialize()` should return the checkpoint map together with `entries` and `removedIds`; `createRatRegistry(initial)` should accept it; `clear()` should clear it.

## Save schema decision

HEAD currently has `CURRENT_SAVE_VERSION = 49` and already treats many sparse additions as optional fields.

For this fix, keep the new checkpoint field **optional** in `SaveData`, validate it when present, and interpret absence as “unprocessed”. That gives the required legacy behavior without rewriting older saves and without a version bump/migration.

Therefore:

- update `SaveData` shape;
- add a dedicated validator for settlement-id → non-negative integer bucket (or equally strict reuse if an existing helper exactly matches);
- update `isSaveData()`;
- update `buildSaveData()`;
- **do not add a migration or bump `CURRENT_SAVE_VERSION`** unless implementation changes the field to required or otherwise changes compatibility semantics.

This clarifies the plan's generic “serialization/validation/migration call sites”: migration inspection is required; a migration is not.

## Exact files / symbols to change

Primary:

- `src/settlement/ratPersistence.ts`
  - `RatPersistence`;
  - `RatRegistry`;
  - `createRatRegistry()`;
  - `serialize()`;
  - `clear()`.
- `src/settlement/rats.ts`
  - `RAT_RECONCILE_INTERVAL_DAYS`;
  - `createSettlementRats()`;
  - remove authoritative `lastReconcileDay`;
  - `update()` reconciliation gate.
- `src/settlement/SettlementsManager.ts`
  - constructor inputs beside `initialRats` / `initialRemovedRatIds`;
  - `createRatRegistry(...)`;
  - `snapshotRats()`.
- `src/app/worldBundle.ts`
  - `WorldSystemsSeed` rat fields;
  - build wiring into `createSettlementsManager()`;
  - `rebuildWorldBundle()` rat carry.
- `src/app/createApp.ts`
  - initial save → WorldBundle rat checkpoint argument.
- `src/app/saveState.ts::buildSaveData()`
  - write checkpoint from `snapshotRats()`.
- `src/persistence/saveData.ts`
  - optional SaveData field + validator + `isSaveData()`.

Tests:

- `src/settlement/ratPersistence.test.ts`;
- `src/settlement/rats.test.ts`;
- `src/persistence/saveData.test.ts`;
- focused WorldBundle/rebuild test only if an existing test seam can assert rat carry without constructing the browser app; do not build a new harness solely for this plan.

## Change order

1. Extend `RatRegistry` with settlement bucket ownership and serialization/hydration.
2. Replace `rats.ts`'s local timestamp gate with the registry bucket claim/check.
3. Thread the checkpoint through `SettlementsManager.snapshotRats()`, WorldBundle carry/rebuild, and initial construction.
4. Add the optional SaveData field + validation and write/read wiring.
5. Add focused tests for registry persistence, same-bucket reconstruction, next-bucket processing and legacy absence.
6. Run targeted tests, then normal technical checks required by the repo. Do not run browser verification or `pnpm docs:sync`.

## Contracts to preserve

- `RatRegistry` remains the only persistence owner for rat individuals/tombstones/cadence checkpoint.
- `ratInfestation.ts` continues to own only storage/nest infestation facts.
- `AnimalAgent.snapshot()/hydrate()` shape is unchanged.
- Existing deterministic bucket rolls and salts stay unchanged.
- Existing carrying-capacity/replenishment formulas stay unchanged.
- A settlement unloaded for many buckets does **not** replay missed buckets; first materialization processes only the current bucket.
- `snapshotRats()` must still capture currently live agents before serialization.
- World reset drops rat state and checkpoint together.
- No camera/player-presence state participates in reconciliation identity.

## Tests / regressions

Add assertions covering:

1. registry with no checkpoint accepts one current bucket and rejects the same bucket afterward;
2. serialized registry → new registry preserves that rejection;
3. a strictly later bucket is accepted once;
4. `clear()` removes checkpoint state;
5. `createSettlementRats()` reconstructed in the same bucket cannot repeat spawn or food consumption;
6. stream-style capture/recreate path preserves both individuals and the checkpoint;
7. save-shaped data with no checkpoint remains valid and gains one after runtime/save;
8. save-shaped data with a valid checkpoint round-trips;
9. malformed non-integer checkpoint values are rejected;
10. existing `ratReconcileAction`, infestation roll and food-roll determinism tests remain unchanged.

Prefer direct state/stock assertions over timing sleeps.

## Risks

- **Checkpoint committed too late:** a re-entrant/error path could repeat mutation. Keep compare+mark as one synchronous registry operation at the execution boundary.
- **Checkpoint committed in a snapshot-only path:** then stream-out before snapshot could still replay. Mutate it when reconciliation starts, not on save/unload.
- **Checkpoint lost on WorldBundle rebuild:** extending SaveData alone is insufficient; rebuild carry is a separate in-session lifecycle.
- **Accidental replay of missed buckets:** comparing timestamps or looping buckets would expand simulation fidelity beyond scope.
- **Generic numeric validator too permissive:** bucket values should be finite integers; do not silently accept fractional cadence state.

## Out of scope

- off-screen rat simulation;
- catch-up of historical half-days;
- population tuning, spawn-position tuning or dog suppression tuning;
- changing infestation/nest semantics;
- changing rat identity or `AnimalSaveState`;
- a RatManager/global scheduler;
- broad settlement persistence refactor.

## Documentation discrepancy

Older audit material (notably `docs/reviews/state-audit/05-fauna.md`) says rats are rebuilt from scratch and that no `RatRegistry` / `SaveData.rats` exists. That is stale relative to current `main`.

Current code already persists rat individuals and tombstones through `RatRegistry`, `SettlementsManager.snapshotRats()`, SaveData and WorldBundle rebuild carry. The unresolved defect is specifically the missing settlement-level reconciliation checkpoint.

The source plan's architecture is otherwise aligned with current code. It should be clarified only to record that the new save field can be optional and therefore does not require a schema migration/version bump.

## Manual verification — user

After implementation, user can verify in browser:

1. enter one settlement with a reproducible rat/food state;
2. stay within one half-day bucket and note rat count + household/settlement food;
3. leave far enough to stream the settlement out, then return in the same bucket several times;
4. confirm rat count/food side effects do not advance again merely because of stream-in;
5. repeat across an in-session world rebuild if there is an existing config/rebuild trigger;
6. save and reload inside the same bucket and confirm no second reconciliation;
7. advance into the next half-day bucket and confirm one new reconciliation can occur.

The implementing agent should not perform browser verification.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
