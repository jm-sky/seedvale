# Implementation Notes: Underground Caves V2 — B3 Recon

> Plan: `docs/plans/world-terrain-008-underground-caves-v2.md`
> Recon date: **2026-09-08**
> Scope: **Milestone B3 only — collision + third-person camera**
> Measured against current `main` (B1+B2 already landed). No browser.

This is the code-level map for the agent implementing B3. Do not rerun a broad cave-system pass. Do not put `CaveVolume` back on the player ground path.

Browser/manual verification is done by the Player, not the implementation agent.

---

## 1. Exact current runtime flow (post-B2)

Gameplay ground is already SDF. Collision and camera are not.

```text
pickLargeCaveSites()
    ↓
buildProductionCaveTopology()                 caves/productionTopology.ts
    ↓
CaveTopology
    ├─► buildCaveSdfRepresentation()          caves/caveSdfField.ts   retained at world-build
    │       ↓
    │   CaveSdfColumnIndex                    caves/caveSdfQuery.ts   retained at world-build
    │       ↓
    │   Caves.queryGround(x,y,z)              createCaves.ts
    │       ↓
    │   caveGroundQuery                       app/createApp.ts
    │       ↓
    │   PlayerController.groundAt()           player/PlayerController.ts
    │
    ├─► buildSdfCaveMesh(prebuilt field)      caves/sdfCaveMesh.ts    presentation only, on activate
    │
    └─► topologyToCaveDefinition()            caves/topologyAdapter.ts   TRANSITIONAL
            ↓
        buildCaveWallColliders(definition)    caveColliders.ts
            ↓
        ColliderRegistry.setColliders('cave:<id>')   world/collision.ts via ChunkManager
            ↓
        PlayerController.resolvePosition()    XZ beads, Y-filtered
        NpcAgent / AnimalAgent                XZ beads, NOT Y-filtered
```

Camera:

```text
PlayerController.syncCamera()
    origin = (playerX, playerY + lookAtOffset, playerZ)     lookAtOffset 0.9–1.6
    desired = unconstrained orbit boom                      default distance 12 m
    originCave = caveGround(originX, playerY, originZ)      B2 queryGround
    resolveCameraBoom({
      sampleHeight: withCaveFloorFallback(
        groundAt(x,z).height,                               still keyed by player Y
        caveGround(x, playerY, z)?.floorY,
        originCave?.floorY,
      ),
      colliders: collidersNearAtHeight(origin),             Y-filtered, then ignored
    })
```

`createCaves.ts` stores `{ topology, definition, representation, index }` per cave. `createCaveVolume` is gone from the runtime owner. `definitions()` still exists for the world-location catalog (`entrance` only). Colliders still register the adapter definition on `activate()`, clear on `deactivate()`. Owner key remains `` `cave:${caveId}` ``.

---

## 2. Confirmed: collision still uses the topology proxy

Yes. Production cave collision is still:

```text
CaveTopology → topologyToCaveDefinition → buildCaveWallColliders → ColliderRegistry
```

Not the SDF. Not the column index. Not the render mesh.

`caveColliders.ts` places overlapping circle beads (`WALL_BEAD_RADIUS = 0.5`, `WALL_STEP = 0.85`) on:

- tunnel **side rails** at `tunnel.radius` (adapter `Math.min` of endpoint radii + `PROXY_MARGIN 0.9`);
- chamber **rings** at `node.radius` (adapter `targetWidth/2 + PROXY_MARGIN`).

Each bead is a vertical extrusion (`minY`/`maxY` = proxy floor/ceiling ± `VERTICAL_PAD 0.2`). Passages are a 2.5D corridor. Chambers are a cylinder. That is a Y-independent silhouette of topology intent, not the ellipsoid bowl the SDF actually is.

`ColliderRegistry` is unchanged: XZ bucket index, optional `minY`/`maxY`, query-side filter `colliderActiveAtY`. Only `PlayerController.collidersNearAtHeight` applies that filter. NPCs (`NpcAgent.isWalkable` → `isPointWalkableForNpc`) and fauna (`AnimalAgent.isWalkable` → `colliderContainsPoint`) still consume raw `collidersNear(x,z)`. Confirmed pre-existing V1 gap, still present.

