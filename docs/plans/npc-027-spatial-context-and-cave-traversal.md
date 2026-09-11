# Plan: Spatial-context-aware NPC movement and cave traversal

**Created:** 2026-09-08
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** L
**Depends on:** ~~world-terrain-019~~, ~~npc-006~~, ~~npc-007~~
**Domain:** `npc`
**Subdomains:** `behavior` `work`
**Tags:** `movement` `navigation` `caves` `spatial-context` `off-screen`
**Roadmap:** `quests-abandoned-gold-mine-colony.md`

## Goal

Extend generic NPC movement so an NPC can physically move between the surface and Cave V2, navigate inside the cave, reach an authoritative target, and return to the surface.

The mechanism must be generic:

```text
surface
→ cave entrance
→ cave interior
```

and:

```text
cave interior
→ cave entrance
→ surface
```

It must not depend on the abandoned gold mine, mining, a particular quest, a particular cave topology, Player position/camera, or teleportation between navigation spaces.

The intended architectural flow is:

```text
NPC current spatial context
+ authoritative movement target
→ resolve navigation-domain route
→ move locally inside current domain
→ physically cross a valid transition
→ continue inside next domain
→ reach final target
```

This plan is a prerequisite for `world-018-cave-aware-rich-finite-resource-deposits.md` when NPC cave mining is enabled there.

## Core invariants

> **An NPC target inside a cave must never derive its authoritative Y from surface `sampleHeight(x, z)`.**

> **Surface and cave locations with overlapping X/Z must remain semantically distinct.**

> **NPCs enter and leave caves through ordinary Cave V2 entrances/transitions. No cave teleport is allowed.**

> **Cave V2 remains the owner of cave identity, topology, containment, floor semantics and entrance connectivity. NPC movement consumes those semantics rather than duplicating them.**

> **Cave topology is coarse connectivity/route intent; Cave V2 spatial representation remains authoritative for local floor, containment, clearance and walkability.**

> **NPC navigation state must not become a second authority for cave membership. Transition progress may be transient, but actual world position plus Cave V2 spatial semantics remain authoritative.**

> **Do not introduce mine-specific movement classes, target types or routing logic.**

> **Do not turn the existing bounded local A* into a global world navmesh.**

> **Navigation validity must not depend on cave render-mesh activation or Player/camera proximity.**

> **Detailed locomotion and simplified/off-screen simulation must describe the same logical route through the same spatial domains.**

## Current architecture to preserve

### NPC actions and destinations

NPC movement is currently driven through:

```text
NpcPlannedAction.destination
→ goTo
→ steerWithRescue()
→ steerTo()
```

`NpcPlannedAction.destination` is currently a plain `Vec3`. Movement execution lives primarily in `src/ai/NpcAgent.ts` and `src/ai/npcAction.ts`.

Do not redesign the NPC decision/Goal/Plan/Strategy architecture.

Do not assume `NpcPlannedAction` itself must own the new spatial target contract. During implementation, identify the narrowest shared movement-target boundary; promote spatial context into `PlannedAction` only if current consumers prove that is the coherent ownership point.

### Local navigation

Reuse `src/navigation/navigation.ts`.

The current `findPath()` is a bounded local-grid A* used as a stuck/blocked fallback. Keep its existing role:

```text
normal movement
→ straight/local steering

genuine obstruction
→ bounded local route
```

Do not make full A* routing mandatory for every ordinary surface movement step.

### Movement constraints

Reuse the existing shared locomotion primitives where their assumptions still apply:

- `src/terrain/slopeConstraint.ts`
- `src/ai/npcColliderRim.ts`
- `src/ai/npcMovementWatchdog.ts`

Surface movement must retain current water avoidance, slope limits, collider avoidance, final destination approach and stuck/repath behaviour.

Cave movement requires domain-correct ground/slope/walkability semantics rather than forcing surface `sampleHeight()` assumptions into caves.

