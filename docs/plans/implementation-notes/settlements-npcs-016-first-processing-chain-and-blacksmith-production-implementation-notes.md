# Implementation Notes: First Processing Chain and Blacksmith Production

**Plan:** `settlements-npcs-016-first-processing-chain-and-blacksmith-production.md`  
**Reviewed:** 2026-09-07  
**Status:** `planned` 📋

## Review result

READY once dependency `settlements-npcs-015` is implemented according to its final contract.

Current `main` already has the real resource kinds, mine/deposit flow, Blacksmith role, household-owned Blacksmith workplace, concrete `iron_rod` item, authoritative storage owners and persistence paths. 016 should add only recipe content + existing profession-work integration. Do not invent another production transaction layer.

## 1. Final dependency contract from 015

Treat `docs/plans/implementation-notes/settlements-npcs-015-economic-production-and-input-integration-implementation-notes.md` as the required contract, not as proof that 015 already exists in code.

016 requires from 015:

- `ProductionDef` remains the recipe model;
- one stateless synchronous executor handles stock-only, item-only and mixed recipes;
- execution context takes an explicit `SettlementEconomy` stock owner and an explicit item `Inventory` owner as needed;
- recipe amounts are validated and duplicate kinds aggregated before mutation;
- input availability + output capacity are preflighted across the full recipe;
- commit is all-or-nothing;
- missing input is a normal blocked result with zero mutation;
- result is a discriminated/plain-data `ProductionResult` that preserves a stable blocked-by-input outcome;
- no production manager, scheduler, reservation registry, persistent production state or world scan;
- `src/economy/npcWork.ts` remains the work-completion → economy adapter seam;
- existing Hunter recipe execution and stock-only execution are already routed through the shared transaction semantics.

If any of these are absent after 015 implementation, stop and reconcile 015 rather than rebuilding them in 016.

## 2. Exact current files / symbols

### Recipe/content

`src/economy/production.ts`

- `ProductionDef`
- `HUNTER_ARROW_PRODUCTIONS` — useful precedent for profession-specific static recipe content, not a registry to extend generically.
- `productionForRole()` — do **not** add Blacksmith processing to the generic role fallback table. Blacksmith has a real profession planner; putting a real recipe in `BY_ROLE` would allow the generic fallback stand to manufacture output independently of `planBlacksmithWork()`.

Add:

- `BLACKSMITH_IRON_ROD_PRODUCTION: ProductionDef`
  - `id: 'blacksmith.iron_rod'`
  - `role: 'blacksmith'`
  - `inputs: [{ kind: 'iron', amount: 2 }, { kind: 'coal', amount: 1 }]`
  - `outputs: []`
  - `itemInputs: []` or omitted, according to final 015 normalization contract
  - `itemOutputs: [{ kind: 'iron_rod', amount: 1 }]`

The numeric conversion is **not derived from current code**. It is explicitly defined by the final downstream contract of 015, so no additional guessed conversion mapping is needed.

### Economic kinds / mining conversion

`src/economy/kinds.ts`

- `EconomicKind` already includes `'iron'` and `'coal'`.
- Keep the bulk/item models distinct.

`src/terrain/depositMining.ts`

- `MineableOre = 'coal' | 'copper_ore' | 'gold' | 'iron'`
- `ORE_ITEM`
- `yieldForOre()` currently yields one carried item per successful hit.
- `oreEconomicKind(type)` returns the ore literal unchanged as `EconomicKind`.

This identity mapping is the only conversion contract 016 should reuse. Do not add `1 ore item = N economic stock` logic; the existing miner deposit already deposits exactly `minedCount` into economy.

### Real Miner input path

`src/ai/npcProfessionWork.ts`

- `planOreGathering(ctx)`
  - queries `SettlementMiningHooks`;
  - mines a real `ResourceDeposits` target;
  - adds the yielded `ItemKind` to `ctx.carried`;
  - chained deposit goes to `ctx.landmarks.stockpile`;
  - removes carried ore and calls `economy.add(oreEconomicKind(target.type), minedCount, ctx.simTime())`.

Do not alter this flow for 016. Both `iron` and `coal` can already reach `SettlementEconomy` through it.

### Blacksmith role

