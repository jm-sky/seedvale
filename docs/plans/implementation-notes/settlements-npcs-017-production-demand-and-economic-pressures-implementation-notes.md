# Implementation Notes: Production Demand and Economic Pressures

**Plan:** `settlements-npcs-017-production-demand-and-economic-pressures.md`  
**Reviewed:** 2026-09-09  
**Status:** `planned` 📋

## Review result

BLOCKED until `settlements-npcs-015` and `settlements-npcs-016` are implemented.

Current `main` does **not** yet contain the production contract assumed by 017:

- `src/economy/production.ts` still has the old `ProductionDef` + `produceFirstAvailableItemRecipe()` model;
- `SettlementEconomy.produce()` still returns `boolean` and delegates directly to `EconomicStock.applyRecipe()`;
- there is no shared mixed stock/item executor and no `ProductionResult`;
- Blacksmith iron-rod processing from 016 is not implemented.

Do not implement 017 by recreating those pieces. Treat the implementation notes for 015/016 as dependency contracts, then reconcile against the code actually produced by those plans.

A second important discrepancy: there is currently **no generic persistent `Problem` registry/model** in NPC AI. The implemented architecture is pressure-oriented, while persistent `NpcPlan` is still need-centric. Do not invent `ProductionProblem` / `ProductionGoal` / `ProductionStrategy` classes merely to match the wording of the plan.

## 1. Current AI seams to reuse

### Pressure arbitration

`src/ai/Needs.ts`

- `NpcPressure`
- `generateNeedPressures()`
- `pickFromPressures()`
- existing settlement shortage bias is already expressed as pressure input (`woodShortage`, `foodShortage`, `waterShortage`).

`src/ai/weatherPressure.ts`

- `NpcDecisionTarget`
- `weatherShelterPressure()`

`src/ai/healingPressure.ts`

- existing precedent for a non-Need world/body condition becoming an independent pressure candidate.

`src/ai/NpcAgent.ts`, `case 'choose'`

Current arbitration is:

```text
need pressures
→ personality/role re-score
+ weather pressure
+ healing pressure
→ pickActionKind()
→ decideNpcAction()
```

Production shortage should enter this cadence as another bounded, pure pressure producer. Do not add a production tick in `update()` and do not modify need meters just to make economic pressure visible.

### Persistent plans are not generic yet

`src/ai/npcPlan.ts`

- `NpcGoalId` maps 1:1 from `NeedId` through `goalForNeed()` / `needForGoal()`;
- `NpcStrategyId` remains need-strategy oriented;
- `NpcPlan` persistence belongs to a concrete NPC and is not a settlement problem store.

Therefore 017 should **not** force production shortage into `NpcPlan` unless the implementation-time codebase has already generalized this model. With current `main`, shortage pressure may influence selection without gaining a persistent NPC plan of its own.

## 2. Production observation point

After 015/016, the primary seam should remain the existing work-completion adapter:

`src/economy/npcWork.ts`

Expected 016 flow:

```text
planBlacksmithWork.onComplete
→ commitBlacksmithProduction(...)
→ ProductionResult
```

Interpret the stable blocked-by-input result here or immediately above this seam. Do not infer shortage by rescanning all recipes/owners.

Important distinction:

- executor owns one atomic production attempt;
- 017 owns whether repeated/current blocking is economically meaningful;
- NPC pressure reads that state;
- neither layer performs transport/acquisition.

## 3. Shortage state ownership

A production-input shortage in the 016 chain is primarily **settlement/economic state**, not NPC physiological state. The missing iron/coal is owned by `SettlementEconomy`; attaching persistent shortage history independently to every Blacksmith NPC would duplicate the same condition.

Prefer a small economy-owned shortage state keyed by the real production context, rather than a new AI manager. Keep it next to economy/production ownership (`src/economy/`), not in `NpcAgent`.

Minimum identity should be derived from:

- settlement/economic owner,
- `ProductionDef.id`,
- missing input category + kind.

Only add household/producer identity when the missing owner is genuinely household-scoped (for example an item input from `Household.items`). Do not key the 016 iron/coal shortage by NPC id.

The state only needs what is required to distinguish transient from persistent blocking, e.g. first/last blocked simulation time or consecutive meaningful blocked attempts. Do not store failed-attempt history.

## 4. Transient vs persistent

Do not create pressure from one failed completion caused by a stale planner preview.

Use simulation time, not wall-clock time. A reasonable V1 contract is:

```text
blocked ProductionResult
→ mark/update shortage observation
→ only after persistence threshold: pressure > 0

successful execution OR live input availability restored
→ clear shortage immediately
```

Exact threshold/tuning can remain local, but it must be deterministic and testable. Avoid frame-count thresholds because work cadence/off-screen fidelity can differ.

When the dependency executor reports multiple missing inputs, track them independently only if the result exposes them reliably. Otherwise use the executor's exact stable blocked representation; do not duplicate recipe validation logic in 017.

## 5. Pressure producer

