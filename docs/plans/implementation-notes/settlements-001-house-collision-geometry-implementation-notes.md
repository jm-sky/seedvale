# Implementation Notes: settlements-001-house-collision-geometry

## Review status

Plan reviewed against `docs/STATE.md` and current `main` code. The plan is directionally correct, but the current implementation still has the old circle-only collision model; do not infer that any OBB work already exists.

## 1. Current code that must be reused

- `src/world/collision.ts` is the single shared collision layer. `Collider` is currently only `{ x, z, radius }`; `resolvePosition()` deliberately resolves **one deepest overlap** and `ColliderRegistry` indexes by collider center in 3×3 buckets. Preserve these semantics; extend the primitive rather than creating a second house-collision system. fileciteturn146file0
- `src/settlement/houseBuilder.ts` currently owns house collision generation. `wallLocalTransform()`, `openingLocalPose()` and `buildAssemblyCollidersWorld()` are the correct anchors for house-local geometry and world transforms. Do not derive collision positions independently from render meshes. fileciteturn147file0turn149file0
- Settlement registration/replacement already handles door state; keep that lifecycle. Only the shape/content of the returned house colliders should change.
- `src/world/collision.test.ts` already contains the unit-test harness for the shared collision layer; extend it rather than creating another test module. fileciteturn156file0

## 2. Important correction to the plan during implementation

The plan says to use `1.118 m` as the doorway opening width. Treat this as a **candidate derived from the current `door_1_flat` leaf**, not as proof of the wall cutout width.

Before hard-coding the two wall-piece OBBs, verify the actual opening geometry of `wall_plaster_door_flat` against the audited MegaKit asset data. The leaf width and the wall cutout can differ. If the asset audit cannot establish the cutout edges, measure/verify the matching wall asset first and document the resulting value in code/test data.

Do not reintroduce magic offsets such as the current `HOUSE_DOOR_JAMB_OFFSET` to compensate for an uncertain opening width.

## 3. House geometry details

Current `houseBuilder.ts` still does all of the following:

- skips every wall module containing a door;
- creates `radius = 0.95` wall circles for the other modules;
- creates a closed-door circle `radius = 0.45`;
- creates two permanent jamb circles (`offset = 1.05`, `radius = 0.15`).

These are the implementation being replaced, not existing OBB infrastructure. fileciteturn149file0

For the replacement:

- normal wall: one 2D OBB using the verified 2.00 m module length and 0.41 m wall thickness;
- door wall: two OBB pieces around the **verified wall opening**;
- closed leaf: one OBB only while closed;
- frame: visual only;
- jamb workaround: remove;
- corner collider: do not add one unless browser/test verification proves the wall OBBs leave a real collision gap.

Keep `openingLocalPose()` as the single source of truth for door placement. The existing `DOOR_1_FLAT_HINGE_OFFSET_X = -0.51` belongs to the visual hinge/leaf placement and must not be repurposed as wall-opening geometry. fileciteturn147file0

## 4. OBB API design

Prefer a small discriminated union in `collision.ts` and pure geometry helpers there. Avoid Three.js `Object3D`/`Box3`/asset dependencies in the collision layer.

The important shared operations are:

- point containment;
- closest point / distance to collider;
- resolving a circle-shaped entity against a collider;
- obtaining an exterior/rim point for AI avoidance.

Do not duplicate circle/OBB math in each consumer.

For an OBB, work in its local 2D frame: translate by `(x,z)`, rotate by `-rotationY`, solve against the axis-aligned rectangle, then transform the result back. Handle the inside-rectangle case explicitly: closest-point-on-rectangle returns the same point when already inside, so a simple outside-only formula is insufficient.

Keep the existing deterministic fallback for degenerate positions; do not introduce random escape directions.

## 5. NPC / fauna integration: do not miss the existing circle assumptions

A previous recon understated this. The current codebase has circle-specific AI consumers:

- `src/ai/npcColliderRim.ts` directly uses `collider.radius` for containment, rim points and escape distances. fileciteturn150file0
- `src/ai/NpcAgent.ts` has existing collider-aware steering/walkability logic and must continue to use the same shared geometry rather than receiving a parallel OBB implementation.
- `src/fauna/AnimalAgent.ts` also has circle-specific collider checks; the implementation must update these consumers if the new `Collider` union makes direct `.radius` access invalid.

