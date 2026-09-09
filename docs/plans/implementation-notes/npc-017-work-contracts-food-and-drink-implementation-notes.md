# Implementation Notes: Work Contracts — Food & Drink for Hired NPCs

**Reviewed:** 2026-09-09
**Plan:** npc-017-work-contracts-food-and-drink.md

## Current contract seam

`npc-015` is implemented and remains the correct ownership boundary.

- `src/world/workContract.ts::WorkContractRecord` is the sole authority for contract commitment. It owns `workerNpcId`, lifecycle state and work-progress commitment fields.
- Active lifecycle is `advertised → accepted → travelling → working → payment_due`, with `cancelled` / `invalidated` terminal states and `releaseWorkContract()` for genuine worker abandonment.
- `NpcAgent` does **not** keep a second contract assignment. It queries `WorkContracts.findByWorker(this.id)` and resumes the authoritative record.
- Ordinary action interruption is distinct from abandonment.

For 017, keep this ownership unchanged. Food/water state must never be copied into `WorkContractRecord`.

## Existing contract evaluation to extend

`src/ai/npcWorkContract.ts` is the pure deterministic opportunity evaluator.

`scoreWorkContractOpportunity()` currently scores:

- reward,
- role suitability,
- travel time derived from real walk speed/day length,
- expected work,
- schedule conflict.

`selectBestWorkContract()` picks the best positive candidate.

Food/water feasibility should extend this existing evaluation/preparation seam with bounded information. Keep the split:

- **opportunity evaluation** — read-only, cheaply reject/penalize obviously non-survivable remote work;
- **after acceptance / before travel** — perform actual real-resource provisioning.

Do not make scoring mutate inventory and do not add a second acceptance system.

## Need/action arbitration to preserve

Relevant current owners:

- `src/ai/Needs.ts` — hunger/thirst state, drift, normal and critical thresholds;
- `src/ai/npcStrategies.ts` / current strategy-candidate helpers — need strategy selection;
- `src/ai/npcDecision.ts::decideNpcAction()` — top-level decision ordering;
- `src/ai/npcDecision.ts::shouldInterruptAction()` — in-flight critical-interrupt precedence;
- `NpcAgent.tickCriticalInterrupt()` / `interruptCurrentAction()` — runtime interruption.

017 should only make personal food/water available to the normal need strategy/consumption path. Do not add a `WorkerNeedsManager`, new `NeedId`, contract-only interrupt priority or worker-specific thresholds.

## settlements-npcs-026 changed the inventory ownership model

The previous npc-017 notes are stale here.

Current `src/settlement/npcState.ts` has:

```text
NpcAuthoritativeState.personalInventory: Inventory
NpcStateSnapshot.personalInventory?: InventoryContentsSnapshot
```

The live `NpcAgent.personalInventory` is the **same Inventory object** held by authoritative NPC state. It survives settlement unload/reload, `WorldBundle` rebuild and `SaveData.npcStates` persistence.

`NpcAgent.carried` still exists, but its role is deliberately different:

- temporary work/logistics payload;
- capped by `NPC_CARRY_MAX_WEIGHT = 5 kg`;
- recreated with the agent;
- intentionally excluded from `NpcAuthoritativeState`.

Do not persist `carried` just to support provisions.

### Provision ownership decision

Contract food/water that conceptually belongs to the NPC and must survive reconstruction should live in the existing `personalInventory`.

Transient contract/build/gathering cargo should stay in `NpcAgent.carried`.

This preserves the boundary introduced by settlements-npcs-026 instead of undoing it.

## Existing persistence is already sufficient

`InventoryContentsSnapshot` already persists:

- count-based items,
- concrete item instances,
- liquid-container identity/content/litres,
- perishable `FoodBatch` freshness metadata.

`NpcStateRegistry.serialize()` already snapshots `state.personalInventory`, and restore already hydrates it through `inventoryFromContents()`.

Therefore npc-017 does **not** need:

- a new field on `NpcAuthoritativeState`,
- a new field on `NpcStateSnapshot`,
- a new top-level `SaveData` field,
- a carried-provisions snapshot,
- a provision-specific serialization format,
- a save migration solely for food/water provisions.

This is the main correction versus the previous notes.

## Loadout reconstruction duplication is already solved by settlements-npcs-026

`src/ai/npcLoadout.ts` seeds personal belongings only on genuine first creation using `needsInitialPersonalLoadout`.

Snapshot restore sets that latch to `false`, so reconstruction reuses the existing `personalInventory` and does not blindly reseed personal weapons.

017 should reuse this behaviour, not add another hydration/loadout path.

Hunter arrows and other transient work supply that intentionally remain in `NpcAgent.carried` are not a reason to move provisions back into that transient owner.

## Food transfer helpers are freshness-safe

`src/items/foodItems.ts` already provides freshness-preserving movement through `FoodBatch`-aware helpers/primitives, including:

- `claimFoodItems()`,
- `depositFoodItems()`,
- `carryFoodClaim()`,
- `deliverCarriedFoodClaim()`,
- underlying `removeWithFreshness()` / `addWithFreshness()`.

For household → personal provision transfer, reuse these primitives or the narrowest existing helper that fits the source/destination shape.

Do not regress perishables to plain count-only transfer.

## Current food strategy seam

Current `NpcAgent.beginNeed('food')` does not consume from `personalInventory`.

Its existing strategy path covers household/economy/exchange/hunt/nearby-world-food behaviour. That is the seam to extend.

Add an available personal-food candidate when `personalInventory` contains usable food. Execution should:

1. consume one real food unit through freshness-aware inventory semantics;
2. call the normal hunger relief path;
3. remain part of the central strategy selection/trace flow.

