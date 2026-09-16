# Plan: Spatial-context-aware NPC movement and cave traversal

**Created:** 2026-09-08
**Status:** `verification needed` 🔍
**Implemented at:** 2026-09-16 10:47
**Type:** feature
**Priority:** high · **Effort:** L
**Depends on:** ~~world-terrain-019~~, ~~npc-006~~, ~~npc-007~~
**Domain:** `npc`
**Subdomains:** `behavior` `work`
**Tags:** `movement` `navigation` `caves` `spatial-context` `off-screen`
**Roadmap:** `quests-abandoned-gold-mine-colony.md`
**Model:** Sonnet, Composer

## Goal

Extend generic NPC movement so an NPC can physically move between the surface and production Cave V2/heightfield caves, navigate inside them, reach an authoritative target, and return to the surface.

The movement contract must work for every production cave archetype:

```text
natural
adventure
dungeon
```

without archetype-specific NPC movement branches.

The intended flow is:

```text
NPC actual XYZ
→ Caves.spatialContextAt(...)
+ committed movement target { authoritative XYZ + WorldSpatialContext }
→ compose surface/cave route
→ use existing Cave V2 traversal semantics where the route is underground
→ execute through the normal NPC locomotion pipeline
→ physically cross the cave mouth when changing context
→ reach the committed target
```

This plan is a prerequisite for cave-aware NPC work such as `world-018-cave-aware-rich-finite-resource-deposits.md` when NPC cave mining is enabled there.

## Current production baseline

`world-terrain-019` is implemented. Production caves no longer have an SDF runtime/collider authority.

Current ownership is:

```text
CaveTopology
= stable cave identity + semantic layout/connectivity

CaveHeightfieldRepresentation
= the one production spatial authority

createCaves() / Caves
= world-owned semantic facade and lifecycle
```

The retained heightfield is authoritative for:

- floor/ceiling;
- strict occupancy;
- cave spatial identity;
- horizontal rock containment;
- presentation geometry;
- terrain-mouth compatibility;
- cave-local traversal grounding.

Presentation streaming is separate from gameplay truth. NPC navigation must never require active cave meshes, Player/camera proximity or streamed cave presentation.

## Existing mechanisms this plan must reuse

### Shared spatial context

Do not introduce a new NPC-specific cave context.

Reuse `src/world/spatialContext.ts`:

```ts
WorldSpatialContext =
  | { kind: 'surface' }
  | { kind: 'cave'; caveId: string }
```

Canonical current-context resolution is:

```text
actual world XYZ
→ Caves.spatialContextAt(x, y, z)
→ WorldSpatialContext
```

Use `spatialContextsEqual()` for semantic comparison. Do not compare context objects by reference.

NPC route/portal progress may be transient execution state, but must never become a second persisted authority for cave membership.

### Cave-scoped spatial queries

Reuse the existing stateless `Caves` API:

```text
spatialContextAt(x, y, z)
queryGroundIn(caveId, x, y, z)
resolveHorizontalIn(caveId, x, z, y, radius, entityHeight)
```

Do not use player-stateful `queryGround()` / `queryInterior()` as multi-NPC membership or grounding state.

### Existing cave traversal

Reuse `src/world/caves/caveHabitat.ts` and the public `Caves` facade rather than recreating topology graph routing under `ai/`.

Existing mechanisms include:

```text
Caves.resolveHabitat(...)
Caves.resolveRouteBetween(...)

shortestNodePath(...)
buildRoutePoints(...)
snapRouteFloor(...)
resolveCaveRouteBetweenNodes(...)
resolveCaveTraversal(...)
```

These already use `CaveTopology` connectivity and floor-snap waypoints to the retained heightfield.

NPC-027 may add only the smallest missing generic seam required to route an arbitrary NPC position/target to these semantics. Do not duplicate BFS, topology flattening, floor snapping, cave lookup or raw heightfield access in NPC code.

### NPC movement pipeline

NPC movement is currently centred on:

```text
NpcPlannedAction.destination
→ goTo
→ steerWithRescue()
→ steerTo()
```

`NpcPlannedAction.destination` remains a plain `Vec3` snapshot today. The narrowest current NPC-specific movement seam is `NpcPlannedAction` / `NpcAgent.startAction()`.

Do not redesign Goals, Plans, Strategies, decisions or action effects.

### Surface navigation

Keep the existing surface path unchanged where possible:

- `src/navigation/navigation.ts` bounded local-grid A*;
- `src/terrain/slopeConstraint.ts`;
- `src/ai/npcColliderRim.ts`;
- `src/ai/npcMovementWatchdog.ts`;
- existing water avoidance, separation, collider avoidance and final approach.

