# Plan 127 — Player-Built Well — Updated Review

**Reviewed:** 2026-08-19
**Status:** `reviewed` 🔎
**Decision:** **UPDATE**

> Review against the current `main` repository state. The planning map indexes Plan 127 as `2026-08-16--127--player-built-well.md`, while the requested `2026-08-17` filename is not present in the repository. The implementation notes are also stored as `2026-08-16--127--player-built-well-implementation-notes.md`. This review therefore uses the indexed Plan 127 plus those implementation notes as the authoritative Plan 127 material.

## 1. Executive verdict

Plan 127 is still a good feature and its architectural boundary remains correct: a player-built well should become another normal water source, not introduce a new water system.

However, the plan should be **updated before implementation** because several assumptions are now stale or underspecified:

1. **Plan 122 is no longer merely a prerequisite plan.** Its water logistics are implemented and Plan 156 is `done`; Plan 127 should extend the already-landed water transport/source-selection path rather than describe it as future work.
2. **Household water already has a concrete owner:** `Household.water` / `WaterReserve`. The well must never own water quantity or directly mutate household state.
3. **Plan 156 established generic gather → carry → deposit logistics for water.** A completed player well should enter that existing source-selection path; no well-specific NPC behaviour is needed.
4. **The settlement already has a physical well landmark.** Plan 127 adds player-built wells in addition to that infrastructure; it must not replace or duplicate the settlement well representation.
5. **SaveData is now v19 and inventory supports both stackable counts and item instances.** A well's construction record should be a new world-persistent record and should require a save migration, most likely v20. Stackable construction materials remain count-based; do not introduce item instances for wood/stone merely because Plan 155 added instances for stateful items such as traps.
6. **There is still no generic player-building/placement manager.** Existing placed tents, fires and traps remain the right architectural precedent. Plan 164's future generic `Container` system is not a prerequisite for the well.
7. **Player survival needs are already separated behind `PlayerNeeds`.** Future Plan 165 changes the consequences of hunger/thirst, but does not change the well's ownership model. Plan 127 should call existing water/need APIs only where player interaction is concerned.

The result is not a rethink. The core idea survives, but the implementation plan needs to be rewritten around the systems that are already implemented.

## 2. Repository truth and plan-date discrepancy

The current planning map explicitly lists Plan 127 as:

```text
2026-08-16--127--player-built-well.md
```

and describes it as a physical player-built well depending on Plan 122. The map also shows the current chain:

```text
(122) → 126 seed planting, 127 player-built well
```

The repository does not contain the requested `2026-08-17--127-player-built-well.md`; the implementation notes are likewise dated `2026-08-16`.

This is documentation naming drift, not an architectural blocker. The updated review is deliberately written to the requested `2026-08-17...--updated-review.md` path while identifying the actual indexed Plan 127 path.

## 3. Current water model

`src/world/WaterSource.ts` remains intentionally small:

```ts
type WaterSource = {
  kind: 'well' | 'lake'
  quality: 'safe' | 'unsafe'
}
```

`createWaterSource('well')` produces the canonical safe well representation. `WaterSource` is data-only; player inventory/need mutation remains outside it. This part of the original implementation notes is still correct.

Therefore the target remains:

```text
PlayerWell persistent record
        ↓
completed stage
        ↓
WaterSource(kind='well')
        ↓
existing water interactions / NPC water logistics
```

Do **not** add:

- `PlayerWaterSource`;
- `playerBuiltWell` flag to `WaterSource`;
- water capacity/quantity to `WaterSource`;
- a global `WaterSourceManager` merely for this feature.

The only likely extension to source data is whatever stable world identity/location the already-existing NPC source resolver requires. Prefer extending that resolver rather than changing the basic `WaterSource` contract.

## 4. Existing settlement well — important boundary

The settlement system already has a physical well landmark:

```ts
SettlementLandmarks.well: THREE.Vector3
SettlementLandmarks.wellProp?: THREE.Object3D
```

and the settlement prop system already creates a well visual using the existing well asset/procedural fallback.

This means Plan 127 must explicitly distinguish:

```text
Settlement infrastructure well
    = existing static settlement landmark

Player-built well
    = new persistent player-owned world structure
```

The player-built well must not be implemented by mutating `SettlementLandmarks.well`, nor by adding another settlement well to the same landmark slot.

The existing settlement well should remain a valid water source. Player-built wells are additional source candidates.

## 5. Household water ownership

`src/settlement/household.ts` now has a concrete `WaterReserve`:

```text
Household
 ├── stock       → food / wood
 └── water       → authoritative household water reserve
```

The water reserve has `current`, `capacity`, `has()`, `shortage()`, `shouldFetch()`, `add()` and `remove()`.

The physical `WaterBarrel` / `AnimalTrough` presentation is explicitly not authoritative; both represent the same household reserve.

Therefore Plan 127 must keep this ownership invariant:

```text
PlayerWell
    ↓ provides source
NPC carrying/action
    ↓ transfers water
Household.water
    ↓ consumed by existing household consumers
```

Never:

```text
PlayerWell.water
```

and never:

```text
PlayerWell → Household.water.add()
```

The well only makes water available. The existing NPC logistics action owns the transfer.

## 6. Plan 122 and Plan 156 changed the dependency picture

Plan 122 established the water distribution architecture and is now a load-bearing implemented foundation. Plan 156 is marked `done` and explicitly confirms that the generic transport contract already works for water:

```text
source
  ↓
NPC carrying
  ↓
destination
  ↓
deposit
```

The implementation notes for 156 specifically report that water uses the existing chained `NpcPlannedAction` flow and that the water destination is the household's existing water reserve.

Therefore the old Plan 127 wording should not say "implement NPC water gathering" as though a new water logistics path must be created.

The correct extension point is:

```text
existing water source discovery / selection
        ↓
add completed player wells as candidates
```

followed by the already-existing gather → carry → deposit action chain.

There should be no:

- `PlayerWellNpcController`;
- `WellWaterDuty`;
- second water queue;
- second carrying system;
- special `if (playerBuiltWell)` branch in generic NPC actions.

## 7. Water source discovery is now the critical API question

The original notes correctly anticipated that the exact Plan-122 resolver should be inspected before creating anything new. That is now the most important implementation audit item.

The updated plan should name the actual current resolver/function used by `NpcAgent` for water duty/source selection once confirmed during implementation.

The desired architecture is:

```text
household.water.shouldFetch()
        ↓
existing NPC decision / water duty
        ↓
existing candidate/source resolver
        ├── settlement well
        ├── natural valid water source
        └── completed player-built well
        ↓
existing gather action
        ↓
existing carrying
        ↓
Household.water.add()
```

Do not make NPCs scan a global list of all player wells on every decision tick. Use the same bounded/local discovery strategy already used by the current water logistics implementation.

## 8. Player placement — current reality

The repository has several concrete persistent world-object precedents:

- `PlacedTent` stores compact placement records and reconstructs its world representation;
- `PlacedFire` has persistent world state and lifecycle wiring;
- `PlacedTrap` has a stable world record and persistence;
- `WorldBundle` owns these systems together with the rest of the world lifecycle.

There is **not** a generic player placement framework that Plan 127 should depend on.

Plan 134's item-placement architecture is also not a generic permanent-structure placement system. It distinguishes settlement item spawns, deterministic chunk items and dropped items.

Plan 164 proposes a future generic `Container` system with placement/persistence, but it is currently `planned` and is not required for a well.

Therefore the correct rule remains:

```text
well placement
  ↓
reuse existing terrain / collider / spatial helpers
  ↓
create well-specific persistent record
```

Do not wait for Plan 164 and do not create a generic placement framework as part of Plan 127.