Do not add a contract-only `if (working && hungry)` eating branch.

A personal-food strategy should normally beat a materially more distant trip when usable food is already on the NPC, while preserving deterministic ordering/scoring conventions of the existing strategy layer.

## Current water strategy seam

Current `NpcAgent.beginNeed('water')` chooses between:

- household `WaterReserve`,
- well/player-built water source fallback.

It does not currently drink from `personalInventory` liquid containers.

Add a personal-container candidate through the same strategy-selection path.

Use the existing liquid-container API:

- `canDrinkFromLiquidContainer()`,
- `drinkFromLiquidContainer()`,
- `Inventory.updateInstance()`.

The same instance must remain after drinking; litres decrease and an exhausted container becomes empty.

When no usable personal container remains, current household/well behaviour should continue unchanged.

## Liquid-container provisioning

A waterskin is a real item instance, not a scalar stock value.

Expected remote-work flow:

```text
NPC owns/legitimately obtains empty waterskin
→ waterskin is in personalInventory
→ NPC reaches real water source
→ fillLiquidContainer(..., 'water')
→ personalInventory.updateInstance(...)
→ travel/work
→ thirst selects personal container
→ drinkFromLiquidContainer(...)
→ personalInventory.updateInstance(...)
```

Do not create a pre-filled waterskin merely because a contract needs one and do not silently refill it.

## Provisioning source / transfer ownership

Expected food ownership flow:

```text
Household.items
→ freshness-safe withdrawal
→ NpcAuthoritativeState.personalInventory
```

Expected water flow:

```text
existing personal liquid container
→ real water source
→ fill existing instance
```

If acquiring a container from some existing owner is required, use a real ownership transfer. Do not mint one at contract acceptance.

Keep transfer atomic with respect to destination capacity.

## Capacity

Use the capacity semantics of the inventory that actually owns the item:

- `personalInventory.canAdd()` / `canAddInstance()` for personal provisions;
- existing `NpcAgent.carried` 5 kg cap for transient work/logistics payload.

Do not grant hidden provision capacity.

Also do not turn npc-017 into a redesign of NPC total/body carrying capacity or an attempt to merge the two inventory concepts. That belongs to other plans.

## Existing world food discovery

`src/world/foodSources.ts` / `SettlementFoodSourceHooks.queryNearest()` already own bounded deterministic nearby real-food discovery and source revalidation/harvest.

Do not add worker-specific apple/crop searching or global source knowledge.

Personal provisions are an additional local source candidate, not a replacement for world food.

## Existing water sources

`Household.water` remains the household `WaterReserve`. Existing NPC behaviour already uses household water and wells/player-built sources.

Personal water is another source candidate, not a replacement water system.

Refilling is only valid after actually reaching a valid existing source and applying normal liquid-container fill semantics.

## Contract interruption / resumption invariant

Current contract design already supports:

```text
contract travelling/working
→ critical need interrupts pending action
→ contract record still has workerNpcId
→ satisfy need
→ normal decision flow finds same contract
→ pursueAcceptedContract() resumes it
```

Do not add an explicit food-specific `paused` contract state.

Do not call `releaseWorkContract()` merely because hunger/thirst interrupted an action.

## Bounded feasibility rule

Do not simulate the whole future contract.

Use existing deterministic inputs:

- contract distance / travel-time math,
- expected work,
- current hunger/thirst,
- existing personal food/water,
- household supplies,
- bounded local source availability if cheaply queryable,
- real inventory capacity.

Prefer a conservative gate/penalty that prevents obviously impossible remote assignments without global searches.

Keep read-only evaluation separate from mutating provisioning.

## Diagnostics

`NpcAgent.createInspectionSnapshot()` already exposes needs, current strategy/decision state and contract information.

Extend existing diagnostics where useful with:

- personal food counts/kinds,
- personal liquid-container ids + litres,
- selected personal-food/personal-water strategy,
- provisioning failure reason,
- interruption versus genuine contract abandonment.

Do not add a worker-survival debug UI or debug-only ownership copy.

## Suggested implementation order

1. Add focused selectors/helpers for usable food and drinkable liquid containers in `personalInventory` using existing item/inventory APIs.
2. Extend the existing food strategy candidate/execution path with personal food consumption.
3. Extend the existing water strategy candidate/execution path with personal liquid-container drinking.
4. Add post-acceptance/pre-travel provisioning using real household/source transfers into `personalInventory` where needed.
5. Add bounded food/water feasibility to the existing `npcWorkContract.ts` evaluation seam without mutating from the scorer.
6. Verify critical interrupt → satisfy need → contract resume without `releaseWorkContract()`.
7. Add focused tests for freshness-preserving provision transfer, liquid depletion, finite supplies, capacity failure, reconstruction/save-load continuity and no duplicate provisioning.

No new NPC inventory persistence implementation step should exist in this order.

## Main pitfalls

- Treating `personalInventory` as hypothetical or non-persistent after settlements-npcs-026.
- Adding another `NpcStateSnapshot` provision field even though `InventoryContentsSnapshot` already persists the required data.
- Persisting transient `NpcAgent.carried` merely to carry food/water.
- Moving unrelated work/logistics cargo into `personalInventory`.
- Copying contract assignment into NPC state instead of querying `WorkContractRecord.workerNpcId`.
- Reimplementing food transfers instead of using freshness-aware inventory primitives.
- Spawning food or a filled/new waterskin during acceptance.
- Treating waterskins as scalar item counts.
- Bypassing the owning inventory's real capacity checks.
- Letting a critical need call `releaseWorkContract()` instead of only interrupting transient action state.
- Adding a worker-specific need/decision system.
- Expanding 017 into general inventory/corpse/household persistence cleanup.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
