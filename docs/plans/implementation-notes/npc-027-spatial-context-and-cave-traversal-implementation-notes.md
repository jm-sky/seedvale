# Spatial-context-aware NPC movement and cave traversal — Implementation Notes

**Plan:** `npc-027-spatial-context-and-cave-traversal.md`  
**Recon:** 2026-09-10, current `main` (`9f779b40` baseline before this notes commit)

## Recon result

The plan direction is sound, but current Cave V2 does **not yet expose the final multi-agent semantic API that npc-027 needs**. `world-terrain-008` is `done`; the remaining production cave spatial contract is `world-terrain-019`. Reconfirm the final `Caves` contract before coding.

Current production facts:

- `src/world/createCaves.ts` already builds and retains, for every accepted cave, `CaveTopology` + SDF representation + `CaveSdfColumnIndex` independently of render activation.
- SDF mesh presentation and cave-wall collider registration are still streamed around the observer via `Caves.update(observerX, observerZ)`.
- `CaveTopology` already has stable `caveId`, authoritative XYZ nodes, connected segments and XYZ centerlines.
- NPC movement is still surface-centric: `NpcPlannedAction.destination` is a plain `Vec3`; `NpcAgent` snaps its Y to surface `sampleHeight()` every update and `resolveTimeSkip()` also places NPCs with surface height.

Do not implement npc-027 against transitional `CaveDefinition` / `CaveVolume` semantics merely because `Caves.definitions()` still exposes them. `createCaves.ts` explicitly marks that path as a B5 leftover.

## Critical Cave V2 API gap

Current public `Caves` methods are not sufficient as the generic spatial-context authority for many NPCs:

- `queryGround(x,y,z)` uses one closure-level `lastGroundHit` / `lastHitRuntime` hysteresis state. It is appropriate for the single player-ground sampling stream, not interleaved queries from many NPCs.
- `queryInterior(x,y,z)` likewise owns one closure-level hysteresis state and is documented as the player's once-per-frame interior signal.
- `occupancyAt(x,y,z)` and `contains(x,y,z)` are stateless, but only report occupancy/boolean; they do not identify which `caveId` owns the hit.
- `sampleFloor(x,z)` / `sampleCeiling(x,z)` are explicitly transitional Y-blind lowest-interval accessors and are unsafe for overlapping/multi-level semantics.
- topology and SDF indexes are private inside `createCaves.ts`; there is currently no public `caveId -> topology/traversal query` lookup.

### Required architectural decision

Before NPC integration, extend the Cave V2/world ownership boundary with **stateless, cave-aware semantic queries**. Exact names may follow the final B4/B5 architecture, but npc-027 needs equivalents of:

```text
resolve spatial context from XYZ -> surface | cave:<id>
lookup cave semantic data by caveId
query cave floor/ceiling/occupancy for a specific cave at XYZ
lookup authoritative entrance/transition semantics for caveId
access topology/connectivity for coarse routing
```

Do not expose mutable `CaveRuntime`, render meshes, Three.js objects or raw private maps to `ai/`. Prefer a narrow read-only semantic facade.

Do not reuse `queryGround()` or `queryInterior()` as NPC membership queries; their shared hysteresis would make one NPC's samples affect another NPC/player.

## Spatial context ownership

The reusable type should live at a world/navigation/shared spatial boundary, not under `ai/`:

```ts
type SpatialContext =
  | { kind: 'surface' }
  | { kind: 'cave'; caveId: string }
```

Equivalent representation is fine. Keep it plain-data and Three.js-free.

Actual XYZ + Cave V2 stateless semantics determine current context. `NpcAgent` may retain transient route/portal progress, but must not persist or independently author `currentCaveId` as a second source of truth.

At the mouth, use a small transition-continuity state only while physically crossing. The transition state may suppress frame-to-frame context flapping; it must not make proximity to an entrance equal cave membership.

## Movement target boundary

