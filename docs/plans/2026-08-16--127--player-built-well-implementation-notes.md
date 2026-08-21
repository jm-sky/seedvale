# Plan 127 — Player-Built Well — Implementation Notes

> Review against the current codebase and the implementation notes for plan 122. These notes refine implementation details for an agent; the plan itself is intentionally unchanged.

## 1. Review verdict

Plan 127 has the right boundary: one concrete player-built structure that becomes a normal `WaterSource`. The implementation should **extend the existing water, interaction, placement, inventory and world-lifecycle mechanisms** rather than introduce a player-building subsystem.

The most important architectural constraint is:

```text
player-built well
      ↓
existing world structure state
      ↓
completed well → existing WaterSource
      ↓
existing water interaction / NPC water logistics
```

Do not create `PlayerWellWaterSystem`, `WellManager`, a second water-source abstraction, a generic building framework, or a second placement system.

The plan 122 notes are especially important here: `WaterSource` is deliberately data-only, while the actual player inventory/need mutation remains in `gameLoop.ts`. fileciteturn9file0L2-L2

## 2. Current code anchors

Before changing code, inspect these concrete boundaries first:

- `src/world/WaterSource.ts` — canonical water-source contract. It currently supports `kind: 'well' | 'lake'` and `quality: 'safe' | 'unsafe'`; `createWaterSource('well')` is the correct semantic representation of a completed well. fileciteturn9file0L2-L2
- `src/app/interactables.ts` — existing player interaction candidate assembly and water prompt. The existing water interaction already exposes `[E]` drink and `[R]` fill waterskin; reuse this path rather than registering a new well input mechanism. fileciteturn16file0L2-L2
- `src/app/gameLoop.ts` — existing water interaction is intentionally where `Inventory` / player-need mutation happens; keep that ownership boundary from plan 106/122. `WaterSource` itself should remain data-only. 
- `src/ai/NpcAgent.ts` — canonical NPC behaviour integration point. It already imports `Inventory`, the shared `PlannedAction`/`ActionLifecycle`/`DecisionContext` contracts, tree harvesting and mining APIs; extend those existing action paths rather than adding a well-specific NPC controller. fileciteturn13file0L2-L2
- `src/settlement/household.ts` + the household registry — simulation-owned household state from plan 069/122. Water reserve must live with household simulation state, not in a Three.js prop.
- `src/terrain/chunkManager.ts` and existing terrain height sampling — use the same world/chunk terrain sampling already used by placement and NPC navigation.
- `src/settlement/props.ts` — existing settlement/world prop placement helpers, including ground placement. Reuse them where applicable rather than inventing another terrain-alignment helper.
- `src/items/createPlacedTents.ts` — useful existing precedent for player-placed persistent world objects: compact `{id,x,z,yaw}` records, `place`, `nodes`, reconstruction on load, and explicit disposal. Do not copy it wholesale; reuse its ownership/persistence pattern where it fits. fileciteturn18file0L2-L2
- `src/interaction/Interactable.ts` + `src/app/interactables.ts` — existing generic interaction model; a well stage should become a normal candidate instead of a separate interaction subsystem. fileciteturn7file1L7-L10
- `src/settlement/houseBuilder.ts` / `ConstructionCatalog` — existing construction/assembly code is a precedent for asset composition and collision-related measurements, but it is **not** evidence that a generic player construction framework exists. Do not couple plan 127 to the house-builder implementation merely because both are “construction.” fileciteturn14file0L2-L2

## 3. State ownership

The saved/runtime source of truth should be the well construction record, not its rendered mesh and not a separately persisted `WaterSource`.

Recommended minimal shape, matching the plan:

```ts
type PlayerWell = {
  id: string
  type: 'well'
  x: number
  y: number
  z: number
  rotationY: number
  stage: 'pit' | 'well' | 'roof'
  stageStartedAt: number
}
```

