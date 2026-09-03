# Plan 104 — Underground Caves — Updated Review

**Reviewed:** 2026-08-19
**Status:** `updated-review`
**Plan:** `world-terrain-007-underground-caves.md`
**Implementation notes:** `world-terrain-007-underground-caves-implementation-notes.md`
**Decision:** `update`

## 1. Status

Plan 104 remains architecturally valid, but the original plan is no longer an accurate implementation specification for the current repository.

The central decision still holds:

- surface terrain remains the existing heightfield;
- cave interiors are separate geometry;
- `CaveVolume` should be deterministic plain data;
- cave collision should extend the existing collision mechanism rather than introduce a second physics/collision system;
- `LargeCaves` should eventually be replaced, not run permanently beside the real cave system.

The main changes since 2026-08-14 are not a replacement of this architecture, but several surrounding systems have matured enough that the plan must integrate with them explicitly.

Current code still has the old trench-based `LargeCaves` implementation and `WorldBundle.largeCaves`; no real `CaveVolume` implementation has landed yet. The repository therefore confirms that Plan 104 is still needed.

## 2. Najważniejsze zmiany względem oryginału

### 2.1 World lifecycle is now a hard integration requirement

The original plan correctly places caves in `WorldBundle`, but the current lifecycle makes the requirement stronger.

`WorldBundle` is rebuilt as one mutable world container when the world/seed is rebuilt. Systems are constructed together and disposed/rebuilt together. The current bundle already owns terrain, settlements, fauna, placed world objects and `largeCaves`.

Therefore the new cave subsystem must:

- be created during `createWorldBundle`;
- be returned as one field of `WorldBundle`;
- be disposed/rebuilt with the bundle;
- not retain scene objects, colliders or subscriptions across a world rebuild;
- not capture an old `ChunkManager` or other bundle field across rebuilds.

This should be explicit in Phase 1/2. The old implementation-notes wording about a generic `update/dispose` API is directionally right and should now be treated as a lifecycle requirement rather than an optional shape.

### 2.2 Physics 097 is no longer just a dependency — its current implementation constrains the design

The dependency on 097 can remain, but the cave plan must not assume that 097 already supports interior volumes.

`collision.ts` still implements only outward circle resolution. `ColliderRegistry` stores ordinary point/radius colliders in spatial buckets based on the collider centre. There is no interior constraint primitive today.

The implementation-notes warning is therefore still valid and should be promoted into the plan:

- do not model an `InteriorCapsule` as one normal `Collider` and assume the existing registry will work;
- either extend the collision abstraction with an explicit interior constraint type and suitable spatial bounds, or provide an equivalent cave-specific query integrated into the same collision subsystem;
- preserve one shared collision owner/registry rather than creating another collision system.

The old implementation notes correctly identified the 3×3 bucket limitation for long primitives. That remains unresolved in code and is a concrete implementation dependency.

### 2.3 Fauna spawn-point lifecycle changed materially

This is the biggest surrounding-system change.

`AnimalSpawner` now has a generic spawn-point lifecycle with stable IDs, depletion, disabling, recovery and persistence. `SpawnerType` already includes `cave` and `wolfDen`, and `wolfDen` explicitly documents future re-anchoring to a real cave volume without changing the quest-facing `WOLF_DEN_ID` contract.

Plan 104 should therefore **not** create a new cave fauna lifecycle.

Instead:

- use the existing `PreySpawner`/spawn-point mechanism for cave fauna;
- preserve `spawnPointId` and existing lifecycle semantics;
- keep `FaunaDen`/`wolfDen` identity separate from `CaveVolume` identity;
- allow a real cave volume to provide the physical anchor for an existing spawn point;
- do not create `CaveFaunaManager`, `CaveSpawnState` or another persistence flag system for animal lifecycle.

The existing code already persists spawn-point lifecycle separately from animal runtime state, so the original cave plan's simplistic `{ caveId, looted, cleared }` persistence must not absorb fauna lifecycle state.

### 2.4 Persistence is now version 19 and already supports instance-backed items

The original plan was written before the current persistence state was established.

`SaveData` is now canonical version 19 and already contains persistent inventory instances. It also contains persisted spawn-point lifecycle state.

Plan 104 should therefore change its persistence language from a generic “new version of schema with cave flags” to:

> extend the existing versioned `SaveData` chain with only the minimal cave-specific state that cannot be deterministically reconstructed.

Do not introduce a separate cave save file or a second persistence mechanism.

For cave loot:

- stackable deterministic loot can use the existing collected-item/persistent world-item mechanisms where appropriate;
- instance-backed loot must preserve the existing `ItemInstance` identity/state mechanism;
- cave geometry, graph and siting must remain derived from seed/code, not serialized per cave;
- fauna lifecycle remains owned by `SaveSpawnPoint` rather than cave flags.

The new inventory/item-instance work therefore affects the cave plan mainly at the loot boundary, not the cave geometry architecture.

### 2.5 Container/storage plans create an optional loot integration, not a cave dependency

