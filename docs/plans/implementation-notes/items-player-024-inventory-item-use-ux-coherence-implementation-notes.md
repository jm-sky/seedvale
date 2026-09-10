# Implementation Notes: items-player-024 — Inventory and item-use UX coherence

## Current architecture to preserve

This plan should be implemented as presentation/query + bounded app-wiring changes over existing owners.

Canonical owners/seams verified on current `main`:

- `src/items/Inventory.ts` — counts, instances, food freshness, weight/size/capacity.
- `src/items/HeldTool.ts` — one actual right-hand slot.
- `src/items/primaryWeapons.ts` — remembered melee/ranged shortcuts; shortcut actions already call equip.
- `src/items/itemCatalog.ts` — `ITEM_CATALOG`, holdable flags, capabilities, consumables, ranged/melee metadata.
- `src/items/inventoryView.ts` — canonical derived inventory grouping used by Inventory and container/merchant surfaces.
- `src/items/constructionMaterials.ts` — canonical inventory + nearby dropped-material availability/consumption.
- `src/interaction/interactionView.ts` — canonical structured world-interaction presentation from `ui-input-015`.
- `src/app/inventoryWiring.ts` — Inventory-screen callbacks, equip/drop/read, primary shortcuts, merchant refresh.
- `src/app/actions/containerActions.ts` — chest/corpse transfer session and app-layer mutations.
- `src/ui-vue/store.ts` — current UI contracts for Inventory, Container, Quick Actions and HUD.

Do not introduce `EquipmentManager`, `LootManager`, a new item-capability table, a second material resolver or a new world-interaction presentation layer.

## Recon findings that matter during implementation

### `inventoryView.ts`

`buildInventoryGroups()` iterates all `INSTANCE_BACKED_KINDS`, but an instance-backed group is only emitted when one of these returns non-null:

- `buildTrapGroup`,
- `buildWeaponGroup`,
- `buildLiquidContainerGroup`.

`tent` is instance-backed and has no builder, so owned tent instances currently disappear from the inventory groups even though `inventoryCountsForUi()` counts them and Quick Actions can detect them.

`InventoryInstanceRow.conditionPercent` currently means different things:

- trap condition,
- weapon durability,
- liquid fill.

`sharpnessPercent` is separate only for weapons. The current comments explicitly acknowledge that liquid fill is being carried through `conditionPercent` as the “closest UI concept”. That shortcut is exactly what this plan should remove from the player-facing contract.

Prefer adding explicit presentation semantics rather than branching on `ItemKind` inside Vue. A possible direction is a small meter representation on rows/groups (`kind`, `valuePercent`, label or enum). Keep the exact shape minimal.

### Inventory details/list

`InventoryScreenItemDetails.vue` already imports `ITEM_CATALOG` and derives:

- melee/ranged stats,
- consumable data,
- book state,
- primary melee/ranged state,
- current grouped instance rows.

It currently does **not** render `catalogEntry.capabilities`.

It also hardcodes `imageUrl = null`, and the user explicitly decided to keep category icons. Do not add thumbnail/model rendering.

The details screen currently has `onEquip(kind)` only. Instance rows have concrete `row.ids`, and primary assignment already supports `instanceId`. Reuse that identity path for explicit instance equip rather than inventing a selected-instance store.

When changing instance-row meter rendering, preserve grouped display for multiple equal-state instances; only the semantic label changes.

### Item capabilities

`ITEM_CATALOG[kind].capabilities` is already the source of truth for gameplay tool gates. Merchant filtering already has player-facing capability labels. Reuse/lift the existing label mapping if its wording fits inventory details; do not maintain two independent maps.

If a capability genuinely must become hidden for discovery, add the smallest catalog/presentation metadata needed. Current scope does not require inventing hidden capabilities pre-emptively.

### Held tool vs primary weapon

`HeldTool` is the actual hand. `PrimaryWeaponSelection` is not an equipment slot.

`inventoryWiring.ts` documents primary shortcuts as actions that equip whichever remembered weapon is selected. Preserve that behavior.

The UX goal is therefore presentation clarity:

