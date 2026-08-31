# Implementation Notes: Shared NPC and Animal Pathfinding

**Plan:** `docs/plans/npc-006-shared-npc-animal-pathfinding.md`
**Status:** `planned` 📋
**Created:** 2026-08-31

## Implementation target

Implement the first shared navigation layer for NPCs and animals without replacing the existing locomotion/collision systems.

The implementation should be incremental:

```
decision / action / target
        ↓
navigation path request
        ↓
waypoints
        ↓
existing steering
        ↓
existing slope + collision movement
```

Do not redesign NPC or animal decision making as part of this work.

## Existing systems to inspect and reuse

Before changing code, inspect the current implementations of:

- `NpcAgent` — destination ownership, action lifecycle, steering and movement integration.
- `AnimalAgent` — chase/flee/wander target handling and steering.
- `npcMovementWatchdog` — existing stuck/repath/escape handling.
- `stepWithSlopeAndCollision()` and the existing slope constraint utilities — final movement validation and terrain handling.
- `ColliderRegistry` and its spatial queries — useful collision information, but not a complete navigation map.
- terrain height/slope sampling — navigation should reuse existing terrain knowledge.
- chunk/streaming code — navigation data must remain compatible with loaded-world boundaries.
- existing road/waypoint infrastructure — reuse concepts where appropriate, but do not turn road routes into the general pathfinder.

Read the current code at implementation time; do not assume file paths or APIs from this note are unchanged.

## Ownership

Keep responsibilities separated:

### Agent

Owns:

- decision/action lifecycle,
- current destination/target,
- target commitment,
- whether movement should happen,
- handling successful arrival,
- handling failed/abandoned actions.

### Navigation

Owns:

- determining whether a location/transition is navigable for an agent profile,
- finding a bounded local route,
- producing waypoints,
- reporting success/failure,
- invalidating or replacing a stale route.

### Locomotion

Existing steering remains responsible for:

- moving toward the current waypoint,
- movement speed/direction,
- final terrain/slope constraint,
- collision resolution.

Do not make Navigation directly mutate NPC/animal transforms.

## Navigation query boundary

Do not make A* call `ColliderRegistry` everywhere.

Introduce a small navigation-facing query abstraction around the information needed by path search.

The abstraction should be capable of answering questions equivalent to:

- is this location navigable?
- can this agent profile occupy it?
- can the agent move between these samples?
- what is the traversal cost?

Use existing terrain/slope/collision utilities internally where appropriate.

Important: collision geometry and navigation geometry are not automatically identical.

### House/door constraint

Current house colliders are known to be unreliable for navigation. In particular, a door may still expose a collider when the entrance is logically usable.

Therefore:

- do not encode “every collider blocks navigation” as a permanent architecture rule;
- keep a navigation query boundary that can later distinguish logical entrances from collision-only geometry;
- do not undertake a full house-collider rewrite in this implementation;
- add a focused test/manual scenario proving that the navigation layer can represent a passable entrance independently of the faulty collider assumption.

If the current code already exposes a suitable semantic door/entrance state, reuse it rather than adding duplicate state.

## First path-search implementation

Use a bounded local grid and A* for the first implementation.

Keep the search deliberately constrained:

- finite search area,
- finite node count,
- explicit failure,
- no global world graph,
- no global navmesh,
- no unbounded retry loop.

The exact cell size and search radius should be chosen from the existing world scale and verified with profiling rather than treated as immutable constants from this note.

Use an agent profile for properties that affect navigation, such as:

- body radius,
- maximum slope,
- terrain/water permissions,
- other existing movement restrictions that materially affect reachability.

Avoid duplicating agent movement constants if the existing systems already expose the authoritative values.

## Waypoints

A* output should not become a per-cell movement sequence.

After finding the route:

1. reconstruct the node path,
2. simplify consecutive nodes where direct traversal remains valid,
3. expose a compact waypoint sequence,
4. let existing steering consume the next waypoint.

Preserve required detours around obstacles.

The navigation result should be data, not an active movement controller.

## NPC integration

Find the existing code path where an NPC receives a destination and begins movement.

Integrate there rather than introducing a parallel movement state machine.

Expected behaviour:

```
new destination
    ↓
request path when appropriate
    ↓
follow waypoint
    ↓
next waypoint
    ↓
arrival
```

For short/local movement, direct steering may remain preferable if the implementation already has a suitable direct-path check. Do not force every tiny movement through A*.

### Repath

Use `npcMovementWatchdog` as the existing trigger for movement failure.

A repath may occur because:

- the agent is blocked/stuck,
- the current route is invalid,
- the target moved materially,
- a navigation assumption changed.

A repath must retain the current destination/action.

Do not turn:

```
repath → select another target
```

into the implementation.

## Animal integration

Start with the highest-value cases:

1. predator chase,
2. flee.

Only then extend the same mechanism to wander/forage/drink/eat where pathfinding provides real value.

