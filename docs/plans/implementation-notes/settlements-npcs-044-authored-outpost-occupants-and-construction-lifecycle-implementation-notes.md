# Implementation Notes: Authored Outpost Occupants & Construction Lifecycle

**Plan:** `docs/plans/settlements-npcs-044-authored-outpost-occupants-and-construction-lifecycle.md`  
**Reviewed:** 2026-09-17  
**Codebase:** `main`

## Review outcome

The draft direction was correct but the word “outpost” was ambiguous. Current code has a procedural `VillageSize = 'OUTPOST'`, used for generated resource outposts, but that is **not** the right persistence/materialization model for a quest-created authored site. The authored site must not be inserted into `settlementPlanCache`, synthesized as a procedural `SettlementDef`, or represented only by a lightweight `Place`.

The correct V1 ownership is:

```text
world-031 consequence id
  -> activates authored site definition
  -> SettlementsManager-owned authored/founded settlement-site record
  -> existing world construction owners materialize stable target records
  -> existing NpcState/Household/Economy registries + live Settlement/NpcAgent runtime
```

Conceptually the authored outpost is a **small authored settlement-domain site**: it has a stable settlement-like identity and participates in the normal settlement streaming/NPC registries, but it is not a procedural `VillagePlan` settlement and is not the generated `VillageSize.OUTPOST` archetype.

This matches the already-reconned direction in `settlements-003-colony-bootstrap`: current `createSettlement()` is procedural-definition-shaped, while `SettlementsManager` is the long-lived owner that survives stream-out and owns `EconomyRegistry`, `HouseholdRegistry`, `NpcStateRegistry`, relationships and structure state. Reuse/extract the same narrow resident/runtime materialization seam rather than create an outpost-specific runtime.

`world-031` currently has no implementation-notes file. Its plan is nevertheless explicit enough for this dependency: it owns only persistent activation (`AuthoredWorldConsequenceId`), not construction/NPC/place state, and exposes an `isActive(id)`-style read seam to domain consumers.

## Architectural decisions

### 1. What the authored outpost is

Use a **settlement-domain authored site record**, owned by `SettlementsManager` (or the same founded/authored-site registry introduced by `settlements-003` if that plan lands first).

Do not use:

- `settlement/places.ts::Place` as the site owner — `Place` is a lightweight home/work/social routing target;
- `VillageSize.OUTPOST` as the persisted authored-site representation — it is a procedural worldgen size selected by `settlementGenerator.ts`;
- a synthetic `SettlementDef`/`VillagePlan` inserted into `settlementPlanCache` — that cache is deterministic/disposable worldgen;
- `WorldLocationCatalog` as mutable state;
- an `OutpostManager`.

A minimal authored-site record should contain only non-derivable site/membership metadata, approximately:

```ts
type AuthoredSettlementSiteRecord = {
  id: string
  authoredDefinitionId: string
  consequenceId: AuthoredWorldConsequenceId
  x: number
  z: number
  residentNpcIds: NpcId[]
  phase: 'construction' | 'active' // see completion section below
}
```

Prefer not to persist `phase` if implementation can make it fully derivable from required target completion; see §5. If a phase field is retained, it may only represent non-derivable lifecycle gating and must never duplicate target progress.

### 2. Stable outpost identity

The authored definition owns semantic identity. Derive the settlement-domain site id from the authored consequence/definition, e.g. a stable value in the `outpost:*` namespace.

No timestamp, creation-order, stream-order or display-name ids.

Child ids must be deterministic from the site id plus authored child key:

```text
outpost:<site>:palisade:<key>
outpost:<site>:torch:<key>
outpost:<site>:well:<key>
outpost:<site>:shelter:<key>
outpost:<site>:family:<key>
```

The concrete owner of each child keeps its own id/state. The site record does not copy work progress, repair state or material state.

### 3. Authored NPC identity

`src/settlement/npcIdentity.ts::settlementNpcId(settlementId, memberIndex)` is stable only when NPC membership is represented by a stable ordered settlement definition. Existing Lost Treasure authored residents work because they are appended to `SettlementDef.families` before `VillagePlan`/staffing; `appendAuthoredResidentFamily()` deliberately appends after generated families so existing flattened ids do not shift.

That exact generation-time injection path is **not** suitable for a runtime consequence because `world-031` activation is save-aware and may happen long after worldgen.

