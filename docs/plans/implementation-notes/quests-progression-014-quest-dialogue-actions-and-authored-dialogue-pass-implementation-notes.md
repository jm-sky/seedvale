# Implementation Notes: Quest Dialogue Actions & Authored Dialogue Pass

Companion to `docs/plans/quests-progression-014-quest-dialogue-actions-and-authored-dialogue-pass.md`.

Recon against current `main` and `docs/STATE.md` on 2026-09-10. These notes record implementation-relevant seams and decisions only; current code wins if it changes before implementation.

## Current-state facts that matter

`docs/STATE.md` currently says:

- `QuestManager` owns definitions/objectives/stages and quest progress.
- objective completion is distinct from terminal resolution;
- availability prerequisites only gate `not_offered` → offer visibility; later drops do not revoke an offered/active quest;
- an active `talk_to_npc_choice` currently resolves immediately when the player talks to one authored NPC;
- quest progress, `resolvedOutcomeId` and player↔NPC relations persist;
- `ReputationManager` separately owns settlement reputation/renown;
- Vue is already the NPC-dialogue presentation layer and `FlavorDialog` is a separate generic contextual-dialog mechanism.

That matches current code. Plan 014 should change the immediate NPC-interaction resolution semantics, not replace the ownership model.

## 1. Quest definition ownership — `src/quests/quests.ts`

Important current types/symbols:

- `QuestObjective`
- `QuestStage`
- `QuestDef`
- `QuestOutcome`
- `QuestAvailability`
- `QuestPrerequisite`
- `validateQuestDefinitions()`
- `validateTalkToNpcChoiceObjective()`
- `QUESTS`
- `buildLandmarkQuests()`

Current dialogue-related shape:

- `talk_to_npc` carries only `npcName`;
- `talk_to_npc_choice.choices[]` carries only `{ npcName, outcomeId }`;
- `QuestStage.progressLine` is NPC/presentation text, not a player action;
- `QuestDef.reportLine` is the giver response after successful turn-in;
- there is no authored player-facing report line.

Recommended minimal extension:

- add a player-facing line for report/turn-in at `QuestDef` level (e.g. `reportPlayerLine?: string`);
- add a player-facing line to `talk_to_npc_choice` choices (e.g. `playerLine: string`);
- add an optional player-facing line for `talk_to_npc` stages/objectives where the stage represents actually saying something. Prefer one field on the existing stage/objective contract; do not create a conversation graph.

Keep `reportLine` as the NPC response. Do not overload it with the player's sentence.

Extend the existing validator rather than adding a second validation pass. At minimum validate non-empty player lines for authored choice actions and continue validating choice NPC uniqueness/outcome IDs. Preserve current quest/outcome IDs.

## 2. Quest runtime authority — `src/quests/QuestManager.ts`

Important current symbols:

- `QuestDialogOverride`
- `ObjectiveRef`
- `objectiveMatchesRef()`
- `matchingTalkChoice()`
- `QuestManager.onInteract()`
- `QuestManager.onInteractObjective()`
- `QuestManager.handleGiverInteract()`
- `QuestManager.resolveTalkToNpcChoice()`
- `QuestManager.resolveSuccessfulTurnIn()`
- `QuestManager.applyOutcome()`
- `QuestManager.advanceStage()`
- `QuestManager.labelMarker()`
- `QuestManager.spawnerMarker()`
- `QuestManager.meetsAvailability()` / `meetsPrerequisite()`

### Current problematic transitions

`resolveTalkToNpcChoice()` currently calls `applyOutcome()` during `onInteract(npcName)`. Therefore merely opening the matching NPC interaction selects the terminal outcome.

`onInteract()` also directly calls `advanceStage()` for a matching non-giver `talk_to_npc`. Therefore merely talking to Piotr completes a message stage before the player selects/says anything.

The successful giver path currently ultimately reaches `resolveSuccessfulTurnIn()`, which calls `applyOutcome()` immediately. Plan 014 needs the `ready_to_report` giver interaction to return a pending player action instead of resolving at dialog-open time.

### Preserve the exact-once authority

Do not move reward/consequence logic into Vue. `applyOutcome()` already owns:

