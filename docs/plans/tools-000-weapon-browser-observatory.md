# Plan: Weapon Browser — Observatory/Admin

**Created:** 2026-08-19
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** none
**Domain:** `tools`  
**Tags:** [items-player]

## Goal

Add a dedicated **Weapon Browser** in the Observatory/Admin area. The first version is a developer/debug tool, but its UI should not prevent a later player-facing catalog.

The browser must show **all defined weapons**, not only weapons currently present in the world.

Use existing item data as the source of truth. Do not create a parallel weapon-stat registry. The current `ITEM_CATALOG` already contains the melee configuration used by combat.

## Scope

### 1. Weapon discovery

Derive the weapon list from the existing item catalog and current semantics. In particular, `melee !== null` is the initial candidate for identifying melee weapons.

Before implementation, verify whether the current model distinguishes weapons from tools that merely deal melee damage. Do not add a second classification only for the browser unless the existing domain model genuinely requires it.

### 2. Dedicated Vue screen

Add a dedicated Vue screen using the existing UI/navigation architecture.

The screen should contain:

- header and count of matching/all weapons;
- text search;
- filters;
- sorting;
- weapon list/table;
- details panel for the selected weapon.

Do not implement 3D preview in this plan.

### 3. Search

Search case-insensitively by:

- weapon name/label;
- description/notes;
- optionally `kind` for developer convenience.

### 4. Filters

Support filters for the requested fields where they exist in the current data model:

- type;
- weight;
- damage;
- range;
- price.

Also inspect the current model for useful existing fields such as:

- stamina cost;
- wind-up/recovery;
- block capability;
- spawn/acquisition mode;
- model availability;
- attack arc.

Do not extend the item model merely to manufacture additional browser filters.

### 5. Sorting

Support sorting at minimum by:

- name;
- damage;
- range;
- weight, when available;
- price, when available;
- stamina cost;
- attack timing/recovery.

Default: name ascending.

Sorting operates on the filtered result set.

### 6. List/table

Show the most useful fields without opening details, approximately:

- Name;
- Type;
- Damage;
- Range;
- Weight;
- Price;
- Stamina;
- Defense;
- Model availability.

Only show fields that actually exist in the current model.

### 7. Details

The selected weapon should expose the complete available catalog data, grouped into:

- basic information;
- combat;
- defense;
- acquisition/spawn;
- asset/model;
- notes;
- roadmap, when present.

For melee combat, show the existing parameters such as damage, range, arc, wind-up, hit window, recovery and stamina cost.

Do not invent aggregate weapon ratings or derived balancing scores.

### 8. Observatory/Admin integration

Add the screen to the existing navigation/screen mechanism.

Do not implement the whole World Observatory as part of this plan. The browser should be an independently usable module that can later sit under an `Items → Weapons` section.

### 9. Future 3D preview

Do not add a GLB loader or Three.js preview scene now.

Keep using the existing `modelUrl` so a later preview can consume the same data without introducing another asset mapping.

### 10. Reuse without premature framework work

Use existing Vue/Tailwind components and conventions.

Keep filtering/sorting logic separable enough that later item browsers can reuse proven pieces, but do **not** build a generic Browser/Inspector framework in advance.

### 11. Tests

Add focused tests for pure browser data logic where the existing test setup supports it:

- search by name;
- search by description;
- individual filters;
- combined filters;
- sorting;
- missing optional values.

Avoid brittle Vue snapshots.

## Likely files/systems to inspect

Confirm current paths and ownership before editing:

- `src/items/itemCatalog.ts`;
- `src/items/items.ts`;
- `src/ui-vue/App.vue`;
- `src/ui-vue/screens/`;
- existing screen/navigation mechanisms;
- existing Vue list/table/filter components;
- `docs/items/CATALOG.md`;
- `docs/STATE.md`;
- `CLAUDE.md`.

## Implementation sequence

1. Inspect current item/weapon definitions and UI screen/navigation ownership.
2. Define a read-only browser view model derived from the existing item catalog, without duplicating authoritative stats.
3. Implement search, filtering and sorting as focused pure logic.
4. Add the Vue screen and weapon list/details UI.
5. Integrate the screen into the existing Observatory/Admin navigation.
6. Add focused tests.
7. Run TypeScript/build/tests and browser verification.

## Verification

### Automated

- TypeScript/build/tests pass.
- Browser list contains every currently defined weapon.
- Browser data is derived from the authoritative item catalog.
- Search works by name and description.
- Filters can be combined.
- Sorting works for available fields.
- Missing optional values do not break sorting/filtering.
- Browser logic does not mutate simulation/item state.

### Browser/manual

- Open the Weapon Browser through its navigation entry.
- Confirm all defined weapons are visible.
- Search by weapon name and text from its notes/description.
- Combine several filters.
- Change sort field and direction.
- Select a weapon and inspect its complete details.
- Confirm weapons without a model do not cause UI errors.
- Confirm the browser remains read-only and does not affect simulation state.

## Non-goals

- `docs/items/WEAPONS.md` generator — separate plan.
- 3D weapon preview.
- Editing/creating weapons from the browser.
- Player-facing catalog in this iteration.
- Changes to combat mechanics or balancing.
- New weapon statistics introduced solely for UI purposes.
- Generic browser framework for all item categories.

## Expected outcome

Seedvale has a dedicated Weapon Browser that makes the complete current weapon catalog easy to inspect, search, filter and sort while reading the same authoritative data used by gameplay.

The design leaves room for later `Items`, `Resources` or other Observatory browsers and for a future 3D weapon preview without creating parallel sources of truth.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
