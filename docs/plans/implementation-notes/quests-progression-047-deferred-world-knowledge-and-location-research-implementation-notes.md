# Implementation notes: quests-progression-047 deferred world knowledge and location research

## Current architecture confirmed

### Quest progress ownership

`src/quests/QuestManager.ts` owns runtime quest progress in `states: Map<string, QuestRuntimeProgress>` and persists through `QuestProgressEntry` from `src/quests/quests.ts`.

Current persisted fields include state/stage/outcome, stage-local progress, offer cooldown and journal stamps. This is the correct place for deferred-knowledge progress; do not introduce a separate save registry.

`QuestManager.reset()` keeps the manager instance alive across New Game, so any async knowledge request implementation needs an epoch/token or equivalent stale-completion guard.

### World time already exists

`QuestManager` already receives `QuestWorldTimeLookup` with:

```ts
getWorldSeed()
getTimeOfDay()
getElapsedDays()
```

Use `getElapsedDays()` for authored research deadlines. No timer manager is needed.

### World seams are injected

`QuestManager` already follows the desired ownership boundary for fauna, world progress, reputation, lights and physical outcomes: narrow interfaces are injected; the manager does not import world managers.

Add deferred world resolution the same way. Do not import `ChunkManager`, settlements or `WorldLocationCatalog` into `QuestManager`.

### Existing effects seam

`QuestStageEffect` currently handles one-shot world mutations (`reveal_location`, exact item transfer, animal ownership, carried-container discard) via `QuestLifecycleHooks`.

A research-request effect can reuse this dispatch style if acceptance/stage flow can invoke it exactly once. If the current offer-accept path has no effect seam, add the smallest general acceptance-effect hook rather than a landmark-specific callback.

### Existing dialogue stage machinery

`QuestManager` already owns `QuestDialogOverride`, stage `dialogueActions`, `talk_to_npc`, `talk_to_npc_choice`, topic arbitration and journal stamps. Vue only renders the DTO/callbacks.

The deferred-knowledge waiting/ready interaction belongs inside this machinery. Do not add UI interpretation of knowledge states.

## Current eager landmark path

### `buildLandmarkQuests`

`src/quests/quests.ts::buildLandmarkQuests(resolve)` currently requires a synchronous `LandmarkResolver = (kind) => string | undefined` and omits a quest if lookup misses.

It eagerly resolves five quests before `QuestManager` construction:

- `stare-ruiny` → `smallRuins`
- `slad-przy-monolicie` → `monolith`
- `zapomniany-cmentarz` → `cemetery`
- `zaginiony-ladunek` → `shipwreck`
- `samotna-wieza` → `tower`

`src/app/createApp.ts` owns `LANDMARK_QUEST_SEARCH_CHUNK_RADIUS = 10` and supplies `ChunkManager.findLandmarkNear` around the home settlement.

Do not migrate all five automatically. This plan specifically pilots `slad-przy-monolicie`; local/visually obvious places should remain able to use immediate binding.

### world-028

`world-028` added shared lightweight unloaded placement for `monolith`, `stoneCircle`, `smallRuins`. These are suitable pilot targets because their lookup no longer materializes full chunk environments.

`shipwreck` and `tower` still use the broader full fallback. Do not use this plan as an excuse to hide those costs behind `Promise.resolve().then(...)`; that would still block the main thread when the synchronous resolver runs. Keep them immediate for this plan or address their primitive separately.

## Generated RPG old-place-secret

`src/quests/opportunities/rpgQuestMatrices.ts` currently collects `old-place-secret` from an already supplied `RpgLandmarkRef[]`, chooses the first eligible landmark and encodes `chosen.id` into `RpgQuestOpportunity.sourceId`.

`src/quests/opportunities/rpgQuestMaterialization.ts::materializeOldPlaceSecret()` then puts `opportunity.sourceId` directly into `interact_landmark`.

Important compatibility property: generated quest id is:

```text
rpg:old-place-secret:<settlementId>:<sourceId>
```

Changing when the Player learns the location must not destabilize this id for persisted generated quests.

Recommended integration boundary:

- keep world/opportunity identity deterministic;
- defer **player/NPC knowledge exposure** and objective binding through the generic knowledge slot;
- do not make candidate selection depend on conversation order or resolver completion order.

If removing eager candidate collection would destabilize the quest id, keep deterministic candidate identity selection but defer the expensive/player-facing place resolution. The plan's goal is deferred knowledge, not mandatory deferred candidate identity at any architectural cost.

