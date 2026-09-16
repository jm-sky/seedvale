# Implementation Notes: quests-progression-055

## Current ownership

- `QuestManager` owns quest lifecycle, offer exposure, dialogue contributions, cooldowns and the read-only `labelMarker(npcId)` projection.
- `NpcAgent` is intentionally quest-agnostic. Its `private questMarker` plus `setQuestMarker()` are presentation sinks only.
- `gameLoop.ts` owns the current push from `QuestManager.labelMarker()` into loaded runtime NPC agents.
- `SettlementsManager` owns runtime settlement/NPC streaming. `home` is explicitly `null` until `homeReady`, and later settlements can also be destroyed/recreated as runtime objects while stable NPC identity survives separately.

Do not move quest logic into `NpcAgent` or settlement streaming.

## Confirmed lifecycle defect

The current marker sync is guarded only by `QuestManager.isDirty()`.

Current shape in `gameLoop.ts`:

```text
if questManager.isDirty()
  → getLoaded()
  → setQuestMarker(labelMarker(id)) for currently existing NPCs
  → sync spawner markers
  → clearDirty()
```

`QuestManager` starts dirty, but `SettlementsManager.home` is asynchronously materialized. Therefore the first dirty pass can legally see no home NPCs and still clear the flag. A later-created `NpcAgent` starts with `questMarker = null` and receives nothing until another quest mutation dirties the manager.

This is not New-Game-specific. Stable `NpcId` is not sufficient for detecting whether a **runtime presentation sink** has been initialized: settlement unload/reload can recreate the agent with the same id.

### Preferred integration shape

Keep two independent invalidation reasons:

1. **quest-domain invalidation** — existing `QuestManager.dirty`: all currently loaded sinks need recomputation;
2. **sink lifecycle initialization** — a runtime `NpcAgent` that has never been synced needs one initial projection even when quests are clean.

A `WeakSet<NpcAgent>` local to `createGameLoop` (or equivalently narrow helper state keyed by runtime object identity) fits the lifecycle correctly:

- new agent instance → absent → set current marker once, add to set;
- dirty quest manager → recompute all loaded NPCs and add them to the set;
- unload → no explicit cleanup required for a WeakSet;
- reload same stable id → new object identity, therefore receives initial sync again.

If implementation constraints make `WeakSet` awkward, use an instance-reference map, not `Set<NpcId>`.

Do not solve this by delaying the first `clearDirty()` until `homeReady`; that would still miss later stream-in/recreated settlements.

Do not mark QuestManager dirty from `SettlementsManager`; that would couple presentation lifecycle back into quest-domain state.

## Marker actionability defect

`labelMarker()` currently gives active required targets first priority. The relevant chain is:

```text
active quest
→ activeDialogueCooldown(def, npcId) guard
→ isRequiredDialogueTarget(currentStage, npcId, unfinishedSlots)
→ '?'
```

`isRequiredDialogueTarget(...)` includes stage/objective identity such as `talk_to_npc`, `talk_to_npc_choice` and matching `stage.dialogueActions`.

The important mismatch is conceptual: stage membership answers **“is this NPC named by the current quest stage?”**, while the label needs **“does talking to this NPC expose a quest-progressing action right now?”**.

`onInteract()` is the authoritative presentation path and already has the richer filtering/gating needed to decide what actually appears. Do not call it from `labelMarker()` because it can admit offers / mutate state.

### Implementation direction

During implementation, trace the read-only branches inside `onInteract()` that contribute:

- `talk_to_npc` actions,
- `talk_to_npc_choice` actions,
- stage `dialogueActions`,
- gather hand-in/report readiness,
- cooldown suppression,
- world-knowledge / physical-resolution / other existing action gating.

Extract only the smallest pure/read-only predicates necessary so both `onInteract()` and `labelMarker()` consume the same notion of availability.

Do not create a parallel marker-only evaluator duplicating all dialogue rules.

### Generic abandonment is not actionability

Plan 034 made generic abandon actions `topicScoped` so they do not flatten into ambiguous top-level actions. They are an opt-out mechanism, not a stage target.

Therefore:

```text
active quest + reminder + generic abandon only
→ ordinary active marker '…'
```

not:

```text
→ '?'
```

A genuine report/hand-in remains `✓`; an exposed offer remains `!`.

## Newer dialogue mechanisms that must remain respected

Plan 050 is already present on current main:

- persisted `dialogueCooldowns`,
- `activeDialogueCooldown(...)`,
- reaction selection / social consequence evaluation,
- cooldown-aware quest dialogue.

The marker fix must not regress those semantics. A cooldown that suppresses the quest conversation must suppress the corresponding `?` for the same period.

