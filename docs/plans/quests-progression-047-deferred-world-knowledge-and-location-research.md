# Plan: Deferred world knowledge and location research

**Created:** 2026-09-15
**Status:** `planned` 📋
**Priority:** high · **Effort:** L
**Model:** Opus, Sonnet
**Depends on:** ~~world-028~~
**Domain:** `quests-progression`
**Type:** `feature`
**Subdomains:** `quests` `progression`
**Tags:** `world-knowledge` `landmarks` `dialogue` `lazy-binding` `world-time`
**Roadmap:** -

## Problem

Quest definitions that need a procedural world place currently bind that place eagerly before `QuestManager` construction. `buildLandmarkQuests()` is the clearest example: `createApp` performs bounded `ChunkManager.findLandmarkNear()` searches during app/world setup and passes concrete `landmarkId`s into `QuestDef`.

That architecture has two drawbacks:

1. world lookup work happens even when the Player never asks the relevant NPC about the place;
2. the quest cannot naturally model an NPC who **does not yet know the exact place**, but can research it and later give the Player a useful geographic clue.

`world-028` removed the catastrophic full-chunk fallback for `monolith`, `stoneCircle` and `smallRuins`, so this plan is **not** a replacement performance fix. It establishes a reusable quest/world-knowledge mechanism and removes unnecessary eager binding where narrative state does not require it yet.

The target gameplay flow is:

```text
NPC has a lead/problem
→ Player accepts / asks about it
→ NPC says they need to check notes / ask around / reconstruct the route
→ world lookup starts lazily and does not block the dialogue
→ world time passes
→ NPC has the result
→ next conversation gives a concrete geographic clue
→ quest objective uses the exact resolved world identity
```

The research delay is a story/world-time rule, not a loading spinner. A lookup completing immediately must not make an authored one-hour research delay disappear.

## Goal

Add one generic, reusable mechanism for **deferred static-world knowledge** that future quests can opt into without inventing bespoke timers, Promise state, pre-quest systems or mutable quest definitions.

The mechanism must:

- preserve `QuestManager` ownership of quest progress;
- keep terrain/place resolution in the world layer through an injected seam;
- persist meaningful research/binding progress across save/load;
- allow authored world-time delays;
- return a real stable world identity, never an approximate quest-only coordinate;
- let dialogue describe where the Player should go;
- support immediate-binding quests unchanged;
- avoid blocking NPC dialogue while world resolution runs;
- be discoverable and straightforward for later AI implementation sessions.

## Architectural decision

Do **not** solve this by:

- mutating a `QuestDef` after `QuestManager` construction;
- creating a second "pre-quest" lifecycle outside `QuestManager`;
- storing an unresolved Promise in quest state;
- making UI/dialogue code understand landmark lookup;
- delaying every location quest whether or not the NPC should already know the location;
- moving generic quest logic into `ChunkManager`;
- duplicating world-place coordinates as a new authoritative quest world state.

Introduce a small **deferred world-knowledge binding** concept owned by quest progress.

Conceptually:

```ts
QuestDef
  └─ optional knowledge definitions / references

QuestProgressEntry
  └─ persisted knowledge progress
       requestedAtDays
       revealAtDays
       resolution state
       resolved stable world ref, when available

QuestManager
  ├─ starts requests from authored quest actions/effects
  ├─ gates "come back later" vs "I found it" dialogue by world time
  ├─ persists the selected stable ref
  └─ matches later objectives against that ref

World layer
  └─ injected async resolver
       questId + knowledgeId
       → stable world ref or unavailable
```

Exact type names may adapt to current code, but ownership must remain as above.

## 1. Generic knowledge lifecycle

Support at least these logical states per knowledge slot:

```text
unrequested
→ requested
→ resolved
or unavailable
```

`resolving` may exist as runtime-only state, but must not be the only representation of a request because save/load can happen while work is in flight.

Persist enough information to preserve gameplay semantics:

- request/start world time;
- authored earliest reveal time (`revealAtDays` or equivalent);
- resolved stable world ref when one was selected;
- terminal `unavailable` when bounded deterministic lookup proves no target exists.

Do not persist Promises or worker/task handles.

On restore:

- `requested` without a result must restart resolution safely;
- `resolved` must keep the same bound identity;
- elapsed world time may make the information immediately tellable after load;
- no duplicate stage effects or duplicate journal entries may occur.

## 2. Static world-ref scope

V1 is for static/deterministic world knowledge, especially places.

At minimum support a landmark ref carrying the authoritative stable landmark id and enough kind metadata to validate/present it.

The quest-layer ref is **knowledge about** a world object, not ownership of the object. The world remains authoritative for placement/existence.

Do not generalize V1 to dynamic fauna/NPC targets; those already have separate binding/lifecycle semantics.

Design the public types so later extensions to settlement/cave/location refs are possible without replacing the mechanism.

## 3. Async injected resolver

Add a narrow injected resolver seam; `QuestManager` must not import `ChunkManager` or terrain generation.

Conceptually:

```ts
resolveQuestWorldKnowledge(questId, knowledgeId)
  → Promise<ResolvedQuestWorldKnowledge | null>
```

The contract is asynchronous even when the current classic-landmark resolver is cheap after `world-028`.

Requirements:

- starting research returns dialogue immediately;
- resolution completion dirties quest presentation/state but does not auto-skip authored world-time delay;
- failures are contained and become retryable or `unavailable` according to an explicit policy, never an unhandled rejection;
- reset/new game cannot let an old in-flight request write into the new quest state;
- same-session world rebuild must use the current world/bundle, not a stale captured `ChunkManager`;
- do not introduce a Worker mechanically. If current resolution is cheap, a Promise-based injected seam is enough; expensive future resolvers can implement slicing/worker behavior behind the same contract.

## 4. Research delay is world simulation time

Reuse `QuestWorldTimeLookup.getElapsedDays()`.

Authoring expresses a duration in world time (for example 1 hour = `1 / 24` day). Do not add a real-time timer manager.

The two independent conditions are:

```text
world binding resolved
AND
current world time >= revealAtDays
```

Only when both are true can the NPC give the concrete clue.

Examples of authored fiction:

- "Muszę zajrzeć do starych papierów. Wróć za godzinę."
- "Popytam ludzi, którzy pamiętają tamtą drogę. Daj mi trochę czasu."
- "Muszę odtworzyć trasę z notatek zwiadowcy."

The exact delay belongs to quest content, not resolver speed.

## 5. Quest flow primitives

Extend existing quest primitives rather than creating a parallel dialogue state machine.

Preferred shape:

- reuse `QuestStageEffect` for the one-shot action that starts a knowledge request, or add the smallest sibling effect/accept-effect seam if current acceptance flow cannot apply an effect exactly once;
- add one explicit quest objective/stage primitive for returning to the relevant NPC to receive resolved knowledge after the delay;
- add one explicit way for a later world objective to refer to the resolved knowledge slot instead of requiring a concrete `landmarkId` at definition construction.

Example conceptual flow:

```text
accept quest
  → request knowledge slot "target"

stage 0: receive_knowledge(target, giver)
  before ready: informational "still looking" dialogue
  after resolved + revealAt: conscious player dialogue action
  → NPC gives geographic clue
  → advance

stage 1: interact_bound_landmark(target)
  → matches the landmark id persisted in knowledge slot "target"
```

Do not overload `interact_landmark` with magic placeholder strings. Prefer a typed distinction between a concrete landmark target and a knowledge-bound target.

## 6. Dialogue and geographic clue presentation

The purpose of this mechanism is not merely to postpone a lookup. The NPC must eventually tell the Player **where to go**.

Reuse existing direction/location presentation helpers where practical, especially `cardinalDirectionPhrase` and existing cave/location description patterns.

Provide a narrow world/presentation seam that can describe a resolved world ref relative to a meaningful origin (normally giver settlement / quest settlement), e.g. conceptually:

```text
"ruiny na północny zachód od Lipowa"
"monolit na wschód od osady, za wzgórzami"
```

V1 does not need procedural prose generation. Deterministic authored template + direction/distance/location phrase is sufficient.

Do not persist a rendered Polish sentence as authoritative state if it can be reproduced from stable world identity plus current deterministic presentation data.

Do not reveal the exact hidden-item coordinate when the quest fiction only warrants an area/place clue.

## 7. Journal and quest-log behavior

Reuse the existing journal event mechanism.

