# Implementation Notes: Economic Production and Input Integration

**Plan:** `settlements-npcs-015-economic-production-and-input-integration.md`  
**Reviewed:** 2026-09-11  
**Status:** `verification needed` 🔍

## Review result

READY after 2026-09-11 recon.

The core architecture from the previous review is still correct: 015 should replace the separate stock-only and item-only recipe execution semantics with one stateless synchronous production transaction, called from existing NPC work-completion seams. Do not create a production manager, scheduler, reservation registry, persistent production state or new storage abstraction.

The previous notes had four important drifts against current `main`:

1. `Inventory` now owns richer state/capacity semantics: item instances, perishable batches, liquid mass, size capacity and content-derived `maxWeight` via `carryCapacityBonus`.
2. `SettlementEconomy.add/remove` now own settlement mutation history; production must not bypass them by mutating the private `EconomicStock` directly.
3. `'food'` remains in the legacy `EconomicKind` union for demand/query compatibility, but it is no longer bulk stock and `SettlementEconomy.add/remove('food', ...)` intentionally do nothing/fail. A stock recipe row with `kind: 'food'` is therefore invalid for V1 production.
4. Household snapshots are now part of real `SaveData`; some older comments in `household.ts` / `SettlementsManager.ts` still describe them as in-session-only or stock-only and are stale.

## 1. Exact files and symbols

### Recipe model

`src/economy/production.ts`

- `ProductionDef`
  - `inputs: readonly StockAmount[]`
  - `outputs: readonly StockAmount[]`
  - `itemInputs?: readonly ItemAmount[]`
  - `itemOutputs?: readonly ItemAmount[]`
- `WOODCUTTING_PRODUCTION`
- `FARMING_PRODUCTION`
- `FISHING_PRODUCTION`
- `MINING_PRODUCTION`
- `ARROWS_FROM_BRANCH_PRODUCTION`
- `ARROWS_FROM_BEAM_PRODUCTION`
- `HUNTER_ARROW_PRODUCTIONS`
- `produceFirstAvailableItemRecipe()` — current item-only execution path to collapse into the shared executor or retain only as a thin priority wrapper.
- `productionForRole()` — existing deterministic role lookup; do not replace it with a recipe registry.

### Settlement stock owner

`src/economy/stock.ts`

- `StockAmount`
- `EconomicStock.query/add/remove/has/hasAll/applyRecipe`

`EconomicStock` remains the private bulk-quantity store used by `SettlementEconomy`. Its current `applyRecipe()` is not a safe final transaction primitive: duplicate input kinds are checked independently before sequential mutation.

Do not expose `EconomicStock` globally for 015.

### Settlement economy facade and history

`src/economy/settlementEconomy.ts`

- `SettlementEconomy.query/add/remove`
- `SettlementEconomy.produce(def)` — currently calls private `stock.applyRecipe()` directly.
- `SettlementEconomy.items` — authoritative settlement concrete-food `Inventory`, not generic bulk stock.
- `depositFood()` / `withdrawFood()` — concrete-food mutation APIs.
- `snapshot()` — authoritative persistence/rebuild projection.
- `history()` — bounded mutation history.

`src/debug/settlementHistory.ts`

- `stock.added`
- `stock.removed`
- `food.deposited`
- `food.withdrawn`

Important change since the previous review: non-food production stock mutations must go through `SettlementEconomy.remove/add(..., simTime)` so the existing history remains authoritative. The shared executor must not reach into the private `EconomicStock` and thereby bypass history.

### Item owner

`src/items/Inventory.ts`

Relevant current semantics:

- `ItemAmount` is a count-based recipe quantity.
- plain stack counts are separate from `ItemInstance`s;
- `count/has/remove/add` mutate count-backed items;
- `removeWithFreshness/addWithFreshness` preserve food provenance for transfers;
- `getFoodBatches()` / internal food batches track perishables;
- `totalWeight()` includes count items, item instances and liquid contents;
- `totalSize()` includes count items and instances;
- `maxWeight` is dynamic: base capacity + held items' `ITEM_CATALOG[kind].carryCapacityBonus`;
- `maxSize` is independent;
- `canAdd()` tests the current inventory state only;
- `applyRecipe()` still performs entry-wise input checks followed by sequential `remove()`/`add()` calls and ignores output `add()` failure.

`src/items/itemCatalog.ts`

- `carryCapacityBonus?: number` is part of current capacity semantics; e.g. a held backpack raises `Inventory.maxWeight`.

`src/items/items.ts`

- `ITEM_DEFS[kind].weight`
- `itemSizeUnits(kind)`

These definitions are implementation details of `Inventory` capacity. Economy production code should not copy their formulas.

### Household owner

`src/settlement/household.ts`

- `Household.stock` — household wood-only `EconomicStock`; never treat as generic settlement stock.
- `Household.items` — authoritative generic concrete-item `Inventory`; currently unbounded weight/size and uses stored-food decay semantics.
- `HouseholdSnapshot` includes stock, water, item counts, item instances, food batches and hay state.
- `HouseholdRegistry.serialize()` snapshots full household state.

Some comments still say `HouseholdSnapshot` is not part of `SaveData` or that registry serialization is stock-only. Those comments are stale; current persistence code below is authoritative.

### Persistence

`src/persistence/saveData.ts`

- `settlementEconomies: Record<string, SettlementEconomySnapshot>`
- `households?: Record<HouseholdId, HouseholdSnapshot>`

`src/app/saveState.ts`

- saves `snapshotEconomies()`;
- saves `snapshotHouseholds()`.

Completed production therefore already persists by mutating the existing owners. Do not add `ProductionState`, a production queue or failed-attempt persistence.

### NPC work integration

`src/economy/npcWork.ts`

- `commitWoodcutterDeposit()`
- `commitRoleWork()`
- `commitHunterArrowProduction()`
- `tryAdvanceDevelopment()`

This remains the work-completion → economy adapter seam.

`src/ai/npcProfessionWork.ts`

- `NpcWorkContext.simTime: () => number`
- `planArrowCrafting()` — Hunter completion currently calls `commitHunterArrowProduction()`.
- `planBlacksmithWork()` — existing Blacksmith planner, currently sharpening only; 016 extends this.

`src/ai/NpcAgent.ts`

- `beginIdle()` calls `planProfessionWork()` and otherwise falls back to `commitRoleWork()`.

`src/ai/npcLogistics.ts`

- `depositWoodHarvest(..., simTime)` has a no-household fallback through `commitWoodcutterDeposit()`.

Production time should follow the existing completion-time convention: pass the live `simTime`/`simClock` into the commit adapter/executor, not a value captured when work started.

## 2. Ownership / lifecycle contract

Authoritative runtime ownership stays:

```text
SettlementsManager
  ├─ EconomyRegistry
  │    └─ SettlementEconomy
  └─ HouseholdRegistry
       └─ Household
```

Both registries survive settlement streaming. Their snapshots are used for in-session rebuilds and now also feed persistence where applicable.

Therefore:

- completed recipes persist only as mutations of existing owners;
- validation/preflight/result state is ephemeral;
- no completed recipe is replayed after rebuild/load;
- executor lifetime is stateless/module-level;
- no camera/player-distance ownership rules belong here.

## 3. Shared executor contract

Recommended home: `src/economy/production.ts` or a focused sibling such as `src/economy/productionExecutor.ts`. Do not create a manager class.

Execution context should contain, explicitly:

- one `ProductionDef`;
- optional `SettlementEconomy` stock owner;
- optional item `Inventory` owner;
- `simTime` / `nowDays` for mutation timestamps and item freshness, defaulting to `0` for compatibility/test callers.

No owner discovery.

Examples:

```text
Hunter
  stock owner = absent
  item owner  = Hunter Household.items

Blacksmith (016)
  stock owner = current SettlementEconomy
  item owner  = Blacksmith Household.items
```

