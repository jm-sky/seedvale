# Implementation notes: Multi-part armor and equipment quality

Plan: `items-player-030-multi-part-armor-and-equipment-quality.md`

Recon baseline: `main` after `e6f00f46` (2026-09-12).

These notes record implementation-relevant facts that are not obvious from the plan itself. Current code wins if it changes before implementation.

## 1. Existing equipment ownership and consumers

### `src/items/equipment.ts`

This is the existing owner of wearable selection and derived armor effects. Extend it; do not create a second armor/equipment module.

Current contracts:

- `EquipmentSlot = 'body'`.
- `SavePlayerEquipment` persists `body?: ItemKind`.
- `EquipmentState.body()` exposes the raw selected kind.
- `equip(kind, inventory)` validates `isBodyArmorKind(kind)` + count ownership.
- `syncWithInventory()` clears stale count-backed selection.
- `equippedBodyArmor()` is the live-valid no-ghost getter.
- `resolveEquipmentModifiers()` is already the single derivation point used by damage/melee/movement/stamina consumers.
- `NEUTRAL_EQUIPMENT_MODIFIERS` is the no-armor contract and should remain unchanged for callers.

Do not make downstream consumers understand slots or quality. Keep the existing `EquipmentModifiers` aggregate shape unless a genuinely new effect requires another field.

Known consumers of `resolveEquipmentModifiers()` include:

- `src/app/gameLoop.ts` — per-frame movement/stamina/melee-facing integration,
- `src/player/PlayerController.ts` — receives explicit equipment modifiers rather than importing inventory/catalog,
- `src/player/playerDamage.ts` — passive mitigation is opt-in for applicable damage,
- `src/app/actions/mountActions.ts`,
- `src/app/actions/containerActions.ts`,
- other `PlayerActionContext` damage/action call sites found by symbol search.

Preserve the existing boundary: active defense remains separate and resolves before passive armor; non-applicable environmental damage must not silently gain armor mitigation.

## 2. Armor must move from count-backed to instance-backed atomically

### `src/items/itemInstances.ts`

The repository already has the right identity mechanism:

- `ItemInstance { id, kind }`,
- specialized discriminated shapes for weapons, traps, liquid containers and tents,
- `INSTANCE_BACKED_KINDS`,
- `isInstanceBackedKind()`,
- `cloneItemInstance()`,
- `createItemInstanceId()`.

Add armor to this mechanism rather than inventing armor IDs.

Recommended ownership:

```ts
type ArmorQuality = 'common' | 'good' | 'masterwork'

type ArmorItemInstance = ItemInstance & {
  kind: ArmorKind
  quality: ArmorQuality
}
```

Define one authoritative `ArmorKind`/armor-kind list or derive it from an existing safe catalog classification; do not maintain several unrelated lists. `leather_armor` and `chainmail` must become instance-backed at the same time as equipment starts referencing instance IDs.

Update `cloneItemInstance()` for armor or quality will be lost at every inventory boundary.

Important: `Inventory` stores count-backed kinds and instances in separate collections. Do not leave armor simultaneously represented in both after migration/acquisition, or ownership, weight and trade paths will double-count it.

## 3. Persistence path is already centralized

### `src/items/Inventory.ts`

`SaveItemInstance` is the persisted plain-data representation. `toSaveItemInstance()` serializes specialized instance state. `Inventory.instancesFromJSON()` is the reconstruction boundary used by player inventory and world/container restoration.

Add optional `quality` to `SaveItemInstance` and handle armor in both conversion directions. Invalid/missing armor quality should normalize to `common` at the reconstruction boundary rather than leaking invalid values into live state.

### `src/persistence/saveData.ts`

`isSaveItemInstancesField()` structurally validates optional specialized fields before `Inventory.instancesFromJSON()` performs semantic reconstruction/clamping. Extend the structural validator to accept only the three quality strings when `quality` is present.

`isPlayerEquipmentField()` currently validates the old `{ body?: ItemKind }` shape. The new save shape should persist instance IDs for six slots. Keep validation structural here; inventory ownership and slot compatibility belong in `createEquipmentState()` / equipment helpers, matching the existing separation.

### Existing save migration problem

