# Plan: Physical Storage Destinations & Resource Delivery

**Created:** 2026-08-30
**Status:** `verification needed` 🔍
**Priority:** high · **Effort:** M
**Depends on:** ~~settlements-npcs-008~~ ~~settlements-npcs-005~~
**Domain:** `settlements-npcs`
**Roadmap:** [Physical Resource Storage & Logistics](../roadmap/physical-resource-storage-and-logistics.md)

## Goal

Add physical storage destinations for households and settlements and connect them to the existing NPC carrying/delivery and local-resource-exchange mechanisms.

The target behaviour is:

```text
wood / resource
      ↓
Wood Storage

carrot / potato / cabbage / tomato / fish / ...
      ↓
Food Storage
```

This plan extends existing systems. It must not introduce a second logistics, inventory or settlement-place architecture.

Physical 3D visualization is out of scope and belongs to the next plan.

## Required reading

Before editing:

- `CLAUDE.md`
- `docs/STATE.md`
- `docs/plans/README.md`
- `docs/roadmap/physical-resource-storage-and-logistics.md`
- `docs/plans/settlements-npcs-008-household-and-settlement-food-storage-model.md`
- implementation notes for `settlements-npcs-005-local-resource-exchange.md`

Then inspect the current implementations of:

- household resource/inventory ownership,
- settlement resource/inventory ownership,
- storage/stockpile/place abstractions,
- NPC carried-resource/item state,
- NPC delivery,
- navigation targets,
- local resource exchange.

The filenames above are starting points, not an exhaustive file list. Repository code is the source of truth.

## Asset recon

Before implementation, inspect existing asset documentation and local assets:

- `docs/assets/MODELS.md`
- `docs/assets/LOCAL_ASSETS.md`
- `_temp/` according to `LOCAL_ASSETS.md`

Look for candidates for:

- wood/log piles,
- firewood,
- crates,
- chests,
- food storage,
- settlement storage.

Do not implement asset rendering in this plan and do not copy/convert assets. Record useful candidate paths/names for Plan 3 so that the next implementation context does not need to repeat the search.

## Architecture rule

Keep these concepts separate:

```text
Storage Place = WHERE the resource/item is delivered
Inventory / Resource State = WHAT and HOW MUCH is stored
```

A storage place must not become a second authoritative copy of its contents.

Do not introduce:

- `FoodInventory`,
- `WoodInventory`,
- storage-local quantity fields,
- a new logistics system,
- a new navigation system,
- a new settlement-place system.

Reuse existing abstractions whenever possible.

## 1. Recon existing destination/place mechanisms

Identify the existing mechanism that represents:

- settlement places,
- household locations,
- stockpiles/storage,
- NPC work destinations,
- navigation targets.

If an existing abstraction can represent storage destinations, extend it.

Only introduce a new minimal storage-destination abstraction if the current architecture genuinely has no suitable mechanism.

Document the selected mechanism in the implementation notes.

## 2. Household & settlement storage destinations

Give households and settlements distinct physical destinations for at least:

- Wood Storage
- Food Storage

The destination contains location/ownership/type information only.

The authoritative contents remain in the existing resource/inventory state established by Plan 008.

Do not create a new inventory attached to the physical storage object.

## 3. Destination resolution

Implement one shared resolution path:

```text
carried resource/item
        ↓
resource/item classification
        ↓
compatible storage destination
```

Examples:

```text
wood      → Wood Storage
carrot    → Food Storage
potato    → Food Storage
cabbage   → Food Storage
tomato    → Food Storage
fish      → Food Storage
```

Food classification must reuse the existing `ItemKind` classification from Plan 008.

Do not maintain another hard-coded list of food items in logistics.

The resolver should work for both household and settlement destinations.

## 4. Integrate with existing NPC delivery

Modify the existing carrying/delivery flow only where required:

```text
existing gather/produce
        ↓
existing carried resource/item
        ↓
destination resolution
        ↓
existing navigation
        ↓
existing delivery
        ↓
authoritative inventory/resource state
```

Do not rewrite gathering, production or NPC movement.

The main change is choosing the correct destination.

Required behaviours include:

- gathered wood → Wood Storage;
- produced/gathered food → Food Storage;
- existing transferable resources continue using their existing destination rules.

Preserve existing task/action lifecycle and deterministic simulation semantics.

## 5. Integrate local resource exchange

Update `settlements-npcs-005` integration where delivery currently assumes a generic or incorrect storage destination.

Examples should include existing supported flows such as:

- settlement → household,
- household → household,
- household → settlement,

using the correct Food/Wood destination where applicable.

Do not redesign exchange rules or introduce another exchange mechanism.

## 6. Missing destination handling

Handle cases where a household or settlement has no valid storage destination.

Do not allow NPCs to:

- repeatedly retry an impossible delivery forever,
- become permanently stuck carrying the resource,
- silently lose the resource.

Reuse the existing failure/fallback/task-abandonment mechanism if available.

The expected outcome is that an impossible delivery becomes a recoverable simulation state and the NPC can continue with another valid action.

## 7. Tests

Extend existing tests rather than creating new test infrastructure.

Cover at minimum:

1. wood resolves to Wood Storage;
2. every existing food `ItemKind` resolves to Food Storage;
3. household destinations work;
4. settlement destinations work;
5. incompatible destination is rejected;
6. delivery deposits into the existing authoritative state;
7. food is never delivered to Wood Storage;
8. wood is never delivered to Food Storage;
9. local exchange uses the correct destination;
10. missing destination does not create an infinite delivery loop or permanently stuck carrier;
11. destination resolution is deterministic.

Use existing household, settlement, exchange, NPC and inventory test helpers.

## Non-goals

Do not implement:

- storage 3D models,
- wood quantity visual states,
- food/vegetable/fish visuals,
- open crates,
- new inventory systems,
- new logistics architecture,
- new navigation architecture,
- storage capacity redesign,
- nutrition/calorie systems.

## Verification

Run focused tests for:

- storage/destination resolution,
- household/settlement delivery,
- local resource exchange,
- NPC carrying/delivery,
- affected inventory/resource systems.

Then run:

- lint,
- typecheck/build,
- relevant deterministic simulation tests.

Because this plan changes NPC world behaviour and movement, perform browser/manual verification of at least:

```text
NPC gathers wood
→ carries wood
→ travels to Wood Storage
→ deposits wood

NPC gathers/produces food
→ carries food
→ travels to Food Storage
→ deposits food
```

Also verify an exchange flow and the no-destination fallback.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