### Cave V2

This plan depends on the production result of `docs/plans/world-terrain-019-cave-heightfield-production-migration.md`.

Consume the final Cave V2 contracts rather than transitional spike/V1 compatibility APIs.

Cave V2 owns:

```text
caveId
entrance
topology
segments / connectivity
interior spatial representation
containment
floor / ceiling semantics
collision / traversal validity
```

The current `CaveTopology` direction already provides useful semantic data: stable cave identity, entrance, authoritative XYZ nodes, connected segments and XYZ centerlines. After `world-terrain-019`, reconfirm exact production APIs and names before implementation.

## Spatial-context contract

Introduce or extend the smallest shared representation capable of distinguishing at least:

```text
surface
cave:<caveId>
```

Conceptually:

```text
SpatialContext
  surface
  cave(caveId)
```

The exact TypeScript representation should follow final production cave/world ownership after `world-terrain-019`.

Do not create `NpcCaveContext`, `MinerSpatialContext` or `ResourceSpatialContext` if a general world/Cave V2 spatial identity can own the concept.

The context describes where a world position belongs, not what an NPC is doing. World/Cave V2 owns spatial-domain identity; NPC movement consumes it.

Avoid storing duplicate cave ownership/state in `NpcAgent`.

## Generic movement target

Extend the narrowest existing movement/action destination boundary so movement execution can receive:

```text
authoritative world-space XYZ
+
spatial context
```

Conceptually:

```text
MovementTarget {
  position: { x, y, z }
  context
}
```

Do not mechanically widen every `PlannedAction` consumer if a narrower compatible movement-target abstraction is sufficient.

### Authoritative position

For a surface target, Y may originate from the normal surface placement/terrain owner.

For `cave:<caveId>`, Y must originate from Cave V2 spatial semantics. `NpcAgent` must not overwrite a cave target's Y using `sampleHeight(x, z)`.

The target does not imply free 3D straight-line movement. Y identifies the correct destination; each navigation domain still owns the walkable floor used while traversing it.

### Backward compatibility

Existing surface actions should require minimal call-site churn. If practical, normalize ordinary surface destinations to `position + surface context` at one ownership boundary rather than requiring every existing action producer to construct new boilerplate.

Do not maintain two permanently parallel destination systems.

## Current spatial context and transition continuity

NPC movement needs to determine whether the NPC currently occupies `surface` or `cave:<caveId>` using canonical world/Cave V2 spatial semantics.

Do not infer cave membership from X/Z alone, proximity to an entrance, render mesh presence, current action kind or target context.

Because surface and cave spaces may overlap in X/Z, context resolution must be Y-aware.

During entrance crossing, avoid naïve per-frame context flapping at the mouth boundary. The intended rule is:

```text
actual XYZ
+ canonical Cave V2 containment/transition semantics
+ transient transition-aware continuity where the portal boundary is ambiguous
→ current movement context
```

Any transient transition state exists only to execute a physical crossing; it must not replace world position/Cave V2 semantics as the authority for where the NPC is.

### Persistence

Do not add a second persisted NPC location state solely for this feature unless implementation proves it is required.

Current runtime movement execution, pending action and path state are transient. Prefer authoritative actual position plus canonical world spatial queries, with only transient navigation-route/transition state where needed.

## Navigation-domain routing

Add a generic route-composition layer between the committed movement target and local locomotion:

```text
current context
+ target context
→ domain route
```

If both contexts match, route locally inside that domain:

```text
surface → surface
cave:A → cave:A
```

If contexts differ, resolve valid transitions. L1 production support must cover:

```text
surface → cave:A
cave:A → surface
```

The route may conceptually contain:

```text
surface-local
→ transition
→ cave-local
```

Do not model domain routing as an NPC AI decision. It is movement execution for an already committed target.

## Cave entrance transition

Cave V2 remains authoritative for valid entrances. Consume its final entrance/transition representation rather than inventing NPC-specific entrance points.