Old saves have armor in `inventory` counts and may have `playerEquipment.body = 'leather_armor' | 'chainmail'`. New runtime armor must be instance-backed.

Do the conversion at one explicit restore/migration seam before constructing the final equipment state:

1. detect legacy count-backed armor,
2. mint exactly one `common` `ArmorItemInstance` per legacy unit,
3. remove/consume the corresponding count representation,
4. if the old body kind was equipped, deterministically select one newly-created instance of that same kind for `body`,
5. then construct the new equipment state from instance IDs.

Do not make `EquipmentState` silently create inventory items; equipment references ownership but never creates it.

Check the actual player inventory construction/restore in `src/app/createApp.ts` before placing this migration. Prefer an existing save-normalization seam if one exists there at implementation time.

## 4. Effective instance weight needs a shared item-level resolver

### Current `Inventory` behavior

`Inventory.totalWeight()` currently:

- sums `ITEM_DEFS[kind].weight * count` for count-backed items,
- sums `ITEM_DEFS[instance.kind].weight` for every instance,
- adds liquid contents mass separately.

`hasWeightRoom(kind)` and `canAddInstance(instance)` also use base `ITEM_DEFS` weight. If only `totalWeight()` becomes quality-aware, capacity checks and HUD/encumbrance will disagree.

Introduce one pure effective-instance-weight helper at the item layer and use it in at least:

- `Inventory.totalWeight()`,
- instance admission/capacity (`canAddInstance` / underlying weight-room calculation),
- any transaction preview that computes post-transfer weight for concrete instances.

Do not put quality logic in `playerEncumbrance.ts`; it should continue seeing only the resulting `Inventory.totalWeight()`.

Liquid-container content remains additive after container base/effective weight. Armor quality must not disturb that branch.

Count-backed `hasWeightRoom(kind, n)` can remain base-kind based because armor will no longer enter through count acquisition once converted.

## 5. Catalog and armor classification

### `src/items/itemCatalog.ts`

Current `ArmorConfig.slot` is body-only and the two implemented armor kinds are `leather_armor` and `chainmail`.

Extend the slot type to the six plan slots and keep intrinsic armor design values in `ITEM_CATALOG[kind].armor`.

The quality resolver should take base `ArmorConfig` + `ArmorQuality` and return effective per-piece values. UI and aggregate equipment resolution should reuse that same result.

Avoid `ItemKind × quality` tables. A compact shared quality tuning table is appropriate because quality is a cross-kind concept.

Current direct armor channels already exist:

- `damageReduction`,
- `staminaCostMultiplier`,
- `meleeRecoveryMultiplier`,
- `movementSpeedMultiplier`,
- `sprintStaminaMultiplier`.

The plan intentionally allows quality to reduce these direct penalties in addition to reducing weight. Do not remove these channels merely because weight now varies: they represent restriction/fitting effects that mass alone does not capture.

### `src/items/items.ts`

`ITEM_DEFS[kind].weight` remains the common/base design weight. Do not mutate `ITEM_DEFS` at runtime for quality.

Add new armor `ItemKind`s only when the corresponding usable assets are confirmed, per the plan's asset gate. Architecture/tests can cover all six slots without inventing assetless player-facing items.

## 6. Multi-slot composition decision

`resolveEquipmentModifiers()` currently maps one body piece directly to one aggregate modifier object. With six pieces it must fold all live-valid equipped instances.

Keep neutral defaults as the fold identity.

For cost/restriction multipliers (`meleeStaminaMultiplier`, `meleeRecoveryMultiplier`, `movementSpeedMultiplier`, `sprintStaminaMultiplier`), use one documented deterministic composition rule in `equipment.ts`; consumers must not compose pieces themselves.

For protection, do **not** sum `damageReduction` percentages directly across six slots. The existing output is `incomingDamageMultiplier`; compose protection in a bounded way (for example through remaining-damage multipliers) so six pieces cannot exceed 100% mitigation. Final coefficients remain balance work, but the mathematical invariant must be encoded/tested here.

Do not introduce hit-location/body-part damage in this plan. Every equipped protective piece contributes to the aggregate passive armor result.

## 7. Equipment state should become slot-generic, not six copied fields of behavior

Keep six explicit persisted slot names for readability, but centralize validation/iteration with one ordered slot constant, e.g. `EQUIPMENT_SLOTS`.

