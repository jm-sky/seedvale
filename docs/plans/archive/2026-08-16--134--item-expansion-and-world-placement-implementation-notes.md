# Implementation Notes: Item Expansion & World Placement

**Plan:** `2026-08-16--134--item-expansion-and-world-placement.md`
**Created:** 2026-08-16
**Status:** `planned` 📋

## 1. Review result

The plan is directionally correct and fits the current item architecture, but it needs several implementation constraints to avoid accidentally creating a second item/placement system or turning this into a large inventory refactor.

The current code already has the main seams required:

- `src/items/items.ts` — authoritative `ItemKind`, `ITEM_DEFS`, labels, descriptions and weight.
- `src/items/itemCatalog.ts` — gameplay flags, melee configuration, spawn category, model URL and consumables.
- `src/items/Inventory.ts` — count-based inventory keyed by `ItemKind`, with weight derived from `ITEM_DEFS`.
- `src/items/createItemSpawners.ts` — settlement-anchored one-time/renewable item placement.
- `src/terrain/chunkItems.ts` — deterministic off-settlement world item placement with stable IDs.
- `src/items/tradeCatalog.ts` — merchant stock and trade values.
- `src/ui-vue/screens/InventoryScreenItemDetails.vue` — current Item Details screen.
- `src/items/itemModels.ts` / `createItemMesh()` — GLB + procedural fallback path.

Do not introduce a generic `ItemManager`, separate item database, separate placement manager, or a new inventory representation for this plan.

## 2. Important correction: meat data model

Current `Inventory` is intentionally simple: `Map<ItemKind, number>`. Save data and UI also use `Partial<Record<ItemKind, number>>`.

Therefore do **not** implement per-stack runtime metadata such as:

```text
{ species, freshness, massPerUnit, ... }
```

for this plan. That would turn the work into an inventory/save-schema redesign.

Instead:

- use one `ItemKind` per meat species when species-specific meat is required, e.g. `deer_meat`, `wolf_meat`, `boar_meat`, `rabbit_meat`, `beef`;
- use `ITEM_DEFS[kind].weight` as the mass per inventory unit;
- let the inventory count represent quantity;
- give different species different unit weights where that makes sense;
- do **not** implement freshness/aged/spoiled state yet;
- do **not** add a freshness timer, perishables manager or new save schema in plan 134.

This still leaves a clean future seam: a later perishables/stack system can replace the simple `ItemKind -> count` representation deliberately, instead of hiding that architectural change inside an item expansion task.

If the existing animal harvest path can already provide species information, reuse it. Do not create a second animal-species lookup just for meat.

## 3. Required weapons: clarify naming

`long_sword` already exists and is fully integrated into the current melee system (`ITEM_CATALOG[kind].melee`) and has a GLB. The plan's required **short sword** is therefore a new item, not another name for `long_sword`.

Add distinct kinds only if the intended gameplay really needs both:

- `spear` / dzida — required by plan;
- `short_sword` / krótki miecz — required by plan;
- existing `long_sword` remains unchanged.

Both should use the existing `ITEM_CATALOG[].melee` structure. Do not create a parallel weapon-stat table.

A missing model must not block the item. If no GLB exists, use `modelUrl: null` and the existing procedural `createItemMesh()` fallback. For a held weapon, also make sure the existing held-tool path can safely fall back; do not add a new rendering subsystem just for these two items.

## 4. Item definition workflow

For every new item, update the existing item surfaces together:

1. `src/items/items.ts`
   - add the `ItemKind` union member;
   - add `ITEM_DEFS` entry;
   - choose category, label, description and weight.
2. `src/items/itemCatalog.ts`
   - add the catalog entry;
   - choose `holdable`, `melee`, `spawn`, `modelUrl`, notes and consumable data where relevant.
3. `docs/items/CATALOG.md`
   - update the living item catalog.
4. Add/update `docs/assets/MODELS.md` only when a genuinely new model is required or a parked/in-repo model is wired.

