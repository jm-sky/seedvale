# Plan: Work Contracts — Food & Drink for Hired NPCs

**Created:** 2026-09-01
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~npc-015~~
**Domain:** `npc`  
**Roadmap:** `workforce-for-hire`  

## Goal

Ensure NPCs performing longer or remote work contracts can safely satisfy **hunger** and **thirst** without disabling needs or risking death simply because they accepted a contract.

The implementation extends existing NPC needs, carried inventory, concrete food items, liquid containers, household food/water, settlement/world sources, and the existing work-contract/decision lifecycle.

Do not create a separate `WorkerFoodSystem`, `WorkerWaterSystem`, worker need model or contract-only resource store.

## Recon — current implementation

Recon refreshed against current `main` on 2026-09-07.

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

`Needs.ts` already models hunger and thirst. `NpcAgent` uses the existing need/strategy flow, while `npcDecision.ts::shouldInterruptAction()` owns the current in-flight critical-interrupt precedence.

**Implication:** no new needs, thresholds or contract-specific survival priority are required.

### Food is already concrete inventory state

`src/items/foodItems.ts` provides shared concrete-food helpers including `foodItemCount()`, `takeOneFoodItem()`, `claimFoodItems()`, `depositFoodItems()`, `carryFoodClaim()` and `deliverCarriedFoodClaim()`.

Food transfers preserve `FoodBatch` freshness metadata through `removeWithFreshness()` / `addWithFreshness()`.

**Implication:** contract provisions should use normal `ItemKind` food and the existing freshness-safe transfer path.

### NPC carried inventory exists but is transient

`NpcAgent.carried` is an existing shared `Inventory` used for weapons, ammo, gathered goods and physical transport. Its current max carry weight remains 5 kg.

However `carried` is intentionally transient runtime state: it is recreated with `NpcAgent` and is not part of `NpcAuthoritativeState` / `NpcStateSnapshot`.

**Implication:** reuse the same physical carried-inventory concept, but provisions that must survive NPC reconstruction/save-load need an authoritative persistence representation. Do not create a separate `WorkerInventory`.

### NPC and contract persistence now exist

`SaveData` persists `npcStates`, households and work contracts. Hunger/thirst and active contract commitment therefore already survive save/load through their existing owners.

The remaining gap for this plan is specifically **provision ownership while carried**.

### World food discovery already exists

`SettlementFoodSourceHooks` / `nearestFoodSource()` provide bounded deterministic discovery of nearby real food sources and revalidation/harvest through the existing world-item/crop path.

**Implication:** do not add worker-specific apple or crop search.

### Liquid containers already exist

`src/items/liquidContainer.ts` provides concrete liquid-container instances, filling, `canDrinkFromLiquidContainer()`, `drinkFromLiquidContainer()`, real litre quantities and reusable empty containers.

A drink consumes the existing `LIQUID_DRINK_PORTION_LITRES` amount.

**Implication:** carried water remains a real waterskin instance, not a scalar worker-water value.

### Household and settlement water already exist

Households own a `WaterReserve`; NPCs can already satisfy thirst through household and well/settlement sources.

**Implication:** carried water is only a remote-work extension of the existing water model.

### Architectural conclusion

The missing capability is:

```text
existing Work Contract lifecycle
        +
existing needs / interruption
        +
existing physical carried inventory
        +
existing food + liquid-container transfers
        +
existing household/world sources
        ↓
contract-aware provisioning + durable carried provisions
```

No parallel survival system is justified.

## 1. Reuse existing mechanisms

Implementation must reuse:

- `WorkContractRecord` / `WorkContracts`,
- `scoreWorkContractOpportunity()` / existing contract acceptance path,
- `NpcAgent` carried inventory,
- `NpcAuthoritativeState` / `NpcStateSnapshot` persistence boundary,
- hunger/thirst needs,
- existing critical-interrupt arbitration,
- food strategy/consumption,
- freshness-safe food transfer helpers,
- household food and `WaterReserve`,
- `SettlementFoodSourceHooks`,
- wells / existing water-source discovery,
- liquid-container instances and drinking/filling APIs.

Do not introduce parallel mechanisms.

## 2. Food and water remain normal NPC resources

The NPC's physical carried inventory may contain:

```text
NPC carried inventory
├── weapons / ammo
├── work resources
├── food
└── liquid containers
```

Food remains normal `ItemKind` data with existing freshness metadata.

Water remains a normal `LiquidContainerItemInstance`.

Do not create `WorkerFood`, `WorkerWater`, `WorkerRation`, `ContractSupplies` or a second inventory model.

## 3. Provisioning during contract preparation

After a contract is accepted and before/during travel as appropriate, evaluate whether additional provisions are needed.

Do not provision every contract.

Use bounded deterministic inputs already available or cheaply derivable from existing systems:

- travel distance/time,
- committed/expected work duration,
- current hunger/thirst,
- already-carried food/water,
- available household supplies,
- bounded nearby food/water availability around the work site.

Short local contracts may require no additional supplies.

Do not build an expedition planner.

## 4. Provisioning must transfer real resources

Prefer existing ownership:

```text
existing carried supplies
        ↓
household food / available container + water
        ↓
existing settlement/world sources
```

No resource may appear because a contract was accepted.

Transfers must preserve inventory atomicity: a failed destination/capacity check must not destroy the source item or liquid container.

Use the existing freshness-aware food transfer helpers instead of reimplementing food-batch movement.

## 5. Carry capacity remains real

Provisioning must respect the same carried-inventory weight/size limits as every other NPC activity.

