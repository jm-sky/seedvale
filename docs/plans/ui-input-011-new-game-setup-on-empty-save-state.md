# Plan: New Game setup on empty save state

**Created:** 2026-09-06
**Status:** `verification needed` 🔍 — implemented + technically verified (`vue-tsc --noEmit`, `lint`, `test`, `build` all green). §10 browser verification is the user's step.
**Type:** fix
**Priority:** high · **Effort:** S
**Depends on:** none
**Domain:** `ui-input`
**Subdomains:** `menus` `interaction`
**Tags:** `new-game` `start-screen` `seed` `save`
**Roadmap:** -

## Problem

Boot currently bypasses the Start Screen when no save rows exist and starts a world immediately. The same happens after deleting the last save from the Start Screen.

That creates two inconsistent New Game entry paths where the player cannot deliberately configure the new save before world creation:

- fresh install / all saves removed,
- deleting the last remaining save.

The existing Start Screen already owns the boot-time save/new-game intent UI, and the existing Seed Library already owns seed selection. The missing piece is to keep the ordinary boot lifecycle inside that existing flow when the save list is empty.

The current New Game form also exposes only the save-slot name. `WorldConfig.player.name` already exists and is persisted inside each save's `SaveConfig.player`, so the player name should be selected independently for each new save rather than treated as a global profile or conflated with the save name.

## Goal

Make every ordinary boot-time New Game go through one consistent Start Screen flow before creating the world.

For an empty save list, the player should see the New Game form immediately and be able to choose:

- player name — per-save,
- save name,
- world/seed,
- then explicitly start the game.

Deleting the final save should return to the same empty-state New Game form instead of immediately creating another world.

## Current architecture to preserve

Reuse the mechanisms already present on `main`:

- `src/main.ts` owns ordinary boot/save-selection orchestration.
- `src/ui/createStartScreen.ts` defines the short-lived boot Start Screen and its `StartScreenChoice` intent.
- `src/ui-vue/screens/StartScreen.vue` owns the boot save list and New Game form.
- `src/ui-vue/components/SeedPicker.vue` owns seed-choice UI.
- `src/world/seedLibrary.ts` owns `SeedChoice`, initial seed choice and `resolveNewGameSeed()`.
- `src/persistence/saveDb.ts` owns save-slot lifecycle including `beginNewSave()` and delete/list operations.
- `WorldConfig.player.name` is the existing runtime/config owner of the player's name.
- `SaveData.config.player` / `SaveConfig.player` already persist that player name per save.

Do not introduce a separate first-run wizard, player-profile store, seed resolver, save schema field, or alternate New Game manager.

## 1. Route confirmed-empty boot through StartScreen

Remove the ordinary boot shortcut in `src/main.ts` that handles `initialManagement.entries.length === 0` by calling `createApp(container)` directly.

A successful save-management read returning zero entries is a valid Start Screen state, not a reason to bypass it.

The existing distinction from `persistence-004` must remain intact:

```text
successful read + zero rows
!=
IndexedDB/list failure
```

Storage failure handling remains outside this change. Do not turn a read failure into the empty-state New Game UI.

The model-test, benchmark and unattended/perf boot paths remain intentionally outside the player-facing Start Screen flow.

## 2. Keep StartScreen alive after deleting the final save

In the Start Screen loop in `src/main.ts`, deleting the final remaining save must no longer call `createApp(..., { newGame: true })`.

After deletion:

```text
currentEntries = []
→ continue StartScreen loop
→ render empty-save New Game state
```

Do not create a seed, save slot or world merely because the last row was deleted.

Seed records and persistent worldgen cache are independent resources and must not be deleted or reset as a side effect of deleting the last save.

## 3. Empty-save StartScreen UX

`StartScreen.vue` must treat `entries.length === 0` as a first-class state.

When there are no save-management rows:

- open/show the New Game form immediately,
- do not require an extra `Nowa gra` click,
- `Kontynuuj` must not be actionable,
- avoid presenting an empty save-list area as though a slot were missing,
- keep Seed Library access available where it remains useful and consistent with the existing screen.

The same UI state must work for both:

- first ordinary boot with no saves,
- returning to zero saves after deletion.

Do not create a separate component or duplicated "first game" screen for this case.

## 4. Separate player name from save name

Extend the New Game form with a dedicated player-name field.

Conceptually:

```text
Imię gracza
Nazwa zapisu
Świat
[ Rozpocznij ]
```

The player name and save name are separate concepts and must remain separate in types and UI.

Extend the boot intent to carry both values, for example:

```ts
{
  type: 'new'
  name: string
  playerName: string
  seedChoice: SeedChoice
}
```

Keep the current save-name validation rules and collision semantics unchanged.

Add a small bounded player-name validation rule appropriate for UI input if one does not already exist; avoid introducing a new validation subsystem for this plan. At minimum, do not accept a blank/whitespace-only name.