---

## 3. Confirmed mismatch — seed `1136726869`, Grota Czarnego Kamienia

Reconstructed analytically (`sampleHeightAt` + `buildProductionCaveTopology`), same pins as B2: `cave:0e3cce97`, x=`135.84259216988767`, z=`-17.813611096688362`. Sideways from the chamber node, away from the incoming tunnel.

| Quantity | Distance from chamber centre |
|---|---:|
| SDF iso-surface at **proxy floor + 1 m** (B2 recon standing plane) | **2.00 m** |
| Column-index miss at that same Y (`queryColumnIndex`, includes `FLOOR_GRACE`) | 3.55 m |
| First `resolvePosition` push (`PLAYER_COLLISION_RADIUS 0.35`) | **4.90 m** |
| Topology collider ring (`targetWidth/2 + PROXY_MARGIN`) | **5.69 m** |
| Clip-through on the proxy plane before a bead pushes | **2.90 m** |

B2 moved the player onto the SDF bowl. On that actual walkable path (column-index floor + 1 m, walking the same heading):

| Quantity | Distance |
|---|---:|
| SDF iso-surface | **4.45 m** |
| Column-index miss (strict-enough at bowl Y) | 4.35 m |
| First `resolvePosition` push | **4.90 m** |
| Clip-through on the bowl | **0.45 m** |

So: B2 stopped the surface teleport and mostly stopped the *multi-metre* walk-into-rock **while standing on the bowl**. The proxy-plane diagnosis is still true of the **collision representation** (cylinder vs ellipsoid). A player who is lower in the chamber (near the pinched floor) can still clip metres of visible rock; even on the bowl they clip ~0.45 m before the old ring catches them.

Other measured facts for this cave:

- 110 beads, every radius `0.5`;
- **0** beads ≥ `CAMERA_OCCLUDER_MIN_RADIUS` (`1.2`);
- column index `101 × 62` at step `0.4` m;
- chamber floor Y ≈ `-3.51`, analytic surface ≈ `10.00`;
- `colliderActiveAtY(surfaceY)` keeps 2 mouth beads, drops the underground ring — the envelope works **if filtered**.

Do not "fix" this by raising `PROXY_MARGIN`. That moves the cylinder out and widens the clip shell.

---

## 4. Confirmed: third-person camera still escapes

`withCaveFloorFallback` (`cameraBoom.ts`) is a Milestone A workaround. While `originCaveFloorY` is set, every boom sample that misses cave footprint reports **the origin cave floor**, not the surface. That does two opposite things:

1. **Stops** the old "lift the camera to surface + 0.45 m" clamp (`CAMERA_GROUND_CLEARANCE`) — this part is still wanted.
2. **Disables** `firstTerrainHitT` as an overburden/ceiling occluder. A look-up boom is tested against cave floor, so it is never "buried".

Pinned by `cameraBoom.test.ts`: origin on cave floor `-6`, surface `40`, desired camera Y `45` — with the fallback, `t === 1` and the camera sits at `45`. That test is the ceiling-escape contract. B3 must change it.

Remaining camera holes, all still in current `main`:

| Hole | Why |
|---|---|
| Boom through walls | Cave beads radius `0.5` < `CAMERA_OCCLUDER_MIN_RADIUS 1.2` → skipped. House-cylinder occlusion never sees cave walls. |
| Boom through ceiling / into rock | No ceiling test anywhere in `resolveCameraBoom`. |
| Surface/grass visible from interior | Same: boom leaves occupancy, fallback keeps treating XZ as cave floor, lens sits in overburden. |
| Lifted to surface height | **Mostly gone** while origin is in cave. `syncCamera` uses the same `caveGroundQuery` → `Caves.queryGround` hysteresis as movement, then `withCaveFloorFallback` refuses hillside `sampleHeight`. Remaining escape is through rock/ceiling, not the old upward snap. |
| Ceiling ignored | By design of the current boom. |

