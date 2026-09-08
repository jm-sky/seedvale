# Plan: Player quick actions and primary weapon slots

**Created:** 2026-09-06
**Status:** `implemented` ✅
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** none
**Domain:** `ui-input`
**Subdomains:** `interaction` `menus` `input`
**Tags:** `inventory` `survival` `weapons` `persistence`
**Roadmap:** -

## Goal

Make player shortcuts intentional and predictable instead of incidental UI conveniences.

This plan delivers two related improvements:

1. explicit, persisted primary melee/ranged weapon slots configured from Inventory,
2. survival Quick Actions that express player intent: `Zjedz cokolwiek` and `Ugotuj posiłek`.

Quick Actions must orchestrate the existing authoritative inventory, survival-action, cooking, fire and placement systems. They must not duplicate their rules or mutate world/player state directly from Vue.

## Current architecture to preserve

- `src/items/primaryWeapons.ts` already owns `PrimaryWeaponSelection` and resolves both shortcuts through the normal `HeldTool.equip()` path. Today it remembers the last equipped melee/ranged weapon and is session-local.
- `InventoryScreenItemDetails.vue` already classifies melee/ranged/consumable items and exposes contextual item actions, but has no explicit primary-weapon assignment.
- `SurvivalActions.consumeItem(kind)` is the canonical player consumption path.
- `SurvivalActions.startIgniteFire(fire)` is the canonical fire-starting path and owns fuel/capability checks, Busy Action timing, XP and completion effects.
- `SurvivalActions.startCookAt(fire)` is the canonical cooking path and reuses `resolveCookingCapacity()` / `findCookingBatch()`.
- player-built fires and their live `VillageFire` state are already owned by the existing placed-fire/world systems.
- fire/tent/construction placement already has shared validation and placement-preview mechanisms; Quick Actions must use them rather than spawning objects directly.

The implementation may adapt exact seams to current code, but must not change these ownership boundaries merely to simplify the feature.

---

## 1. Explicit primary weapon slots

Change `PrimaryWeaponSelection` from "last equipped" memory into explicit player configuration.

The canonical slots remain:

- primary melee,
- primary ranged.

Reuse the existing `PrimaryWeaponChoice { kind, instanceId }` model and existing shortcut/equip path. Do not create a second equipment or favorites subsystem.

### Assignment rules

Inventory item details gain contextual actions:

- melee weapon: `Ustaw jako podstawową broń białą`,
- ranged weapon: `Ustaw jako podstawową broń dystansową`.

The currently assigned item must be visibly identified in Inventory, e.g. as `Podstawowa broń biała` / `Podstawowa broń dystansowa`, instead of showing a redundant assignment action.

For maintained weapon kinds, assignment targets the concrete item instance selected/resolved through the existing item-instance model. Do not collapse a maintained weapon selection to kind-only state.

### Equip semantics

Ordinary equip must not replace an explicit primary choice.

Required behaviour:

```text
set Sword as primary melee
→ equip Knife
→ primary melee remains Sword
```

`noteEquipped()` may initialize an empty melee/ranged slot when the player equips the first compatible weapon, preserving useful first-session behaviour. Once a slot is populated, later ordinary equips must not overwrite it.

Explicit assignment always replaces the corresponding slot.

### Inventory synchronization

Keep inventory authoritative.

`syncWithInventory()` must:

- clear a slot when its selected weapon kind is no longer carried,
- preserve the selected maintained instance while that instance still exists,
- if the selected instance disappeared but another instance of the same carried kind exists, resolve to the existing deterministic instance fallback already used by the current selection/HeldTool model,
- never add or restore an item merely because it was selected as primary.

Do not automatically choose a different weapon kind when the selected kind is gone. The slot becomes empty.

---

## 2. Persist primary weapon assignment

Explicit primary slots are player configuration and must survive save/load.

Extend the existing player/save state with both `PrimaryWeaponChoice | null` values using the repository's current SaveData validation/migration conventions.

Required restore order/contract:

1. restore the stored selections,
2. restore/construct the authoritative inventory through the existing load path,
3. run `syncWithInventory()` before exposing shortcuts as usable,
4. invalid/missing selections become empty slots rather than load failures.

Older saves without these fields remain valid and restore both slots as empty; normal first-equip initialization can then populate them.

Do not persist a duplicate copy of weapon stats or inventory ownership.

---

## 3. `Zjedz cokolwiek`

