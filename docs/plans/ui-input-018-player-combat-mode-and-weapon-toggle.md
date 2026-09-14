# Plan: Player combat mode and weapon toggle

**Created:** 2026-09-14
**Status:** `planned` 📋
**Priority:** medium · **Effort:** S
**Depends on:** none
**Domain:** `ui-input`
**Type:** `feature`
**Subdomains:** `input` `hud` `interaction`
**Tags:** `combat` `weapons` `held-tool`
**Roadmap:** -

## Goal

Add an explicit player Combat Mode that makes drawing, switching and sheathing the configured primary weapons fast and predictable without opening Inventory.

Combat Mode is player state, not a second combat implementation. Existing melee/ranged attack systems, `HeldTool`, `PrimaryWeaponSelection`, inventory ownership and weapon instances remain authoritative.

This first version only establishes the player-facing state and controls. NPC perception/reactions to a player with a drawn weapon are intentionally deferred.

## Current architecture to preserve

Recon against current `main` confirms:

- `src/items/HeldTool.ts` owns the single item currently held in the player's hand.
- `src/items/primaryWeapons.ts` owns explicit, persisted `primaryMelee` and `primaryRanged` choices as `{ kind, instanceId }`.
- `PrimaryWeaponSelection.syncWithInventory()` already invalidates choices when the corresponding weapon is no longer owned and re-resolves maintained instances using existing inventory rules.
- `src/app/inventoryWiring.ts` already exposes `equipPrimaryMeleeWeapon()` and `equipPrimaryRangedWeapon()` and resolves both through the normal `HeldTool.equip(kind, instanceId)` path.
- `src/ui-vue/screens/QuickActionsScreen.vue` already renders HUD-side melee/ranged shortcut buttons and invokes `equipPrimaryMelee()` / `equipPrimaryRanged()` from `src/ui-vue/store.ts`.
- `src/input/Keyboard.ts` owns edge-triggered keyboard actions and currently has no combat-mode/draw-sheathe action.
- player melee/ranged combat already reads the held weapon through the existing combat pipeline. Do not add a second weapon/combat owner.

## 1. Explicit player Combat Mode

Add one small authoritative player-side state representing whether the player currently has a primary combat weapon drawn.

Conceptually it needs to answer:

```text
active: boolean
activeWeapon: melee | ranged | null
lastActiveWeapon: melee | ranged
```

Exact naming/location should follow current player/app ownership conventions, but the state must not live in Vue and must not duplicate `HeldTool` ownership.

### State meaning

- `active = false` means the player is not in Combat Mode and no primary combat weapon is considered drawn.
- `active = true, activeWeapon = melee` means the selected primary melee weapon is the active drawn weapon.
- `active = true, activeWeapon = ranged` means the selected primary ranged weapon is the active drawn weapon.
- `lastActiveWeapon` remembers which successful primary weapon draw/switch happened most recently so keyboard toggle can draw the same category again after sheathing.

`HeldTool` remains the physical single-hand authority. Combat Mode must never invent a second equipped weapon slot or copy weapon stats/instances.

## 2. Entering and switching Combat Mode

The two existing primary weapon actions become Combat Mode entry/switch actions while continuing to use their current authoritative selection and equip path.

### Primary melee action

```text
primary melee exists and can be equipped
→ HeldTool.equip(primary melee)
→ Combat Mode active
→ activeWeapon = melee
→ lastActiveWeapon = melee
```

### Primary ranged action

```text
primary ranged exists and can be equipped
→ HeldTool.equip(primary ranged)
→ Combat Mode active
→ activeWeapon = ranged
→ lastActiveWeapon = ranged
```

State changes occur only after `HeldTool.equip()` succeeds. A missing/invalid primary choice or failed equip must not put Combat Mode into a state that disagrees with the hand.

Switching melee ↔ ranged is the same operation as drawing that primary weapon; do not create a separate swap pipeline.

