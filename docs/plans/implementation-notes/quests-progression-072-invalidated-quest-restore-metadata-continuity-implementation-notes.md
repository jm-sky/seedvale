# Implementation Notes: quests-progression-072 — Invalidated quest restore metadata continuity

Recon baseline: current `main` on 2026-09-19. Scope is only metadata continuity when an active wild-animal-bound quest becomes `invalidated` during restore. Do not redesign animal identity persistence.

## Current implementation

`QuestManager` owns quest progress in `states: Map<string, QuestRuntimeProgress>`. Constructor restore:

1. seeds every materialized definition as `not_offered`;
2. iterates `initial.progress`;
3. normalizes each saved entry through `normalizeRestoredProgress(def, entry)`;
4. for active `kill_target_animal` / `find_animal` slots:
   - livestock kinds are restored with `runtimeProgress(restored)` and rebound via `bindAnimalTargetIfNeeded()`;
   - ordinary wild kinds are intentionally not rebound because their runtime individual identity is not trustworthy across restore.

The wild branch currently bypasses the normal transition merge and writes only:

```ts
this.states.set(entry.id, {
  state: 'invalidated',
  stageIndex: restored.stageIndex,
})
```

This correctly invalidates lifecycle identity but drops durable normalized metadata.

## Exact files and symbols

### Primary implementation

- `src/quests/QuestManager.ts`
  - constructor restore loop
  - `normalizeRestoredProgress(def, entry)`
  - `runtimeProgress(entry)`
  - `setQuestState(id, value)`
  - `bindAnimalTargetIfNeeded(...)`
  - `invalidateStaleAnimalTargets()`
  - `reset()`
  - `exportProgress()`
  - `animalTargets: Map<...>`

### Contracts

- `src/quests/quests.ts`
  - `QuestProgressEntry`
  - `QuestState`
  - `questStageObjectiveSlots()`
- `src/settlement/livestock.ts::LIVESTOCK_KINDS`
- `src/quests/QuestManager.test.ts`
  - existing save/load livestock rebind tests
  - existing wild restore invalidation tests
  - existing `invalidateStaleAnimalTargets` rebuild tests
  - reset/export metadata tests where applicable.

No new save DTO belongs in `src/persistence/saveData.ts`; current validation already accepts the metadata fields.

## State ownership

Persisted/durable quest fields are owned by `QuestManager` through `QuestProgressEntry`:

- lifecycle `state`
- `stageIndex`
- optional terminal/outcome and stage progress
- `journal`
- `worldKnowledge`
- `dialogueCooldowns`
- `observation`
- decline suppression where applicable.

Runtime-only animal binding is owned by `QuestManager.animalTargets` but is explicitly **not persisted**.

Fauna owns real animal identity/lifecycle. Restore must not manufacture confidence in an ordinary wild `animalId`.

## Existing restoration / transition contracts to reuse

### `normalizeRestoredProgress()`

This is the existing save-compatibility normalization seam. It must remain the source of the restored entry before invalidation. Do not reconstruct metadata from the current `QuestDef` if normalized saved data already contains it.

### `runtimeProgress()`

This copies persisted `QuestProgressEntry` fields into `QuestRuntimeProgress`. Reuse it rather than maintaining another manual field list.

### `setQuestState()`

This is the existing transition merge contract. It deliberately preserves:
- non-empty `journal`,
- non-empty `worldKnowledge`,
- non-empty `dialogueCooldowns`,
- `observation`,

unless an explicit clear is requested for collection fields. Its comment explicitly contrasts this with `reset()`, which intentionally drops metadata.

### `invalidateStaleAnimalTargets()`

This is already the in-session rebuild counterpart for the same identity-loss meaning:
- wild active binding → `invalidated`;
- livestock → rebind through the normal resolver;
- New Game does not use it because `reset()` clears the entire quest state.

Restore and rebuild should share the same semantic result. Do not create a second invalidation lifecycle.

## Lifecycle / call-sites

### Save/load restore

`SaveData.quests.progress`
→ `createApp.ts`
→ `new QuestManager(... initial ...)`
→ `normalizeRestoredProgress()`
→ animal-bound active-stage classification
→ wild invalidation or livestock rebind.

For a wild target, no entry is written to `animalTargets`. That must remain true.

### In-session rebuild

`createApp.ts::rebuildWorld()` calls `questManager.invalidateStaleAnimalTargets()` on ordinary same-world rebuilds. This path already exists and must remain aligned with constructor restore semantics.

### New Game

`QuestManager.reset()` intentionally bypasses `setQuestState()` and replaces every state with fresh `not_offered` progress, then clears `animalTargets` and other runtime dedupe. Do not change this.

## Implementation decision

Use the already-normalized restored snapshot as the base, then convert only the lifecycle meaning to `invalidated`.

The smallest safe pattern is conceptually:

1. `const restoredRuntime = runtimeProgress(restored)`;
2. remove stage-local continuation progress that must not survive invalidation;
3. preserve durable history/context metadata;
4. write an `invalidated` runtime state through the existing state-transition contract or a tiny shared invalidation helper also used by `invalidateStaleAnimalTargets()`.