Add a Quick Action representing the intent:

> choose a sensible food item I already carry and eat it.

The UI does not choose the item. Add/reuse a small pure resolver outside Vue, operating on authoritative inventory/catalog data.

### Selection policy

Use this deterministic priority order:

1. only items the existing consumable/catalog system classifies as food that relieves hunger; do not consume medicine, water-only items, books or other non-food consumables,
2. exclude anything that the existing food/freshness model marks unsafe or no longer edible,
3. prefer the food batch/item with the shortest remaining usable freshness / greatest spoilage urgency when that information exists,
4. among equally urgent candidates, choose the item whose hunger relief produces the smallest non-negative overfill relative to current missing hunger,
5. if every candidate overfills, choose the smallest overfill,
6. use stable `ItemKind` ordering as the final deterministic tie-break.

If current freshness APIs expose batches rather than only kinds, the resolver must use them rather than losing freshness information. If the inventory consumption API currently accepts only a kind, select the kind from the preferred batch and let the canonical inventory removal rule choose the actual batch; do not introduce a second consumption path solely for Quick Actions.

The policy should be a reusable player-domain helper, not embedded in `QuickActionsScreen.vue`.

### Execution

```text
resolve food
→ SurvivalActions.consumeItem(kind)
```

Do not modify Hunger or inventory directly.

If no valid food exists, do not start an action and show a concise existing-style toast such as `Nie masz nic do jedzenia.`

---

## 4. `Ugotuj posiłek`

Add a Quick Action representing the full intent:

> use my cookable food, obtain a usable local fire if needed, cook, then eat an appropriate cooked result.

The action must be able to create a fire when no suitable one is nearby. It is not merely "find a campfire".

Required high-level sequence:

```text
cookable food?
→ choose suitable nearby fire
  → lit fire: cook
  → unlit fire: ignite → cook
→ no suitable fire: place own fire → ignite if needed → cook
→ after successful cooking: re-resolve appropriate food → eat
```

Each stage revalidates authoritative state before starting. Do not assume inventory/fire state remained unchanged while a Busy Action or placement interaction was in progress.

### 4.1 Cookable-food precondition

Use the existing cooking definitions/resolvers (`findCookingBatch()` and related canonical data) to determine whether the player has something cookable.

Do not maintain a Quick-Action-specific cookable-item list.

If no cookable food exists, stop immediately with concise feedback.

### 4.2 Nearby fire selection

Add/reuse one bounded local resolver for a player-usable cooking fire.

Selection order is fixed:

1. nearest suitable lit fire,
2. nearest suitable unlit fire,
3. create a new player fire only if neither exists.

Within equal distance use a stable ID/order tie-break.

Use the existing canonical interaction radius for player fire interaction/cooking. If the current architecture exposes separate cooking and generic interaction radii, use the cooking radius; otherwise use the existing fire-interaction radius. Do not invent a larger camp/world search radius and do not scan the whole world.

The resolver must use world position, never camera position.

A fire counts as suitable only if the existing cooking system can actually use it; do not special-case visual campfires that are not actionable cooking sources.

### 4.3 Creating a fire

When there is no suitable nearby fire, create the player's simplest existing cook-capable fire through the normal player fire construction/placement flow.

Use `simple` as the intended fire kind if current code confirms it is cook-capable. If current authoritative cooking/build definitions reject `simple`, use the cheapest existing player-buildable cook-capable fire kind instead and record that code-driven discrepancy in the implementation notes.

Placement is part of the same `cook meal` intent:

```text
start cook-meal
→ start existing fire placement preview
→ player confirms placement
→ intent resumes with the newly created fire
```

The player must choose/confirm the placement through the existing placement preview and validation rules. Do not auto-place next to the player and do not create an alternate placement path.

Cancelling placement cancels the whole intent. The player must not need to click `Ugotuj posiłek` again merely because placement was necessary.

### 4.4 Ignition

If the selected/new fire is unlit, continue through the canonical `SurvivalActions.startIgniteFire(fire)` path.

All existing requirements remain authoritative:

- fire-starting capability/tool,
- real fuel/material consumption,
- Busy Action timing,
- XP,
- blocking/interruption rules.

Quick Action must not provide free fuel, free ignition or an alternative ignition rule.

If the selected fire is already lit, skip this stage.

If an existing `simple` fire starts lit as a consequence of its normal construction cost, naturally skip ignition after placement; do not relight it redundantly.