`CAMERA_OCCLUDER_HEIGHT = sampleHeight(collider) + 8` is a **house-roof** model. Do not "fix" cave camera by enlarging beads past `1.2` so they pass that filter. A cave wall cylinder extruded 8 m above cave floor would occlude looking up inside a tall chamber and would still miss the ceiling in the middle of the room.

`groundAt` / `caveGround` for boom samples are still keyed by **player Y**, not sample Y. That is acceptable for floor fallback; it is the wrong query for "is this camera point in rock".

Default boom is 12 m. L1 chambers are ~9–10 m across. The unconstrained boom leaves the interior immediately.

---

## 5. What should be the production derived representation

```text
CaveTopology
    ↓
CaveSdfSpatialRepresentation          already exists, keep pure, no THREE
    ↓
CaveSdfColumnIndex                    already exists, world-build, deterministic
    ├─ queryGround / hysteresis       B2, do not regress
    ├─ strict occupancy (x,y,z)       NEW helper — no FLOOR_GRACE
    │     ├─ Y-banded circle beads → existing ColliderRegistry   (body)
    │     └─ boom march along look-at → camera                   (walls + ceiling)
    └─ presentation mesh              B1, never gameplay authority
```

**Answer the architecture questions:**

1. Current collision is still `CaveVolume`-class topology approximation (`topologyToCaveDefinition` beads). Yes.
2. Mismatch: cylinder vs ellipsoid. ~2.9 m clip on the pinched proxy plane; ~0.45 m on the B2 bowl path for this chamber heading. Representation is still wrong for overhangs/shelves regardless of those numbers.
3. Production derived collision = **Y-banded beads generated from the column index occupancy silhouette**, registered in the existing `ColliderRegistry`. Optional one-time SDF iso-snap of bead XZ at build (not per frame).
4. Yes — generate from the retained field/index. Do **not** use the render mesh / BVH.
5. Prefer **sampled occupancy → local colliders** for the body (reuse `resolvePosition`). Prefer **spatial occupancy query** for the camera (reuse the same index; boom already marches 20 steps). Do not add a second physics world. Do not per-frame SDF raymarch.
6. Build beads once at world-build next to the index; register/clear on activate/deactivate as today. Camera: ~20 nearest-column lookups/frame. Field `sample()` stays off the hot path.
7. Overhangs / shelves / multi-level: stacked intervals already exist. Emit beads **per interval band**, not one tall extrusion of a 2D silhouette. A full-height cylinder at an overhang lip would block the walkway under it.
8. Camera consumes the same strict occupancy. Do not invent a parallel cave camera system.
9. Body and camera share the **column index**. They do **not** share the house occluder path. Beads are the ColliderRegistry projection; boom march is the 3D occupancy projection. Ceiling cannot be an XZ collider.
10. Leave for B4: mesh extraction cost, activation hitch, workers, collider-count / grid-resolution tuning if profiling says 110 beads or `101×62` columns are a problem (they are not, today). Do not stream-rewrite in B3.

---

## 6. Strict occupancy vs `queryGround`

`queryColumnIndex` / `pickInterval` use `CAVE_FLOOR_GRACE = 2`. That is ground continuity (step/jump). It is **not** a solid test.

Measured: at proxy floor + 1 m, SDF wall is at 2.0 m but `queryColumnIndex` still hits until 3.55 m. Using B2 ground as collision would let the body into rock.

B3 needs a helper, e.g. `occupancyContains(index, x, y, z)`:

- nearest column (same snap as today);
- `y` strictly inside some `{floorY, ceilingY}` (small epsilon ok, **no** 2 m floor grace);
- empty column / y above clipped ceiling / y below floor → solid.

Mouth portal intervals are already unioned into the index. Occupancy is void in the carved approach up to `surface − 0.05`. That is how the camera is allowed to look *out of the mouth* and how body collision stays open at the entrance. Looking through rock (no interval, still below surface) is solid.

Do not rebuild a second grid. Do not scan `representation.sample` per frame.

---

## 7. Camera change (reuse boom, replace the cave workaround)

Keep `resolveCameraBoom` as the only third-person solver. Extend it; do not add a `CaveCamera`.

Suggested input addition (names flexible):

