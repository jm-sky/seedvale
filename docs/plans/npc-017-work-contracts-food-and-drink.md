# Plan: Work Contracts — Food & Drink for Hired NPCs

**Created:** 2026-09-01
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~npc-015~~
**Domain:** `npc`

## Goal

Ensure NPCs performing longer or remote work contracts can safely satisfy **hunger** and **thirst** without disabling needs or risking death simply because they accepted a contract.

The implementation extends existing NPC needs, carried inventory, food items, liquid containers, household food/water, settlement food sources, wells, and the existing need decision/action flow.

Do not create a separate `WorkerFoodSystem` or `WorkerWaterSystem`.

## Recon — current implementation

Recon verified against the current `main` branch on 2026-09-01.

### NPC needs already exist

`Needs.ts` already models hunger and thirst and `NpcAgent` ticks them during normal simulation. Critical hunger/thirst can interrupt normal work through the existing need-pressure arbitration.

**Implication:** no new needs, thresholds, or worker-specific survival loop are required.

### Food is already a concrete inventory item

`src/items/foodItems.ts` provides shared helpers including `foodItemCount()`, `takeOneFoodItem()`, `claimFoodItems()`, and `depositFoodItems()`. Food is classified through the existing item catalog/category system.

**Implication:** contract provisions should use normal `ItemKind` food items.

### NPCs already have carried inventory

`NpcAgent` already owns a carried `Inventory`, currently used for carried resources, tools and work-related items.

**Gap:** food/water are not yet treated as a general survival loadout for long-distance work.

**Implication:** extend the existing carried inventory rather than creating another worker inventory.

### World food discovery already exists

`SettlementFoodSourceHooks` and `nearestFoodSource()` find nearby consumable food among loaded world items and harvestable crops. Natural food items such as apples are included, and item targets are revalidated through `ChunkManager.collectItem()`.

**Implication:** real food already exists as a reusable world source. Do not add worker-specific apple search logic.

### Liquid containers already exist

`src/items/liquidContainer.ts` provides concrete liquid-container instances, `waterskin_*`, filling/add-liquid operations, `drinkFromLiquidContainer()`, real litre quantities, and reusable emptied containers.

A drink consumes `LIQUID_DRINK_PORTION_LITRES` (1 litre).

**Implication:** carried water should be a normal waterskin instance.

### Household and settlement water already exist

Households have a `WaterReserve`; existing NPC behaviour can drink from household water and use settlement/well sources. Player-built wells are already integrated into available water sources.

**Implication:** carried water is an extension for remote/long work, not a replacement for household/well behaviour.

### Architectural conclusion

The missing capability is **provisioning and consuming existing food/water through NPC carried inventory during long contracts**.

```
existing needs
      +
existing NPC inventory
      +
existing food items
      +
existing liquid containers
      +
existing world/settlement sources
      ↓
contract-aware provisioning
```

No parallel survival system is justified.

## 1. Recon existing mechanisms

Before implementation, verify and reuse:

- `NpcAgent` carried inventory,
- hunger/thirst needs,
- critical need interrupts,
- food consumption,
- `foodSources`,
- household food,
- household `WaterReserve`,
- wells,
- liquid containers,
- `waterskin_*`,
- `drinkFromLiquidContainer()`,
- world food collection,
- NPC decision/pressure system,
- Work Contract state from `npc-015`.

Do not introduce parallel mechanisms.

## 2. Food and water as carried NPC resources

Extend the existing carried inventory so it can contain basic provisions:

```
NPC carried inventory
├── tools
├── resources
├── food
└── water containers
```

Food remains normal `ItemKind` data.

Water remains a normal `LiquidContainerItemInstance`.

Do not create `WorkerFood`, `WorkerWater`, `WorkerRation`, or contract-specific resource stores.

## 3. Provisioning at contract start

When a contract is accepted, evaluate whether the NPC needs supplies.

Do not always add food/water.

Consider:

- travel time,
- work duration,
- distance,
- access to food/water near the work site,
- current hunger/thirst,
- existing carried supplies.

Short local contracts may require no additional provisions. Long or remote contracts should be able to prepare basic supplies.

## 4. Provisioning must use real resources

Prefer:

```
existing NPC supplies
        ↓
household food / water
        ↓
settlement sources
        ↓
local world food / water
```

Do not spawn free food or water when accepting a contract.

If the current household/storage API cannot perform a required transfer cleanly, keep the first implementation limited to existing ownership/transfer mechanisms rather than adding a contract-specific warehouse.

## 5. Water — waterskin

Use existing liquid-container instances.

```
accept distant contract
        ↓
NPC obtains/has waterskin
        ↓
travel
        ↓
thirst becomes critical
        ↓
drinkFromLiquidContainer()
        ↓
water quantity decreases
```

The waterskin remains a real inventory item. An empty waterskin must not provide water.

## 6. Food provisioning

Use normal food items.

```
contract preparation
        ↓
NPC obtains food
        ↓
carried inventory
        ↓
hunger becomes critical
        ↓
existing food consumption
```

Do not create contract-specific ration items.

## 7. Needs remain authoritative

Hired NPCs use exactly the same hunger/thirst needs as normal NPCs.

Contract work must not:

- disable hunger,
- disable thirst,
- reset needs,
- suppress critical interrupts.

```
working
   ↓
thirst critical
   ↓
interrupt work
   ↓
drink
   ↓
resume work
```

## 8. Needs may interrupt work

