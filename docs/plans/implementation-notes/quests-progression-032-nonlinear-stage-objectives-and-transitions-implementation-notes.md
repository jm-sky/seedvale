# Implementation Notes: quests-progression-032 — Nonlinear stage objectives and transitions

Recon baseline: current `main` after `quests-progression-028` is implemented. These notes capture implementation-relevant decisions only; the source plan owns scope/product intent.

## 1. Current ownership and linear assumptions

`QuestManager` remains the only owner/mutator of quest progress. Do not move objective state into Vue, world entities or a new quest graph runtime.

The current contract is structurally linear:

- `src/quests/quests.ts`: `QuestStage.objective` is exactly one `QuestObjective`.
- `QuestProgressEntry` / `QuestRuntimeProgress`: one `stageIndex`, optional single `stageCount`.
- `QuestManager.advanceStage()` clears stage-local feed dedupe, increments `stageIndex`, binds the next animal target, or enters `ready_to_report`.
- `animalTargets` is currently `questId -> animalId` and therefore assumes at most one bound animal objective in the active stage.
- `feedContributionIds` is keyed by quest + stage and likewise assumes one feed objective.

Plan 028 already changed world-fact ingress to fan out across matching quests. Plan 032 must extend that same principle *within* one active stage: an ingress/poll checks every active objective slot, while stage completion remains owned by one central helper.

## 2. Normalize to objective slots; keep legacy authored content unchanged

Do not rewrite existing quest data. Keep `objective` as backward-compatible sugar and introduce one normalized internal view used everywhere.

Recommended shape: a multi-objective stage has `mode: 'all' | 'any'` plus objective slots carrying a stable stage-local `id` and `objective`. Legacy `stage.objective` normalizes to one slot such as `primary` with `mode: 'all'`.

Add small shared helpers in `src/quests/quests.ts` (names may follow local style), e.g. `questStageObjectiveSlots(stage)` / `questStageMode(stage)`. All runtime and composition code should use them instead of branching repeatedly on legacy-vs-multi shape.

Slot ids are required for persistence/runtime bindings. Do not use array index as persisted identity: authored reordering would silently attach saved partial progress to the wrong objective.

`AuthoredQuestStage` and `materializeAuthoredQuests.ts` must materialize NPC-bearing objectives inside every slot, not only the legacy `objective` field. Preserve `QuestNpcRef` as runtime identity.

## 3. Transition identity: stage ids, not numeric authored targets

Runtime may continue storing `stageIndex` for the active stage, but authored transitions should target stable stage ids rather than raw indices. Add optional `QuestStage.id`; require it only when a stage is referenced by a transition.

`validateQuestDefinitions()` should reject:

- empty/duplicate objective-slot ids within a stage;
- multi-objective stages with fewer than 2 slots;
- missing/duplicate stage ids where transitions use them;
- transition result ids that are duplicated/ambiguous for one stage;
- unknown target stage ids;
- unknown terminal outcome ids;
- backward/self stage transitions in this first implementation.

Keep transitions forward-only. Branching/skipping/merging is enough for current needs and avoids accidentally creating a cyclic graph engine.

No explicit transition means existing behavior: next array stage, otherwise `ready_to_report`.

## 4. Result semantics

Keep branching narrow and deterministic.

- `any`: the slot that completes may provide the result/resolution id used to select a transition.
- `all`: individual slot completion only records progress; the transition is evaluated once the final required slot completes. If branching is needed after an `all`, use one stage-level completion result rather than whichever slot happened to finish last.
- A transition may target either another stage or an existing `QuestOutcome`, never both.
- Terminal transition must go through the existing outcome application path (`applyOutcome` / equivalent), preserving exact-once reward, relation, reputation and effect semantics.

`talk_to_npc_choice` already resolves directly to a terminal outcome and is semantically different from a normal stage-completion objective. Do not make it a multi-slot branching primitive in this plan; validate it as legacy/single-objective only unless implementation finds a clean reuse with identical semantics. The same caution applies to `await_quest_outcome`.

