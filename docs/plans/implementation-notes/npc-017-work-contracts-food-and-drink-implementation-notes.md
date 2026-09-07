# Implementation Notes: Work Contracts — Food & Drink for Hired NPCs

**Reviewed:** 2026-09-07
**Plan:** npc-017-work-contracts-food-and-drink.md

## Current contract seam — npc-015 is implemented

`npc-015` is no longer a precondition to wait for. Current `main` has the real runtime lifecycle.

- `src/world/workContract.ts::WorkContractRecord` is the sole authority for contract commitment. It owns `workerNpcId`, lifecycle state and work-progress commitment fields.
- Implemented active lifecycle is `advertised → accepted → travelling → working → payment_due`, with `cancelled` / `invalidated` terminal states and `releaseWorkContract()` for genuine worker abandonment.
- `NpcAgent` does **not** keep a second contract assignment. It calls `WorkContracts.findByWorker(this.id)` and resumes the authoritative record from there.
- `NpcAgent.pursueAcceptedContract()` drives the accepted/travelling/working lifecycle. `payment_due` is deliberately no longer active work.
- Ordinary interruption is already distinct from abandonment: transient action cancellation does not call `releaseWorkContract()`.

For 017, keep that ownership unchanged. Food/water state must never be copied into `WorkContractRecord`; the contract records the commitment, not the worker's belongings.

## Existing contract evaluation to extend

`src/ai/npcWorkContract.ts` is the pure deterministic opportunity evaluator.

`scoreWorkContractOpportunity()` currently scores:

- reward,
- role suitability,
- travel time derived from actual walk speed/day length,
- `contract.committedWork`,
- schedule conflict.

`selectBestWorkContract()` selects the highest positive candidate and is already unit-tested in `src/ai/npcWorkContract.test.ts`.

Food/water feasibility should extend this existing evaluation/preparation seam with bounded information. Do not add a separate contract-survival planner or second acceptance system.

The clean split is likely:

- **opportunity evaluation**: cheaply reject/penalize obviously non-survivable remote work,
- **after acceptance / before travel**: perform actual real-resource provisioning.

Do not make scoring mutate inventory.

## Need/action arbitration to preserve

Relevant current owners:

- `src/ai/Needs.ts` — hunger/thirst state and normal/critical thresholds,
- `src/ai/npcStrategies.ts` — need strategy candidate selection,
- `src/ai/npcDecision.ts::decideNpcAction()` — top-level choose ordering,
- `src/ai/npcDecision.ts::shouldInterruptAction()` — pure in-flight critical-interrupt precedence,
- `NpcAgent.tickCriticalInterrupt()` / `interruptCurrentAction()` — runtime execution/cleanup.

`shouldInterruptAction()` intentionally only lets a critical need interrupt when `activeNeed === 'idle'`; it avoids need-to-need thrashing. Keep this behaviour.

017 should only make carried food/water available to the normal food/water strategy/consumption path. Do not add a `WorkerNeedsManager`, new `NeedId`, or contract-only interrupt priority.

## NpcAgent.carried — reusable runtime carrier, not authoritative state

`NpcAgent.carried` remains:

- a normal shared `Inventory`,
- max weight `NPC_CARRY_MAX_WEIGHT = 5`,
- used by weapons/ammo, gathering, helper/logistics flows and other physical carrying,
- transient runtime state,
- explicitly excluded from `NpcAuthoritativeState` today.

The plan should reuse this physical carrier. It should **not** introduce `WorkerInventory` or `ContractSupplies`.

But simply adding provisions to `NpcAgent.carried` is insufficient: they would be lost when the agent is reconstructed.

## Persistence boundary changed since the previous notes

The previous notes' statement that NPC runtime state is not part of `SaveData` is stale.

Current persistence already includes:

- `SaveData.npcStates` from `SettlementsManager.snapshotNpcStates()`,
- `SaveData.workContracts`,
- `SaveData.households`.

