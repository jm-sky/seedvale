# Implementation Notes: quests-progression-034

## Current ownership and reusable mechanisms

- `QuestManager` is the sole owner of `QuestProgressEntry`, stage/lifecycle transitions, offer admission, dialogue overrides and runtime `animalTargets` bindings.
- `QuestOfferPolicy` and `rankQuestOfferCandidates()` already exist from `quests-progression-033`; extend/reuse them rather than adding a scheduler or second priority system.
- `QuestDialogTopic` already carries a player-facing `QuestDef.title` and live `resolve()` callback. This is the preferred seam for disambiguating multiple quest contexts without leaking quest ids/objective types into Vue.
- `NpcDialogueMenu.vue` already renders `helpActions` and `helpTopics`, including drill-in/back behavior. Keep quest semantics in `QuestManager`.
- NPC label markers are pushed externally through `NpcAgent.setQuestMarker()`; `gameLoop.ts` refreshes them only while `QuestManager.isDirty()` is true.
- `kill_target_animal` is exact-instance. `bindAnimalTargetIfNeeded()` binds one `animalId`; `onInteractObjective({ type: 'animal_died', animalId })` must match that exact id before advancing.

## Active giver cap — implementation seam

Relevant code is in `src/quests/QuestManager.ts`, around `selectableOfferIds()` / `admitOffersForGiver()`.

Do not persist a counter. Compute capacity from `this.defs` + `stateOf(def.id)` each time offer candidates are selected/accepted.

Recommended helper shape conceptually:

```ts
private activeOrdinaryGiverQuestCount(npcId: NpcId): number
private bypassesActiveGiverCap(def: QuestDef): boolean
```

Count only defs where:

- `def.giver.npcId === npcId`,
- lifecycle is `active` or `ready_to_report`,
- quest does not use the explicit bypass policy.

`ready_to_report` should occupy the slot until terminal resolution. This prevents finishing objectives from immediately opening more ordinary work before the player reports back.

Apply the capacity gate at candidate exposure/admission and guard acceptance against stale UI callbacks. A menu opened while capacity was available must not be able to accept an ordinary third quest after another callback changed state.

Do **not** filter `onInteract()` contributions globally by giver capacity. Required dialogue/action contributions from defs whose giver is someone else must still be gathered.

## Important bypass

`QuestOfferPolicy` currently has ranking/exposure metadata from plan 033. Prefer mapping existing explicit urgency/story semantics onto cap bypass if unambiguous.

Important distinction:

- not every world-driven quest bypasses the cap,
- only explicitly important/urgent/story/narrative content should bypass it,
- `QuestManager` must not inspect wolves, settlement shortages, etc. to decide importance.

If `urgency: 'urgent'` is already semantically strong enough, use it for bypass. If that overload would make offer-ranking urgency and capacity semantics ambiguous, add one minimal optional field to `QuestOfferPolicy` (for example `activeCap?: 'normal' | 'bypass'`) and validate it in `quests.ts`. Do not create a parallel `QuestCapacityPolicy` unless code constraints force it.

## Marker semantics

Current `labelMarker()` reduces states roughly as required dialogue target > ready_to_report > exposed offer > active.

The Piotr stone case shows why state-only reduction is insufficient: `gather_item` can expose a live hand-in action while state remains `active`.

Before coding, identify the exact pure/read-only predicates currently used by `onInteract()` to decide whether these contributions are actionable:

- gather hand-in,
- report,
- `talk_to_npc`,
- `talk_to_npc_choice`,
- stage `dialogueActions`.

Extract/reuse the smallest read-only helpers needed by `labelMarker()`. Do not call `onInteract()` from `labelMarker()` because `onInteract()` may admit offers/mutate state.

Desired marker reduction:

1. required talk/action target → `?`,
2. giver has a completion/hand-in/report action available now → `✓`,
3. exposed new offer → `!`,
4. ordinary active context/reminder → `…`,
5. none → `null`.

Keep the existing glyph constants.

When marker inputs can change because inventory/world state changed without a quest lifecycle transition, verify how `dirty` gets set. If the gather hand-in predicate depends on inventory count and no quest mutation occurs, marker refresh may require a narrow invalidation hook rather than per-frame recomputation. Reuse existing inventory/quest polling triggers where possible; do not discard the dirty optimization globally.

## Multi-quest abandon presentation