Keep `ITEM_DEFS` as the source of labels/weights and `ITEM_CATALOG` as the source of gameplay flags/melee/spawn/model metadata. Do not duplicate these values elsewhere.

## 5. Melee integration

The current melee source of truth is already correct:

`ITEM_CATALOG[kind].melee` → `player/playerMelee.ts`.

For spear and short sword:

- define damage/range/arc/timing/stamina in `itemCatalog.ts`;
- reuse the existing melee state machine and hit test;
- ensure `isToolKind()` / held-tool handling recognises the new holdable weapons;
- do not modify combat architecture unless an actual compatibility issue is found.

Use existing weapons as calibration references rather than inventing a new stat system.

## 6. Placement: reuse existing mechanisms

There are currently two useful placement paths and they have different responsibilities.

### Settlement items

Use `src/items/createItemSpawners.ts` for items that should be anchored to a settlement landmark:

- merchant/trader area,
- household/home,
- campfire,
- garden,
- stockpile,
- work area,
- other existing settlement anchors.

Extend the existing `SPAWN_SPECS` / landmark-based sections rather than creating a new placement manager.

### Remote/world items

Use `src/terrain/chunkItems.ts` for deterministic, non-home-chunk world finds. It already provides stable placement IDs and is worker-safe.

Do not put settlement-specific items into chunk generation merely because that is convenient. Likewise, do not create permanent world objects for generic remote collectibles when `chunkItems.ts` already provides the correct lifecycle.

### Dropped items

If an item is intentionally dropped by an actor/player, use the existing dropped-item system. Do not confuse a persistent world spawn with a dropped item.

## 7. World placement should have a reason

Prefer a small number of meaningful placements over filling the world with random pickups.

Suggested mapping:

| Item type | Preferred source/location |
|---|---|
| Meat | existing animal corpse harvest / future animal-derived production |
| Bread / food | existing merchant or settlement food source where applicable |
| Water container | existing merchant/water source flow |
| Farm/work tools | existing garden/workplace anchors |
| Spear | guard/hunter/work-related settlement placement or merchant, depending on existing world role |
| Short sword | merchant/guard/weapon-related placement; reuse existing merchant infrastructure |
| Decorative/useful props | existing settlement anchors or deterministic chunk items only when they make sense |

Do not add arbitrary item piles solely to demonstrate that the new item exists.

## 8. Merchant integration

`src/items/tradeCatalog.ts` is the existing merchant price/stock mechanism.

If plan 134 decides that an item is merchant-sold:

- add its price to `MERCHANT_PRICES`;
- add it to `MERCHANT_STOCK` when it should appear in the merchant UI;
- let `tradeValue()` continue to provide the shared fallback for unsold resources.

Do not create another price table.

Not every new item needs to be merchant stock. World/settlement provenance is preferable where a natural source already exists.

## 9. Item Details UI — current reality

`InventoryScreenItemDetails.vue` already displays:

- category,
- quantity,
- weight,
- melee damage,
- consumable action,
- equip/unequip,
- drop.

Therefore this task is an incremental extension, not a new Item Details screen.

The current melee catalog already contains:

- damage,
- range,
- arcDot,
- windUp,
- hitWindow,
- recovery,
- staminaCost.

Expose only user-facing parameters that are actually meaningful. A good initial rule is:

- all items: category, quantity, weight;
- melee items: damage, range and optionally attack speed/timing if the UI terminology is understandable;
- consumables: the existing consume action, not internal implementation values;
- merchant-valued items: price/trade value only if the existing UI has an established convention for it.

Do not dump internal fields such as `arcDot` or `hitWindow` into the UI merely because they exist in the data model.

## 10. Item image area

Add the image/render area to `InventoryScreenItemDetails.vue` using the existing item identity.

Preferred fallback order:

1. dedicated future image/render asset, when available;
2. existing category icon / current UI icon mechanism;
3. no broken-image placeholder.

Do not generate or add a new image pipeline in this plan. The component should have a small, explicit seam so a future `imageUrl`/render source can replace the fallback without redesigning the screen.