## 9. Persistent well state

The implementation-notes proposal remains fundamentally appropriate:

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

But the shape should be adjusted to current persistence conventions after inspecting the existing placed-object records.

Prefer `x/z/yaw` when `y` can be deterministically derived from the terrain sampler, as existing placed-tent persistence does. Store `y` only if a concrete current placement contract requires it.

The record should contain:

- stable identity;
- placement transform required for deterministic reconstruction;
- construction stage;
- world-time stage start needed to resume construction;
- no rendered object references;
- no household ownership;
- no water quantity;
- no derived `WaterSource` record.

## 10. Save/load — now a concrete requirement

Current `SaveData` is v19. It already persists several player-built world objects, including fires, tents and traps, and it now persists inventory instances from Plan 155.

A player-built well cannot be considered complete unless its persistent construction record is added to SaveData.

Recommended shape:

```text
SaveDataV20
  placedWells: SavePlayerWell[]
```

The exact name should follow the repository's final naming convention, but the important point is a new versioned save field plus migration from v19.

Do not persist:

- `WaterSource` objects;
- Three.js meshes;
- runtime collider handles;
- household water in the well record.

On load:

```text
SaveData
  ↓
validate/migrate
  ↓
well records
  ↓
create/rebuild world representation
  ↓
register current-stage capabilities
```

This should use the same world-object reconstruction principle as tents/fires/traps.

## 11. WorldBundle and lifecycle

`WorldBundle` currently owns the major world systems, including `placedFires`, `placedTents` and `placedTraps`.

A persistent player-built well is another world system with a lifecycle tied to the bundle.

The well system should therefore be created/disposed/rebuilt together with the world bundle and receive the existing world dependencies it actually needs, especially:

- scene;
- terrain `sampleHeight`;
- current world time/day provider;
- collision registration/query;
- interaction registration through the existing interaction aggregation;
- save/load initial records.

Do not make the well state live in `createApp.ts` as a second authoritative store if the placed-object pattern can own it inside the world bundle.

The persistent record should outlive streamed rendering. Chunk unload must remove only the runtime representation/capabilities, not the authoritative well record.

## 12. Streaming and off-screen simulation

This is particularly important for Seedvale's world-independence rule.

A completed player well must not stop existing as a simulation source merely because its mesh is not currently loaded.

The intended separation is:

```text
persistent well record
        ↓
world/simulation source availability
        ↓
runtime mesh + collider + interaction when spatially loaded
```

The exact streaming implementation must follow the current source-selection architecture. If NPC water logistics can operate on off-screen settlement state, a player-built well must not accidentally become player-camera-dependent.

If the current implementation only exposes runtime source candidates for loaded structures, Plan 127 must either extend that resolver to persistent nearby well records or explicitly document the bounded simulation rule. It must not rely on a globally loaded mesh as the source of truth.

## 13. Collision ownership

The original notes correctly rejected well-specific NPC avoidance logic.

Current settlement construction already passes collider query/registration APIs through `ChunkManager`, and NPC code already has generic collider-approach handling.

Therefore the well should register its physical collider through the existing collider mechanism and provide a reachable interaction/service point.

Desired result:

```text
well collider
    ↓
existing collider registry
    ↓
existing navigation / approach logic
```

The well should not add:

```text
if (target.kind === 'playerWell') ...
```

to `NpcAgent`.

Placement validation should use the existing collider/spatial queries where they actually cover the required overlap rules.

## 14. Construction stages

The stage model remains sound:

```text
pit → well → roof
```

The key update is that stage progression must be integrated with the current world-time source and persistence model, not a new timer.

Use:

```text
stageStartedAt
+
current world days
```

and evaluate transitions at existing simulation/interaction cadence.

Do not use:

- `setTimeout`;
- `setInterval`;
- real-time wall clock;
- per-frame construction timers.

When a transition occurs, the authoritative record must be updated before exposing the next-stage capability.