## 5. Player name is per-save

The selected player name belongs to the new save/world, not to a global account/profile.

Use the existing `WorldConfig.player.name` / `SaveConfig.player.name` path so that:

```text
Save A → player.name = "Anna"
Save B → player.name = "Jan"
```

and loading either save restores its own name through the normal save/config reconstruction path.

Do not add a new `SaveData` field or migration solely for this plan.

Do not make New Game player-name selection depend on a global persisted player identity.

A reasonable initial field value may reuse the currently configured/default player name (`"Ja"` when no better existing value is available), but submitting New Game must commit the explicit form value to the new world's config before player-facing runtime objects are constructed from it.

## 6. Preserve Seed Library ownership and seed resolution

Keep the existing seed flow:

```text
StartScreen
→ SeedChoice
→ resolveNewGameSeed()
→ resolved seed
→ createApp(..., { newGame: true, seed })
```

Do not generate a seed when the empty Start Screen is merely rendered.

For a generated seed, materialize it only after the player confirms `Rozpocznij`, through the existing `resolveNewGameSeed()` path.

Preserve the current initial-choice precedence:

```text
explicit ?seed=
→ most recently used Seed Library entry
→ generate
```

A Seed Library can remain populated even when there are zero saves. Those seed records must stay selectable for the next New Game.

## 7. Pass New Game configuration without adding hidden global coupling

The boot Start Screen already returns a structured user intent. Extend that explicit intent for `playerName` rather than adding another module-level pending global beside save-slot state.

When entering `createApp()` for a boot-time New Game, pass or apply the resolved player name through the smallest explicit configuration seam available before player construction.

Prefer extending the existing New Game options/configuration boundary over mutating unrelated persistence state before `createApp()` starts.

Do not broaden `beginNewSave()` into the owner of player/world configuration; it should remain concerned with save-slot identity/lifecycle.

If a small new architectural/public helper is introduced, add concise JSDoc describing ownership/lifecycle and use `@domain ui-input` where useful for preflight discovery.

## 8. Do not alter in-session world-transition semantics unnecessarily

This plan is primarily the boot/empty-save Start Screen fix.

The in-app/pause-menu New Game path already shares Seed Library seed resolution through the current world lifecycle. Do not refactor that larger transition path unless required to reuse a small explicit player-name/config seam safely.

If the in-session New Game UI already asks for player configuration differently, preserve its behavior unless a tiny shared mechanism clearly removes duplication without expanding scope.

## 9. Automated regression coverage

Add focused tests around pure/isolatable logic where the current test seams support them.

Cover at minimum the behavior that can reasonably be tested without browser automation:

- empty save-management state no longer resolves directly to immediate ordinary world creation,
- deleting the final row returns to the Start Screen loop/state rather than starting a world,
- `StartScreenChoice.new` carries separate `name`, `playerName` and `seedChoice`,
- player-name validation rejects blank input,
- the selected player name reaches the New Game config seam,
- seed resolution still occurs only after the New Game choice is submitted.

Prefer extracting a tiny pure decision/helper if that makes boot branching testable. Do not build a large boot-state framework only to unit-test this fix.

Run the relevant project-standard TypeScript/Vue checks, lint/tests and build used by the repository.

Do not run browser verification as the AI agent.

## 10. Manual browser verification — user

The user verifies in browser:

1. Delete all saves and reload.
2. Confirm Start Screen remains visible and New Game form is already open.
3. Confirm there is no automatic world creation before `Rozpocznij`.
4. Enter a player name and a distinct save name.
5. Select an existing Seed Library seed and start the game.
6. Confirm the world uses that seed and the player uses the entered name.
7. Create/use another save with a different player name and confirm names remain independent per save after load.
8. Delete the final save from Start Screen and confirm the screen remains open in the same empty New Game state.
9. Confirm Seed Library entries survive deleting all saves and can be reused.
10. Repeat empty-save boot with `?seed=<n>` and confirm that seed is the initial New Game selection rather than an automatically started world.

## Non-goals

- character appearance/character creator,
- global player account/profile,
- renaming existing save slots,
- changing save-slot limits,
- SaveData schema migration,
- Seed Library redesign,
- cascading seed/cache deletion with saves,
- worldgen/cache changes,
- broad pause-menu New Game redesign,
- browser verification by the AI agent.

## Related plans

- `persistence-004-save-integrity-and-world-lifecycle.md` — established typed empty-vs-storage-failure save listing, unhealthy save management and seed/source lifecycle rules now present in code.
- `world-015-seed-library-and-persistent-worldgen-cache.md` — established explicit Seed Library selection and the existing boot New Game seed intent; its implementation notes explicitly identified the zero-save Start Screen shortcut as a lifecycle decision point.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