```text
HeldTool → actual current hand
Primary melee/ranged → remembered quick-equip choice
```

When making equip instance-aware, ensure shortcut selection still honors its selected `instanceId` where one exists.

### Drop path

`inventoryWiring.ts` currently exposes `dropItemStack(kind)` and documents it as dropping the whole carried stack.

Current implementation already handles two important cases correctly:

- instance-backed items are removed as concrete instances and dropped with `toSaveItemInstance(instance)`,
- count items use `removeWithFreshness()` and `expandFoodBatchesToUnits()` so food provenance is preserved.

Refactor this into amount-aware behavior without regressing those semantics. For count items, remove exactly the chosen amount with freshness. For instance-backed groups, a generic “drop N” requires a deterministic choice of concrete IDs unless UI is acting on selected rows; prefer explicit IDs where possible.

The quantity dialog belongs in UI presentation, not inside `Inventory`.

### Container/corpse transfer path

`containerActions.ts` already keeps one app-layer transfer session:

```ts
{ kind: 'container', id }
| { kind: 'npcCorpse', npc }
```

Keep this. It is the correct seam to derive presentation mode.

Current screen limitations:

- `ContainerScreen.vue` hardcodes `W skrzyni`, `Skrzynia jest pusta`, `U gracza`,
- corpse mode still renders deposit controls,
- app layer only rejects corpse deposits after click,
- count callbacks already accept `(kind, amount)`, so split transfers do **not** require a new mutation architecture.

Add mode/labels/permissions to the UI contract (`store.ts` / `openContainerScreen` wiring) rather than creating `CorpseLootScreen.vue`.

For `Weź wszystko`, do not bypass existing transfer semantics. A robust implementation can iterate current groups/instances deterministically and invoke the same bounded transfer primitives, but avoid UI-driven mutation loops if a small app-layer helper can perform the batch more cleanly. Preserve:

- food freshness,
- instance IDs,
- weight/size capacity,
- world-container withdrawal callbacks where applicable.

Partial `Weź wszystko` is valid: take what fits, leave the rest.

### Construction materials

`constructionMaterials.ts` already has:

- `nearbyWorldMaterialCount`,
- `hasMaterial`,
- `consumeMaterial`,
- deterministic nearest-first dropped-item consumption,
- `CONSTRUCTION_MATERIAL_RADIUS = 3`.

Do not recalculate world materials elsewhere. Add one read-only breakdown helper here, based on the same count logic, e.g. returning required/inventory/nearby/available/missing.

Any well/terrain/build/repair presentation that needs material numbers should consume that derived breakdown. Mutation remains `consumeMaterial()`.

### `ui-input-015` interaction presentation

`src/interaction/interactionView.ts` is already implemented. It supports structured action slots and `enabled/reasonLabel`, but many targets still flow through legacy prompt parsing.

For this plan’s product rule:

- missing specialist capability/tool usually means the world action is absent/hidden,
- basic intuitive actions may still be shown,
- once the relevant capability/action is known but materials are missing, show the action disabled with a reason.

Do not reinterpret `ui-input-015` as “all possible actions must always be visible”. It provides the presentation mechanism, not the reveal policy.

Where this plan touches world action availability, extend existing interactable/query generation or `InteractionViewContext` only if needed. Do not create an items-specific world prompt system.

### Quick Actions

`store.ts` already describes Quick Actions as presentation over existing handlers/availability. Keep that direction.

The user’s rule is:

```text
Inventory = complete ownership/use surface
Quick Actions = faster shortcut surface
```

Therefore, adding `Rozstaw/Postaw` to Inventory should call the same existing placement entry point as Quick Actions. Do not duplicate placement validation or mutation.

Not every Quick Action must map to an item action. World/build actions that consume generic resources can remain Quick-Action-only if there is no concrete owned item to act on.

### Ranged ammo

`HudScreen.vue` currently renders only a general `ui.hud.held` string. It has no separate ammo field.

Prefer deriving ammo presentation where held HUD text/state is already synchronized (`syncHeldHud` call chain) rather than recomputing inventory in Vue.