If the existing project persistence convention stores only `x/z` and derives `y` from terrain, prefer that convention. The important rule is that the record contains enough information to reconstruct the structure deterministically.

Do **not** store:

- a second `waterSource` record,
- current water quantity on the mesh,
- an `Object3D` reference,
- NPC/household water state inside the well record.

For a completed record, the runtime world representation should expose a `WaterSource` derived from `stage === 'roof'`.

## 4. WaterSource integration — critical

The existing abstraction is intentionally small:

```text
WaterSource
  kind: well | lake
  quality: safe | unsafe
```

A completed player well should therefore be represented by the existing `createWaterSource('well')`. There is no reason to add `playerWell: true`, `sourceId`, `capacity`, or a parallel `PlayerWaterSource` type unless a concrete existing consumer proves it is required.

The important distinction is:

```text
PlayerWell record = persistent world structure
WaterSource       = capability exposed by completed structure
```

If the NPC logistics implementation from plan 122 needs to identify the physical source, add the smallest source-location/reference data required by that existing resolver. Do not change `WaterSource` into a registry or manager.

## 5. How NPC discovery should work

Plan 122 explicitly establishes the intended architecture: water should be the first complete gathering/transport path and NPCs should use existing `PlannedAction`, `ActionLifecycle`, `DecisionContext`, movement and decision scoring. The player-built well should simply become another candidate source.

Target:

```text
household water shortage
        ↓
existing NPC decision scoring
        ↓
find usable WaterSource
        ↓
completed player well
        ↓
goTo / gather action
        ↓
existing carrying state
        ↓
existing household water transfer
```

Avoid:

```ts
if (playerBuiltWell) { ... }
```

inside NPC behaviour. The useful extension point is the existing source query/selection used by plan 122.

The plan 122 implementation notes explicitly require reuse of the existing NPC action architecture and warn against `ResourceGatheringManager` or another FSM. Keep that rule here as well.

## 6. Source discovery and chunking

Do not make every NPC scan every player-built structure globally every decision tick.

Prefer the same bounded/local discovery strategy used by the existing simulation:

1. identify the NPC's household/settlement context;
2. query nearby/local water candidates;
3. include natural water sources according to the existing resolver;
4. include completed player wells that are spatially available;
5. score/select deterministically using the existing decision mechanism.

If the current plan-122 implementation has a concrete resolver for water candidates, extend that resolver. If it does not, first inspect the exact source-selection implementation before creating anything new.

A well that is streamed out must not disappear from simulation merely because its mesh is unloaded. The persistent construction record is the source of truth; runtime source/interaction registration should follow chunk lifecycle.

## 7. Construction stages should be state transitions, not animations

The three visible stages should be represented by one authoritative stage enum:

```text
pit → well → roof
```

`stageStartedAt` is enough to calculate whether the current stage's world-time duration has elapsed.

Do not run a per-frame construction timer. Evaluate stage completion when the structure is inspected, interacted with, or during an existing world/simulation tick where construction state is already updated.

Suggested transition invariant:

```text
stage === 'pit'  → pit visual only
stage === 'well' → pit + well visual composition
stage === 'roof' → completed visual + WaterSource
```

When a stage completes, persist the new stage before exposing its next-stage interaction. Avoid a transient state where the mesh says `roof` but the saved/runtime state still says `well`.

## 8. Time calculation

Use the existing world-time representation. Do not introduce `setTimeout`, `setInterval`, real-time timestamps or a construction-specific clock.

The duration constants should be named and centralised near the well construction logic, for example:

```ts
WELL_STAGE_DURATION_DAYS = {
  pit: 1,
  well: 1,
  roof: 0.5,
}
```

The exact representation should follow the existing world-time API rather than assuming that “one day” is a particular number of seconds.

For a paused/interrupted build:

```text
stageStartedAt remains unchanged
      ↓
player leaves
      ↓
world continues
      ↓
player returns
      ↓
existing elapsed-world-time check completes stage
```

