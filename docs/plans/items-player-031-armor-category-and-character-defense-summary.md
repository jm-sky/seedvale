# Plan: Armor category and character defense summary

**Created:** 2026-09-12
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** items-player-030
**Domain:** `items-player`
**Type:** `feature`
**Subdomains:** `inventory` `items`
**Tags:** `armor` `equipment` `inventory` `merchant` `character-screen`
**Roadmap:** -
**Model:** Sonnet, Composer

## Goal

Finish the player-facing integration of wearable armor by:

1. introducing `armor` as a first-class item category instead of classifying protective equipment as weapons,
2. exposing that category consistently in Inventory and Merchant UI,
3. showing the player's complete effective armor/equipment state on Character Screen.

Do not introduce another equipment-stat system.

The existing equipment resolver remains authoritative:

```text
equipped armor instances
→ effective armor pieces
→ resolveEquipmentModifiers()
→ effective player equipment modifiers
→ gameplay + Character Screen presentation
```

## Current architecture / recon

### Armor is currently categorized as weapon

`src/items/items.ts` currently defines `ItemCategory` without `armor`.

Implemented armor such as `leather_armor` and `chainmail` currently uses:

```ts
categories: ['weapon']
```

This makes wearable armor appear under the weapon category in player-facing item UIs.

### Inventory category presentation

`src/ui-vue/screens/InventoryScreenItemList.vue` owns explicit category ordering and exposes filters based on categories present in the current inventory.

Shared player-facing category labels are provided by:

```text
src/ui-vue/composables/useItemCategoryLabels.ts
```

Item details and other item presentation code contain exhaustive `ItemCategory` mappings such as category icons. Introducing `armor` requires updating all such mappings and static category lists, not only the two currently known screens.

### Merchant category presentation

`src/ui-vue/components/MerchantFilterBar.vue` explicitly defines merchant category chips.

Armor is already part of normal merchant stock through `src/items/tradeCatalog.ts` / `MERCHANT_STOCK`, so this plan must not create a separate armor shop, stock source or pricing mechanism.

The missing behavior is semantic filtering/presentation:

```text
Pancerze
→ leather armor
→ chainmail
→ future armor kinds
```

instead of grouping those items under weapons.

Both BUY and OFFER merchant views must use the new category consistently.

### Existing armor stat ownership

`src/items/equipment.ts` already owns aggregate equipment effects through:

```ts
resolveEquipmentModifiers(equipment, inventory): EquipmentModifiers
```

with:

```ts
type EquipmentModifiers = {
  incomingDamageMultiplier: number
  meleeStaminaMultiplier: number
  meleeRecoveryMultiplier: number
  movementSpeedMultiplier: number
  sprintStaminaMultiplier: number
}
```

This is the authoritative aggregate representation of currently equipped armor.

Individual armor effective values already use the shared armor/equipment resolver and are exposed through inventory item-instance presentation.

Character Screen must reuse the aggregate equipment result rather than recomputing equipped pieces, armor quality or composition in Vue.

### Character Screen

`src/ui-vue/screens/CharacterScreen.vue` currently presents player condition/resources, physical attributes, skills, health conditions, reputation and renown.

It does not expose equipment-derived defensive/mobility statistics or the full worn armor slot state.

Preserve the existing Character Screen data path:

```text
player/equipment state
→ app/UI wiring
→ ui.characterScreen
→ CharacterScreen.vue
```

Vue must not access or own mutable gameplay equipment state directly.

## Architecture

### 1. Introduce `armor` as an item category

Extend `ItemCategory` with:

```ts
'armor'
```

All currently implemented wearable armor ItemKinds should use this category instead of `weapon`.

Initially this includes at least:

```text
leather_armor
chainmail
```

and any other wearable armor kinds already implemented when this plan is executed.

Future armor ItemKinds should naturally use the same category.

Do not identify armor in UI through hard-coded ItemKind lists when the item category already expresses the semantic grouping.

### 2. Keep armor mechanics separate from item category

`armor` is inventory/trade presentation metadata.

It must not become the gameplay discriminator for wearable equipment.

Gameplay continues using the existing armor/equipment mechanisms such as:

```text
ITEM_CATALOG[kind].armor
isArmorKind(...)
ArmorItemInstance
EquipmentState
```

as appropriate.

Therefore:

```text
ItemCategory.armor
≠ wearable-equipment gameplay discriminator
```

### 3. Inventory integration

Update existing Inventory presentation to support a `Pancerze` category.

Include armor in deterministic category ordering, preferably:

```text
weapon
armor
tool
knowledge
food
utility
resource
```

Reuse `useItemCategoryLabels()` for wording.

Update every exhaustive category/icon mapping so armor has an appropriate visual identity, preferably a shield/armor icon where an existing Lucide icon fits.

