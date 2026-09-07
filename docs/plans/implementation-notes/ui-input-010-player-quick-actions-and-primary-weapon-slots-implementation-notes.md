# Implementation notes: ui-input-010 player quick actions and primary weapon slots

## Current code reality

- `src/items/primaryWeapons.ts` already owns `PrimaryWeaponChoice { kind, instanceId }` and deterministic maintained-instance fallback (`getInstances(kind)[0]`). Keep this type/module as the authority; change `noteEquipped()` from unconditional replacement to “populate only when slot is empty”, and add explicit melee/ranged setters plus restore/export seams. Do not add a second favorites/equipment model.
- `src/app/inventoryWiring.ts` is the existing equip/mutation integration point. Successful ordinary equip already calls `primaryWeapons.noteEquipped(...)`; inventory mutations already converge through held/primary resync. Preserve that flow rather than teaching individual drop/sell actions about primary slots.
- `src/ui/createInventoryScreen.ts` + `src/ui-vue/store.ts` are the facade/state boundary for Inventory. `InventoryScreenItemDetails.vue` currently only receives kind-level selection, while maintained weapons are rendered as grouped instance rows. Explicit assignment of a maintained weapon therefore needs an instance-aware callback/state seam; do not silently assign an arbitrary instance when the user clicked a concrete row.
- `src/ui/createQuickActions.ts` is still the compatibility facade; `src/ui-vue/screens/QuickActionsScreen.vue` is presentation only. New eat/cook handlers belong in the facade/store wiring, not in Vue domain logic.

## Persistence

- Current save schema is `CURRENT_SAVE_VERSION = 6` in `src/persistence/saveData.ts`. The file now explicitly requires a version bump + `SAVE_MIGRATIONS` step whenever persisted representation/semantics change. For these new required player preferences, follow that current convention (v6 → v7) rather than the older optional-field pattern used by some pre-migration features.
- Prefer a small save shape containing the two `PrimaryWeaponChoice | null` values; ownership/counts/stats remain in `inventory` / `inventoryInstances`.
- `src/app/saveState.ts::SaveStateDeps/buildSaveData()` must receive/read `PrimaryWeaponSelection` and serialize it there. `createApp.ts` currently constructs `heldTool` from the save and then `createPrimaryWeaponSelection()` empty; restore the saved choices during construction, then call `syncWithInventory()` after the authoritative inventory/instances are restored.
- Validation should accept only valid weapon kinds for the corresponding slot and `instanceId: string | null`; malformed entries should migrate/default to `null`, not reject the whole save. `syncWithInventory()` remains the final authority for whether a restored choice is actually carried.

## Food resolver

- Use `ITEM_CATALOG[kind].consumable` and require `need === 'hunger'`; this excludes water/medicine without another classification table.
- Freshness is batch-level in `Inventory`: `getFoodBatches(kind)` returns `{ count, acquiredAtDays }`. Use the existing freshness helpers in `src/items/foodFreshness.ts` with current `dayNight.elapsedDays`; do not infer freshness from aggregate counts.
- `SurvivalActions.consumeItem(kind)` already owns the actual removal/effect path, including freshness validation. The resolver should only return an `ItemKind | null`.
- Final tie-breaking should use a fixed `ItemKind` ordering derived from an existing stable item list/catalog iteration, not Map insertion order from runtime inventory mutation.

## Cook-meal intent: lifecycle seam is currently missing

The plan cannot be implemented correctly by only adding a controller. Two existing APIs hide the completion information the controller needs:

1. `src/app/busyAction.ts` supports internal `onComplete` / `onCancel`, but `SurvivalActions.startIgniteFire()` and `startCookAt()` expose only the initial `ActionResult`. Their completion callbacks can later abort because state changed (fuel/input/fire/inventory), with no signal to an external orchestrator.
2. `src/app/actions/placementPreviewActions.ts` has `start(): void`; `confirm()` exits preview and discards the `ActionResult` returned by the fire builder. `cancel()` only returns whether a preview existed. There is no “confirmed successfully / cancelled / failed” continuation and no created-fire identity.

