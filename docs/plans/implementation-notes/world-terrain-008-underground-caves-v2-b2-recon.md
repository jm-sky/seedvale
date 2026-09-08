# Implementation Notes: Underground Caves V2 — B2 Recon

> Plan: `docs/plans/world-terrain-008-underground-caves-v2.md`
> Recon date: **2026-09-08**
> Scope: **Milestone B2 only — entrance + gameplay spatial queries**
> Diagnostic tests: `src/world/caves/caveGameplayQuery.b2-recon.test.ts`

This is the code-level map for the agent implementing B2. Do not rerun a broad cave-system research pass. B1 is already in production; this recon is about the gameplay query seam that B1 deliberately left on the V1 proxy.

Browser/manual verification is done by the Player, not the implementation agent.

---

## 1. Exact current runtime flow (post-B1)

Authoritative cave space is the production SDF. Gameplay ground is not.

```text
pickLargeCaveSites()                          largeCaves.ts
    ↓
buildProductionCaveTopology()                 caves/productionTopology.ts
    ↓
CaveTopology
    ├─► buildCaveSdfRepresentation()          caves/caveSdfField.ts   (pure field)
    │       ↓
    │   buildSdfCaveMesh()                    caves/sdfCaveMesh.ts    (presentation only, on activate)
    │
    └─► topologyToCaveDefinition()            caves/topologyAdapter.ts   TRANSITIONAL
            ↓
        createCaveVolume()                    caveVolume.ts              TRANSITIONAL
            ↓
        Caves.contains / sampleFloor / sampleCeiling     createCaves.ts
            ↓
        caveGroundQuery                       app/createApp.ts
            ↓
        PlayerController.groundAt()           player/PlayerController.ts
            ├─ hit  → cave floor/ceiling
            └─ miss → chunkManager.sampleHeight (surface)
                    → integrateVerticalMotion() snaps UP if surface is above the player
```

Collision (out of B2): `activate()` still registers `buildCaveWallColliders(v2.definition)` — the same proxy, not the SDF. Camera (out of B2): `syncCamera()` → `resolveCameraBoom()` with `withCaveFloorFallback`. Cave wall beads are radius `0.5`, below `CAMERA_OCCLUDER_MIN_RADIUS = 1.2`, so they never occlude the boom.

`createCaves.ts` still stores `{ topology, definition }` per cave. `definitions()` / `CaveVolume` exist only so the proxy and the world-location catalog keep working. SDF representation is rebuilt inside `buildSdfCaveMesh()` on every activate — it is **not** retained on the `Caves` handle today.

### Ground-query call shape

```ts
// createApp.ts
const caveGroundQuery: CaveGroundQuery = (x, y, z) => {
  if (!bundle.caves.contains(x, y, z)) return null
  const floorY = bundle.caves.sampleFloor(x, z)      // Y-blind
  const ceilingY = bundle.caves.sampleCeiling(x, z)  // Y-blind
  ...
}

// PlayerController.groundAt
const cave = this.caveGround(x, this.mesh.position.y, z)
if (cave) return { height: cave.floorY, ceiling: cave.ceilingY }
return { height: this.sampleHeight(x, z), ceiling: null }
```

`CaveGroundQuery` is already `(x,y,z)`. The Y is thrown away again by `Caves.sampleFloor(x,z)` / `sampleCeiling(x,z)`. `contains` is Y-aware on the **proxy span**, not on the SDF.

`groundAt` is also the camera boom's `sampleHeight`. Several calls per frame, plus one `updateVerticalMotion` call.

### Snap-to-surface mechanism (unchanged since Milestone A)

`integrateVerticalMotion` (`verticalMotion.ts`):

- grounded + `groundY >= y - STEP_DOWN_MAX` (0.45 m) → **set y = groundY** (unlimited upward snap);
- `STEP_DOWN_MAX` only limits snapping *down*.