## Lost Treasure Chronicles

`quests-progression-038` currently establishes deterministic chronicle truth before visit order and binds a real cemetery plus reserved expedition ruins. `src/app/worldBundle.ts` searches chronicle ruins during world build; the binding is exposed through `lostTreasureChronicleSearchRuntime` and `WorldLocationCatalog`.

Do not make grave-vs-ruins truth lazy or conversation-dependent.

The safe pilot is narrower:

- preserve deterministic chapter truth and physical item placement;
- defer the **archaeologist's learned/revealed ruins clue** through the generic research state;
- if physical content generation currently requires the ruins binding before the quest exists, keep that world truth eager and treat the quest knowledge slot as delayed knowledge of the existing stable ref.

This distinction is important: world existence/truth may be eager while NPC/player knowledge is lazy.

## Recommended types / ownership

Names may adapt, but keep the separation.

### Authored definition

A small quest-level declaration should identify stable knowledge slots and authored delay, e.g. conceptually:

```ts
type QuestWorldKnowledgeDef = {
  id: string
  revealDelayDays: number
  unavailablePolicy: ...
}
```

Do not put terrain-specific resolver functions into `QuestDef`.

### Persisted progress

Add optional knowledge progress to `QuestProgressEntry` / `QuestRuntimeProgress`, keyed by stable authored knowledge id.

Conceptually:

```ts
type QuestWorldKnowledgeProgress = {
  requestedAtDays: number
  revealAtDays: number
  status: 'requested' | 'resolved' | 'unavailable'
  ref?: QuestWorldKnowledgeRef
}
```

Prefer a discriminated union for `ref`; V1 needs landmark identity. Keep it small and serializable.

The persisted ref is the Player/NPC's selected knowledge binding, not a second owner of physical world placement.

### Resolver seam

Inject an async resolver into `QuestManager`, conceptually:

```ts
type QuestWorldKnowledgeResolver = {
  resolve(questId: string, knowledgeId: string): Promise<QuestWorldKnowledgeRef | null>
  describe(ref: QuestWorldKnowledgeRef, context: ...): string | null
}
```

If description ownership is cleaner as a separate injected formatter, split it. Avoid making `QuestManager` know settlement coordinates or `cardinalDirectionPhrase` geometry.

The resolver used from `createApp` should access the current bundle through a getter/current variable so a same-session bundle rebuild cannot leave an in-flight request permanently tied to an old `ChunkManager`.

### Async stale-write guard

Because `QuestManager.reset()` reuses the object, capture an epoch when launching a request and increment it on reset. Ignore completions from an older epoch. Apply equivalent protection if manager teardown/recreation exists elsewhere.

Do not persist runtime task handles.

## Objective shape

Current `interact_landmark` is concrete:

```ts
{ type: 'interact_landmark', landmarkId: string }
```

Do not use fake ids/placeholders in this field.

Prefer a typed new objective for deferred binding, e.g.:

```ts
{ type: 'interact_bound_landmark', knowledgeId: string }
```

`objectiveMatchesRef()` can resolve the persisted knowledge ref and compare its landmark id to the reported `ObjectiveRef.interact_landmark.landmarkId`.

For the return-to-NPC step, add an explicit typed primitive (for example `receive_world_knowledge`) rather than encoding readiness into arbitrary reminder strings. It should use normal dialogue arbitration and a conscious player action once both conditions are met:

```text
binding resolved
AND
world time >= revealAtDays
```

Before then, interaction returns informational pending dialogue and does not advance.

## Text / clue formatting

`src/quests/cardinalDirection.ts::cardinalDirectionPhrase` already produces direction phrases. `src/quests/caveLocationDescription.ts` demonstrates composition of world geometry into player-facing location text.

Add one pure/narrow place-description helper rather than embedding coordinate math in quest definitions.

The helper should be able to describe a landmark relative to a settlement origin. Keep V1 deterministic and bounded; direction + coarse distance/settlement context is sufficient.

Do not persist rendered text when it can be regenerated from stable ref + world presentation lookup.

The Quest Log still goes through `QuestManager.list()`; expansion/resolution of any authored clue token or dynamic objective text must occur before producing the DTO.

## Journal implications

Journal stores stamps, not quote text. That is useful here.

Ensure there are distinct idempotent stamps for:

- initial/pending research information if it is intended to appear in notes;
- the later revealed clue.

Current dedupe treats progress events by stage index, so if both pending and reveal use the same stage and both need journal entries, the existing event identity may need a narrow extension. Do not silently overwrite or duplicate entries.

