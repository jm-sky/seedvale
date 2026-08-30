# Plan: Household & Settlement Food Storage Model

**Created:** 2026-08-30
**Status:** `planned` 📋
**Priority:** high · **Effort:** M
**Depends on:** ~~069~~ ~~122~~ ~~106~~ ~~005~~
**Domain:** `settlements-npcs`
**Roadmap:** [Physical Resource Storage & Logistics](../roadmap/physical-resource-storage-and-logistics.md)

## Goal

Remove the abstract `food` quantity from household and settlement storage and use the existing concrete food `ItemKind` values through the existing inventory/item mechanisms.

This plan prepares the authoritative data model for the next plan, which will introduce separate physical Food Storage and Wood Storage destinations.

Do **not** implement physical storage places, NPC routing to them, or 3D visualization in this plan.

## Current code — starting points

Before editing, read the current versions of:

- `src/settlement/household.ts` — household resource state and household inventory/storage ownership.
- `src/settlement/household.test.ts` — household resource invariants.
- `src/settlement/householdExchange.test.ts` — household exchange behaviour.
- `src/economy/localExchange.test.ts` — settlement/local resource exchange tests.
- `src/ai/NpcAgent.ts` — NPC food/resource consumption and related household interactions.
- `src/interaction/resolveInteraction.ts` — player/NPC interaction paths that may consume or transfer food.
- `src/settlement/props.ts` — existing settlement storage/stockpile world integration; inspect only for dependencies, do not implement the new physical storage here.
- `src/fauna/AnimalAgent.ts` — existing animal food/resource production/consumption integration relevant to household/settlement food.
- `docs/state/settlements.md` — documented household/settlement state; update only where the current implementation changes the documented model.
- `docs/plans/implementation-notes/settlements-npcs-005-local-resource-exchange-implementation-notes.md` — implementation constraints of the existing exchange system.
- `docs/plans/archive/2026-08-18--152--npc-player-food-drink-help.md` — downstream assumptions about household food.
- The current `ItemKind` definition/catalog and `Inventory` implementation — locate and inspect their current paths before editing.

Also search the repository for every runtime use of the `food` household/settlement resource. Do not assume the files above are exhaustive.

## Target model

### Concrete food

Food is represented by existing `ItemKind` values, including where currently applicable:

`carrot`, `cabbage`, `potato`, `tomato`, `fish`, `egg`, meat products, bread, berries and other existing food items.

Do not create a parallel food enum or duplicate list of food items.

Use the existing item-category/capability mechanism to determine whether an `ItemKind` is food.

### Household

The household must no longer maintain an authoritative abstract:

`food: number`

as a second representation of food inventory.

The existing inventory mechanism becomes the source of truth for concrete food items.

Wood remains governed by the existing resource/economy model in this plan; wood migration is explicitly out of scope.

### Settlement

The settlement must likewise not maintain an independent authoritative abstract food quantity alongside concrete food items.

Use the existing inventory/item ownership mechanism for concrete food.

Do not redesign unrelated economic resources such as wood, ore or stone.

## Implementation

### 1. Map and classify current `food` usages

Search the whole repository for:

- household `food` fields,
- settlement `food` fields,
- reads/writes of those fields,
- serialization/deserialization,
- consumption,
- shortage/need calculations,
- production,
- exchange,
- tests.

Classify every use as:

- migrate to concrete food inventory,
- remain as a derived/decision-level concept,
- remove,
- unrelated occurrence.

Do not blindly replace every occurrence of the word `food`.

### 2. Migrate Household

Modify the household model so concrete food is represented only by the existing inventory.

Preserve:

- household identity,
- existing wood/resource state,
- water state,
- existing inventory semantics,
- deterministic behaviour.

Do not add `FoodInventory`, `FoodStock`, `FoodResourceMap` or another parallel store.

### 3. Migrate Settlement

Apply the same rule to settlement-level food.

Concrete food items must have one authoritative owner/storage representation.

If the current settlement implementation does not yet have the required inventory ownership, adapt the smallest existing inventory mechanism necessary. Do not introduce a second inventory architecture.

### 4. Food availability and consumption

Replace direct reads such as:

`household.food`

with queries against concrete food inventory.

Provide/reuse a small domain-level helper where necessary, for example:

- whether food is available,
- total food item quantity,
- selecting/removing food for consumption.

Keep the NPC need concept abstract:

`NPC needs food`

but derive availability from actual food items.

For this plan, preserve the current one-item/one-food-unit semantics if that is what the existing mechanics require. Do not introduce nutrition/calorie values.

### 5. Production and gathering

Audit all existing food producers and consumers, especially:

- crop harvesting from plans 126/172,
- natural food gathering,
- fishing,
- hunting/meat,
- livestock products from fauna-002,
- other existing food production.

Where a system already creates a concrete food `ItemKind`, keep that concrete item as the authoritative result.

Do not add conversion:

`carrot → food`

or:

`fish → food`

as a second stored value.

### 6. Local resource exchange

Update the existing local exchange integration where it assumes an abstract food resource.

Do not redesign exchange in this plan.

The goal is only to ensure food exchange operates on the new authoritative concrete-item model and does not recreate an abstract `food` balance.

The existing implementation of `settlements-npcs-005` remains the exchange mechanism.

### 7. Persistence

Audit save/load paths for the removed abstract food state.

Ensure:

- concrete food inventory survives save/load,
- no duplicate food quantity is restored,
- new games initialise consistently,
- old persisted state is handled according to the existing migration conventions if compatibility is required.

Do not redesign persistence.

### 8. Documentation

Update `docs/state/settlements.md` only where its documented model no longer matches the implementation.

Do not duplicate implementation details from this plan into the state document.

## Tests

Update existing tests and add focused coverage where gaps exist.

Minimum scenarios:

1. household with no food items;
2. household with one food `ItemKind`;
3. household with several different food `ItemKind` values;
4. food availability derived from inventory;
5. NPC food consumption removes concrete food items;
6. shortage is triggered when appropriate food is unavailable;
7. crop/livestock/natural-food production reaches concrete inventory;
8. household/settlement exchange transfers concrete food correctly;
9. save/load preserves concrete food state;
10. no authoritative household/settlement `food` quantity remains.

Prefer existing test helpers and fixtures.

## Non-goals

Do not implement:

- Food Storage world places;
- Wood Storage world places;
- storage destination types;
- NPC pathfinding to storage;
- new logistics architecture;
- physical storage props;
- 3D food/wood visualization;
- nutrition/calorie system;
- migration of wood from its current economic-resource representation.

## Verification

Run focused tests for:

- household,
- household exchange,
- local exchange,
- NPC food consumption,
- affected production systems,
- persistence.

Then run:

- lint,
- typecheck/build,
- relevant deterministic simulation tests.

Before declaring complete, perform a repository search confirming that no runtime household/settlement authoritative `food` resource remains.

Browser/manual verification is not required unless the implementation unexpectedly changes rendered gameplay or an affected existing browser flow.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