The first NPC line ("wróć później") and the later concrete clue are meaningful heard information and should be represented coherently in quest history without duplicate stamps after reload/repeated conversation.

`QuestManager.list()` remains the only player-facing quest DTO. Vue must not interpret knowledge slot internals.

While research is pending, the quest log should describe the current action in world terms, for example:

```text
Wróć do Anny, gdy sprawdzi stare zapiski.
```

After the clue is received, it should describe the actual destination rather than an unresolved placeholder.

## 8. Persistence

Extend `QuestProgressEntry` rather than adding a separate save registry.

Update:

- runtime normalization/copying in `QuestManager`;
- `src/persistence/saveData.ts` validation/defaulting;
- save serialization path if required by the current generic quest-progress save;
- reset/new-game behavior.

Older saves with no knowledge field must remain valid and behave as `unrequested` unless the migrated quest is already past the new research stage; see migration rules below.

Do not bump save schema unless the repository's existing optional-field compatibility rules require it; verify against current `SaveData` implementation rather than assuming.

## 9. Migration / compatibility for existing quests

This plan changes quest flow for already-existing quest ids. Existing saves must not become impossible.

For each migrated quest define deterministic compatibility behavior:

- `not_offered` / `offered`: start using the new research flow normally;
- `active` at the old landmark objective: preserve or reconstruct the old concrete binding and place the quest directly after the research stage;
- `ready_to_report` / terminal: leave unchanged;
- older journal history must not be rewritten or duplicated.

Use current quest id + stage state; do not create replacement quest ids solely to avoid migration.

## 10. Pilot migrations

Use this plan to establish precedent in several real quests, not only tests.

### A. `slad-przy-monolicie`

Current state: `buildLandmarkQuests()` eagerly resolves `monolith` during app setup.

New narrative:

- Anna knows the missing person was last seen near an old monolith, but does not have the exact route at hand;
- accepting/asking starts the knowledge request;
- she asks for a short authored research delay (about one world hour);
- on return she gives the monolith's direction/location clue;
- only then does the active world objective become investigate that exact monolith.

This demonstrates authored static quest + classic procedural landmark.

### B. generated RPG `old-place-secret`

Current state: candidate collection is already bound to `opportunity.sourceId` before materialization.

Adapt the matrix so the NPC can expose the **lead** without eagerly requiring the final player-facing place knowledge. Reuse the same deferred knowledge lifecycle rather than adding matrix-specific pending state.

The generated quest id/source identity must remain stable across save/load.

This demonstrates generated/world-driven quest materialization using the same mechanism.

### C. Lost Treasure Chronicles chronicle-search ruins

The archaeologist already has an investigation/papers premise. Move the expedition-ruins clue onto the generic research mechanism where compatible with current chapter semantics:

- archaeologist can explain the hypothesis immediately;
- exact ruins identity/direction is researched lazily;
- after the authored delay he gives a bounded, concrete clue to the real ruins;
- deterministic grave-vs-ruins truth and physical chronicle/evidence placement must not reroll or depend on visit order.

Do not redesign the whole chapter. Preserve the deterministic world truth and existing cemetery branch.

This demonstrates a story quest using the same generic mechanism.

### Explicit immediate controls

Do **not** automatically migrate every landmark quest.

Keep immediate binding/knowledge where the fiction says the NPC plainly knows the place, unless recon during implementation proves otherwise. In particular, local cemetery/visible landmark cases can remain immediate.

The architecture must make `immediate` and `researched` knowledge both first-class choices.

## 11. Eager world setup cleanup

After pilot migration, remove only the eager landmark lookups that are no longer needed for those quests.

Do not remove lookup needed by:

- systemic treasure-site generation;
- key-host placement;
- other immediate landmark quests;
- deterministic story truth that must exist independently of player conversation.

Measure responsibility by call-site, not by deleting `findLandmarkNear()` usage wholesale.

## 12. Validation and authoring guardrails

Extend `validateQuestDefinitions()` so invalid deferred-knowledge definitions fail early.

Validate at least:

- knowledge ids unique within a quest;
- referenced knowledge id exists;
- world-bound objective expects compatible ref kind;
- research duration is finite and non-negative;
- receive-knowledge stage has a valid NPC target;
- no stage can consume an unresolved binding without the declared flow allowing it.