`NpcAuthoritativeState` / `NpcStateSnapshot` persist health, stamina, vigor, needs, physical injury, helper assignment and active plan through the NPC-state path.

`NpcAgent.carried` is still not persisted.

### Recommended ownership for provisions

If 017 provisions must survive settlement unload/reload, `WorldBundle` rebuild and save/load, extend the existing NPC authoritative-state boundary with the minimum carried-inventory representation needed to hydrate `NpcAgent.carried`.

Prefer one whole-inventory snapshot representation over special `contractFood` / `contractWater` fields if that is the smallest coherent ownership model; `carried` already contains heterogeneous items and role loadout.

Do not duplicate contract assignment there — `WorkContractRecord.workerNpcId` stays authoritative.

Do not persist navigation/path/action closures. After reconstruction, the NPC should re-decide from persisted needs + contract + carried belongings.

## Loadout hydration is a duplication hazard

`src/ai/npcLoadout.ts` seeds role weapons/ammo into `carried` during agent construction.

If 017 makes carried inventory authoritative/persisted, construction order matters:

```text
new NPC with no carried snapshot
→ seed role loadout normally

existing NPC with carried snapshot
→ hydrate snapshot
→ do not blindly seed duplicate weapons/ammo
```

Inspect the exact constructor/loadout call path before implementing the snapshot. The invariant is one physical inventory state, not "restored provisions + freshly re-seeded equipment".

## Food transfer helpers are already freshness-safe

The previous notes' `claimFoodItems()` freshness warning is obsolete.

Current `src/items/foodItems.ts` already provides:

- `FoodItemClaim` with exact `FoodBatch[]`,
- `claimFoodItems()` using `Inventory.removeWithFreshness()`,
- `depositFoodItems()` using `Inventory.addWithFreshness()`,
- `carryFoodClaim()` with capacity failure refund to the source,
- `deliverCarriedFoodClaim()` for the carrier → destination leg.

Reuse these helpers or the same underlying freshness-aware primitives. Do not create another food-transfer format and do not regress to plain `Inventory.add()` for perishables.

There is a separate existing persistence gap around household `foodBatches`; do not turn npc-017 into a general household freshness-persistence project unless shared serialization support is strictly required by the NPC carried snapshot.

## Provisioning source / transfer ownership

Expected ownership flow for food is:

```text
Household.items
→ freshness-safe claim
→ NpcAgent.carried / authoritative carried snapshot
```

Keep transfer atomic with respect to carry capacity. Existing `carryFoodClaim()` already refunds a claim that does not fit.

Do not mint provision food at acceptance.

For settlement-level food, only use an existing concrete-item withdrawal/transfer path if one is actually available; do not reintroduce abstract food scalars just to make provisioning easier.

## Carry capacity is a real constraint

`Inventory.canAdd()` applies weight and size constraints. NPC carry weight remains 5 kg.

Account for:

- role weapon,
- ammo,
- existing cargo,
- food,
- liquid mass in a filled waterskin.

Do not reserve hidden "contract provision capacity". If a loadout cannot fit, provisioning/feasibility must react to the real capacity.

## Water instances

`src/items/liquidContainer.ts` remains the authoritative API.

Use:

- `LiquidContainerItemInstance`,
- existing container creation only when obtaining a real item is justified by ownership rules,
- `fillLiquidContainer()`,
- `canDrinkFromLiquidContainer()`,
- `drinkFromLiquidContainer()`,
- `Inventory.updateInstance()`.

A full waterskin is not a scalar count. The same instance becomes partially full and then empty.

After drinking, apply the returned instance with `Inventory.updateInstance()`; do not mutate the old instance in place or delete it when empty.

Do not create a pre-filled waterskin merely because a contract needs water. The NPC must own/find a real container and obtain water from an existing source.

## Existing food/world discovery

`src/world/foodSources.ts` already owns bounded deterministic nearby real-food discovery through `SettlementFoodSourceHooks.queryNearest()` and the existing harvest/revalidation path.

