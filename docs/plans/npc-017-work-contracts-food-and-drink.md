# Plan: Work Contracts — Food & Drink for Hired NPCs

**Created:** 2026-09-01
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~npc-015~~, ~~settlements-npcs-026~~
**Domain:** `npc`  
**Roadmap:** `workforce-for-hire`  

## Goal

Ensure NPCs performing longer or remote work contracts can safely satisfy **hunger** and **thirst** without disabling needs or risking death simply because they accepted a contract.

The implementation extends existing NPC needs, authoritative `personalInventory`, concrete food items, liquid containers, household food/water, settlement/world sources, and the existing work-contract/decision lifecycle.

Do not create a separate `WorkerFoodSystem`, `WorkerWaterSystem`, worker need model, contract-only resource store or new persistence mechanism for provisions.

## Recon — current implementation

Recon refreshed against current `main` on 2026-09-09.

### Work Contracts are implemented

`npc-015` has landed. `WorkContractRecord` in `src/world/workContract.ts` is the sole authoritative contract commitment record and owns `workerNpcId` plus the lifecycle:

```text
advertised
→ accepted
→ travelling
→ working
→ payment_due
```

Temporary action interruption does not clear the contract. `releaseWorkContract()` is for genuine abandonment, not ordinary hunger/thirst interruption.

`src/ai/npcWorkContract.ts` already provides deterministic opportunity scoring using reward, role suitability, travel time, expected work amount and schedule conflict.

**Implication:** food/water feasibility must extend the existing contract evaluation/preparation seams rather than create another worker planner.

### NPC needs and interruption are already authoritative

`src/ai/Needs.ts` already models hunger and thirst. `NpcAgent` uses the existing need/strategy flow, while `npcDecision.ts::shouldInterruptAction()` owns the current in-flight critical-interrupt precedence.

**Implication:** no new needs, thresholds or contract-specific survival priority are required.

### NPC inventory ownership changed with settlements-npcs-026

NPCs now have two deliberately distinct inventory concepts:

- `NpcAuthoritativeState.personalInventory` — authoritative personal belongings, shared directly with the live `NpcAgent`, persisted through `NpcStateSnapshot` / `SaveData.npcStates`, and reused across reconstruction;
- `NpcAgent.carried` — transient work/logistics payload, still recreated with the agent and intentionally excluded from authoritative NPC state.

`personalInventory` is serialized through the shared `InventoryContentsSnapshot`, which already preserves:

- item counts,
- concrete item instances,
- liquid-container identity/content/litres,
- perishable `FoodBatch` freshness metadata.

**Implication:** provisions that conceptually belong to the worker and must survive reconstruction/save-load should use the existing `personalInventory`. `npc-017` must **not** add another carried-provisions snapshot, new `NpcStateSnapshot` field or parallel persistence owner.

Transient contract work cargo may continue using `NpcAgent.carried`; do not move unrelated logistics payloads into personal belongings.

### Food is already concrete inventory state

`src/items/foodItems.ts` provides shared concrete-food helpers including `foodItemCount()`, `takeOneFoodItem()`, `claimFoodItems()`, `depositFoodItems()`, `carryFoodClaim()` and `deliverCarriedFoodClaim()`.

Food transfers preserve `FoodBatch` freshness metadata through `removeWithFreshness()` / `addWithFreshness()`.

**Implication:** contract provisions should use normal `ItemKind` food and the existing freshness-safe transfer primitives, with the worker's `personalInventory` as the durable destination where appropriate.

### Current NPC food strategy does not use personal provisions yet

Current `NpcAgent.beginNeed('food')` selects among existing household/economy/exchange/hunt/nearby-source mechanisms. It does not yet consume food from `personalInventory`.

**Implication:** add personal food as another candidate through the existing food strategy/consumption architecture; do not add a contract-only eating branch.

### Liquid containers already exist

`src/items/liquidContainer.ts` provides concrete liquid-container instances, filling, `canDrinkFromLiquidContainer()`, `drinkFromLiquidContainer()`, real litre quantities and reusable empty containers.

A drink consumes the existing `LIQUID_DRINK_PORTION_LITRES` amount. `InventoryContentsSnapshot` already persists liquid-container instance state.

**Implication:** worker water remains a real waterskin instance owned in `personalInventory`, not a scalar worker-water value and not a new persistence format.

### Current NPC water strategy does not use personal containers yet

Current `NpcAgent.beginNeed('water')` selects household water or a well/player-built water source. It does not yet drink from a personal liquid container.

**Implication:** add usable personal liquid containers as another water strategy candidate, preserving normal need arbitration and fallback to existing sources.

### Household and settlement food/water already exist

Households own concrete food inventory and a `WaterReserve`; NPCs can already satisfy needs through household, settlement/world food sources and wells.

**Implication:** personal provisions are only a remote-work extension of the existing resource model.

### Architectural conclusion

The missing capability is:

```text
existing Work Contract lifecycle
        +
existing needs / interruption
        +
existing persistent personalInventory
        +
existing food + liquid-container APIs
        +
existing household/world sources
        ↓
contract-aware provisioning + personal food/water consumption
```

