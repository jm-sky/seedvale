# Spatial-context-aware NPC movement and cave traversal — Implementation Notes

**Plan:** `npc-027-spatial-context-and-cave-traversal.md`  
**Recon:** 2026-09-15, current `main` (`326b3af984a7fa8c4307dc557fd0b14e570e07ad` baseline before the plan/notes refresh)

## Stage 1 complete (2026-09-16)

**Scope:** spatial movement target contract + dependency wiring only (no route composition, mouth crossing, cave locomotion, or `navigation.ts` changes).

**Delivered:**

- `src/ai/npcMovementTarget.ts` — `NpcMovementTarget`, `NpcWorldMovementQueries` (`spatialContextAt` only), `normalizeNpcMovementTarget`, `commitNpcMovementTarget`, `movementTargetsEqual`, `NPC_WORLD_MOVEMENT_SURFACE_ONLY`.
- `NpcPlannedAction.destinationContext?: WorldSpatialContext` — explicit cave identity; legacy producers keep plain `destination` only.
- Normalization/commit at movement boundary: `NpcAgent.startAction()` and chained `next` promotion in `execute`.
- `NpcAgent.resolveCurrentSpatialContext()` from mesh XYZ + injected queries; `getCommittedMovementTarget()` for diagnostics/tests.
- Composition: `CreateSettlementDeps` / `SettlementsManager` / `worldBundle.ts` late-bound `{ spatialContextAt: (x,y,z) => cavesRef?.spatialContextAt(...) ?? WORLD_SPATIAL_CONTEXT_SURFACE }` (NPC build may start before `createCaves()` finishes).

**Decisions:**

- Did **not** widen shared `PlannedAction`.
- Did **not** add `currentCaveId` or import `WorldBundle` into `NpcAgent`.
- `committedMovementTarget` is stored but not yet consumed by steering (stage 3+).

**Follow-ups for later stages (not implemented now):**

- Re-commit or refresh movement target when `goTo` mutates `action.destination` (queues, `followAnimalId`, `approachPlayer`, accompany follow) without a new `startAction`.
- Extend `NpcWorldMovementQueries` with ground/horizontal/route helpers when cave locomotion and route composition land.

## Recon result

The old 2026-09-10 notes are materially obsolete after the Cave V2 heightfield cutover and the later fauna/dungeon work.

The important change is architectural: **npc-027 no longer needs to create the cave spatial/traversal infrastructure it originally expected to depend on.** Most of that contract now exists and is already used by fauna.

Current production facts:

- `world-terrain-019` is implemented; `CaveHeightfieldRepresentation` is the one production cave spatial authority.
- Production SDF runtime and cave-wall collider ownership are gone.
- cave gameplay semantics are retained independently of presentation streaming.
- `src/world/spatialContext.ts` already owns the shared `WorldSpatialContext` contract.
- `Caves.spatialContextAt()` is the stateless XYZ -> spatial-context resolver.
- `Caves.queryGroundIn()` and `Caves.resolveHorizontalIn()` are stateless cave-scoped movement queries suitable for many agents.
- `src/world/caves/caveHabitat.ts` already owns topology graph traversal, centerline flattening and heightfield floor snapping.
- `Caves.resolveHabitat()` and `Caves.resolveRouteBetween()` expose that traversal through the world-owned cave facade.
- cave traversal infrastructure already supports production `natural`, `adventure` and `dungeon` topology shapes.
- NPC movement itself is still surface-centric: `NpcPlannedAction.destination` is a plain `Vec3`, and `NpcAgent` still contains direct surface `sampleHeight()` placement/grounding paths.

The implementation should therefore be treated primarily as **NPC movement integration**, not a cave-system project.

## Existing world spatial contract — reuse exactly

`src/world/spatialContext.ts` already defines:

```ts
export type WorldSpatialContext =
  | { kind: 'surface' }
  | { kind: 'cave', caveId: string }

export const WORLD_SPATIAL_CONTEXT_SURFACE
export function caveSpatialContext(caveId: string): WorldSpatialContext
export function spatialContextsEqual(a, b): boolean
```

Do not create `NpcSpatialContext`, `NpcCaveContext` or another equivalent union.

`WorldSpatialContext` is deliberately plain-data and world-owned. Actual NPC XYZ remains authoritative; context is derived, not persisted independently.

Current context lookup is already public on `Caves`:

```text
Caves.spatialContextAt(x, y, z)
```

It is stateless and Y-aware. This is the correct multi-NPC membership query. Do not substitute:

- `queryGround()` — player-ground hysteresis;
- `queryInterior()` — player/camera hysteresis channels;
- `sampleFloor()` / `sampleCeiling()` — Y-blind accessors;
- `contains()` — no cave identity.

## Current Cave V2 movement facade

`src/world/createCaves.ts` currently exposes the relevant semantic API directly from `Caves`.

### Ground / containment

Use:

```text
queryGroundIn(caveId, x, y, z)
resolveHorizontalIn(caveId, x, z, y, radius, entityHeight)
```

Both are stateless and cave-scoped. They resolve against that cave's retained heightfield even when presentation is inactive.

This replaces the old notes' proposed SDF/index/collider adapter.

Do not expose `CaveRuntime`, raw heightfield typed arrays or `v2ByCaveId` to `ai/`.

### Spatial identity

Use:

```text
spatialContextAt(x, y, z)
```

Open-sky mouth occupancy resolves as surface. This is important for entrance transition sequencing: proximity to the mouth is not cave membership.

### Presentation independence

`createCaves()` builds topology + heightfield semantics up front. Cave presentation remains relevance-streamed separately.

There are no cave wall colliders that need activating for NPC navigation. Underground lateral containment is heightfield-backed through `resolveHorizontal` / `resolveHorizontalIn`.

Therefore npc-027 must **not** add:

- NPC-owned cave activation;
- all-caves presentation generation;
- cave mesh raycasts;
- cave collider registration for NPCs.

## Existing cave traversal — do not duplicate

The old notes expected npc-027 to build a graph router over `CaveTopology`. That work now exists in `src/world/caves/caveHabitat.ts`.

Relevant symbols:

```text
CaveTraversalPoint
CaveTraversalDescriptor
shortestNodePath(...)
buildRoutePoints(...)
snapRouteFloor(...)
resolveCaveRouteBetweenNodes(...)
resolveCaveTraversal(...)
```

Important ownership split:

```text
CaveTopology
→ connectivity / route intent

caveHabitat.ts
→ deterministic graph path + ordered route points

CaveHeightfieldRepresentation
→ authoritative final floor / clearance / containment
```

`Caves` exposes:

```text
resolveHabitat(caveId, entityHeight, options?)
resolveRouteBetween(caveId, fromNodeId, toNodeId)
```

`resolveCaveRouteBetweenNodes()` uses BFS over actual segment connectivity, flattens connected segment centerlines, then `snapRouteFloor()` resolves every route waypoint against the retained heightfield floor.

Do not reimplement any of this under `src/ai/`.

### Remaining routing gap for NPCs

The existing public traversal methods are topology-node based. NPC movement may still need a **small attachment seam** for arbitrary current XYZ / arbitrary cave target XYZ:

```text
arbitrary cave XYZ
→ identify/attach to the relevant existing topology route/endpoint
→ reuse existing route-between semantics
```

Do not assume this requires a new generic graph layer. First inspect whether the target producer can already provide a known semantic node/anchor or whether the existing route-to-entrance descriptor is sufficient for the first consumer.

If a generic arbitrary-point attachment helper is required, it belongs beside the existing cave traversal semantics (`caveHabitat.ts` / `Caves` facade), not in `NpcAgent`.

## Archetype implications

Current cave runtime carries `CaveArchetype`, with production variants:

```text
natural
adventure
dungeon
```

Movement must not branch on archetype.

The existing topology/traversal code already handles multiple chamber nodes and routes generically. `caveHabitat.ts` explicitly walks generic `kind === 'chamber'` nodes and supports dungeon topology through the same graph machinery.

Dungeon-specific APIs such as:

```text
dungeonChambersOf(caveId)
undergroundPoolOf(caveId)
```

are content/habitat metadata, not locomotion authority. Do not use chamber array order, pool identity or content-anchor roles as pathfinding shortcuts.

Tests should deliberately include a dungeon branch/deeper chamber so the implementation cannot accidentally assume one linear entrance->chamber route.

## NPC target boundary

`src/ai/npcAction.ts` still defines:

```ts
export type NpcPlannedAction = PlannedAction<ActionId> & {
  destination: NonNullable<PlannedAction<ActionId>['destination']>
  ...
}
```

The file documents `destination` as a plain `Vec3` snapshot.

The shared `PlannedAction` is used outside this NPC movement concern. Avoid widening it unless actual call-site inspection proves the context belongs there.

Preferred implementation direction:

```text
existing NpcPlannedAction.destination
→ normalize at the NPC movement boundary
→ MovementTarget { position, context }
```

or add the smallest NPC-specific target field if that avoids ambiguous destination semantics.

Requirements:

- existing surface action producers should not all need boilerplate context objects;
- cave target XYZ is authoritative;
- target context survives `next` action promotion/chaining;
- moving-target refreshes (e.g. `followAnimalId`) must not silently discard/reinvent context if they are ever allowed to target caves;
- do not maintain two long-lived competing destination authorities.

## `NpcAgent` is the main implementation site

The largest remaining work is in `src/ai/NpcAgent.ts`.

Keep route composition inside movement execution, below decision/strategy code:

```text
action decides WHERE
NpcAgent movement decides HOW
```

Do not teach work/mining/quest actions how cave entrances or topology routes work.

### Surface grounding hard blocker

Current code still contains direct surface placement such as:

```text
mesh.position.y = sampleHeight(...)
```

including home/surface placement paths. The implementation must audit all such writes and distinguish legitimate surface-only initialization from generic movement/catch-up paths.

The critical invariant is:

```text
current context = cave
=> generic locomotion/recovery must not call surface sampleHeight as ground authority
```

For cave movement use `queryGroundIn(caveId, ...)`.

### Horizontal movement underground

Use:

```text
candidate XZ
→ resolveHorizontalIn(caveId, ..., npc radius, standing height)
→ queryGroundIn(caveId, resolved XZ/Y)
→ resulting valid cave XYZ
```

Do not route cave movement through the ordinary cave presentation/collider registry; there is no longer a cave-wall collider authority.

### Entrance transition state

A small transient transition phase will likely be needed because `spatialContextAt()` correctly reports the open-sky mouth as surface until the NPC actually reaches underground cave occupancy.

Keep this state execution-only, e.g. conceptually:

```text
surface approach
mouth crossing
await cave-context confirmation
cave route
```

The transient phase must not author `currentCaveId`. The requested target/route carries the intended cave identity; actual membership is confirmed from XYZ through `spatialContextAt()`.

For cave -> surface, reverse the same physical route rather than teleporting to the approach point.

## Surface navigation and bounded A*

`src/navigation/navigation.ts` remains a bounded local obstacle fallback. Do not redesign it into a world-level cave router.

Its current query model is surface-oriented (`sampleHeight` / slope semantics). Preferred first implementation:

- keep existing surface A* unchanged;
- use topology route + local steering for cave movement;
- only generalize the `NavigationQuery` if a real cave-local obstruction case requires bounded A* after the common cave mover works.

If generalized, inject a domain-neutral ground/walkability query. `navigation.ts` must not import `createCaves`, `Caves`, `CaveTopology` or raw heightfields.

## Rescue / watchdog / time skip audit

Audit these families in `NpcAgent` and helpers:

```text
steerWithRescue
steerTo
attemptNavRepath
attemptLocalEscape
movement watchdog handling
emergency reposition / abandon
resolveTimeSkip
schedule/catch-up placement
```

Any rescue branch that computes `sampleHeight(x,z)` for an arbitrary NPC must be context-gated.

Cave recovery order should stay semantic:

```text
retry current cave leg
→ rebuild/re-attach route
→ local cave-valid escape
→ normal action failure
```

Never use "teleport to same X/Z on surface" as cave recovery.

### `resolveTimeSkip()`

Do not build a full aggregated cave traveler solely for this plan.

If the current time-skip code cannot safely advance a cave route, choose an explicit coherent limitation, for example retaining/aborting at a known valid semantic endpoint, rather than surface-projecting an underground position.

Document the chosen limitation in code/JSDoc and tests.

## Collision / slope / NPC separation

Surface collider logic remains relevant on the surface.

Underground cave rock containment is owned by `resolveHorizontalIn()`.

Review `npcColliderRim.ts` and any collider filtering before reusing surface collider checks underground. Ordinary world objects with valid vertical overlap may still matter, but cave wall collision must not be reconstructed from X/Z collider heuristics.

Likewise, surface slope sampling must not be evaluated with terrain `sampleHeight()` while the NPC is in a cave. Heightfield floor progression already carries authoritative underground elevation.

NPC separation can remain shared if it only changes local horizontal candidate movement and the resulting candidate is subsequently validated by the active domain provider.

## Composition / dependency threading

`NpcAgent` should receive a narrow semantic cave/world dependency through the existing settlement/app composition path.

Prefer an interface/function bundle containing only what NPC movement uses, such as the current-context, cave-ground, cave-horizontal and route-resolver functions.

Do not inject or import `WorldBundle` into `NpcAgent`.

Do not let `NpcAgent` reach into `createCaves.ts` private maps.

## Persistence and lifecycle

Do not persist:

- `WorldSpatialContext` as a second location authority;
- active route legs;
- topology waypoint cursor;
- mouth transition phase;
- cave graph results.

Re-derive spatial context from actual XYZ and rebuild movement-route state after runtime reconstruction/rebuild.

If implementation recon finds that general NPC world-position persistence/stream-out cannot preserve an underground loaded position, treat that as a general location-ownership limitation. Do not add a cave-only persistence field inside npc-027.

## Likely file map

Primary:

```text
src/ai/NpcAgent.ts
src/ai/npcAction.ts
```

Reuse directly:

```text
src/world/spatialContext.ts
src/world/createCaves.ts
src/world/caves/caveHabitat.ts
src/world/caves/caveTopology.ts
src/world/caves/caveHeightfieldQuery.ts
```

Touch only if the missing narrow seam is proven:

```text
src/navigation/navigation.ts
src/world/createCaves.ts
src/world/caves/caveHabitat.ts
```

Audit for surface assumptions:

```text
src/ai/npcMovementWatchdog.ts
src/ai/npcColliderRim.ts
src/terrain/slopeConstraint.ts
```

Composition wiring will be wherever `NpcAgent` is currently constructed from settlement/app dependencies; follow the existing ownership path rather than importing world state from the agent.

## Recommended implementation order

1. Add/normalize the NPC movement target to carry `WorldSpatialContext`; keep surface producers compatible.
2. Thread a narrow cave semantic dependency into NPC movement.
3. Add current-context resolution through `spatialContextAt()`.
4. Add route composition state for same-domain vs surface<->cave travel.
5. Reuse existing route-to-entrance/route-between machinery; add only a proven arbitrary-point attachment seam if necessary.
6. Implement physical mouth crossing and context confirmation.
7. Make common local movement use surface ground on surface and `resolveHorizontalIn()` + `queryGroundIn()` underground.
8. Remove/context-gate generic surface-Y snaps.
9. Make watchdog/recovery/time-skip context-safe.
10. Add archetype-focused tests: natural, adventure branch, dungeon branch/deeper chamber.
11. Run focused tests, then typecheck/lint/full tests/build.

This order intentionally avoids modifying `navigation.ts` until topology + steering proves insufficient.

## High-ROI automated tests

### Shared context / multi-agent safety

- same X/Z at surface Y and tunnel Y resolves to different `WorldSpatialContext`;
- interleaved NPC context/ground queries do not mutate player hysteresis or one another;
- `spatialContextsEqual()` rather than object identity controls equality.

### Target contract

- legacy surface action normalizes to `surface`;
- cave target preserves authoritative Y and `caveId`;
- `next` action promotion preserves the correct target semantics;
- final committed target is not replaced by an intermediate entrance waypoint.

### Route composition

- surface -> natural cave interior;
- natural cave -> surface;
- cave -> same cave target;
- requested `caveId` selects that cave's entrance, not nearest cave globally;
- presentation inactive still produces a valid semantic route.

### Archetype topology

- natural simple route;
- adventure junction/branch target;
- dungeon branch/deeper chamber target;
- disconnected nodes are never connected geometrically;
- pool/content anchors do not alter route authority.

Prefer reusing/extending `caveHabitat` tests for pure topology behavior instead of duplicating the same BFS assertions under `NpcAgent`.

### Local locomotion

- cave descent/ascent uses `queryGroundIn` floor;
- `resolveHorizontalIn` prevents walking through rock;
- overlapping surface terrain never snaps a cave NPC upward;
- surface movement still uses existing water/slope/collider semantics.

### Recovery / catch-up

- cave repath stays in the same cave;
- local escape cannot jump to surface;
- emergency surface recovery is context-gated;
- unreachable cave route reaches normal failure handling;
- time skip cannot surface-project a cave NPC.

## Manual browser verification

Performed by the Player, not the AI implementation agent:

- surface -> natural cave -> interior -> surface;
- adventure branch/deeper movement;
- dungeon branch/deeper chamber movement, including a cave with underground pool metadata;
- descent/ascent without Y snapping;
- same-XZ surface/cave target distinction;
- stuck/recovery behavior underground;
- cave presentation out of range does not alter semantic movement;
- ordinary settlement movement/work regressions.

## Model assessment

Recommended implementation model order reflected in the plan metadata:

```text
Sonnet, Composer
```

Reason: the task is now mostly a bounded cross-system integration with clear existing contracts, but `NpcAgent` has enough surface assumptions, recovery paths and movement-state interactions that the first implementation benefits from stronger reasoning. Composer is a reasonable cheaper fallback when following these notes closely; escalate if recon exposes a wider NPC position/persistence ownership problem.