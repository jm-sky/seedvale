# Plan: Physical Storage Visualization

**Created:** 2026-08-30
**Status:** `planned` 📋
**Priority:** medium · **Effort:** L
**Depends on:** ~~009~~
**Domain:** `settlements-npcs`
**Roadmap:** [Physical Resource Storage & Logistics](../roadmap/physical-resource-storage-and-logistics.md)

## Goal

Add visual representations of the physical storage destinations created by Plan 009.

The visual state is always derived from authoritative storage contents:

```text
authoritative inventory/resource state
              ↓
       storage visual state
              ↓
          Three.js
```

Rendering must never become an authoritative source of resource state.

The implementation should support:

- wood/log storage with quantity-based visual states;
- food storage represented by one or more appropriate containers;
- concrete food `ItemKind` visuals such as carrot, cabbage, potato, tomato and fish;
- household and settlement storage;
- deterministic, performant updates.

Physical storage remains a world place from Plan 009. This plan only adds its visual representation.

## Required reading

Before editing:

- `CLAUDE.md`
- `docs/STATE.md`
- `docs/plans/README.md`
- `docs/roadmap/physical-resource-storage-and-logistics.md`
- `docs/plans/settlements-npcs-008-household-and-settlement-food-storage-model.md`
- `docs/plans/settlements-npcs-009-physical-storage-destinations-and-resource-delivery.md`
- `docs/assets/MODELS.md`
- `docs/assets/LOCAL_ASSETS.md`

Inspect the current code on `main`, especially:

- storage destination implementation from Plan 009;
- `src/settlement/props.ts`;
- `src/settlement/settlementStructures.ts`;
- settlement/household placement and prop lifecycle;
- `ItemKind` and item metadata/catalog;
- inventory/resource state;
- existing model loading;
- existing instancing/batching;
- chunk/settlement lifecycle and disposal.

The listed files are starting points, not assumptions. Current code is the source of truth.

## 1. Asset recon

Inspect:

- `docs/assets/MODELS.md`;
- `docs/assets/LOCAL_ASSETS.md`;
- `_temp/` according to `LOCAL_ASSETS.md`.

Search for:

- log piles / firewood;
- crates;
- open crates;
- baskets;
- fish;
- carrot;
- cabbage;
- potato;
- tomato;
- existing settlement storage props.

Prefer, in order:

1. an existing runtime asset;
2. a suitable asset found in `_temp/`;
3. an existing generic settlement prop;
4. a minimal fallback only if genuinely necessary.

Do not create or import new assets unless required.

Record selected asset paths/names in implementation notes.

## 2. Shared storage visual mechanism

Create one reusable storage-visual mechanism.

It should consume:

```text
Storage Destination
        +
authoritative contents
        ↓
derived visual representation
```

Do not create parallel systems such as:

- `WoodStorageRenderer`;
- `FoodStorageRenderer`;
- `FishStorageRenderer`;
- `VegetableStorageRenderer`;

unless a genuinely existing architectural pattern requires separate implementations.

Prefer data/configuration-driven representation strategies.

The visual component must not own or mutate authoritative inventory/resource quantities.

## 3. Storage container representation

A `Food Storage` is a storage **place**, not necessarily one physical container.

It may contain multiple visual containers, for example:

```text
Food Storage
├── open crate
├── vegetable crate
└── fish crate
```

Choose the simplest representation compatible with available assets and the existing settlement prop architecture.

Do not create separate storage destinations merely because several visual containers are used.

## 4. Wood visual representation

Represent wood quantity using deterministic quantity bands:

```text
0       → no pile
1–3     → small pile
4–7     → medium pile
8–12    → large pile
13–20   → full pile
21+     → additional pile(s)
```

Keep quantity thresholds in one reusable configuration/representation definition rather than scattering them through rendering code.

Additional piles must:

- have deterministic placement;
- remain within the storage area;
- avoid doors, roads, interaction points and navigation-critical locations;
- use shared geometry/materials where possible.

The exact appearance should be driven by the selected asset(s), not by invented new geometry unless necessary.

## 5. Food visual representation

Food visuals must use concrete existing `ItemKind` values.