- terminal state,
- `resolvedOutcomeId`,
- item rewards,
- relation deltas,
- settlement social consequences,
- horse transfer,
- completion sound,
- cleanup of bound animal targets.

Keep it as the exact-once terminal seam. A quest-dialog action callback should re-read current quest state and only then call the existing resolution/advance path. This naturally protects against stale UI, double click and reopened dialogs because `applyOutcome()` already refuses terminal quests; stage actions should receive an equivalent live-state/stage guard before `advanceStage()`.

### Minimal dialogue-action contract

Extend `QuestDialogOverride`, semantically, with something like:

```ts
type QuestDialogAction = {
  label: string
  onSelect: () => string
}

export type QuestDialogOverride = {
  line: string
  offer?: { onAccept: () => void; onDecline: () => void }
  actions?: readonly QuestDialogAction[]
}
```

Exact naming may follow local conventions. `QuestManager` owns callbacks; UI only invokes them and displays returned NPC text.

Do not mechanically replace existing `offer` accept/decline. Offer lifecycle and quest report/choice lifecycle are different transitions, and changing both at once adds unrelated risk.

Add/retain JSDoc `@domain quests-progression` on the new public/integration action seam if it materially improves preflight discovery.

## 3. NPC dialogue UI — existing seam, no new modal

### `src/ui-vue/store.ts`

`NpcDialogueMenuState` already stores:

- `helpResult: QuestDialogOverride | null`
- `helpFromQuestManager: boolean`

`helpFromQuestManager` exists specifically so quest-driven interactions can open directly on the quest line. Extend this existing state rather than creating quest-specific UI state elsewhere.

### `src/ui-vue/NpcDialogueMenu.vue`

Current `help` topic:

- displays `state.helpResult?.line`;
- detects only `helpResult.offer` via `hasOffer`;
- renders `Przyjmij` / `Odmów` for an offer;
- otherwise renders a generic `Wróć` button.

Add rendering for `helpResult.actions`. On action click:

1. emit the normal UI click;
2. call the action once;
3. replace the displayed help response with the returned NPC line (or otherwise store that response locally in the existing component lifecycle);
4. keep the dialogue open so the player sees the NPC reaction;
5. after resolution, do not keep stale action buttons active.

Do not make Vue inspect quest IDs, stage types or outcome IDs.

`src/ui-vue/npcDialogueOpen.test.ts` already tests that quest-driven target dialogue opens directly on the quest line and currently expects the stage to advance on open. That expectation must change: open should expose the player action, and only selecting it advances/resolves.

## 4. `resolveInteraction.ts` — pass identity, not quest rules

`src/interaction/resolveInteraction.ts` currently reports a spawner objective as:

```ts
{ type: 'interact_spawner', spawnerType: target.spawner.type }
```

`ObjectiveRef` and `objectiveMatchesRef()` therefore only match `spawnerType`. This is why a quest authored as one particular cave can currently be completed at another cave.

The `spawner` interactable already contains the real `PreySpawner`, so thread its existing `id` through the ref. Do not search for a spawner here and do not put quest-specific cave logic in `resolveInteraction.ts`.

Recommended contract:

```ts
// QuestObjective
{ type: 'interact_spawner', spawnerType: SpawnerType, spawnerId?: string }

// ObjectiveRef
{ type: 'interact_spawner', spawnerType: SpawnerType, spawnerId: string }
```

Matching rule:

- when objective has `spawnerId`, require exact identity;
- otherwise preserve the existing type-only behavior for objectives intentionally targeting any habitat of a type.

Also review `QuestManager.spawnerMarker()`: today it accepts only `SpawnerType` and marks by type. If `sprawdz-szlak` becomes exact-id-bound, avoid showing the same quest marker on every cave. Prefer extending the existing marker seam to accept/use spawner identity rather than adding another marker system. Trace its current call site before changing the signature.

## 5. Existing stable spawner identity — reuse it

`src/fauna/AnimalSpawner.ts` already defines `PreySpawner` with:

- `id: string` — stable/deterministic from settlement + spawner type;
- `x`, `z`;
- `type`;
- lifecycle state.

`src/fauna/createFauna.ts` exposes `Fauna.getSpawners(): readonly PreySpawner[]`.