The goal is **not** to replace NPC/animal movement with `resolvePosition()`. Preserve their existing movement/avoidance semantics and swap the shape calculations to shared helpers.

In particular, `npcColliderRim`'s "already inside → allowed to leave" behaviour is intentional and comes from the earlier locomotion/rescue work. Preserve that semantic for OBBs; do not make a generic `containsPoint` change accidentally trap an NPC inside a house.

## 6. Registry/broad phase

`ColliderRegistry` currently buckets by collider center and returns a 3×3 neighborhood. Do not introduce an OBB-specific spatial index unless tests prove the current broad phase can miss a wall.

The relevant house OBBs are ~2 m long while the registry cell follows terrain chunk size, so the existing neighborhood should remain a conservative candidate set. Exact collision remains the responsibility of the narrow-phase helpers.

If the OBB implementation needs a conservative bounding radius for an existing AI query, expose it as a shared helper; do not make callers inspect the discriminated union themselves.

## 7. Door state / lifecycle

`HouseDoor.setOpen()` changes animation state, while settlement collision rebuilding already derives closed/open state from `assembly.doors.map((door) => !door.isOpen())`. Preserve this contract.

Expected collision state:

```text
open door   -> wall pieces only; doorway is traversable
closed door -> wall pieces + closed leaf OBB
```

Do not tie collision to the animated hinge angle frame-by-frame. The current system treats the door as a binary open/closed collision state; retain that inexpensive deterministic behaviour.

## 8. Tests worth adding

Keep tests focused on geometry and the actual regression:

- `collision.test.ts`: circle regression, OBB containment/distance, circle-vs-OBB resolution, rotated OBB, point-inside-OBB resolution, degenerate cases, and registry regression.
- `houseBuilder.test.ts`: normal wall OBB dimensions/orientation; door wall produces two pieces; closed/open leaf state; no jamb circles; no unnecessary corner collider; world yaw/scale transformation.
- Add a test that represents the actual doorway corridor and proves the player-sized radius (`0.35 m`) can pass through the opening but cannot pass through the adjacent wall pieces.

Prefer assertions on meaningful geometry (`type`, dimensions, center/orientation, doorway width) rather than snapshots of the entire collider array.

## 9. Debug view

`src/debug/colliderDebugView.ts` currently assumes circle geometry. Extend the existing debug path to draw an OBB in XZ; do not create a second debug overlay. The debug representation should make the wall thickness and doorway gap visually obvious.

This is important for browser verification because the original bug is primarily geometric and is easiest to validate with `?debugColliders=1`.

## 10. Pitfalls

- Do not use the render GLB's runtime bounding box as the collision source; house geometry is authored from `HouseDefinition` plus verified MegaKit dimensions.
- Do not keep old wall/jamb circles as a safety net. That would recreate the oversized collision problem and make debugging ambiguous.
- Do not assume `door_1_flat` width equals the wall cutout without verifying `wall_plaster_door_flat`.
- Do not use `door_1_flat` hinge offset as a collision offset.
- Do not add collision to the visual door frame merely because it has a mesh.
- Do not change the existing one-deepest-overlap solver into a general iterative physics solver as part of this fix.
- Do not broaden the work into pathfinding, settlement lifecycle, or physics-engine changes.

## 11. Verification focus

The highest-value manual check is the real house entrance, not only isolated math:

1. `?debugColliders=1` on a 4×4 and at least one larger house.
2. Walk from outside through the visual doorway into the interior.
3. Try to enter through the wall immediately beside the doorway.
4. Repeat with the door closed and open.
5. Inspect door-at-end/corner cases specifically.

The desired result is a narrow wall-shaped debug OBB, a real doorway gap, and no large circular blocking area inside the house.

Technical verification should distinguish:

- unit tests/typecheck/build;
- browser verification of collision geometry and actual traversal.

## 12. Scope discipline

The current plan is `M`, not `L`, if implementation stays within the shared collision layer + house builder + existing shape-aware consumers/debug/tests. Do not turn this into a general collision architecture rewrite.
