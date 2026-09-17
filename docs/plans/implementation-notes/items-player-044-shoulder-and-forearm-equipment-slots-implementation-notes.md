# Implementation notes: Shoulder and forearm equipment slots

**Plan:** `items-player-044-shoulder-and-forearm-equipment-slots.md`

## Verified current contracts

### Equipment state

`src/items/equipment.ts` is the authoritative wearable-state owner. Today it defines:

```ts
export type EquipmentSlot = 'head' | 'body' | 'arms' | 'hands' | 'legs' | 'feet'
```

`EquipmentState.equip()` does not hardcode armor kinds: it resolves the target slot from `ITEM_CATALOG[instance.kind].armor.slot`, clears only that slot and stores the owned instance id. `equippedArmorInstances()` and `resolveEquipmentModifiers()` iterate all `EQUIPMENT_SLOTS`, so adding `shoulders` + `forearms` should reuse those generic paths.

Do not add a second state object for accessories.

### Why `arms` must be replaced, not reused

`items-player-039` made four pauldron kinds normal armor pieces in `arms`. The current implementation notes explicitly treat `arms` as the pauldron slot. Therefore adding bracers to `arms` would enforce same-slot replacement and prevent the intended combination.

The semantic rename is intentional:

```text
legacy arms -> shoulders
new forearms -> bracers / arm guards
```

### Save migration seam

`SavePlayerEquipment` is currently `Partial<Record<EquipmentSlot, string>>`, and `createEquipmentState()` restores by iterating current slots and validating each saved instance against the catalog slot.

After removing `arms` from `EquipmentSlot`, old saves would otherwise be silently ignored. Handle legacy input locally in `createEquipmentState()` with a narrow raw shape such as an internal intersection/legacy type; do not keep `arms` in `EQUIPMENT_SLOTS` just for compatibility.

Migration rule:

- restore current `shoulders` normally first;
- if `shoulders` is empty, inspect legacy `arms`;
- accept it only if the owned live instance now resolves to `armor.slot === 'shoulders'`;
- export only current slots.

This preserves existing pauldron instance IDs and quality without creating/replacing inventory items.

### Item declarations

`src/items/itemInstances.ts` explicitly owns `ArmorKind` and `ARMOR_KIND_LIST`; the list currently includes body armor plus all four pauldron kinds. Add `leather_bracers` and `steel_bracers` there. `INSTANCE_BACKED_KINDS` already spreads `ARMOR_KIND_LIST`.

`src/items/items.ts` owns `ItemKind` and `ITEM_DEFS`; the pauldron kinds are already declared there under the armor section. Add the two bracer kinds next to them rather than creating a new accessory category.

`src/items/itemCatalog.ts::ArmorConfig.slot` currently repeats the slot union inline. Update it together with `EquipmentSlot` so the catalog and equipment state cannot drift. Move to a shared imported `EquipmentSlot` only if that does not introduce an import cycle; otherwise update both declarations consistently and cover with tests.

Change all pauldron catalog entries from `arms` to `shoulders`; add bracers with `forearms`.

### Existing quality/economy flow

Armor quality already comes from `ArmorItemInstance` and the existing armor resolver. No bracer-specific quality math is needed.

`src/items/tradeCatalog.ts` owns kind-level pricing. Add base prices there and reuse existing armor acquisition/instance creation. Do not make quality pricing part of this plan.

For specialist stock, inspect the already-implemented profession stock before adding availability. The current code already has pauldron-related blacksmith stock (`settlement/householdProfessionStock.ts`) and generic NPC trade availability. Prefer extending that existing stock path for `steel_bracers`; do not add a standalone bracer vendor system. `leather_bracers` can use Hunter/specialist or ordinary merchant stock according to the smallest existing declaration that fits.

## Presentation runtime

`src/player/playerEquipmentVisual.ts` already provides a presentation-only registry keyed by `ItemKind`, with `modelUrl`, optional tint and optional alignment. Add both bracers to that registry; do not put renderer metadata in `ITEM_CATALOG`.

The current pauldron implementation was deliberately designed as slot-aware attachment infrastructure rather than `applyPauldron()`. Preserve that design. The runtime visual collection must be keyed by the expanded `EquipmentSlot`, so `shoulders` and `forearms` can coexist.

