# Implementation notes: UBC runtime pauldrons

**Plan:** `items-player-039-ubc-runtime-pauldrons.md`

## Current code contracts to reuse

### Equipment ownership

`src/items/equipment.ts` already owns wearable slot state. `EquipmentSlot` already includes `arms`; `EquipmentState.equip()` resolves the target slot from `ITEM_CATALOG[instance.kind].armor.slot`, replaces any existing instance in that slot and persists only the equipped instance id. `equippedArmorInstances()` and `resolveEquipmentModifiers()` already compose every live-valid equipped armor piece.

Do **not** add an accessory state, new save field or pauldron-specific branch to `EquipmentState`. Adding the four kinds to the normal armor declarations plus `armor.slot: 'arms'` is sufficient for gameplay ownership/persistence.

The existing tests in `src/items/equipment.test.ts` are the right place to extend coverage for `arms`, same-slot replacement and body/arms independence.

### Armor instance / quality ownership

`src/items/itemInstances.ts` owns the explicit `ArmorKind` union and `ARMOR_KIND_LIST`; both currently contain only `leather_armor` and `chainmail`. Add all four pauldron kinds there. `INSTANCE_BACKED_KINDS` already spreads `ARMOR_KIND_LIST`, so the new armor kinds become instance-backed automatically.

`src/items/armorItemInstances.ts` is the single quality resolver. `createArmorInstance()` defaults ordinary acquisition to `common`; `resolveEffectiveArmorPiece()` applies the existing `common` / `good` / `masterwork` protection, effective-weight and penalty tuning. Do not add pauldrons-specific quality math.

Important discrepancy vs wording in the source plan: armor quality currently does **not** alter trade price. `src/items/tradeCatalog.ts::resolveInstanceSellPrice()` special-cases trap/tent condition only and otherwise returns the kind-level sell price. Keep that behavior in this plan; `poor` and quality-sensitive pricing are separate work.

### Item/catalog/economy declarations

Add each kind to `ItemKind` + `ITEM_DEFS` in `src/items/items.ts` and to `ITEM_CATALOG` in `src/items/itemCatalog.ts`. Use `categories: ['armor']`, the plan weight, and `armor.slot: 'arms'` with the planned base modifiers. These are the gameplay/stat sources of truth.

`src/items/tradeCatalog.ts` owns `MERCHANT_PRICES` / trade values. Add the four base kind prices there. `src/items/trade.ts::createAcquiredInstance()` already dispatches every `isArmorKind(kind)` through `createArmorInstance(kind)`, so no new pauldron branch belongs there.

`src/items/inventoryView.ts` and `src/player/characterPresentation.ts` already recognize `ArmorItemInstance` and quality labels generically. They should require no pauldron-specific UI code once the kinds/catalog entries exist.

Decide merchant stock by extending the existing `MERCHANT_STOCK` declaration only if the intended V1 availability is merchant purchase. Do not create a second acquisition path just for these items.

## Player appearance integration

### Existing body swap

`src/player/playerVisualPreset.ts` owns the full-body UBC choice. `resolveEquipmentOutfit(bodyKind)` remains unchanged: empty body -> Peasant, `leather_armor` -> Ranger, any other body armor -> Knight. Do not let `arms` affect this resolver.

`src/app/createApp.ts` has two relevant integration points:

- boot: `resolvePlayerAppearance({ bodyKind: equippedBodyArmor(equipment, inventory) })` before/around `PlayerController.create`,
- runtime: `syncPlayerAppearance()` recomputes the same body appearance and calls `player.applyAppearance(...)`.

Reuse that lifecycle instead of adding an unrelated subscriber. The accessory sync should sit next to the existing appearance/equipment sync and be called after the full-body appearance is known/applied.

### `PlayerController` ownership

`src/player/PlayerController.ts` owns `modelRoot`, the active animation mixer and live appearance replacement. `applyAppearance()` replaces the current skinned root, rebinds the UAL mixer and remounts the held tool on the new `hand_r`.