The ranged catalog already carries ammo kinds. Use those plus live inventory counts. Do not add “remaining ammo” to combat authoritative state.

Remove only the repetitive per-shot remaining-ammo toast; keep hit/miss/error feedback.

### Pickup feedback

`items-player-022` already owns grouped dropped-item interaction. Do not modify that grouping algorithm for this plan.

At the successful pickup mutation/dispatch seam, format count-resource feedback as actual delta + resulting inventory total. The amount must be the number actually collected after capacity limits, not the candidate group size.

Avoid changing special feedback for instance-backed items unless required by the implementation.

## Suggested small contracts

These are implementation directions, not mandatory exact names.

### Inventory meter semantics

```ts
type ItemMeterKind = 'condition' | 'durability' | 'sharpness' | 'fill'

type InventoryMeterView = {
  kind: ItemMeterKind
  percent: number
}
```

A row may have one or more meters. This is cleaner than overloading `conditionPercent` + one special `sharpnessPercent` forever.

### Item-use presentation

```ts
type ItemUseView = {
  id: string
  label: string
  enabled: boolean
  reasonLabel: string
}
```

Keep it derived/read-only. The callback/mutation remains app-layer wiring.

### Construction material breakdown

```ts
type MaterialAvailabilityView = {
  kind: ItemKind
  required: number
  inInventory: number
  nearbyWorld: number
  available: number
  missing: number
}
```

Place this beside `constructionMaterials.ts`, not in Vue.

## Likely integration points

### Inventory refresh path

`inventoryWiring.ts` already calls the provided refresh/sync callbacks after inventory mutations. Quantity/equip/drop changes should preserve those calls:

- HUD weight,
- held-tool sync,
- held HUD sync,
- Quick Actions availability,
- Inventory screen refresh,
- merchant refresh when relevant.

Do not rely on the regular frame loop while modal screens are open; existing comments explicitly note modal gating.

### Quantity dialog

Use one reusable overlay/component with:

- min = 1,
- max = currently available count,
- current amount,
- confirm/cancel,
- touch-friendly increment/decrement and/or numeric/range input consistent with current UI primitives.

Do not make it own item state. Caller passes label/max and receives confirmed amount.

For a single item, skip the dialog.

### Container screen mode

The UI store contract should carry enough derived presentation to avoid `ContainerScreen.vue` switching on domain objects. Example fields:

- source label,
- source-empty label,
- player-column label,
- `canDeposit`,
- whether `takeAll` is available.

The app layer knows whether the active session is chest or corpse and should set these.

## Tests worth writing first

High-value pure/unit tests before Vue integration:

1. `buildInventoryGroups()` returns a tent group and cannot silently lose an owned instance-backed kind.
2. Meter semantic mapping for trap/weapon/liquid/tent.
3. Capability presentation derived from `ITEM_CATALOG`.
4. Amount-aware drop preserves food freshness and concrete instances.
5. Construction material breakdown equals `hasMaterial()` decisions at 0, partial and sufficient totals.
6. `Weź wszystko` capacity-limited transfer preserves remainder.
7. Instance-aware equip selects requested instance and primary shortcut still equips its remembered choice.
8. Ammo presentation count follows inventory counts for the held ranged weapon.

Then add focused component/store tests for quantity dialog, corpse mode hiding deposit, disabled item actions and HUD text.

## Pitfalls

- Do not “fix” missing specialist-tool UX by making every world action visible disabled; product decision is the opposite for most specialist actions.
- Do not force every Quick Action to require `HeldTool`; Quick Actions intentionally improve convenience and some capabilities are bag-gated.
- Do not calculate construction nearby counts from rendered meshes or current camera/chunk visibility; use authoritative `DroppedItems` through `constructionMaterials.ts`.
- Do not drop instance-backed items by kind if the player selected a concrete instance.
- Do not make `Weź wszystko` atomic-all-or-nothing; capacity-limited partial success is intended.
- Do not show anonymous `%` after the meter change.
- Do not add thumbnails.
- Do not change fishing-vs-water input behavior.
- Do not run browser verification; the user does manual browser verification.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