So the moment `caveGroundQuery` returns `null` while the player is underground, `sampleHeight` (the hillside) is above them and they teleport to the surface. This is the shared last step of both repros. B2 fixes it by not returning `null` while the player is still in real cave space — not by widening `PROXY_MARGIN`.

---

## 2. Hypothesis, verified and corrected

### Stated hypothesis

> Proxy `CaveVolume` does not cover real SDF walkable space → `contains()` is false → surface ground.

### What the code confirms

The **pipeline** is exactly that: gameplay goes through `CaveTopology → topologyToCaveDefinition → CaveVolume`, not through `CaveSdfSpatialRepresentation`.

The **geometric claim** "SDF void XZ is outside the proxy" is **false** as the primary hole. Diagnostic scan of player-height SDF columns (`clearance ≥ 1.8 m`, query at SDF floor + 1 m) on both repro caves: uncovered / walkable < 1 % (iso-boundary noise). The proxy is a *superset* of standing-height SDF void in XZ, not a subset.

The real mismatch is **vertical / semantic**, not "proxy too small in XZ":

| Layer | Floor | Walls | Mouth |
|---|---|---|---|
| Production SDF | ellipsoid bowl (floor *rises* toward walls) | iso-surface at standing height is well *inside* the proxy disc | field is a closed dome; presentation clips to analytic surface; gameplay does not |
| `CaveVolume` proxy | flat disc / interpolated stadium at topology Y | containment + colliders sit on `width/2 + PROXY_MARGIN` (0.9 m) | entrance *disc* of radius `1.5 + 0.9 = 2.4 m`; carved approach is centred 2.2 m *outward* with radius 3.2 m |

The player stands on the **flat proxy floor** (what `sampleFloor` returns). At that Y, the SDF iso-surface is a wall a few metres *inside* the proxy. They clip through visible rock, stay `contains === true` on the ghost floor, then leave the proxy disc → `contains === false` → snap to surface.

Increasing `PROXY_MARGIN` moves the snap further out and **widens** the clip-through shell. It is not a production fix.

---

## 3. Root cause of the two repros

Shared seed: `1136726869`. Location ids in the catalog are `cave:<caveId>` (`cave:cave:7fd14c30`). Analytic reconstruction via `sampleHeightAt` + `buildProductionCaveTopology` reproduces both ids (`caveGameplayQuery.b2-recon.test.ts`). `LargeCaveSite.length` / `variant` are unused by the production topology builder; yaw from `measureSlope` is enough.

### Repro 1 — `Grota Mroczna` (`cave:7fd14c30`, x=316.008, z=109.778)

Symptom: hard to enter; player snapped to surface at the mouth.

Measured:

- mouth floor Y = 3.61, analytic surface = 6.01, proxy ceiling = 6.21 (only **0.20 m** above uncarved surface — `ENTRANCE_HEIGHT 2.6 − CAVE_MOUTH_DEPTH 2.4`);
- `contains(mouthFloorY + 0.2)` is true at the entrance and along the outward axis until **d = 2.2 m**, false at **d = 2.4 m** (exact disc radius `LARGE_CAVE_MOUTH_WIDTH/2 + PROXY_MARGIN`);
- at d = 3.5 m (still inside the carved approach footprint) `contains` is false and analytic surface is **> 1 m above** the mouth-floor query Y — enough for an unlimited upward snap.

`createCaves.ts` carves:

- approach dip: radius 3.2 m, depth 1.35 m, centre `entrance + openingDirection * 2.2`;
- mouth pit: radius 1.65 m, depth 2.4 m, at the entrance.

Most of the approach pit is **outside** the 2.4 m entrance disc. Sequence:

1. walk into the dip on terrain (`contains` false, `groundAt` = carved `sampleHeight`);
2. cross into the disc → `contains` true, `sampleFloor` = mouth floor (often well below local terrain) → fall/snap down;
3. one off-axis step back out of the 2.4 m disc → `contains` false → snap up to the hillside.

