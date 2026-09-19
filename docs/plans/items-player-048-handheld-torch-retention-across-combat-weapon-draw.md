# Plan: Handheld torch retention across combat weapon draw

**Created:** 2026-09-19  
**Status:** `planned` 📋  
**Type:** polish  
**Priority:** medium · **Effort:** S  
**Depends on:** ~~ui-input-018~~  
**Domain:** `items-player`  
**Subdomains:** `inventory` `items` `interaction`  
**Tags:** `torch` `combat-mode` `held-tool`  
**Roadmap:** -

## Problem

Portable light currently competes with combat weapons for the same held-tool / right-hand presentation.

Current flow:

```
lit wooden torch in hand
→ draw primary weapon
→ inventoryWiring equips weapon
→ playerTorch is extinguished
→ cave becomes dark
```

This is inconvenient in caves and other dark spaces. We do not currently have a suitable animation set for simultaneously presenting a combat weapon in one hand and a torch in the other, so the fix must not introduce true dual-wield/off-hand combat.

## Goal

Keep a lit wooden torch active while the player temporarily draws a combat weapon.

Desired flow:

```
lit wooden torch in normal hand carry
→ draw primary melee/ranged weapon
→ torch remains lit and moves to a belt/body carry mount
→ weapon uses the existing held-tool hand and existing combat animation
→ sheathe weapon
→ torch automatically returns to its normal hand carry
```

The player must also have an explicit UX action to extinguish/stow the torch when they no longer want the light.

## Current architecture to reuse

Verified on `main`:

- `src/items/HeldTool.ts`
  - owns the single logical held tool/weapon slot;
  - must remain a single-slot system for this plan.
- `src/player/PlayerTorch.ts`
  - owns lit/source/fuel runtime;
  - currently mounts portable torch visuals/light on `hand.handSocket()`;
  - already owns torch VFX/light lifecycle and save-restorable fuel state.
- `src/app/inventoryWiring.ts`
  - `equipTool()`, `equipPrimary()` and `unequipTool()` currently extinguish `PlayerTorch`;
  - `sheatheCombatWeapon()` goes through the existing Combat Mode / HeldTool path.
- `src/app/createApp.ts`
  - `syncHeldHud()` is the central reconciliation point between `PlayerTorch`, `HeldTool`, player visual and Combat Mode.
- `src/player/PlayerController.ts`
  - owns player model sockets and held-tool visual mounting;
  - already resolves hand sockets and is the correct place to expose a stable body/belt attachment point if one does not already exist.
- `src/app/userActions.ts`
  - owns the existing light-branch / light-wooden-torch actions and availability contracts.
- existing Combat Mode from `ui-input-018`
  - remains authoritative for draw/sheathe state.

Do not create a second equipment system, a generic off-hand inventory slot, or torch-specific combat animations.

## Scope

### 1. Add torch carry presentation mode

Extend `PlayerTorch` with a small runtime-only carry mode for a lit `wooden_torch`:

```ts
type TorchCarryMode = 'hand' | 'belt'
```

or an equivalent minimal API.

Requirements:

- changing carry mode must not:
  - extinguish the torch,
  - reset burn duration,
  - recreate authoritative torch state,
  - consume another item,
  - play ignite/extinguish audio;
- only presentation/mounting changes;
- existing VFX/light remains owned by `PlayerTorch`;
- switching `hand ↔ belt` must cleanly detach/re-attach without leaking meshes/lights;
- carry mode is runtime-only and derived from current gameplay state.

Preferred API shape is a method such as:

```
playerTorch.setCarryMode('hand' | 'belt')
```

Exact naming may follow current module style.

### 2. Belt/body attachment point

Provide one stable player attachment point suitable for a lit torch while a weapon is drawn.

Prefer extending the existing player visual/socket ownership in `PlayerController` / `heldToolVisual.ts` rather than hardcoding world-space offsets in `inventoryWiring` or `createApp.ts`.

The belt-mounted torch should:

- follow the player skeleton/body,
- remain visually plausible during existing combat locomotion/attacks,
- keep flame/light aligned correctly,
- avoid occupying the weapon hand,
- avoid introducing new combat animations.

The mount may be a bone/socket if the current UBC/player rigs provide a stable candidate, otherwise a player-model-local attachment group with a single centralized offset is acceptable.

### 3. Weapon draw must preserve lit wooden torch

Change the combat/equip flow so drawing a primary weapon no longer extinguishes an already-lit `wooden_torch`.

For a lit wooden torch:

```
draw weapon
→ set torch carry = belt
→ equip weapon through existing HeldTool
→ Combat Mode continues unchanged
```

The weapon remains the only `HeldTool`.

Do not represent the belt torch inside `HeldTool`.

### 4. Weapon sheathe restores normal torch carry

When Combat Mode is sheathed:

```
weapon unequipped
→ if wooden torch is still lit and owned
→ torch returns automatically to normal hand carry
```

This must reuse the existing `sheatheCombatWeapon()` / reconciliation path rather than adding a parallel keyboard-specific behavior.

The restore should work for:

- keyboard `X`,
- desktop HUD combat control,
- touch combat control,
- any other caller of the shared sheathe path.

### 5. Other held tools

This plan is primarily about combat weapon draw/sheathe.

For ordinary utility tools, keep existing single-hand semantics unless a clean shared rule falls out naturally from the same reconciliation.

Do not broaden the scope into a general two-hand/off-hand equipment redesign.

At minimum:

- equipping a non-combat held tool must not produce duplicate hand meshes;
- torch carry state must remain internally coherent;
- if current behavior extinguishes/stows the torch for utility tools, that may remain unchanged.

### 6. Explicit extinguish/stow UX

Add a direct player action for turning off the portable torch.

Preferred behavior:

```
lit portable torch
→ "Zgaś pochodnię" action
→ playerTorch.extinguish()
→ existing HUD/action availability refresh
```

Expose it through the existing Quick Actions / action contract path rather than a bespoke Vue-only mutation.

If a dedicated keyboard shortcut is added, it must call the same shared action. A new shortcut is optional; a visible Quick Actions button is sufficient for this plan.

Do not consume the `wooden_torch` item when extinguishing.

### 7. Branch behavior

A lit branch remains a temporary one-hand light and is not part of the belt-carry feature.

Current branch semantics may remain:

- occupies the hand,
- drawing/equipping another tool may end/replace that carry state according to current behavior.

Do not add a burning branch to the belt.

### 8. Persistence and restore

Do not add persisted carry-mode state.

Persistence continues to store the existing torch source/fuel state only.

On load:

- Combat Mode already starts inactive;
- a restored lit wooden torch should restore into normal hand carry;
- later weapon draw derives belt carry at runtime.

This avoids stale save data such as "belt-mounted torch while no weapon is drawn".

### 9. Reconciliation ownership

Avoid scattering `setCarryMode()` calls across unrelated UI components.

The intended ownership is:

```
Combat Mode + HeldTool + PlayerTorch
        ↓
shared inventory/reconciliation seam
        ↓
torch presentation mode
```

Use `inventoryWiring.ts` and/or the existing `syncHeldHud()` reconciliation point so all input surfaces converge on one behavior.

The implementation must avoid feedback loops where:

```
syncHeldHud
→ remount torch
→ onChange
→ syncHeldHud
→ ...
```

Changing only carry presentation should therefore not emit the same semantic lit-state change notification unless necessary.

## Non-goals

- true left-hand/right-hand equipment system,
- dual wield,
- shield support,
- torch + sword bespoke animations,
- new combat animations,
- changing combat damage/stamina/recovery,
- lantern item,
- torch fuel rebalance,
- standing torch changes,
- general equipment-slot redesign,
- persisting carry mode.

## Expected files

Primary:

- `src/player/PlayerTorch.ts`
- `src/player/PlayerController.ts`
- `src/items/heldToolVisual.ts`
- `src/app/inventoryWiring.ts`
- `src/app/createApp.ts`
- `src/app/userActions.ts`

Likely tests/UI integration:

- `src/app/inventoryWiring.test.ts` or nearest existing inventory/combat wiring tests
- `src/app/userActions.test.ts`
- `src/player/PlayerTorch.test.ts` if present / appropriate
- existing Combat Mode tests where the shared seam can be covered
- Quick Actions Vue/store/facade files that already expose user actions

Implementation should follow the actual current file boundaries if they have moved.

## Acceptance criteria

- lighting a `wooden_torch` behaves as before;
- drawing a configured melee weapon while that torch is lit does not extinguish it;
- the torch leaves the weapon hand and is visibly carried at the belt/body;
- existing melee attack animation and weapon mesh remain unchanged;
- drawing a ranged weapon also does not create a duplicate hand mesh;
- sheathing the weapon automatically returns the still-lit torch to normal hand carry;
- repeated draw/sheathe cycles do not reset torch fuel;
- repeated draw/sheathe cycles do not duplicate meshes, flames or PointLights;
- extinguishing the belt-mounted torch works and leaves the weapon state unchanged;
- explicit "Zgaś pochodnię" UX works in normal hand carry as well;
- dropping/selling/removing the wooden torch while lit cannot leave an orphaned visual/light;
- inventory reconciliation cannot restore a torch visual for an item no longer owned;
- save/load of a lit wooden torch continues to restore its remaining fuel;
- restored torch begins in normal hand carry because Combat Mode is inactive;
- lit branch behavior is unchanged;
- no true off-hand/dual-wield equipment system is introduced.

## Automated verification

Run focused tests first, then the normal project checks required by `CLAUDE.md`.

At minimum cover:

1. lit wooden torch → draw melee → torch remains lit;
2. draw → sheathe → torch returns to hand;
3. fuel value is unchanged except normal elapsed burn time;
4. extinguish while weapon is drawn;
5. inventory loses wooden torch while lit;
6. repeated draw/sheathe does not leak/duplicate runtime objects;
7. restored lit torch starts in hand carry.

Then:

```
pnpm exec tsc --noEmit
pnpm run lint
pnpm run test
pnpm run build
```

## Manual verification

User verifies in browser:

1. enter a dark cave;
2. light the wooden torch;
3. draw the primary sword;
4. confirm the cave remains lit and the sword animation is normal;
5. confirm the torch is visible at the belt/body and not duplicated in the hand;
6. attack several times and move/sprint;
7. sheathe the sword with `X`;
8. confirm the torch returns automatically to normal hand carry;
9. repeat several draw/sheathe cycles;
10. use the explicit "Zgaś pochodnię" action both with weapon sheathed and drawn;
11. save/load with a partially burned lit torch and confirm remaining fuel continuity.

## JSDoc

Add/update JSDoc for the carry-mode contract and any new public player attachment accessor so preflight clearly shows ownership.

Prefer `@domain items-player` on important architectural symbols.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