## 5. Persist per-slot progress explicitly

A single `stageCount` cannot represent two counted objectives or one completed event objective plus another unfinished objective.

Add optional stage-local per-slot progress to `QuestProgressEntry` / `QuestRuntimeProgress`, keyed by stable objective-slot id. It needs only quest progress, not copies of domain state:

- completion bit for a satisfied slot;
- count where the objective is counted (`harvest_animals`, `feed_habitat_animals`).

Keep existing `stageCount` behavior for legacy single-objective stages so old saves/content do not need migration. New multi-objective stages use the slot map. Missing slot progress on restore means empty progress.

Update together:

- `QuestManager` restore normalization and `exportProgress()`;
- `src/persistence/saveData.ts` quest-progress validation;
- stage transition cleanup so old slot progress never leaks into the next stage.

Persisting a completion bit is quest history, not duplicate world ownership. World systems remain authoritative for fauna, containers, locations, settlement state, etc.

## 6. Runtime bindings must become slot-scoped

`animalTargets: Map<questId, animalId>` cannot support two animal objectives in one stage. Key runtime binding by quest + stage + slot id (or an equivalent small typed key). Update binding, lookup, invalidation, `hasSocialOutcomeClaim`, stage cleanup and restore rebinding consistently.

Likewise include slot id in `feedContributionIds`; otherwise two feed slots in the same stage share dedupe state incorrectly.

Do not persist wild-fauna runtime bindings. Preserve the existing restore/rebind/invalidate ownership rules.

## 7. Ingress/poll refactor boundary

There are many direct `stage.objective` assumptions in `QuestManager` (interaction matching, dialogue target detection, container/read/location/poll paths) and outside it (`materializeAuthoredQuests.ts`, `createApp.ts` landmark occupancy, tests/content helpers).

Avoid adding per-event special cases. Introduce one way to enumerate unfinished active slots and one central "slot satisfied" path that:

1. ignores already completed slots;
2. records count/completion for that slot;
3. checks `any`/`all` completion;
4. performs exactly one stage transition;
5. clears stage-local runtime state before entering the target stage/outcome.

Ingress functions should report facts and identify matching slots; they should not each implement branching.

For dialogue/marker logic, an NPC is a required target if *any unfinished slot* targets that NPC, plus existing `dialogueActions` behavior.

## 8. Quest Log compatibility

`QuestManager.list()` currently exposes one `currentObjective` string. Do not redesign UI here (`ui-input-017`). For multi-objective stages, derive a deterministic textual summary from unfinished slots or fall back to the stage description. Keep DTO interpretation in `QuestManager`; Vue must not inspect slot ids or transition data.

## 9. Tests with highest value

Primary file: `src/quests/QuestManager.test.ts`; definition validation tests belong in `src/quests/quests.test.ts` or the existing validation suite.

Cover at least:

- legacy one-objective quest unchanged, including counted `stageCount` save/restore;
- `any`: either slot completes stage; second fact after transition is a no-op;
- `all`: both orders work; first completion survives save/load;
- two counted slots keep independent counts;
- two animal-bound slots do not overwrite each other's target;
- result A/B branches to two different forward stage ids;
- result can terminate through an existing outcome exactly once;
- invalid duplicate slot ids, bad stage target, bad outcome target and backward/self transition fail validation;
- authored NPC objective slots materialize to stable `QuestNpcRef`;
- existing fan-out from plan 028 still advances every matching quest.

No browser verification; manual browser verification remains user-owned.

## 10. Likely touched files

Core: `src/quests/quests.ts`, `src/quests/QuestManager.ts`, `src/quests/materializeAuthoredQuests.ts`, `src/persistence/saveData.ts`, `src/quests/QuestManager.test.ts`, definition/materialization tests. `src/app/createApp.ts` may need only narrow replacement of direct `stage.objective` reads with the normalization helper.

Do not introduce a QuestEngine, event bus, condition DSL, graph library or new persistence owner.