The transition must expose enough semantics to distinguish the surface approach, physical crossing, cave interior side and associated `caveId`; the literal API is implementation-defined by the final Cave V2 contract.

### Surface → cave

```text
NPC on surface
+ target in cave:A
→ resolve valid entrance for cave:A
→ move across surface to entrance approach
→ follow physical mouth/transition path
→ cross into Cave V2 containment
→ confirm cave:A context
→ begin cave-local route
```

Context must not switch merely because the NPC is near the entrance.

### Cave → surface

```text
NPC inside cave:A
+ target on surface
→ route through cave topology toward a valid exit
→ reach interior side of entrance
→ physically cross mouth/transition
→ leave cave:A containment
→ continue normal surface movement
```

## Cave coarse routing

Use Cave V2 topology as the first production coarse routing mechanism. Do not introduce a complete navmesh unless implementation proves topology plus local steering cannot represent required movement.

The expected source is the production equivalent of `CaveTopology.nodes`, `CaveTopology.segments` and segment XYZ `centerline` data.

For a cave-local route:

```text
current interior position
→ resolve relevant topology node/segment
→ resolve target node/segment
→ graph path through connected segments
→ produce semantic/local waypoints
→ local cave steering
```

Route planning must use deterministic semantic Cave V2 data and must not require active render geometry, triangle raycasts, camera position or Player presence.

Segment centerlines are suitable coarse route guidance because they preserve XYZ bends/descent/ascent, but they are not a walkability authority.

Disconnected cave sections must never be considered reachable merely because their XYZ positions are close. Use topology connectivity.

Future loops, branches and multiple entrances should be representable by the same mechanism even if L1 caves remain simple.

## Local cave locomotion

Extend movement execution so local steering is navigation-domain-aware. Do not create a separate `MineNpcMovement`.

Keep the ownership split explicit:

```text
CaveTopology
= coarse connectivity / route intent

Cave V2 spatial representation
= local floor / containment / clearance / walkability authority
```

Conceptually:

```text
local movement request
+ current navigation domain
→ domain ground/traversal provider
→ domain collision/containment provider
→ physical movement
```

### Surface provider

Preserve existing `sampleHeight`, water rules, surface slope, ordinary colliders and bounded local A* fallback.

### Cave provider

Cave movement must use Cave V2 semantics for floor, walkable interior, local slope/elevation, walls, containment, clearance and vertical collision filtering. It must not use surface water or surface height as authoritative ground.

### XYZ movement

NPC locomotion does not need to become a free-flying generic 3D pathfinder. NPCs remain ground-constrained walkers:

```text
horizontal/local route progress
+
domain-owned walkable floor/elevation
→ resulting XYZ
```

Cave topology supplies route intent; Cave V2 spatial queries validate and ground the actual local movement.

Do not allow direct interpolation through cave ceilings, walls, solid rock or overlapping surface terrain.

## Collision

Reuse shared collider infrastructure where Cave V2 continues to expose collision through it.

NPC cave collision must respect vertical collider extent the same way Player cave movement does. A cave wall below the surface must not block an NPC walking on the hillside above it; a surface collider must not become a cave obstacle merely due to overlapping X/Z unless its vertical extent makes that valid.

If `world-terrain-019` changes cave collision ownership, follow its final production contract. Do not create a second cave collision world for NPCs.

## Local cave obstacle recovery

Preserve the existing movement watchdog/rescue concept, but make surface assumptions context-safe.

A cave-stuck NPC must never recover through teleport to a surface-grounded point or `mesh.position.y = sampleHeight(...)`.

Prefer:

```text
re-evaluate current cave leg
→ local cave repath / topology waypoint correction
→ nearby valid point in same cave context
→ abandon current action if genuinely unreachable
```

Do not cross navigation domains as a generic stuck-rescue shortcut.