A recipe requiring a category whose owner is absent fails with zero mutation.

## 4. Stock recipe semantics and the `'food'` compatibility trap

`EconomicKind` still includes `'food'`, but current storage semantics no longer treat food as bulk stock:

- `SettlementEconomy.query('food')` derives a count from concrete food items;
- `SettlementEconomy.add('food', ...)` no-ops;
- `SettlementEconomy.remove('food', ...)` returns false;
- settlement food mutation uses `depositFood()` / `withdrawFood()`.

The existing test demonstrates the dangerous old behavior: a stock recipe can consume a real input and then silently fail to add a `'food'` output because `produce()` bypasses the facade.

For 015 V1, reject any `ProductionDef.inputs` or `outputs` row whose `kind === 'food'` as `invalid-recipe` / incompatible stock kind before mutation. Concrete food production belongs in `itemInputs` / `itemOutputs` with an explicit `Inventory` owner.

Do not redesign `EconomicKind` in this plan; removing legacy `'food'` from that union would be a broader economy migration.

## 5. Validation and aggregation

Normalize before reading or mutating owners:

1. reject non-finite amounts (`NaN`, `Infinity`, `-Infinity`);
2. reject negative amounts;
3. normalize zero rows away;
4. reject stock `'food'` rows;
5. aggregate each of the four lists by kind;
6. validate all required owners.

Zero normalization is now closed rather than left to the implementer: zero rows disappear and do not create missing-owner requirements.

Duplicate aggregation is mandatory. Both current `EconomicStock.applyRecipe()` and `Inventory.applyRecipe()` can incorrectly accept duplicate input rows individually and then partially consume them.

## 6. Inventory transaction semantics belong in `Inventory`

Do not implement hypothetical inventory math in `economy/production*.ts`.

A correct item-recipe preflight is no longer simply:

```text
currentWeight - inputWeight + outputWeight <= currentMaxWeight
```

because current `Inventory` has state-dependent capacity:

- removing an input such as a capacity-granting backpack can reduce `maxWeight`;
- producing such an item can increase it;
- instances and liquid contents contribute to existing weight/size even though `ItemAmount` recipes do not mutate instances;
- multiple outputs may fit individually but overflow in aggregate;
- item inputs may free capacity;
- sequential public `add()` calls can observe intermediate state that differs from the intended aggregate transaction.

Refactor/add a narrow `Inventory`-owned recipe/delta primitive that can:

- aggregate count-based item inputs/outputs;
- validate input counts;
- determine whether the whole count transition is legal under current `Inventory` weight/size/capacity rules;
- account for content-derived `maxWeight` correctly;
- commit the already-validated count transition without becoming order-dependent on a series of public `add()` checks;
- consume perishable inputs using the supplied `nowDays`;
- create genuinely produced perishable outputs at the supplied `nowDays`.

The exact helper name is local implementation freedom. Prefer strengthening/replacing the semantics behind `Inventory.applyRecipe()` rather than creating economy-side copies of `ITEM_DEFS`, `itemSizeUnits` or `ITEM_CATALOG` calculations.

`ItemAmount` recipes remain count-based. They must not consume or synthesize `ItemInstance`s, mutate liquid-container contents or copy source food batches into transformed outputs.

For food transformation, consumed input freshness follows normal FIFO removal at `nowDays`; output is a newly produced item with acquisition time `nowDays`, not a transfer preserving source provenance.

`Household.items` is currently unbounded, but bounded-`Inventory` tests are mandatory so this contract survives other owners/future capacity changes.

## 7. Atomicity / commit boundary

No production reservations, claims or locks in V1.

The transaction should be:

1. normalize/validate/aggregate recipe;
2. validate required owners;
3. read current live stock/item inputs;
4. run Inventory-owned aggregate preflight;
5. once every participant is known to succeed, perform one synchronous commit with no callback/await/interleaving;
6. return plain-data `ProductionResult`.

