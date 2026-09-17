# Implementation Notes: world-031 — Authored Persistent World Consequences

Recon baseline: current `main`, 2026-09-17. These notes capture ownership/lifecycle findings needed to implement `world-031` without retracing the same systems. Source code wins if `main` moves before implementation.

## 1. Final ownership decision

The codebase has no existing owner that should be stretched into authored runtime world-consequence activation.

Use one small **world-owned activation registry** in `WorldBundle`.

It owns only:

```text
AuthoredWorldConsequenceId -> active / absent
```

It must not own concrete outpost/farm/road-stop state.

Why the obvious alternatives are wrong:

- `QuestManager` explicitly owns quest progress/objective evaluation/player↔NPC relations (`QuestProgressEntry`), and accesses world domains through injected resolvers/hooks.
- `SaveData` is serialization only; `docs/state/persistence.md` explicitly forbids treating it as runtime authority.
- `SaveWorldFlags` is a narrow collection of story/gameplay facts. Expanding it with structure/NPC/materialization state would repeat the current one-off flag pattern rather than introduce a reusable domain seam.
- `SettlementStructureStateRegistry` owns condition/repair state for structures already represented by stable `VillageBuildingPlan.id`; it is not a creation/existence registry.
- `settlementPlanCache` owns deterministic generated `SettlementDef`s and is backed by a disposable worldgen cache. Mutable save state must not affect its cached definitions.
- `settlement/places.ts::Place` is a settlement-local routing target (`home|workplace|food|social`), not a world-place database.
- `WorldLocationCatalog` resolves deterministic worldgen locations by stable id. Geometry is re-derived from seed/id and is explicitly not persisted.

The resulting ownership graph is:

```text
trigger owner (QuestManager / fauna / other world domain)
        │ activate(id)
        ▼
WorldBundle.AuthoredWorldConsequenceRegistry
        │ isActive(id)
        ▼
concrete domain materializer
        │ owns complete state
        ▼
normal settlement/world APIs
```

## 2. Persistence boundary to follow exactly

`docs/state/persistence.md` confirms the project rule:

```text
domain runtime owner
→ buildSaveData() snapshot
→ SaveData
→ migration + validation
→ restore by constructor input
```

There is no post-construction hydration phase.

For in-session rebuild, the same snapshot/constructor path is reused. `src/app/worldBundle.ts` already does this for e.g. settlement structure state:

```text
bundle.settlementsManager.snapshotStructureStates()
→ carriedStructureStates
→ create replacement world with structureStates: carriedStructureStates
```

Implement consequences the same way:

```text
registry.snapshot()
→ SaveData.authoredWorldConsequences
→ createWorldBundle(initialAuthoredWorldConsequences)
```

and on rebuild:

```text
bundle.authoredWorldConsequences.snapshot()
→ replacement bundle constructor input
```

Do not add a second special rebuild path.

### Save schema

Current code has one canonical version constant in `src/persistence/saveData.ts`; do not copy its numeric value into implementation docs/code outside that owner.

Adding the new field changes canonical persisted representation. Follow the existing fail-closed migration chain:

1. bump `CURRENT_SAVE_VERSION` from whatever value is current at implementation time;
2. add exactly one migration from previous version;
3. default the new consequence collection to empty so old saves reproduce old behaviour;
4. update `isSaveData()`/field validator;
5. update save fixtures/migration tests;
6. add the field in `src/app/saveState.ts::buildSaveData()` from the live registry owner.

A sparse list of active IDs is enough. No positions or definition payloads belong in SaveData.

## 3. Recommended `src/world/` shape

Keep this small and plain-data oriented. Suggested responsibilities, not required filenames:

```text
src/world/authoredWorldConsequences.ts
  AuthoredWorldConsequenceId
  AuthoredWorldConsequenceDefinition
  createAuthoredWorldConsequenceRegistry(...)
```

Useful public API:

```ts
isActive(id): boolean
activate(id): boolean
snapshot(): readonly AuthoredWorldConsequenceId[]
getDefinition?(id): AuthoredWorldConsequenceDefinition | undefined
```

Implementation rules:

- constructor receives predefined definitions and restored active IDs;
- index definitions by id once;
- reject duplicate definition ids during construction;
- restored/activated ids must resolve to known definitions;
- `activate` is Set-like (`false` when already active);
- `snapshot` sorts IDs so save output/tests are deterministic;
- do not expose the mutable `Set`;
- add `@domain world` JSDoc to the public registry/definition contract.

