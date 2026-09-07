# Implementation Notes: Economic Production and Input Integration

**Plan:** `settlements-npcs-015-economic-production-and-input-integration.md`  
**Reviewed:** 2026-09-07  
**Status:** `planned` 📋

## Review result

READY after this review.

Current `main` already has the correct storage owners and NPC work seam; 015 should only replace the two recipe execution primitives with one synchronous transaction coordinator. Do not create a production manager, scheduler, reservation registry or new storage abstraction.

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
- `produceFirstAvailableItemRecipe()` — current item-only execution path to collapse into the new shared executor.
- `productionForRole()` — existing deterministic role lookup; do not replace it with a recipe registry.

### Settlement stock owner

`src/economy/stock.ts`

- `StockAmount`
- `EconomicStock.query/add/remove/has/hasAll/applyRecipe`

`EconomicStock` owns settlement bulk quantities inside `SettlementEconomy`. It is not an item inventory and should remain unaware of households.

### Settlement economy facade

`src/economy/settlementEconomy.ts`

- `SettlementEconomy`
- `createSettlementEconomy()`
- `SettlementEconomy.produce(def)` — current stock-only wrapper around `stock.applyRecipe()`.
- `SettlementEconomy.items` — settlement concrete-food `Inventory`; do not confuse it with general settlement bulk stock.
- `snapshot()` — existing authoritative persistence/rebuild projection.

Important: `SettlementEconomy` intentionally does not expose its private `EconomicStock`. Prefer a production context that can perform stock reads/mutations through the existing `SettlementEconomy.query/add/remove` facade unless a narrowly scoped internal helper is cleaner. Do not expose `EconomicStock` globally just to satisfy the executor.

### Item owner

`src/items/Inventory.ts`

- `ItemAmount`
- `Inventory.count/has/remove/add/canAdd`
- `Inventory.maxWeight`, `maxSize`, `totalWeight()`, `totalSize()`
- `Inventory.applyRecipe()` — current item-only primitive; not sufficient for mixed transactions.

`Inventory.add()` can fail on weight/size. Any transaction that consumes inputs before aggregate output-capacity preflight is incorrect.

### Household owner

`src/settlement/household.ts`

- `Household.items` — authoritative concrete item storage for household goods such as branch/beam/arrow and future `iron_rod`.
- `Household.stock` — household wood-only `EconomicStock`; do not treat it as a generic `EconomicKind` source.
- `HouseholdRegistry` — settlement-manager lifetime registry; household state survives settlement stream-out/in.

### NPC work integration

`src/economy/npcWork.ts`

- `commitWoodcutterDeposit()`
- `commitRoleWork()`
- `commitHunterArrowProduction()`
- `tryAdvanceDevelopment()`

This file is the existing work-completion → economy mutation adapter layer. Integrate the shared executor here rather than adding production calls to `SettlementsManager` or a global tick.

`src/ai/NpcAgent.ts`

- `beginIdle()` dispatches profession-specific real work before fallback role work.
- `beginArrowCrafting()` owns gating/action timing; `commitHunterArrowProduction()` performs the mutation at completion.

Do not move recipe semantics or transaction code into `NpcAgent`.

### Resource kinds

`src/economy/kinds.ts`

- `EconomicKind = 'coal' | 'copper_ore' | 'food' | 'gold' | 'iron' | 'water' | 'wood'`

`EconomicKind` is deliberately distinct from `ItemKind`. `iron`/`coal` are settlement-level raw stock; future `iron_rod` is a concrete item and belongs in an `Inventory`.

## 2. Ownership / lifecycle contract

Authoritative runtime ownership is already established:

```text
SettlementsManager
  ├─ EconomyRegistry
  │    └─ SettlementEconomy
  └─ HouseholdRegistry
       └─ Household
```

Both registries survive settlement streaming. Their snapshots are also the existing carry/persistence path used across world rebuild/save-load; production itself must add no state alongside them.

Therefore:

- completed production persists only because it mutates the existing owners;
- an in-progress validation/result/reservation must not be persisted;
- a `WorldBundle` rebuild must not replay completed recipes;
- executor lifetime should be stateless/module-level, not registered on `WorldBundle`.

Do not add `ProductionState` to `SaveData`.

## 3. Shared executor contract

Recommended home: `src/economy/production.ts` or a focused sibling such as `src/economy/productionExecutor.ts` if separation materially improves clarity. Do not create a manager class.