Do not add worker-specific apple/crop searching or global source knowledge.

A carried-food strategy should generally avoid a pointless remote trip when food is already physically on the NPC, but keep the exact ordering inside the existing strategy-selection architecture.

## Existing water sources

`Household.water` is the authoritative household `WaterReserve`. Existing NPC behaviour already uses household water and settlement/player-built well sources.

Carried water should be another source candidate, not a replacement water system.

When the waterskin is empty, normal water-source selection should resume.

Refilling is only valid after actually reaching a normal water source and applying normal liquid-container fill semantics.

## Contract interruption / resumption invariant

Current contract design already supports the desired invariant:

```text
contract travelling/working
→ critical need interrupts pending action
→ contract record still has workerNpcId
→ satisfy need
→ normal choose/idle contract seam finds same record
→ pursueAcceptedContract() resumes it
```

Do not add an explicit food-specific "paused contract" state.

Do not call `releaseWorkContract()` merely because hunger/thirst interrupted an action. That API is for genuine abandonment while the target remains valid.

## Bounded feasibility rule

Do not simulate the whole future contract.

Use existing deterministic inputs:

- contract distance / existing travel-time math,
- `committedWork` as expected work magnitude,
- current hunger/thirst,
- current carried provisions,
- household supplies,
- bounded local source availability if cheaply queryable,
- real carry capacity.

Prefer a conservative gate/penalty that prevents obviously impossible remote assignments without requiring global searches.

Keep read-only evaluation separate from the mutating provisioning action.

## Diagnostics

`NpcAgent.createInspectionSnapshot()` already projects:

- needs,
- active need,
- decision/strategy candidates,
- current action,
- authoritative contract id/state/progress,
- household food/water.

Extend this existing snapshot/trace rather than adding a worker-survival UI.

Useful additions for 017:

- carried food counts/kinds,
- carried liquid-container ids + litres,
- selected carried-food/carried-water strategy,
- provisioning failure reason where useful,
- interruption versus genuine contract abandonment.

If carried inventory becomes authoritative, diagnostics should project that same state rather than maintain debug-only copies.

## Suggested implementation order

1. Inspect the current `NpcAgent` constructor/loadout path and decide the minimal authoritative carried-inventory snapshot shape.
2. Add snapshot/hydration through `NpcAuthoritativeState` / `NpcStateSnapshot` / `SaveData.npcStates`, avoiding duplicate role loadout.
3. Reuse freshness-safe food transfer and liquid-container instance serialization for real provisioning.
4. Add carried-food and carried-water consumption candidates through the existing need strategy path.
5. Add bounded contract feasibility to the existing `npcWorkContract.ts` evaluation seam.
6. Add post-acceptance/pre-travel provisioning without mutating the pure scorer.
7. Verify critical interrupt → satisfy need → `pursueAcceptedContract()` resume without `releaseWorkContract()`.
8. Add focused tests for capacity/refund, finite food/water, partial/empty waterskin, reconstruction/save-load continuity and duplicate-loadout prevention.

## Main pitfalls

- Treating the already-landed `npc-015` APIs as hypothetical.
- Copying contract assignment into NPC state instead of querying `WorkContractRecord.workerNpcId`.
- Treating `NpcAgent.carried` as durable without adding authoritative ownership.
- Persisting only food/water while reconstructing the rest of carried inventory independently and duplicating equipment.
- Reimplementing food transfers even though freshness-safe `FoodItemClaim` / `carryFoodClaim()` already exist.
- Spawning food or a filled waterskin during acceptance.
- Treating waterskins as scalar item counts.
- Ignoring the 5 kg carry limit and existing equipment/cargo.
- Letting a critical need call `releaseWorkContract()` instead of only interrupting transient action state.
- Adding a worker-specific need/decision system.
- Expanding 017 into unrelated household freshness-persistence cleanup.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
