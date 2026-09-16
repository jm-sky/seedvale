# Implementation notes: quests-progression-047 deferred world knowledge and location research

## Current architecture confirmed

### Quest progress ownership

`src/quests/QuestManager.ts` owns runtime quest progress in `states: Map<string, QuestRuntimeProgress>` and persists through `QuestProgressEntry` from `src/quests/quests.ts`.

Current persisted fields include state/stage/outcome, stage-local progress, offer cooldown and journal stamps. Deferred quest knowledge belongs here; do not create a second quest save registry.

`QuestManager.reset()` keeps the same manager instance across New Game, so async completions need an epoch/generation guard.

### World time already exists

`QuestManager` already receives `QuestWorldTimeLookup`:

```ts
getWorldSeed()
getTimeOfDay()
getElapsedDays()
```

Use `getElapsedDays()` for authored research deadlines. No real-time timer manager is needed.

### World seams are injected

`QuestManager` already follows the correct boundary for fauna, world progress, reputation, settlement lights and physical outcomes: narrow interfaces are injected instead of importing world systems.

Deferred world knowledge must follow the same pattern. `QuestManager` must not import `ChunkManager`, `WorldLocationCatalog`, workers or terrain modules.

## Existing worker infrastructure to reuse

### `src/terrain/chunkWorkerPool.ts`

The repository already has a persistent worker pool backed by `chunkHeightmap.worker.ts`.

Current job kinds:

```text
tile
mesh
grass
```

Important current behavior:

- workers live for the pool lifetime;
- cancellation removes/discards job results rather than killing workers;
- same-key requests replace older work;
- tile and mesh have priority over grass;
- grass concurrency is capped so at least one worker remains available for player-critical terrain work;
- `disposeChunkWorkerPool()` terminates the pool on teardown.

This is the correct execution boundary for world-knowledge research. Do not create one-off Workers from NPC dialogue or a separate quest Worker pool.

### Required worker extension

Add a data-only job kind for world knowledge, e.g. conceptually:

```text
kind: 'worldKnowledge'
```

Update consistently:

- `ChunkWorkerRequest` / `ChunkWorkerResponse` in `chunkHeightmapProtocol.ts`;
- worker dispatch in `chunkHeightmap.worker.ts`;
- pool job union / queue / request / cancellation in `chunkWorkerPool.ts`.

The exact naming may adapt, but keep it explicit and typed.

### Priority decision

Research is background work, not chunk-streaming work.

Required priority order:

```text
tile / mesh
> world knowledge
>= or > grass only if recon shows grass jobs can otherwise delay research excessively
```

The key invariant is that research must never consume all worker capacity while terrain/mesh work is waiting.

Prefer the same headroom approach already used for grass rather than introducing another scheduler abstraction.

Do not enqueue one job per scanned chunk. Prefer one bounded research request that performs its ring scan inside a worker so queue overhead and main-thread Promise churn stay bounded.

## Worker-safe landmark resolution primitives

`world-028` added `resolveClassicLandmarkPlacement()` in `src/terrain/chunkEnvironment.ts` for:

- `monolith`,
- `stoneCircle`,
- `smallRuins`.

It is already shared by streamed `computeChunkEnvironment()` and unloaded lookup. This is exactly the primitive the worker research job should reuse.

Do not duplicate RNG, terrain gates or landmark chance logic in the worker.

For each query chunk, the worker can build the minimal terrain sampler from deterministic `ChunkTileParams` and call the same resolver.

`cemetery` already has a lightweight resolver path from `world-014`/later cemetery work. Authored `ruins` have a separate authored-site path. Only support kinds that have a correct worker-safe deterministic resolver; do not silently fall back to full `computeChunkEnvironment()` in the background job.

If `tower` / `shipwreck` still require full environment generation, leave them out of V1 worker knowledge until their primitive is extracted correctly.

## New world-level service ownership

The updated plan requires a shared world service rather than QuestManager owning async lookup mechanics.

Suggested location:

```text
src/world/locations/worldKnowledgeResearch.ts
```

or another existing `world/locations` module if a stronger seam already exists during implementation.

Responsibilities:

- normalize deterministic query inputs;
- create stable request/dedupe keys;
- dispatch worker requests;
- deduplicate equivalent in-flight work;
- ignore stale completions across world epoch/seed changes;
- return stable world refs;
- contain worker errors/cancellation;
- no quest/dialogue knowledge.

Conceptual API:

```ts
type WorldKnowledgeQuery = {
  kind: 'nearest-landmark'
  landmarkKinds: readonly LandmarkKind[]
  originX: number
  originZ: number
  maxChunkRadius: number
  // deterministic world inputs/fingerprint as needed
}

type WorldKnowledgeRef = {
  type: 'landmark'
  id: string
  kind: LandmarkKind
  x: number
  z: number
}

type WorldKnowledgeResearch = {
  resolve(query: WorldKnowledgeQuery): Promise<WorldKnowledgeRef | null>
  dispose(): void
}
```

Do not freeze exact names prematurely; preserve the ownership and data-only contract.

## Request identity and stale-result protection

A dedupe key must include every input that changes result identity, at minimum conceptually:

```text
world seed / terrain fingerprint
query kind(s)
origin
radius
```

Do not key only by quest id or NPC id.

The service must have a current world generation/epoch token. On New Game or `WorldBundle` rebuild:

- old in-flight result may finish;
- it must be discarded if epoch/fingerprint no longer matches;
- no old-world landmark ref may enter current quest/dialogue state.

This protection is separate from QuestManager's own reset epoch; both boundaries matter.

## Guard local-knowledge flow is an important pilot

The remembered NPC is the **home guard**.

Existing seam is documented in `world-012` and current code comments as:

```text
"Opowiedz mi coś o okolicy"
```

Current behavior:

- builds a nearby/medium candidate pool;
- top `GUARD_LANDMARK_POOL_SIZE = 5` by discovery weight;
- reveals a deterministic/randomized 1–3 subset through normal LocationKnowledge flow.

Relevant code areas found in recon:

```text
src/app/inventoryWiring.ts
src/ui-vue/store.ts
src/world/locations/locationConfig.ts
src/world/locations/worldLocationCatalog.ts
src/world/locations/locationKnowledge.ts
src/world/locations/revealLocationKnowledge.ts
```

`inventoryWiring.ts` explicitly owns the guard topic integration and merchant map purchase integration with World Locations.

`world-022` exists because cold location discovery previously caused hitches, including this guard topic. This makes it a strong non-quest validation case for the new service.

### Guard state ownership

Do not push guard research into `QuestManager`.

Use a small world/dialogue-owned state for:

```text
not_started
requested(requestedAtDays, revealAtDays)
resolved(selected refs)
```

Persist only what affects gameplay continuity:

- research start/deadline if the authored wait must survive reload;
- selected stable refs if reveal selection must not reroll after reload.

Do not persist Promise/worker ids.

If existing LocationKnowledge already gives enough stable persistence for revealed results, reuse it after reveal rather than duplicating discovery state.

### Guard reveal selection

The worker/service should resolve candidate world refs. The existing guard-specific top-5 / reveal-1–3 policy should remain guard/dialogue policy unless current code already centralizes it elsewhere.

Do not move discoveryWeight/UI wording into the generic research service.

## Quest eager path today

### `buildLandmarkQuests()`

`src/quests/quests.ts::buildLandmarkQuests(resolve)` currently takes:

```ts
LandmarkResolver = (kind: LandmarkKind) => string | undefined
```

and eagerly materializes concrete ids before constructing `QuestManager`.

Current five quests:

- `stare-ruiny` → `smallRuins`
- `slad-przy-monolicie` → `monolith`
- `zapomniany-cmentarz` → `cemetery`
- `zaginiony-ladunek` → `shipwreck`
- `samotna-wieza` → `tower`

`src/app/createApp.ts` owns `LANDMARK_QUEST_SEARCH_CHUNK_RADIUS = 10` and passes `ChunkManager.findLandmarkNear()` around home.

Only migrate explicitly selected pilots. Immediate knowledge must remain supported.

## Quest knowledge lifecycle

### Authored declaration

Add a stable per-quest knowledge id and research policy, conceptually:

```ts
type QuestWorldKnowledgeDef = {
  id: string
  query: ...
  revealDelayDays: number
}
```

Avoid storing resolver functions in `QuestDef`.

The query can reference an authored origin policy (e.g. giver/home settlement) which composition resolves into data for the injected world adapter; do not make quest definitions carry mutable world manager references.

### Persisted progress

Add optional knowledge progress to `QuestProgressEntry` and runtime progress.

Prefer a discriminated union:

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

Knowledge state is player/NPC knowledge about a world ref, not ownership of the physical landmark.

### Runtime task bookkeeping

Keep Promise/task handles outside persisted state.

QuestManager can maintain an internal in-flight map keyed by quest/knowledge id or delegate dedupe completely to the shared service. It still needs a manager reset epoch so an old completion cannot mutate reused QuestManager state after New Game.