Plan 164 introduces a reusable world `Container` concept and explicitly requires persistence/streaming-compatible world objects. Plan 167 then uses that storage as a target for NPC delivery.

This does **not** mean Plan 104 should depend on 164 or 167.

The original cave loot requirement can still be fulfilled with an existing item pickup at a dead-end/chamber. A cave should not introduce a chest/container solely for treasure.

If a later implementation deliberately chooses a container as cave treasure, it should reuse the generic container system. That is an integration option, not a prerequisite for caves.

Recommended dependency remains independent of 164/167 unless the scope is explicitly changed to require container-based treasure.

## 3. Nowe zależności / relacje

### Required

- **097 Physics/collision:** existing shared collision system; extend it for cave interior constraints.
- **Current WorldBundle lifecycle:** cave subsystem must participate in create/rebuild/dispose lifecycle.
- **Current ChunkManager:** terrain samplers, road/coast/settlement placement checks, chunk streaming and collider access remain the integration boundary.
- **Current fauna spawn-point system:** cave fauna should reuse `PreySpawner`, stable spawn-point IDs and lifecycle/persistence.
- **Current SaveData v19:** cave-specific persistence must extend the existing schema/versioning path.

### Relevant but not required

- **155 inventory/item instances:** relevant if cave loot can be instance-backed; do not create a cave-specific item identity system.
- **164 player storage/containers:** reusable if cave treasure later uses containers, but not required for the basic cave feature.
- **167 NPC helper delivery:** no direct dependency; it benefits automatically from generic storage once 164 exists.

## 4. Conflicts / overlap

### 4.1 `LargeCaves` is still the main direct overlap

The repository still has:

- `src/world/largeCaves.ts`;
- `src/world/createLargeCaves.ts`;
- `src/world/largeCaveVisual.ts`;
- `WorldBundle.largeCaves`.

The original replacement rule remains correct: do not permanently maintain two unrelated large-cave systems.

However, migration should now be phrased around the **world lifecycle**: the new cave subsystem replaces the `largeCaves` field and its construction in the same world-bundle rebuild path. There should not be a period where both systems silently generate the same world content.

### 4.2 Existing `wolfDen` must not become a second cave system

The current fauna code explicitly anticipates re-anchoring `wolfDen` to a real cave volume.

Therefore Plan 104 should integrate the existing den rather than inventing a second cave-wolf representation.

Recommended relationship:

```text
CaveVolume
    ↓ physical location / floor / navigation space

PreySpawner(type='wolfDen')
    ↓ lifecycle + stable spawn-point identity

AnimalAgent
    ↓ runtime wolf
```

The cave should own the space; the fauna system should own the animal lifecycle.

### 4.3 `createCaveMouth` overlap

The old fauna/settlement cave-mouth presentation should not survive as an independent underground-cave implementation.

Where a real cave can provide the entrance, use the real cave mouth. Existing fauna-den behaviour can remain as a compatibility/fallback presentation only where the new cave siting does not apply.

The plan's old wording around “small cave may replace `createCaveMouth`” is still valid, but it should explicitly preserve the existing quest/spawn-point identity contracts.

### 4.4 Terrain `modifyTerrain` remains an existing mechanism, not a replacement for cave geometry

The original rejection of carving the whole tunnel through `modifyTerrain` remains correct.

Current terrain generation and world integration already provide the correct seam: terrain remains the surface heightfield, while cave mouth/ramp information should use the existing clearing/world-generation inputs. Do not add a cave-specific worker terrain system.

`modifyTerrain` may remain valid for unrelated systems; Plan 104 should only retire its use for the old large-cave tunnel representation.

## 5. Placement and streaming updates

The original 500 m cave grid remains a good world-scale abstraction. It should stay independent from terrain chunk resolution.

The current repository makes the following ownership rule important:

```text
Cave generator
    ↓ deterministic CaveVolume definitions
WorldBundle / CaveWorld
    ↓ presentation lifecycle
ChunkManager
    ↓ terrain chunks / samplers / collider access
```

Do not create `CaveChunkManager`.

Do not put cave definitions inside individual chunk records.

Cave presentation may be streamed by distance, but the deterministic cave definition must exist independently of whether its terrain chunks or mesh are currently loaded.

## 6. Collision updates required by current code

The original recommendation to add `InteriorCapsule`/`InteriorDisk` is still reasonable as a direction, but it is too prescriptive given the current collision implementation.

The update should require the following invariants rather than force one exact primitive API:

1. one shared collision subsystem;
2. explicit distinction between solid-out and cave-interior constraints;
3. cave constraints queryable across the complete cave bounds, not only by collider centre;
4. stable cave owner IDs for lifecycle cleanup;
5. no mesh/BVH dependency for normal movement collision;
6. correct behaviour at mouth transitions and at future junctions.

For v1, a single analytical corridor can remain minimal. The abstraction should still allow a union of corridor/chamber constraints for L2.

The current registry's point-centre bucketing must be treated as an implementation issue to solve, not something the plan can assume away.

## 7. Player and fauna ground handling

The original plan correctly identifies a missing vertical integration for cave fauna. That remains a real requirement.

The update should make the distinction explicit:

- player: switch between surface ground and `CaveVolume.sampleFloor()` using the existing ground-provider architecture;
- cave animal: extend `AnimalAgent`/fauna movement so an animal assigned to a cave can use the cave floor rather than always using surface `sampleHeight()`;
- surface animals above a cave continue to use the surface terrain;
- being horizontally above a cave must not automatically put an entity underground.

The new spawn-point system makes the last point particularly important: a cave-bound animal should be identified through its existing spawn-point/animal state, not by a generic “near cave” check.

## 8. Persistence updates required by current code

Replace the original planned cave persistence model with:

```text
SaveData v19
    ├── existing spawnPoints[] → fauna lifecycle
    ├── existing inventoryInstances[] → instance-backed loot if applicable
    └── new cave-specific sparse state → only non-derivable cave progression
```

The cave-specific state should be minimal. Examples:

- a deterministic cave ID marked looted/cleared;
- other persistent progression flags that cannot be reconstructed from seed + world state.

Do not persist:

- generated cave geometry;
- node/edge positions;
- mesh data;
- cave floor samples;
- runtime animal state;
- stream/load state.

Current persistence already demonstrates the intended pattern: save sparse state, derive deterministic world data.

## 9. Recommended updates to scope / architecture

### Keep

- L2-capable `CaveVolume` graph abstraction;
- v1 as one descending corridor;
- separate interior mesh;
- heightfield only at the surface/mouth;
- analytical collision instead of mesh/BVH collision;
- 500 m deterministic siting grid;
- Phase 0 siting/overburden spike before expensive mesh work;
- browser verification gate before L2/content.

### Change

1. **World ownership** — specify create/rebuild/dispose integration with the current `WorldBundle` lifecycle.
2. **Collision** — specify invariants instead of assuming the exact `InteriorCapsule`/`InteriorDisk` API; explicitly solve current spatial-index limitations.
3. **Fauna** — reuse `PreySpawner`/`wolfDen` lifecycle and persistence instead of creating cave-specific fauna state.
4. **Persistence** — target current `SaveData v19` and existing version migration; add only sparse cave progression state.
5. **Loot** — reuse current inventory/item-instance mechanisms; containers are optional and must not become a Plan 104 dependency.
6. **Migration** — explicitly remove `largeCaves` construction/ownership when the replacement is enabled; do not leave two cave generators active.
7. **Ground providers** — distinguish player underground state from surface entities above a cave.

### Do not expand

Do not add:

- a second terrain system;
- a cave chunk manager;
- a generic interior-volume framework for houses before it is needed;
- a cave-specific inventory/container system;
- a cave-specific fauna lifecycle;
- mesh/BVH movement collision;
- off-screen cave simulation as a separate subsystem;
- procedural cave persistence.

## 10. Recommended phase adjustments

### Phase 0 — keep, strengthen

Keep the siting/overburden spike, but include current exclusion mechanisms and produce deterministic statistics.

The spike should validate the actual current samplers and placement constraints before any cave mesh implementation.

### Phase 1 — update

Add explicit integration with current `WorldBundle` lifecycle and replace `largeCaves` ownership in one controlled migration.

The new generator should expose deterministic cave definitions independently from their streamed presentation.

### Phase 2 — update

Implement `CaveVolume` + mesh + player ground transition + collision through the existing shared systems.

Do not implement cave fauna lifecycle here beyond the minimum hooks required to prove the cave space works.

### Phase 3 — keep as browser gate

Still required. Three.js visual correctness cannot be established from unit tests alone.

### Phase 4 — narrow/reuse existing systems

Large cave geometry can remain in Plan 104 after the gate, but:

- wolf uses existing `wolfDen`/spawn-point lifecycle;
- loot uses existing item/persistence systems;
- containers remain optional;
- cave progression uses sparse save flags rather than serializing cave state.

If the implementation becomes too large, L2 geometry and cave content can still be split into a follow-up plan after Phase 3 without changing the `CaveVolume` foundation.

## 11. Dependency decision

Original dependency:

```text
104 → 097
```

Updated relationship:

```text
104
 ├── requires current collision system from 097
 ├── integrates current WorldBundle lifecycle
 ├── reuses current fauna spawn-point lifecycle (125)
 ├── integrates current SaveData / item-instance persistence
 └── optionally integrates Container (164), but does not require it
```

Plan 097 should remain listed as a historical/foundational dependency, but it is no longer a blocker plan. The cave implementation must target the **current code**, not the 2026-08-14 snapshot of 097.

No new hard dependency on 164 or 167 is recommended.

## 12. Krótka decyzja

**`update`**

Plan 104 should proceed, but the original plan should be updated before implementation.

The cave architecture itself does not need to be rethought. The main required change is to make it a first-class participant in the repository's now-more-mature lifecycle, fauna, persistence and item systems instead of designing those boundaries as they existed on 2026-08-14.

The most important architectural rule remains:

> **CaveVolume owns cave space; existing world systems own lifecycle, fauna, items and persistence.**

> **Zrób git commit i push do main, rebase jeżeli trzeba**
