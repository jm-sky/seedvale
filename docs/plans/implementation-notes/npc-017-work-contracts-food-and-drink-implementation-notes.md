# Implementation Notes: Work Contracts — Food & Drink for Hired NPCs

**Reviewed:** 2026-09-02
**Plan:** npc-017-work-contracts-food-and-drink.md

## Critical precondition

- **npc-015 is still planned and there is no Work Contract runtime implementation on current main.** The plan depends on APIs that do not exist yet. Treat npc-015 implementation-notes as guidance only; after 015 lands, inspect its actual contract/worker lifecycle before implementing 017.
- Current NPC persistence is deliberately incomplete: NpcAuthoritativeState carries HP/needs/stamina/vigor/helper assignment/plan across WorldBundle rebuild, but NPC runtime state is not part of SaveData. NpcAgent.carried is explicitly transient. Do not add a second worker-inventory persistence mechanism just for 017. The final persistence boundary must be established consistently with 015.

## Current mechanisms to reuse

- src/ai/NpcAgent.ts is the existing need/action integration point. beginNeed('food'|'water') already handles hunger/thirst and critical interruptions; tickNeeds() and tickCriticalInterrupt() are independent of the current action. Contract work must continue through this path rather than bypassing it.
- NpcAgent startAction() / goTo → execute is the correct mechanism for provisioning trips, local source visits and work interruptions. Do not add a worker FSM or scheduler.
- src/ai/npcStrategies.ts already models food/water strategy selection. Extend the existing candidate/selection seam if carried provisions need explicit priority; do not create contract-specific need arbitration.
- src/items/Inventory.ts is already shared by player and NPCs. However, NpcAgent.carried currently has NPC_CARRY_MAX_WEIGHT = 5, contains role weapons/ammo and is documented as temporary resource carrying, not persistent belongings.
- src/items/foodItems.ts is the shared concrete-food helper layer (foodItemCount, takeOneFoodItem, claimFoodItems, depositFoodItems). Household food is now concrete ItemKinds in Household.items; there is no authoritative scalar food quantity.
- src/items/liquidContainer.ts is the authoritative water-container API. Use LiquidContainerItemInstance, createLiquidContainerInstance, fillLiquidContainer, canDrinkFromLiquidContainer, drinkFromLiquidContainer, and Inventory.updateInstance(). Empty containers remain the same instance.
- src/world/foodSources.ts already provides bounded deterministic SettlementFoodSourceHooks.queryNearest() + harvest(). Reuse it for local natural food/crop discovery; collectItem() revalidates the source.
- Household water is authoritative in src/settlement/household.ts (Household.water), and NPCs currently satisfy thirst from household reserve or the settlement/player-built well. Do not duplicate water reserve state.
- src/ai/npcLoadout.ts seeds role weapons/ammo into carried; any provision capacity must account for those existing items.

## Important architecture decision

The plan's phrase “NPC carried inventory” is currently misleading: NpcAgent.carried is not authoritative state and is recreated with every NpcAgent instance. If 017 requires provisions to survive settlement unload/reload or save/load, simply putting food/waterskins into this field is insufficient.

Prefer extending the existing NpcAuthoritativeState / NpcStateSnapshot boundary with the minimum carried-inventory snapshot required by the landed contract system, rather than introducing WorkerInventory, ContractSupplies, or a separate persistence store. Keep transient navigation/action state out of it. If 015 deliberately establishes another worker-state owner, use that exact owner instead.

For liquid instances, persist instance identity + kind + liquid + amountLitres through the existing SaveItemInstance shape. Do not convert waterskins into scalar ItemKind counts.

## Provisioning and ownership

- Provisioning must transfer real household/settlement resources. Never add free food or create a pre-filled waterskin as an emergency refill.
- The likely ownership flow is household/settlement storage → NPC carried inventory at contract acceptance/preparation. Keep the transfer atomic enough that a failed destination/capacity check does not destroy the source supply.
- Inventory.canAdd() checks both weight and size; the current NPC capacity is only 5 kg. A full waterskin is materially heavier because liquid mass is included by Inventory.totalWeight(). Recalculate how much can actually be carried together with the role weapon/ammo.
- Do not make every accepted contract provision supplies. Base the decision on the contract's actual travel/work estimate and available local sources, as the plan states. Keep this a small deterministic feasibility/provisioning rule, not an expedition planner.