The bounded A* remains a local obstruction fallback. Do not turn it into a global navmesh or run it for every ordinary movement step.

## Core invariants

> **A cave target's Y is authoritative and must never be replaced with surface `sampleHeight(x, z)`.**

> **Surface and cave locations at the same X/Z remain distinct through `WorldSpatialContext`.**

> **Current NPC context comes from actual XYZ + `Caves.spatialContextAt()`, not action kind, target context, entrance proximity or render state.**

> **NPCs physically enter and leave through the production cave mouth. No cave teleport.**

> **Heightfield semantics, not cave render meshes or colliders, are authoritative underground.**

> **NPC code must reuse the existing world-owned cave traversal contract rather than implement a second graph/spatial system.**

> **`natural`, `adventure` and `dungeon` use one NPC movement pipeline. Cave archetype may influence topology/content, never locomotion architecture.**

> **Detailed locomotion and future aggregated/off-screen travel must refer to the same cave identity, topology and transition semantics.**

## Generic movement target

Extend the narrowest coherent NPC movement boundary so execution receives:

```text
authoritative world-space XYZ
+
WorldSpatialContext
```

Conceptually:

```ts
MovementTarget {
  position: Vec3
  context: WorldSpatialContext
}
```

Prefer an NPC-specific normalization seam rather than widening shared `PlannedAction` unless current call-sites prove shared ownership is necessary.

Existing surface action producers should require minimal churn. Normalize legacy surface destinations once at the movement boundary instead of requiring every existing action producer to construct boilerplate.

Do not leave two permanent destination systems with conflicting authority.

## Route composition

Route composition belongs below NPC decision-making.

```text
currentContext + targetContext
→ movement route
```

Required cases:

```text
surface → surface
cave:A → cave:A
surface → cave:A
cave:A → surface
```

The committed final target must remain unchanged while temporary route legs lead through an entrance or topology waypoints.

### Surface → cave

```text
surface NPC
→ route normally to requested cave's entrance approach
→ physically traverse the mouth
→ `spatialContextAt()` confirms cave:<id>
→ follow cave-local route
→ final target
```

Do not switch to cave context merely because the NPC is near the mouth.

### Cave → surface

```text
cave NPC
→ existing topology traversal toward this cave's entrance
→ physically traverse mouth outward
→ `spatialContextAt()` confirms surface
→ continue normal surface locomotion
```

### Cave → cave in the same cave

Use the existing cave topology/traversal contract. NPC code must not infer geometric adjacency between disconnected topology components.

Cross-cave travel (`cave:A → cave:B`) is not a special primitive: it composes as `cave:A → surface → cave:B` if a future caller requires it. It does not need a dedicated implementation path in this plan unless an existing consumer needs it.

## Entrance transition

Reuse production `CaveTopology.entrance` / mouth geometry semantics owned by Cave V2. Do not introduce NPC-only entrance offsets.

The transition execution must distinguish:

```text
surface approach
→ physical mouth crossing
→ confirmed underground side
```

and the reverse.

If a small transient portal phase is needed to prevent frame-to-frame ambiguity at the open-sky mouth, keep it execution-only. Actual XYZ plus `Caves.spatialContextAt()` remains authoritative.

## Cave-local locomotion

NPC locomotion remains ground-constrained rather than free-flying 3D movement.

For a cave leg:

```text
route waypoint
→ horizontal candidate movement
→ Caves.resolveHorizontalIn(caveId, ...)
→ Caves.queryGroundIn(caveId, ...)
→ authoritative cave XYZ
```

Use the heightfield for floor/clearance/rock containment. Do not use surface water or surface terrain height as underground ground authority.

Cave-local steering should reuse the normal `NpcAgent` execution pipeline where possible. Do not add `MineNpcMovement`, `DungeonNpcMovement` or another cave-specific agent/mover.

If bounded local A* is reused underground, generalize only the narrow query boundary needed for domain-correct walkability. `navigation.ts` must remain domain-neutral and must not import `Caves` or raw heightfields.

## Natural / adventure / dungeon coverage

The three production archetypes differ in topology/content, not in NPC movement ownership.

Tests and implementation must cover:

- `natural`: simple entrance/chamber traversal;
- `adventure`: longer routes and branches/junctions;
- `dungeon`: multiple chambers, branch/deeper routing and underground-pool coexistence.

Dungeon pools/content anchors are not navigation authorities. NPC movement follows topology + heightfield and must not special-case content role names or chamber array positions.

## Surface assumptions to remove from generic NPC movement