For the outpost, use explicit authored `NpcId`s from the authored site definition/occupant definition, or the shared explicit-resident seam extracted for founded settlements. The live runtime must accept an explicit stable `npcId` instead of recomputing `${settlementId}:npc:${index}`.

Do not parse identity from display names and do not allocate ids from runtime counters.

### 4. NPC authoritative state and duplicate prevention

`src/settlement/npcState.ts::NpcStateRegistry` remains the owner of mutable NPC state. It survives settlement unload/reload through `SettlementsManager`, and `snapshotNpcStates()` is already part of persistence/rebuild.

Materialization must be idempotent:

1. authored occupant definition resolves stable `NpcId`;
2. registry `getOrCreate`/equivalent returns the same authoritative state for that id;
3. live `NpcAgent` is recreated on each stream-in from the same id/state;
4. stream-out disposes runtime only;
5. save/load reconstructs registry state before live materialization;
6. no spawn guard may depend on a live mesh/agent existing.

### 5. `construction -> active` without duplicated progress

Every target keeps its own lifecycle:

- well -> `PlayerWellRecord`/`PlayerWells` + `wellRemainingWork()` / completion predicate;
- palisade -> `PalisadeSegmentRecord`/`Palisades` + `palisadeRemainingWork()` / `isPalisadeConstructionComplete()`;
- standing torch -> `StandingTorchRecord`/`StandingTorches` + `standingTorchRemainingWork()` / completion predicate;
- residential building -> `ResidentialBuildingRecord`/`ResidentialBuildings` + existing actor-neutral `contributeWork()` and completion state;
- terrain preparation -> `TerrainPreparationRecord`/`TerrainPreparations` + `terrainPreparationRemainingWork()` / persisted completion.

Use an outpost completion resolver that reads the authored definition’s **required target refs** and asks each actual domain owner whether the target is complete.

Preferred V1:

```text
active = every required target is complete
```

No aggregate numeric `workProgress`, no copied target stages, no copied repair state.

Persist an explicit `phase` only if a real non-derivable transition side effect must happen exactly once. If needed, it should be a small site-domain fact (`construction`/`active`) set after the resolver first becomes satisfied; it must not be used as a substitute for target completion queries. If no exactly-once side effect requires it, derive `active` directly.

### 6. Construction-site materialization

`world-031` says activation and physical materialization are separated. The authored outpost materializer should run from the settlement/world composition seam when the site becomes relevant, not force-load the region at activation time.

Materialization algorithm:

1. read static authored outpost definition;
2. check `consequences.isActive(consequenceId)`;
3. ensure the manager-owned authored-site record exists idempotently;
4. for every defined construction child, ensure the corresponding world-domain record exists under its stable child id;
5. do not overwrite an existing target’s progress/condition;
6. expose target refs to completion/work resolution;
7. create live settlement/NPC runtime only when normal streaming says the site is loaded.

This is the same “definition + sparse mutable state keyed by stable id” split already used throughout Seedvale.

### 7. Which construction targets are usable in V1

Confirmed Work Contract measurable target variants in `src/world/workContract.ts`:

```ts
'construction'
| 'terrain_preparation'
| 'palisade'
| 'standing_torch'
| 'residential_building'
```

The target remains sole owner of progress; `WorkContractRecord` stores only contract/assignment progress attribution.

Confirmed seams:

- `src/world/playerWell.ts`: `wellRemainingWork`, well completion/water predicates;
- `src/world/createPlayerWells.ts`: persistent well owner and actor-neutral work path;
- `src/world/palisade.ts`: `PalisadeSegmentRecord`, `palisadeRemainingWork`, completion predicate;
- `src/world/createPalisades.ts`: persistent segment owner / contribution API;
- `src/world/standingTorch.ts`: `StandingTorchRecord`, `standingTorchRemainingWork`, completion predicate;
- `src/world/createStandingTorches.ts`: persistent torch owner / contribution API;
- `src/world/residentialBuilding.ts` + `createResidentialBuildings.ts`: stable record identity and actor-neutral `contributeWork(id, amount)`; residential-building construction is already a Work Contract target;
- `src/terrain/terrainPreparation.ts` + `src/world/createTerrainPreparations.ts`: remaining-work and actor-neutral contribution;
- `src/world/workContract.ts`: target union and contract lifecycle;
- `src/world/createWorkContracts.ts`: live/persisted contract registry and assignment lifecycle;
- `src/app/actions/workContractActions.ts`: player-side target discovery/remaining-work resolution;
- `src/ai/NpcAgent.ts`: NPC work-contract execution for the measurable target variants.