## 15. Inventory and Plan 155

Plan 155 is `done` and expanded `Inventory` with `ItemInstance`, but deliberately kept ordinary stackable resources count-based.

That means the well's construction materials should remain ordinary stackable `ItemKind` counts:

```text
wood → count
stone → count
```

The shovel remains a tool/held item and should use the existing tool validation path.

Do not create:

- `WellMaterialInstance`;
- construction-specific item kinds;
- a second material inventory;
- an instance just to represent a shovel requirement.

Only a stateful object such as a trap needs the instance model currently.

Material consumption should remain atomic:

```text
validate placement
→ validate stage
→ validate shovel
→ validate materials
→ consume
→ start stage
```

## 16. Player water interaction and survival needs

The existing player water path remains based on the shared `WaterSource` abstraction and `PlayerNeeds`/inventory mutation outside `WaterSource`.

Plan 165 is currently `planned` and proposes future changes to how prolonged hunger/thirst consequences are modelled. It does not require a new well API.

Plan 127 should therefore depend only on the current stable `PlayerNeeds` operation(s), not on Plan 165-specific fields such as `DehydrationDuration`.

For a completed well:

```text
player interacts
    ↓
existing water-source interaction
    ↓
existing drink/fill semantics
```

Do not create `drinkFromPlayerWell()`.

If Plan 165 lands before Plan 127 implementation, re-run the API audit, but the well should continue to expose only the generic water-source capability.

## 17. Existing storage does not change well ownership

Plan 156 added physical household and settlement storage presentation, but those containers remain presentation over:

```text
Household.stock / Household.water
SettlementEconomy
```

This reinforces the correct well boundary:

```text
Well = source
Household = water reserve owner
Storage prop = presentation
NPC carrying = temporary transfer state
```

Do not make the well a storage container just because household water now has a visible barrel/trough/storage representation.

Plan 164's future generic player container is likewise unrelated to the well's authoritative water state.

## 18. Recommended implementation shape after this review

### A — Audit exact current APIs

Before coding, confirm the exact symbols for:

- current NPC water source selection;
- current water gathering action and deposit callback;
- household water reserve mutation;
- player water interaction;
- placed object persistence/reconstruction;
- `WorldBundle` lifecycle;
- collider registration/query;
- existing player placement helpers;
- current `SaveDataV19` migration/validation path.

### B — Persistent well record

Add one small well-specific state module only if no existing placed-object module is a natural owner.

Keep runtime representation derived from the record.

### C — Placement

Reuse terrain sampling, collider/spatial queries and existing placement conventions.

Validate before consuming resources or creating the record.

### D — Construction lifecycle

Implement the `pit → well → roof` stage transitions using world days.

### E — Existing interactions

Expose stage actions through the current `Interactable` aggregation. Once complete, expose the same generic well water interaction used by the existing settlement well.

### F — NPC integration

Extend the existing water-source candidate resolver to include completed player wells. Reuse the existing water duty/action/carry/deposit path.

### G — Persistence

Add well records to SaveData with the next version migration and shared restore path.

### H — Collision/streaming

Register/unregister runtime collider and interaction/source capabilities according to the current world/chunk lifecycle without deleting the persistent record.

## 19. Dependencies — updated

### Hard implementation dependencies

- ~~122~~ — water distribution/source and NPC water logistics; already implemented.
- ~~156~~ — generic water carrying/deposit and household/settlement storage ownership; already done.

### Relevant but not hard prerequisites

- ~~106~~ — player food/water/needs interaction foundations; already implemented.
- ~~069~~ — household ownership model; already implemented.
- ~~155~~ — inventory item instances; relevant only to confirm stackable construction materials remain count-based.

### Future / non-blocking

- `164` — player container system; not required.
- `165` — future hunger/thirst consequence tuning; no new well API should depend on it.
- `167` — NPC helper resource delivery; unrelated to autonomous household water fetching.