This is sufficient for both exact quest binding and cheap direction derivation. Do not create `QuestCaveId`, persist cave coordinates, or add a spatial index for plan 014.

Important lifetime caveat: `createApp.ts` comments and existing injected resolvers deliberately read `bundle` indirectly so they survive `WorldBundle` rebuilds. If plan 014 binds static quest defs to a spawner during composition, verify that the selected `PreySpawner.id` is deterministic across rebuilds (the type contract says it is) and do not retain a stale `PreySpawner` object reference in long-lived quest state. Store/bind stable ID and derived text only.

## 6. Composition root — `src/app/createApp.ts`

Current quest composition is already the right ownership boundary:

1. `buildLandmarkQuests()` resolves procedural landmarks once near `getHomeDef().x/z`;
2. `homeSettlementId` is resolved once;
3. static `QUESTS`, landmark quests, treasure quest and horse quest are combined;
4. each definition receives `settlementId`;
5. the resulting definitions are passed to `new QuestManager(...)`.

This is the preferred place to bind exact procedural quest targets and derive cheap presentation hints, because `QuestManager` intentionally remains terrain/chunk/fauna-scan agnostic.

For cave-bound authored quests, use `bundle.fauna.getSpawners()` once during quest composition and select the intended home-settlement cave using the stable existing identity/convention. Do not perform a second lookup later from `QuestManager.onInteract()` or Vue.

Before coding the selector, inspect the current spawner-ID construction in `createFauna.ts` and use that real contract rather than guessing an ID string in `quests.ts`. If there is a small existing helper that resolves a settlement/type spawner, reuse it; otherwise add the narrowest helper next to fauna/spawner ownership, not a generic quest navigation service.

### Direction hint

Once the exact target is already resolved, use:

- `homeDef.x/z` from `bundle.settlementsManager.getHomeDef()`;
- target `PreySpawner.x/z` from that same resolved spawner.

Compute `dx/dz` once and map to eight sectors. This is presentation-derived data. Do not persist it.

Avoid claims such as `za ostatnimi zabudowaniami` or `przy skraju lasu` unless those facts are already authoritatively available without extra work. The safe v1 text is e.g. `na północny wschód od osady` (optionally a simple straight-line distance adjective derived from the same `dx/dz`).

Performance guardrail is strict: no `findLandmarkNear`, world-location catalog search, terrain sampling, raycasts, visibility, pathfinding, per-dialog scan, per-render computation or worker request solely for this prose. If the exact target is not already cheaply resolved, use the neutral fallback text.

A tiny pure helper for direction-sector formatting is appropriate and unit-testable; keep it in the smallest quest/presentation utility seam rather than introducing a navigation subsystem.

## 7. Landmark quests are a precedent, not a target for refactor

`buildLandmarkQuests(resolve)` already demonstrates the desired pattern: resolve a deterministic procedural target before `QuestManager` construction and put its stable ID into the objective. Do not rewrite landmark ownership to make cave binding look identical internally.

Landmark resolution currently calls `ChunkManager.findLandmarkNear(...)`, which is intentionally a bounded world lookup. Plan 014's cave directional hints must not call it or the newer world-location catalog merely to generate prose.

For existing landmark authored-text improvements (`stare-ruiny`, `slad-przy-monolicie`, `zapomniany-cmentarz`), only add direction text if the current resolver can return coordinates without introducing an additional search. If the current `LandmarkResolver` returns only an ID, neutral text is acceptable for this plan; do not widen the world lookup just to satisfy optional direction prose.

## 8. Availability recon — important discrepancy with the plan wording

Current `src/quests/quests.ts` does **not** make `wilki-pod-osada` depend on `grozny-wilk`. It currently has only:

```ts
availability: {
  prerequisites: [
    { type: 'relation', npcName: 'Anna', minimum: 'trusted' },
  ],
}
```

`trusted` is numeric relation `>= 6` via `RELATION_LEVEL_THRESHOLDS`.

The quest that currently has **both** `trusted` and prior `grozny-wilk` outcome gates is `wilcza-jama`.

Therefore implementation must follow current code, not the plan's stale assumption:

- remove the `trusted` gate from `wilki-pod-osada`;
- do not attempt to remove a nonexistent `grozny-wilk` prerequisite from that quest;
- separately audit whether `wilcza-jama` should retain its `trusted + grozny-wilk` gates. It describes a less urgent predecessor-style den hunt and is not automatically equivalent to `wilki-pod-osada`; change it only if the authored/world logic review justifies it.

Do not change `QuestManager.meetsAvailability()` semantics globally. The problem is authored availability for specific quests, not the prerequisite engine.

There is currently no generic `world problem active` prerequisite type. `wilki-pod-osada` uses the real persistent wolf-den destruction objective, but its offer availability is authored, not dynamically gated by a separate attack-state flag. Do not invent a new problem-state framework for plan 014. Removing the nonsensical relation gate is the smallest coherent fix unless current code at implementation time already exposes an appropriate existing world-state availability seam.

## 9. Authored quest pass — concrete current issues

Use current `QUESTS` as source of truth. Preserve IDs, outcome IDs, rewards and consequences unless an actual contradiction requires a change.

High-value cases already verified:

- `relay-anna-piotr`: `talk_to_npc` currently makes Piotr react to a message the player never explicitly says. Add player message action.
- `shells-dla-kasi`, `woda-dla-marka`, `drewno-na-naprawe`, `ziola-dla-anny`, `kamienie-dla-piotra` and similar fetch/delivery quests: add explicit hand-in/report wording instead of giver resolution on interaction.
- `zwiadowca`: current `Zwiadowca mi trzeba` is unnatural; `Jeleń zauważony` is mechanical; the cave/stag/stones chain needs coherent scouting rationale rather than three game checks.
- `zagubiona-owca`: current progress tells the player to tell Anna where it was found, but no player report exists.
- `sprawdz-szlak`: use the plan's `Sprawdzenie jaskini` reference copy, bind one exact cave, and derive direction only from already-resolved coordinates.
- `lis-przy-osadzie`: ensure wording matches `kill_target_animal`; do not say merely `przegonić` if death is the only completion mechanic.
- `zaginiona-przesylka`: current offer literally says `Potem zdecyduj, komu ją oddać — mnie albo Markowi` without explaining why Marek is a meaningful alternative. Add both perspectives and explicit player choice lines; preserve `returned_sealed` / `turned_over_to_guard` and their existing rewards/consequences.
- `sporne-drewno`: Piotr's current `progressLine` gives his position, but the player does not consciously state the final choice. Add explicit final choice actions; preserve `support_anna` / `support_piotr` and follow-up prerequisite outcomes.
- `dzik-przy-szlaku`: Piotr conversation should be an actual player/NPC exchange before the hunt stage advances.
- landmark quests: replace mechanical discovery/report wording with observable facts and explicit report where appropriate.
- `mapa-do-skarbu`: verify the authored promise/rewarding text remains internally consistent; fix prose, not unrelated treasure mechanics.
- `wilki-pod-osada`: remove the current `trusted` gate; keep its existing world objective `destroy_spawn_point(WOLF_DEN_ID)` and social consequences unless another verified contradiction appears.

## 10. Gather-item turn-in caveat

Current `QuestStage.progressLine` documentation explicitly says `gather_item` is not reported like world interactions; it is cleared/reported in the giver conversation. Inspect `handleGiverInteract()` before changing this path so item consumption/availability semantics remain intact.

The new player action should represent the hand-in without creating a second inventory transaction or moving item/reward authority to UI. Reuse the current giver turn-in path after the player selects the authored line.

## 11. Persistence compatibility

No new persisted quest state is needed for the planned dialogue actions.

`QuestProgressEntry` already persists:

- `id`,
- `state`,
- `stageIndex`,
- terminal `resolvedOutcomeId`.

A save restored in `ready_to_report` should simply build the new report action from the current definition. Player-line text, target direction and callbacks are definition/runtime presentation data and must not enter `SaveData`.

Do not bump save schema for plan 014 unless implementation unexpectedly introduces persisted state; that would be a design smell and should trigger reconsideration first.

## 12. Markers / dirty-state implications