No background real-time process is needed.

## 9. Materials and inventory

Use existing `Inventory` and existing `ItemKind` definitions for shovel, stone and wood. The plan explicitly says the shovel is a required tool and is not consumed.

Before adding any item kind, verify the item catalog. The project already has central item definitions/catalogues; do not create construction-only material identifiers.

Material consumption should happen **only when the stage actually starts** and only after all validation succeeds:

```text
validate placement
validate stage
validate tool
validate materials
        ↓
consume materials atomically
        ↓
set stageStartedAt
        ↓
persist state / update world
```

Never consume materials before placement validation or if the stage is already running.

## 10. Shovel interaction

`src/app/interactables.ts` already imports dig-related terrain helpers and builds synthetic interaction candidates for shovel operations. This is the correct area to inspect when implementing the first “dig pit” interaction. fileciteturn16file0L2-L2

Do not introduce a second shovel input path.

The well's pit operation may share the existing shovel/tool validation and interaction conventions, but it should not pretend to be ordinary terrain digging if the resulting pit is a persistent construction state. The persistent well record must remain authoritative.

## 11. Placement

The repository has player-placed world-object precedent: `PlacedTent` stores only compact world placement data and reconstructs its mesh using the terrain sampler. fileciteturn18file0L2-L2

Use the same general ownership pattern for the well:

```text
placement input
  ↓
validate location
  ↓
create persistent well record
  ↓
spawn stage representation
```

The placement validator should reuse existing terrain/collider/spatial helpers wherever available.

Minimum checks from the plan:

- terrain slope/height suitability,
- collision/overlap with existing structures,
- minimum spacing from other wells/structures,
- required local placement conditions.

Do not build a general-purpose grid or placement framework for this feature.

### Important distinction

A settlement house's assembly/collision code is not the same thing as player placement. `houseBuilder.ts` is an assembly layer over `ConstructionCatalog`; it should be used only for asset/assembly precedents, not as a reason to make the well depend on settlement house definitions. fileciteturn14file0L2-L2

## 12. Collision and NPC approach

The well must not become an obstacle that NPCs cannot reach.

The current `NpcAgent` already has explicit collider-approach handling and comments referring to the well collider/serving stand. fileciteturn13file0L2-L2

Before adding a new collider, inspect the existing collider registry and determine whether the well's completed/physical representation can register through the same mechanism.

Preferred result:

```text
well collider
    ↓
existing collision registry
    ↓
NPC destination/path/approach logic
```

Do not add well-specific avoidance logic to `NpcAgent`.

Also ensure the interaction/service point is reachable without requiring the NPC to enter the physical well volume.

## 13. Visual assembly

The three stages can use separate model parts or a composed asset, but runtime state should remain one structure.

Preferred lifecycle:

```text
stage change
   ↓
dispose old stage-only representation if needed
   ↓
build current representation
   ↓
register interaction/collider/source capabilities
```

Once `roof` is complete, the structure is effectively static. Do not animate construction every frame.

If the same GLB parts are reused by many wells later, use the existing asset loading/preparation and sharing conventions. Do not introduce a well-specific render manager.

## 14. Interaction model

`buildInteractables()` is already the aggregation point for world interaction candidates, including the existing well/lake water prompt. fileciteturn16file0L2-L2

The well should therefore expose stage-specific actions through the same `Interactable` mechanism:

```text
pit started / available → continue pit/build interaction
well stage              → build roof / continue interaction
roof completed          → existing water interaction
```

Do not add a `WellInteractionManager` or a separate keybinding.

For the completed well, prefer to feed the existing water-source candidate/interaction path rather than creating a special “player well” prompt. The user should see the same drinking/filling behaviour as any other safe well.

## 15. Persistence and streaming

Use the same distinction established by plan 122:

```text
runtime streaming persistence ≠ SaveData persistence
```