Do not call ordinary stage progression/outcome logic. `invalidated` is not a quest outcome and must not grant rewards/consequences or append synthetic result history unless existing behavior already does so.

### Fields to preserve

Preserve normalized durable metadata that remains meaningful after invalidation:
- `journal`
- `worldKnowledge`
- `dialogueCooldowns`
- `observation`

Also preserve any lifecycle-independent normalized metadata only if the current runtime/export contract already does so and it is meaningful for terminal history.

### Fields not to carry as active continuation

Do not retain stage-local progress in a way that implies the invalidated quest can resume:
- `stageCount`
- `stageSlotProgress`
- runtime `animalTargets`
- runtime feed dedupe.

`resolvedOutcomeId` should not be invented for `invalidated`; invalidation is not an outcome. If legacy/normalized data unexpectedly contains an outcome field on an active entry, do not use this plan to invent cleanup policy beyond the existing normalization contract.

`offerSuppressedUntilDay` is only valid on `not_offered` entries, so it is not part of a normal active→invalidated restore.

Keep `stageIndex` at the restored stage for history/debug continuity, matching current behavior.

## Prefer one shared invalidation helper only if it reduces duplication

A private helper is justified only if constructor restore and `invalidateStaleAnimalTargets()` currently need to perform the same state mutation.

Its responsibility should be narrow:

```text
questId + current/restored progress
→ invalidated progress preserving durable metadata
→ clear quest runtime animal/feed bindings as required
```

Do not create:
- a restoration service,
- a second quest state machine,
- an invalidated-quest registry,
- a new persistence shape.

If `setQuestState()` plus a small prepared value is clearer, use that instead.

## Duplication / identity guard

Restore must never:
- bind a new ordinary wild animal merely because the species matches;
- keep a stale saved/runtime animal binding;
- create two runtime bindings for one quest;
- materialize a second quest identity.

The quest remains the same `questId`; only its lifecycle becomes `invalidated`.

Livestock behavior remains unchanged: deterministic livestock kinds use the existing resolver/rebind path.

## Change order

1. Add focused restore tests that reproduce metadata loss before changing implementation.
2. Adjust the wild restore invalidation branch to preserve normalized durable metadata and drop continuation-only progress.
3. If necessary, extract a very small private invalidation transition helper and reuse it from `invalidateStaleAnimalTargets()`.
4. Verify livestock rebind and New Game reset remain unchanged.
5. Do not touch persistence schema unless a test proves the current optional-field validator rejects an already-existing field.

## Regression tests

In `src/quests/QuestManager.test.ts`, cover at minimum:

1. active wild `kill_target_animal` restore → `invalidated`;
2. active wild `find_animal` restore → `invalidated`;
3. persisted `journal` survives restore invalidation;
4. persisted `worldKnowledge` survives;
5. persisted `dialogueCooldowns` survives;
6. persisted `observation` survives;
7. active-stage `stageCount` does not survive as resumable progress;
8. active-stage `stageSlotProgress` does not survive as resumable progress;
9. no wild `animalTargets` binding is recreated — interaction with an arbitrary same-kind animal cannot advance the invalidated quest;
10. livestock active restore still rebinds and remains completable;
11. `invalidateStaleAnimalTargets()` preserves the same durable metadata when it invalidates a wild binding during rebuild;
12. `reset()` still clears journal/worldKnowledge/dialogueCooldowns/observation and runtime bindings.

Prefer extending the existing restore/rebuild describes rather than creating broad new fixtures.

## Persistence / save compatibility

No schema change.

- No `CURRENT_SAVE_VERSION` bump.
- No migration.
- Existing saves already contain these optional fields.
- Restore continues through `normalizeRestoredProgress()`.
- The change only stops discarding already-valid saved metadata when lifecycle is converted to `invalidated`.
- `animalTargets` remains runtime-only and absent from save data.

## Guardrails

- Do not make ordinary wild individual IDs persistent.
- Do not change the rule that wild active animal-bound quests invalidate across untrustworthy restore/rebuild boundaries.
- Do not alter livestock deterministic rebind semantics.
- Do not route invalidation through `applyOutcome()`; invalidated is not complete/failed.
- Do not grant rewards, relation changes, reputation or social consequences.
- Do not preserve active-stage counted/slot progress as resumable state.
- Do not make `reset()` preserve metadata.
- Do not add a persistence registry or restoration subsystem.
- Do not touch `quests-progression-069`.

## Manual verification

User-owned browser verification only:

1. Start a wild-animal-bound quest and create some visible quest history/context.
2. Save and reload.
3. Confirm the quest is shown as invalidated rather than silently retargeted.
4. Confirm its prior journal/context remains visible where the UI exposes it.
5. Confirm interacting with/killing a newly spawned same-kind wild animal does not advance it.
6. Separately restore a livestock-bound quest and confirm it remains active/completable.
7. Start New Game and confirm old metadata does not carry over.

Do not run browser verification as the implementation agent.

## Out of scope

- persistent identity for ordinary wild fauna,
- fauna save schema,
- quest outcome redesign,
- generated opportunity retention (owned by quests-progression-071),
- offer pacing/gating (quests-progression-069),
- UI redesign,
- broad quest-system cleanup.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