SDF does not own this path at all. The mouth is a terrain carve plus a flat disc; the SDF mouth is a clipped closed ellipsoid. Presentation opening ≠ gameplay portal.

### Repro 2 — `Grota Czarnego Kamienia` (`cave:0e3cce97`, x=135.843, z=-17.814)

Symptom: entrance works; approaching a main-chamber wall snaps to surface.

Measured at proxy floor + 1 m, sideways from the chamber node (away from the incoming tunnel):

| | distance from chamber centre |
|---|---:|
| SDF wall (field ≥ 0) | **2.0 m** |
| collider ring (`targetWidth/2 + PROXY_MARGIN`) | **5.69 m** |
| `CaveVolume.contains` becomes false | **5.7 m** |
| clip-through gap | **3.7 m** |

Same structure on Grota Mroczna's chamber (SDF wall 3.4 m, proxy exit 5.7 m, gap 2.3 m). Chamber `targetWidth` ≈ 9.5 m, so the *mid-height* ellipsoid radius is ~4.7 m, but at the **flat proxy floor** (near the bottom of the ellipsoid) the standing-height cross-section pinches to ~2 m. Colliders are beads on the *proxy* circumference (`caveColliders.ts`, chamber discs only), so there is nothing between the visual wall and the containment boundary.

`topologyToCaveDefinition` also undershoots flared approaches: each tunnel uses `Math.min` of its endpoint radii, and `seg-chamber` has **no interior waypoints**, so the entire bend→chamber stadium is bend-width while the SDF interpolates up to chamber width. That is a secondary interior hole; the chamber-wall clip/snap is the one that matches this repro.

Proxy `sampleFloor` at the chamber centre is the flat node Y; 2.2 m toward the wall the SDF walkable floor is already **> 0.3 m higher**. The player is walked through the bowl on a plane that dives under the visible floor.

---

## 4. Current `CaveSdfSpatialRepresentation` contract

```ts
// caves/caveSdfField.ts
export type CaveSdfSpatialRepresentation = {
  bounds: Bounds
  sample: (x: number, y: number, z: number) => number  // negative = void
}
```

Enough to *evaluate* a point. Not enough to be a gameplay query layer:

| Need | Present? |
|---|---|
| `contains(x,y,z)` | no (caller can use `sample < 0`, but see mouth clipping) |
| `sampleFloor(x,y,z?)` | no — requires a vertical search |
| `sampleCeiling(x,y,z?)` | no |
| multi-interval column | no — field is continuous; stacked voids would need a Y scan |
| mouth / surface clip | **no** — clip is presentation-only (`clipBelowSurface.ts` on the mesh) |
| acceleration | no — `sample()` loops every ellipsoid + `smin` + feature boxes + noise |
| retained at runtime | no — rebuilt inside `buildSdfCaveMesh` on activate, discarded after extraction |

Field cost: primitives are arc-length spaced at `primitiveSpacing = 0.8 m` along every segment, so L1 is on the order of a few dozen ellipsoids. Fine for meshing. **Not** fine as a per-frame raymarch from `groundAt` / camera boom (~20+ queries/frame × all caves × a Y march).

Do not put raw `representation.sample` on the `PlayerController` hot path.

---

## 5. Target architecture

```text
CaveTopology
    ↓
CaveSdfSpatialRepresentation     source of truth (already exists, keep pure, no THREE)
    ↓
CaveSdfColumnIndex               NEW, derived, deterministic occupancy
    ↓
Caves.queryGround(x,y,z)         gameplay containment / floor / ceiling
    ↓
CaveGroundQuery / PlayerController.groundAt
```

Render mesh stays derived from the same representation (B1). Collision stays on `topologyToCaveDefinition` until B3.

### Source of truth