Existing torch conflict behaviour in `inventoryWiring` remains authoritative: if primary-weapon equip currently extinguishes a lit torch before equipping, Combat Mode reuses that path rather than adding special torch rules.

## 3. Sheathing

Add one explicit `sheatheCombatWeapon()` operation.

When Combat Mode is active:

```text
remember current category as lastActiveWeapon
→ clear the held primary combat weapon through the existing HeldTool unequip path
→ Combat Mode inactive
→ activeWeapon = null
```

For V1, sheathing leaves the hand empty. It does not restore a previously held shovel, fishing rod, torch or other utility item.

Do not interpret ordinary inventory `Unequip` of arbitrary tools as a new combat system. If current lifecycle code can remove/change the held weapon outside Combat Mode, Combat Mode must reconcile safely so it cannot remain `active` when its expected primary weapon is no longer held.

## 4. Keyboard toggle

Add one edge-triggered keyboard action in `src/input/Keyboard.ts`, using an currently unassigned key after verifying the live key map during implementation. `KeyX` is the preferred default if still free.

Behaviour:

```text
Combat Mode active
→ sheathe

Combat Mode inactive
→ draw lastActiveWeapon
```

If `lastActiveWeapon` has no currently valid configured primary weapon:

1. try the other configured primary category if one exists;
2. if neither valid primary weapon exists, remain out of Combat Mode and do nothing except optional concise existing-style feedback.

Do not auto-select an arbitrary weapon from inventory. Primary weapon configuration remains explicit player choice.

The keyboard action must be drained through the same edge-trigger/consumer conventions as other actions so a key press cannot latch across modal/world state changes.

## 5. Adaptive HUD weapon buttons

Keep the existing two-button HUD location and existing primary melee/ranged configuration, but make the actions contextual.

### Combat Mode inactive

Show the currently configured shortcuts as today:

```text
[Melee]  → draw primary melee
[Ranged] → draw primary ranged
```

A missing primary category may continue to hide its button according to the current HUD convention.

### Combat Mode active with melee

The two available actions become:

```text
[Sheathe]
[Ranged] → switch to primary ranged
```

If no primary ranged weapon is configured/valid, only the sheathe action needs to remain actionable.

### Combat Mode active with ranged

The two available actions become:

```text
[Melee] → switch to primary melee
[Sheathe]
```

If no primary melee weapon is configured/valid, only the sheathe action needs to remain actionable.

Use an appropriate existing/Lucide icon for the sheathe action. The UI must call app/player actions only; it must not mutate Combat Mode, `HeldTool`, inventory or primary selections directly.

Keep accessible labels explicit (`Schowaj broń`, `Broń biała: ...`, `Broń dystansowa: ...`).

## 6. Reconciliation with existing HeldTool changes

Combat Mode is meaningful only while the held state still matches the combat weapon it represents.

Add one small reconciliation rule at the existing held-tool synchronization boundary rather than scattering checks through combat code.

At minimum, Combat Mode must leave `active` state when:

- the active primary weapon is dropped/sold/transferred and `HeldTool` loses it;
- another non-primary tool is equipped from Inventory or another existing shortcut;
- a world/load/reset lifecycle clears or replaces `HeldTool`;
- primary weapon synchronization invalidates the active selection.

The last successfully active category may remain remembered where safe so `X` can later redraw a valid configured weapon. Do not restore removed inventory ownership or stale instance ids.

## 7. Persistence

Do not persist `active` Combat Mode state in V1. A save/load or new-game restore starts with Combat Mode inactive.

`PrimaryWeaponSelection` already persists the actual primary melee/ranged choices and remains the authority for what can be drawn after load.

`lastActiveWeapon` may be transient in V1. On a fresh runtime choose a deterministic fallback from available configured primary slots, preferably melee first when both exist, unless current code provides a better existing convention during implementation recon.

Do not add duplicate weapon-selection fields to `SaveData`.