### 4.5 Cooking

Continue through `SurvivalActions.startCookAt(fire)`.

The intent must not reproduce cooking capacity, pan/grate, recipe/batch, timing or XP rules.

If cooking cannot start after revalidation, cancel the remaining intent with normal feedback rather than trying alternative hidden mutations.

### 4.6 Eat after cooking

After successful cooking completion:

1. read current inventory/needs again,
2. run the same canonical sensible-food resolver used by `Zjedz cokolwiek`, restricted to cooked food produced/eligible through the cooking system where practical,
3. consume one appropriate item through `SurvivalActions.consumeItem(kind)`.

Do not retain a stale item reference from before cooking.

If the cooked output is no longer present, the player can no longer eat, or another state change makes consumption invalid, finish the intent without an extra mutation. Successful cooking remains valid even if the final eat step cannot occur.

---

## 5. Minimal player intent controller

`Ugotuj posiłek` crosses placement and asynchronous Busy Actions, so implement one small app/player-side intent controller rather than chaining callbacks inside Vue.

Use a single-active-intent model. This plan only needs `cook-meal`; do not build a generic workflow engine, planner, task graph or behavior tree.

The controller owns transient sequencing state only. Inventory, fires, placement objects and player needs remain owned by their existing systems.

Use explicit phases equivalent to:

```text
resolve
waiting-for-fire-placement
igniting
cooking
eating
done
cancelled
```

Exact symbol names may follow repository conventions, but the state transitions and ownership are fixed.

### Controller rules

- at most one player intent is active,
- starting another intent cancels/replaces the active one using one explicit cancellation path,
- each phase revalidates authoritative world/player state,
- it never starts two Busy Actions concurrently,
- placement cancellation cancels the intent,
- ignition interruption/failure cancels the intent,
- cooking interruption/failure cancels the intent and never triggers eat,
- no automatic retry loop,
- no hidden walking/navigation to distant fires,
- no per-frame spatial scans; fire lookup happens when resolving/revalidating relevant phases,
- controller teardown/world rebuild/new-game/load must clear any transient active intent unless the existing action lifecycle already guarantees equivalent cancellation.

Persistence of an in-progress intent is explicitly out of scope. Save/load restores player/world state, not half-finished UI orchestration.

Place this controller alongside app/player action wiring, not in `ui-vue`.

---

## 6. UI wiring

### Inventory

Extend the existing inventory facade/store wiring rather than importing domain objects directly into Vue.

`InventoryScreenItemDetails.vue` should only:

- show current primary status,
- invoke `set primary melee/ranged` callbacks,
- continue using existing equip/unequip actions independently.

Keep assignment available only for compatible carried weapons.

### Quick Actions

Add:

- `Zjedz cokolwiek`,
- `Ugotuj posiłek`.

Quick Actions UI only calls configured player/app actions.

Do not place food selection, fire search, placement continuation or intent state in `QuickActionsScreen.vue` / Touch Chrome.

Use cheap already-available state for button availability if useful, but do not add render-time/per-frame spatial searches merely to enable/disable a button. Full validation occurs when the action starts.

Existing primary melee/ranged shortcuts remain wired to `HeldTool.equip()` through `PrimaryWeaponSelection`.

---

## 7. Persistence and rebuild integration

Primary weapon configuration is persistent; player intent sequencing is not.

Verify integration with all relevant lifecycle paths:

- fresh game,
- save/load,
- older save migration/defaulting,
- inventory mutation/drop/sell/consume sync hooks,
- any in-session world/player-system rebuild that currently resynchronizes HeldTool/primary selection,
- new-world/reset paths.

Do not persist derived labels, availability flags or resolved fire references.

---

## 8. Tests

Add focused automated coverage around the new pure/stateful seams rather than broad UI snapshots where domain tests are sufficient.

### Primary weapons

Cover:

- explicit melee assignment,
- explicit ranged assignment,
- normal equip does not overwrite populated primary slot,
- first compatible equip may initialize an empty slot,
- explicit reassignment replaces the slot,
- dropping/removing the selected kind clears it,
- maintained instance remains selected while present,
- missing selected instance resolves according to the existing same-kind deterministic fallback,
- SaveData round-trip,
- older save without fields restores empty slots,
- invalid restored selection is removed by inventory synchronization.

### Food resolver

Cover:

- no hunger-food available,
- exclusion of non-hunger consumables,
- unsafe/non-edible food exclusion when represented by current APIs,
- freshness priority,
- smallest hunger overfill within the same freshness priority,
- deterministic final tie-break.

### Cook-meal intent

Cover state transitions for at least:

- lit nearby fire → cook → eat,
- unlit nearby fire → ignite → cook → eat,
- no nearby fire → placement → newly created fire → cook/eat,
- placement cancellation → cancelled,
- ignition interruption/failure → cancelled,
- cooking interruption/failure → cancelled with no eat,
- inventory changes between phases → safe revalidation,
- fire disappears/becomes unusable between phases → safe cancellation,
- cooked output missing before eat → finish safely,
- controller/world teardown clears transient intent.

Keep spatial/fire selection resolver tests bounded and deterministic.

---

## 9. Manual verification

Browser verification is performed by the user, not the AI agent.

Verify manually:

### Primary weapon slots

1. Assign a melee weapon from Inventory and use the melee shortcut.
2. Equip another melee weapon normally; shortcut still returns to the explicitly assigned one.
3. Reassign the slot; shortcut immediately follows the new selection.
4. Repeat for ranged weapon.
5. Drop/sell the selected weapon and confirm the slot becomes empty rather than selecting an unrelated weapon.
6. Save/load and confirm both primary assignments survive when the selected items still exist.
7. Load an older save and confirm no migration/load failure.

### `Zjedz cokolwiek`

1. No food → concise feedback, no mutation.
2. One food item → it is consumed through the normal flow.
3. Several foods with different freshness → the more urgent valid food is preferred.
4. Equivalent freshness but different hunger relief → the lower-waste choice is selected.
5. Medicine/water/non-food consumables are not consumed.

### `Ugotuj posiłek`

1. Cookable food + nearby lit fire → cook → eat.
2. Cookable food + nearby unlit fire → ignite → cook → eat.
3. Cookable food + no nearby fire → normal placement preview → confirm → continue automatically → cook → eat.
4. Cancel placement → entire intent stops.
5. Missing fuel/fire-starting capability → no free ignition and intent stops with normal feedback.
6. Cancel/interrupt ignition → cooking does not start.
7. Cancel/interrupt cooking → eating does not start.
8. Existing pan/grate/cooking-capacity rules still work unchanged.
9. Moving camera without moving the player does not change nearby-fire selection.

---

## Non-goals

This plan does not include:

- `Rozbij pełny obóz`,
- tent/camp inspection,
- tent condition or repair,
- new camp comfort modifiers or `campRestQuality` redesign,
- generic player workflow/planning infrastructure,
- persistence of in-progress Quick Action intents,
- automatic player navigation to fires,
- automatic fire placement without player confirmation,
- new recipes/cooking-capacity rules,
- a second inventory/consumption/fire/placement system,
- NPC use of player Quick Actions,
- automatic "best weapon" scoring or fallback to a different weapon kind.

These belong to the separate camp plan or future domain work.

## Implementation guidance

Before implementation, use AI preflight and inspect the current code named by this plan rather than relying on historical plan assumptions.

For important new public/architectural functions and the intent controller, add concise JSDoc describing ownership and lifecycle; use `@domain ui-input` where it improves preflight discovery. Pure food/fire selection helpers should document the authoritative data they consume and must remain deterministic.

If current code contradicts a specific seam assumed here, preserve current authoritative ownership and make the smallest compatible adaptation. Do not reopen product decisions already fixed by this plan; record a genuine code-driven discrepancy in implementation notes instead.

Do not run browser verification. Do not run `pnpm docs:sync`; generated documentation is handled by repository automation.

## Done when

- primary melee/ranged weapons are explicitly assignable from Inventory,
- explicit assignments survive save/load,
- normal equip does not overwrite populated primary slots,
- existing melee/ranged shortcuts still equip through `HeldTool`,
- `Zjedz cokolwiek` uses one deterministic non-UI food resolver and canonical consumption,
- `Ugotuj posiłek` reuses nearby lit/unlit fires and creates a player fire through existing placement when necessary,
- placement/ignite/cook/eat are sequenced by one transient app-side intent controller,
- every stage revalidates authoritative state and cancellation cannot produce later free effects,
- no duplicate inventory/cooking/fire/placement systems are introduced,
- focused automated tests pass,
- implementation notes/documentation are updated as required by `docs/plans/PLANNING.md`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