The executor should accept:

- one `ProductionDef`,
- one explicit settlement-stock owner when stock inputs/outputs are present,
- one explicit item `Inventory` when item inputs/outputs are present.

No source discovery.

The caller resolves ownership before execution. For 016 that means:

```text
stock source/destination = current settlement's SettlementEconomy
item destination         = Blacksmith's Household.items
```

For Hunter:

```text
stock owner = absent
item owner  = Hunter household.items
```

A recipe requiring a category whose owner is absent fails as unavailable destination/source with zero mutation.

## 4. Atomicity — close the design here

Do not implement production reservations/claims/locks in V1.

Current execution is synchronous on the JS thread. The transaction boundary should be:

1. validate recipe structure/amounts,
2. aggregate each input/output list by kind,
3. validate required context owners,
4. read current live source quantities,
5. preflight all outputs against the final post-consumption destination state,
6. perform all mutations synchronously with no callback/await between first and last mutation,
7. return plain-data `ProductionResult`.

This is sufficient for the actual concurrency model. The relevant stale-state case is two sequential execution attempts: the second reads state after the first commit.

Do not use `SettlementEconomy.reserve()` as production transaction state. Its reservation map belongs to development/payment semantics and currently removes stock at reservation time.

## 5. Existing `applyRecipe()` pitfall

Both current recipe primitives pre-check entries individually and then mutate sequentially.

Duplicate input kinds are unsafe without aggregation. Example:

```text
wood × 2
wood × 1
state: wood = 2
```

Entry-wise `hasAll()` can pass even though total required is 3; sequential removes can then partially consume.

The new executor must aggregate totals by kind before checking or mutating. Apply the same aggregation to outputs for capacity preflight.

Do not rely on `EconomicStock.applyRecipe()` or `Inventory.applyRecipe()` as the final mixed transaction primitive after 015.

## 6. Recipe validation

Before state mutation reject at least:

- `NaN` / `Infinity` / `-Infinity`,
- negative amounts,
- missing required owner/context,
- any shape that the executor cannot commit deterministically.

Zero amounts may either normalize away or remain harmless no-ops, but choose one behavior in executor tests and keep it consistent. Do not let zero/invalid rows enter a partial mutation path.

## 7. Inventory output preflight

`Inventory.canAdd(kind, n)` checks the current inventory, not an arbitrary hypothetical set after multiple output additions/removals.

A mixed transaction may consume item inputs first and thereby free weight/size before adding outputs. Conversely several outputs may collectively overflow capacity even if each one individually fits against the original state.

Therefore preflight must model the final aggregate item delta, not simply call `canAdd()` independently for each output row.

Minimum correct calculation can use existing public inventory facts:

- current counts,
- `totalWeight()` / `maxWeight`,
- `totalSize()` / `maxSize`,
- item weight/size definitions already used by `Inventory`.

Prefer adding a small reusable Inventory preflight helper if needed rather than copying weight/size formula into economy code. Do not weaken `Inventory` encapsulation by reading private maps.

`Household.items` is currently unbounded, but tests must include a bounded `Inventory` so this contract cannot regress.

## 8. Mutation order after successful preflight

Once all checks pass, there must be no expected failure point left in the commit sequence.

Recommended commit order:

1. remove aggregated stock inputs,
2. remove aggregated item inputs,
3. add aggregated stock outputs,
4. add aggregated item outputs.

If implementation keeps public mutation methods that return failure booleans, treat an unexpected failure after preflight as `transaction/revalidation-failure`; do not silently continue. Keep the code synchronous so no other actor can interleave between preflight and commit.

Do not invent rollback snapshots unless a real remaining mutation can fail after a correct preflight; first eliminate that failure through preflight/helper contracts.

## 9. `ProductionResult`

Use a small discriminated union/plain object. It must provide enough information for callers to distinguish:

- success,
- missing/insufficient input,
- invalid recipe,
- missing/incompatible owner/destination,
- unexpected transaction/revalidation failure.

A useful result may include recipe id and missing kind/category, but do not turn it into production history or demand state.

Downstream 017 needs a stable blocked-by-input signal. It does not need failed-attempt persistence from 015.

## 10. Hunter migration

Preserve exactly:

- `HUNTER_ARROW_PRODUCTIONS` order: branch before beam,
- branch recipe: `1 branch → 1 arrow`,
- beam recipe: `1 beam → 8 arrows`,
- arrow stock cap = start threshold only,
- storage owner = `Household.items`,
- mutation happens in existing completion callback via `commitHunterArrowProduction()`.

`produceFirstAvailableItemRecipe()` can become a compatibility wrapper that calls the shared executor for each def in priority order. Prefer this minimal blast radius if it avoids touching unrelated Hunter decision code.

## 11. Existing stock-only production

`SettlementEconomy.produce()` can remain for compatibility, but it should become a thin stock-only adapter to shared execution rather than owning independent recipe semantics.

Do not change `SettlementEconomy` into a mixed-storage coordinator and do not add household references to it.

`commitRoleWork()` should keep using the same role/work dispatch. Note that current farmer/fisher/miner placeholder `ProductionDef`s are empty no-ops because their real profession flows live elsewhere; 015 must not reinterpret those as real production content.

`commitWoodcutterDeposit()` remains tied to successful tree-harvest/deposit action. Never move wood minting back to generic role work.

## 12. Local exchange / transport boundary

`src/economy/localExchange.ts` already contains claim/revalidation semantics for moving goods, but that subsystem owns exchange/logistics behavior, not recipe transactions.

Reuse only conceptual patterns or small neutral helpers if genuinely shared. Do not make production depend on Trader activity, exchange reservations or physical transport.

Production receives already-resolved owners. Missing input means blocked.

## 13. Downstream contracts

### 016 — First processing chain / Blacksmith

015 must leave no architectural decision for 016 around execution:

```text
ProductionDef:
  inputs      iron × 2, coal × 1
  itemOutputs iron_rod × 1

context:
  SettlementEconomy = stock owner
  Blacksmith Household.items = item owner
```

016 only needs to define recipe content and wire the existing Blacksmith work completion to the executor. It must not add a Blacksmith-specific transaction helper.

### 017 — Production demand / economic pressures

015 exposes blocked outcome only. 017 decides whether repeated/persistent shortage becomes an existing Problem/Pressure. 015 does not own shortage history, timers, pressure or AI persistence.

## 14. Performance / off-screen

No recurring scan is needed.

One execution is O(recipe rows + distinct kinds) against already-known owners. It should run only on work completion or an explicit caller action.

No camera/player distance checks belong in the executor. Off-screen/hybrid work that reaches the same completion seam must produce the same deterministic stock/item mutation.

No Web Worker is justified for this work.

## 15. Tests with highest value

Prefer a focused new executor test file plus regressions in existing production/npcWork tests.

Required cases:

- stock-only success/failure,
- item-only success/failure,
- mixed stock→item success,
- mixed missing stock leaves item owner unchanged,
- mixed missing item input leaves stock unchanged,
- duplicate stock input kind aggregates correctly,
- duplicate item input kind aggregates correctly,
- duplicate outputs aggregate correctly,
- invalid quantities cause zero mutation,
- missing context owner causes zero mutation,
- combined bounded-Inventory outputs reject before input consumption,
- item inputs freeing capacity are included in final-capacity calculation,
- second sequential execution revalidates and cannot consume the same source twice,
- output exactly once,
- Hunter branch-before-beam behavior unchanged,
- `commitWoodcutterDeposit()` and `commitRoleWork()` regressions,
- `SettlementEconomy.produce()` regression if retained.

Do not write thread/concurrent-worker tests for this transaction model.

## 16. Minimal implementation order

1. Add/define `ProductionResult` and explicit execution context.
2. Add recipe normalization/validation + aggregation helpers.
3. Add Inventory final-delta capacity preflight helper if needed.
4. Implement shared synchronous executor.
5. Route stock-only `SettlementEconomy.produce()` through it or an equivalent shared primitive.
6. Route `produceFirstAvailableItemRecipe()` / Hunter through it.
7. Keep `npcWork.ts` as the work-completion seam.
8. Run targeted executor, Inventory, production and npcWork tests, then typecheck/build as appropriate.

No Blacksmith recipe/content, pressure system, transport, profession redesign or unrelated economy refactor in this plan.

## True open questions / blockers

None found for 015 on current `main`.

The only local implementation choice intentionally left open is file placement/name for the stateless executor and exact discriminant names in `ProductionResult`; ownership, transaction semantics, lifecycle, integration seam and downstream contract are closed.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
