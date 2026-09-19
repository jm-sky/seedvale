# Plan: Settlement rat reconciliation checkpoint

**Created:** 2026-09-19
**Status:** `done` ✅
**Implemented at:** 2026-09-19
**Priority:** high · **Effort:** S
**Model:** Sonnet, Composer
**Depends on:** none
**Domain:** `fauna`
**Type:** `fix`
**Roadmap:** -

## Goal

Make settlement-rat reconciliation idempotent across settlement stream-out/in, WorldBundle reconstruction and save/load.

A half-day reconciliation bucket may cause its population/food side effects **at most once per settlement**, regardless of how many times the runtime representation is recreated inside that bucket.

Reuse the existing rat persistence registry. Do not create a RatManager or a second settlement-rat state system.

## Confirmed current defect

`createSettlementRats()` owns:

```ts
let lastReconcileDay = -Infinity
```

and `update()` runs `reconcile()` + `maybeEatFood()` whenever:

```text
nowDays - lastReconcileDay >= RAT_RECONCILE_INTERVAL_DAYS
```

The module is reconstructed on settlement materialization, so the checkpoint always resets. The random decisions are already deterministic by `dayBucket`, but replaying the same deterministic decision still repeats its mutation.

Consequences can include:

- an extra rat spawn,
- repeated household/settlement food consumption,
- behaviour that depends on how often the player crosses the settlement streaming boundary.

## Scope

### 1. Persist the last processed bucket on the existing rat owner

Extend `RatRegistry` / its persisted payload with a settlement-level reconciliation checkpoint, preferably the integer bucket:

```text
floor(nowDays / RAT_RECONCILE_INTERVAL_DAYS)
```

rather than a floating-point runtime timestamp.

Expose the narrow operations required by `createSettlementRats()`, for example:

- read last processed bucket for settlement,
- atomically mark bucket processed.

Do not put this on each `AnimalSaveState`; it is settlement-level cadence state.

### 2. Gate side effects by bucket identity

`createSettlementRats().update()` should:

1. derive the current bucket from World Time;
2. compare with the durable settlement checkpoint;
3. run `reconcile()` + `maybeEatFood()` only when this bucket has not already been processed;
4. commit the checkpoint exactly once with the side-effect pass.

Reconstructing the module in the same bucket must be a no-op for reconciliation.

### 3. Preserve current off-screen fidelity

This plan does **not** add detailed rat simulation while a settlement is unloaded and does not replay every historical bucket.

When a settlement returns after one or more unloaded buckets, process the current bucket according to the existing low-fidelity model and record it. The purpose of this plan is exactly-once side effects, not a new off-screen ecosystem engine.

### 4. Legacy/new-world default and save compatibility

Define one explicit rule for missing checkpoint state:

- new settlement / legacy save may process the current bucket once,
- after that first processing, the checkpoint is durable.

Do not use `-Infinity` as a reconstructed authoritative default.

Current `main` already persists rat individuals/tombstones through `RatRegistry` and `SaveData`. Add the settlement checkpoint as an **optional sparse save field** beside that existing rat payload; absence carries the legacy rule above. With that backward-compatible shape, update validation/read/write wiring but **do not bump `CURRENT_SAVE_VERSION` or add a migration**. Only revisit that if implementation makes the field required or otherwise changes compatibility semantics.

## Relevant files / symbols

- `src/settlement/rats.ts::createSettlementRats`
- `RAT_RECONCILE_INTERVAL_DAYS`
- `reconcile` / `maybeEatFood`
- `src/settlement/ratPersistence.ts::RatRegistry`
- `src/settlement/SettlementsManager.ts::snapshotRats` and stream-out `rats.capture`
- `src/app/worldBundle.ts` rebuild carry
- `src/app/saveState.ts::buildSaveData`
- `src/app/createApp.ts` save restore wiring
- `src/persistence/saveData.ts` optional rat checkpoint field + validation

`ratInfestation.ts` remains the owner of storage-damage/nest facts. Do not overload infestation state with rat-runtime cadence unless current persistence wiring proves that is materially simpler and keeps ownership clearer than extending `RatRegistry`.

## Tests

Add focused tests for:

1. first update in a bucket processes reconciliation once;
2. repeated updates in the same bucket do not repeat it;
3. capture → reconstruct → update in the same bucket does not consume/spawn twice;
4. advancing to the next bucket permits exactly one new reconciliation;
5. serialize → hydrate preserves the checkpoint;
6. missing legacy checkpoint allows one current-bucket reconciliation and then becomes stable;
7. deterministic existing rat eat/infestation rolls remain unchanged.

No browser test is needed to establish idempotency, but browser verification by the user can still exercise repeated enter/leave of one settlement during the same half-day.

## Guardrails

- no global rat scheduler;
- no per-frame settlement-wide scan beyond the existing update;
- no second RNG stream for reconcile outcomes;
- no catch-up replay of all missed buckets;
- no change to rat carrying-capacity/reproduction tuning;
- no new dependency on player/camera identity.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
