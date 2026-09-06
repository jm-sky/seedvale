# Implementation Notes: New Game setup on empty save state

**Reviewed:** 2026-09-06  
**Plan:** `ui-input-011-new-game-setup-on-empty-save-state.md`

## Recon conclusion

The bug is caused by two explicit shortcuts in `src/main.ts`, not by missing Start Screen or Seed Library capability:

1. a successful save-management read with `entries.length === 0` calls `createApp(container)` directly;
2. deleting the final save from the Start Screen loop calls `createApp(container, undefined, { newGame: true })` directly.

Both bypass the existing boot New Game form. `StartScreen.vue`, `SeedPicker.vue`, `SeedChoice` and `resolveNewGameSeed()` already provide almost all required behavior.

The smallest coherent implementation is therefore to keep ordinary zero-save boot inside the existing Start Screen loop, make the empty state show the New Game form immediately, and extend the existing New Game intent with a per-save player name.

## Relevant files and symbols

### `src/main.ts`

Owns player-facing boot selection after model-test/benchmark/perf special cases.

Important current flow:

```text
listSaveManagementEntries()
→ if read failed: alert + existing fallback
→ if entries.length === 0: direct createApp() shortcut   ← remove/replace
→ seed backfill/listing
→ StartScreen loop
→ delete final row: direct createApp(newGame) shortcut   ← remove/replace
→ choice.new: beginNewSave(name) + resolveNewGameSeed() + createApp(...)
```

Keep the `persistence-004` distinction between a confirmed empty result and a storage failure. Only the confirmed-empty case should enter the empty Start Screen state.

The early model-test, benchmark and unattended/perf paths intentionally bypass the Start Screen and should remain untouched.

### `src/ui/createStartScreen.ts`

Defines:

```ts
export type StartScreenChoice =
  | { type: 'continue' }
  | { type: 'load', id: string }
  | { type: 'new', name: string, seedChoice: SeedChoice }
  | { type: 'delete', id: string }
```

Extend only the `new` branch with `playerName`.

This module mounts `StartScreen.vue` as a short-lived Vue app before the in-game UI exists. Keep it as an intent boundary; do not move persistence or world creation into Vue.

### `src/ui-vue/screens/StartScreen.vue`

Already owns:

- healthy/unhealthy save row display,
- Continue/New Game actions,
- save-name validation,
- `SeedPicker`,
- Seed Library navigation,
- `submitNew()` emitting the structured New Game intent.

Current local state starts with:

```text
showNewGame = false
name = nextDefaultSaveName(...)
seedChoice = resolveInitialSeedChoice(...)
```

For `entries.length === 0`, initialize/show the New Game form immediately. Avoid a watch-heavy solution if initial props are sufficient; after deleting the final save, `main.ts` creates a new Start Screen instance in the next loop iteration with `entries = []`, so initial-state logic can cover both first boot and delete-last-save.

Add a separate player-name field/state. Do not reuse the save-name field.

### `src/ui-vue/components/SeedPicker.vue`

No change is expected.

It already maps `SeedChoice` to:

- explicit URL seed when applicable,
- existing Seed Library entries,
- `generate`.

Do not add manual seed parsing or a second selection model here unless a separate future plan explicitly asks for free-form numeric entry.

### `src/world/seedLibrary.ts`

No change is expected.

`resolveInitialSeedChoice()` currently resolves in priority order:

```text
urlSeed
→ most recently used SeedRecord
→ generate
```

`resolveNewGameSeed()` remains the single New Game seed-intent resolver. For `generate`, it calls `randomSeed()` and creates a `SeedRecord`; therefore do not invoke it until the user submits the New Game form.

### `src/config/worldConfig.ts`

`WorldConfig` already contains:

```ts
player: {
  name: string
}
```

with current default `"Ja"`.

This is the existing player-name config owner. Reuse it; do not add a global player-profile object.

Inspect `createWorldConfig()` / config application order before choosing the exact injection seam so the selected name is applied before `PlayerController` and other runtime consumers are constructed.

### `src/persistence/saveData.ts`

`SaveConfig` already includes:

```ts
player: WorldConfig['player']
```

so `player.name` is already part of per-save serialization. No save-schema field or migration is required.