All stock availability checks must use the current live `SettlementEconomy.query()` state. Stock mutations must use `SettlementEconomy.remove/add(..., simTime)` so history remains correct.

Do not prescribe a mutation order that can still fail halfway. First make the Inventory helper and stock preflight contracts strong enough that the post-preflight commit has no expected failure point. If an invariant is unexpectedly violated during commit, return a transaction/revalidation failure rather than silently continuing.

Do not introduce rollback snapshots unless a real unavoidable failure remains after correct preflight; prefer eliminating the failure point.

The relevant concurrency/staleness case is sequential JS execution: a second call must re-read state after the first commit. No worker/thread locking tests are needed.

## 8. `ProductionResult`

Use a small discriminated plain-data result that distinguishes at least:

- success;
- missing/insufficient input;
- invalid recipe;
- missing/incompatible owner/destination;
- unexpected transaction/revalidation failure.

Include recipe id and blocked category/kind where useful, but do not turn this into production history or persistent demand state.

Downstream 017 needs a stable blocked-by-input outcome. 015 does not persist failed attempts, timers, Problems or Pressures.

## 9. Existing mutation history

015 should preserve the existing observer model rather than inventing production-specific history.

For settlement bulk stock:

- successful production input consumption should naturally emit existing `stock.removed` events;
- successful stock outputs should naturally emit existing `stock.added` events;
- events should receive completion `simTime`.

Do not add a separate `production.completed` settlement history event in 015.

`Household.items` count mutations currently have no generic household-history event type for arbitrary item crafting. Do not add a parallel history subsystem as part of this transaction plan.

## 10. Hunter migration

Preserve exactly:

- priority order: branch before beam;
- `1 branch → 1 arrow`;
- `1 beam → 8 arrows`;
- cap 24 is a start threshold only;
- owner = `Household.items`;
- mutation happens at work completion.

`produceFirstAvailableItemRecipe()` may remain as a thin priority wrapper that invokes the shared executor for each recipe until one succeeds. It must not retain independent transaction semantics.

Thread completion time through the existing path:

```text
planArrowCrafting.onComplete
  → commitHunterArrowProduction(household, ctx.simTime())
  → shared executor
```

Do not move recipe details into `npcProfessionWork.ts`.

## 11. Existing stock-only production / time plumbing

`SettlementEconomy.produce()` may remain for compatibility, but it must become a thin stock-only adapter to the shared semantics rather than calling private `stock.applyRecipe()` directly.

Allow it (or the underlying executor call) to receive optional `simTime = 0`, so existing tests/callers remain cheap while real NPC completion supplies live time.

Thread live completion time through current adapters:

- `NpcAgent.beginIdle()` fallback → `commitRoleWork(economy, role, this.simClock)`;
- `depositWoodHarvest(..., simTime)` no-household fallback → `commitWoodcutterDeposit(economy, simTime)`;
- Hunter planner → `commitHunterArrowProduction(household, ctx.simTime())`.

Preserve current role semantics:

- farmer/fisher/miner placeholder `ProductionDef`s remain empty successful no-ops; their real profession planners perform the actual work elsewhere;
- woodcutter yield remains tied to successful tree harvest/deposit and must never return to generic scheduled work.

## 12. Local exchange / transport boundary

`src/economy/localExchange.ts` remains useful only as a conceptual example of live revalidation.

Do not make recipe execution depend on:

- Trader activity;
- exchange reservations;
- `TransportOrders`;
- physical delivery claims;
- another household lookup.

Production receives already-resolved owners. Missing input means blocked.

## 13. Downstream contract — 016 Blacksmith

015 must leave transaction semantics fully reusable by 016:

```text
ProductionDef
  inputs:
    iron × 2
    coal × 1
  itemOutputs:
    iron_rod × 1

context
  stock owner = SettlementEconomy
  item owner  = Blacksmith Household.items
```