No need for observers/event bus in V1. Consumers query activation during their normal build/stream path. Activation that must affect an already-loaded consumer can be handled by that concrete consumer plan through its existing domain API; do not pre-build a generic subscription framework here.

## 4. Stable identity precedents and what to copy

### Authored residents

Relevant files:

```text
src/settlement/lostTreasureChroniclesElderResident.ts
src/settlement/lostTreasureChroniclesArchaeologistResident.ts
src/settlement/lostTreasureChroniclesSpecialistResident.ts
src/settlement/settlementPlanCache.ts
src/settlement/settlementGenerator.ts
src/settlement/npcIdentity.ts
```

Current flow:

```text
deterministic host selection
→ authored family with semantic id
→ appendAuthoredResidentFamilies()
→ resolveInitialProfessionStaffing()
→ VillagePlan / SettlementDef
→ settlementNpcId(settlementId, flattenedMemberIndex)
```

Important lessons:

- authored identity is semantic and deterministic;
- selection does not depend on stream order;
- `appendAuthoredResidentFamily()` is idempotent by family id;
- resident becomes an ordinary settlement resident before downstream systems.

Do **not** copy the injection location for world-031 runtime state. `settlementPlanCache.ts` is generation-time and save-agnostic. Making `authoredResidentsFor()` depend on active consequence save state would make a disposable worldgen cache depend on history and would violate its deterministic contract.

### Settlement structure state

Relevant files:

```text
src/settlement/villagePlan.ts
src/settlement/structureStateRegistry.ts
src/settlement/structureCondition.ts
src/settlement/SettlementsManager.ts
src/settlement/props.ts
```

Current architecture:

```text
VillageBuildingPlan.id
+ immutable deterministic VillagePlan
+ sparse SettlementStructureStateRegistry keyed by stable id
```

`SettlementsManager.getStructureSnapshot()` works even when a settlement is unloaded because the registry outlives loaded `Settlement` instances.

This is the strongest local precedent for world-031: definition and mutable state are separate. Consequence activation should similarly stay separate from concrete building condition/progress.

## 5. Player-built persistent object precedent

Relevant files:

```text
src/world/playerWell.ts
src/world/createPlayerWells.ts
src/app/worldBundle.ts
src/app/saveState.ts
```

`PlayerWellRecord` is plain persistent domain state. `createPlayerWells()` accepts initial records, materializes mesh/collider, and `nodes()` serializes back to plain records.

Reuse the **reconstruction shape**, not the player-generated identity scheme. `createPlayerWells().place()` uses runtime-generated ids because the player can create arbitrary wells and the entire record is saved. Authored consequences need stable predefined semantic IDs instead.

Construction ownership lesson is especially important:

```text
PlayerWellRecord.stage/workProgress
```

belongs to the well itself. A work contract does not duplicate that progress. Apply the same rule to a future outpost/farm: if it has construction progress, its domain object owns it, not the consequence registry.

## 6. World-generated authored object precedent

`src/world/worldGeneratedContainers.ts` already separates a stable authored spec from persisted mutable state:

```text
WorldGeneratedContainerSpec
  id / position / authored initial contents
+
SaveWorldGeneratedContainer
  mutable persisted inventory state
```

`createWorldGeneratedContainers()` maps saved records by stable id and otherwise instantiates from the authored spec.

This is useful precedent for future consequence consumers: static authored definition and mutable domain record can meet by id at materialization time.

Do not turn `WorldGeneratedContainerSpec` into the consequence definition; it is container-specific and stores physical data for its own domain.

`unlockedTreasureContainerIds` (world-024) is another narrow persisted-id set, but it is app-owned lock state for one specific system. It demonstrates that sparse stable IDs are sufficient for an unlock fact; world-031 should give the cross-domain authored-world fact a proper world owner rather than proliferating another ad-hoc Set in `createApp.ts`.

## 7. Settlement streaming seam

`src/settlement/SettlementsManager.ts` owns settlement generation/streaming and long-lived registries.

Important existing API/lifecycle facts:

- `Entry` keeps `SettlementDef` separate from the currently loaded `Settlement | null`;
- `peekDef()` resolves deterministic definition without loading meshes;
- `getHousehold()`, `getEconomy()`, `getNpcState()` and `getStructureSnapshot()` are backed by registries that survive settlement unload;
- settlement construction always goes through the manager's normal load path and `createSettlement()`.