`QUEST_ABANDON_PLAYER_LINE` is intentionally generic, but flattening one identical action per active quest is ambiguous.

Preferred fix:

- each active quest remains a distinct `QuestDialogTopic` labelled with `QuestDef.title`,
- drilling into that topic exposes its generic abandon action,
- actionable speech that must remain immediately visible (report/required talk/etc.) should not be unnecessarily hidden just to solve abandon UX.

If the current aggregator deliberately flattens all explicit actions, special-case presentation metadata at the quest layer rather than appending quest ids in Vue. An alternative acceptable quest-owned solution is a label such as `Nie dam rady pomóc z: ${def.title}`, but topic-based context is preferable because the infrastructure already exists.

Update `QuestManager.test.ts` to ensure two/three active abandonable quests cannot produce indistinguishable top-level choices.

## `kill_target_animal` / fox recon

Trace these concrete symbols/call sites:

- `QuestManager.bindAnimalTargetIfNeeded()`
- `QuestManager.onInteractObjective()`
- `objectiveMatchesRef()` `animal_died` branch
- `QuestManager.advanceStage()`
- `QuestManager.clearAnimalTargetsForQuest()`
- `createApp.ts` injected `resolveAnimalTarget`
- `createApp.ts` fauna `onAnimalDeathTarget` callback
- every fauna/player/NPC combat path that ultimately invokes that callback
- `lis-przy-osadzie` definition in `src/quests/quests.ts`

Known contract: exact animal id is required. Do not make another fox satisfy the quest.

The observed long-distance/special label suggests the dead fox may be the bound target, but confirm code rather than assuming label semantics. Inspect how target highlighting/labeling is derived and whether a corpse can retain the visual cue after the quest binding has been lost or advanced.

Tests should capture:

- resolver binds fox A,
- fox B death does nothing,
- fox A death advances the stage to `ready_to_report`,
- giver `labelMarker()` becomes `✓` unless a higher-priority required action exists,
- giver dialogue exposes report/completion,
- callback remains exact-once if duplicate death notification is attempted.

If unit tests already pass but browser reproduction fails, the likely defect is an ingress path that does not call `onAnimalDeathTarget` for one death mode or a runtime binding lifecycle issue. Fix the shared ingress/binding path, not `lis-przy-osadzie` specifically.

## Files to inspect/change

Primary:

- `src/quests/QuestManager.ts`
- `src/quests/quests.ts`
- `src/quests/QuestManager.test.ts`
- `src/ui-vue/NpcDialogueMenu.vue`
- `src/app/createApp.ts`

Likely integration/tests only as needed:

- `src/app/gameLoop.ts`
- fauna death/combat dispatch files discovered from `onAnimalDeathTarget`
- `src/ui-vue/store.ts`
- tests around dialogue UI/store if existing coverage requires them

## Guardrails

- No persistent active-slot state.
- No global player quest cap.
- No blocking foreign-quest target interactions.
- No per-quest-id fox workaround.
- No species-wide replacement for exact target identity.
- No quest semantics in Vue.
- Preserve `QuestManager.isDirty()` performance strategy; add precise invalidation if live hand-in eligibility needs it.
- Preserve plan-028 multi-quest world-event fan-out.

## Suggested implementation order

1. Add pure/derived giver-cap helpers + tests.
2. Apply gate to offer selection and stale acceptance callback.
3. Wire explicit bypass policy + tests.
4. Extract actionable-now predicates and correct marker priority + dirty invalidation tests.
5. Fix abandon presentation using existing topics.
6. Reproduce and fix exact animal-death lifecycle.
7. Run quest/UI unit tests, typecheck/lint/build per repo instructions.

Browser verification belongs to the User.

## What was actually implemented

- Derived ordinary giver cap of 2 (`active` + `ready_to_report`); `urgency: 'urgent'` and `exposure: 'story'` bypass it. No new `QuestOfferPolicy` field.
- `labelMarker` uses the same gather-hand-in predicate as dialogue; `QuestManager.notifyInventoryChanged()` is the narrow dirty hook (`createApp` `onInventoryChanged`).
- Abandon actions are `topicScoped`; Vue still only renders label/callback.
- `animal_died` binds an unbound matching-kind slot to the dying id instead of calling `resolveAnimalTarget` (which skips corpses). Exact identity is unchanged.

> **Zrób git commit i push do main, rebase jeżeli trzeba**