No new persistence or parallel survival system is justified.

## 1. Reuse existing mechanisms

Implementation must reuse:

- `WorkContractRecord` / `WorkContracts`,
- `scoreWorkContractOpportunity()` / existing contract acceptance path,
- `NpcAuthoritativeState.personalInventory`,
- existing `InventoryContentsSnapshot` persistence,
- transient `NpcAgent.carried` only for existing work/logistics payloads,
- hunger/thirst needs,
- existing critical-interrupt arbitration,
- existing food/water strategy selection,
- freshness-safe food transfer helpers,
- household food and `WaterReserve`,
- `SettlementFoodSourceHooks`,
- wells / existing water-source discovery,
- liquid-container instances and drinking/filling APIs.

Do not introduce parallel mechanisms.

## 2. Provisions are normal personal belongings

Persistent worker provisions belong in the existing personal inventory:

```text
NpcAuthoritativeState.personalInventory
├── personal weapons / belongings
├── food provisions
└── liquid containers
```

Transient work payload remains separate:

```text
NpcAgent.carried
└── temporary work / logistics cargo
```

Food remains normal `ItemKind` data with existing freshness metadata.

Water remains a normal `LiquidContainerItemInstance`.

Do not create `WorkerInventory`, `WorkerFood`, `WorkerWater`, `WorkerRation`, `ContractSupplies` or a second inventory snapshot.

## 3. Provisioning during contract preparation

After a contract is accepted and before/during travel as appropriate, evaluate whether additional provisions are needed.

Do not provision every contract.

Use bounded deterministic inputs already available or cheaply derivable from existing systems:

- travel distance/time,
- committed/expected work duration,
- current hunger/thirst,
- food/water already present in `personalInventory`,
- available household supplies,
- bounded nearby food/water availability around the work site.

Short local contracts may require no additional supplies.

Do not build an expedition planner.

## 4. Provisioning must transfer real resources

Prefer existing ownership:

```text
existing personal supplies
        ↓
household food / already-owned available container + water
        ↓
existing settlement/world sources
```

No resource may appear because a contract was accepted.

Transfers must preserve inventory atomicity: a failed destination/capacity check must not destroy the source item or liquid container.

Use the existing freshness-aware food transfer primitives instead of reimplementing food-batch movement.

Do not mint a new waterskin merely because a contract needs water.

## 5. Inventory capacity remains real

Provisioning must respect the capacity rules of the inventory that actually owns the item.

Use existing `Inventory.canAdd()` / `canAddInstance()` semantics. Do not grant hidden contract capacity.

Do not reinterpret the transient `NPC_CARRY_MAX_WEIGHT = 5 kg` logistics cap as the persistence owner for personal provisions, and do not widen this plan into redesigning NPC biological carrying capacity or merging `personalInventory` and `carried`.

## 6. Water — real waterskin instances

For remote work:

```text
NPC already owns/legitimately obtains waterskin
→ waterskin lives in personalInventory
→ fills it from a real available source when needed
→ thirst requires drinking
→ drinkFromLiquidContainer()
→ personalInventory.updateInstance()
→ remaining litres decrease
```

An empty waterskin remains the same empty instance and provides no water.

Do not model `waterskin_full` as scalar contract stock or silently refill a container.

## 7. Food provisioning

Use normal concrete food items in `personalInventory` and preserve their freshness state.

```text
contract preparation
→ transfer real food into personalInventory
→ travel/work
→ hunger requires food
→ consume through existing food path
```

Do not create ration-only item kinds for this plan.

## 8. Needs remain authoritative

Hired NPCs use exactly the same hunger/thirst needs as normal NPCs.

Contract work must not:

- disable hunger,
- disable thirst,
- reset needs,
- suppress critical interrupts,
- invent worker-specific need thresholds.

## 9. Need interruption must preserve the contract

Normal case:

```text
working / travelling
→ critical hunger or thirst
→ existing interruptCurrentAction path
→ satisfy need
→ next decision finds the same WorkContractRecord by workerNpcId
→ resume travelling/working
```

A survival interruption cancels only transient action/navigation state.

Do not call `releaseWorkContract()` for an ordinary food/water interruption. Use existing release/invalidation only for genuine abandonment or invalid targets.

## 10. Eating from personalInventory

When hunger requires food, usable food in `personalInventory` should be a valid source through the existing food strategy/consumption mechanism.

A remote NPC should not walk back to a distant household while usable personal food is already physically available.

Consumption must remove the real item through existing freshness-aware inventory semantics and relieve the normal hunger need.

Preserve the existing central strategy/arbitration architecture rather than adding a contract-specific branch that bypasses it.

## 11. Drinking from personalInventory

When thirst requires water, a non-empty liquid container in `personalInventory` should be a valid source before a materially more distant household/well trip.

Drinking must consume the real liquid amount via `drinkFromLiquidContainer()` and update the same instance via `personalInventory.updateInstance()`.

When no usable personal water remains, fall back to existing real water-source behaviour.

## 12. Local food discovery

Reuse `SettlementFoodSourceHooks.queryNearest()` and the existing source revalidation/harvest path.