If there is no existing category icon mechanism suitable for this screen, use a simple category fallback rather than introducing a dependency-heavy icon/asset registry.

## 11. Models / parked assets

`docs/assets/MODELS.md` confirms that several assets are already in-repo and that the Medieval Village MegaKit is parked. The parked kit should be treated as a source to inspect, not a requirement to wire many assets.

Important existing item assets include:

- knife,
- long sword,
- shovel,
- axe,
- pitchfork,
- sickle,
- wooden torch,
- pickaxe,
- branch.

Food/waterskin currently use procedural fallbacks and are intentionally listed as `needed` in the model backlog.

Before adding a model dependency:

- inspect `public/models/` and parked assets;
- reuse a suitable existing model if one is actually appropriate;
- if no suitable asset exists, keep the item functional with the existing procedural fallback;
- update `docs/assets/MODELS.md` only when the status genuinely changes or a new asset is required.

Do not spend implementation time wiring unrelated MegaKit props.

## 12. Recommended implementation order

### Phase A — inventory/catalog foundations

- inspect the final desired item set and avoid arbitrary 20-item padding;
- add new `ItemKind`s and `ITEM_DEFS` entries;
- add matching `ITEM_CATALOG` entries;
- add species-specific meat kinds if chosen;
- assign sensible weights and descriptions;
- update `docs/items/CATALOG.md`.

### Phase B — gameplay integration

- add spear and short sword to the existing holdable/melee path;
- reuse `ITEM_CATALOG[].melee`;
- connect food/meat items to existing consumption/cooking/harvest mechanisms only where a direct existing seam exists;
- add merchant entries only for items intentionally sold by the existing merchant.

### Phase C — world placement

- add settlement placements through `createItemSpawners.ts`;
- add deterministic remote placements through `chunkItems.ts` only where appropriate;
- use existing anchors and placement helpers;
- ensure new permanent world placements have stable IDs if they participate in collection/save semantics.

### Phase D — Item Details

- extend `InventoryScreenItemDetails.vue` with meaningful conditional stats;
- add the future image area with a safe fallback;
- keep the current Vue/DOM architecture intact.

### Phase E — documentation + verification

- update `docs/items/CATALOG.md`;
- update `docs/assets/MODELS.md` only if needed;
- run TypeScript, lint, build and tests;
- for visual/world-placement changes, treat browser/manual verification separately from technical verification.

## 13. Scope guardrails

Do **not** include in plan 134 unless the current code makes it trivial and directly necessary:

- full item-instance/stack metadata architecture;
- freshness/perishables simulation;
- durability/repair;
- generalized crafting;
- NPC equipment/inventory overhaul;
- new world-item persistence architecture;
- multiplayer changes;
- new asset-loading architecture;
- a generic item-placement framework;
- a new merchant/economy system.

If one of these becomes necessary, record it in `docs/plans/LOOSE-ENDS.md` and keep plan 134 focused.

## 14. Verification checklist

- `ItemKind`, `ITEM_DEFS` and `ITEM_CATALOG` agree for every new item.
- Existing inventory save/load remains compatible; no unnecessary save migration is introduced.
- Spear and short sword can exist in inventory without a GLB.
- If held, spear and short sword use the existing held-tool and melee systems.
- Meat species, if added, use ordinary `ItemKind` counts and weights; no hidden per-stack metadata is introduced.
- Merchant additions, if any, use `tradeCatalog.ts`.
- Settlement placement uses `createItemSpawners.ts` and existing anchors.
- Remote deterministic placement uses `chunkItems.ts` where appropriate.
- Item Details shows only relevant parameters.
- Item Details has a safe image/icon fallback.
- No duplicate item or placement system was introduced.
- `docs/items/CATALOG.md` reflects the resulting item set.
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `npm run test`
- Visual/world placement changes are additionally browser/manual verified according to `CLAUDE.md`.

## 15. Expected implementation shape

The ideal implementation should mostly be additive changes to existing item definitions/catalogs, existing placement functions, existing merchant data and the existing Item Details component.