Useful generic operations should replace body-only helpers:

- lookup equipped instance for a slot,
- equip a concrete `instanceId`, deriving/validating its slot from catalog metadata,
- unequip a slot,
- enumerate live-valid equipped armor,
- sync stale references,
- export only live-valid instance IDs.

Do not retain `equippedBodyArmor()` as the gameplay source after migration. If a compatibility helper remains temporarily for UI migration, it must delegate to the generic live-valid path rather than own separate validation logic.

No-ghost invariant must use `Inventory.getInstance(instanceId)` and armor/slot validation, not `inventory.has(kind, 1)`.

## 8. Inventory/world/trade continuity is broader than the inventory screen

Once armor joins `INSTANCE_BACKED_KINDS`, existing generic instance paths become active for it. Verify them rather than adding armor-specific transfer code.

Relevant paths:

- `src/app/inventoryWiring.ts` — dropping and selling instances; `dropItems()` already branches through `isInstanceBackedKind()` and carries `SaveItemInstance` state into dropped items,
- `src/items/createDroppedItems.ts` — world instance continuity,
- `src/items/trade.ts` — instance selling/buying paths,
- container/household/world-generated container snapshots that already carry `SaveItemInstance[]`,
- player → NPC / other generic instance transfer paths if they accept instance-backed kinds.

Because `quality` is in `SaveItemInstance`, these generic boundaries should preserve it automatically once their serializer/reconstructor uses the centralized functions. Test at least one inventory → world → inventory round trip for armor quality.

Merchant acquisition is a special check: current catalog/trade data includes `leather_armor` and `chainmail`, but they were count-backed. Any purchase/grant path that currently calls `inventory.add(kind)` must create a `common` armor instance after armor becomes instance-backed. Reuse/extend the existing generic acquisition helper that already creates instances for `isInstanceBackedKind()` where possible; do not patch only merchants.

## 9. `grantItem` and acquisition call sites

`src/app/inventoryWiring.ts` receives `grantItem` from `createApp.ts`; its comment explicitly says the helper creates an `ItemInstance` when the kind needs one and quest rewards share the same entry point.

After armor is added to `INSTANCE_BACKED_KINDS`, extend the generic instance factory/acquisition branch so ordinary armor grants create `quality: 'common'`.

Search direct `inventory.add('leather_armor'...)` / `inventory.add('chainmail'...)` and test fixtures. Production acquisition must not bypass the instance factory.

Future good/masterwork producers should call an explicit armor-instance constructor rather than changing the default grant semantics.

## 10. UI seam is currently kind-grouped and body-only

### `src/ui-vue/store.ts`

Current inventory UI state exposes:

- `equippedBody: ItemKind | null`,
- `onEquipArmor(kind)`,
- `onUnequipArmor()`.

Change this to instance-aware equipment state/callbacks. Avoid pushing gameplay calculations into the Vue store.

### `src/ui/createInventoryScreen.ts`

This bridges inventory handlers into Vue. Update handler signatures consistently with `InventoryWiring` rather than adding a second armor callback family.

### `src/app/inventoryWiring.ts`

Current `equipArmor(kind)` calls `equipment.equip(kind, inventory)`; `unequipArmor()` is body-only. This is the correct composition/UI action seam to convert to concrete instance IDs and slot-aware unequip.

After any equip/unequip/sell/drop operation, preserve the existing immediate refresh behavior because the inventory modal freezes normal simulation updates.

### `src/ui-vue/screens/InventoryScreenItemDetails.vue`

Current armor presentation is kind-level:

- `armor = ITEM_CATALOG[selectedItem].armor`,
- `isEquippedBodyArmor` compares selected `ItemKind` to `ui.inventory.equippedBody`,
- `Załóż` calls `onEquipArmor(item.kind)`,
- displayed weight is `item.weight`,
- instance rows are grouped by condition/sharpness only.

Armor quality makes those assumptions invalid. The UI must let the player act on a concrete armor instance when multiple qualities of one kind exist.

Prefer extending the existing instance-row mechanism instead of inventing a separate armor screen. Include quality in instance-row grouping/presentation and make equip target an instance ID. Effective weight/protection/penalty display must come from item/equipment resolver output, not duplicated formulas in Vue.