### `src/app/createApp.ts`

Composition root for world/player/UI. Current signature includes boot/new-world options such as:

```ts
options?: {
  newGame?: boolean
  modelTest?: boolean
  benchmarkFixture?: BenchmarkFixture
  seed?: number
}
```

The likely smallest explicit seam is to extend the New Game options with a player-name override and apply it immediately after the initial `WorldConfig` is created/resolved but before player construction.

Before editing, inspect the exact local config initialization order and reuse the existing `applyStoredPlayer` / fresh-config semantics rather than introducing a second config object.

Avoid storing a pending player name in module-level persistence state. `beginNewSave()` should remain concerned with save-slot identity/name, not world/player configuration.

## Ownership boundaries

Keep these distinct:

```text
save slot name
    → saveDb/save slot lifecycle

player name
    → WorldConfig.player.name
    → SaveConfig.player.name per save

world seed intent
    → SeedChoice / seedLibrary.ts

resolved world seed
    → createApp/world config
```

Do not merge save name and player name just because both are entered on the same form.

## Seed Library lifecycle pitfall

`world-015`'s older implementation notes explicitly called out the zero-save shortcut. The current implementation still contains it even though explicit seed selection is now implemented.

Removing the shortcut also means the old fresh-boot call:

```text
ensureSeedRecordsForSeeds([createWorldConfig().seed])
```

must not be mechanically preserved before the player chooses New Game, because doing so would create catalog metadata for a seed that may never be selected.

The correct fresh empty-state behavior is:

```text
show StartScreen
→ user chooses existing/generate seed intent
→ submit
→ resolveNewGameSeed()
→ only then materialize a generated SeedRecord if needed
```

Existing Seed Library entries may remain even with zero saves; save deletion must not cascade into seed/cache deletion.

## Empty-state rendering detail

A new `StartScreen` instance is mounted for every loop iteration after a delete choice. Therefore, once `main.ts` stops returning after deleting the final row, `StartScreen.vue` can derive its initial form-open state directly from `props.entries.length === 0`.

This avoids introducing cross-mount mutable state or a separate "first run" flag.

`Continue` is already disabled when `healthySlots.length === 0`; decide whether to leave it disabled or hide it in the empty state based on the smallest clean template change. The plan requires only that it is not actionable.

## Player-name initialization

The current default player name is `"Ja"`, but `createWorldConfig()` may also apply persisted configuration overrides. Before implementation, inspect whether reading that default value at Start Screen time would have side effects or duplicate config loading.

Prefer a small explicit initial value passed into the Start Screen if the existing config API exposes it cleanly. Otherwise using the canonical default is acceptable for this fix, provided the submitted value is explicit and per-save.

Do not persist the Start Screen field globally just to prefill future saves.

## Validation

There is existing save-name validation in `saveSlots.ts`; player-name validation is a different concept.

For this plan, keep player-name validation local/small unless there is already a shared player-name helper elsewhere. At minimum:

```text
trim
→ reject empty
→ bound length to a reasonable existing UI/config limit if one exists
```

Do not reuse save-slot collision rules for player names.

## Testing seam

`main.ts` boot orchestration is DOM/application-oriented and may not have a direct unit seam. Do not introduce a broad state machine only for tests.

If needed, extract only a tiny pure helper for a decision that otherwise cannot be covered (for example, whether ordinary boot should show Start Screen for a successful management result). Keep lifecycle ownership in `main.ts`.

UI component behavior can be covered only where the existing Vue test setup already makes that cheap. Do not add browser automation for this plan.

The highest-value regression is preventing any code path from treating confirmed zero saves or delete-last-save as an instruction to immediately create a world.

## Related current-state facts

- `docs/state/persistence.md` defines `SaveData` as serialization, not runtime authority; runtime config/player systems own the live values and save assembly serializes them.
- `persistence-004` implemented typed empty-vs-storage-failure management results and unhealthy-row handling used by boot.
- `world-015` implemented Seed Library selection and the shared `resolveNewGameSeed()` seam now used by boot New Game.
- `docs/plans/README.md` already contains a different `ui-input-010`, despite `PLANNING.md` still reporting `ui-input: 010`; this plan therefore uses `ui-input-011` to avoid an ID collision.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
