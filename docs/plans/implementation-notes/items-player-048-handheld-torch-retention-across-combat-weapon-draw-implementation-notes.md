# Implementation Notes: Handheld Torch Retention Across Combat Weapon Draw

**Reviewed:** 2026-09-19  
**Plan:** `items-player-048-handheld-torch-retention-across-combat-weapon-draw.md`  
**Codebase baseline:** `main`

## Architectural summary

The smallest coherent change is to keep the existing single `HeldTool` slot authoritative for tools/weapons and make `PlayerTorch` own a second **presentation-only carry mode** for an already-lit `wooden_torch`.

Do not add an off-hand inventory/equipment slot. The torch item remains owned by `Inventory`; lit/fuel state remains owned by `PlayerTorch`; combat draw/sheathe remains owned by `PlayerCombatMode` + `HeldTool`.

Important current-code detail: UBC wooden-torch presentation already uses the **left hand** in normal carry. `PlayerController.handSocket()` returns `leftWrist` when `heldToolKind === 'wooden_torch'`; other held tools use `rightWrist`. The problem is therefore not “add off-hand” but that drawing a weapon changes the held-tool kind and the current inventory wiring explicitly extinguishes the torch.

## 1. Exact current ownership

### `src/items/HeldTool.ts`

`createHeldTool()` is deliberately a one-slot state machine:

- `held()`
- `heldInstanceId()`
- `equip()`
- `unequip()`
- `syncWithInventory()`

Keep it unchanged unless a tiny type/comment adjustment is required. A belt-mounted torch must **not** appear as another held slot.

### `src/player/PlayerTorch.ts`

`createPlayerTorch()` owns:

- lit/unlit,
- source (`branch | wooden_torch`),
- fuel remaining,
- flame runtime,
- point light registration,
- mount lifecycle.

This is the correct owner for `TorchCarryMode = 'hand' | 'belt'` or equivalent.

Current `light('wooden_torch')` builds the flame/light group and mounts it using `hand.handSocket()` + `HELD_ATTACH.wooden_torch`. Carry-mode switching should reuse the already-live torch runtime and only remount/reposition it. Do not call `light()` again when changing carry mode because that would reset/recreate semantic state.

A presentation-only carry change should not fire `onIgnite`/`onExtinguish` and should preferably not call `onChange`, because `onChange` currently re-enters `syncHeldHud()`.

### `src/player/PlayerController.ts`

Relevant symbols:

- `handSocket()`
- `getHeldToolObject()`
- `setHeldTool()`
- `rightWrist`
- `leftWrist`

Current behavior:

```
heldToolKind === 'wooden_torch' + UBC left wrist present
→ leftWrist

everything else
→ rightWrist ?? modelRoot
```

This is why normal wooden-torch carry is already effectively left-hand carry.

Add one stable accessor/group for belt/body torch presentation here rather than placing offsets in app wiring. The exact visual placement does **not** need to be polished by the implementation agent.

Recommended contract:

- expose a `torchBeltSocket()` / `bodyCarrySocket()` returning an `Object3D`,
- parent that socket to a stable player/model node,
- keep its offset/rotation constants together in one obvious place,
- use an approximate hip/belt placement only.

Do not spend implementation time tuning exact placement or clipping. The user will manually tune position/rotation afterwards. Correctness requirement is only: follows the player, is approximately around the belt/hip, does not occupy the weapon hand, and does not duplicate.

A dedicated pelvis/hip bone is optional, not a blocker. If no already-established semantic body anchor exists, a model-local `Group` is acceptable for this plan.

### `src/items/heldToolVisual.ts`

Relevant symbols:

- `HELD_ATTACH.wooden_torch`
- `mountAttachOnSocket()`
- `findRightHandSocket()`
- `findUbcLeftHandSocket()`

The normal hand grip is already centralized here. Do not distort `HELD_ATTACH.wooden_torch` to serve both hand and belt: the belt/body placement is a different presentation context and should have its own compact constants, ideally near the new belt socket/carry mounting code.