Any existing emergency teleport fallback retained for surface NPCs must be explicitly prevented from moving cave NPCs through rock or onto the surface.

## Integration with existing bounded A*

Do not replace `navigation.findPath()`.

For surface movement it remains the existing bounded obstacle fallback. For caves, first prefer:

```text
Cave V2 topology
→ coarse route
→ local steering
```

A local bounded search may be reused inside a cave only if the final Cave V2 spatial API can provide domain-correct walkability and floor/slope queries without projecting everything back onto surface terrain.

If the cleanest implementation is to generalize the narrow navigation query from surface `sampleHeight` to a domain-specific ground sampler, do so without turning `navigation.ts` into a world/Cave V2 owner.

## Action integration

The generic movement system should work for any NPC action whose target is spatially valid, including future mine, work, carry, inspect, visit, deliver or combat-pursuit actions.

No action-specific cave routing branch should exist.

The action producer commits to what the target is and where it is. Movement owns how to physically reach it.

Do not teach `npcProfessionWork.ts` how cave entrances work.

## Player semantic reuse

Player and NPC do not need to share one locomotion implementation.

They should share Cave V2/world semantics for cave containment, cave identity, entrance transition, floor resolution and collision validity.

Current Player behaviour already establishes the useful general rule that actual XYZ resolves cave ground when inside a cave and surface ground otherwise. Extract/reuse semantic queries where appropriate rather than making NPC depend on a Player-specific query type.

Do not create an NPC-only interpretation of Cave V2 space.

## Hybrid and off-screen compatibility

This plan does not implement a full remote NPC movement executor.

Its semantic routing inputs and route legs must nevertheless be Three.js/presentation-independent and usable without active cave render geometry. Detailed movement and future aggregated movement must be able to refer to the same spatial domains, transitions and topology.

Do not add speculative remote-route APIs, persisted route length or exact off-screen interpolation unless an existing consumer requires them during implementation.

## Cave streaming and lifecycle

Movement validity must use Cave V2 semantic data independent of presentation streaming.

Current cave presentation/collider activation may be Player-observer-driven. After `world-terrain-019`, reconfirm the production lifecycle.

Required invariant:

```text
cave semantic topology / transitions / traversal data
≠
cave render activation
```

An NPC must not conclude that a cave does not exist or has no valid route merely because its mesh is not active.

If detailed cave locomotion requires active collision proxies, integrate their activation with the existing Cave V2 lifecycle rather than creating an NPC-owned cave activation manager. Do not generate all cave meshes globally merely to support NPC navigation.

## Stage A — Reconfirm final Cave V2 contracts

After `world-terrain-019` reaches its production architecture, identify:

- canonical `caveId` and cave lookup;
- entrance representation and transition semantics;
- Y-aware containment;
- floor/ceiling query;
- topology nodes/segments/centerlines and connectivity;
- collision/traversal query;
- lifecycle/streaming separation;
- multi-level-safe spatial API.

Do not implement against `buildSpikeTestTopology`, `topologyToCaveDefinition` or transitional `CaveVolume` assumptions unless they remain intentionally part of the final Cave V2 contract.

If Cave V2 lacks a narrow semantic query required by generic movement, extend Cave V2 at its existing ownership boundary rather than reimplementing that knowledge under `ai/`.

## Stage B — Introduce shared spatial context

Add the smallest reusable representation for `surface` and `cave:<caveId>` at the appropriate world/navigation boundary.

Add focused helpers for context resolution/comparison and cave identity where needed. Include transition-aware continuity at an entrance without making transient navigation state authoritative.

Do not change NPC AI behaviour in this stage.

## Stage C — Make movement targets spatially explicit

Extend the narrowest movement target boundary so NPC movement receives authoritative XYZ plus spatial context.

Migrate existing surface destinations through one coherent compatibility path.

Do not leave permanent mixed semantics where some destinations have authoritative XYZ while others silently let the mover invent Y without an explicit surface resolver.