- **Topology** owns layout intent (unchanged).
- **SDF field** owns continuous cave space (unchanged).
- **Column index** is a derived acceleration structure, like the mesh — never authoritative on its own, always rebuildable from the field.
- **`CaveVolume` / `CaveDefinition`** stop being gameplay space after B2. They remain a collision adapter until B3.

### Query contract

Replace the three-fold `contains` + Y-blind `sampleFloor(x,z)` + `sampleCeiling(x,z)` with one interval query keyed by the caller's Y:

```ts
type CaveVerticalInterval = { floorY: number, ceilingY: number }

type CaveGroundHit = {
  floorY: number
  ceilingY: number
  /** All walkable intervals at this X/Z, lowest-first. L1 usually has one. */
  intervals: readonly CaveVerticalInterval[]
}

// Caves / gameplay space
queryGround(x, y, z): CaveGroundHit | null
contains(x, y, z): boolean   // true iff queryGround ≠ null
```

Rules:

- Pick the interval that contains `y` with a floor grace (keep a `FLOOR_GRACE`-scale slack so a step/jump does not drop the player out). If none, pick the nearest interval whose floor is below `y` and whose ceiling is above `y - PLAYER_HEIGHT` only when that is unambiguous; otherwise `null`.
- **Never** `Math.min` across intervals. That is the multi-level blocker and must not remain the production contract.
- `createApp.ts` `caveGroundQuery` becomes a one-line wrapper around `queryGround`. Keep the `CaveGroundQuery` alias — it is already the right shape.
- If `Caves.sampleFloor(x, z)` / `sampleCeiling(x, z)` must stay for a release, implement them as "lowest interval" and mark them transitional / unused by the player. Prefer deleting the player path's use of them in the same PR.
- Bounds for streaming stay topology/definition bounds; do not make the column index the streaming broadphase.

### Mouth / surface clip (B2, not a later polish)

The SDF field is a closed dome. Gameplay must treat the mouth as an open portal below the analytic surface:

1. Clip column intervals to `ceilingY = min(sdfCeiling, sampleBaseHeight(x,z))` (same sampler the mesh clip uses — **never** resident `sampleHeight`).
2. Union a **mouth portal**: the carved recess footprint (approach + mouth radii from `createCaves.ts`) counts as cave while `y` is between the carved floor and the analytic surface. This is how the player walks `surface → dip → interior` without a 2.4 m disc seam.
3. A surface entity above the cave (`y` near hillside, above clipped ceiling) must still return `null`.

Do not try to sculpt a real hillside doorway in B2 (that remaining quality issue stays in `LOOSE-ENDS.md` / V1 §7). Make the existing carve a reliable portal.

### Contains hysteresis (required, small)

Even with SDF floors, touching an iso-surface can flip `sample >= 0` for one frame. **Do not** fall back to surface when `sampleHeight - playerY` is clearly an underground miss (e.g. > 1.5 m, or > `STEP_DOWN_MAX` plus a margin). Stay on the last cave interval (or reject the XZ step). Leaving through the mouth keeps `sampleHeight ≈ playerY` and must still work.

This is query policy, not collision. B3 still owns actually stopping the body at the wall.

---

## 6. Performance strategy

**Hybrid: SDF as source, column index as the per-frame structure.** Direct SDF for gameplay queries is the wrong default; a global voxel terrain is also wrong.

Suggested index (keep it cave-local, no shared world grid):

```text
origin snapped to a fixed world step (not noisy bounds.min)
step 0.25–0.5 m (start 0.4 m, same order as DEFAULT_SDF_PARAMS.cellSize)
per column: sorted disjoint {floorY, ceilingY}[]
build: vertical scan of representation.sample, clip to analytic surface
```

Build **once per cave at world-build** (field + columns are cheap vs mesh extraction) and retain next to the topology. Do **not** rebuild on activate. Meshes stay lazy.

Determinism: same topology + same params + same snapped origin → bit-identical columns. Key the noise the way `buildCaveSdfRepresentation` already does (`hashCaveId`). No `Math.random`, no activation-order `Map` iteration.

