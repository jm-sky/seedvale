# Implementation Notes: ui-input-018 — Player combat mode and weapon toggle

## Ownership and recommended seam

- Keep `src/items/HeldTool.ts` unchanged as the physical one-hand authority. `HeldTool` already owns `held()` / `heldInstanceId()`, validates inventory ownership in `equip()`, clears via `unequip()`, and re-resolves maintained instances in `syncWithInventory()`.
- Keep `src/items/primaryWeapons.ts` unchanged as the configured primary-weapon authority. It already owns persisted `{ kind, instanceId }` choices, category validation, restore/export and inventory revalidation.
- Add a small runtime player-state/controller module, preferably `src/player/playerCombatMode.ts`, rather than putting state into Vue, `HeldTool`, `PrimaryWeaponSelection` or combat damage code. It should expose readable state for future NPC perception but own no inventory/weapon data.
- Minimal state is `activeWeapon: 'melee' | 'ranged' | null` plus `lastActiveWeapon: 'melee' | 'ranged'`. `activeWeapon !== null` is sufficient to derive `active`; avoid storing redundant booleans unless the implementation has a concrete need.

## Existing equip path to extend

`src/app/inventoryWiring.ts` is the current orchestration seam:

- `equipPrimary(choice)` extinguishes an active torch, calls `heldTool.equip(choice.kind, choice.instanceId)`, then refreshes held HUD/inventory.
- `equipPrimaryMeleeWeapon()` / `equipPrimaryRangedWeapon()` only select which `PrimaryWeaponChoice` is passed into that path.
- `equipTool()` is the ordinary Inventory equip path and also calls `primaryWeapons.noteEquipped()`; ordinary tool equip must not activate Combat Mode.
- `unequipTool()` is the existing normal hand-clear path.

Extend the primary equip helper to accept/know the category and mark Combat Mode active **only after** `heldTool.equip()` returns `true`. Reuse the same helper for HUD switching and keyboard draw; do not duplicate torch/equip logic in `gameLoop.ts` or Vue.

Add an explicit sheathe operation in this app/player action layer that calls `heldTool.unequip()`, keeps `lastActiveWeapon`, deactivates Combat Mode, then runs the same HUD/inventory synchronization. V1 intentionally leaves the hand empty.

## Reconciliation boundary

`createApp.ts`'s `syncHeldHud` is the high-leverage reconciliation point:

- it already projects `HeldTool` into `PlayerController.setHeldTool(...)` / held HUD,
- it calls `primaryWeapons.syncWithInventory(inventory)` before publishing primary labels,
- callers outside `inventoryWiring` also invoke it after direct hand mutations (for example `userActions.ts`; action modules also use the shared `syncHeldHud` callback).

After held-tool and primary-weapon synchronization, reconcile Combat Mode there against the **actual** hand and current primary choices. This catches drop/sell/removal, ordinary tool equip, direct action auto-equip/unequip, and invalidated primary instances without adding checks to combat code.

Reconciliation should compare category + selected weapon identity:

- inactive stays inactive regardless of what utility tool is held;
- active melee remains active only when the actual held kind/instance matches the current `primaryMelee()` choice;
- active ranged analogously matches `primaryRanged()`;
- any mismatch deactivates `activeWeapon` but should normally preserve `lastActiveWeapon`.

For maintained weapons compare the concrete `heldInstanceId()` with the post-`syncWithInventory()` primary choice. Do not keep Combat Mode active merely because another weapon of the same category is in hand.

Avoid recursion: reconciliation invoked from `syncHeldHud` should mutate only Combat Mode state, not call equip/unequip or `syncHeldHud` again.

## Keyboard integration

`src/input/Keyboard.ts` is the correct owner for the edge-triggered input bit. `KeyX` is free in the current `KEY_MAP`.

Add the new action consistently to:

- `KeyState`,
- `KEY_MAP` (`KeyX`),
- `EDGE_TRIGGERED`,
- initial state,
- the internal `consume(...)` union,
- returned `consume...` API.

`src/app/gameLoop.ts` already consumes edge-triggered UI/input actions each frame. Add consumption there and invoke one injected app action (e.g. `toggleCombatMode`) rather than teaching `gameLoop.ts` about primary selection or inventory.

Follow existing modal handling: the new edge must be consumed/drained in branches where other edge-triggered gameplay actions are drained so an `X` pressed while input is blocked cannot fire later. Do not add an independent DOM key listener.

## Toggle fallback policy

