# Plan: Deferred world knowledge and location research

**Created:** 2026-09-15
**Status:** `planned` 📋
**Priority:** high · **Effort:** L
**Model:** Opus, Sonnet
**Depends on:** ~~world-028~~, ~~world-022~~
**Domain:** `quests-progression`
**Type:** `feature`
**Subdomains:** `quests` `progression`
**Tags:** `world-knowledge` `landmarks` `dialogue` `lazy-binding` `world-time` `worker`
**Roadmap:** -

## Problem

Seedvale already has several systems that need knowledge about places before they can tell the Player where to go:

- authored landmark quests (`buildLandmarkQuests()`),
- generated RPG quests such as `old-place-secret`,
- Lost Treasure Chronicles,
- the home guard dialogue topic **„Opowiedz mi coś o okolicy”** from `world-012`.

Today these flows usually resolve their world locations eagerly or synchronously before the Player actually asks for the information. Even after `world-028` made classic landmark lookup much cheaper, this has two architectural problems:

1. world knowledge is computed before any NPC/player interaction requires it;
2. dialogue cannot naturally represent an NPC who has a lead but needs time to check notes, reports, maps or local knowledge before giving a concrete direction.

The desired gameplay flow is:

```text
NPC has a lead / Player asks for local knowledge
→ NPC starts research
→ world lookup is dispatched lazily to background worker work
→ dialogue returns immediately
→ authored world-time delay runs independently
→ background result becomes stable world knowledge
→ later dialogue gives a concrete direction/location clue
→ quest/objective uses the exact resolved world identity
```

The wait is part of world fiction, not a loading spinner. Resolver speed and authored research time are independent.

## Goal

Create one reusable architecture for **deferred static-world knowledge research** that can be used by quests and ordinary NPC dialogue without bespoke Promise state, timers or duplicated location lookup logic.

The mechanism must:

- keep physical world truth owned by world/terrain systems;
- run lookup work off the main thread through the existing worker infrastructure;
- expose one shared world-level research service rather than a quest-specific worker;
- let `QuestManager` persist quest-specific knowledge progress without importing terrain systems;
- let non-quest dialogue such as the guard's local-knowledge topic use the same service;
- preserve deterministic/stable world identities;
- support authored world-time research delays;
- produce useful player-facing geographic clues;
- survive save/load, New Game and same-session world rebuilds;
- keep immediate knowledge as a valid first-class path where an NPC logically already knows the place.

## Architectural decision

Introduce a world-owned **WorldKnowledgeResearchService** (exact name may adapt) with a narrow async contract.

Conceptually:

```text
WorldKnowledgeResearchService
  ├─ receives deterministic data-only research queries
  ├─ deduplicates in-flight equivalent requests
  ├─ dispatches worker-safe lookup jobs
  ├─ returns stable world refs / unavailable
  └─ does not know quests, dialogue or UI

QuestManager
  ├─ owns persisted quest knowledge progress
  ├─ requests research through injected service adapter
  ├─ gates clue reveal by world time
  └─ matches knowledge-bound objectives against stable refs

Guard/local dialogue
  ├─ requests local world knowledge through same service
  └─ owns only dialogue-specific pending/reveal state where needed
```

Do not solve this by:

- mutating `QuestDef` after construction;
- adding a quest-only Worker;
- calling synchronous heavy lookup inside `Promise.resolve()` / microtasks;
- making Vue/UI understand world research states;
- storing worker handles or Promises in SaveData;
- introducing a second authoritative location registry;
- forcing every location quest to wait.

## 1. Worker-backed world research service

Reuse the existing persistent terrain worker pool / `chunkHeightmap.worker.ts` infrastructure rather than spawning one Worker per conversation.

Add a dedicated low-priority worker job kind for bounded static-world research.

The worker job must be data-only and deterministic. It must not receive `ChunkManager`, Three.js objects, closures or UI state.