Existing role weapons/ammo and work cargo already consume capacity. A full waterskin contributes its real liquid mass.

Do not special-case contract provisions around `Inventory.canAdd()` or otherwise grant hidden capacity.

## 6. Water — real waterskin instances

For remote work:

```text
NPC has/obtains waterskin
→ fills it from a real available source when needed
→ carries it
→ thirst requires drinking
→ drinkFromLiquidContainer()
→ Inventory.updateInstance()
→ remaining litres decrease
```

An empty waterskin remains the same empty instance and provides no water.

Do not model `waterskin_full` as scalar contract stock or silently refill a container.

## 7. Food provisioning

Use normal concrete food items and preserve their freshness state.

```text
contract preparation
→ transfer real food into carried inventory
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

## 10. Eating from carried inventory

When hunger requires food, carried food should be a valid source through the existing food strategy/consumption mechanism.

A remote NPC should not walk back to a distant household while usable food is already physically carried.

Preserve the existing central strategy/arbitration architecture rather than adding a contract-specific branch that bypasses it.

## 11. Drinking from carried inventory

When thirst requires water, a non-empty carried waterskin should be a valid source before a materially more distant household/well trip.

Drinking must consume the real liquid amount and update the same container instance.

When no usable carried water remains, fall back to existing real water-source behaviour.

## 12. Local food discovery

Reuse `SettlementFoodSourceHooks.queryNearest()` and the existing source revalidation/harvest path.

The NPC may use real world food such as a ground item or harvestable crop when that is the selected available source.

Do not add worker-specific world-food discovery.

## 13. Local water discovery

Reuse existing household/well/settlement water discovery.

Do not give hired NPCs global knowledge of arbitrary water sources.

If a waterskin is refilled, the NPC must actually reach an existing valid water source and use the normal fill semantics.

## 14. Supply exhaustion

Supplies are finite.

```text
carried food/water depleted
→ try existing real sources
→ if unavailable, needs continue worsening
→ critical need interrupts work
```

No emergency spawning or refill is allowed.

## 15. Contract feasibility

Extend the existing contract opportunity/preparation decision rather than creating a separate feasibility system.

Food/water availability may reduce attractiveness or reject a clearly non-survivable assignment when bounded available information shows the NPC cannot reasonably provision/satisfy the trip.

The rule must remain deterministic and conservative. Do not require global world scanning or exact simulation of the whole future contract.

## 16. Persistence and lifecycle continuity

Current code already persists:

- hunger/thirst through `SaveData.npcStates`,
- contract commitment through `SaveData.workContracts`,
- household resources through `SaveData.households`.

`NpcAgent.carried` itself is not persistent.

Therefore contract provisions that are meant to remain owned by an NPC across settlement unload/reload, `WorldBundle` rebuild and save/load must gain a **single authoritative representation within the existing NPC state boundary**, then hydrate the runtime carried inventory from that owner.

Persist enough item data to preserve:

- concrete food kind/count and freshness metadata required by the existing inventory semantics,
- liquid-container instance identity,
- liquid kind and amount,
- other carried item instances/counts if the chosen snapshot represents the inventory as a whole.

Do not duplicate active contract state into the NPC snapshot; `WorkContractRecord.workerNpcId` remains the sole authority for the commitment.

Do not persist transient path/action/navigation state merely to resume a need interruption. Reconstruction should re-decide from authoritative needs + contract state.

## 17. Existing persistence gaps are not this plan's scope

Do not widen `npc-017` into a general inventory/persistence cleanup.

In particular, unrelated existing household freshness-persistence gaps should remain separate unless the minimum authoritative NPC-provision snapshot directly requires shared serialization support.

## 18. Debugging

Extend existing NPC inspection/trace projections where practical to expose:

- hunger / thirst,
- active/critical need,
- contract id/state,
- carried food,
- carried waterskin instance + litres,
- selected food/water strategy,
- need interruption versus genuine contract abandonment.

Do not create a separate worker-survival debug UI.

## Non-goals

Do not implement:

- separate WorkerFoodSystem / WorkerWaterSystem,
- worker-specific NeedIds or thresholds,
- magic provisioning/refills,
- full expedition survival planner,
- cooking/crafting during contracts,
- contract-specific hunting,
- advanced expedition logistics,
- worker-to-worker food trading,
- contract inventory UI,
- general household freshness-persistence cleanup,
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
→ travel
→ work
→ needs continue normally
→ consume carried food/water
→ resume contract
```

### Water

Verify:

- NPC carries a real waterskin instance,
- drinking decreases thirst,
- litres decrease,
- empty container remains empty,
- no infinite refill occurs.

### Food

Verify:

- NPC carries real food,
- consumption decreases hunger,
- item quantity changes through existing inventory rules,
- freshness metadata survives provisioning transfer.

### Critical interruption

Verify hunger/thirst can interrupt travel/work without clearing the authoritative contract, and that normal decision-making resumes it afterward.

### Exhaustion

Verify depleted provisions fall back to real sources and never trigger magic replenishment.

### Reconstruction / persistence

Verify an NPC carrying contract provisions across:

- settlement/NpcAgent reconstruction,
- `WorldBundle` rebuild,
- save/load,

retains exactly one authoritative ownership state for those provisions and does not duplicate or lose them.

### NPC survival

Primary invariant:

> A long work contract must not itself cause NPC death by suppressing or bypassing normal hunger/thirst handling.

## Completion criteria

A long or remote Work Contract can be performed without giving the NPC special survival rules:

```text
accept contract
→ evaluate bounded food/water feasibility
→ prepare real supplies when needed
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