Current shared `PlannedAction` in `src/simulation/types.ts` is deliberately domain-agnostic and is also used outside NPCs. Do **not** automatically widen `PlannedAction.destination` from `Vec3` to a cave-aware type.

The narrowest current NPC-specific seam is `NpcPlannedAction` in `src/ai/npcAction.ts`. Prefer adding/normalizing a movement target there (or immediately inside `NpcAgent.startAction()` if that proves cleaner) while preserving existing surface action producers.

Desired semantic shape:

```text
position: authoritative XYZ
context: SpatialContext
```

Existing surface action call sites should be normalized once to `surface`; avoid converting dozens of producers to redundant boilerplate and avoid permanent parallel `destination` vs `movementTarget` semantics.

For cave targets, the producer must supply authoritative Cave V2-derived XYZ. `NpcAgent` must never recalculate target Y through terrain `sampleHeight()`.

## Surface assumptions that must be removed from generic NPC locomotion

Two current code paths are hard blockers:

1. `NpcAgent.update()` unconditionally ends the tick with:

```text
mesh.position.y = sampleHeight(mesh.position.x, mesh.position.z)
```

This must become domain-ground resolution. Otherwise every successful cave step is immediately teleported back to the surface.

2. `NpcAgent.resolveTimeSkip()` teleports to schedule destinations using surface `sampleHeight()`.

npc-027 does not need to build a full off-screen cave movement executor, but it must not leave a generic catch-up path that silently destroys an NPC's cave context. If time-skip cannot semantically resolve an in-cave route yet, use an explicit safe policy (e.g. abort/reset transient cave travel at a valid semantic endpoint) rather than surface-projecting the same X/Z.

Audit rescue/abandon code for the same pattern. Any emergency reposition retained for surface movement must be context-gated.

## Local locomotion provider: keep one movement pipeline

`src/navigation/navigation.ts` is already correctly request-driven and bounded. Keep it that way.

However its `NavigationQuery` currently assumes a 2D `sampleHeight(x,z)` and runs `sampleSlope()` against that sampler. Do not pass the surface sampler for cave movement.

Preferred direction:

```text
NpcAgent movement execution
  -> navigation-domain provider
       surface: existing height/water/collider/slope semantics
       cave: Cave V2 floor/occupancy/clearance semantics
```

Do not create a second cave NPC mover. `steerWithRescue()` / `steerTo()` / watchdog remain the common execution path, with domain-specific grounding and walkability behind a narrow provider.

If bounded A* is reused inside caves, generalize only the query boundary required by `findPath()`. `navigation.ts` must remain a pure route finder and must not import Cave V2 ownership.

## Collision and streaming

Current cave-wall colliders are built up front but registered in `ChunkManager` only while the cave presentation is active around the observer. Therefore **the shared collider registry cannot currently be the sole validity authority for an NPC in an off-player cave**.

Use Cave V2 retained SDF/index semantics for local cave containment/walkability. If final B4 introduces semantic/collider activation independent of mesh presentation, consume that final lifecycle instead of adding an NPC activation manager.

Do not activate/generate all cave meshes to make NPC navigation work.

Also preserve vertical filtering: overlapping surface/cave XZ must not make an underground wall block a surface NPC, or a surface collider block an underground NPC unless vertical extents actually overlap.

## Coarse cave routing

Reuse `src/world/caves/caveTopology.ts`:

```text
CaveTopology.nodes
CaveTopology.segments
CaveTopologySegment.from/to
CaveTopologySegment.centerline (XYZ)
```

Build the cave graph from segment identity/connectivity, not geometric nearest-neighbour adjacency. For a cave-local leg:

```text
current XYZ
-> attach to relevant segment/node
-> graph path
-> ordered centerline/node waypoints
-> local cave locomotion/validation
```

Centerlines are route guidance only. Every actual step/waypoint still needs Cave V2 floor/occupancy/clearance validation.