V1 query scope must support at least:

```text
nearest landmark of requested kind(s)
from origin x/z
within bounded chunk radius
using current deterministic terrain/worldgen inputs
```

The result must carry a stable world ref with enough data for later matching/presentation, conceptually:

```ts
type WorldKnowledgeRef =
  | {
      type: 'landmark'
      id: string
      kind: LandmarkKind
      x: number
      z: number
    }
```

Coordinates are result/presentation data; stable id remains authoritative identity.

### Worker priority

World-knowledge research is background work.

It must not starve:

1. terrain tile generation,
2. chunk mesh generation,
3. player-critical streaming.

Extend the current worker-pool priority queues deliberately. Knowledge jobs should run below tile/mesh jobs. Compare priority with grass based on actual cost; preserve at least one worker capacity for player-critical terrain work.

Do not create unbounded parallel research scans.

### Determinism/parity

Worker lookup must reuse the same worker-safe placement primitives as streamed world generation (`resolveClassicLandmarkPlacement` after `world-028`, cemetery resolver where applicable, authored ruins resolver where applicable).

Do not duplicate landmark placement algorithms.

Same seed/config/origin/query must resolve the same stable target regardless of:

- main-thread vs worker execution,
- request order,
- reload,
- conversation order.

## 2. Shared research lifecycle

The service should expose request lifecycle semantics independent of quests:

```text
idle
→ in flight
→ resolved(ref)
OR unavailable
OR failed/retryable
```

Equivalent concurrent requests should be deduplicated by a deterministic key containing all inputs that affect the result (seed/fingerprint/query/origin/radius etc.).

Runtime in-flight state is not persisted globally.

Cancellation/stale completion must be handled when:

- New Game changes seed/world,
- current `WorldBundle` is rebuilt,
- service is disposed.

Use an epoch/fingerprint/generation token or equivalent; stale results must never bind into a new world.

## 3. Quest-owned persisted knowledge progress

`QuestManager` remains owner of quest progress.

Add optional persisted knowledge slots to `QuestProgressEntry` / runtime progress.

Conceptually:

```ts
type QuestWorldKnowledgeProgress =
  | {
      status: 'requested'
      requestedAtDays: number
      revealAtDays: number
    }
  | {
      status: 'resolved'
      requestedAtDays: number
      revealAtDays: number
      ref: WorldKnowledgeRef
    }
  | {
      status: 'unavailable'
      requestedAtDays: number
      revealAtDays: number
    }
```

`resolving` may exist only as runtime task bookkeeping.

On restore:

- unresolved `requested` research restarts safely;
- resolved ref is preserved exactly;
- elapsed world time may already satisfy the research delay;
- no duplicate request effects/journal events occur.

Do not create a separate quest-knowledge save registry.

## 4. Research delay uses world simulation time

Reuse `QuestWorldTimeLookup.getElapsedDays()`.

Authoring declares a duration, e.g. one hour = `1 / 24` day.

Reveal requires both:

```text
background world lookup resolved
AND
current world time >= revealAtDays
```

If worker finishes immediately, authored delay still applies.

If world time passes before the worker result arrives, NPC still waits for the result.

## 5. Quest authoring primitives

Extend existing quest machinery, not a parallel dialogue state machine.

Preferred concepts:

- knowledge declarations on `QuestDef`;
- a one-shot effect/acceptance action that starts research;
- a typed stage/objective for returning to an NPC to receive researched knowledge;
- a typed objective that refers to a resolved knowledge slot instead of requiring concrete `landmarkId` at definition construction.

Conceptually:

```text
accept
→ request_world_knowledge("target")

stage 0: receive_world_knowledge("target", giver)
  pending → "Jeszcze sprawdzam."
  ready → NPC gives concrete clue

stage 1: interact_bound_landmark("target")
```

Do not encode knowledge ids as fake landmark ids.

## 6. Geographic clue presentation