At minimum support the food types already present in the game, including:

- carrot;
- cabbage;
- potato;
- tomato;
- fish.

Do not introduce a renderer-side list of food kinds.

Use the existing item metadata/category established by Plan 008.

The conceptual pipeline is:

```text
ItemKind
   ↓
existing item metadata/category
   ↓
storage compatibility
   ↓
visual representation
```

If another existing `ItemKind` is classified as food, the visual system must not silently treat it as non-food just because it was omitted from a hard-coded renderer list.

## 6. Quantity aggregation

Do not render one Three.js object per physical item when quantities become large.

Use a bounded visual representation, for example:

```text
quantity
   ↓
visual unit count / state
   ↓
limited number of meshes
```

The exact aggregation thresholds should be chosen from the available assets and measured performance, but must be deterministic.

Different food kinds should remain visually distinguishable even when quantities are aggregated.

A missing visual asset must never remove or alter the underlying stored item.

If no suitable asset exists for an `ItemKind`, use the simplest acceptable fallback or omit only its decorative visual representation while preserving authoritative state.

## 7. Placement

Attach the visual representation to the physical storage destination from Plan 009.

Do not create another placement system.

The visual should inherit the destination's:

- position;
- ownership;
- settlement/household association;
- lifecycle.

Use existing settlement/prop placement and collision/navigation helpers where applicable.

The storage destination remains responsible for **where** storage is located. This plan is responsible only for **what is rendered there**.

## 8. Synchronization

Update storage visuals when authoritative contents change.

Examples:

```text
wood = 10
→ large pile

NPC deposits wood
→ wood = 12
→ visual updates

NPC takes wood
→ wood = 5
→ visual changes

carrot 10 → 9
→ carrot visual representation updates
```

Do not rebuild storage visuals every frame.

Use an existing change/event mechanism if available; otherwise use a cheap dirty-state or low-frequency update mechanism appropriate to the current architecture.

Ensure creation, update and disposal follow the existing settlement/chunk lifecycle.

## 9. Performance

Storage visualization must not create a significant rendering regression.

Prefer:

- shared geometries;
- shared materials;
- instancing where appropriate;
- bounded visual item counts;
- lazy creation;
- change-driven updates;
- proper disposal.

Do not render hundreds of individual vegetables/fish/logs for large inventories.

The visual representation is an approximation of state, not a 1:1 physical simulation.

## 10. Tests

Extend existing tests rather than introducing new test infrastructure.

Cover:

1. wood quantity bands produce the correct visual state;
2. quantities above 20 produce additional pile representation;
3. all existing food `ItemKind` values classified as food can be represented;
4. different food kinds remain distinguishable;
5. non-food items do not enter food-storage visuals;
6. storage visual changes when authoritative contents change;
7. storage visual never changes authoritative contents;
8. missing asset does not remove stored resources;
9. household and settlement storage use the same mechanism;
10. placement is deterministic;
11. disposal removes created visual objects.

## 11. Browser verification

Verify in the running game:

### Wood

```text
NPC gathers wood
→ carries wood
→ reaches Wood Storage
→ deposits wood
→ wood pile appears/increases

NPC takes wood
→ authoritative amount decreases
→ pile representation decreases
```

Check transitions around:

- 3 → 4;
- 7 → 8;
- 12 → 13;
- 20 → 21.

### Food

Verify:

```text
carrot → Food Storage → carrot visual
potato → Food Storage → potato visual
cabbage → Food Storage → cabbage visual
tomato → Food Storage → tomato visual
fish → Food Storage → fish visual
```

Also verify:

- multiple food kinds simultaneously;
- household storage;
- settlement storage;
- exchange delivery;
- missing visual asset behaviour;
- storage creation/removal during settlement lifecycle;
- no duplicated visuals after repeated updates;
- no visible NPC navigation obstruction;
- no meaningful FPS/draw-call regression.

## Non-goals

Do not implement:

- new storage/logistics rules;
- new inventory systems;
- nutrition;
- spoilage;
- storage capacity redesign;
- per-item physical simulation;
- item pickup/drop animations;
- new NPC behaviours;
- player-specific storage;
- new navigation or settlement-placement architecture.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