## Stage D — Domain-route composition

Introduce generic route composition:

```text
same context
→ one local route

different contexts
→ local route
→ transition
→ local route
```

For this plan, production support must cover `surface ↔ cave`.

Use Cave V2 entrance identity rather than nearest-point heuristics. Keep committed target identity unchanged while traversing intermediate transition legs.

## Stage E — Cave topology routing

Implement bounded deterministic graph routing over Cave V2 semantic topology.

Support entrance-to-interior, interior-to-entrance and interior-to-interior routes, plus branches where topology provides them. Use deterministic tie-breaking where several equal routes exist.

Produce local XYZ route guidance from topology/centerlines, while leaving local validity to Cave V2 spatial queries.

Do not add a general-purpose graph framework unless the current topology cannot be handled cleanly with a small pure helper.

## Stage F — Domain-aware local locomotion

Refactor the smallest part of NPC movement necessary so locomotion can consume a surface traversal provider or cave traversal provider.

Preserve speed, health movement modifiers, movement watchdog, action arrival semantics, final approach behaviour and NPC separation where valid.

Make Y updates domain-correct. Do not redesign animations, combat or decisions.

## Stage G — Context-safe repath and rescue

Audit `steerWithRescue`, `attemptNavRepath`, `attemptLocalEscape`, emergency recovery and `applySeparation` for surface assumptions.

Ensure a cave NPC remains within the current cave during local recovery, cannot be grounded to the surface, cannot bypass a domain transition and cleanly abandons an unreachable action rather than escaping through rock.

Surface behaviour should remain unchanged.

## Stage H — Off-screen compatibility boundary

Ensure the resulting domain route, transition identity and topology route are semantic and presentation-independent so a later aggregated executor can consume the same concepts.

Do not implement a new off-screen movement executor or speculative API solely for that future consumer.

Document the ownership boundary so later remote mining/logistics plans do not recreate cave-route logic.

## Integration with world-018

Update `world-018-cave-aware-rich-finite-resource-deposits` to depend on this plan for NPC cave mining.

`world-018` remains responsible for cave-aware resource target position/context, resource selection and mining mutation/depletion.

This plan remains responsible for:

```text
NPC movement from current location
→ target spatial context
→ physical arrival
```

Do not move resource-query logic into navigation.

## Non-goals

Do not implement:

- abandoned-mine-specific movement;
- the abandoned mine quest;
- gold deposits or new mining behaviour;
- settlement remote mining strategy;
- generic world-wide navmesh;
- procedural navmesh generation;
- free-flight 3D pathfinding;
- a new physics engine;
- full NPC AI redesign;
- AnimalAgent cave support or cave fauna;
- full remote/off-screen NPC executor;
- persistence of path waypoints or transient movement phase;
- a Worker-based navigation rewrite;
- automatic activation of every cave in the world.

Animal cave traversal may later reuse the same spatial context, transition and Cave V2 routing concepts without being implemented here.

## Expected primary files

Reconfirm exact ownership after `world-terrain-019`, but current likely integration points are:

```text
src/ai/NpcAgent.ts
src/ai/npcAction.ts
src/navigation/navigation.ts
src/terrain/slopeConstraint.ts
src/ai/npcMovementWatchdog.ts
src/ai/npcColliderRim.ts
src/world/createCaves.ts
src/world/caves/caveTopology.ts
```

Final Cave V2 production modules may replace current transitional `src/world/caveVolume.ts` / `src/world/caves/topologyAdapter.ts` integration points.

A shared target change may additionally touch `src/simulation/types.ts`, but only if current ownership proves it is the correct generic boundary.

For important architectural/public functions and classes introduced by implementation, add concise JSDoc where it improves preflight discovery; use the appropriate `@domain` tag where useful.

## Tests

Add focused unit/integration coverage for at least:

### Spatial contexts

