# Implementation notes: items-player-031 armor category and character defense summary

## Current verified state

### Armor category

`src/items/items.ts`

- `ItemCategory` currently has exactly: `resource | tool | utility | food | weapon | knowledge`.
- `CATEGORY_SORT_ORDER` in the same file is currently `weapon, tool, knowledge, food, utility, resource` and drives `primaryItemCategory()`.
- `leather_armor` and `chainmail` are still declared with `categories: ['weapon']`.
- `src/items/itemInstances.ts` confirms these are currently the only implemented armor kinds: `ArmorKind = 'leather_armor' | 'chainmail'` and `ARMOR_KIND_LIST` contains only those two.

Do not infer gameplay armor from the new category. `isArmorKind()`, `ITEM_CATALOG[kind].armor`, armor instances and `EquipmentState` remain authoritative for equipment mechanics.

### Exhaustive/static category consumers found

Update these verified consumers when adding `armor`:

- `src/ui-vue/composables/useItemCategoryLabels.ts` — shared category wording; currently a plain object with six keys.
- `src/ui-vue/screens/InventoryScreenItemList.vue` — local `CATEGORY_ORDER: readonly ItemCategory[]` currently omits armor.
- `src/ui-vue/screens/InventoryScreenItemDetails.vue` — `CATEGORY_ICON: Record<ItemCategory, Component>`.
- `src/ui-vue/components/MerchantItemDetailsModal.vue` — another `CATEGORY_ICON: Record<ItemCategory, Component>`.
- `src/ui-vue/components/MerchantFilterBar.vue` — explicit `categoryChips`; add `armor` here.
- `src/items/items.ts` — `CATEGORY_SORT_ORDER` used by `primaryItemCategory()`.

Before editing, one focused search for `ItemCategory`, `Record<ItemCategory`, `CATEGORY_ORDER`, `categoryChips` and explicit six-category text is still warranted because the TypeScript union expansion can expose additional current consumers. Do not do a repository-wide redesign.

`src/ui-vue/composables/useMerchantTradeState.ts` already defines `CategoryFilter = 'all' | ItemCategory`, and `matchesCategory()` delegates to the caller-provided category predicate. No merchant-state redesign is needed. `MerchantScreen.vue` already calls this for both BUY (`MERCHANT_STOCK`) and OFFER (`offerableKinds`) using `hasItemKindCategory`, so adding the chip plus changing item metadata should make both sides work through the existing path.

`src/items/tradeCatalog.ts` already includes `leather_armor` and `chainmail` in `MERCHANT_STOCK`. Do not add a second armor stock list or change pricing as part of this plan.

## Character Screen presentation path

The verified presentation path is:

```text
createApp.ts open-time refresh
       +
gameLoop.ts while Character Screen is open
        ↓
buildCharacterPresentation(...)
        ↓
Hud.setCharacterStats(...)
        ↓
ui-vue/store.ts#setCharacterStats
        ↓
ui.characterScreen.presentation
        ↓
CharacterScreen.vue
```

`src/player/characterPresentation.ts` owns the existing `CharacterPresentation` DTO and builder. It currently contains only:

- `attributes`,
- `skills`,
- `conditions`.

This is the right existing presentation boundary to extend. Keep Vue passive.

### Recommended presentation additions

Extend `CharacterPresentation` with an equipment view rather than adding a second top-level store subsystem. A small shape is enough, conceptually:

```ts
type CharacterEquipmentSlotView = {
  slot: EquipmentSlot
  itemLabel: string | null
  qualityLabel: string | null
}

type CharacterEquipmentView = {
  damageReduction: number
  attackStaminaDelta: number
  meleeRecoveryDelta: number
  movementSpeedDelta: number
  sprintStaminaDelta: number
  slots: readonly CharacterEquipmentSlotView[]
}
```

Store normalized numeric deltas, not preformatted strings. `CharacterScreen.vue` should only format percentages and labels.

The aggregate values must come from the existing `EquipmentModifiers` semantics:

```text
damageReduction     = 1 - incomingDamageMultiplier
attackStaminaDelta  = meleeStaminaMultiplier - 1
meleeRecoveryDelta  = meleeRecoveryMultiplier - 1
movementSpeedDelta  = movementSpeedMultiplier - 1
sprintStaminaDelta  = sprintStaminaMultiplier - 1
```

Do not recompute piece composition or quality effects in `characterPresentation.ts`/Vue.

### Reuse the already-resolved frame modifiers

`src/app/gameLoop.ts` already calls `resolveEquipmentModifiers(equipment, inventory)` once per frame and reuses that result for armor effects across gameplay. When building Character Screen presentation in that same frame, pass/reuse this existing `equipmentModifiers` value rather than resolving equipment a second time.

The open-time refresh in `src/app/createApp.ts` is a separate path. It currently builds `CharacterPresentation` directly when the Character Screen is opened. That path must supply the same equipment presentation data so opening the screen does not briefly show stale/default armor state. It can resolve current equipment once at open time because no per-frame resolved value is available there.

Keep both call sites producing the same DTO through one shared presentation builder/helper.

## Equipped slot projection

`src/items/equipment.ts` already provides the live-valid ownership/reference helpers needed for presentation:

- `EQUIPMENT_SLOTS`,
- `equippedArmorInstances(...)`,
- `equippedInstanceId(...)`,
- `equippedInstanceIds(...)`,
- `resolveEquipmentModifiers(...)`,
- `resolveArmorInstanceEffective(...)`.

Equipment stores only instance IDs; `Inventory` remains the item owner.

For Character Screen slot rows, resolve each slot against the live inventory and project only:

- slot,
- player-facing item name,
- quality label.

Use existing sources:

- `itemDisplayName(kind)` for names,
- `ARMOR_QUALITY_LABELS[quality]` for quality,
- `EQUIPMENT_SLOTS` for deterministic six-slot order.

Do not copy `InventoryGroupView` into Character Screen and do not use `ui.inventory.equippedSlots` as the source of truth for this builder; that object is already a UI snapshot. Build Character Screen from authoritative `EquipmentState + Inventory`.

### Slot labels

`src/items/inventoryView.ts` currently has a private `ARMOR_SLOT_LABEL` map (`Głowa`, `Tułów`, `Ramiona`, `Dłonie`, `Nogi`, `Stopy`). Character Screen needs the same wording.

Avoid creating a second drifting translation table in Vue. Prefer extracting/exporting one small shared equipment-slot label map/helper in an appropriate items/presentation module and reuse it from `inventoryView.ts` plus Character Screen presentation. Keep this extraction narrow; do not refactor unrelated inventory presentation.

## Important store pitfall

`src/ui-vue/store.ts#setCharacterStats()` only replaces `c.presentation` when:

```ts
sameCharacterPresentation(c.presentation, stats.presentation) === false
```

`sameCharacterPresentation()` manually compares attributes, skills and conditions today.

When `CharacterPresentation` gains `equipment`, extend this comparator to include:

- all five aggregate equipment numbers,
- six slot rows in stable `EQUIPMENT_SLOTS` order,
- each slot's item/quality identity or display fields.

Without this change, equipping/unequipping armor while Character Screen is open can be suppressed as an apparently unchanged presentation snapshot.

Do not replace the comparator with JSON serialization; preserve the current cheap explicit comparison pattern.

`setCharacterStats()` already supports presentation arrays being supplied only on open/open-screen refresh. Preserve that lifecycle rather than introducing another reactive equipment watcher.

## CharacterScreen.vue

`src/ui-vue/screens/CharacterScreen.vue` is presentation-only today. Add one `CharacterSection` for `Pancerz` (preferred over generic `Obrona`).

Render:

1. aggregate passive armor effects,
2. a six-row equipped-slot list.

Neutral equipment should remain visible (`0%` deltas and empty slot rows). This makes before/after comparison obvious and avoids conditional layout changes.

For percentage semantics, be careful with sign wording:

- damage reduction: positive protection (`31%`),
- attack stamina/recovery/sprint cost multipliers above `1` are penalties (`+12%` etc.),
- movement multiplier below `1` is a speed loss and should display naturally as a negative delta (`-6%`).

Do not include active held-item block/Defense skill in this section.

## Existing armor item detail presentation to reuse conceptually

`src/items/inventoryView.ts#buildArmorGroup()` already proves the correct source chain for per-instance armor UI:

```text
ArmorItemInstance quality
+ ITEM_CATALOG[kind].armor
+ ITEM_DEFS[kind].weight
→ resolveEffectiveArmorPiece(...)
→ UI row
```

It also already uses `ARMOR_QUALITY_LABELS`. Do not duplicate any quality math for Character Screen. Character Screen aggregate numbers come from `resolveEquipmentModifiers()`; slot rows only need identity/quality.

## Tests / focused verification seams

Prefer extending existing tests rather than adding broad UI component tests unless current conventions already support them.

Useful seams:

- `src/player/characterPresentation.test.ts` — extend builder tests with neutral and non-neutral equipment presentation plus deterministic six-slot projection.
- existing item/equipment tests around `resolveEquipmentModifiers()` — no need to retest its composition mathematics here; only assert the presentation projection reflects its supplied result.
- item/category tests (or the nearest existing `items.ts` tests) — verify `leather_armor`/`chainmail` are `armor`, not `weapon`, and `primaryItemCategory()` resolves `armor`.
- merchant state tests, if present — one focused `matchesCategory()`/BUY-OFFER semantic check is sufficient because both views already share the generic predicate path.

Compiler exhaustiveness on `Record<ItemCategory, ...>` is useful verification after the union expansion; do not weaken those mappings to `Partial` just to silence errors.

## Documentation updates

`docs/items/CATALOG.md` explicitly documents the six current inventory categories and must be updated to include `armor`.

`docs/state/player-systems.md` currently describes Character Screen as HP/needs + SPEA + skills + conditions + reputation. Update that sentence/section to include the armor/equipment summary after implementation.

If `docs/state/combat.md` explicitly describes armor UI/category behavior, update only the affected statement; do not rewrite combat docs.

## Suggested implementation order

1. Add `armor` to `ItemCategory`, category sort order and armor item metadata.
2. Fix all compile-time/static category consumers (labels, icons, Inventory order, Merchant chips).
3. Add/reuse shared equipment-slot labels.
4. Extend `CharacterPresentation` with equipment projection helper/types.
5. Wire `gameLoop.ts` using the already-resolved `equipmentModifiers`.
6. Wire `createApp.ts` open-time refresh with the same presentation builder.
7. Extend `sameCharacterPresentation()`.
8. Render the `Pancerz` section in `CharacterScreen.vue`.
9. Add focused tests and update docs.

## Guardrails discovered during recon

- Only `leather_armor` and `chainmail` are implemented armor kinds now; do not invent the planned head/arms/hands/legs/feet item kinds in this task.
- The six equipment slots exist even when only body armor items exist. Character Screen should still render all six slots as empty/body-filled accordingly.
- Do not use the item category as an equipment eligibility check.
- Do not read `ui.inventory` from Character Screen presentation builders.
- Do not resolve aggregate equipment twice per frame in `gameLoop.ts`.
- Do not create a second merchant category/filter mechanism.
- Do not move equipment ownership into UI state.
- Do not change armor balance values.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