`QuestManager.dirty` is set by `setQuestState()` and is used to avoid recomputing markers when quest state did not change.

Opening a report/choice dialogue must no longer mutate quest state, so it should not dirty markers. The giver should remain `QUEST_MARKER_READY` and a `talk_to_npc`/choice target should remain `QUEST_MARKER_TALK_TARGET` until the player selects the action that actually advances/resolves the quest.

For exact cave objectives, update spawner-marker matching so unrelated caves are not marked. Do not introduce per-frame target resolution; marker reads should compare already-bound IDs.

## 13. Tests to update/add

### `src/quests/QuestManager.test.ts`

Add/adjust focused tests for:

- `ready_to_report` + giver interaction returns an action and does not resolve;
- selecting report action resolves once;
- invoking the same stale callback twice cannot duplicate reward/consequences;
- `talk_to_npc` interaction does not advance until player action selection;
- `talk_to_npc_choice` interaction with Kasia/Marek does not resolve until selection;
- closing/reopening without selection leaves state unchanged;
- exact `interact_spawner`: wrong cave ID does not advance, bound cave does;
- restored `ready_to_report` exposes the action and resolves normally;
- `wilki-pod-osada` is available without Anna `trusted` relation;
- existing outcome-dependent follow-ups (`drewno-dla-anny` / `drewno-dla-piotra`) remain gated by the selected `sporne-drewno` outcome.

Update tests that currently encode immediate `talk_to_npc_choice` / `talk_to_npc` resolution instead of adding parallel contradictory expectations.

### `src/quests/quests.test.ts`

Extend definition validation tests for the new authored player-line requirements and exact spawner objective shape. Preserve tests for outcome references and existing quest IDs.

### `src/ui-vue/npcDialogueOpen.test.ts`

Current test explicitly expects a quest target stage to advance when the menu opens. Replace that expectation with:

- menu opens directly on quest line;
- player action is present;
- opening alone leaves state unchanged;
- selecting action advances once.

If component-level tests for `NpcDialogueMenu.vue` already exist, cover action rendering/final response there. Do not introduce a heavy new UI test harness solely for this plan if current test style can verify the store/open seam sufficiently.

### Direction helper

Pure unit tests for eight sectors and boundary cases. Coordinate convention must be checked against existing world/map conventions before locking expected N/S signs; do not assume Three.js `+z` means north.

## 14. Suggested implementation order

1. Extend quest definition/player-line contracts and validator.
2. Add quest actions to `QuestDialogOverride`; change `QuestManager` report, `talk_to_npc`, and `talk_to_npc_choice` to defer mutation until action selection.
3. Extend existing NPC dialogue store/component rendering.
4. Thread `spawnerId` through `ObjectiveRef` / `resolveInteraction()` and exact matching/markers.
5. Bind exact cave targets once in `createApp.ts` composition using existing `Fauna.getSpawners()` / stable `PreySpawner.id`.
6. Derive optional eight-way direction text from the same already-resolved target coordinates.
7. Apply the authored content pass, starting with `sprawdz-szlak`, `zaginiona-przesylka`, `sporne-drewno`, `relay-anna-piotr`.
8. Remove the verified `trusted` availability gate from `wilki-pod-osada`; audit other authored gates without changing the prerequisite engine.
9. Update focused tests, then typecheck/build.
10. Update canonical quest state docs if they still describe immediate `talk_to_npc_choice` resolution after implementation.

## 15. Guardrails / avoid these traps

- No new dialogue tree engine, quest dialogue manager, quest modal or parallel store.
- No quest resolution in Vue.
- No duplicate reward/consequence path.
- No new persisted dialogue state.
- No hardcoded procedural cave coordinates.
- No new quest-only cave identity; reuse `PreySpawner.id`.
- No per-dialog/per-frame spatial search for location prose.
- No world-location/terrain lookup solely for a direction hint.
- No global change to availability semantics just to fix one authored gate.
- No assumption that `wilki-pod-osada` currently depends on `grozny-wilk`; current code shows it does not.
- No unrelated refactor of fauna, NPC decisions, generic `FlavorDialog`, or the whole NPC menu.
- Do not run browser verification; User does it.
- Do not run `pnpm docs:sync` manually.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