Therefore V1 does **not** need a new generic shelter construction system. Prefer one existing `ResidentialBuildingRecord` as the shelter/home structure, provided its placement/materialization API can accept an authored stable id and explicit transform without inventing player-placement semantics. If the creator currently cannot materialize an externally-authored stable residential record cleanly, add the smallest creator seam; do not introduce `AuthoredShelterRecord`.

Likewise use standing torch rather than inventing a separate campfire construction target. A purely decorative campfire can still exist later, but it should not gate V1 completion unless it has a real owned lifecycle.

### 8. Minimum infrastructure for V1

Recommended required set:

- one small `residential_building` used as shelter/home anchor;
- 2-4 short palisade segments (small authored layout, not a procedural ring);
- 1 standing torch (or 2 only if layout needs both);
- optional well only when site placement/use case makes local water meaningful.

A well should not be mandatory for every authored outpost merely to make the composition look complete. If inhabitants need water and no nearby valid natural/settlement source exists, include it in that authored definition.

Terrain preparation is optional support for a target footprint, not automatically a player-visible required structure.

### 9. How workers should build

Do **not** make Work Contracts the authoritative outpost construction scheduler. Current Work Contracts are player-issued jobs (`employer: 'player'` today), use runtime-generated contract ids, notice-board advertisement and wage/payment lifecycle. They are excellent proof that the target seams are actor-neutral, but forcing every authored build through player employment would make the consequence depend on the player.

Use the same actor-neutral target APIs from a normal NPC construction assignment/pressure path. The smallest implementation should add an authored construction assignment/task descriptor at the settlement-domain site level that points to concrete target refs, then let `NpcAgent` perform the same travel/session/contribute calls as Work Contract execution.

Reuse/factor the target resolver from existing `NpcAgent` Work Contract construction rather than duplicate a switch for well/palisade/torch/residential/terrain targets.

Player Work Contracts may coexist and contribute to the same target because the target is authoritative, but the outpost must still be able to progress without a player-issued contract.

### 10. Who the builders are

Prefer temporary construction workers from an existing nearby settlement, then dedicated authored occupants after activation.

Reason:

- future occupants should not be forced to exist/live at an unfinished site solely to bootstrap their own shelter;
- normal settlement workers already have homes, households and lifecycle before the site exists;
- once required targets complete, dedicated occupants materialize into the active site and become ordinary residents.

V1 can use one or two selected existing adults with a Builder/worker-capable role through an authored construction assignment. Do not permanently change their residency. On completion their assignment ends and their ordinary schedule resumes at the source settlement.

If the implementation discovers an existing Builder-specific work planner already suited to external targets, use it. Otherwise add only the narrow authored assignment adapter over the shared actor-neutral contribution seam; do not build global settlement expansion AI.

### 11. Dedicated outpost occupants

Use a tiny authored household definition owned by the authored site definition, then materialize it through the explicit-resident settlement runtime seam.

Recommended V1 is **one household containing 1-2 adults**, not two separate singleton registries unless the story needs that. This keeps home/resource/social ownership aligned with existing `Household` semantics.

Use authored stable member ids and an authored stable household id. Do not reuse a generated family and do not reassign an arbitrary existing household permanently for this quest.

Role choice should match the site:

- default V1: `guard + woodcutter/worker` only if the second role has a valid local workplace/action;
- safer minimal V1: two guards if no off-settlement woodcutting workplace seam is available;
- do not add a new `outpost_guard` role.

### 12. Home, workplace, schedule and settlement membership

`src/settlement/places.ts` provides the normal `Place` contract. `homePlaceId()` and `workplaceFor()` currently assume normal settlement landmarks and role-specific mappings. In particular guards map to the settlement well as the current generic workplace/patrol anchor.

Therefore the authored-site runtime adapter must provide explicit `Place` values for occupants instead of pretending the authored site has a complete `SettlementLandmarks`/`VillagePlan`.

Reuse the same `NpcAgent` constructor/runtime fields:

- `home: Place` from the authored residential shelter/home anchor;
- `workplace: Place | null` from authored site role anchors;
- ordinary schedule object/policy;
- settlement id / household id via the shared resident descriptor;
- normal `NpcAuthoritativeState`.

For guards, use a site-local guard workplace/patrol anchor derived from the authored site definition or completed infrastructure. Do not call `workplaceFor(..., 'guard', fakeLandmarks, ...)` with fabricated landmarks.

If current guard patrol logic is hard-wired to standard settlement landmarks/boundary, factor the smallest generic “guard duty area/anchor” input used by both procedural and authored runtime. The plan must not create a second guard AI.

### 13. Threat response

Threat response is already inside the normal `NpcAgent`/loaded-settlement update path and receives nearby threatening animals through `SettlementsManager.update()` -> `Settlement.update()` -> `NpcAgent.update()`.

Therefore outpost guards work correctly only if the authored site is materialized as the same live settlement/NPC runtime and included in normal streamed-settlement updates. A `Place` plus freestanding `NpcAgent`s outside that lifecycle would miss important integration.

No outpost-specific threat loop.

### 14. Household/economy/storage scope

V1 should create/reuse a normal `Household` for the dedicated occupants because home ownership, personal household resources and several work paths assume it.

A settlement `EconomyRegistry` entry may be created if the shared settlement runtime requires it, but V1 does not need a bespoke outpost economy or stock simulation. Use the existing registry with minimal/empty authored-site stock.

Do not add dedicated storage unless the selected resident role requires an existing storage endpoint. No new outpost storage system.

### 15. Streaming

Current `SettlementsManager` procedural discovery is grid-driven (`cellsWithinRadius` + `settlementDefFor`). An authored site outside that grid path must be checked separately by stable stored center, exactly like the `settlements-003` recon already recommends for founded settlements.

Reuse the same `Entry`/`ensureLoaded` lifecycle after extracting a shared settlement runtime spec:

```text
manager-lifetime authored site record
  -> distance check
  -> ensureLoaded(authored runtime spec)
  -> live Settlement / NpcAgent instances
  -> distance > unload radius
  -> dispose live runtime only
  -> registries/site/world target records remain
```

Expected authored-site count is tiny; a bounded linear scan is sufficient. No spatial index and no separate streamer.

### 16. Save/load and WorldBundle rebuild

Outpost continuity is split across existing owners:

- world-031 registry -> activation id;
- authored settlement-site registry -> site identity + non-derivable residency/lifecycle binding;
- `NpcStateRegistry` -> NPC mutable personal state;
- `HouseholdRegistry` -> household resources/home binding;
- existing world target registries -> well/palisade/torch/residential/terrain progress and condition;
- optional existing settlement economy registry -> stock;
- Work Contracts -> only player-issued contract state if the player created one.

Thread only the new authored-site record/bindings through the existing `WorldBundle`/`SaveData`/`saveState.ts` snapshot pattern. Do not serialize target progress into the authored-site record.

On reload/rebuild, reconstruct registries first, then authored-site streaming reads them and creates live runtime only if relevant.

## Existing precedent files to inspect during implementation

### Authored generated residents

- `src/settlement/lostTreasureChroniclesElderResident.ts`
- `src/settlement/lostTreasureChroniclesArchaeologistResident.ts`
- `src/settlement/lostTreasureChroniclesSpecialistResident.ts`
- `src/settlement/settlementPlanCache.ts`
- `src/settlement/npcIdentity.ts`

Take from these only authored deterministic identity/profile conventions. Do not mutate runtime consequence state into `settlementPlanCache`.

### Settlement runtime / residency / persistence

- `src/settlement/SettlementsManager.ts`
- `src/settlement/createSettlement.ts`
- `src/settlement/household.ts`
- `src/settlement/npcState.ts`
- `src/settlement/places.ts`
- `src/app/worldBundle.ts`
- `src/app/saveState.ts`
- `src/persistence/saveData.ts`
- `docs/plans/implementation-notes/settlements-003-colony-bootstrap-implementation-notes.md`

If `settlements-003` lands first, reuse its authored/founded settlement record, residency override and shared resident/runtime seam rather than implementing parallel equivalents.

### Construction and work