Per-frame: bilinear/nearest column lookup + interval pick. No raymarch along the boom in B2 (camera remaining on `withCaveFloorFallback` + this query is enough to not *introduce* cost; boom quality is B3).

Do not pre-extract a BVH from the render mesh. Render mesh is not gameplay authority (plan invariant).

---

## 7. Migration path

1. Keep `buildCaveSdfRepresentation` as the field builder. Optionally retain the representation on the `Caves` handle (today it is thrown away after meshing — B2 needs it, or the column index derived from it, at world-build).
2. New module e.g. `caves/caveSdfQuery.ts`: column index + `queryGround`. No Three.js. JSDoc `@domain world-terrain`.
3. Wire `createCaves()`:
   - world-build: topology → representation → column index (and still `topologyToCaveDefinition` for colliders);
   - `contains` / player ground → column query;
   - `activate()` unchanged (mesh + `buildCaveWallColliders(definition)`).
4. Mouth portal constants: reuse `APPROACH_RADIUS` / `MOUTH_RADIUS` / `CAVE_MOUTH_DEPTH` already in `createCaves.ts` / `caveGenerator.ts`. Do not fork a second carve model.
5. Leave `topologyAdapter.ts` / `caveVolume.ts` / `caveColliders.ts` in tree. Stop calling `createCaveVolume` from the **ground** path. Collider path still uses the adapter.
6. Do not rename spike-era files in this slice (`caveSpikeMaterial.ts`, …).

`PlayerController` / `cameraBoom.ts`: **do not** change boom math, collider filtering, or `PLAYER_COLLISION_RADIUS`. `groundAt` automatically consumes the better `CaveGroundQuery`. A hysteresis policy belongs in `Caves.queryGround` or `caveGroundQuery`, not in `integrateVerticalMotion` (that function is shared with non-cave movement).

---

## 8. Compatibility boundary with B3

| After B2 | Owner |
|---|---|
| Gameplay floor / ceiling / contains | SDF column index |
| Mouth portal | B2 query (carve footprint ∪ clipped SDF) |
| Wall collision beads | still `buildCaveWallColliders(proxy definition)` |
| Camera boom occlusion / ceiling | still broken (`CAMERA_OCCLUDER_MIN_RADIUS`, no ceiling test) — B3 |
| NPC/fauna `collidersNear` without Y filter | pre-existing V1 gap — B3 if still present |
| `topologyToCaveDefinition` / `CaveVolume` | keep for colliders + tests; not gameplay |
| V1 `caveMesh.ts` / Sweep | still unused in production; B5 |

B2 **will not** stop the player at the visual wall. After B2 they should walk *on the bowl* toward the wall instead of through it on a ghost plane; B3 must then put colliders on that same SDF silhouette so they cannot squeeze into `sample >= 0` and so the boom occludes.

Do not derive B2 containment from collider beads. Do not wait for B3 to fix the two repros — they are ground-query bugs.

---

## 9. Files and symbols

Start here:

```text
src/world/createCaves.ts                 runtime owner; switch ground path; retain SDF/index
src/world/caves/caveSdfField.ts          CaveSdfSpatialRepresentation, buildCaveSdfRepresentation
src/world/caves/topologyAdapter.ts       PROXY_MARGIN, topologyToCaveDefinition — collider only after B2
src/world/caveVolume.ts                 contains / sampleFloor Math.min collapse — leave for colliders
src/app/createApp.ts                    caveGroundQuery (~667)
src/player/PlayerController.ts          CaveGroundQuery, groundAt, PLAYER_HEIGHT 1.8, collision radius 0.35
src/player/verticalMotion.ts            unlimited upward snap — do not "fix" by tweaking STEP_DOWN_MAX
src/world/caves/clipBelowSurface.ts     presentation clip; reuse the same surface sampler for query clip
src/world/caves/sdfCaveMesh.ts          still presentation; may keep calling buildCaveSdfRepresentation internally
src/world/caves/caveGameplayQuery.b2-recon.test.ts   invert these assertions in B2
```