Add concise JSDoc to the important public types/functions and `@domain quests-progression` where useful for AI preflight discovery.

## 13. Tests

Add tests for architecture contracts, not wall-clock timings.

### QuestManager / generic lifecycle

1. accepting/requesting starts one knowledge request exactly once;
2. repeated NPC interaction while pending does not start duplicates;
3. resolver may finish before `revealAtDays`, but clue stays unavailable until world time passes;
4. world time may pass before resolver finishes, but clue stays unavailable until resolution finishes;
5. resolved + delay elapsed enables the conscious receive-knowledge dialogue action;
6. selecting it advances exactly once;
7. later bound-landmark objective matches only the resolved landmark id;
8. unavailable result follows explicit authored fallback and never leaves a permanently broken objective;
9. reset/new game ignores stale async completion;
10. save/load of requested unresolved research restarts safely;
11. save/load of resolved research preserves target identity and does not re-roll;
12. journal entries are not duplicated.

### Persistence

13. older quest progress without knowledge fields validates and restores;
14. malformed knowledge entries are rejected/defaulted according to current save policy;
15. quest progress JSON round-trip preserves requested/resolved state.

### Pilot quests

16. `slad-przy-monolicie` does not need eager monolith binding at app setup and eventually targets the resolved monolith;
17. `old-place-secret` uses the generic lifecycle and keeps stable generated quest identity;
18. chronicle-search ruins research preserves deterministic chapter truth;
19. existing active saves for migrated quest ids are normalized into a reachable stage;
20. immediate landmark quests remain unchanged.

## 14. Performance / responsiveness verification

Automated tests must not use wall-clock thresholds.

Manual verification by User:

1. new game;
2. confirm migrated quests no longer resolve their destination before first relevant conversation;
3. accept `slad-przy-monolicie`;
4. NPC gives the research line immediately, without a visible freeze;
5. return before the authored hour: NPC still says research is in progress;
6. advance world time past the delay;
7. return: NPC gives a concrete directional clue;
8. visit only the indicated monolith and confirm objective completion;
9. save while research is pending, reload, advance time and confirm continuation;
10. repeat equivalent checks for generated `old-place-secret` and chronicle-search ruins;
11. confirm immediate location quests still provide their location normally.

Browser verification is User-owned; AI implementation agent must not perform it.

## Relevant systems

Expected implementation/recon areas:

```text
src/quests/quests.ts
src/quests/QuestManager.ts
src/quests/QuestManager.test.ts
src/quests/quests.test.ts
src/quests/opportunities/rpgQuestMatrices.ts
src/quests/opportunities/rpgQuestMaterialization.ts
src/quests/lostTreasureChronicleSearch.ts
src/quests/lostTreasureChronicleSearchRuntime.ts
src/app/createApp.ts
src/app/worldBundle.ts
src/persistence/saveData.ts
src/quests/cardinalDirection.ts
src/quests/caveLocationDescription.ts
```

Exact call-sites must follow current code and implementation notes.

## Non-goals

- LLM-generated dialogue;
- generic NPC memory system;
- dynamic fauna/NPC target research;
- replacing `QuestManager`;
- replacing `LocationKnowledge`;
- making every quest delayed;
- changing landmark generation/rates;
- changing `world-028` placement semantics;
- workerizing all quest/world lookup;
- redesigning Lost Treasure Chronicles beyond the pilot integration;
- UI-specific knowledge-state logic.

## Acceptance criteria

- Deferred world knowledge is a generic documented quest primitive, not a one-off Lost Treasure implementation.
- `QuestManager` owns persisted knowledge progress; world layer owns place lookup.
- NPC dialogue can start research and immediately return without waiting on lookup.
- Authored world-time delay is independent of resolver completion time.
- After research the NPC provides a deterministic useful location clue.
- The later world objective targets the exact stable resolved landmark identity.
- Save/load/new game/rebuild do not duplicate, reroll or leak async results.
- At least `slad-przy-monolicie`, generated `old-place-secret`, and chronicle-search ruins use the generic mechanism.
- Immediate-known-place quests remain supported without artificial delay.
- Eager setup lookup is removed only where migrated quests no longer need it.
- Automated tests/typecheck/lint/build pass.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