## Quest flow primitives

Current `interact_landmark` is concrete:

```ts
{ type: 'interact_landmark', landmarkId: string }
```

Keep it unchanged for immediate quests.

Add a typed knowledge-bound sibling, e.g. conceptually:

```ts
{ type: 'interact_bound_landmark', knowledgeId: string }
```

`objectiveMatchesRef()` should resolve the persisted knowledge ref and compare exact landmark id.

For receiving the researched clue, add a typed dialogue/stage primitive rather than checking magic strings.

Required conditions:

```text
knowledge status == resolved
AND
getElapsedDays() >= revealAtDays
```

Pending interaction must return authored informational dialogue without advancing.

## Existing effects/dialogue seams to reuse

`QuestStageEffect` already dispatches one-shot effects through `QuestLifecycleHooks`.

If research should start on acceptance but acceptance currently has no exact-once effect seam, add the smallest general acceptance-effect mechanism. Do not trigger background lookup merely because a menu rendered.

`QuestManager` already owns:

- `QuestDialogOverride`,
- `dialogueActions`,
- `talk_to_npc`,
- `talk_to_npc_choice`,
- topic arbitration,
- journal events.

Use these; Vue must remain presentation-only.

## World-time delay

Use `QuestWorldTimeLookup.getElapsedDays()`.

One hour = `1 / 24` day.

Resolver completion and story readiness are independent.

No `setTimeout`, wall-clock duration or polling loop is needed. Read readiness whenever dialogue/list state is requested, using current world time.

## Geographic presentation

Existing useful helpers:

```text
src/quests/cardinalDirection.ts::cardinalDirectionPhrase
src/quests/caveLocationDescription.ts
```

Build one narrow deterministic landmark-description helper from:

- resolved x/z,
- origin settlement x/z/name,
- landmark kind/label.

Keep rendered prose derived; do not persist it as world truth.

The clue should provide actionable gameplay guidance, not an exact debug coordinate.

## Pilot-specific implementation notes

### 1. Guard — `Opowiedz mi coś o okolicy`

Best architecture pilot because it proves the service is not quest-specific.

Desired flow:

```text
cold ask
→ enqueue worker research
→ immediate "wróć później" reply
→ wait authored world time
→ reveal stable 1–3 normal locations
```

If relevant candidate data is already cached/known cheaply, do not force an artificial new worker scan. The authored policy may reveal immediately when guard logically already has usable knowledge.

Keep reveal through `LocationKnowledge`; worker result itself must not mark the map discovered.

### 2. `slad-przy-monolicie`

Clean quest pilot because `monolith` has worker-safe lightweight resolver after `world-028`.

Flow:

```text
Anna's lead
→ request target knowledge
→ ~1h wait
→ Anna gives concrete direction
→ interact_bound_landmark(target)
→ existing report/outcome
```

Preserve quest id and outcome.

Old active saves that were already on concrete monolith objective must skip research fiction and preserve/reconstruct the same deterministic target.

### 3. `old-place-secret`

`src/quests/opportunities/rpgQuestMatrices.ts` currently picks an existing `RpgLandmarkRef` and puts `chosen.id` into `opportunity.sourceId`.

Generated quest id is:

```text
rpg:old-place-secret:<settlementId>:<sourceId>
```

Do not destabilize it.

If `sourceId` must remain concrete to rematerialize persisted generated quests, keep identity selection deterministic but use shared research for the NPC/player reveal phase. Do not add an RPG-only async state.

### 4. Lost Treasure Chronicles

`quests-progression-038` already creates deterministic chapter truth: cemetery + expedition ruins and deterministic real chronicle location.

Do not defer/reroll physical truth.

Use generic research only for the archaeologist's knowledge/reveal of the ruins clue where current story flow allows it.

## Immediate controls / explicit non-migrations

Keep at least one concrete landmark quest unchanged to prove opt-in behavior.

Good candidates:

- `zapomniany-cmentarz` — local cemetery logically known;
- `samotna-wieza` — premise says tower is visible.

`zaginiony-ladunek` is narratively suitable but `shipwreck` still has a heavier/full unloaded resolver. Do not migrate it until the new worker job supports its exact placement semantics or its primitive is extracted.

## Persistence touchpoints

Inspect/update:

```text
src/quests/quests.ts::QuestProgressEntry
src/quests/QuestManager.ts::QuestRuntimeProgress
QuestManager progress export/normalization/reset
src/persistence/saveData.ts::isQuestProgressEntry
```