For a future authored consequence inside/adjacent to a settlement:

```text
WorldBundle registry (long-lived)
→ read-only isActive dependency into SettlementsManager / concrete settlement build seam
→ on ensure/load, concrete plan materializes its own stable object
```

world-031 should only make that read dependency possible. Do not mutate the cached `SettlementDef` and do not create a second settlement manager.

If consequence activation happens while the target settlement is unloaded, no special action is required: the activation fact persists and normal later stream-in sees it.

If activation happens while target settlement is already loaded, the concrete consumer plan must provide a domain operation that reconciles the loaded runtime object. Do not solve this with a generic world-event dispatcher in world-031.

## 8. Quest integration seam

Relevant files:

```text
src/quests/quests.ts
src/quests/QuestManager.ts
src/app/createApp.ts
```

Current `QuestStageEffect` is already the generic one-shot effect vocabulary used by:

- stage advancement/dialogue actions;
- terminal `QuestOutcome.effects`;
- effects such as `reveal_location`, item-instance transfer, animal-ownership transfer and world-knowledge request.

`QuestManager.applyOutcome()` is terminal-resolution authority and applies an outcome exactly once. It already dispatches world-facing effects through injected dependencies/hooks.

Add one small effect variant for predefined consequence activation. Do not add a second quest consequence mechanism.

Preferred composition:

```text
QuestDef outcome.effects
→ QuestManager existing effect dispatcher
→ injected activateWorldConsequence(id)
→ current WorldBundle.authoredWorldConsequences.activate(id)
```

The callback must resolve the **current** live bundle after a rebuild; do not close over a stale pre-rebuild registry instance if `createApp.ts` replaces/mutates bundle references during rebuild.

Quest validation should catch unknown consequence ids before gameplay. The most robust place depends on how definitions are composed at implementation time, but the invariant is non-negotiable: a typo must not become an unknown persisted activation string.

Do not derive activation at load by replaying `resolvedOutcomeId`. Quest progress remains evidence/trigger history; registry state is the world-domain authority after activation.

## 9. Wolf-den finding: distinguish three states

Relevant files:

```text
src/fauna/createFauna.ts
src/fauna/AnimalSpawner.ts
src/app/gameLoop.ts
src/quests/quests.ts
```

`Fauna.isWolfDenCleared()` currently means the initial den pack is dead. It is a world/fauna observation and is used by `gameLoop.ts` to report `wolf_den_cleared` into quest objective handling.

The spawn point also has its own depletion/permanent-destruction lifecycle. These are not the same semantic fact.

Therefore the future wolf-den→outpost content plan must choose the exact trigger it wants (quest outcome, permanent den destruction, etc.). world-031 must not reinterpret `isWolfDenCleared()` or copy wolf-den state into its registry.

The reusable architectural lesson is:

```text
world entity owns its real state
quest observes stable entity id/fact
world consequence activation is a separate one-time result
```

## 10. `Place`, landmark and `WorldLocation` boundaries

### `settlement/places.ts::Place`

Current type:

```text
PlaceType = home | workplace | food | social
Place = stable settlement-scoped id + position + optional availability
```

It is consumed by NPC routines. It is not persistent independently and has no global lookup/creation semantics.

A future active outpost can expose its normal workplaces/social places through this existing machinery once its settlement/domain owner exists. Do not use `Place` as the activation registry.

### World locations

`src/world/locations/worldLocationTypes.ts::WorldLocation` is a deterministic, pure-world description. The comment explicitly states identity/position are re-derived from world seed + source generator and are never save-game state.

If a future restored farm/outpost should become a map/discovery location, that plan needs a projection/extension at the location-catalog layer. Do not make world-031 change `WorldLocationCatalog` into a mutable runtime place registry.

### Procedural landmarks

Quest objective `interact_landmark` and world-location ids prove that stable landmark identity can be referenced without persisting geometry. That is useful identity precedent, not an ownership seam for authored post-start changes.

## 11. Lifecycle decision: no generic phase machine

Do not add:

```text
locked | construction | active
```

to the world-031 registry.

Reasoning:

- locked is already represented by absence from the active-id set;
- construction state has domain-specific fields/cost/progress/actors;
- an inhabited farm may not share the same transition semantics as a new outpost;
- a road stop may be materialized atomically;
- forcing one enum now would make the foundation own state it cannot interpret.

If `settlements-npcs-044` needs outpost construction phases, that plan should add them to the outpost/settlement domain record and persist them there.