Audit all places where generic movement or recovery assumes that every NPC stands on surface terrain.

Known critical areas include:

- constructor/home placement where appropriate;
- per-tick final Y grounding;
- `resolveTimeSkip()` / catch-up placement;
- local repath and escape;
- emergency recovery;
- destination normalization;
- arrival checks that assume surface Y;
- collider/slope queries whose inputs are surface-only.

A cave NPC must never be recovered by projecting the same X/Z to surface height.

If a catch-up/time-skip path cannot safely execute a cave route in the first implementation, use an explicit safe policy at a valid semantic endpoint rather than silently surface-projecting the NPC.

## Rescue and watchdog

Preserve the existing watchdog/repath lifecycle.

For cave movement, recovery order should remain within the active cave context:

```text
retry current leg
→ rebuild/reselect valid cave waypoints
→ local valid escape within same cave
→ normal action failure/abandon
```

Do not cross a spatial domain as a generic stuck-recovery shortcut.

Surface emergency recovery may remain unchanged when the NPC is actually in `surface` context.

## Persistence and off-screen boundary

Do not persist:

- topology waypoint indexes;
- route legs;
- mouth-transition phase;
- duplicated `currentCaveId` solely for movement.

On runtime reconstruction, derive current spatial context from authoritative world position and rebuild route execution state as needed.

This plan does not implement a new remote/off-screen NPC movement executor. The resulting semantic route components must nevertheless be presentation-independent so a future aggregated executor can reuse them.

## Implementation stages

### Stage A — Reuse current world/cave contracts

Do not build new spatial or traversal infrastructure.

Wire implementation around the already-existing:

- `WorldSpatialContext` / `spatialContextsEqual()`;
- `Caves.spatialContextAt()`;
- `Caves.queryGroundIn()`;
- `Caves.resolveHorizontalIn()`;
- `Caves.resolveRouteBetween()` / `resolveHabitat()`;
- production `CaveTopology` + retained heightfield semantics.

If one narrowly scoped cave query is genuinely missing for arbitrary NPC target attachment, extend the current `Caves` semantic facade or `caveHabitat.ts`; do not expose raw `CaveRuntime`/heightfield maps to `ai/`.

### Stage B — Spatially explicit NPC movement target

Introduce the smallest NPC movement-target contract containing authoritative XYZ + `WorldSpatialContext`.

Normalize existing surface `NpcPlannedAction.destination` producers at one boundary. Avoid broad `PlannedAction` churn unless proven necessary.

Add focused tests that cave target Y and cave identity survive action start/promotion/chaining.

### Stage C — Current-context resolution and route composition

Resolve current context from actual XYZ through `Caves.spatialContextAt()` and compose same-domain vs cross-domain movement legs.

Keep final target identity stable while intermediate entrance/topology waypoints execute.

### Stage D — Physical entrance crossing

Implement surface→cave and cave→surface mouth traversal using production cave entrance/mouth semantics.

Context transition must require actual crossing, not proximity.

### Stage E — Cave-local locomotion

Make the common NPC mover domain-aware:

- surface keeps current terrain/water/collider/slope behaviour;
- cave uses `resolveHorizontalIn()` + `queryGroundIn()`;
- existing cave route waypoints guide movement;
- no surface Y snap occurs underground.

### Stage F — Context-safe recovery and time skip

Audit watchdog, local repath/escape, emergency recovery and catch-up/time-skip paths so they cannot destroy cave identity or bypass the mouth transition.

### Stage G — Archetype and regression coverage

Add targeted automated coverage for natural, adventure and dungeon topology shapes plus existing surface movement regression coverage.

Document the browser checklist for the Player; AI does not perform browser verification.

## Expected primary files

Current likely implementation points:

```text
src/ai/NpcAgent.ts
src/ai/npcAction.ts
src/navigation/navigation.ts                 # only if narrow query generalization is needed
src/world/spatialContext.ts                  # reuse; change only if a proven generic helper is missing
src/world/createCaves.ts                     # semantic facade only if a narrow query is missing
src/world/caves/caveHabitat.ts               # reuse/extend existing traversal seam
src/world/caves/caveTopology.ts              # semantic topology types, not NPC ownership
src/ai/npcMovementWatchdog.ts
src/ai/npcColliderRim.ts
src/terrain/slopeConstraint.ts
```

Settlement/app composition will need to thread the `Caves` semantic dependency into NPC construction through the existing ownership path. `NpcAgent` must not import/own `WorldBundle`.

Do not revive `CaveVolume`, SDF runtime modules or cave-wall collider ownership for NPC navigation.