- `surface != cave:A`;
- `cave:A != cave:B`;
- overlapping X/Z can resolve differently according to Y;
- entrance crossing does not flap context at the portal boundary.

### Target semantics

- cave target retains authoritative Y;
- surface target retains current behaviour;
- no cave target is re-grounded through surface `sampleHeight`.

### Domain routing

Cover `surface → surface`, `surface → cave`, `cave → surface` and `cave → same cave`. Invalid/disconnected transitions must fail explicitly.

### Cave topology

- deterministic graph route;
- entrance → chamber;
- chamber → entrance;
- branch routing;
- disconnected topology rejected;
- centerline XYZ preserved.

### Physical transition

Verify state progression requires crossing the entrance rather than proximity-based context switching.

### Cave local movement

- descent/ascent follows Cave V2 floor;
- NPC does not pass through cave wall;
- NPC does not snap to surface at overlapping X/Z;
- surface/cave colliders do not incorrectly block based only on X/Z.

### Rescue

- cave repath stays in the same cave;
- local escape stays inside valid interior;
- emergency surface teleport is not used inside a cave;
- unreachable cave target eventually follows normal failure/abandon lifecycle.

### Regression

Existing surface NPC behaviour must retain obstacle avoidance, water avoidance, slope limits, interaction final approach, stuck A* fallback and normal action completion.

## Performance

Keep routing request-driven. Do not run cave graph searches every frame.

Cache the current logical route for the active movement commitment and invalidate it only when materially necessary, for example when the committed target changes, selected transition becomes invalid, route becomes blocked, watchdog requests repath or topology/lifecycle rebuild invalidates the world reference.

Cave topology routes should be cheap compared with local A*. Avoid render-mesh analysis and mesh raycasts as the normal navigation data source.

Do not move navigation to a Worker without profiling evidence.

## Verification

Technical verification should include the smallest relevant set:

```text
npx tsc --noEmit
pnpm run lint:fix
pnpm run test
pnpm run build
```

Add focused automated tests before relying on the full suite.

Browser verification is performed by the Player.

### Manual browser checklist

Verify at least:

1. Existing surface NPC movement remains unchanged.
2. NPC on the surface walks to a Cave V2 entrance and physically enters it.
3. NPC follows the cave rather than cutting through hillside, ceiling or walls.
4. NPC reaches a target in a deeper chamber with correct Y.
5. NPC can return from the chamber to the surface.
6. Surface and cave targets at similar X/Z are not confused.
7. NPC does not snap vertically to terrain while underground.
8. NPC stuck inside a cave does not emergency-teleport onto the surface.
9. Player/camera distance does not alter the semantic route or world state.
10. Cave deactivate/reactivate or `WorldBundle` rebuild does not change stable cave identity/topology.
11. Existing settlement NPC movement, wells, buildings and work-contract movement still behave normally.

## Completion criteria

The plan is complete when:

- a generic movement target carries authoritative position plus spatial context at the narrowest coherent ownership boundary;
- surface and Cave V2 spaces are distinguishable even when X/Z overlap;
- NPCs can physically enter and leave ordinary Cave V2 caves;
- transition routing uses canonical Cave V2 entrances;
- cave topology provides coarse routing while Cave V2 spatial representation remains authoritative for local traversal;
- cave movement uses cave-owned floor/containment/collision rather than surface `sampleHeight`;
- no full navmesh is required for the current Cave V2 topology;
- existing surface bounded A*/steering semantics remain intact;
- stuck recovery cannot move a cave NPC through rock or onto the surface;
- NPC navigation state is not a second authority for cave membership;
- semantic navigation does not depend on render activation, Player or camera;
- the route model remains compatible with later aggregated/off-screen travel without implementing that executor now;
- no mine-specific movement mechanism exists;
- `world-018` can consume the resulting generic movement contract for NPC cave mining;
- automated verification passes;
- Player receives a concrete browser verification checklist.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