- `src/world/workContract.ts`
- `src/world/createWorkContracts.ts`
- `src/app/actions/workContractActions.ts`
- `src/ai/NpcAgent.ts`
- `src/world/playerWell.ts`
- `src/world/createPlayerWells.ts`
- `src/world/palisade.ts`
- `src/world/createPalisades.ts`
- `src/world/standingTorch.ts`
- `src/world/createStandingTorches.ts`
- `src/world/residentialBuilding.ts`
- `src/world/createResidentialBuildings.ts`
- `src/terrain/terrainPreparation.ts`
- `src/world/createTerrainPreparations.ts`

`WorkContract.scope.target` and the target registries are the reference identity/contribution contracts. Factor common target resolution if needed; do not fork it for authored construction.

## Recommended implementation order

1. **Authored site contract + identity** — static definition and minimal manager-owned persisted site record; world-031 activation read seam; no visuals/NPCs yet.
2. **Shared settlement resident/runtime seam** — reuse `settlements-003` if present; otherwise extract explicit resident/home/workplace descriptors below procedural `SettlementDef` materialization while keeping procedural behavior identical.
3. **Stable construction materialization** — ensure well/palisade/torch/residential/terrain records from authored child definitions using stable ids; idempotency tests.
4. **Completion resolver** — read real owners only; active is derived unless an exactly-once site transition fact is genuinely required.
5. **NPC construction assignment adapter** — point existing nearby workers at concrete actor-neutral targets; factor common target executor from Work Contract execution if necessary.
6. **Occupant activation** — create/reuse authored household, stable authored residents and explicit home/work Places once required targets complete.
7. **Streaming/persistence integration** — authored site participates in `SettlementsManager` load/unload and `WorldBundle` save/rebuild.
8. **Debug/inspection** — expose plain-data authored-site inspection: id, consequence id, materialized target refs/completion, derived phase, resident ids, loaded/unloaded state. Extend existing world/NPC inspection surface rather than add an outpost debug manager.

## Tests to add

Focused automated coverage must prove:

- activation absent -> no authored site/targets;
- activation present -> one site record and one set of stable target ids;
- repeated materialization/stream-in/rebuild -> no duplicates;
- every required physical target is the authoritative existing record type;
- aggregate completion changes only when real required targets complete;
- player and NPC contributions hit the same target state;
- NPC worker assignment can progress construction without a player-issued Work Contract;
- temporary builders retain source settlement residency and resume normal schedule after assignment;
- dedicated occupant ids are stable and authored;
- occupant household is created once;
- active-site live NPCs receive normal `NpcAgent` needs/schedule/combat/threat paths;
- stream-out destroys live agents but retains NPC/household/site/target state;
- stream-in recreates the same `NpcId`s and reads the same authoritative state;
- save/load + `WorldBundle` rebuild preserve activation, construction state, site binding and NPC identities;
- procedural settlements and generated `VillageSize.OUTPOST` behavior remain unchanged;
- no synthetic `SettlementDef` enters `settlementPlanCache`;
- no construction progress is copied into the authored-site record.

Manual/browser verification belongs to the player, not the AI implementation agent.

## Important dependency interaction

`world-031` should be implemented first. This plan expects only:

```ts
isActive(consequenceId): boolean
```

plus the persisted activation lifecycle specified there. Do not make this plan depend on a generic materializer dispatcher from world-031; the outpost consumer belongs in settlements/world composition.

If `settlements-003` is implemented before this plan, reconcile and reuse its shared founded/authored settlement runtime contracts before coding. The two plans should converge on one manager-owned non-procedural settlement-site mechanism, not ship two parallel registries.

## Guardrails for implementation agent

- no `OutpostManager` / `OutpostNpcRegistry` / outpost-only streamer;
- no synthetic `VillagePlan` or `SettlementDef` for the authored site;
- no mutation of `settlementPlanCache` from save/gameplay state;
- no quest-owned resident, schedule, work or construction progress;
- no copied target work/repair state;
- no runtime-generated ids for authored site/children/NPCs/household;
- no player/camera dependency for construction continuity;
- no scripted standing guard after activation;
- no new shelter domain while residential building is reusable;
- no full settlement-growth/economy/garrison framework.

Add JSDoc with `@domain settlements-npcs` to the new public authored-site/resident/materialization contracts and to any extracted shared settlement-runtime seam that should be discoverable by preflight.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