## Persistence implementation points

Inspect/update:

- `src/quests/quests.ts::QuestProgressEntry`
- `src/quests/QuestManager.ts::QuestRuntimeProgress`
- normalization/copy helpers in `QuestManager.ts`
- `QuestManager.reset()`
- quest save/export method(s) in `QuestManager.ts`
- `src/persistence/saveData.ts::isQuestProgressEntry`

Older saves must accept missing knowledge fields.

Do not assume a save-version bump is needed; current quest-progress fields are optional and validator-based. Follow current save compatibility rules.

## Pilot-specific notes

### `slad-przy-monolicie`

Best clean static pilot.

Change from eager concrete objective to:

```text
offer/accept
→ request "target" knowledge
→ Anna: needs to reconstruct/check the route
→ authored ~1 world-hour wait
→ receive clue from Anna
→ interact_bound_landmark("target")
→ report as today
```

Existing quest id and final outcome stay unchanged.

For an older save already `active` on the old single landmark stage, migration must place it directly in the post-research investigation stage and reconstruct/bind the same deterministic monolith target rather than forcing the Player to repeat the research fiction.

### `old-place-secret`

Use the same lifecycle, but keep generated quest identity stable.

The giver's current offer says the place is already known exactly enough to go there. Rewrite to a lead such as hearing about an old place, followed by a short research/asking-around step. After reveal, use `LANDMARK_LABELS` + generic location phrase.

Do not add an RPG-matrix-only timer/state field.

### chronicle-search ruins

Do not reroll or defer physical chronicle truth. Only defer knowledge exposure where possible.

The archaeologist is a natural research actor: papers/previous expedition notes can gate the concrete ruins clue. Use the same knowledge state and world-time delay.

If both grave and ruins are currently exposed simultaneously by one QuestDef, preserve chapter branching; only the ruins clue can be delayed in V1 if that avoids redesigning multi-location truth.

## Immediate controls / non-migrations

Keep at least one existing landmark quest on the old immediate concrete path and test it. Good candidates are:

- `zapomniany-cmentarz` — local settlement cemetery;
- `samotna-wieza` — premise says the tower is visible from afar.

This makes the architecture demonstrate that deferred research is opt-in, not a new mandatory quest lifecycle.

`zaginiony-ladunek` is narratively attractive for research, but `shipwreck` unloaded lookup still uses full fallback after world-028. Do not migrate it until its world lookup is non-blocking/cheap or a genuinely sliced/worker resolver exists.

## Validation

Extend `validateQuestDefinitions()` for knowledge ids and new objective/effect references. Keep validation in `quests.ts` with the rest of authored definition checks.

The validator should catch duplicate/missing ids, negative/non-finite delays and incompatible binding/objective kinds.

## Test locations

Likely files:

```text
src/quests/QuestManager.test.ts
src/quests/quests.test.ts
src/quests/opportunities/rpgQuestMatrices.test.ts
src/quests/opportunities/rpgQuestMaterialization.test.ts
src/quests/lostTreasureChronicleSearch.test.ts
src/persistence/saveData.test.ts
```

Prefer fake/manual world clock and controllable deferred Promise in `QuestManager` tests. Do not use real timers or wall-clock sleeps.

## Implementation order

1. Add knowledge definition/progress/ref types + validation.
2. Add persisted runtime state and save validation.
3. Add injected async resolver + stale completion protection.
4. Add request effect/acceptance seam and receive-knowledge objective.
5. Add bound-landmark objective matching.
6. Add generic location description seam.
7. Unit-test generic lifecycle thoroughly.
8. Migrate `slad-przy-monolicie`.
9. Migrate generated `old-place-secret` without changing stable ids.
10. Integrate chronicle-search ruins as delayed knowledge only, preserving existing deterministic story truth.
11. Remove only now-unused eager quest lookups.
12. Update state/docs and run targeted tests, typecheck, lint, build.

## Guardrails

- `QuestManager` owns quest/knowledge progress, not terrain truth.
- World resolver owns place lookup, not quest lifecycle.
- No mutable QuestDef after manager construction.
- No Promise/task handle in SaveData.
- No UI knowledge-state logic.
- No conversation-order world rerolls.
- No artificial delay for NPCs who already logically know the destination.
- No `Promise.resolve(syncHeavyLookup())` masquerading as background work.
- No worker unless profiling/primitive cost justifies it.
- Preserve exact stable world ids for objectives.
- Browser verification belongs to User.