## 12. Materialization and idempotency contract

Foundation-level idempotency:

```text
activate(id)
first call -> true / stored
later calls -> false / no mutation
```

Domain-level idempotency:

- concrete authored object IDs derive from stable consequence/definition IDs;
- materialization looks up/reconstructs the same domain record/object by stable id;
- mesh presence is not identity;
- settlement unload can dispose presentation and later rebuild it;
- save/load and `WorldBundle` rebuild must not allocate a new semantic identity.

A useful focused test fixture can materialize a fake plain domain object keyed by consequence ID, run the materialization twice, and assert one logical object. Do not create a production generic materializer solely for that test.

## 13. Recommended implementation order

1. Add world-domain definition + registry with pure unit tests for duplicate definitions, unknown id, idempotent activation and deterministic snapshot.
2. Add `SaveData` field, migration, validation and persistence tests.
3. Put the live registry on `WorldBundle`; thread initial active IDs through initial build and carry the same snapshot through `rebuildWorldBundle()`.
4. Add `buildSaveData()` snapshot from the live bundle owner.
5. Extend the existing quest effect union/dispatcher with the narrow injected activation callback and definition validation.
6. Add integration tests proving terminal outcome exact-once activation and that callback resolves the current bundle owner after rebuild.
7. Add a focused unloaded/deferred-materialization contract test at the smallest seam possible; do not build outpost content.

## 14. Files likely changed by world-031

Expected core changes:

```text
src/world/authoredWorldConsequences.ts              # new
src/world/authoredWorldConsequences.test.ts         # new
src/persistence/saveData.ts
src/persistence/saveData.test.ts
src/app/worldBundle.ts
src/app/saveState.ts
src/app/createApp.ts
src/quests/quests.ts
src/quests/QuestManager.ts
src/quests/QuestManager.test.ts
```

Potentially a focused app/worldBundle test if existing coverage is better placed there.

Do not edit these merely to force integration unless a real call-site requires it:

```text
src/settlement/settlementPlanCache.ts
src/settlement/villagePlan.ts
src/settlement/structureStateRegistry.ts
src/settlement/places.ts
src/world/locations/worldLocationCatalog.ts
```

They are reference seams/consumers for later plans, not the new owner.

## 15. Non-obvious pitfalls

- **Do not make `settlementPlanCache` save-aware.** Its persistent storage is disposable worldgen acceleration; consequence activation is gameplay history.
- **Do not replay quest effects during load.** Restore the registry snapshot directly; otherwise load semantics depend on current quest defs and effect execution order.
- **Do not store consequence definitions in SaveData.** Persist IDs only.
- **Do not expose a mutable Set from WorldBundle.** Domain callers receive a read API.
- **Do not put child-object state in the registry.** Building condition/progress, NPC state, inventory, schedules and livestock remain with their domain owners.
- **Do not force-load a remote target on activation.** Activation may happen off-screen; stream-in materialization is the intended path.
- **Do not use runtime creation order for IDs.** Authored IDs must be compile-time/content-stable.
- **Do not remove/reuse a released consequence ID casually.** If authored content identity changes after saves exist, treat it as a save migration/content-identity change.
- **Do not couple correctness to worldgen cache hits.** Clearing all worldgen caches must leave authored consequence state intact.
- **Do not create an event bus or universal materializer registry in V1.** The concrete domain plan owns its own reconciliation/materialization operation.

## 16. Contract check against planned consumers

### Wolf den → outpost

Works without extending world-031: a stable world/quest fact calls `activate(outpostId)`; later outpost domain logic reads it and owns construction + residents.

### Abandoned farm → inhabited farm

Works with the same activation state. Farm resident/livestock/inventory state is domain-owned after materialization and can persist independently.

### Ruin → road stop

Works when activation occurs with its chunk unloaded. Registry remains live; later normal chunk/world materialization sees the fact and creates the same stable road-stop object.

No scenario requires a shared phase enum, arbitrary payload, quest-local world state or a second settlement registry.

## 17. Verification guidance

Automated implementation verification should focus on:

- registry unit tests;
- save schema/migration round-trip;
- world rebuild carry-forward;
- exact-once quest effect dispatch;
- no duplicate logical materialization from repeated activation/rebuild;
- unknown definition IDs fail at validation/restore rather than silently creating orphan state.

Do not run browser verification for this foundation. Do not run `pnpm docs:sync`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