```ts
occupancy?: (x: number, y: number, z: number) => boolean  // true = cave void
```

When present:

- march the boom (same `TERRAIN_STEPS` budget, or the existing loop) and pull in at the first sample that is **not** void — this is wall + ceiling + interior rock;
- floor clamp uses the occupancy interval's `floorY + CAMERA_GROUND_CLEARANCE` when void, **not** origin-floor-everywhere and **not** hillside `sampleHeight`;
- once the boom has left cave void toward the real mouth, fall through to the existing heightfield / house-collider path so the camera can exist outside.

Then `withCaveFloorFallback` stops being the cave camera strategy. Keep the function only if a surface-side test still needs it; the underground look-up regression test must be rewritten to expect **ceiling pull-in**, not `t === 1` at y=45.

House occluders stay as they are (`CAMERA_OCCLUDER_MIN_RADIUS`, roofY). Cave beads stay below that threshold on purpose — camera must not start using them.

Wire from `syncCamera`: pass `bundle.caves` occupancy through a small callback. `createApp.ts` already rebuild-safely reads `bundle.caves` live; same pattern. Prefer adding occupancy to `CaveGroundQuery` **or** a sibling callback on `PlayerController` rather than importing `Caves` into the player module.

Player vertical motion already has a ceiling: `integrateVerticalMotion({ maxY: ceiling - PLAYER_HEIGHT })`. Do not duplicate that for the body. Camera is the one missing ceiling.

---

## 8. Ownership

| Concern | Owner | When |
|---|---|---|
| Topology / SDF field / column index | `createCaves()` closure | world-build, retained |
| Derived wall beads | new helper in `src/world/caves/` (replace `buildCaveWallColliders` at the activate call site) | world-build derive, activate register |
| `ColliderRegistry` | `ChunkManager` | unchanged |
| Player body resolve | `PlayerController` + `resolvePosition` | per move, already Y-filtered |
| NPC/fauna vs cave walls | filter `colliderActiveAtY` at walkability sites | B3, small |
| Camera solver | `resolveCameraBoom` | per `syncCamera` |
| Cave occupancy for camera | `CaveSdfColumnIndex` via `Caves` | per boom sample |
| Presentation mesh | `sdfCaveMesh.ts` | activate/dispose, untouched |
| Ground / hysteresis | `caveSdfQuery.ts` | B2, untouched contract |

Do not add `CaveManager`. Do not fork `ColliderRegistry`. Do not store authoritative geometry on `THREE.Mesh`.

`topologyToCaveDefinition` / `CaveDefinition` may remain for `definitions()` / location catalog / streaming bounds. Stop feeding them to `buildCaveWallColliders`. Deleting the adapter is **B5**.

---

## 9. Files to reuse / touch

Start here:

```text
src/world/createCaves.ts                      activate() collider registration; expose occupancy if needed
src/world/caves/caveSdfQuery.ts               column index; add strict occupancy; do not weaken FLOOR_GRACE on ground
src/world/caves/caveSdfField.ts               field stays source of truth; no hot-path sample()
src/world/caveColliders.ts                    current bead builder — replace call, keep file until B5 or rewrite in place
src/world/collision.ts                        Collider, colliderActiveAtY, resolvePosition — REUSE
src/player/PlayerController.ts                collidersNearAtHeight, syncCamera — wire occupancy; do not change groundAt contract
src/player/cameraBoom.ts                      resolveCameraBoom + withCaveFloorFallback
src/app/createApp.ts                          caveGroundQuery (~672); torch isInCave already uses queryGround
src/ai/NpcAgent.ts                            isWalkable / collidersNear — add Y filter
src/ai/npcColliderRim.ts                      isPointWalkableForNpc consumes whatever list the caller passes
src/fauna/AnimalAgent.ts                      isWalkable — add Y filter
src/world/caves/caveGameplayQuery.b2-recon.test.ts   keep; add B3 collision/camera pins beside it
src/player/cameraBoom.test.ts                 rewrite the underground look-up case
src/world/caveColliders.test.ts               retarget to SDF-derived beads
```