Use the existing need-pressure arbitration.

```
work
  ↓
critical hunger / thirst / rest
  ↓
survival action
  ↓
resume contract when possible
```

Do not create `WorkerNeedsManager` or contract-specific need priority.

## 9. Eating from carried inventory

When hunger requires food, carried food should be considered through the existing food-consumption path.

Prefer:

```
carried food
    ↓
existing household/settlement food mechanisms
    ↓
existing nearby world food source
```

If the current implementation already defines a different valid priority, preserve it rather than duplicating the resolver.

## 10. Drinking from carried waterskin

When thirst requires water, an appropriate carried waterskin should be considered before distant household/settlement sources when the NPC is away from home.

```
carried waterskin
      ↓
drinkFromLiquidContainer()
      ↓
thirst decreases
      ↓
container retains remaining water
```

When empty, fall back to existing household/settlement/well mechanisms.

No infinite refill.

## 11. Local food discovery

Reuse `SettlementFoodSourceHooks.queryNearest()` and its existing revalidation/collection path.

The NPC should be able to use real consumable world food, including natural items such as an apple.

```
apple on ground
    ↓
existing food-source discovery
    ↓
collectItem()
    ↓
food inventory / consumption
    ↓
eat
```

Do not add worker-specific apple search.

If physical pickup animation is absent, keep the existing collection abstraction. Animation is outside this plan.

## 12. Local water discovery

Reuse existing well/household/settlement water mechanisms.

The NPC must not know arbitrary water sources globally. Discovery remains bounded by the existing source/query/navigation architecture.

## 13. Supply exhaustion

Supplies are finite.

```
food depleted
water depleted
```

The NPC falls back to real available sources.

If no source is available:

```
needs rise
    ↓
critical need
    ↓
survival takes priority
    ↓
work interrupted
```

Do not magically replenish supplies.

## 14. Contract feasibility

For long/remote contracts, food and water availability should influence NPC evaluation where the existing decision system can support it.

At minimum consider:

```
distance
+
expected duration
+
available food/water
```

If the NPC clearly cannot survive the assignment with available sources, it should be able to reject the contract rather than accept an impossible commitment.

Do not build a full expedition survival planner.

## 15. No magic emergency refill

Never implement:

```
critical hunger → spawn food
critical thirst → refill waterskin
```

Emergency survival must use real inventory or real world/settlement sources.

## 16. Work interruption and resumption

Needs must not accidentally cancel a valid contract.

Normal case:

```
working
→ need interrupt
→ satisfy need
→ resume contract
```

If the existing contract lifecycle determines that the NPC abandoned the assignment because the interruption was too long or the target became invalid, reuse that lifecycle.

Do not create food-specific contract failure states.

## 17. Persistence

Persist any state already required by the NPC inventory/persistence architecture for:

- carried food,
- carried liquid-container instances,
- water quantity,
- current hunger/thirst,
- active contract/work state,
- interruption/resumption state where applicable.

Do not add isolated persistence for worker supplies if NPC carried inventory itself is intentionally non-persistent. Follow the repository's existing persistence boundary consistently.

## 18. Debugging

Extend existing diagnostics where practical to expose:

- hunger,
- thirst,
- carried food,
- carried waterskins,
- water amount,
- active need,
- critical need,
- active work contract,
- work interruption reason,
- selected food source,
- selected water source.

Do not create a separate worker-survival debug UI.

## Non-goals

Do not implement:

- separate WorkerFoodSystem,
- separate WorkerWaterSystem,
- magic provisioning,
- full survival planner,
- cooking during contracts,
- crafting food,
- contract-specific hunting,
- advanced expedition logistics,
- food trading between workers,
- contract inventory UI,
- new needs,
- new critical thresholds.

## Verification

### Short local contract

Verify that a nearby short contract does not receive unnecessary magical provisions.

### Long contract

Verify:

```
accept
→ evaluate supplies
→ provision real food/water when needed
→ travel
→ work
→ needs continue
→ consume carried supplies
→ resume work
```

### Water

Verify:

- NPC can carry a waterskin,
- NPC drinks from it,
- thirst decreases,
- water quantity decreases,
- empty container remains empty,
- water is not infinite.

### Food

Verify:

- NPC can carry food,
- NPC consumes it,
- hunger decreases,
- item quantity changes according to existing inventory rules.

### Apple on ground

Verify:

```
apple
→ NPC needs food
→ existing food-source discovery
→ collect
→ eat
```

### Critical interruption

Verify hunger and thirst can interrupt work and that the NPC can resume the contract afterward when the need is satisfied.

### Exhaustion

Verify depleted food/water does not trigger magic replenishment.

### Persistence

Verify carried food/water and contract/need state according to the existing NPC persistence boundary.

### NPC survival

Primary test:

> A long work contract must not itself cause NPC death by suppressing or bypassing normal hunger/thirst handling.

## Completion criteria

A long or remote Work Contract can be performed without giving the NPC special survival rules.

```
accept contract
      ↓
evaluate food/water needs
      ↓
prepare real supplies when needed
      ↓
travel
      ↓
work
      ↓
normal needs continue
      ↓
eat/drink from carried supplies
      ↓
supplies can run out
      ↓
use existing world/settlement sources
      ↓
critical needs can interrupt work
      ↓
resume work when possible
      ↓
complete contract
      ↓
payment_due
```

The NPC remains a normal inhabitant of Seedvale who happens to be performing paid work.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