Keep fallback deterministic and based only on configured primaries:

1. if active → sheathe;
2. if inactive → try `lastActiveWeapon`;
3. if that category has no valid primary/equip fails because it is unavailable, try the other configured category;
4. if neither succeeds, remain inactive.

Default `lastActiveWeapon` can start as `melee`. Because draw still validates the configured primary at use time, this naturally means: melee first when available, otherwise ranged. No persistence is required.

A failed primary equip must not overwrite `lastActiveWeapon` or activate the mode.

## HUD/store wiring

Current shortcut flow is:

`createApp.ts` → `vueUi.configurePrimaryWeaponShortcuts(...)` → `src/ui-vue/store.ts` handler → Vue buttons.

Extend that existing facade instead of exposing the Combat Mode object to Vue. The UI needs only cheap presentation/action state, for example:

- active category (`null | melee | ranged`), published as HUD state;
- `equipMelee()`;
- `equipRanged()`;
- `sheathe()`.

`src/ui/createHud.ts` / `src/ui-vue/store.ts` already publish primary melee/ranged labels. Add the active-category projection alongside those labels rather than deriving it in components from held-item strings.

There are **two shortcut renderers that must stay consistent**:

- `src/ui-vue/screens/QuickActionsScreen.vue` — desktop HUD-side buttons;
- `src/ui-vue/screens/TouchChrome.vue` — touch controls.

Both currently render `Sword` / `BowArrow` based on `primaryMeleeLabel` / `primaryRangedLabel` and call the same store actions. Implement the same contextual mapping in both. Reuse one small store/computed helper if that avoids duplicating the mode→button mapping, but do not create a second gameplay state in Vue.

Use a Lucide icon already available in the dependency set for `Schowaj broń`; exact icon choice is presentation-only. Keep explicit `aria-label`s.

## Lifecycle / persistence

- `PrimaryWeaponSelection` is restored from `initialSave` in `createApp.ts`; do not change this persistence contract.
- Instantiate Combat Mode fresh on every `createApp()` runtime with `activeWeapon = null`; do not add `SaveData` fields or migrations.
- WorldBundle rebuild should not need special handling if the Combat Mode object is app/player lifetime rather than world-bundle lifetime. If rebuild clears/replaces held state, the existing `syncHeldHud` reconciliation must deactivate it.
- App teardown needs no persisted cleanup; normal object lifetime is sufficient unless implementation adds listeners (it should not).

## Tests to add/extend

Prefer a focused `src/player/playerCombatMode.test.ts` for state/reconciliation policy plus small orchestration tests around primary draw/sheathe if the controller itself does not own `HeldTool` actions.

Existing useful coverage/seams:

- `src/items/primaryWeapons.test.ts` already covers selection/instance synchronization; do not duplicate those tests.
- `src/items/HeldTool.ts` behavior should remain unchanged.
- Add input coverage for `KeyX` only if `Keyboard` has an existing unit-test pattern; otherwise the action/controller tests are higher value.
- Component tests are optional; if there is no cheap existing Vue convention, cover contextual mapping as a pure/store-level helper and leave visual verification to the user.

Critical cases beyond the plan list:

- active primary instance is removed but another same-kind instance remains: `PrimaryWeaponSelection` may re-resolve to the replacement, while `HeldTool` also re-resolves; Combat Mode may remain active only if both resolve to the same concrete instance after synchronization;
- direct non-primary weapon/tool equip through `equipTool()` deactivates mode through reconciliation, even if the item is itself melee-capable;
- direct hand mutation from non-inventory action code is caught by `syncHeldHud` rather than requiring each caller to know about Combat Mode.

## Files expected to change

Primary implementation surface:

- `src/player/playerCombatMode.ts` (+ focused test)
- `src/app/inventoryWiring.ts`
- `src/app/createApp.ts`
- `src/app/gameLoop.ts`
- `src/input/Keyboard.ts`
- `src/ui/createHud.ts`
- `src/ui-vue/store.ts`
- `src/ui-vue/screens/QuickActionsScreen.vue`
- `src/ui-vue/screens/TouchChrome.vue`

Do not modify `src/combat/*`, NPC decision/threat modules, `SaveData`, weapon catalog stats or attack state machines for this plan.

Add JSDoc with `@domain ui-input` to the new runtime Combat Mode owner/public operations so preflight can find the state later when NPC reactions are planned.

> **Zrób git commit i push do main, rebase jeżeli trzeba**