Pauldron visuals should be owned by `PlayerController` as derived presentation state, not by inventory/equipment. Keep a small slot-aware attachment collection (even though V1 only uses `arms`) so future head/legs/feet parts do not require a second runtime mechanism.

Required lifecycle:

1. remove/replace the currently attached `arms` visual when equipment changes;
2. load/clone the requested accessory asset through existing GLTF cache/clone facilities;
3. bind its `SkinnedMesh` to bones from the **current** UBC `modelRoot`;
4. apply optional presentation tint/alignment metadata;
5. attach under the current player model/wrapper without introducing another `AnimationMixer`;
6. after any successful `applyAppearance()` root swap, reapply/rebind the current accessory because the old skeleton references are stale.

Adventurer/capsule remain session-locked/non-UBC. For them, equipment remains valid gameplay state but runtime accessory presentation must no-op cleanly.

Do not dispose shared geometry/material/texture data owned by the GLTF cache when unequipping. Dispose only per-instance material clones or other resources explicitly created by the accessory path.

## Skeleton binding

The Fantasy Source modular parts and the current player UBC/UAL assets use the same UBC rig family. The runtime seam should resolve destination bones from the active player root by stable bone/joint names and bind the accessory skinned mesh to those live bone objects.

Do not animate the accessory's imported armature as a second character. Any skeleton/armature included in the accessory GLB is source data for remapping only.

Fail closed in development: if a required joint cannot be mapped, skip that visual and warn rather than rendering a partially bound mesh. Keep bone-map/bind logic isolated in a small helper that can be unit-tested without the game loop.

Before inventing new clone logic, inspect `src/assets/loadGltf.ts` and the existing `SkeletonUtils.clone` path; the repository already clones skinned GLTFs safely for runtime use.

## Presentation registry

Create a player-equipment visual resolver/registry outside gameplay catalog state. A narrow shape is enough:

```ts
type PlayerEquipmentVisual = {
  modelUrl: string
  tint?: 'brown'
  alignment?: {
    position?: [number, number, number]
    rotation?: [number, number, number]
    scale?: number
  }
}
```

V1 mapping:

- `leather_pauldron` -> `male_leather_pauldron.glb`, brown tint,
- `ranger_pauldron` -> `male_ranger_pauldron.glb`,
- `knight_pauldron_spike` -> `male_knight_pauldron_spike.glb`,
- `knight_pauldron_round` -> `male_knight_pauldron_round.glb`.

`alignment` must default to identity. The User will fill/tune alignment separately after implementation; the agent must not wait for that manual work and must not guess offsets in `PlayerController`.

Prefer a dedicated file near `playerVisualPreset.ts` rather than adding asset URLs/tints to `ITEM_CATALOG`; gameplay catalog entries must not become renderer configuration.

## UBC materials / leather tint

Existing outfit tint support lives in `src/assets/ubcOutfitMaterials.ts` and is used from `PlayerController`. Reuse the same material-clone-before-mutation rule. Do not mutate materials on a cached GLTF scene.

`leather_pauldron` deliberately reuses the Noble geometry but should render brown. If the Noble source material/atlas cannot use the current generic tint helper directly, extend the shared UBC material helper narrowly instead of adding one-off material traversal inside the controller.

Do not connect accessory tint to global `?playerTint=`; the accessory registry owns this fixed visual variant.

## Asset preparation

Source of truth is `_temp/Models/people/Modular Character Outfits - Fantasy[Source]/`, not the temporary incomplete `.gltf/.bin` copies in `public/models/characters/ubc/accessories/`.

Reuse `scripts/assets/compose_ubc_player.py`'s existing glTF buffer/accessor/material/image handling and its skinned-mesh/joint remapping (`add_skinned_mesh` path) where practical. Reuse `scripts/assets/prepare-ubc-player-alpha.sh` for final packing conventions. Existing UBC packing intentionally avoids flattening skinned meshes; keep that invariant.

Generate final self-contained GLBs:

```text
public/models/characters/ubc/accessories/
  male_leather_pauldron.glb
  male_ranger_pauldron.glb
  male_knight_pauldron_spike.glb
  male_knight_pauldron_round.glb
```

Do not ship the temporary `.gltf/.bin` pairs as the runtime contract. Do not package `Male_Noble_Acc_Pauldron_Lion` for V1; it stays parked/source-only.

UAL clips remain in `public/models/characters/ubc/ual1_player.glb`; accessory GLBs contain no animation clips.

## Asset Browser

`src/assets/assetIndex.ts::buildAssetIndex()` is the wired registry. Existing UBC player outfits are explicit `character:*` rows with `group: 'character'`, `prepare: { mode: 'height', value: PLAYER_HEIGHT }` and `skinned: true`.

The asset-browser also merges disk-only `.glb` files from `/asset-browser-models.json` through `mergeParkedManifest()`, but relying only on that would mark the pauldron files as generic parked entries with `skinned: false`. Add explicit wired rows for the four final pauldron GLBs so they are discoverable as intentional skinned assets.

The User's later alignment is manual and **not** an implementation blocker. This plan only needs the final GLBs visible/loadable in `/asset-browser.html` with identity/default alignment metadata available for later edits.

No browser automation/headless verification is required; the User performs visual verification.

## Sync call-sites

Keep one derived sync path from `EquipmentState + Inventory` to presentation. The implementation should cover these existing mutation paths rather than patching each merchant/drop action separately:

- initial hydration before player boot,
- inventory/equipment `equipArmor` / `unequipArmor`,
- `onInventoryChanged()` after sell/drop/removal, where equipment already synchronizes against inventory,
- `syncPlayerAppearance()` / body swap.

Prefer a helper that resolves `equippedInstanceId(equipment, inventory, 'arms')` -> inventory instance -> visual registry entry, then asks the player controller to apply that slot visual. Do not store a duplicate selected-pauldron `ItemKind` elsewhere.

## Tests / verification targets

Extend or add pure/unit tests around:

- `itemInstances`: all four kinds classify as armor / instance-backed;
- `equipment`: all four equip into `arms`, replacement is same-slot only, `body` survives;
- `armorItemInstances`: existing quality tuning applies to pauldron base stats with no special cases;
- presentation resolver: exact four mappings, fixed brown tint for leather, non-accessory -> null, identity alignment default;
- skeleton helper: name mapping success, missing-bone rejection, no duplicate mixer/state;
- lifecycle helper/controller seam: remove/replace and rebind after root change where this can be tested without WebGL.

Existing `playerVisualPreset.test.ts` should remain green; pauldrons must not change body-outfit resolution.

Build/typecheck/tests are agent verification. Browser alignment/clip inspection remains User verification.

## Implementation order

1. Add item/armor/catalog/trade declarations and tests; confirm normal `arms` persistence/equipment works without presentation.
2. Extend the UBC asset pipeline and produce the four final self-contained GLBs.
3. Add explicit Asset Index rows so all four are visible in Asset Browser.
4. Add the declarative equipment-visual resolver/registry with identity alignment and leather brown tint.
5. Implement isolated UBC accessory skeleton remap/bind helper.
6. Add slot-aware attachment ownership to `PlayerController` and rebind after `applyAppearance()`.
7. Wire one accessory sync beside the existing equipment/player-appearance lifecycle in `createApp.ts`.
8. Run unit tests/typecheck/build; leave manual alignment to the User.

## Guardrails

- No new equipment/accessory state or save schema.
- No changes to body outfit selection from `arms`.
- No full `CharacterAppearanceDefinition` / modular-character rewrite.
- No second rig/mixer for an accessory.
- No guessed per-pauldron transforms in gameplay/controller code.
- No `poor` quality and no armor-quality price scaling in this plan.
- No Lion, helmets, scarf, body parts, female or NPC accessories.
- Do not run browser verification; the User does it.
- Do not run `pnpm docs:sync`; repository workflow handles generated docs as documented by the project.