Guard research persistence should reuse the nearest existing world/location save owner; inspect current `SaveData.map` / location knowledge state before adding a new top-level save field.

Missing new optional fields in older saves must remain valid.

Do not bump save version unless required by existing validator/migration rules.

## Journal behavior

Journal stores stamps, not quote text.

If both:

- initial research line,
- final revealed clue

need separate journal notes in the same stage, current dedupe-by-stage may be insufficient. Extend event identity narrowly rather than storing rendered sentences.

Do not duplicate entries after reload/repeated conversations.

## Validation

Extend `validateQuestDefinitions()` for deferred knowledge authoring:

- unique knowledge ids;
- referenced id exists;
- non-negative finite delay;
- objective/ref type compatibility;
- valid receive-knowledge NPC;
- no bound objective without declared knowledge source.

Keep validation centralized with existing quest definition checks.

## Tests and useful fakes

### Worker pool tests

Use fake Worker / controllable pool patterns already present if available. Test scheduling semantics without real timing.

Cover:

- research job serializes through protocol;
- tile/mesh jobs outrank queued research;
- cancellation/disposal rejects correctly;
- stale/cancelled result is discarded;
- one bounded research job performs the scan rather than N per-chunk jobs.

### Parity tests

For representative seeds/query origins:

```text
worker research result
== existing deterministic main-thread landmark search result
```

Compare stable id/kind/x/z.

Do not use wall-clock thresholds.

### Service tests

Use controllable worker promises:

- dedupe equivalent request;
- distinct query inputs do not collide;
- reset/world epoch invalidates old result;
- unavailable and retry/error behavior explicit.

### QuestManager tests

Use fake world clock + controlled research resolver:

- request exactly once;
- result-before-delay;
- delay-before-result;
- resolved + delay → clue action;
- bound objective exact id matching;
- save/load requested restart;
- save/load resolved no reroll;
- reset ignores completion;
- journal idempotence.

### Guard tests

Cover:

- cold ask queues one research request and replies immediately;
- repeated ask while pending does not duplicate;
- result + delay reveals 1–3 through existing LocationKnowledge path;
- persisted pending state survives reload;
- selected reveal refs do not reroll after reload;
- already-known/cached case can remain immediate.

## Expected implementation files

Focused list from current recon:

```text
src/terrain/chunkWorkerPool.ts
src/terrain/chunkHeightmapProtocol.ts
src/terrain/chunkHeightmap.worker.ts
src/terrain/chunkEnvironment.ts
src/world/locations/worldKnowledgeResearch.ts        # likely new
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

Add/adjust tests alongside touched modules rather than creating one broad integration test file.

## Implementation order

1. Extend worker protocol/pool with low-priority bounded world-knowledge job.
2. Implement worker-safe nearest-landmark scan reusing existing deterministic resolvers.
3. Add world-level research service with dedupe + world epoch protection.
4. Integrate guard local-knowledge flow as first non-quest consumer.
5. Add quest knowledge definition/progress/ref types + validation.
6. Add persisted runtime state and save validation.
7. Inject research service adapter into `QuestManager`; add reset epoch protection.
8. Add request/receive/bound-landmark quest primitives.
9. Add deterministic clue formatter.
10. Migrate `slad-przy-monolicie`.
11. Migrate `old-place-secret` without changing stable generated ids.
12. Integrate Lost Treasure Chronicles knowledge reveal without moving physical truth.
13. Remove only now-unused eager lookup call-sites.
14. Update state/docs if architecture ownership changes materially.
15. Run targeted tests, type-check, lint and build.

## Guardrails

- World worker/service owns lookup execution, not quest lifecycle.
- QuestManager owns persisted quest knowledge, not terrain truth.
- Guard dialogue is a peer consumer of the service, not a fake quest.
- No mutable `QuestDef` after manager construction.
- No Promise/Worker/task handle in SaveData.
- No `Promise.resolve(syncHeavyLookup())` pretending to be background work.
- No per-conversation Worker creation.
- No per-chunk worker-job fan-out for one bounded scan.
- Preserve worker headroom for terrain/mesh streaming.
- No duplicate landmark placement algorithm.
- No conversation-order rerolls.
- Keep immediate knowledge supported.
- Browser verification belongs to User.

## Follow-up discovered after implementation

Accepting `slad-przy-monolicie` still froze the main thread (~30 s). `QuestManager` was already fire-and-forget; `buildWorldKnowledgeWorkerParams()` synchronously gathered cemetery/road context for the whole search ring before the worker job started. That is plan `world-030`, not a retroactive expansion of this plan.
