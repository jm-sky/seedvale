# Implementation Notes: NPC Navigation — Interaction Destination Approach

## Current architecture / ownership

- src/ai/NpcAgent.ts owns NPC locomotion, movement destination resolution, stuck detection/repath integration and the interaction/action flow.
- src/navigation/navigation.ts owns the shared bounded local-grid A* implementation and waypoint simplification. It is intentionally not a global navmesh and is not run on every normal movement tick.
- src/ai/npcMovementWatchdog.ts is the shared watchdog/rescue mechanism. NPC repath is triggered only after genuine stuck/blocked movement; the normal NPC path remains straight-line steering plus local obstacle handling.
- InteractionQueue owns serving/waiting positions and exposes the world-space destination for a queue member. Do not duplicate queue-position calculation inside navigation.
- Well interaction uses the existing interaction-anchor/serving-position pipeline and existing collider registration. The well is a regression case for the generic interaction-destination problem.

## Important integration points

### NpcAgent movement

The important path through NpcAgent is:

goTo / current action destination
→ current movement destination
→ straight-line steerTo
→ steerWithRescue
→ watchdog-triggered attemptNavRepath
→ shared navigation.findPath
→ waypoint following
→ final movement toward the actual action destination.

goTo refreshes a queue-backed action destination from InteractionQueue.worldDestination(this.id). Therefore do not assume that queue destinations are permanently cached in the action.

### Navigation

attemptNavRepath supplies navigation with an exterior-walkability callback rather than the destination-aware locomotion walkability check.

This distinction is the first thing to inspect during implementation:

- navigation must reject ordinary collider interiors;
- locomotion has additional semantics for a legal interaction destination close to a collider;
- the fix must not make arbitrary collider penetration legal.

The A* grid is relatively coarse (1.5m cell size) compared with the final approach distances used by interaction points. findPath can resolve an unusable goal to a nearby walkable grid cell. Treat that grid cell as a navigation waypoint, not automatically as proof that the exact interaction destination is reachable.

### Final approach

The existing locomotion path already contains destination-aware collider handling (isWalkable, resolveSteerTarget, stepWithSlopeAndCollision). Reuse it for the final interaction approach.

Do not introduce a second collision geometry implementation and do not special-case well.

## Queue lifecycle

worldDestination(agentId) is dynamic because queue membership/order determines whether an agent is waiting or serving.

When implementing any route invalidation, compare the destination actually used to construct the active navigation route with the current queue destination. Do not invalidate A* merely because the NPC remains in a queue.

The important transition to verify is:

waiting slot → serving slot

If the existing per-tick destination refresh already guarantees correctness, avoid adding a second route-state mechanism.

## Collider semantics

The well serving point is intentionally very close to the well collider. The existing locomotion code has an approach allowance for destinations close to a collider.

Important constraints:

- do not reduce the well collider;
- do not move the serving point just to hide the movement problem;
- do not increase the global approach buffer as a workaround;
- do not let A* treat all collider interiors as walkable.

The desired distinction is:

A* finds a safe route around obstacles
and
locomotion performs the short, destination-aware final approach.

Whether this requires an explicit approach target or only a goal-cell/final-waypoint correction must be determined from the runtime trace before implementation.

## Watchdog / rescue

The trace from Piotr shows repeated:

repath → escape → repath → escape → abandon

The current rescue lifecycle already clears the active repath state when an escape is performed, and abandonment resets movement state. Do not blindly add another watchdog reset or change timeout thresholds.

During implementation, verify whether an escape actually produces measurable movement toward a valid destination. If it does not, the problem is likely upstream in route/goal selection or downstream in collision rejection rather than watchdog timing.

## Recommended implementation order

1. Add focused diagnostics around the Piotr/well route, only at existing navigation/rescue boundaries.
2. Capture actual queue destination, navigation goal/grid cell, resolved goal cell if different, first/last waypoint, NPC position before/after waypoint movement, collider signed distance near the final destination, movement-step rejection, and destination changes.
3. Reproduce the stuck sequence and identify the first point where progress stops.
4. Make the smallest change at that ownership boundary.
5. If the failure is at the navigation/goal boundary, make final approach explicit without changing general collider semantics.
6. If the failure is in locomotion, fix the existing destination-aware movement path instead of changing A*.
7. Only add queue-route invalidation if the trace demonstrates that an active route survives a meaningful destination change.
8. Add regression coverage for the well queue and at least one ordinary non-queue interaction destination near a collider.
9. Run TypeScript/tests/build.
10. Provide concrete browser verification steps for the user; passing technical checks is not proof of correct NPC gameplay.

## Architectural pitfalls

- Do not turn findPath into the normal movement mechanism. Plan npc-006 deliberately limits A* to genuine stuck/blocked situations.
- Do not create a well-specific navigation branch.
- Do not replace the existing queue destination resolver with a navigation-specific destination cache.
- Do not duplicate collider/rim/anchor calculations.
- Do not solve a coarse-grid goal problem by globally shrinking colliders or increasing walkability tolerance.
- Keep NPC target commitment intact: repath must not change the committed interaction target.
- Keep the shared navigation module usable by AnimalAgent; avoid an NPC-only API unless the distinction is genuinely part of the shared navigation contract.
- Preserve deterministic bounded A* behaviour and current performance characteristics.

## Current-state discrepancy to keep in mind

docs/STATE.md describes npc-006 as implemented and says repath is a genuine stuck-only fallback to A*. The new work is therefore a correction of the integration between that existing navigation system and interaction destinations, not implementation of pathfinding from scratch.

If the implementation changes the navigation/movement contract materially, update docs/STATE.md because it is the current architecture snapshot.