Plan 127 should not add a dependency on 164, 165 or 167 merely because those plans touch storage, survival or NPC resource delivery.

## 20. New conflicts / risks

### R1 — Duplicate settlement/player well state

**Risk:** accidentally treating the existing settlement well landmark as the player-built well.

**Resolution:** separate static settlement landmark from persistent player-owned well records.

### R2 — Duplicate water-source system

**Risk:** adding a well-specific registry/manager.

**Resolution:** extend the current water source candidate resolver.

### R3 — Water quantity stored in the wrong owner

**Risk:** putting water amount/capacity on `PlayerWell`.

**Resolution:** household reserve remains `Household.water`; well only provides access.

### R4 — Save/load gap

**Risk:** the well works in runtime but disappears after reload.

**Resolution:** make SaveData persistence an explicit acceptance criterion and add a version migration.

### R5 — Streaming gap

**Risk:** NPCs can use a well only while its mesh is loaded.

**Resolution:** distinguish persistent source state from runtime visual/collider registration and integrate with the current bounded source resolver.

### R6 — Overcoupling to future storage

**Risk:** making Plan 127 wait for generic `Container`/storage architecture.

**Resolution:** household water already has its authoritative simulation owner; visible storage is presentation.

### R7 — Unnecessary ItemInstance migration

**Risk:** treating construction materials as instances because Plan 155 introduced instances.

**Resolution:** wood/stone remain stackable counts; only stateful item types use instances.

## 21. Acceptance criteria — updated

A complete Plan 127 implementation should satisfy:

1. Player can place a well using the existing placement/input conventions.
2. Placement validation prevents invalid terrain/collision/overlap cases without a new generic placement framework.
3. Construction state is represented by one persistent record.
4. `pit → well → roof` progresses from world time, not real-time timers.
5. Construction materials are consumed only after complete validation and only when a stage starts.
6. Completed player wells expose the existing `WaterSource(kind='well')` semantics.
7. Player drinking/filling uses the existing generic water interaction path.
8. NPC water logistics can select a completed player well through the existing source-selection mechanism.
9. NPC water transfer continues to end at `Household.water`, not at the well.
10. The existing settlement well remains functional and distinct.
11. Well colliders use the existing collider/navigation path.
12. Stream-out/in rebuilds the runtime well without creating duplicate sources/colliders/interactions.
13. Save/load restores the well's identity, transform and construction stage.
14. The save migration is compatible with current `SaveDataV19`.
15. No second water, NPC logistics, inventory, storage or placement system is introduced.
16. No well-specific player-needs API is introduced.
17. Off-screen/world lifecycle behaviour does not depend on the player camera or a loaded Three.js mesh.

## 22. Verification

Technical verification:

```text
npx tsc --noEmit
npm run lint
npm run build
npm run test
```

Browser/manual verification is required for the visual/world-facing parts:

```text
place well
→ progress pit → well → roof
→ interact with completed well
→ drink/fill works like settlement well
→ NPC fetches from player well
→ household water increases
→ save
→ reload
→ well is reconstructed
→ NPC/player can use it again
```

Also verify:

- invalid placement;
- collision/overlap rejection;
- interrupted construction;
- stage transition after world-time advance;
- stream-out/in;
- save/load during each construction stage;
- two NPCs using the same well;
- existing settlement well still works;
- no duplicate source/collider/interaction registration;
- household water remains authoritative after repeated world rebuilds.

## 23. Final decision

**UPDATE**

Keep Plan 127. Its core architecture is still aligned with Seedvale, but the implementation plan should be updated before coding to target the **already implemented Plan 122/156 water pipeline**, the concrete `Household.water` owner, the existing settlement well, current placed-world-object lifecycle and current `SaveDataV19` migration path.

The plan does **not** need a new water abstraction, generic building framework, generic placement manager, storage system or NPC subsystem.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