If implementation starts requiring a large refactor of `Inventory`, persistence, world lifecycle or rendering, stop and reassess the scope before proceeding. The current architecture already provides enough seams for a useful first expansion without such a refactor.

## 16. What actually landed (2026-08-16)

10 new `ItemKind`s, purely additive — no `Inventory`/persistence/save-schema change (`Partial<Record<ItemKind, number>>` stayed untouched):

- **Weapons (required):** `spear`, `short_sword` — `ITEM_CATALOG[].melee` (spear: dmg 20/range 3.0/narrow thrust arc; short_sword: dmg 18/range 2.1, lighter/faster than `long_sword`); `HeldTool.ts`'s `ToolKind`/`HELD_TOOL_KINDS` and `heldToolVisual.ts`'s `HELD_ATTACH` extended (same grip families as pitchfork/long_sword); `faunaCombat.ts`'s `MeleeToolKind` extended. No GLB (`modelUrl: null`) — `createItemMesh()` procedural fallback covers ground/held mesh, `docs/assets/MODELS.md` M38. Sold via `tradeCatalog.ts` (`MERCHANT_PRICES`/`MERCHANT_STOCK`), same "Kupiec only, no free world spawn" precedent as `long_sword`.
- **Species meat:** `deer_meat`/`wolf_meat`/`boar_meat`/`rabbit_meat`/`beef`, one `ItemKind` per species (no per-stack species/freshness metadata, per §2 of this doc). `createApp.ts`'s `startHarvestMeat` maps `AnimalAgent.def.kind` → item kind via a local `MEAT_KIND_BY_ANIMAL` lookup; species without an explicit entry (fox/stag/duck/horse/donkey/sheep/chicken) keep the original generic `raw_meat`. Unit weight/hunger relief scaled to animal size (rabbit lightest/least filling, beef heaviest/most filling). All five cook to the existing `roasted_meat` at a campfire (`campfireCooking.ts` — 5 new `COOKING_RECIPES` rows, same output, no new roasted variant per species).
- **Hide:** `hide` — secondary yield from the same `startHarvestMeat` action (any species), added only if it still fits under `maxWeight` after the meat (sequential `canAdd` checks, no combined-weight helper needed since `Inventory.canAdd` reads live `totalWeight()`). Not merchant stock; barters via the existing `tradeValue()` weight-based fallback.
- **Other food:** `cheese`, `dried_meat` — Kupiec-only (`MERCHANT_PRICES`/`MERCHANT_STOCK`), same shape as `bread`.
- **World placement:** deliberately **no changes** to `createItemSpawners.ts` or `chunkItems.ts` — every new item is `spawn: 'none'` (merchant stock or harvest byproduct), which is the established pattern for `long_sword`/`bread`/`tent`. Avoids inventing settlement anchors or chunk-placement rules not called for by the item's actual source.
- **Item Details UI:** `InventoryScreenItemDetails.vue` now shows a "Wartość" (trade value) stat for every item, and conditionally shows Obrażenia/Zasięg/"Szybkość ataku" (derived bucket: szybki/średni/wolny from windUp+hitWindow+recovery, not raw internal fields) for melee items and "Efekt" for consumables — the old always-visible "Obrażenia: Nie dotyczy" row is gone. Added an image-area seam (`imageUrl` computed, currently always `null`) that falls back to a category icon from `lucide-vue-next` (already a project dependency) — no new icon/asset registry.

**Verification:** `npx tsc --noEmit` ✅, `npm run test` ✅ (852 tests, no regressions), `npm run build` ✅ (`vue-tsc` + `vite build`). No browser/gameplay verification performed, per this session's instructions — left to manual playtest.

## 17. Models wired (2026-08-19)

M38: `spear.glb` / `short_sword.glb` from Quaternius Medieval Weapons Pack (`Spear`, `Sword`). OBJ→GLB + meshopt. Grip still uses pitchfork / short-sword family attach — not browser-verified.