Important lifecycle cases:

- equip/unequip `shoulders` must not remove `forearms`;
- equip/unequip `forearms` must not remove `shoulders`;
- body/root appearance swap must rebind both active accessories to the new current skeleton;
- sell/drop of an equipped item still derives presentation from `EquipmentState + Inventory`, not from duplicated visual state.

`?player=adventurer` / non-UBC fallback remains gameplay-valid but may skip accessory visuals, following `items-player-039` behavior.

## Asset pipeline

Reuse the accessory path already added by `items-player-039` in:

```text
scripts/assets/compose_ubc_player.py
scripts/assets/prepare-ubc-player-alpha.sh
src/assets/assetIndex.ts
public/models/characters/ubc/accessories/
```

Source meshes supplied by the UBC Ranger/Noble blend/source set:

```text
Male_Ranger_Arms_Bracer
Male_Noble_Arms_Guards
```

Produce self-contained skinned runtime assets:

```text
male_leather_bracers.glb
male_steel_bracers.glb
```

Use the same skeleton-remap/binding assumptions as current pauldron assets. No animation clips and no second mixer.

If User-provided GLBs are already available when implementation starts, wire those through the same final paths rather than rebuilding equivalent geometry unnecessarily; still keep the preparation script/asset registry contract coherent.

## UI propagation

`EQUIPMENT_SLOT_LABEL` in `src/items/equipment.ts` is the label source. Use:

```ts
shoulders: 'Naramienniki'
forearms: 'Przedramiona'
```

The inventory/character UI already consumes `EquipmentSlot` and/or `EQUIPMENT_SLOTS`; prefer making the new slots flow through those generic iterations. Search for exhaustive `Record<EquipmentSlot, ...>`, switch statements and hardcoded six-slot layouts because TypeScript will identify many, but not necessarily all, assumptions.

Do not retain `arms: 'Ramiona'` in current UI once migration is complete.

## Tests to update first

Primary target: `src/items/equipment.test.ts`.

Add coverage for:

1. pauldron maps to `shoulders`;
2. bracer maps to `forearms`;
3. both can be worn together;
4. same-slot replacement still works independently;
5. modifier composition includes both;
6. legacy save `{ arms: pauldronInstanceId }` restores into `shoulders`;
7. current `shoulders` wins if both current + legacy keys exist;
8. export never emits `arms`.

Also extend existing armor classification/catalog tests for both new kinds and presentation resolver tests for both GLBs.

If the slot-aware attachment helper/controller has tests from `items-player-039`, expand them to hold two simultaneous slot visuals instead of creating a new bracer-specific test harness.

## Implementation order

1. Change slot contract (`arms` -> `shoulders`, add `forearms`) plus save migration and tests.
2. Move all existing pauldron catalog entries to `shoulders`; keep item identity/stats unchanged.
3. Add both bracer kinds to `ItemKind`, `ArmorKind`, defs/catalog/trade declarations.
4. Add/extend specialist stock using existing economy declarations only.
5. Prepare/register both GLBs through the existing UBC accessory pipeline and Asset Browser.
6. Extend `playerEquipmentVisual.ts` and current slot-aware runtime presentation for `shoulders + forearms` coexistence.
7. Run focused tests, typecheck/build; fix exhaustive slot assumptions surfaced by TypeScript.
8. Leave all visual/clipping/browser checks to User.

## Guardrails

- Do not preserve ambiguous active `arms` alongside `shoulders`; only accept `arms` as legacy save input.
- Do not introduce `AccessoryState`, `BracerState`, a new save field or a second presentation manager.
- Do not add `wrist` yet.
- Do not change pauldron identity, quality or balance just because their slot is renamed.
- Do not let asset/model names determine gameplay stats.
- Do not hardcode transforms in `PlayerController`; use existing visual alignment metadata.
- Do not run browser verification.
- Do not run `pnpm docs:sync`; generated plan indexes/next IDs are workflow-owned.

## Documentation follow-up

Update comments/docs that describe pauldrons as `arms` equipment, especially `items-player-039`-era code comments and current state/catalog descriptions where they would otherwise become misleading. Historical plan text may remain historical unless project conventions require a correction note; current code/docs must use `shoulders`/`forearms`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
