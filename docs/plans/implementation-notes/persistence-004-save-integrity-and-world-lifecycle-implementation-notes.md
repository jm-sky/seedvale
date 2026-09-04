# Implementation Notes: persistence-004 Save Integrity and World Lifecycle

## Current ownership boundaries

Keep the existing split:

- `src/app/saveState.ts` — assembles live runtime state and decides when to save;
- `src/persistence/saveData.ts` — current SaveData schema, runtime validation, version detection and migrations;
- `src/persistence/saveSlots.ts` — persisted slot envelope/status inspection and slot metadata;
- `src/persistence/saveDb.ts` — IndexedDB rows, active slot id and named-slot operations;
- `src/app/createApp.ts` — world creation/rebuild/new-game/load orchestration;
- `src/world/parseSeed.ts` + `src/config/worldConfig.ts` — URL seed parsing and initial config seed selection.

Do not move these responsibilities into a new persistence/world lifecycle manager unless current code proves a small orchestration helper is necessary.

## Persistence gap confirmed in current code

`saveDb.writeSave(data)` validates the **existing stored row** with `inspectStoredSave()` before overwrite, but it does not validate the **incoming `data`** before `storePut()`.

Current sequence for an existing valid slot is effectively:

```text
storeGet(targetId)
→ inspectStoredSave(existing row)
→ wrapSave(existing name, incoming data)
→ storePut(...)
```

Therefore a runtime object satisfying the TypeScript `SaveData` type can still contain values rejected by the runtime schema and replace a valid row. On the next `listSaves()`, `scanRows()` excludes that now-unreadable row from the normal slot list.

This is the main integrity boundary to close. Reuse the current validator/migration machinery from `saveData.ts`; do not duplicate field validation inside `saveDb.ts`.

`createSave(name, data)` has the same outgoing-validation gap and must use the same validation boundary.

## Error-shape issues in `saveDb.ts`

Current APIs collapse materially different states:

- `listSaves()` catches IndexedDB errors and returns `[]`;
- `readSave()` catches errors/unreadable records and returns `null`;
- `hasUnreadableSaves()` returns `false` on IndexedDB failure;
- `createSave()` catches every thrown error and returns `{ ok: false, error: 'limit' }`.

Do not preserve these conflations when touching the API. Introduce the smallest typed result shape needed by application callers. Preserve convenient wrappers only if they cannot be misused for destructive decisions.

`WriteSaveError` currently contains only:

- `invalid-existing-slot`
- `db-error`

It needs a distinct outgoing-snapshot failure (name can be chosen during implementation).

## `saveState.ts` failure propagation

`createSaveState()` currently exposes:

```ts
saveNow: () => Promise<void>
```

and the implementation discards `writeSave()`'s result.

This prevents the caller from distinguishing:

- successful manual save;
- rejected invalid outgoing snapshot;
- protected unreadable existing slot;
- IndexedDB failure.

Adjust this boundary rather than reaching from UI directly into `saveDb.ts`.

`refreshActiveSaveName()` currently does:

```text
listSaves()
→ pickActiveSaveId(...)
→ setPauseActiveSaveName(active?.name ?? '')
```

A list/read failure can therefore blank the visible active-save name. Preserve the current label on failure or expose an explicit unhealthy/read-error state instead of treating the failure as a valid empty list.

## Autosave entrypoints and ordering

`installAutoSave()` can invoke `saveNow()` from several independent sources:

- 60-second interval;
- `visibilitychange` when hidden;
- `pagehide`;
- `beforeunload`.

Manual Save, Save As, Load and New Game can occur independently of these lifecycle calls.

Audit whether write requests can overlap. If so, use a small app/persistence-side write queue or equivalent serialization so an earlier captured snapshot cannot complete after a newer one. Avoid a worker and avoid a global job system.

Be careful with page-unload semantics: do not claim an IndexedDB promise is guaranteed to finish during `beforeunload`. The existing visibility/pagehide coverage is more useful and should remain unless evidence supports a change.

## Incoming snapshot diagnostics

`saveData.ts` currently owns validation but its existing public load result is oriented around persisted records/migrations. Prefer exposing or adapting one canonical current-schema validation boundary over creating storage-specific validators.

Diagnostics need enough granularity to identify which part of `buildSaveData()` failed. A full recursive error framework is not required if a bounded domain/path report can be produced with small changes.

Do not log the whole `SaveData` object.

Useful candidate domains correspond directly to current `buildSaveData()` assembly sections, e.g. player, map, world objects, terrain/resource state, settlements/NPCs/households/livestock.

## `buildSaveData()` is broad and recently expanded

`src/app/saveState.ts::buildSaveData()` captures many authoritative systems in one snapshot. Recent simulation persistence includes:

- `npcStates`
- `households`
- `npcRelationships`
- `livestock`
- `removedLivestockIds`
- `workContracts`
- resource depletion / forage state
- map location knowledge and navigation targets

Do not assume the invalid-snapshot producer is a legacy player field. Instrument/validate the complete assembled object and then fix the source at the runtime owner.

Potential runtime-invalid values include non-finite numbers (`NaN`/`Infinity`) even when TypeScript types are correct.

