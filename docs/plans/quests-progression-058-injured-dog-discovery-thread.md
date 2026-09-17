# Plan: Injured dog discovery thread

**Created:** 2026-09-17
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** quests-progression-057, ~~items-player-046~~, ~~fauna-011~~
**Domain:** `quests-progression`
**Subdomains:** `quests` `relationships`
**Tags:** `medicine` `dog` `discovery` `world-action`
**Roadmap:** -
**Model:** Sonnet, Composer

## Goal

Add a small discovery encounter in which an injured household dog is present in a settlement without a quest marker or explicit request for help.

The Player may notice the dog, use the ordinary Medicine targeted action, and heal it. After successful treatment the dog returns to its owner. Only then does talking to the owner reveal that the injury is connected to something the dog discovered elsewhere.

This plan intentionally implements only the opening beat and a durable hook for a later quest. It does not define the eventual mystery/adventure beyond that point.

Desired flow:

```text
injured dog exists in world
→ no ? / no explicit quest
→ Player notices and treats dog
→ dog recovers and returns to owner
→ owner reacts to what actually happened
→ owner reveals that the dog found something
→ future story hook becomes available
```

## Player-facing behaviour

### Before treatment

A deterministic household-owned dog in an eligible settlement starts in a meaningful injured state.

The dog:

- is alive;
- is visibly/inspectably injured through existing health/injury presentation;
- does not expose a quest marker;
- has no special `[E] Start quest` interaction;
- remains treatable through the existing Medicine targeted action;
- stays in a plausible local injured/resting position instead of behaving as a fully healthy roaming/guard dog.

The owner behaves normally and does not have a `?` caused by this encounter.

Talking to the owner before treatment may use ordinary dialogue, but must not reveal the authored follow-up premise early.

### Treatment

The Player treats the exact dog through normal Medicine targeting and Busy Action.

Reuse the successful-animal-treatment quest/world-action seam introduced by `quests-progression-057`. Do not add a dog-specific healing callback.

Only a completed treatment with real positive effect counts.

### Return to owner

After treatment, the same dog transitions back into ordinary household behaviour and physically returns toward its owner/household anchor using existing fauna movement/ownership mechanisms where practical.

Do not teleport it directly to the owner unless current livestock recovery/navigation architecture leaves no coherent movement path. Prefer a small explicit post-treatment return intent/state over quest code moving the mesh every frame.

Once return is complete (or reaches a sensible bounded proximity to the owning household/owner), the encounter is considered ready for the owner reaction.

### Owner reaction

The owner still does not need a `?` marker.

When the Player next talks to the owner after the dog has been healed/returned, expose an authored dialogue topic/reaction such as:

> To ty go opatrzyłeś? Wrócił stamtąd ledwo żywy. Zawsze chodził w jedno miejsce... chyba coś znalazł.

Exact prose can be polished during implementation, but the owner must speak from known facts:

- the dog was injured;
- the Player treated it;
- the dog has returned;
- the dog had been going to / returned from some place worth investigating.

The conversation records/produces a durable quest-facing outcome/hook that a later plan can use as a prerequisite.

Do not implement the later location, missing person, bandits, cave, hunter or treasure story in this plan.

## Critical injury-lifecycle requirement

The authored injured dog must not silently resolve the encounter before the Player can act.

For this encounter only, its initial injury must be stable enough that:

- normal passive/natural recovery does not heal it away before interaction;
- the injury itself does not continue dealing damage or cause death merely because time passes;
- ordinary external damage can still kill the dog;
- successful Medicine treatment still uses the real shared injury resolver and removes/restores the real injury normally.

Do not globally disable natural injury recovery for all animals.

Prefer a narrow authored/stable-injury policy attached to the encounter-bound animal state or recovery metadata over periodically reapplying damage/injury from quest code.

If current `AnimalSaveState` cannot distinguish this bounded authored recovery policy, add the smallest persisted/reconstructable state necessary. Do not create a second dog health model.

## Recon / mechanisms to reuse

### Dogs are ordinary household livestock

`dog` is an existing `LivestockKind` in `src/settlement/livestock.ts` and uses the same `AnimalAgent` class, ownership, save record and deterministic `animalId` model as other domestic animals.

Reuse that. Do not create `DogQuestAgent` or a bespoke dog registry.

### Livestock identity survives reload

`LivestockSaveRecord` stores `animalId`, settlement identity, owner and `AnimalSaveState`; deterministic household slots make livestock identity trustworthy after reload.

Bind the encounter to the exact dog `animalId`.

### Medicine already supports household-owned dogs

`src/player/medicalTreatment.ts` accepts owned domestic `AnimalAgent`s by ownership, not a cow/horse species allowlist. The dog therefore already fits the Medicine target contract.

### Plan 057 provides the shared treatment observation seam

Use the same narrow successful treatment report/objective/event. The dog plan must not introduce another Medicine-to-quest bridge.

### Existing fauna ownership / return behaviour

Dog household ownership, home anchoring and normal domestic movement remain fauna-owned. The encounter may add a temporary reason/intent to remain resting while injured and return home when recovered, but quest code must not become a second movement controller.

## Encounter selection and binding

Use a deterministic binding for one suitable dog in one eligible settlement.