A well must survive chunk unload/load by reconstructing from its persistent world-state record. It must survive save/load only if the project's `SaveData` path is explicitly extended for it.

The implementation should have one restore path:

```text
record
  ↓
validate/normalise
  ↓
spawn current stage
  ↓
register current capabilities
```

Do not have one code path for “new well” and another subtly different code path for “loaded well.” Factor the stage reconstruction into a shared function.

For a completed well:

```text
record.stage === 'roof'
        ↓
spawn completed representation
        ↓
register as WaterSource candidate
```

This also prevents duplicate `WaterSource` registration after stream rebuilds.

## 16. Avoid duplicate WaterSource registration

This is a likely implementation trap.

The well record should be the stable identity:

```text
well.id
```

If the current water-logistics implementation needs a runtime source collection, registration should be idempotent by `well.id` and tied to chunk lifecycle. Rebuilding the same chunk must replace/reuse the runtime representation, not append another source.

Do not solve duplication by deduplicating every water source globally after the fact. Fix ownership at registration.

## 17. Household water integration

The end-to-end gameplay value is the plan-122 flow:

```text
completed player well
        ↓
WaterSource
        ↓
NPC water gathering
        ↓
existing NPC carrying/action lifecycle
        ↓
Household water reserve
```

Keep household economic stock separate. Plan 122 explicitly warns not to blindly make water an `EconomicKind`; water storage is a separate household state. Reuse that implementation if it is already present.

The well does not know which household uses it and does not directly mutate household water. The NPC logistics action performs the transfer.

## 18. Natural resources and materials

Stone/wood consumption must use the existing item/resource model. Do not create a “construction material” economy.

If the plan needs gathering before construction, use the already existing natural-resource gathering/item paths. Do not add a special “gather construction resources” action.

The well is a consumer of resources, not another resource system.

## 19. Recommended file ownership

Prefer a small, explicit module such as:

```text
src/world/playerWell.ts
```

only if no existing module is a better home.

Its responsibility should be limited to persistent well state, stage transition rules, validation helpers and stage representation lifecycle. It should not own:

- player input,
- NPC decision making,
- household water,
- generic inventory management,
- global save orchestration,
- generic placement,
- generic rendering.

Wire it from the existing application/world lifecycle modules that already own those concerns.

Before creating a new module, search for an existing player-placed structure module that can naturally own it. The goal is one new well-specific state module at most, not a framework.

## 20. Suggested implementation order

1. **Audit exact current APIs**: NPC water gathering from plan 122, household water state, player water interaction, placement helpers, collision registry, SaveData and chunk lifecycle.
2. **Define persistent well record** and stage transition helpers.
3. **Implement placement validation** using existing terrain/collision/spacing helpers.
4. **Implement pit stage** using existing shovel/tool/inventory conventions.
5. **Implement `pit → well → roof` world-time transitions** without real-time timers.
6. **Build stage visuals** and register/dispose them through existing world/chunk lifecycle.
7. **Expose completed well through existing `WaterSource`/interaction path**.
8. **Connect NPC discovery** by extending the existing plan-122 water-source candidate path, not by adding well-specific AI.
9. **Connect household water transfer** through the existing NPC carrying/action architecture.
10. **Add persistence/stream restore** using one reconstruction path.
11. **Add focused unit tests** for state transitions, material consumption, placement validation and idempotent restore.
12. **Run browser end-to-end verification** because the feature is spatial, interactive and Three.js-rendered.

## 21. Tests worth writing

At minimum:

- placement rejects invalid slope;
- placement rejects collision/spacing violation;
- valid placement creates stable ID;
- shovel is required but not consumed;
- missing stone/wood prevents start and does not consume partial cost;
- starting a stage consumes exactly its materials once;
- stage cannot be advanced before elapsed world time;
- leaving/re-entering preserves stage and elapsed time;
- `pit → well → roof` is deterministic;
- only `roof` exposes a completed `WaterSource`;
- restoring a completed well creates exactly one runtime source;
- stream rebuild does not duplicate source/interaction/collider;
- save/load round-trips the construction state if SaveData is extended;
- completed well remains discoverable to the existing NPC water-source logic;
- no well-specific NPC behaviour branch is required.