Do not touch: fauna `type: 'cave'` spawners, `cameraBoom.ts` algorithm, `ColliderRegistry`, streaming distances, production topology generation, mesher.

New file (expected): `src/world/caves/caveSdfQuery.ts` (+ test).

---

## 10. Focused tests (no browser)

Keep / invert `caveGameplayQuery.b2-recon.test.ts` against seed `1136726869`:

- both cave ids still reconstruct;
- Grota Mroczna: mouth-floor Y remains contained through the carved approach (d = 3.5 m outward) and only drops once the player is actually outside the recess;
- Grota Czarnego Kamienia: standing on the **SDF** floor toward the chamber wall, `queryGround` stays non-null up to the visual wall and `floorY` tracks the bowl (not the flat proxy plane);
- player-height SDF void below analytic surface ⊆ `queryGround` (the old proxy-superset test becomes an SDF-query inclusion test);
- stacked-interval contract: two synthetic voids at the same X/Z pick by Y, not `Math.min`;
- mouth: a point on the hillside above the cave (`y ≈ sampleBaseHeight`) is not contained;
- column index determinism (same topology → identical intervals);
- no Three.js / `ChunkManager` in these tests — copy `caveSurfaceIntegration.test.ts`'s `sampleHeightAt` pattern.

Do not add Playwright/browser automation.

---

## 11. Manual verification checklist (Player)

Seed `1136726869`. Teleport via `seedvale.debug.teleportTo({ kind: 'village', position: { x, z }, distance: 0 })` with the coordinates below (same as location catalog).

1. **Grota Mroczna** — `cave:cave:7fd14c30` at x=316.008, z=109.778  
   Walk in from downhill. Must enter without being thrown to the meadow. Back out through the same mouth onto the hillside without popping.
2. **Grota Czarnego Kamienia** — `cave:cave:0e3cce97` at x=135.843, z=-17.814  
   Enter (already worked). Walk to a main-chamber wall. Must not snap to the surface. Standing on the visible floor near the wall is enough; clipping *into* the wall is a B3 miss, not a B2 fail, as long as there is no surface teleport.
3. Walk a passage + chamber on both caves: no mid-route surface pop, jump (`JUMP_HEIGHT` 0.6) stays in cave.
4. Stand on the hillside *above* a tunnel: still surface, not cave floor.

Camera clipping through walls/ceiling and visible mesh clipping at the wall remain acceptable in B2.

---

## 12. Explicit out of scope

- **B3:** `ColliderRegistry` cave walls from SDF, Y-filter for NPC/fauna, boom occlusion, ceiling camera test, `CAMERA_OCCLUDER_MIN_RADIUS`.
- **B4:** workers, meshing budget, activation hitch, streaming rewrite.
- **B5:** delete Sweep / `spikeTestCave.ts` / `caveMesh.ts` / `topologyToCaveDefinition` / `CaveVolume`.
- Dual Contouring / Marching Cubes rewrite.
- Raising `PROXY_MARGIN` as the fix.
- Terrain-mouth sculpted ramp (quality loose end, 2026-09-03).
- Fauna cave habitats, loot, persistence, navmesh.
- Changing `makeCaveId` / siting / production topology shape.

---

## 13. Suggested B2 implementation order

1. Column index + `queryGround` over a synthetic field (stacked intervals, determinism) — no world wiring.
2. Clip intervals to analytic surface; add mouth-portal union using existing carve radii.
3. Wire `createCaves` ground path; leave colliders on the adapter.
4. Invert `caveGameplayQuery.b2-recon.test.ts` for the two repro caves.
5. `tsc` / lint / targeted tests. Stop. Player does the browser checklist.