## New Game world-state reset

`src/app/createApp.ts::rebuildWorld(true)` already clears multiple world/player-world state owners, including:

- `mapDiscovery.clear()`
- `locationKnowledge.clear()`
- `navigationTargets.clear()`
- quest reset
- selected world flags and other world state

The observed old navigation marker therefore means the implementation must trace the actual lifecycle, not simply add another `navigationTargets.clear()` call.

Check:

1. whether anything restores old targets after the clear;
2. whether the clear happens before/after all world reconstruction steps expected by New Game;
3. whether a stale UI/canvas state remains visible despite authoritative targets being empty;
4. whether the New Game action can overlap with save/autosave callbacks that capture the old world while reset is in progress.

Use the existing reset methods owned by each system. Avoid storing a second authoritative list of "things to reset" if the existing rebuild/new-world orchestration can be made explicit and reason-aware.

## Navigation target presentation boundary

`src/world/locations/navigationTargets.ts` stores targets in a mutable array and exposes `clear()` by truncating it.

The full map UI (`src/ui-vue/screens/WorldMapScreen.vue`) is not reactively subscribed to that object. It keeps a local `targetsVersion` counter that is incremented only for mutations initiated by that component. Programmatic clear during New Game will not increment that counter.

Canvas drawing functions read `getActiveNavigationTargets()` imperatively, so determine whether the reported marker is:

- authoritative target state;
- stale full-map Vue computed state;
- stale canvas contents that were not repainted;
- minimap state;
- or a later restore.

Do not patch only presentation until authoritative state has been verified after the transition.

## Seed flow

`src/world/parseSeed.ts` provides:

- `parseSeedFromUrl(search, fallback)` — returns a number, using fallback for missing/invalid input;
- `randomSeed()` — explicitly intended for a fresh New Game;
- `syncSeedInUrl(seed)` — writes the active seed without reload.

`src/config/worldConfig.ts` already distinguishes whether the URL contains a `seed` param while building initial config, but the later start-menu/New Game flow overrides `config.seed` with `randomSeed()`.

The implementation needs to preserve **intent**, not just a parsed number:

```text
explicit valid URL seed
vs
missing/invalid seed using parser fallback
```

A small helper returning `{ explicit: boolean, seed: number | null }` or equivalent may be preferable to inferring intent later from `parseSeedFromUrl()`'s fallback value.

Do not let URL seed override a loaded save. For Load, the save's `config.seed` remains authoritative and URL should be synchronized afterward.

## World identity vs save identity

Keep these separate:

- save slot id = persistence identity/history branch;
- seed = deterministic generation input;
- current runtime world = seed + persisted/history state.

Do not derive slot IDs from seeds and do not reuse a previous slot merely because a new world has the same seed.

## Transition ordering to inspect

Pay special attention to the current handlers in `createApp.ts`:

- Save
- Save As
- Load Save
- New Game

Current New Game flow has historically followed roughly:

```text
save current world
→ beginNewSave(name)
→ choose/assign seed
→ rebuildWorld(true)
→ save new world
→ refresh active save name
```

The exact implementation on `main` is source of truth. Preserve the useful idea of protecting the current world before transition, but do not continue the transition silently when that protective save fails in a way that risks slot confusion or data loss.

For Load, ensure no autosave of the currently running world can race after the active slot id has already been switched to the destination slot. Slot selection and runtime-world switching must have an unambiguous ordering.

## Tests to extend first

Start with `src/persistence/saveDb.test.ts` because it already covers persistence-002 behavior with fake IndexedDB.

Add the inverse regression before changing storage code:

```text
valid existing slot
→ outgoing invalid SaveData
→ write rejected
→ old row still loadable
```

Also cover invalid `createSave()` input.

For an invalid runtime value, use an existing field that current schema validation rejects (prefer a non-finite numeric value) and cast only at the test boundary if necessary.

Then add focused lifecycle/seed tests at the nearest existing application/world test seam rather than attempting to instantiate the complete renderer.

The user performs browser verification; automated tests should verify state and orchestration, not visual rendering.

## Implementation order

A useful low-risk order is:

1. add failing outgoing-snapshot integrity tests;
2. expose/reuse canonical current SaveData validation;
3. reject invalid incoming snapshots in `writeSave()` and `createSave()`;
4. make storage/list/create errors distinguishable;
5. propagate save result through `saveState.ts` and manual UI feedback;
6. serialize/coalesce save operations if recon confirms overlap is unsafe;
7. make New Game/Load transition ordering explicit;
8. fix the concrete navigation-target leakage source;
9. implement explicit seed-intent precedence and URL synchronization;
10. add lifecycle/seed regression tests;
11. run normal unit/type/build verification, leaving browser verification to the user.

## Related plans

- `persistence-002-save-integrity-guard.md` — protects an already-unreadable existing row from overwrite; implemented.
- `persistence-003-save-schema-versioning-and-migrations.md` — canonical version/migration pipeline; use its current implementation rather than bypassing it.
- `persistence-001-full-simulation-persistence.md` — explains the widened simulation snapshot and ownership boundaries relevant when tracing the invalid producer.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