The NPC may use real world food such as a ground item or harvestable crop when that is the selected available source.

Do not add worker-specific world-food discovery.

## 13. Local water discovery

Reuse existing household/well/settlement water discovery.

Do not give hired NPCs global knowledge of arbitrary water sources.

If a personal waterskin is refilled, the NPC must actually reach an existing valid water source and use the normal fill semantics.

## 14. Supply exhaustion

Supplies are finite.

```text
personal food/water depleted
→ try existing real sources
→ if unavailable, needs continue worsening
→ critical need interrupts work
```

No emergency spawning or refill is allowed.

## 15. Contract feasibility

Extend the existing contract opportunity/preparation decision rather than creating a separate feasibility system.

Food/water availability may reduce attractiveness or reject a clearly non-survivable assignment when bounded available information shows the NPC cannot reasonably provision/satisfy the trip.

The rule must remain deterministic and conservative. Do not require global world scanning or exact simulation of the whole future contract.

The pure scorer must remain read-only; actual transfers happen after acceptance/preparation.

## 16. Persistence and lifecycle continuity

`settlements-npcs-026` already provides the required durable ownership boundary:

```text
NpcAuthoritativeState.personalInventory
→ NpcStateRegistry.serialize()
→ NpcStateSnapshot.personalInventory
→ SaveData.npcStates
```

The shared `InventoryContentsSnapshot` already round-trips counts, concrete instances, liquid amount/content and food freshness batches.

Therefore `npc-017` must **not** add:

- a new carried-provisions persistence field,
- a second inventory snapshot,
- contract food/water fields on `NpcStateSnapshot`,
- top-level `SaveData` provision state,
- duplicate contract assignment in NPC state.

`WorkContractRecord.workerNpcId` remains the sole authority for the commitment.

Do not persist transient path/action/navigation state merely to resume a need interruption. Reconstruction should re-decide from authoritative needs + contract state + `personalInventory`.

## 17. Existing persistence gaps are not this plan's scope

Do not widen `npc-017` into a general inventory/persistence cleanup.

In particular:

- `NpcAgent.carried` remains intentionally transient work/logistics state,
- unrelated corpse-loot freshness limitations remain outside this plan,
- unrelated household persistence issues remain separate,
- no save-version change is needed solely to persist contract provisions because `personalInventory` already owns them.

## 18. Debugging

Extend existing NPC inspection/trace projections where practical to expose:

- hunger / thirst,
- active/critical need,
- contract id/state,
- personal food,
- personal liquid-container instance + litres,
- selected food/water strategy,
- provisioning failure reason where useful,
- need interruption versus genuine contract abandonment.

Do not create a separate worker-survival debug UI.

## Non-goals

Do not implement:

- separate WorkerFoodSystem / WorkerWaterSystem,
- worker-specific NeedIds or thresholds,
- new provision persistence/schema/migration,
- persistence for transient `NpcAgent.carried`,
- merging `personalInventory` and `carried`,
- magic provisioning/refills,
- full expedition survival planner,
- cooking/crafting during contracts,
- contract-specific hunting,
- advanced expedition logistics,
- worker-to-worker food trading,
- contract inventory UI,
- general household/corpse freshness-persistence cleanup,
- new contract failure states solely for food/water.

## Verification

### Short local contract

Verify a nearby short contract can proceed without unnecessary provisioning.

### Long/remote contract

Verify:

```text
accept
→ bounded supply evaluation
→ transfer real provisions when needed
→ provisions belong to personalInventory
→ travel
→ work
→ needs continue normally
→ consume personal food/water
→ resume contract
```

### Water

Verify:

- NPC uses a real personal waterskin instance,
- drinking decreases thirst,
- litres decrease,
- empty container remains empty,
- no infinite refill occurs.

### Food

Verify:

- NPC owns real provision food in `personalInventory`,
- consumption decreases hunger,
- item quantity changes through existing inventory rules,
- freshness metadata survives provisioning transfer and save/load.

### Critical interruption

Verify hunger/thirst can interrupt travel/work without clearing the authoritative contract, and that normal decision-making resumes it afterward.

### Exhaustion

Verify depleted provisions fall back to real sources and never trigger magic replenishment.

### Reconstruction / persistence

Verify an NPC carrying personal contract provisions across:

- settlement/NpcAgent reconstruction,
- `WorldBundle` rebuild,
- save/load,

retains the same `personalInventory` ownership without a second provision snapshot, duplicate items or loss of liquid/freshness state.

### NPC survival

Primary invariant:

> A long work contract must not itself cause NPC death by suppressing or bypassing normal hunger/thirst handling.

## Completion criteria

A long or remote Work Contract can be performed without giving the NPC special survival rules:

```text
accept contract
→ evaluate bounded food/water feasibility
→ prepare real personal supplies when needed
→ travel/work
→ normal needs continue
→ eat/drink through existing mechanisms
→ supplies can run out
→ existing real sources remain available
→ critical needs can interrupt transient work action
→ authoritative contract remains assigned
→ resume when possible
→ complete work
→ payment_due
```

The NPC remains a normal inhabitant of Seedvale who happens to be performing paid work.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
