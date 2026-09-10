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

## Implementation summary (2026-09-10)

Implemented on branch `claude/inventory-item-use-ux-gaezgb`, over the existing
owners listed above — no parallel inventory/equipment/action system was
introduced.

- **Meters/tent (§1).** `inventoryView.ts` gained `ItemMeterKind` (`condition`
  / `durability` / `fill`) + `ITEM_METER_LABEL`, a `meterKind` field on
  `InventoryGroupView`/`InventoryInstanceRow`, and `buildTentGroup()` as a
  fourth fallback in `buildInventoryGroups()`'s builder chain. `conditionPercent`/
  `sharpnessPercent` field names were kept (not renamed) to avoid touching the
  unrelated Merchant screens, which read the same view type.
- **Capabilities + instance equip (§2).** Lifted `CAPABILITY_LABEL` into
  `itemCatalog.ts` (`MerchantFilterBar.vue` now imports it instead of holding
  its own copy); `InventoryScreenItemDetails.vue` renders a "Zastosowania"
  section from it. `onEquip` now threads an optional `instanceId` end-to-end
  (`store.ts` → `createInventoryScreen.ts` → `inventoryWiring.ts` →
  `HeldTool.equip()`, which already supported it); a new `heldInstanceId` on
  `ui.inventory` lets Details show "Weź"/"Odłóż" per concrete weapon instance
  bucket. The bottom generic Weź/Odłóż pair is hidden for weapon-maintenance
  kinds so there is exactly one equip affordance once instances are visible.
- **`ItemUseView` (§3).** New `items/itemUseView.ts` —
  `resolveConsumeUseView()` (mirrors `consumeItem()`'s spoiled-food/empty-
  container checks) and `resolveReadBookUseView()` (mirrors `readBook()`'s
  too-low/known outcomes). `buildInventoryGroups()` attaches `consumeUse` per
  group; both Inventory screens show the consume/read buttons disabled with a
  reason instead of hiding or silently failing them. Equip/drop/place stay
  "enabled whenever shown" (no impossible-but-visible case existed for them),
  so no `ItemUseView` was added for those — would be pure ceremony.
- **Placement verbs (§4).** Added "Rozstaw" (tent, `onPlaceTent` →
  `placement.placeTentAtAim()`) to both Inventory screens, and "Postaw"
  (chest) to Details (List already had it). Traps already had "Zastaw" in
  both screens. Wooden torch was **not** added: the only existing "placed
  torch" mechanic is `standingTorch.ts`, a generic-material construction
  object unrelated to the `wooden_torch` item kind (which is a hand-held,
  firestarter-lit tool) — the plan's own wording ("jeśli obecny placement
  pipeline traktuje ją jako inventory-owned placeable") is conditional and
  that condition doesn't hold.
- **Quantity dialog + amount-aware drop (§5).** New `ui.quantityDialog` store
  slice + `QuantityDialog.vue` (mounted once in `App.vue`), opened by callers
  for `count > 1` and skipped for a single unit. `inventoryWiring.dropItemStack`
  became `dropItems(kind, amount)`; for instance-backed kinds it drops the
  first `amount` instances in `Inventory.getInstances()` order (deterministic,
  no selection UI exists yet for "which N instances").
- **Container/corpse mode + Weź wszystko (§6).** `ui.containerScreen` gained
  `mode: 'container' | 'corpse'`; `ContainerScreen.vue` derives source
  label/empty-label from it and hides deposit controls entirely in corpse
  mode (previously: shown, then rejected by toast on click). Added
  `onTakeAll` (`containerActions.ts`) — a local `maxTransferable()` walks
  `canAdd()` one unit at a time (handles a mid-walk backpack capacity bump
  correctly, unlike a closed-form calc) then transfers via the same
  `withdraw`/`withdrawInstance`/`transferCorpseCountTo`/`transferCorpseInstanceTo`
  primitives regular transfers use — partial success by design.
- **Construction material breakdown (§7).** `constructionMaterials.ts` gained
  `materialAvailabilityBreakdown()` (required/inInventory/nearbyWorld/available/
  missing), reusing `nearbyWorldMaterialCount()`. Wired into the two existing
  player-facing quotes that already listed raw requirement counts: camp
  repair (`restActions.ts`'s `formatQuoteView`) and well construction
  (`placementActions.ts`'s `describeWellWork`) — both now render
  `Label: available/required — przy sobie N · w pobliżu M`.
- **Pickup delta feedback (§8).** `gameLoop.ts`'s item-pickup handler (there
  was previously **no** pickup toast at all for regular items) now shows
  `Label +N · Masz: total` for non-instance-backed kinds only, using the
  actual `picked` count after capacity limits — instance-backed pickups
  (weapons/traps/tents/liquid containers) keep no toast, since a generic
  delta format can't summarize per-item condition.
- **Ranged ammo (§9).** `gameLoop.ts` computes a per-frame ammo readout
  (cheap early-exit when not holding a ranged weapon) and calls the new
  `hud.setHeldAmmo()` — same "recompute every frame instead of threading
  through every mutation site" pattern already used for load. The per-shot
  "Zostało N strzał" toast was removed. Inventory details show per-ammo-kind
  counts for a held-ready bow.
- **Copy cleanup (§10).** Fixed `[mixed usage]` → "różne stany", the two
  legacy waterskin `description`s (moved the migration note to a code
  comment), `Napełnij bukłak` → `Napełnij pojemnik` (the action already fills
  any liquid container, not just waterskins) at both remaining call sites,
  and one `zapalić`/`dołożyć` mismatch (the *lit*-campfire "add fuel" error
  toast was wrongly using "light it" wording).

### Deviations from the plan's literal contract shapes

- `ItemMeterKind` ships without a separate `'sharpness'` member — sharpness
  stayed its own `sharpnessPercent` field (as it already was), since folding
  it into a generic `meters[]` array would have touched the Merchant screens
  for no behavioural gain. The acceptance criteria (no anonymous `%`, correct
  labels, mixed-state Polish copy) are met either way.
- `ItemUseView` was scoped to consume + read (the two cases the plan gives
  concrete disabled-with-reason examples for). Equip/drop/place don't have an
  "impossible but visible" state today, so a real contract for them would
  have nothing meaningful to express yet.

### Verification

- `pnpm run type-check` (`vue-tsc --noEmit`): clean.
- `pnpm run lint` / `lint:fix`: clean.
- `pnpm run build`: succeeds.
- `pnpm run test`: 4586 passed, 3 failed — all 3 pre-existing and unrelated
  (`scripts/docs/plan-metadata.test.ts`'s status-normalization case,
  `src/player/worldWaterEligibility.test.ts` cave/water occupancy cases);
  confirmed failing identically on the pre-change tree via `git stash`.
- Added `src/items/inventoryView.test.ts`, `src/items/itemUseView.test.ts`,
  and extended `src/items/constructionMaterials.test.ts` — 20 new tests,
  covering tent coverage, meter semantics, mixed-state detection,
  `consumeUse`/`resolveConsumeUseView`/`resolveReadBookUseView`, and the
  material breakdown agreeing with `hasMaterial()` at zero/partial/sufficient.
- Browser/manual verification not performed per task instructions — the
  Manual verification section above is still the user's checklist to run.

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