Add the smallest explicit lifecycle seam needed by `cook-meal`; do not poll `busy.isActive()`, watch UI state per frame, or infer success from inventory changes. A suitable shape is optional callbacks/result hooks on the existing actions/preview API so normal callers stay unchanged. The intent must continue only after the action's *final* revalidation/mutation succeeds, and cancel on BusyAction cancellation or final-validation failure.

For fire placement, return/expose the newly created `PlacedFireEntry` (or at minimum its id) from the existing authoritative `buildSimpleFire` path. Today `src/app/userActions.ts::buildSimpleFire()` discards `bundle.placedFires.place(...)`'s return value. Do not locate the “new fire” afterwards by nearest-fire heuristics.

## Fire selection / creation

- `src/settlement/PlacedFires.ts` already exposes `list()` with live `PlacedFireEntry`/`VillageFire` objects, but only for player-placed fires. Settlement campfires are separate live `VillageFire`s, so a cooking-target resolver cannot rely only on `bundle.placedFires` if settlement fires are meant to qualify. Reuse the same fire registrations/interactable source used by world interaction if possible rather than inventing a parallel global fire registry.
- Use `INTERACT_RANGE` from `src/app/interactables.ts` unless current cooking interaction exposes a narrower canonical radius. Resolve from `player.mesh.position`, never camera position.
- Resolver order should be deterministic: lit before unlit, then squared distance, then stable fire id/order. Do this only at phase transitions/revalidation, not every frame.
- `simple` is confirmed cook-capable and `PlacedFires.place(..., 'simple')` starts it lit. `src/app/userActions.ts::buildSimpleFire()` currently requires `fire_starting` + 2 branches, consumes the branches and places the lit fire. Therefore the create-fire branch will normally skip the separate ignition phase after successful placement. Preserve these existing costs/rules.
- Placement must still go through `placementPreviewActions` + `userActions.buildSimpleFire`; do not call `placedFires.place()` from the intent controller.

## Controller ownership / lifecycle

- Put the controller in app/player action wiring, near `createApp.ts` / `src/app/actions/`, not under `ui-vue`.
- Store only transient phase + stable identifiers needed to re-resolve world state. Avoid retaining a `VillageFire`/`PlacedFireEntry` across world rebuild; resolve by id/current registries before each phase.
- `createApp.ts` already owns BusyAction cancellation, preview cancellation and world-bundle rebuild/new-game/load lifecycles. Hook controller cancellation into those same teardown/reset paths. Do not persist an active intent.
- Starting `cook-meal` while another intent is active should use one controller cancellation path. It still must respect existing `isActionBlocked`/BusyAction gating; the controller must never bypass it to advance phases.

## Cooking result

- Reuse `findCookingBatch()` / `resolveCookingCapacity()` from `src/items/campfireCooking.ts`; do not add a second recipe list.
- Current `findCookingBatch()` chooses the first recipe in `COOKING_RECIPES` for which input exists. The intent should not preselect and retain a recipe across async phases; `startCookAt()` must remain authoritative and re-resolve current state.
- For the final eat step, re-run the sensible-food resolver after cooking. If restricting to cooked output, derive eligible output kinds from `COOKING_RECIPES` rather than hardcoding `roasted_meat` / `roasted_fish`.

## Tests worth adding

- Extend `primaryWeapons` tests around explicit assignment, first-equip-only initialization, maintained-instance fallback and save restore/sync.
- Food resolver tests should exercise real `Inventory` food batches + elapsed-day freshness, including deterministic ties.
- Test the intent controller with fake lifecycle seams rather than Vue: success/failure/cancel for placement, ignition and cooking; teardown; state change between phases; created simple fire continuing directly to cook because it is already lit.
- Add focused tests for any new placement/survival lifecycle callback contract so a final-validation failure cannot accidentally trigger the next phase.

## Related implementation

- `ui-input-007` established `ActionResult`/`ActionAvailability`; keep those for initial validation. Do not overload `ActionResult` to pretend it represents asynchronous completion.
- `items-player-018` already expects the single-active player-intent mechanism from this plan; keep the controller small and reusable enough for another multi-stage player intent, but do not build a workflow engine.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