`src/ai/characters.ts`

- `Role` already contains `'blacksmith'`.
- Blacksmith is a normal deterministic/random family profession, not a singleton NPC type.

No new profession definition or dedicated NPC class is needed.

### Blacksmith workplace

`src/settlement/props.ts`

- `SettlementLandmarks.blacksmithWorkplaces: BlacksmithWorkplace[]`
- entries are household-owned and keyed by `familyIndex`.

`src/settlement/places.ts`

- `workplaceFor(settlementId, role, landmarks, treeIndex, homeIndex)`
- `case 'blacksmith'` finds the entry with matching `familyIndex === homeIndex` and returns the stable `Place` id `${settlementId}:workplace:blacksmith:${homeIndex}`.

Do not use the stale mental model `landmarks.blacksmith`. There is no settlement-wide Blacksmith workplace singleton.

### Existing Blacksmith action planner

`src/ai/npcProfessionWork.ts`

- `BLACKSMITH_SHARPEN_THRESHOLD`
- `findWeaponNeedingMaintenance(inventory)`
- `planBlacksmithWork(ctx)`
- `planProfessionWork(ctx)` dispatches `role === 'blacksmith'` here.

Current `planBlacksmithWork()` requires:

- `household`;
- resolved `workplace`;
- household-held `whetstone`;
- a household weapon below threshold;

then returns one `kind: 'sharpen'` action whose completion calls `sharpenWeapon()`.

016 extends this function; do not create `beginBlacksmithProduction()` in `NpcAgent` or a second planner.

### Work-completion seam

`src/economy/npcWork.ts`

Current adapters:

- `commitWoodcutterDeposit()`
- `commitRoleWork()`
- `commitHunterArrowProduction()`
- `tryAdvanceDevelopment()`

Add a thin `commitBlacksmithProduction(economy, household): ProductionResult` beside these. It should contain **no** recipe validation, availability logic, reservation, rollback or direct mutations. It only invokes the 015 executor with:

```text
recipe     = BLACKSMITH_IRON_ROD_PRODUCTION
stockOwner = economy
itemOwner  = household.items
```

Returning `ProductionResult` rather than collapsing to `boolean` is intentional for downstream 017.

### Output owner

`src/settlement/household.ts`

- `Household.items: Inventory` is unbounded today and is authoritative generic discrete-item storage.
- It already stores arbitrary goods such as arrows/bandages/concrete food.
- `iron_rod` belongs here for this chain.

Do not add `iron_rod` to `Household.stock` or `SettlementEconomy` bulk stock.

### Settlement input owner

`src/economy/settlementEconomy.ts`

- `SettlementEconomy.query/add/remove` are the bulk-stock facade used by the final 015 executor contract.
- `SettlementEconomy.items` is concrete **food** storage; it is not the destination for Blacksmith output.
- Do not expose its private `EconomicStock` or add household lookup to the economy object for 016.

## 3. Final production selection inside `planBlacksmithWork`

Use this deterministic priority; do not leave alternatives to the implementer:

```text
missing household/workplace
  → null

weapon needs maintenance AND household has whetstone
  → existing sharpen action

else recipe preview sees iron >= 2 AND coal >= 1 AND economy exists
  → work/processing action at ctx.workplace
     onComplete → commitBlacksmithProduction(economy, household)

else
  → null (existing caller falls back to generic workplace/idle work)
```

Why sharpening first:

- it is already implemented Blacksmith gameplay;
- 016 is additive and must not starve maintenance;
- this gives one stable deterministic ordering without inventing scoring.

The availability preview must use live owner reads only to avoid starting obviously impossible work. It is **not** the transaction guard. Inputs may change while the NPC walks/works; the on-complete shared executor must revalidate.

Do not add an output-capacity preview in the planner unless the final 015 public API already exposes a neutral `canExecute`/preview helper. `Household.items` is unbounded currently, and atomic capacity correctness belongs to the executor. Avoid duplicating its logic.

## 4. Action kind / animation choice

Use the existing profession work action shape and existing workplace destination. Do not introduce a new Blacksmith FSM state solely for processing.