Do not touch: production topology generation, mesher, `makeCaveId`, siting, fauna `type: 'cave'` spawners, `verticalMotion.ts` snap semantics, streaming distances.

New file (expected): something like `src/world/caves/caveSdfColliders.ts` — `CaveSdfColumnIndex → Collider[]`, JSDoc `@domain world-terrain`. Pure, no THREE.

---

## 10. Pitfalls

1. **Do not reuse `queryGround` as a wall.** `FLOOR_GRACE` is why occupancy lagged the SDF wall by 1.55 m on the proxy plane.
2. **Do not derive colliders from the mesh.** Plan invariant. Mesh is clipped at the surface; gameplay occupancy includes the mouth portal the mesh does not own.
3. **Do not enlarge beads to pass `CAMERA_OCCLUDER_MIN_RADIUS`.** Wrong occlusion model; still no ceiling.
4. **Do not keep `withCaveFloorFallback` as the cave solution.** It is the ceiling-escape.
5. **Y-banded beads, not tall cylinders.** Future overhang/shelf/multi-level. L1 already has a shelf/overhang feature in topology.
6. **Mouth must stay open.** Occupancy already unions the carve. A closed ring around the entrance disc is the V1/adapter bug in another costume.
7. **Hysteresis is not collision.** After B3 the body should stop at the wall so hysteresis is rarely needed underground. Keep hysteresis anyway (iso noise, one-frame miss).
8. **`definitions()` still needs a `CaveDefinition`.** Do not rip out the adapter just to clean collision.
9. **NPC/fauna Y-filter is load-bearing** once cave beads exist under settlements/hillsides. Filter at the agent with `mesh.position.y`; do not 3D-index the registry in B3.
10. **Camera occupancy must use sample point Y**, not player Y.
11. **Determinism:** same index → bit-identical beads. No `Math.random`, no activate-order `Map` iteration. Snap like the column origin (world multiple of step).
12. **Do not per-frame raymarch `representation.sample`.** If a bead needs to sit on the iso-surface, snap once at build.

---

## 11. B3 vs B4

**B3**

- SDF/index-derived wall beads through existing `ColliderRegistry`;
- strict occupancy helper;
- player cannot cross the visual wall on the Grota Czarnego Kamienia heading;
- cave collider Y-awareness for NPC/fauna walkability;
- camera wall + ceiling occupancy march;
- no surface escape from interior;
- mouth still walkable / lookable;
- tests below;
- `tsc` / lint / targeted tests.

**B4**

- mesh extraction time / activation hitch / workers;
- column step / bead density if profiling requires it;
- streaming rewrite;
- memory of retained representations.

**B5**

- delete `topologyToCaveDefinition`, `CaveVolume` gameplay leftovers, Sweep, V1 `caveMesh.ts`.

---

## 12. Recommended implementation order

Each step should compile and pass tests.

1. **Strict occupancy** on `CaveSdfColumnIndex` + unit tests (synthetic stacked intervals, mouth portal still void, hillside above cave solid at surface Y, Grota Czarnego Kamienia wall distance ≈ SDF iso). No wiring yet.
2. **Bead derivation** `index → Collider[]` (per-interval silhouette, `minY`/`maxY` from that interval, bead radius ~0.5, step ~column step). Determinism test. Surface Y inactive. Junction/mouth opening not sealed.
3. **Wire `createCaves.activate`** to register those beads. Leave `topologyToCaveDefinition` for `definitions()` only.
4. **NPC/fauna `colliderActiveAtY`** at walkability (player already does this).
5. **Camera occupancy march** in `resolveCameraBoom`. Rewrite the look-up test. `syncCamera` passes occupancy keyed by sample Y.
6. **Invert / add** Grota Czarnego Kamienia collision pins (body stops near SDF wall, not at 5.69 m). Camera pins: wall pull-in, ceiling pull-in, no y=surface+ε from interior, mouth look-out still allowed.
7. `npx tsc --noEmit` · `pnpm run lint` · targeted `pnpm exec vitest run` on the files above. Stop. Player does the browser checklist.

---

## 13. Targeted automated tests (no browser)