## Food-specific pitfall

claimFoodItems() + depositFoodItems() currently transfer only {kind, amount}. Inventory also tracks freshness batches for perishable food, and depositFoodItems() calls Inventory.add() without an acquisition day. Reusing that pair for carried provisioning can therefore lose/alter freshness semantics.

If 017 transfers perishable household food into carried inventory, either:
- add a small transfer primitive that preserves the existing FoodBatch acquisition metadata, or
- explicitly use a non-perishable provision kind for the first contract slice.

Do not silently reset freshness to day 0.

## Water-specific implementation

- Find a suitable existing waterskin instance in the source inventory; do not represent water as waterskin_full counts. Legacy kinds are migrated by liquidContainer.ts.
- After drinking, apply the returned LiquidContainerItemInstance through Inventory.updateInstance(). Do not mutate the instance object in place or remove the container when empty.
- A carried empty waterskin must naturally fall through to the existing household/well water strategies.
- Do not refill a carried waterskin unless the NPC actually reaches an existing water source and uses the normal liquid-container fill semantics.

## Need/action integration

The desired priority is:

1. existing carried food/water when the NPC is remote,
2. existing nearby real food/water sources,
3. existing household/settlement/well mechanisms.

But preserve whatever exact priority the current beginNeed() and npcStrategies.ts establish after 015/017 integration. The important invariant is that hunger/thirst remain the same NeedIds and critical interruptions continue through tickCriticalInterrupt().

A need interruption must cancel only the transient action. It must not clear the authoritative contract assignment. The next normal decision should resume the contract when it remains valid.

## Contract feasibility

Do not make feasibility a hard global “enough food/water for entire contract” simulation. Use bounded estimates already available from the contract:

- travel distance/time,
- expected work duration,
- nearby source availability,
- current carried supplies,
- household/settlement supply availability.

The result should influence acceptance/preparation through the existing 015 contract decision seam. Avoid adding a new NeedId, pressure system or worker planner.

## Persistence / rebuild trap

There are two distinct lifecycle boundaries:

- NpcAgent reconstruction / settlement streaming / WorldBundle rebuild;
- actual SaveData save/load.

Current code handles the first for authoritative NPC state via NpcStateRegistry, but not the second. 017 must not assume that because a supply is on NpcAgent.carried, it will survive either boundary.

If 015 introduces persistent worker assignment/lifecycle, keep supplies owned by the same authoritative worker/contract state boundary. Restore that state before constructing the NPC agent so carried can be hydrated rather than re-seeded.

## Debugging

Extend the existing NpcInspectionSnapshot / trace rather than adding a worker-survival UI. Useful facts are:

- active contract id/stage,
- carried food count,
- carried water-container ids and litres,
- selected food/water strategy,
- need interruption vs contract abandonment.

Keep these as projections of authoritative state.

## Suggested implementation order

1. Land/verify npc-015 and inspect its real contract APIs.
2. Decide the authoritative owner for worker carried provisions together with 015's persistence/rebuild model.
3. Add minimal food/water transfer/provisioning primitives using existing inventory, household and liquid-container mechanisms.
4. Integrate carried provisions into existing food/water strategy selection and consumption.
5. Add contract feasibility/provisioning at acceptance without bypassing normal needs.
6. Verify interruption → satisfy need → contract resume.
7. Wire persistence only through the established NPC/contract persistence boundary.
8. Add focused deterministic tests for finite supplies, empty waterskin fallback, capacity constraints, invalid/duplicate transfers and interruption/resumption.

## Main pitfalls

- Implementing against npc-015 plan APIs that do not yet exist.
- Treating NpcAgent.carried as persistent inventory.
- Creating a parallel worker survival system or NeedId.
- Spawning/refilling food or water instead of transferring real resources.
- Treating waterskins as scalar item counts instead of instances.
- Losing food freshness metadata during household → worker transfer.
- Ignoring the 5 kg NPC carry limit and role equipment already occupying it.
- Making critical hunger/thirst cancel the contract instead of only interrupting the current action.
- Adding full NPC save persistence to 017 as an isolated feature.

> **Zrób git commit i push do main, rebase jeżeli trzeba**