Avoid adding “perfect” per-rig offsets. One approximate initial transform with explicit TODO/manual-tuning-friendly constants is enough.

## 2. Current combat seam that causes the bug

### `src/app/inventoryWiring.ts`

The important existing functions are:

- `equipTool()`
- `unequipTool()`
- `equipPrimary()`
- `equipPrimaryMeleeWeapon()`
- `equipPrimaryRangedWeapon()`
- `sheatheCombatWeapon()`
- `toggleCombatMode()`

Today both `equipTool()` and `equipPrimary()` do:

```
if (playerTorch.isLit()) playerTorch.extinguish()
```

That explicit extinguish is the direct cause of losing cave light.

For `equipPrimary()` only, replace this with the combat carry transition:

1. if lit source is `wooden_torch`, move presentation to belt;
2. equip the selected weapon through existing `HeldTool.equip()`;
3. call `playerCombatMode.noteDrawn(category)`;
4. run existing HUD/reconciliation.

For lit `branch`, preserve current single-hand behavior; do not belt-mount it.

For ordinary utility `equipTool()`, keeping current extinguish behavior is acceptable and keeps scope bounded.

### Sheathe ordering

Current `sheatheCombatWeapon()` calls:

```
playerCombatMode.noteSheathed()
unequipTool()
```

But `unequipTool()` currently extinguishes any lit torch. This must be adjusted so combat sheathe can restore a lit wooden torch to hand without routing through a helper that destroys it.

Prefer either:

- a combat-specific internal unequip path that only clears `HeldTool`, then sets torch carry back to hand, or
- refactor `unequipTool()` with a narrowly named option/helper so its semantics remain explicit.

Do not make every generic unequip preserve torch state accidentally.

## 3. Reconciliation and HUD

### `src/app/createApp.ts::syncHeldHud()`

This is the high-leverage projection point for:

- `HeldTool` → player visual,
- torch label,
- `PlayerCombatMode.reconcile()`,
- primary weapon HUD.

Current wooden-torch special case only recognizes:

```
playerTorch.isLit()
&& playerTorch.source() === 'wooden_torch'
&& held === 'wooden_torch'
```

After this plan a lit wooden torch may coexist with `held === <combat weapon>`. Do not make HUD reconciliation “fix” that by extinguishing or re-equipping the torch.

Recommended projection:

- `HeldTool` continues to determine weapon/tool hand visual;
- `PlayerTorch` independently determines portable-light presentation;
- if combat weapon is active and torch is lit, HUD held-tool/combat label may continue to show the weapon as the active held item;
- no requirement to show a second “torch on belt” HUD field.

Keep `syncHeldHud()` idempotent.

## 4. Inventory-loss guard is currently coupled to held-tool identity

### `src/app/inventoryWiring.ts::dropItems()`

Current code does:

```
heldTool.syncWithInventory()
if (
  playerTorch.isLit()
  && playerTorch.source() === 'wooden_torch'
  && heldTool.held() !== 'wooden_torch'
) {
  playerTorch.extinguish()
}
```

That predicate becomes wrong after the plan because a valid lit belt torch intentionally coexists with a held sword.

Change the guard to check **inventory ownership of `wooden_torch`**, not whether it is the current `HeldTool`.

The same rule should be applied to any sell/trade path that can remove the final wooden torch while it is lit. `afterTrade()` and `sellInventoryInstances()` already call `heldTool.syncWithInventory()` and shared sync hooks; ensure torch validity is reconciled against inventory there as well.

Preferred invariant:

```
lit wooden_torch
→ inventory must still own >= 1 wooden_torch
otherwise → extinguish exactly once
```

Do not tie torch validity to hand occupancy.

## 5. Explicit extinguish action

### `src/app/userActions.ts`

Existing portable-light action ownership already lives here:

- `availableLightBranch()`
- `lightBranch()`
- `availableLightWoodenTorch()`
- `lightWoodenTorch()`

Add the extinguish action here, not directly in Vue.

Suggested shape:

- availability: lit portable torch,
- action: `playerTorch.extinguish()`, then `syncHeldHud()`,
- no inventory mutation,
- no new action system.

This same action should back any Quick Actions button. A keyboard shortcut is optional and not required.

Use the existing Quick Actions configuration/store bridge rather than adding a new independent callback pipeline.

## 6. Persistence / restore

### `src/app/saveState.ts`

Persistence already serializes only:

```
playerTorch: {
  source,
  fuelRemaining
}
```

Do not add carry mode.

### `src/app/createApp.ts` restore

Current restore ensures a saved `wooden_torch` is equipped in `HeldTool` before calling `playerTorch.light(..., { fuelRemaining, silent: true })`.

Combat Mode starts inactive, so restored lit wooden torch should remain normal left-hand carry.

No save migration is required.

## 7. Runtime mounting approach

Avoid rebuilding the complete flame/light state during every draw/sheathe toggle.

A clean implementation is:

1. `PlayerTorch` stores current carry mode.
2. The live torch mount/group can be detached from its current parent.
3. Reapply the appropriate transform:
   - hand → existing wooden-torch hand attach;
   - belt → dedicated approximate belt attach.
4. Parent to the new socket.
5. Preserve:
   - `fuelRemaining`,
   - flame object,
   - registered `PointLight`,
   - current source/lit state.

If the current mount structure makes safe reparenting awkward, rebuilding only the **presentation group** is acceptable as long as semantic state and fuel are preserved and old runtime resources are disposed/unregistered correctly. Do not route that through `light()`.

Watch `alignLocalYToWorldUp()`: flame orientation is corrected from parent world transform. It must continue to run correctly after belt reparenting.

## 8. Async/lifecycle trap

`PlayerTorch.light()` uses `loadToken` for stale async loads. Carry changes should not invalidate an in-progress semantic light operation accidentally.

`PlayerController.setHeldTool()` has its own `heldToolLoadToken` for weapon/tool GLBs. Keep torch carry mounting independent from that token; drawing a weapon must not make a late torch mount attach to the wrong hand.

## 9. Suggested implementation order

1. Add runtime carry-mode API and belt/body socket.
2. Make `PlayerTorch` switch mount presentation without semantic light changes.
3. Change `equipPrimary()` and combat sheathe flow.
4. Fix inventory-ownership reconciliation for lit wooden torch.
5. Add explicit extinguish user action and Quick Actions exposure.
6. Add focused tests.
7. Leave belt transform constants easy for manual tuning.

## 10. Focused tests

The most valuable automated tests are at the state/wiring seam rather than exact Three.js coordinates:

- lit wooden torch + primary melee draw → still lit;
- carry mode becomes belt while combat active;
- sheathe → carry mode becomes hand;
- fuel does not reset on carry switch;
- explicit extinguish works while belt-mounted;
- removing final `wooden_torch` from inventory extinguishes it even if a sword is held;
- repeated draw/sheathe does not create duplicate active light registrations;
- branch behavior remains unchanged;
- restore of lit wooden torch starts in hand mode.

Do not write brittle tests asserting exact belt position/rotation values.

## 11. Manual tuning boundary

The implementation agent is **not responsible for final belt placement quality**.

Initial transform only needs to put the torch approximately near the player belt/hip and keep it usable during combat. Put translation/rotation/scale in a single obvious constant block so the user can tune it manually later.

Do not spend time on exhaustive animation-by-animation clipping fixes.

## Files to inspect first

- `src/player/PlayerTorch.ts`
- `src/player/PlayerController.ts`
- `src/items/heldToolVisual.ts`
- `src/app/inventoryWiring.ts`
- `src/app/createApp.ts`
- `src/app/userActions.ts`
- existing Quick Actions configuration/store bridge
- `src/app/saveState.ts`

Related established behavior:

- `src/items/HeldTool.ts`
- `src/player/playerCombatMode.ts`
- `docs/plans/ui-input-018-player-combat-mode-and-weapon-toggle.md`

> **Zrób git commit i push do main, rebase jeżeli trzeba**