The mechanism exists to let NPCs tell the Player **where to go**.

Reuse existing direction/location presentation helpers (`cardinalDirectionPhrase`, cave/location description patterns, settlement names).

A resolved landmark should be describable relative to a meaningful origin, e.g.:

```text
"ruiny na północny zachód od Lipowa"
"monolit na wschód od osady, około kilkuset metrów stąd"
```

Do not persist rendered Polish prose when it can be regenerated from stable ref + deterministic context.

Do not reveal exact hidden-item coordinates when fiction warrants only a place/area clue.

## 7. Guard local-knowledge pilot

Use the existing home guard topic **„Opowiedz mi coś o okolicy”** as a non-quest pilot of the same service.

Current behavior from `world-012`:

- guard selects/reveals 1–3 locations from a top-5 nearby/medium pool;
- location discovery has historically had cold-scan hitch work (`world-022`).

New behavior:

```text
Player asks guard about surroundings
→ if suitable local-knowledge result already exists: reveal normally
→ otherwise guard starts background research and responds immediately
→ e.g. "Muszę przejrzeć meldunki i przypomnieć sobie szlaki. Wróć za godzinę."
→ after worker result + authored delay, next conversation reveals 1–3 concrete locations
```

Do not route this through `QuestManager`.

Reuse normal `LocationKnowledge` / `revealLocationKnowledge` for actual discovery. The research service only resolves candidate world refs.

Persist only gameplay-meaningful guard research state if required to preserve the authored wait across save/load; do not persist worker tasks/results that can be deterministically reconstructed unless the selected reveal set itself must remain stable.

The selected 1–3 locations must not reroll merely because the Player saved/reloaded while the guard was researching.

## 8. Quest pilots

### A. `slad-przy-monolicie`

Replace eager monolith binding with:

```text
Anna gives lead
→ starts worker-backed monolith research
→ ~1 world-hour authored wait
→ Anna gives direction/location clue
→ interact with exact resolved monolith
→ existing report/outcome
```

Preserve quest id and outcome semantics.

### B. generated `old-place-secret`

Use the same generic mechanism without matrix-specific pending state.

Generated quest identity must remain deterministic/stable. Do not make candidate identity depend on async completion order.

If current `sourceId` is required to preserve persisted quest id, keep stable candidate identity selection deterministic while deferring the actual player-facing research/reveal through the common service.

### C. Lost Treasure Chronicles

Use the archaeologist/papers fiction as a story pilot.

Preserve deterministic grave-vs-ruins truth and physical content placement. The research service delays NPC/player knowledge, not world existence.

Do not redesign the whole chapter.

## 9. Immediate knowledge remains supported

Do not migrate every landmark quest.

Keep immediate knowledge where fiction supports it, e.g.:

- local cemetery known by residents;
- clearly visible landmark;
- place explicitly already known by giver.

The architecture must make both policies explicit:

```text
immediate knowledge
researched knowledge
```

## 10. Persistence and migration

Update quest progress validation/normalization for optional knowledge fields.

Older saves remain valid.

For migrated existing quest ids:

- `not_offered` / `offered` → new flow;
- old `active` concrete landmark objective → reconstruct/preserve its target and place it directly after research stage;
- `ready_to_report` / terminal → unchanged.

For guard research:

- save/load must not reset an already-started authored wait or reroll selected reveal results;
- New Game must clear it.

Do not bump SaveData version unless current compatibility rules require it.

## 11. Eager lookup cleanup

After pilots migrate, remove only now-unused eager lookup work.

Do not remove lookups required for:

- systemic treasure-site generation;
- key host placement;
- deterministic physical story truth;
- immediate-knowledge quests;
- unrelated world-location catalog behavior.

## 12. Validation and JSDoc

Extend `validateQuestDefinitions()` for deferred knowledge declarations/references.

Validate at least:

- unique knowledge ids;
- referenced slot exists;
- compatible ref/objective kind;
- non-negative finite research delay;
- valid receive-knowledge NPC target;
- no unresolved slot is consumed without a valid research flow.

Add concise JSDoc to important architectural/public functions/classes with useful `@domain` tags so future AI preflight can discover this mechanism.

## 13. Tests

### Worker/service

1. deterministic landmark query returns same result as existing main-thread resolver for representative seeds/chunks;
2. request runs through worker job path, not synchronous `findLandmarkNear` on dialogue call stack;
3. equivalent concurrent queries deduplicate;
4. tile/mesh priority is preserved while research is queued;
5. stale world/reset completion is ignored;
6. unavailable and worker error paths are explicit/retry-safe;
7. service disposal clears/rejects pending work safely.

### Quest lifecycle

8. request starts exactly once;
9. repeated pending interaction does not duplicate work;
10. result before delay does not reveal early;
11. delay before result does not reveal early;
12. resolved + elapsed enables clue dialogue;
13. knowledge-bound landmark matches only resolved id;
14. save/load requested state restarts worker resolution safely;
15. save/load resolved state preserves exact ref;
16. New Game ignores stale completion;
17. journal entries are not duplicated;
18. old save without knowledge fields remains valid.

### Guard pilot

19. first cold "Opowiedz mi coś o okolicy" returns immediately with research dialogue;
20. repeated conversation while pending does not start duplicate scan;
21. after delay/result guard reveals stable 1–3 locations through normal `LocationKnowledge`;
22. save/reload does not reroll selected reveal set;
23. already-known/cached local knowledge may be revealed without artificial new research.

### Quest pilots

24. `slad-przy-monolicie` has no eager monolith quest lookup during app setup;
25. `old-place-secret` keeps stable generated quest identity;
26. chronicle-search keeps deterministic world truth;
27. at least one immediate landmark quest remains unchanged.

Do not use wall-clock timing assertions.

## 14. Manual verification

User verifies in browser:

1. new game;
2. ask guard "Opowiedz mi coś o okolicy" on a cold world — no visible freeze;
3. guard asks Player to return later;
4. return too early — still pending;
5. advance world time past delay — guard gives concrete nearby locations;
6. save while guard/quest research is pending, reload and continue;
7. run `slad-przy-monolicie` and confirm Anna later gives an actual direction;
8. reach only the indicated monolith and complete objective;
9. repeat representative generated/story pilot;
10. confirm immediate location quests still work normally.

AI does not perform browser verification.

## Relevant systems

Expected implementation areas:

```text
src/terrain/chunkWorkerPool.ts
src/terrain/chunkHeightmap.worker.ts
src/terrain/chunkHeightmapProtocol.ts
src/terrain/chunkEnvironment.ts
src/terrain/chunkManager.ts
src/world/locations/worldLocationCatalog.ts
src/world/locations/locationConfig.ts
src/world/locations/locationKnowledge.ts
src/world/locations/revealLocationKnowledge.ts
src/app/inventoryWiring.ts
src/app/createApp.ts
src/quests/quests.ts
src/quests/QuestManager.ts
src/quests/opportunities/rpgQuestMatrices.ts
src/quests/opportunities/rpgQuestMaterialization.ts
src/quests/lostTreasureChronicleSearch.ts
src/persistence/saveData.ts
src/quests/cardinalDirection.ts
src/quests/caveLocationDescription.ts
```

Exact files/call-sites should follow current code and implementation notes.

## Non-goals

- LLM-generated dialogue;
- generic asynchronous job framework unrelated to world knowledge;
- moving all world generation to workers;
- dynamic fauna/NPC target research;
- redesigning LocationKnowledge ownership;
- redesigning Lost Treasure Chronicles;
- making every NPC research every location;
- changing landmark rarity/search semantics.

## Verification

Run targeted Vitest suites plus repository-standard:

- type-check,
- lint,
- build.

Do not run `pnpm docs:sync`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**