Pattern: `caveGameplayQuery.b2-recon.test.ts` / `caveSurfaceIntegration.test.ts` (`sampleHeightAt`, no `ChunkManager`, no THREE scene).

- **SDF wall vs collision boundary** — seed `1136726869`, `cave:0e3cce97`, sideways from chamber: first `resolvePosition` push within ~0.4 m of the SDF iso at bowl standing height; must *not* still be ~5.7 m.
- **Player cannot cross cave wall** — a point 0.5 m past the iso, at bowl Y, is pushed back into void.
- **Cave collider Y-awareness** — `colliderActiveAtY(surfaceY)` is false for underground beads; true only near mouth if a bead legitimately meets the recess.
- **Surface NPC/player above cave unaffected** — hillside point at `sampleBaseHeight` is not inside any active cave bead; NPC walkability with surface Y must not hit the underground ring.
- **Overhang/shelf compatibility** — synthetic stacked intervals: lower-band beads do not block the upper interval's XZ, and vice versa (`minY`/`maxY` disjoint).
- **Camera wall occlusion** — boom from chamber centre through the SDF wall pulls `t < 1` and stays in occupancy.
- **Camera ceiling occlusion** — steep look-up from chamber floor does **not** reach surface height; `t` shortens at the clipped ceiling.
- **No surface escape** — interior origin + boom XZ outside cave footprint does not place camera at `surface + CAMERA_GROUND_CLEARANCE`.
- **Mouth look-out allowed** — origin in entrance portal, boom toward `openingDirection`, may leave occupancy into exterior without being jammed to `minT`.
- **Deterministic derived colliders** — same topology/index → `toEqual` beads.
- **Activation lifecycle** — register on activate, `clearColliders('cave:'+id)` on deactivate (if you touch `createCaves` flow; don't add a full `ChunkManager` test unless needed — a pure register-list test is enough).

Do not add Playwright. Invert the `cameraBoom.test.ts` underground look-up case that currently asserts escape.

---

## 14. Notes for the implementing agent

- Current code is source of truth. B2 recon §3's "3.7 m clip-through" described the **proxy standing plane**. After B2 the walkable bowl clip on this heading is ~0.45 m — still a miss, but do not chase a 3.7 m number on the bowl and conclude collision is "fine".
- `CaveSdfColumnIndex` is the derived gameplay structure B3 should extend. It is already retained. Mesh extraction already reuses the retained field.
- `PLAYER_COLLISION_RADIUS` is `0.35` and is not exported — tests should duplicate the literal or export it if needed.
- `Caves.queryGround` folds runtimes in insertion order and applies **one** global `lastGroundHit`. Camera occupancy should query the index directly, not through hysteresis.
- Torch `isInCave` already uses `queryGround`. Do not recouple it to colliders.
- If bead count or silhouette holes show up on L1, snap bead XZ to the iso at build with a few `representation.sample` calls per bead. That is still B3-cheap. Do not march the field along the boom.
- Implementation notes above this file (Milestone A / B1) describe superseded runtimes. For B3, this recon + the B2 implementation summary in `world-terrain-008-underground-caves-v2-implementation-notes.md` are the live map.

### Manual checklist (Player only)

Seed `1136726869`.

1. Grota Czarnego Kamienia — walk to a main-chamber wall on the visible floor. Body stops at the rock, no clip of metres, no surface teleport.
2. Look around in the chamber at default boom. Camera stays in the interior; no grass/sky through the ceiling; boom shortens near walls instead of tunnelling.
3. Look out of the mouth from just inside. Camera may see exterior through the opening.
4. Stand on the hillside above the chamber. Movement and camera are surface; no invisible cave walls.

---

## 15. Explicit out of scope

- B4 performance/streaming/workers/meshing budget.
- B5 deletion of Sweep / `spikeTestCave` / `caveMesh.ts` / `CaveVolume` / adapter.
- Dual Contouring / Marching Cubes rewrite.
- Sculpted hillside doorway (loose end).
- Fauna cave habitats, loot, navmesh, persistence.
- Changing `makeCaveId` / siting / production topology.
- Putting `CaveVolume` back on `CaveGroundQuery`.
- A second collision registry or a monolithic cave manager.