## 22. Browser verification priority

The most valuable manual test is one continuous scenario:

```text
place well
  ↓
dig pit
  ↓
wait/advance world time
  ↓
build well
  ↓
wait/advance world time
  ↓
build roof
  ↓
[E] drink / [R] fill waterskin
  ↓
NPC household has water shortage
  ↓
NPC discovers completed well
  ↓
NPC walks to it
  ↓
NPC gathers water
  ↓
NPC returns to household
  ↓
household water reserve increases
```

Also test:

- player walks away and returns during each stage;
- chunk unload/load while the well is incomplete;
- chunk unload/load after completion;
- save/load after each stage, if persistence is implemented;
- multiple wells in the same area;
- NPCs using a player-built well alongside natural water;
- no duplicate interaction prompts;
- no duplicate water-source candidates;
- no NPC pathing failure caused by the well collider;
- disposal/rebuild does not leak meshes or colliders.

## 23. Common agent mistakes to avoid

- Creating `PlayerWellWaterSystem` instead of extending `WaterSource`.
- Creating `WellManager` because there is more than one well.
- Adding a second interaction/input path instead of using `buildInteractables()` and existing water handling.
- Putting household water quantity on the well mesh.
- Making `WaterSource` persistent state instead of deriving it from the completed structure.
- Adding `if (playerBuiltWell)` branches to NPC AI.
- Giving NPCs a separate well-gathering FSM.
- Creating a generic `BuildingSystem` during this plan.
- Reusing house assembly code as a generic player-placement system.
- Using real-time timers for construction.
- Scanning all wells every frame.
- Registering the same well as a new source after every chunk rebuild.
- Claiming SaveData persistence merely because the runtime structure survives streaming.

## 24. Short path for the implementing agent

Read these first and stop broad exploration once the concrete APIs are known:

1. `docs/plans/2026-08-15--122--natural-resource-gathering-and-water-distribution.md`
2. `docs/plans/2026-08-15--122--natural-resource-gathering-and-water-distribution-implementation-notes.md`
3. `src/world/WaterSource.ts`
4. `src/app/interactables.ts`
5. `src/app/gameLoop.ts`
6. `src/ai/NpcAgent.ts`
7. `src/settlement/household.ts`
8. the actual plan-122 water gathering/action implementation
9. the existing player-placed object persistence/lifecycle code (`createPlacedTents.ts` is a useful precedent)
10. terrain/collider placement helpers and the current SaveData/chunk restore path

The implementation should fit into these existing boundaries. If an apparently necessary new abstraction does not fit one of them, first verify whether the current code already has the required capability before creating it.

## 25. Addendum (2026-08-21) — §7/§8 superseded: active work, not elapsed time

§7 ("Construction stages should be state transitions, not animations") and §8 ("Time calculation") above describe evaluating stage completion from `stageStartedAt` + elapsed world time — this turned out to be the wrong model and **no longer applies**. World time advances every frame regardless of the player, so an elapsed-time gate let a stage finish whether or not the player ever did anything. `stageStartedAt` has been removed from `PlayerWellRecord` entirely; there is no "construction clock" any more.

The corrected model (see the plan's own "Revision (2026-08-21)" section for full detail): each stage carries a `workProgress` field (hours of *active* player work, only incremented while a well-work busy-channel session — `app/actions/placementActions.ts`'s `workOnWell` — is actually running). §9's "validate → consume atomically → start" ordering is unchanged and still correct, except "start" now means "start a work session," not "start a timer." §16's idempotent-by-id collider/mesh registration is unchanged.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