The current planner's sharpening path uses `kind: 'sharpen'`. For production, prefer the existing generic `kind: 'work'` unless 015 or current action types at implementation time already provide a reusable processing action with identical lifecycle. The architectural requirement is completion timing at the existing workplace; animation specialization is not part of 016.

Do not expand scope into forge/anvil animation work.

## 5. Input/output ownership and transaction

Final successful mutation:

```text
SettlementEconomy
  iron: -2
  coal: -1

Blacksmith Household.items
  iron_rod: +1
```

Everything happens in one executor call from completion.

Never:

- copy settlement `iron`/`coal` into Blacksmith inventory before processing;
- mirror `iron_rod` in settlement stock;
- consume with `economy.remove()` in the planner and later add output separately;
- call `Inventory.applyRecipe()` directly for output;
- reuse local-exchange reservations as production reservations.

Those would split the all-or-nothing boundary established by 015.

## 6. No item-inventory vs bulk-stock duplication

The current code intentionally has literal overlap:

```text
ItemKind:     coal, iron
EconomicKind: coal, iron
```

That does **not** mean every ore unit should simultaneously live in both models.

During Miner work, ore briefly exists in the NPC's `carried Inventory`; deposit removes it from carried state and credits `SettlementEconomy`. After deposit, settlement bulk stock is authoritative. Blacksmith production consumes only that bulk stock.

`iron_rod` is different: it is represented as a concrete item and has no `EconomicKind`. Its authoritative owner after production is only the Blacksmith household inventory.

This is the exact mixed-storage use case 015 is designed to support.

## 7. Observable result required by 017

`settlements-npcs-017` needs a meaningful failed-production signal, but 016 must not create the pressure/problem system itself.

Preserve this seam:

```text
planBlacksmithWork.onComplete
  ↓
commitBlacksmithProduction(...)
  ↓
ProductionResult
```

`commitBlacksmithProduction()` must return the full `ProductionResult`. In 016, the planner may ignore the returned value after completion; do not add history/pressure state just to consume it.

The important contract for 017 is that the shared work-completion adapter does not flatten `missing-input` into `false`. A later 017 change can attach interpretation/recording at this seam without changing recipe execution.

016 provides no persistent shortage/surplus signal for `iron`/`coal`: current `SettlementEconomy` has no demand targets for these ore kinds, so `shortage()`/`hasShortage()` remain zero unless 017 deliberately extends the appropriate existing model. Do not fake a `SettlementDemand` target in 016 merely to give 017 a signal.

## 8. Persistence / rebuild

Current code is sufficient; no schema work in 016.

`src/economy/settlementEconomy.ts`

- `SettlementEconomy.snapshot()` includes bulk stock.
- `SaveData.settlementEconomies` persists it.

`src/settlement/household.ts`

- `HouseholdSnapshot.items` carries concrete counts/instances.

`src/persistence/saveData.ts`

- `SaveData.households?: Record<HouseholdId, HouseholdSnapshot>` persists household authoritative state.

There are stale comments in older code paths/doc comments that still say household snapshots are not in SaveData; do not follow those comments. Current `SaveData` type wins.

Result:

- completed processing persists because authoritative owners changed;
- recipe/result do not persist;
- in-flight `NpcPlannedAction`/completion closure is transient and must not become a production queue;
- save/load or `WorldBundle` rebuild must not replay an already completed recipe.

No save version bump is justified by 016.

## 9. Off-screen semantics

Do not claim 016 adds full remote settlement production.

Current simulation contract to preserve:

- NPC profession work executes through live `NpcAgent`/settlement update lifecycle;
- no camera-facing or player-observation condition belongs in production selection/execution;
- a live Blacksmith can complete processing when not observed by the camera;
- settlement/NPC streaming remains the existing fidelity boundary;
- stream-out/rebuild does not warrant a new Blacksmith-only catch-up tick;
- completed stock/items survive via registries/snapshots; in-progress actions are transient.

If future work adds aggregated/off-screen profession completion, it must call the same shared executor and recipe rather than inventing separate quantities.

## 10. Minimal implementation order

After 015 is present:

1. Verify the final shared executor/type names produced by 015; do not rename/rebuild them in 016.
2. Add `BLACKSMITH_IRON_ROD_PRODUCTION` to `src/economy/production.ts`.
3. Add `commitBlacksmithProduction()` to `src/economy/npcWork.ts` as a zero-semantics adapter returning `ProductionResult`.
4. Extend `planBlacksmithWork()` in `src/ai/npcProfessionWork.ts` with sharpening-first deterministic selection and processing fallback.
5. Add targeted tests; do not refactor unrelated profession planners.
6. Run focused tests/typecheck/build as appropriate.

## 11. Tests with highest value

Use existing test locations when present; avoid creating broad integration harnesses if direct module tests cover the seams.

### `production` / 015 executor regression

- exact `BLACKSMITH_IRON_ROD_PRODUCTION` shape;
- mixed stock→item success;
- missing iron / missing coal leaves both owners unchanged;
- stale preview then failed execution has zero mutation;
- bounded item destination failure leaves stock untouched;
- sequential execution consumes live stock once.

### `npcWork`

- `commitBlacksmithProduction()` passes the current economy + exact `household.items` to shared execution;
- returns the full blocked/success result, not a boolean;
- successful result produces exactly one `iron_rod`.

### `npcProfessionWork`

- sharpening + whetstone wins when both sharpening and production are eligible;
- without maintenance target, sufficient `iron`/`coal` creates one work action at the existing `ctx.workplace`;
- completion calls production once;
- no economy / household / workplace returns `null`;
- missing either input returns `null` and preserves existing fallback;
- a stock change between planning and completion is handled by executor result, not partial mutation.

### Mining regression

No new mining behavior is required. A focused regression should assert the existing identity path for `iron` and `coal` remains intact if touched indirectly:

```text
ORE_ITEM[type] → carried
oreEconomicKind(type) → same settlement EconomicKind
```

### Persistence regression

Only if existing snapshot tests make this cheap:

- post-production economy snapshot contains reduced ore stock;
- household snapshot contains produced `iron_rod`.

Do not add 016-specific SaveData fields/tests.

## 12. Pitfalls

- **Stale workplace assumption:** current code uses `blacksmithWorkplaces` per family; never introduce `landmarks.blacksmith`.
- **Generic role fallback duplication:** do not put this recipe into `productionForRole()`/`BY_ROLE`; Blacksmith has a real planner and generic fallback completion would become a parallel production route.
- **Flattening result:** returning boolean from the new adapter would erase the signal 017 needs.
- **Fake demand:** current ore kinds have no settlement demand targets; do not create artificial `SettlementDemand` just to make `hasShortage('coal')` work.
- **Input staging duplication:** no settlement-stock → household-ore copy before recipe.
- **Output duplication:** `iron_rod` goes to household inventory only.
- **Direct mutations around executor:** no `economy.remove()` + `items.add()` pair outside shared transaction.
- **Persistent reservations:** not needed in synchronous current execution model and forbidden by 015 contract.
- **Mining scope creep:** `planOreGathering()` already supports both inputs; do not alter yields/resource spawning.
- **Off-screen overclaim:** 016 reuses current NPC lifecycle; it does not create simulation for unloaded settlements.
- **Persistence comment drift:** trust `src/persistence/saveData.ts` over older comments claiming households are not saved.

## 13. Downstream 017 contract

016 guarantees exactly this to `settlements-npcs-017`:

```text
recipe id: blacksmith.iron_rod
producer context: Blacksmith scheduled work / household
required stock inputs: iron ×2, coal ×1
output: iron_rod ×1 to household.items
attempt outcome: shared ProductionResult, including blocked-by-input
```

016 does **not** guarantee:

- persistent attempt history;
- an ore `SettlementDemand` target;
- a pre-created Problem/Pressure;
- automatic acquisition/transport behavior;
- a generic observable production registry.

017 should attach persistent interpretation to the existing work/result seam or existing problem lifecycle, not require 016 to create another state owner.

## 14. True blockers / open questions

### Blocker

`settlements-npcs-015` is not yet implemented on current `main`. Current code still has independent `EconomicStock.applyRecipe()` and `Inventory.applyRecipe()` paths, so 016 must not be implemented before the shared mixed executor exists.

### Open questions

None that require design work in 016 after 015 lands.

The content, ownership, workplace, priority, input/output path, persistence and downstream result seam are closed by this review.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