Add a focused pure adapter in `src/ai/` (name based on final code, e.g. `economicPressure.ts`) that converts relevant active shortage state into the same score domain as existing pressure producers.

Do not extend `NeedId` with `production`, `iron`, `coal`, etc.

If a new `NpcDecisionTarget` is required, extend the existing shared union rather than creating a second arbitration type. Keep pressure production separate from action execution, following `weatherPressure.ts` / `healingPressure.ts`.

V1 scoring should stay minimal. Use only signals that actually exist after 015/016, likely:

- persistence/duration,
- missing amount relative to recipe requirement where available,
- recipe importance as a small static property/configuration if needed.

Do not implement downstream dependency graphs, prices, market valuation or global demand estimation in 017.

## 6. Decision/action boundary

Current code has no generic action that can acquire arbitrary production inputs. Respect the plan boundary.

A shortage pressure may therefore be observable and win arbitration without being actionable for every NPC. Do not add `AcquireMissingProductionInputAction`.

Only connect a pressure target to an existing strategy/action when that action truly resolves the same owner shortage. Existing `wood` / `food` need strategies are not automatically valid solutions for iron/coal merely because they gather resources.

For the 016 Blacksmith chain, miner production already deposits iron/coal into `SettlementEconomy`; if implementation-time AI has a reusable way to bias relevant existing miner work, use it. Otherwise leave the shortage as economic pressure/diagnostic state rather than inventing cross-profession command logic.

## 7. Settlement demand is not the shortage source

`src/economy/settlementEconomy.ts` already has `SettlementDemand`, `shortage()` and `hasShortage()`, but current demand targets are stock targets, not blocked-recipe state. Iron/coal currently have no demand target, so their shortage is zero by design.

Do **not** fabricate permanent `SettlementDemand` targets for iron/coal just to make 017 work. Production shortage should originate from the blocked production contract from 015/016; `SettlementDemand` remains the existing stock-target mechanism.

If later architecture deliberately unifies these concepts, do that as an explicit refactor, not as a hidden side effect of 017.

## 8. Persistence / rebuild

Current NPC persistence has no generic problem collection. Do not serialize production shortage into every `NpcAuthoritativeState`.

If persistence is required after the transient/persistent threshold, persist the compact economy-owned shortage state alongside the authoritative settlement economy snapshot, or use an equivalent economy registry snapshot extension produced by implementation-time code.

Rules:

- completed production is still persisted only through stock/item owners;
- shortage state contains no queued action or reservation;
- rebuild/load must deduplicate by the same stable shortage key;
- on restore, revalidate against live owner quantities before exposing pressure;
- if required inputs are already available, discard restored shortage immediately.

A save-schema change is justified only if 017 introduces genuinely persistent shortage state. Do not persist `ProductionResult` or raw failed attempts.

## 9. Performance

No global scan.

Preferred update points:

1. blocked/successful production completion,
2. relevant stock/item mutation if an existing narrow notification seam is available,
3. otherwise lazy revalidation when NPC pressure is evaluated at normal `choose()` cadence.

Do not add `all NPCs × all recipes × all resources` evaluation or a new global timer.

## 10. High-value tests

After 015/016 exist, focus on:

- one transient blocked completion does not immediately become persistent pressure;
- repeated/long-lived blocking reuses one stable shortage entry;
- two missing kinds remain distinguishable when the executor exposes them;
- same settlement + same recipe shortage is not duplicated per Blacksmith NPC;
- household-scoped item shortage does not collide with another household;
- successful production clears the shortage;
- restoring missing input clears stale shortage even before another failed attempt;
- pressure competes through the existing `pickActionKind()` path;
- no new Need meter / parallel decision engine is introduced;
- save/load/rebuild preserves only still-valid persistent shortage state;
- Blacksmith/Hunter/stock-only production behavior from 015/016 remains unchanged.

## 11. Implementation order

1. Verify 015 shared executor and exact `ProductionResult` contract on current `main`.
2. Verify 016 Blacksmith recipe/work-completion seam and returned blocked result.
3. Add minimal economy-owned shortage observation/dedup state.
4. Add persistence only if needed for the chosen persistence threshold/lifecycle.
5. Add a pure economic pressure producer and plug it into existing `NpcAgent.choose()` arbitration.
6. Connect only already-existing actions/strategies that genuinely resolve the shortage.
7. Add focused tests; avoid unrelated economy/AI refactors.

## Main pitfalls

- Treating the plan's conceptual `Problem` as proof that a generic Problem registry exists.
- Extending `NeedId` just to represent production.
- Storing the same settlement shortage independently on multiple NPCs.
- Using `SettlementDemand` as fake recipe demand.
- Flattening 015/016 `ProductionResult` back to `boolean` before 017 can observe it.
- Clearing shortage only on successful production instead of also when live input availability returns.
- Adding acquisition/transport behavior that belongs to 018+ / later economy plans.
- Persisting failed attempts or production queues instead of compact authoritative shortage state.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