## 8. Combat integration

Do not change melee/ranged damage, targeting, timings, stamina, ammo, critical hits, projectiles or weapon condition.

The existing combat systems continue to operate from the held weapon. Combat Mode only controls drawing/switching/sheathing and exposes an explicit player state that future systems can observe.

Attacks while Combat Mode is inactive should naturally remain unavailable because no primary combat weapon is held after sheathing. Do not add an automatic attack→draw behaviour in this plan.

## 9. Future NPC reactions — explicit non-goal

Combat Mode should be designed as readable player state because future NPC decision/perception systems may react to a drawn weapon.

Examples for a future plan:

```text
player enters Combat Mode near guard
→ guard perception/threat evaluation
→ warning/readiness

player approaches civilian with weapon drawn
→ caution/avoidance pressure
```

None of that is implemented here. Do not modify NPC hostility, relationships, dialogue, threat sensing or decision modules in `ui-input-018`.

## 10. Tests

Add focused tests around the new state/action seam rather than broad UI snapshots where domain tests suffice.

Cover at least:

- inactive + primary melee action → melee equipped and Combat Mode active;
- inactive + primary ranged action → ranged equipped and Combat Mode active;
- active melee + ranged action → ranged equipped, mode stays active, last category becomes ranged;
- active ranged + melee action → melee equipped, mode stays active, last category becomes melee;
- active + keyboard toggle → weapon sheathed and mode inactive;
- inactive + keyboard toggle → last active category is drawn;
- invalid/missing last category → valid other primary is used when available;
- no valid primaries → toggle remains safely inactive;
- failed `HeldTool.equip()` does not change Combat Mode state;
- removal/drop/sell of active weapon reconciles mode to inactive;
- equipping an ordinary non-combat tool reconciles mode to inactive;
- load/new game starts Combat Mode inactive while persisted primary selections remain usable.

UI-level coverage only needs to verify the contextual action mapping if existing component/test conventions make that inexpensive.

## 11. Manual verification

Browser verification is performed by the user, not the AI agent.

Verify manually:

1. Configure a primary melee and primary ranged weapon in Inventory.
2. With Combat Mode inactive, both configured weapon shortcut buttons are available.
3. Press melee → melee weapon is drawn; HUD changes to `Schowaj` + ranged shortcut.
4. Press ranged → ranged weapon replaces melee; HUD changes to melee shortcut + `Schowaj`.
5. Press `Schowaj` → hand is empty and normal two-shortcut state returns.
6. Press keyboard toggle → last active weapon is drawn.
7. Press keyboard toggle again → weapon is sheathed.
8. Draw ranged, sheathe, toggle → ranged returns; repeat for melee.
9. Drop/sell the active weapon → Combat Mode safely exits and no stale shortcut/instance is used.
10. Equip a shovel/other utility item from Inventory → Combat Mode exits rather than claiming a weapon is still drawn.
11. Save/load with primary choices configured → choices survive, Combat Mode starts inactive, keyboard/button draw still works.
12. Verify melee/ranged attack behaviour, ammo, stamina and weapon condition are unchanged once the corresponding weapon is drawn.

## Implementation guidance

Prefer extending the current `HeldTool` / `PrimaryWeaponSelection` / `inventoryWiring` / UI-store seams rather than introducing a `CombatManager` or parallel equipment state.

Add JSDoc to the new Combat Mode state/controller and important public operations so preflight/code-map discovery can identify ownership and intent; use `@domain ui-input` where appropriate.

## Non-goals

- NPC reactions to drawn weapons;
- hostility/threat/reputation changes;
- automatic weapon draw when attacked or when pressing attack;
- mounted combat;
- new melee/ranged combat mechanics;
- new weapon slots or favorites system;
- weapon wheel;
- restoring the previously held utility tool after sheathing;
- persisting an active drawn-weapon state.

> **Zrób git commit i push do main, rebase jeżeli trzeba**