Do not route between disconnected topology components because their XYZ positions happen to be close.

For L1 `surface <-> cave:A`, resolve the transition by `caveId` and that cave's authoritative entrance. Do not choose a globally nearest cave mouth.

## Entrance transition

`CaveEntrance` currently provides world XYZ, yaw, width and height, while mouth geometry helpers in `src/world/caves/mouthCarve.ts` derive along/lateral portal semantics from it. Reuse/extend that Cave V2-owned geometry rather than adding NPC offsets.

The transition leg should expose enough semantic points/regions for:

```text
surface approach
-> mouth crossing
-> confirmed cave interior side
```

and the reverse.

Do not switch context at the surface approach point. Context changes only after canonical occupancy/interior semantics confirm the physical crossing, with transient continuity at the boundary if needed.

## NpcAgent integration boundaries

Keep route composition below decision/strategy code. An action decides **where** to go; movement resolves **how** to get there.

Likely concentrated changes after Cave V2 exposes the needed facade:

- `src/ai/npcAction.ts` — NPC-specific spatial movement target normalization.
- `src/ai/NpcAgent.ts` — domain route state, transition execution, domain-aware ground/walkability, context-safe rescue; remove unconditional surface-Y snap.
- `src/navigation/navigation.ts` — only if a small domain-neutral query generalization is necessary for cave local A*.
- `src/world/createCaves.ts` / `src/world/caves/*` — stateless cave-aware semantic facade, cave lookup, entrance/topology access; exact location should follow final B4/B5 ownership.
- settlement/app wiring — thread the world spatial/cave query dependency into NPC construction through the existing settlement composition path; do not let `NpcAgent` import `WorldBundle`.

Do not modify `npcProfessionWork.ts`, mining actions, quest code or contract code to understand entrances/routes.

## Persistence / lifecycle

Current persisted NPC state intentionally excludes phase, pending action and pathfinding state. Preserve that boundary.

npc-027 should not persist route legs, topology waypoint indexes or portal-transition progress. On reconstruction, derive context from authoritative world position and rebuild any route when a new action executes.

Before relying on this fully, verify where NPC world position itself is authoritative across settlement stream-out/in. If loaded-agent transform is not persisted/restored as a general location today, do not quietly invent a cave-only location field; solve location ownership coherently or explicitly bound npc-027's first version to loaded/detailed NPCs and document the limitation.

## Dependency on `world-terrain-019`

Treat `world-terrain-019` as the real open production-migration dependency. `world-terrain-008` is closed as the V2/SDF infrastructure stage.

- semantic data already exists independently of render activation — good foundation;
- presentation/collider streaming is still observer-driven on current `main`;
- `CaveDefinition`/`topologyToCaveDefinition` leftovers move with the 019 SDF-path removal, not with closed 008 B5;
- public `Caves` API still contains player-specific stateful queries and lacks cave-specific topology/query lookup.

Immediately before implementing npc-027, reconfirm `createCaves.ts` after `world-terrain-019`. Adapt these notes to the final facade instead of preserving obsolete names.

## High-ROI tests

Focus on pure/domain tests before full agent integration:

- same X/Z, surface Y vs tunnel Y resolve to different contexts;
- two caves queried interleaved do not share hysteresis/state;
- cave target Y is preserved and never surface-projected;
- surface -> cave and cave -> surface routes use the requested cave's entrance;
- topology routing follows connectivity and rejects disconnected components;
- cave-local grounding follows descending/ascending centerline/floor semantics;
- surface regression: existing straight steering, water avoidance, slope limit and bounded rescue still work;
- watchdog/repath cannot move a cave NPC onto surface ground;
- navigation remains valid with cave mesh/colliders presentation inactive;
- two NPCs in different spatial contexts can update in the same frame without affecting one another's cave membership.

Manual browser verification remains for the user: physical entrance crossing, descending/ascending passage movement, return to surface, camera-observed and off-camera continuity, and surface movement regressions.