V1 should prefer a nearby normal settlement with an existing household dog and owner NPC. Do not spawn a duplicate dog just to satisfy the encounter if none exists.

If no eligible dog exists for the current seed/world, the encounter simply does not materialize unless current authored-quest conventions already support deterministic augmentation of household livestock without identity conflicts. Do not force it through a detached quest-only animal.

The binding should include at least:

- settlement id;
- household id;
- owner NPC id;
- dog `animalId`.

Keep runtime agents out of persisted quest/encounter data.

## State / persistence

The implementation must survive save/load at these points:

1. dog is still injured and untreated;
2. Medicine treatment completed but dog has not yet returned;
3. dog returned but Player has not talked to owner;
4. owner revealed the discovery hook;
5. later reload after the hook — no repeated first-time reward/state mutation.

Prefer deriving as much as possible from authoritative dog state plus a compact encounter phase rather than duplicating health/position data.

A minimal phase may be needed to distinguish:

```text
injured
→ treated_returning
→ returned_waiting_for_owner_dialogue
→ discovery_revealed
```

If an existing quest/world-driven opportunity lifecycle can represent these states cleanly without showing a Quest Log entry or `?`, reuse it. Otherwise add a narrowly-scoped persisted encounter state; do not overload ordinary active quest state if that would incorrectly expose this as a conventional accepted quest.

The plan's implementation notes must resolve this ownership decision after inspecting the current `quests-progression-016` opportunity persistence and quest UI exposure paths.

## Future hook contract

After owner dialogue, expose one durable prerequisite that a later plan can consume.

Preferred semantics:

```text
dog discovery revealed
→ future authored quest becomes eligible
```

Reuse existing quest outcome/prerequisite machinery if it can represent this without pretending the Player completed a visible quest. If not, define one narrow story-fact/outcome adapter owned by quests-progression; do not build a generic global flag system in this plan.

The future hook must be stable across save/load and idempotent.

## Social consequences

Keep this opening small:

- modest positive relation with the dog owner after acknowledging the rescue;
- optional small benevolence/trust consequence using existing quest/social mechanisms;
- no large coin reward required;
- no new morality system.

The story opening itself is the main reward.

## Tests

Add focused coverage for:

1. encounter selects a real household-owned dog and stable owner/binding;
2. no eligible dog → no duplicate/synthetic detached dog;
3. untreated dog does not create a `?` quest marker for the owner;
4. untreated encounter dog does not naturally heal away over elapsed time;
5. untreated encounter dog does not die from passive injury progression alone;
6. ordinary external damage can still kill it;
7. treating another animal does not advance the encounter;
8. cancelled/zero-effect treatment does not advance it;
9. successful Medicine treatment of the exact dog advances once;
10. treated dog enters return behaviour instead of remaining permanently in the injured-rest state;
11. return completion enables owner reaction;
12. owner reaction is unavailable before treatment/return;
13. first owner reaction produces the future discovery hook exactly once;
14. save/load works in every listed phase;
15. reload does not reapply the initial injury after successful treatment;
16. no duplicate relation/reputation consequence on repeat dialogue;
17. existing dog guard/household behaviour resumes after the encounter-specific return state clears.

## Non-goals

- No full follow-up adventure in this plan.
- No authored destination/location for what the dog discovered yet.
- No missing-person, bandit, cave, treasure or hunter content yet.
- No visible initial quest marker.
- No quest-only dog class or duplicate animal health state.
- No global change to injury recovery for all fauna.
- No broad generic event bus or generic story-flag framework.
- No wild-animal Medicine expansion.
- No browser verification by AI.

## Relevant files

- `src/settlement/livestock.ts`
- `src/fauna/AnimalAgent.ts`
- dog household/guard behaviour modules used by current `AnimalAgent`
- `src/player/medicalTreatment.ts`
- `src/app/actions/medicalTreatmentActions.ts`
- treatment quest hook from `quests-progression-057`
- `src/quests/quests.ts`
- `src/quests/QuestManager.ts`
- world-driven opportunity/materialization/persistence files from `quests-progression-016`
- NPC dialogue integration in `src/app/createApp.ts` and current quest dialogue helpers
- persistence types only if a compact encounter phase cannot be represented by existing quest/opportunity state

Add JSDoc with the appropriate `@domain` tag for any new public encounter-state or quest-facing treatment helper.

## Verification

Automated:

- encounter binding tests;
- stable-injury/recovery tests;
- Medicine treatment integration test;
- dog return-state tests;
- owner dialogue/future-hook tests;
- save/load phase tests;
- typecheck / normal repository test gate.

Manual browser verification by User:

1. Enter the selected settlement and find the injured dog without an owner `?` marker.
2. Wait long enough to confirm it neither passively recovers nor dies from the authored wound.
3. Use Medicine on the dog and confirm the normal treatment Busy Action/material rules are used.
4. Watch the dog leave its injured/resting state and return toward its household/owner.
5. Talk to the owner before and after return; only the post-return conversation should reveal the new story thread.
6. Save/load before treatment, while returning and after owner dialogue; confirm no reset, duplicate injury or duplicate reaction.

> **Zrób git commit i push do main, rebase jeżeli trzeba**