For important architectural/public functions introduced by implementation, add concise JSDoc and useful `@domain` tags for preflight discovery.

## Tests

Add focused automated coverage for at least:

### Spatial identity

- surface and cave at overlapping X/Z resolve differently by Y;
- `surface != cave:A` and `cave:A != cave:B`;
- multiple NPC context queries do not share mutable hysteresis;
- mouth crossing changes context only after physical crossing.

### Target semantics

- cave target preserves authoritative Y;
- cave target preserves requested `caveId`;
- existing surface targets keep current behaviour;
- chained/promoted actions do not lose spatial target semantics.

### Route composition

- surface→surface;
- surface→cave;
- cave→surface;
- cave→same cave;
- requested cave entrance is used, never globally nearest entrance.

### Cave traversal

Reuse/extend existing traversal tests rather than duplicate them under NPC where possible:

- topology connectivity controls reachability;
- floor-snapped route follows the retained heightfield;
- natural route works;
- adventure branch/junction route works;
- dungeon deeper/branch chamber route works;
- presentation inactive does not invalidate route.

### Cave-local movement

- descending/ascending floor is followed;
- rock containment prevents wall traversal;
- underground NPC never snaps to surface at overlapping X/Z;
- dungeon pool/content metadata does not become a movement authority.

### Recovery/time skip

- repath/local escape stays in the current cave;
- emergency surface teleport is not used underground;
- unreachable cave target reaches the normal failure lifecycle;
- catch-up/time-skip never surface-projects a cave position.

### Surface regression

Existing surface NPC behaviour retains:

- ordinary straight steering;
- water avoidance;
- slope limits;
- NPC separation;
- collider avoidance;
- bounded A* fallback;
- interaction final approach;
- action completion.

## Performance

Cave route resolution must be request-driven, not per-frame.

Cache transient route execution for the current movement commitment and invalidate it only when necessary: target/context changes, route becomes invalid, watchdog requests repath or world rebuild invalidates cave references.

Do not inspect render meshes, raycast cave presentation or generate/activate all cave meshes for NPC navigation.

Do not move navigation to a Worker without profiling evidence.

## Non-goals

Do not implement:

- mine-specific or quest-specific cave movement;
- new cave generation/topology recipes;
- a fourth cave archetype;
- abandoned-mine quest logic;
- resource selection/depletion;
- settlement remote-mining strategy;
- generic world navmesh;
- free-flight 3D pathfinding;
- a new physics engine;
- full NPC AI redesign;
- new AnimalAgent cave traversal mechanisms;
- a full remote/off-screen movement executor;
- persistence of transient route state;
- cave presentation activation for navigation;
- Worker navigation rewrite.

## Verification

Technical verification should use focused tests first, then repo-standard checks for the touched scope:

```text
pnpm exec vue-tsc --noEmit
pnpm run lint:fix
pnpm run test
pnpm run build
```

Do not run browser verification as AI. Browser verification is performed by the Player.

### Manual browser checklist

1. Existing surface NPC movement remains unchanged.
2. NPC walks from surface through a natural cave mouth and reaches an interior target.
3. NPC returns physically through the mouth to the surface.
4. Adventure-cave branch/deeper traversal follows the cave rather than cutting through rock.
5. Dungeon-cave traversal reaches the requested chamber without confusing other branches or pool/content metadata.
6. NPC follows cave floor on descent/ascent and never snaps vertically to terrain.
7. Surface and cave targets at overlapping X/Z remain distinct.
8. Cave stuck recovery never teleports the NPC onto the surface.
9. Camera/Player distance and cave presentation streaming do not change semantic route validity.
10. Existing settlement movement/work interactions still behave normally.

## Completion criteria

The plan is complete when:

- NPC movement has one coherent target contract carrying authoritative XYZ + `WorldSpatialContext`;
- current context is resolved through `Caves.spatialContextAt()`;
- no parallel NPC cave-membership authority exists;
- NPCs physically traverse production cave mouths in both directions;
- existing world-owned topology/heightfield traversal is reused rather than duplicated;
- cave-local movement uses `queryGroundIn()` / `resolveHorizontalIn()` semantics and never surface-projects underground movement;
- natural, adventure and dungeon use the same movement architecture;
- branches/deeper dungeon routes respect topology connectivity;
- rescue/time-skip paths are context-safe;
- navigation remains independent of cave presentation streaming and Player/camera proximity;
- existing surface steering/A* behaviour remains intact;
- future cave-aware work actions can consume the generic movement contract without knowing how cave traversal works;
- automated verification passes and the Player has a concrete browser checklist.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