`buildInventoryGroups()` / `InventoryGroupView` in `src/items/inventoryView.ts` is therefore a likely required seam: expose armor instance quality/effective display data there or another item-layer view helper so Vue remains presentation-only.

## 11. Existing tests to extend

### `src/items/equipment.test.ts`

Current tests encode body/count assumptions and must be migrated, not merely supplemented. They currently verify:

- owned body kind can equip,
- non-armor/unowned armor rejection,
- second body kind replaces first,
- stale count ownership clears,
- kind-based save restore,
- no-ghost behavior,
- neutral resolver,
- leather vs chainmail trade-off.

Rewrite these around armor instances and add:

- slot compatibility for all six slot values (using test catalog kinds that actually exist after implementation),
- same-slot replacement,
- different slots coexist,
- same instance cannot occupy multiple slots,
- stale/missing instance is ignored immediately without requiring sync,
- quality affects protection and direct penalties in the intended direction,
- multi-piece protection remains bounded,
- mixed sets compose deterministically.

### Inventory/persistence tests

Extend tests around:

- `cloneItemInstance()` retaining quality,
- `toSaveItemInstance()` / `instancesFromJSON()` quality round-trip,
- invalid/missing quality normalization,
- effective instance weight in `totalWeight()` and `canAddInstance()`,
- legacy count-backed leather/chainmail migration without duplication,
- legacy equipped body selection mapping to one migrated instance,
- dropped/traded armor retaining quality where existing generic tests make that cheap.

Do not add browser automation; browser verification remains User-owned.

## 12. Documentation that will become stale

Implementation should update current-state docs that explicitly describe body-only armor, especially:

- `docs/state/combat.md`,
- `docs/items/CATALOG.md`.

Generated code-map/index content should follow the repository's normal generator/workflow; do not hand-edit generated derived docs unless their generator contract requires it.

Do not run `pnpm docs:sync` manually if the repository workflow is responsible for it.

## 13. Suggested implementation order

1. Add armor quality/instance types, clone/serialization/reconstruction and centralized armor-instance constructor.
2. Add effective-instance-weight resolver and make inventory instance capacity + total weight agree.
3. Add/confirm armor catalog kinds and six-slot `ArmorConfig.slot` typing.
4. Convert legacy/new armor acquisition from counts to instances, including save migration.
5. Convert `EquipmentState` persistence/validation from body kind to per-slot instance IDs.
6. Add effective per-piece quality resolver and multi-piece `resolveEquipmentModifiers()` fold.
7. Keep existing damage/melee/movement consumers unchanged where possible; they should continue consuming the aggregate modifiers.
8. Convert `InventoryWiring` + Vue store/bridge + item details to instance-aware equip/unequip and quality display.
9. Verify generic drop/trade/container transfer continuity for armor instances.
10. Update tests and current-state docs.

This order prevents a dangerous intermediate state where armor is marked instance-backed but equipment/acquisition still expects count ownership.

## 14. Pitfalls / do not do

- Do not create `chainmail_good` / `chainmail_masterwork` kinds.
- Do not store both `kind` and copied armor stats on an armor instance.
- Do not mutate `ITEM_DEFS[kind].weight` for quality.
- Do not calculate quality separately in UI, combat and inventory.
- Do not leave `Inventory.totalWeight()` quality-aware while `canAddInstance()` remains base-weight-only.
- Do not let equipment create/migrate inventory ownership internally.
- Do not sum six `damageReduction` values naively.
- Do not convert armor to instances without auditing ordinary acquisition (`grantItem`, merchant purchase, world pickup) for the new instance-backed classification.
- Do not turn this into durability/repair/crafting/NPC-autonomous-equipment work.
- Do not add hit-location semantics to the six visual/equipment slots.

## 15. Model recommendation

Recommended implementation models after recon:

**Model:** Opus, Sonnet

Reason: this is a cross-cutting representation migration touching item identity, persistence compatibility, weight/capacity, equipment invariants and UI instance selection. The individual edits are straightforward, but avoiding duplicate ownership and old-save regressions requires careful multi-file reasoning. Sonnet is a reasonable lower-cost fallback once these notes are supplied.