Do not create an armor-specific inventory screen.

### 4. Merchant integration

Extend the existing Merchant category filter with `Pancerze`.

The normal `hasItemKindCategory(...)` path should make armor filtering work automatically once armor ItemKinds use the new category.

The filter must work in both:

```text
BUY
OFFER
```

Do not:

- create separate armor merchant stock,
- create armor-specific trade calculations,
- duplicate filtering logic,
- special-case `leather_armor` or `chainmail` in Merchant UI.

Existing merchant stock, pricing and transaction systems remain unchanged.

### 5. Character Screen equipment summary

Add a Character Screen section titled `Pancerz` or `Wyposażenie`.

Avoid the generic title `Obrona`, because it could imply active blocking, Defense skill or situational combat state.

The section should show the combined effective result of all currently equipped armor.

Minimum aggregate statistics:

```text
Redukcja obrażeń
Koszt kondycji ataku
Odnowienie / tempo ataku
Prędkość ruchu
Koszt sprintu
```

Example:

```text
Pancerz

Redukcja obrażeń        31%
Koszt kondycji ataku   +12%
Odnowienie ataku        +8%
Prędkość ruchu           -6%
Koszt sprintu           +10%
```

Exact labels may be adjusted to existing Polish UI terminology.

### 6. Show equipped armor slots

The same Character Screen section should expose the current six-slot armor state from the existing equipment model:

```text
Głowa
Tułów
Ramiona
Dłonie
Nogi
Stopy
```

Example:

```text
Wyposażone:
Głowa                   —
Tułów                   Kolczuga · Dobra
Ramiona                 —
Dłonie                  —
Nogi                    —
Stopy                    —
```

When available, show player-facing item name and quality for the equipped physical instance.

Do not create a second equipment ownership model for this presentation.

### 7. Derive Character Screen data outside Vue

Character Screen must receive a presentation-oriented DTO derived from existing authoritative equipment state.

Prefer explicit display semantics instead of leaking raw mutable gameplay state into Vue, conceptually:

```ts
type CharacterEquipmentPresentation = {
  damageReduction: number
  attackStaminaDelta: number
  meleeRecoveryDelta: number
  movementSpeedDelta: number
  sprintStaminaDelta: number
  slots: readonly CharacterEquipmentSlotPresentation[]
}
```

Exact naming may follow existing UI-store conventions.

The aggregate values must ultimately come from the same result as:

```ts
resolveEquipmentModifiers()
```

Conceptually:

```text
damage reduction
= 1 - incomingDamageMultiplier

attack stamina delta
= meleeStaminaMultiplier - 1

recovery delta
= meleeRecoveryMultiplier - 1

movement delta
= movementSpeedMultiplier - 1

sprint stamina delta
= sprintStaminaMultiplier - 1
```

Formatting percentages belongs to presentation.

Composition and gameplay mathematics remain exclusively in the equipment layer.

Do not:

```text
iterate equipped armor in Vue to calculate protection
reimplement quality modifiers
multiply protection values in CharacterScreen.vue
inspect ItemKinds to infer aggregate protection
```

### 8. Reuse Character Screen refresh lifecycle

Extend the existing Character Screen presentation state and refresh path.

The values should be:

- populated when Character Screen opens,
- refreshed through the same existing Character Screen update lifecycle,
- representative of currently equipped armor.

Avoid adding a separate per-frame synchronization mechanism solely for armor stats.

### 9. Neutral / unarmored state

The Character Screen section should remain visible and useful when no armor is equipped.

Neutral equipment should naturally present as zero deltas, for example:

```text
Redukcja obrażeń       0%
Koszt kondycji ataku   0%
Odnowienie ataku       0%
Prędkość ruchu         0%
Koszt sprintu          0%
```

and all equipment slots should show empty state.

This lets the player directly compare before/after equipping armor.

### 10. Do not mix active defense into armor summary

Wearable passive armor and active held-item defense are separate existing mechanisms.

The Character Screen equipment summary represents persistent equipment-derived modifiers only.

Do not calculate a single hypothetical total defense combining:

```text
active blocking
+ armor
+ situational combat state
```

`Redukcja obrażeń` therefore means passive reduction from currently equipped wearable equipment.

## Relevant files / systems

Expected primary integration points:

```text
src/items/items.ts
  ItemCategory
  ITEM_DEFS
  primaryItemCategory()
  category sort order

src/items/equipment.ts
  EquipmentModifiers
  resolveEquipmentModifiers()
  equipped instance/slot helpers

src/items/tradeCatalog.ts
  MERCHANT_STOCK — verify only; no new stock mechanism expected

src/ui-vue/composables/useItemCategoryLabels.ts
  category labels

src/ui-vue/screens/InventoryScreenItemList.vue
  category filtering/sorting

src/ui-vue/screens/InventoryScreenItemDetails.vue
  exhaustive category/icon mapping

src/ui-vue/components/MerchantFilterBar.vue
  merchant category chips

src/ui-vue/components/MerchantItemDetailsModal.vue
  verify/update exhaustive category/icon mapping if applicable

src/ui-vue/store.ts
  Character Screen presentation state

src/ui-vue/screens/CharacterScreen.vue
  equipment summary presentation

src/app/createApp.ts and/or existing Character Screen update wiring
  derive/push effective equipment presentation

docs/items/CATALOG.md
  documented item-category list
```

Before implementation, search for all exhaustive `ItemCategory` records, switches and static category arrays so the new union member cannot leave hidden stale UI mappings.

Follow current code if exact Character Screen wiring has moved since this plan was written.

## Scope

Implement:

1. `armor` ItemCategory,
2. migrate implemented wearable armor ItemKinds from `weapon` to `armor`,
3. shared Polish category label for armor,
4. Inventory armor filter and deterministic sorting,
5. armor icon support in exhaustive category mappings,
6. Merchant armor filter in BUY and OFFER,
7. Character Screen aggregate equipment summary,
8. Character Screen six-slot equipped armor presentation,
9. presentation DTO derived outside Vue from existing equipment state,
10. neutral unarmored presentation,
11. tests for category semantics and aggregate display-data derivation where existing test seams permit,
12. update `docs/items/CATALOG.md` and other state/docs that explicitly enumerate item categories,
13. JSDoc with `@domain items-player` for any new important public equipment-presentation resolver introduced for UI consumption.

## Non-goals

Do not implement:

- new armor pieces,
- armor crafting,
- armor durability,
- repair,
- armor penetration,
- damage types,
- hit locations,
- shields,
- active-block redesign,
- NPC armor selection,
- NPC equipment UI,
- separate equipment screen,
- visual armor attachment,
- new merchant inventory ownership,
- merchant armor quality generation,
- new armor-stat mathematics,
- rebalance of existing leather/chainmail values.

## Guardrails

- `Inventory` remains sole owner of item instances.
- `EquipmentState` remains sole owner of worn-item references.
- `resolveEquipmentModifiers()` remains the authoritative aggregate gameplay derivation.
- Item category is presentation metadata, not a gameplay armor discriminator.
- Character Screen receives derived presentation data rather than gameplay state ownership.
- Vue must not calculate armor composition.
- Merchant keeps existing stock/pricing/transaction paths.
- Do not duplicate category labels between Inventory and Merchant.
- Do not special-case current armor ItemKinds in filtering logic.
- Preserve the existing six-slot/multi-piece armor model from `items-player-030`.
- Avoid unrelated Inventory, Merchant, combat or Character Screen refactors.

## Verification

### Automated

Verify:

- `armor` is a valid `ItemCategory`,
- all currently implemented wearable armor kinds use `armor`,
- wearable armor is no longer presented as `weapon`,
- `primaryItemCategory()` resolves armor correctly,
- Inventory category sorting handles armor deterministically,
- merchant category matching returns armor for `armor` and excludes it from `weapon`,
- BUY and OFFER use the same armor category semantics,
- category label/icon mappings are exhaustive,
- aggregate Character Screen values originate from existing equipment modifiers,
- neutral equipment produces zero player-facing deltas,
- Character Screen slot presentation points at the same live equipped instances as `EquipmentState`,
- multiple equipped pieces produce the same aggregate result in Character Screen as gameplay's `resolveEquipmentModifiers()`,
- quality differences remain reflected through the existing resolver without UI-specific quality calculations.

### Manual browser verification by User

Verify:

1. open Inventory with armor and weapons present:
   - `Pancerze` appears,
   - armor is under `Pancerze`,
   - swords/bows remain under `Broń`;

2. open Merchant:
   - `Pancerze` filter appears when relevant,
   - leather armor / chainmail are correctly filtered in BUY,
   - owned armor is correctly filtered in OFFER,
   - purchase/sale behavior remains unchanged;

3. open Character Screen without armor:
   - equipment section shows neutral values,
   - all six slots show empty state;

4. equip leather armor:
   - passive damage reduction and penalties update,
   - correct slot/item/quality appears;

5. replace it with chainmail:
   - displayed values change consistently with the stronger/heavier armor;

6. equip multiple armor pieces when available:
   - Character Screen shows aggregate effects and each occupied slot;

7. remove/sell/drop equipped armor:
   - summary and slot presentation return to the correct remaining/neutral state;

8. save/load equipped armor:
   - Character Screen values and slot presentation match restored equipment.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
