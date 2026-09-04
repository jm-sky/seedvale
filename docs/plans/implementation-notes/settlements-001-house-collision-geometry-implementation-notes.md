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

## 13. Browser verification result (2026-08-25) — FAILED, not fixed yet

Implemented (`src/world/collision.ts` OBB support, `src/settlement/houseBuilder.ts` real wall/door OBBs, NPC/fauna/debug-view consumers) and all technical checks passed (`tsc`, `lint`, full `vitest` suite incl. new circle/OBB math tests and a real-doorway-traversal regression across 9 house definitions, `vite build`). User's manual browser check on the running dev server:

> Dalej mogę przejść przez ścianę, a nie przez drzwi. (Still walking through the wall; not through the door.)

i.e. the wall is **not** blocking the player, while a closed door **does** block — the opposite pairing of what the fix targets (real wall OBB should block; the real ~1.30 m opening should be walkable when the door is open).

### What's already ruled out

- Pure collision math: `collision.ts`'s circle/OBB `resolvePosition`, `colliderContainsPoint`, `colliderSignedDistance` etc. are unit-tested directly (exact hand-verified numeric assertions for front/back/side/corner/rotated/inside-OBB cases) — all pass.
- House-collider generation: `buildHouseWallCollidersLocal` / `buildHouseDoorCollidersLocal` / `buildHouseCollidersWorld` are unit-tested against real `HouseDefinition`s (`TEST_HOUSE_01`, `COTTAGE_4X4_A/B`, `COTTAGE_6X4_A/B`, `HOUSE_6X6_A/B`, `HOUSE_8X6_A/B`) including a traversal regression (outside → through opening → inside walkable; wall piece next to the opening blocks; closed door blocks, open door doesn't) — all pass.
- `PlayerController.update()`'s movement resolution and `gapClose()` are unmodified call sites (`resolvePosition(candidateX, candidateZ, PLAYER_COLLISION_RADIUS, this.collidersNear(...))`) — same shape as before this plan, not a new wiring path.
- `createSettlement.ts`'s `registerSettlementColliders()` still registers wall+door colliders together, from the same `buildHouseCollidersWorld` call, into the same `ColliderRegistry` under `def.id` — walls and the door leaf are not on separate registration paths, so a wiring/timing bug should affect both, not just one.

That last point is the interesting one: since the door leaf is *also* an OBB, built by the same `resolveObbPush`/registration pipeline, and it visibly blocks in the browser, the OBB math and the collider-registry pipeline are proven reachable and working end-to-end for at least one OBB. The bug is most likely specific to **wall-piece generation or wall-piece registration**, not the shared OBB math — but this has not been confirmed by an actual browser-side inspection, only inferred.

### Not yet tried / next steps for whoever picks this up

1. **Rule out a stale dev server / HMR issue first** — this refactor touched the `Collider` type across ~18 files including several registration call sites; a full dev-server restart (not just a browser refresh) hasn't been confirmed. Cheapest possible explanation, check it first.
2. **`?debugColliders=1` visual check** — not yet done. This is the fastest real diagnostic: does the overlay draw a wall-shaped orange box for the house walls at all? If nothing is drawn, it's a generation/registration bug (`buildHouseWallCollidersLocal` never running for that house, or `houseAssemblies[i]` misaligned/undefined so `settlementHouseColliders` falls into the `footprintRadius` circle fallback — though that fallback should block the whole house including the door, which doesn't match what was observed, so this is a weaker candidate). If a box *is* drawn in the right place but the player still walks through it, the bug is in `resolvePosition`'s consumption of it at runtime, not generation — worth double-checking `collider.type` actually survives however colliders are threaded through `ColliderRegistry`/`collidersNear` (e.g. a stale cached array, or something upstream spreading/cloning collider objects and dropping the `type` discriminant field).
3. If the debug overlay shows correctly-placed wall boxes and the player still passes through, add a one-off `console.log` in `PlayerController`'s `resolvePosition` call site (or a temporary assertion) to confirm the OBB collider objects reaching it actually have `type: 'obb'` and sane `halfWidth`/`halfDepth`/`rotationY` values for that specific house instance.
4. Double check `HouseAssembly`'s `root.rotation.y`/`root.position` actually match the *visual* wall mesh placement used by `buildHouse()` at the moment `buildAssemblyCollidersWorld(assembly)` reads them (async GLTF loading — is it possible colliders are captured from the root's transform *before* the settlement/village placement code finishes positioning the house, i.e. a snapshot-timing issue independent of the door-registration retrigger on open/close?).

Do not re-derive the wall/opening geometry constants (`HOUSE_WALL_LENGTH_M`/`HOUSE_WALL_THICKNESS_M`/`HOUSE_DOOR_OPENING_HALF_WIDTH_M` in `houseBuilder.ts`) without new evidence — those were measured directly from the real GLB vertex data (see the constants' doc comments) and are not implicated by the symptom above.

## Update 2026-09-04 13:48

Podczas weryfikacji `?debugColliders=1` wykryto, że collidery domów były poprawne w House Browserze, ale przesunięte względem modeli w settlementach obróconych o niezerowy `yaw`.

Przyczyną była błędna konwencja rotacji XZ podczas transformacji house-local → world: znaki `sin(yaw)` były odwrotne względem `Three.js Object3D.rotation.y`. House Browser maskował problem, ponieważ prezentował dom z `yaw = 0`.

Poprawiono transformację w:

* `src/settlement/houseBuilder.ts` — `transformHouseCollidersToWorld()`,
* `src/settlement/props.ts` — lokalne przeliczanie `toWorld()` dla house-local interaction/furniture positions.

Po zmianie collidery ścian i drzwi pokrywają się z obróconymi modelami domów w świecie, a collider zamkniętego skrzydła poprawnie znika po otwarciu drzwi.

Follow-up: warto utrwalić poprawną konwencję testem transformacji dla niezerowego `yaw`, np. `Math.PI / 2`, ponieważ przypadek `yaw = 0` nie wykrywa tego typu regresji.