`QuestStageDialogueAction` also carries existing effects/requirements (including world-knowledge-related gating). Marker actionability must use the same live conditions as dialogue.

## Marker reduction invariant

Preserve the post-plan-034 priority globally across all quest defs:

```text
? actionable required talk/action target
✓ actionable giver completion/hand-in/report
! actually exposed offer
… ordinary active context/reminder
null none
```

Do not return early in a way that makes the result depend on `defs` order. Existing tests already protect some order-independence; extend them for the new non-actionable-active case.

## Files and symbols

### `src/app/gameLoop.ts`

Relevant integration:

- `createGameLoop(...)`
- quest marker sync block guarded by `questManager.isDirty()`
- `bundle.settlementsManager.getLoaded()`
- `npc.setQuestMarker(questManager.labelMarker(npc.id))`
- `questManager.clearDirty()`

Add runtime-instance initialization here or in one tiny helper owned by `src/app/`.

### `src/settlement/SettlementsManager.ts`

Reference only unless recon proves an existing generic runtime-created callback should be reused.

Relevant facts:

- `home: Settlement | null`
- `homeReady: Promise<Settlement>`
- `getLoaded(): Settlement[]`
- runtime settlement instances are streaming-owned.

Do not add quest dependencies here.

### `src/ai/NpcAgent.ts`

Reference only:

- `private questMarker: string | null = null`
- `setQuestMarker(marker)`

Keep it as a sink.

### `src/quests/QuestManager.ts`

Primary symbols:

- `labelMarker(npcId)`
- `onInteract(npcId)`
- `activeDialogueCooldown(def, npcId)`
- `isRequiredDialogueTarget(...)`
- `unfinishedSlots(...)`
- offer exposure/selectable helpers already used for `!`
- gather/report helpers introduced/reused by plan 034 for `✓`

Before editing, read the complete current `onInteract()` contribution assembly and identify the exact helper(s) deciding whether a stage dialogue action is visible/actionable. Reuse those helpers rather than guessing from `QuestStage` shape.

### `src/quests/QuestManager.test.ts`

Existing coverage already checks marker glyphs, order-independent multi-quest behavior, gather hand-in invalidation and plan-050 dialogue cooldown behavior. Extend those blocks rather than making a disconnected test suite.

## Suggested implementation order

1. Add/adjust tests for the marker `?` false-positive first.
2. Extract/reuse read-only actionability predicates from the actual `onInteract()` path.
3. Update `labelMarker()` while preserving global priority/order-independence.
4. Add a small testable runtime-instance marker-sync helper if direct `gameLoop` testing is too heavy.
5. Implement initial sync for every new runtime `NpcAgent` without removing `QuestManager.dirty`.
6. Add reload-same-`NpcId` regression coverage.
7. Run focused quest/app tests, then repository typecheck/lint/build per `CLAUDE.md`.

## Test details

### Actionability

Use purpose-built minimal `QuestDef`s where possible so failures point at marker semantics rather than authored content.

Required cases:

- active `talk_to_npc` unfinished target → `?`;
- active `talk_to_npc_choice` target with visible choice → `?`;
- available authored stage action → `?`;
- same action under active dialogue cooldown → not `?`;
- active giver context where only generic abandon remains → `…`;
- foreign quest actionable target outranks giver's unrelated `…`;
- `✓` / `!` are not hidden by a different non-actionable active quest;
- reverse `defs` order and assert same result.

### Runtime sink lifecycle

Prefer a pure/narrow helper test over booting Three/WebGL.

Model runtime agents with object identity:

```text
frame 1: [] + questDirty=true
→ clear quest dirty
frame 2: [agentA(id=X)] + questDirty=false
→ agentA receives marker
frame 3: same agentA
→ no unnecessary repeat recompute
frame 4: [agentB(id=X)] after simulated reload
→ agentB receives marker despite same stable id
```

Then separately test dirty=true updates all currently loaded agents.

The helper must not retain unloaded agents strongly if it can avoid doing so.

## Scope traps

- Do not add a permanent marker value to save data.
- Do not persist whether an NPC runtime instance was synced.
- Do not use player distance/camera visibility to decide quest marker correctness.
- Do not make `labelMarker()` mutate quest state.
- Do not turn off dirty optimization.
- Do not add per-quest special cases.
- Do not broaden this plan into marker visuals/CSS or generic dialogue redesign.
- Spawner marker lifecycle is out of scope unless implementation recon proves the exact same late-created-sink bug exists there and the same tiny helper can fix it without widening architecture.

## Manual verification handoff

Browser verification belongs to the User. The implementation agent should finish with automated checks only and provide the concrete manual scenarios from the plan.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
