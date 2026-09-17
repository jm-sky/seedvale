# Implementation notes: settlements-018 pasture/paddock fence road clearance and collision

## Current ownership and data flow

`VillagePlan` owns both satellite fence definitions:

- `VillagePlan.pasture.fenceSegments`
- `VillagePlan.paddock.fenceSegments`

Both use `VillagePastureFenceSegment` plain data (`ax/az/bx/bz`). Do not introduce another persisted/runtime fence authority.

Presentation converts those segments to `PropPlacement[]` in:

- `src/settlement/villagePasture.ts::pastureFencePlacements()`
- `src/settlement/villagePaddock.ts::paddockFencePlacements()`

`src/settlement/props.ts::buildSettlementProps()` then passes those placements to `plantEntrancePalisade()` with distinct instance names. This means the final placement arrays are already the correct seam for collision projection; do not derive collision from `InstancedMesh` transforms.

## Existing collision pattern to reuse

`src/settlement/settlementPalisade.ts` is the canonical precedent from `settlements-015`:

- `SettlementPalisadePlacement = PropPlacement`;
- `resolveEntrancePalisadePlacements()` produces final plain-data placements;
- `plantEntrancePalisade()` consumes placements for presentation;
- `settlementPalisadeColliders()` maps each final placement to one `obb` collider;
- `PALISADE_WALL_HALF_DEPTH = 0.3`;
- `WALL_HALF_LENGTH = 2.2` matches the fitted `wall.glb` segment contract.

The pasture/paddock visuals use the same `plantEntrancePalisade()` / wall asset pipeline, so collision dimensions should reuse the same visual contract rather than invent pasture-specific radii.

Preferred shape: extract a small reusable pure function in/near `settlementPalisade.ts`, conceptually:

```ts
fencePlacementColliders(placements: readonly PropPlacement[]): Collider[]
```

and keep `settlementPalisadeColliders()` as a compatibility/semantic wrapper if that preserves existing call sites/tests cleanly.

Do not force oriented fence placements through `settlementPropColliders.ts`; that module intentionally owns simple landmark disks (stockpile, wagon, campfire), not oriented wall geometry.

## Settlement collider lifecycle

`src/settlement/createSettlement.ts` already owns settlement collider registration and unload lifecycle.

Current registration combines roughly:

```text
wellColliders
+ settlementHouseColliders(...)
+ settlementPropColliders(...)
+ settlementPalisadeColliders(palisadePlacements)
→ registerColliders(def.id, ...)
```

and unload/rebuild clears the same settlement id.

Extend this single registration. Do not add separate registry keys or lifecycle for pasture/paddock fences.

Important implementation detail: `createSettlement.ts` currently has direct access to the resolved settlement palisade placements, while pasture/paddock placements are materialized inside `buildSettlementProps()`. Avoid independently recomputing their placement geometry in `createSettlement.ts` if the existing `props.ts` result can expose/reuse the canonical arrays. The invariant is presentation and collision consume the same final `PropPlacement[]` values.

A small return-field/result contract from prop building is preferable to duplicated conversion calls if duplication could drift. If `pastureFencePlacements()` / `paddockFencePlacements()` are pure and deterministic and already use only `VillagePlan` + `sampleHeight`, calling the same canonical helpers at both consumers is acceptable only if both call sites consume exactly the same source data and constants. Prefer one resolved array where practical.

## Why no NPC/fauna/navigation changes are needed

`src/navigation/navigation.ts::NavigationQuery.isWalkable` deliberately delegates obstacle semantics to the caller.

`NpcAgent` exterior navigation uses collider-backed walkability.

`AnimalAgent.isWalkable()`:

- samples local water;
- queries nearby colliders;
- filters by `colliderActiveAtY()`;
- rejects points where `colliderContainsPoint()` is true.

Animal A* passes that same `isWalkable()` into `findPath()`.

Therefore registering correct static OBBs is enough for both movement collision and pathfinding. Do not add fence-specific checks to `NpcAgent`, `AnimalAgent` or `navigation.ts`.

## Pasture road/path bug

Relevant file: `src/settlement/villagePasture.ts`.

Current planning sequence:

- `planSettlementPasture()` builds simplified entrance corridors via local `entranceCorridors(center, entrances)`;
- candidate center is rejected using `pointHitsCorridor(...)`;
- well/trough are rejected against corridors;
- `layoutOnCandidate()` builds `twoSeg`, `flipped`, then `oneSeg` fallback;
- `segmentClear()` checks water, plots, well, trough and connection clearance;
- `segmentClear()` currently does **not** receive/check corridors.

This is the immediate reason a long final fence segment can cross a road even when its pasture center and utility anchors are clear.