Correction to the previous notes: 016 **should** add the thin `commitBlacksmithProduction(economy, household, simTime)` adapter already specified by its current plan/implementation notes. That adapter is consistent with `npcWork.ts` ownership.

What 016 must not add is Blacksmith-specific transaction logic: no separate validation, reservation, rollback, storage lookup or executor.

## 14. Persistence / rebuild

No production-specific persistence is needed.

Current code already saves:

- settlement economy snapshots through `SaveData.settlementEconomies`;
- household snapshots through `SaveData.households`.

Thus `iron`/`coal` consumption and a produced household `iron_rod` round-trip by virtue of existing owners.

Do not trust stale comments saying household snapshots are in-session-only; current `SaveData` and `app/saveState.ts` are the source of truth.

## 15. Performance / off-screen

No recurring scan.

One execution is O(recipe rows + distinct kinds) plus bounded Inventory capacity evaluation against the already-known owner. It runs only on work completion or explicit caller action.

No camera/player-distance checks belong in the executor. Any off-screen/hybrid work path that reaches the same completion seam must get identical deterministic transaction semantics.

No Web Worker is justified.

## 16. Tests with highest value

Prefer a focused executor test file plus regressions in `Inventory.test.ts`, `settlementEconomy.test.ts`, `npcWork.test.ts` and profession-work tests where time plumbing is observable.

Required coverage:

- stock-only success/failure;
- item-only success/failure;
- mixed stock → item success;
- missing stock leaves item owner unchanged;
- missing item input leaves stock unchanged;
- duplicate stock inputs aggregate correctly;
- duplicate item inputs aggregate correctly;
- duplicate outputs aggregate correctly;
- non-finite/negative quantities cause zero mutation;
- zero rows normalize away;
- missing required owner causes zero mutation;
- stock `kind: 'food'` is rejected before any other input is consumed;
- combined bounded-Inventory outputs reject before mutation;
- item inputs freeing capacity are reflected in aggregate preflight;
- consuming/producing a capacity-granting item is handled by Inventory semantics without order-dependent partial mutation;
- existing item instances/liquid mass continue to count toward capacity but are not touched by `ItemAmount` recipes;
- perishable input consumption uses supplied `nowDays`/FIFO;
- genuinely produced perishable output is timestamped at supplied `nowDays`;
- second sequential execution revalidates and cannot consume the same source twice;
- successful stock production records existing `stock.removed` / `stock.added` history with supplied `simTime`;
- output occurs exactly once;
- Hunter branch-before-beam and cap/start semantics remain unchanged;
- `commitWoodcutterDeposit()` / `commitRoleWork()` regressions;
- `SettlementEconomy.produce()` regression if retained.

Do not add thread/concurrent-worker tests for this synchronous model.

## 17. Minimal implementation order

1. Define `ProductionResult` + explicit execution context including `simTime`.
2. Strengthen/add the Inventory-owned aggregate recipe preflight/commit primitive and tests first.
3. Add production normalization/validation/aggregation, including stock-`food` rejection.
4. Implement the shared synchronous executor.
5. Route `SettlementEconomy.produce()` through shared semantics and preserve stock history.
6. Route `produceFirstAvailableItemRecipe()` / Hunter through shared semantics.
7. Thread completion `simTime` through `npcWork.ts`, `NpcAgent` fallback and `npcLogistics` fallback.
8. Export the shared executor/result/context from `src/economy/index.ts` if downstream callers need the public barrel.
9. Run focused Inventory/economy/npcWork/profession tests, then typecheck/build as appropriate.

No Blacksmith recipe/content, production pressure system, transport redesign, profession redesign or unrelated economy refactor belongs in 015.

## True open questions / blockers

None found for 015 on current `main`.

The remaining local implementation freedom is limited to naming/file placement of the stateless executor/result types and the exact Inventory helper API. Ownership, food-vs-stock semantics, capacity ownership, time/freshness behavior, history seam, persistence and downstream 016 boundary are closed by current code.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