For chase:

- the committed prey remains the target;
- target movement alone should not cause a path request every frame;
- use a meaningful displacement/validity threshold before recalculating.

For flee:

- preserve the existing flee destination/decision logic;
- Navigation determines how to reach that destination around obstacles.

Do not introduce an animal-specific pathfinder.

## Target commitment

The target commitment introduced by `npc-005` is upstream of navigation.

The relationship must remain:

```
target selection
    ↓
target commitment
    ↓
navigation
    ↓
locomotion
```

A failed path must not silently select a different prey/target.

If an action cannot be completed because no route exists, return the appropriate existing failure/escape/abandon behaviour instead of inventing new target-selection rules.

## Streaming and chunk boundaries

Inspect the current chunk/terrain APIs before choosing the navigation-grid ownership.

Do not create a global grid for the world.

Navigation data should be created or queried only where required by an active path request.

Be careful at loaded/unloaded chunk boundaries:

- a path request must not assume unavailable terrain data is valid;
- avoid forcing distant chunk loading solely to satisfy detailed NPC movement;
- failure at a simulation boundary should integrate with existing off-screen/hybrid behaviour.

If the current streaming API does not support the required query cleanly, keep the navigation adapter narrow rather than coupling A* directly to streaming internals.

## Performance implementation rules

The first implementation must be request-driven.

Avoid:

```
every agent × every frame × A*
```

Prefer:

```
movement begins
    → path request

route invalid/stuck
    → repath

normal follow
    → no search
```

Add lightweight instrumentation for:

- path requests,
- successful/failed searches,
- search duration,
- visited nodes,
- route length,
- waypoint count,
- repath count,
- currently active paths.

Use the project's existing performance/debugging conventions if available.

Do not add a worker solely because A* is CPU work. First benchmark the main-thread implementation with realistic active-agent counts.

Do not add path caching before measurements show repeated equivalent searches are significant.

## Performance test scenarios

Benchmark at least:

1. no active pathfinding — baseline;
2. several NPCs moving to destinations;
3. several animals chasing/fleeing;
4. mixed NPC + animal population;
5. forced obstacle-heavy paths;
6. repeated repaths.

Record the project's existing frame-time metrics where possible and correlate them with navigation counters.

The useful question is not only “how long is one A*?” but:

> how much total frame time does navigation add at realistic active-agent counts?

## Testing strategy

Keep the path search itself as deterministic/pure as practical so it can be unit tested independently from Three.js objects.

Minimum automated coverage:

- direct route,
- route around an obstacle,
- no route,
- agent profile with different walkability,
- slope restriction,
- water/terrain restriction where supported,
- waypoint simplification,
- bounded search failure,
- repath does not alter committed target,
- normal path following does not request a search every frame.

Avoid tests coupled to rendered meshes when a pure navigation test can verify the same behaviour.

## Browser verification scenarios

Manually verify:

### NPC

- NPC can walk around a blocking obstacle.
- NPC reaches representative house/work/storage destinations.
- An entrance can remain navigable even when the underlying door collider would otherwise produce a false block.
- A stuck NPC eventually requests a new route rather than repeatedly pushing against the same obstacle.
- Repath preserves the original destination.

### Animals

- wolf can route around an obstacle while chasing prey;
- wolf continues chasing the same committed prey after repath;
- fleeing animal can route around an obstacle;
- normal wandering does not produce excessive path requests.

### Performance

- compare baseline and pathfinding-enabled scenarios;
- inspect frame-time behaviour with a representative population;
- verify that normal path following does not cause continuous search activity.

## Likely extension points — do not implement prematurely

If profiling shows navigation is too expensive, consider in this order:

1. reduce unnecessary path requests/repaths;
2. waypoint/path reuse where semantically safe;
3. batching;
4. coarse/shared route caching;
5. hierarchical navigation;
6. Web Worker processing.

Do not add all of these proactively.

## Code quality

Prefer existing project types, utilities and update loops over new parallel abstractions.

Avoid:

- God-object navigation managers,
- duplicated collider/slope logic,
- navigation state duplicated in both agent and navigation,
- per-frame allocations for path following,
- permanent global navigation data for the whole streamed world.

When adding important public/architectural functions or classes, add concise JSDoc as required by the project's preflight/discovery tooling.

For domain-specific APIs, consider an appropriate `@domain` tag, e.g. `@domain npc`.

## Verification before completion

Before marking the plan complete:

1. run the relevant unit/type/build checks;
2. run the pathfinding-specific tests;
3. run the existing test suite relevant to NPC/fauna/movement;
4. inspect the diff for duplicated movement/collision logic;
5. run the browser scenarios above;
6. collect performance measurements and record any meaningful regression/improvement;
7. confirm that no pathfinding search is accidentally running every frame.

Do not rely on documentation as evidence that an existing API behaves a certain way; verify the current implementation.

**Zrób git commit i push do main, rebase jeżeli trzeba**