At minimum, full segment clearance must include corridor intersection. Do not test only segment midpoint: a long segment can have a safe midpoint while crossing a corridor near one end.

## Paddock road/path bug

Relevant file: `src/settlement/villagePaddock.ts`.

Current `layoutOnCandidate()`:

- checks entrance/trough/hay/work anchors with `pointHitsCorridor()`;
- creates a 12-step ring with an inward entrance gap;
- each generated segment currently checks water and plot overlap at its midpoint;
- it does not reject fence/corridor intersection.

Use the same full-segment corridor helper as pasture. Do not create a paddock-only implementation.

The entrance gap is represented by omitted `VillagePastureFenceSegment`s. Collision must project only actual segments; never synthesize a full ring OBB or radial blocker.

## Corridor authority and planning-order caveat

There are two relevant representations:

1. simplified center→entrance corridors used during early satellite candidate selection;
2. final `VillagePlan.paths`, projected by `src/settlement/villagePlanner.ts::pathPlansToCorridorData()` and reused by runtime road systems / props.

`pathPlansToCorridorData()` is the canonical projection for final local paths.

The planner currently creates pasture/paddock within `planVillageLayout()`, around the same flow that appends their local paths. Inspect the exact current order before editing. The implementation should avoid a circular rule where the satellite fence needs the path that is only added after selecting that same satellite.

Recommended resolution hierarchy:

- keep the existing entrance corridors as an early placement guard;
- add a reusable exact segment-vs-corridor check so the fence cannot cross those corridors;
- after local paths are assembled, ensure no satellite fence conflicts with final `VillagePlan.paths` projected via `pathPlansToCorridorData()`;
- if final validation fails, resolve it at planning time by selecting the next deterministic candidate/layout, not by hiding/removing visuals in `props.ts`.

If achieving final-path validation requires reordering candidate selection/path append, keep the change local to `villagePlanner.ts` and preserve deterministic candidate ordering. Do not introduce post-generation mutation of `VillagePlan` in the renderer.

## Geometry helpers

Existing useful helpers:

- `src/math/segment.ts::pointHitsCorridor`
- existing segment distance/projection helpers in `src/math/segment.ts`
- `pathPlansToCorridorData()` for final path segments

Before adding new math, inspect `segment.ts` for an existing segment↔segment distance/intersection primitive. If missing, add one small pure reusable helper there rather than sampling many arbitrary points along fences.

Required semantic check:

```text
minimum distance(fence segment, corridor center segment)
<= corridor.halfWidth + fence clearance
```

The clearance should correspond to the physical wall/fence footprint, not a large pasture radius. Keep it small enough that roads remain usable without unnecessarily rejecting nearby parallel fences.

## Tests to target

Likely files to extend/create:

- `src/settlement/villagePasture.test.ts`
- `src/settlement/villagePaddock.test.ts`
- `src/settlement/settlementPalisade.test.ts`
- relevant `createSettlement`/settlement collider integration test if one already exists

High-value tests:

1. Construct a candidate where the pasture center is outside the corridor but one long fence segment crosses it; assert rejected/alternate layout.
2. Same for paddock ring segment.
3. One canonical fence placement → one OBB with matching `x/z/rotationY` and shared wall dimensions.
4. Multiple placements preserve one-to-one cardinality.
5. Empty array stays empty.
6. Paddock entrance gap has no placement and therefore no collider.
7. Settlement registration includes pasture/paddock fence OBBs without changing existing house/well/prop/palisade registration.

Prefer pure geometry/planner tests over spinning full Three.js settlement presentation where possible.

## Guardrails

- Preserve `VillagePlan` ownership of fence segments.
- Preserve settlement-owned collider lifecycle.
- Preserve deterministic layout selection.
- No `PastureManager`, `FenceManager`, navmesh or agent-specific fence avoidance.
- No runtime visual→physics synchronization.
- Do not change `AnimalAgent` fenced-area bounds as a substitute; those bounds are behaviour constraints and not physical world geometry.
- Do not turn pasture V1 into a closed enclosure.
- Do not create collision for omitted gaps.
- Keep changes scoped to settlement planning/collision geometry and tests.

## Suggested implementation order

1. Add/reuse a pure full-segment-vs-corridor clearance helper.
2. Apply it to pasture `segmentClear()` and paddock ring validation.
3. Extract/reuse generic `PropPlacement[] → OBB Collider[]` from settlement palisade collision.
4. Expose/reuse final pasture/paddock placement arrays at settlement collider registration.
5. Add targeted tests.
6. Run targeted tests and repository typecheck; browser verification stays with User.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
