# Cave Heightfield Representation — Design

**Status:** `design complete, implementation not started`
**Created:** 2026-09-11
**Domain:** `world-terrain`
**Supersedes (as the target representation):** `docs/plans/world-terrain-018-cave-heightfield-representation-spike.md` §4, §7, §8, §9
**Related:** `01-problem-and-requirements.md`, `02-generation-techniques-research.md`, `04-sweep-vs-sdf-spike-results.md`, `05-b4-streaming-lifecycle-performance-recon.md`

> This document is the outcome of a focused recon of the merged heightfield spike
> (`src/debug/caves/`, `src/debug/createCaveHeightfieldTestScene.ts`) against the
> current production Cave V2 code. Current source is the source of truth; where
> plan world-terrain-018 or its implementation notes disagree with this document,
> **this document wins for the target representation** and the plan is stale.
>
> Nothing here is implemented yet.

---

## 1. Problem statement

### What we are testing

Production Cave V2 represents a cave as a **local continuous 3D SDF** (`caveSdfField.ts`)
that is then consumed three separate ways:

```text
CaveTopology
    ↓
CaveSdfSpatialRepresentation        sample(x,y,z) -> signed distance
    ↓
 ├─ sdfCaveMesh.ts                  Surface Nets over a 3D grid   -> presentation
 ├─ caveSdfQuery.ts                 3D column scan + bisection    -> gameplay ground
 └─ caveSdfColliders.ts             derived boxes                 -> body/camera collision
```

Every consumer pays a volumetric cost: the mesh extracts an `X × Y × Z` grid, and
`buildCaveSdfColumnIndex` re-scans every `(x, z)` column in `Y` with 24 bisection
iterations per zero crossing. Milestone A measured **112.6 ms** of mesh extraction
alone for a ~24.5 m route at `cellSize = 0.4` (`04-sweep-vs-sdf-spike-results.md` §2),
which is why B4 exists at all (async extraction worker, 55/80 m hysteresis).

The hypothesis under test: **for the caves Seedvale actually builds today**, the
entire interior can be expressed by two 2D fields

```text
floorY(x, z)
ceilingY(x, z)
```

reducing generation, meshing and querying from `O(X·Y·Z)` to `O(X·Z)`.

### Why it matters

- Generation cost is the single largest known Cave V2 risk carried into Milestone B.
- A 2D representation is directly queryable — it can be its own collision and
  gameplay source of truth with no derived column index and no derived collider boxes.
- If it holds, B4.2 (asynchronous SDF extraction) and the extraction worker may become
  unnecessary rather than merely optimised.

### What this document must not do

Decide the production migration. This is the representation design for the **next
harness iteration** only. The Player evaluates geometry in the browser; that
evaluation, not this document, gates any change to `createCaves()`.

---

## 2. Current implementation findings

The merged spike is real, tested and wired correctly at the *seam* level, and
structurally wrong at the *geometry* level.

### 2.1 What the spike actually builds

`buildCaveHeightfieldRepresentation()` (`caveHeightfieldRepresentation.ts`) produces a
cell-centre grid at `cellSize = 0.4` holding `inside` (Uint8), `openSky`, `floorY`,
`ceilingY`, `signedDistance`. For every cell it takes the **nearest** capsule/disc
(`nearestCoverage`), so:

```text
signedDistance = distanceToCenterline - radius          // binary footprint test
floorY         = centerlineY            + floorNoise    // flat across the width
ceilingY       = centerlineY + height   + ceilNoise     // flat across the width
```

`floorY` and `ceilingY` **do not vary with lateral distance at all**. The cross-section
is a rectangle by construction:

```text
current                        intended
 ______________                  ______
|              |               /        \
|              |              |          |
|______________|               \________/
```

`extractHeightfieldBoundaryEdges()` then walks orthogonal inside→outside grid edges and
`emitWalls()` emits one **vertical rectangle per grid edge**, flat-topped and
flat-bottomed (`floorY0 === floorY1 === floorY[i]`). That is the user-reported
"walls are vertical rectangles", and it is not a bug in the mesher — it is the
representation the plan asked for (plan §4: *"Heightfield ma odpowiadać wyłącznie za
podłogę i sufit. Ściany mają być generowane z granicy footprintu"*). **That plan
decision is the thing being rejected here.**

### 2.2 Floor and ceiling normals are both inverted — verified

`emitFloorOrCeiling()` in `caveHeightfieldMesh.ts` emits, for cell corners
`v00(x0,z0) v10(x1,z0) v11(x1,z1) v01(x0,z1)`:

```ts
// floor
indices.push(v00, v10, v01,   v10, v11, v01)
// ceiling  ("Wind opposite the floor so normals face the interior (−Y)")
indices.push(v00, v01, v10,   v10, v01, v11)
```

`THREE.BufferGeometry.computeVertexNormals()` computes `n = (C − B) × (A − B)`.
Evaluated numerically on those exact index orders with `cellSize = 0.4`:

```text
FLOOR    tri1 (0, -0.16, 0)   tri2 (0, -0.16, 0)     -> normal points DOWN
CEILING  tri1 (0, +0.16, 0)   tri2 (0, +0.16, 0)     -> normal points UP
```

Both are exactly backwards. The material is `FrontSide` (`createHeightfieldCaveMaterial`),
so from inside the cave **the floor and the ceiling are both back-faces and both get
culled**. Only the boundary walls remain visible. This is precisely the user's
observation *"floor wygląda jak niewidoczny / oglądany od złej strony"*, and it also
explains why the interior reads as "walls only".

The fix is a one-line swap of the two index orders — verified numerically:

```text
floor   (v00, v01, v10)  (v10, v01, v11)   -> (0, +0.16, 0)   up    ✅
ceiling (v00, v10, v01)  (v10, v11, v01)   -> (0, -0.16, 0)   down  ✅
```

The comment in the source states the intent correctly; the code does the opposite of
its own comment. **`FrontSide` is not the problem and should be kept** — it is what made
the defect visible at all.

### 2.3 Cell quads cannot be smooth, and leak

`emitFloorOrCeiling` pushes **four fresh vertices per cell** and emits a flat quad at
that cell's own `y`. Adjacent cells at different heights therefore:

- never share a vertex, so `computeVertexNormals()` cannot smooth anything
  (compounded by `flatShading: true`);
- leave an **open vertical gap** between neighbouring tiles — the floor is a field of
  disconnected plateaus, not a surface. Any floor slope (the intended ~5 m descent)
  turns into visible terraces with see-through slots between them.

The walls have the same defect: each edge quad uses its own cell's single
`floorY`/`ceilingY`, so neighbouring wall quads step past each other.

### 2.4 `minClearance` is enforced everywhere, which forbids a rounded section

```ts
if (cy - fy < topology.minClearance) { /* push floor down, ceiling up around the mid */ }
```

applied to **every inside cell**. A rounded cross-section requires `ceilingY − floorY → 0`
at the outer rim. Enforcing `minClearance` on every cell structurally prevents floor and
ceiling from ever converging — the representation is forced to be a prism. Any future
version must enforce clearance **only over the walkable core**, never at the rim.

### 2.5 The surface still closes over the mouth — and this is not spike-only

`buildSurfaceMesh()` in `createCaveHeightfieldTestScene.ts` builds a plain
`PlaneGeometry(72, 72, 72, 72)` displaced by `walkSurfaceAt` and **never removes a
triangle**. `mouthCarveDepth()` only *deepens* terrain (a pit), it never opens it.

The same is true in production: `createCaves()` calls
`chunkManager.modifyTerrain(disc.x, disc.z, disc.radius, disc.depth, 'system')` per
`mouthCarveDiscs()` — a recess, not a hole. `docs/STATE.md` records it openly:
*"Hillside doorway / terrain-hole presentation ... are open B3 leftovers"*.

So *"surface zasłania cave mouth"* is a **terrain-presentation gap shared with
production**, not a heightfield defect. It cannot be fixed by changing the cave
representation alone, and it must be fixed explicitly (§8).

### 2.6 What the spike got right and must be preserved

These are the parts worth keeping verbatim:

- **The walk seam.** `caveHeightfieldWalkWorld.ts` routes *both* variants through the
  production chain `columnIntervals → pickInterval → applyCaveGroundHysteresis →
  integrateVerticalMotion → applySlopeMovementConstraint → resolveCameraBoom`. That is
  the only reason the harness can detect a surface-snap regression at all.
- **Surface clipping** with production `SURFACE_CLIP_EPS`, and `heightfieldOccupancyAt`
  mirroring `occupancyIntervalAt` with `CAVE_OCCUPANCY_EPS`.
- **The terrain anchor.** `CAVE_HEIGHTFIELD_TERRAIN_ANCHOR = (-1638, -918)` on seed `1`,
  sampled through the production analytic seam (`sampleHeightAt` + `defaultTerrainConfig`),
  with 12–14 m of real hillside over the deepest station.
- **Fixture anchoring** through `minSurfaceOverFootprint` + `mouthOverburdenRequirement`
  + `STATION_SAFETY`, mirroring `productionTopology.ts`.
- **Metrics + `[1]/[2]/[3]` harness controls**, and the Walk/Inspect split.
- The `CaveTopology` contract itself — no second topology type was invented.

### 2.7 Traversal notes

`resolveHeightfieldHorizontal()` pushes the capsule out along the gradient of
`signedDistance` — i.e. out of the **binary footprint**. With a rounded section the
footprint boundary is no longer where the player should stop (they should stop where the
void gets too low), so this query needs a different field, not a different algorithm (§9).

`queryHeightfieldSpace().blocked` and the `isMouthCorridor` pad are both consequences of
the binary footprint and disappear with it.

---

## 3. Feasibility — does `floorY + ceilingY` cover current and near-term Cave V2?

Checked against `buildProductionCaveTopology()` (`productionTopology.ts`), which is what
actually runs today.

| Topology element | Current production shape | 2.5D? |
|---|---|---|
| `entrance` → `transition` → `passage` → `widening-bend` → `chamber` | one descending chain, `targetWidth` 2.5–4 m rising to 9–10 m, `targetHeight` up to 9–11 m | ✅ single floor/ceiling per column |
| optional `branch` | one extra chamber off `widening-bend`, accepted only if `minGapBetweenPaths(...) ≥ MIN_DISCONNECTED_CLEARANCE (1.5 m)` | ✅ — and note `minGapBetweenPaths` measures **XZ surface-to-surface gap** using `RadialStation {x, z, radius}`, so branches are already guaranteed XZ-separated. 2.5D is safe by construction. |
| `minClearance: 2.4` | a scalar corridor requirement | ✅ |
| mouth carve / approach pit | `mouthCarveDiscs` → terrain recess | ✅ (pure XZ discs) |
| **`features`: `shelf`** | exactly one per cave when chosen (50/50 with overhang). **Intended semantics:** elevated floor region / ledge **adjacent in XZ** to lower chamber floor — part of `floorY`, not traversable void underneath. **Production SDF today:** `chamber-shelf` is a **solid box subtracted from the void** (`featureBoxesFromTopology` → `d = max(d, -boxSDF)`), centre at `chamberY + 0.35·H`, size ~`2.6–3.8 × 0.4–0.9 × 1.8–2.6`, offset `0.55·chamberRadius` sideways — an **implementation mismatch** (unnecessary 3D floating slab), not design intent. | ✅ single `floorY(x,z)` per column |
| **`features`: `overhang`** | `chamber-overhang` — same box-subtraction path; centre at `chamberY + 0.68·H`, size ~`3.0–4.2 × 1.0–1.6 × 2.0–2.8`, offset `0.4·chamberRadius`. Can create **void above and below** in the same XZ column (two vertical intervals) when the box sits in open air. | ❌ **True volumetric ceiling/wall feature** — may need `ceilingY` deformation in 2.5D or remain a 3D-only presentation concern. |

### Shelf semantics (canonical)

> **Shelf is a floor-height feature:** an elevated floor region/ledge adjacent in XZ
> to lower chamber floor. It does not create traversable void underneath and
> remains single-valued as `floorY(x,z)`.

Shelf is not a floating slab, a platform with empty space under it, or geometry that
assigns two vertical void intervals to the same `(x,z)`. Multiple floor levels in one
chamber are allowed when they occupy **different XZ areas** (plateau, wall ledge,
rock step/terrace). Transition from lower floor to shelf may be slope, cliff, or step
depending on generation; no cavity under the shelf is required.

Do **not** conflate `shelf` with `overhang`: overhang remains a genuine 3D
ceiling/wall feature and may still be a 2.5D limitation when it needs more than one
vertical interval per column.

### Feature handling for the heightfield path

- **`shelf` (recommended):** raise `floorY` over the feature footprint to the ledge
  top — local floor elevation/plateau. This is the **normal** heightfield expression
  of topology intent, not a workaround or “reinterpretation” of a floating SDF box.
- **`overhang`:** lower `ceilingY` over the footprint (rock pendant from below). Reads
  as an overhang from the walkable floor; does not reproduce every view-dependent
  undercut the volumetric SDF box can show. If that gap matters, acceptance item 20
  applies; keeping a small derived mesh for overhang only remains a fallback (plan
  world-terrain-018 §13).
- **Drop features entirely** only if the Player explicitly accepts losing L1 chamber
  character; plan world-terrain-008 still expects shelf **or** overhang per cave.

### Verdict

> **`floorY(x,z) + ceilingY(x,z)` is sufficient for every structural element the current
> Cave V2 topology builder produces, including `shelf`. `overhang` is the main feature
> that may require ceiling deformation or accept a presentation compromise in 2.5D.**

Two further facts support this:

- `04-sweep-vs-sdf-spike-results.md` §7 already records *"gameplay floor/ceiling queries
  remain effectively one-floor-per-XZ through the compatibility path"* — production
  gameplay is **already** 2.5D in practice. Only presentation is volumetric.
- `caveSdfQuery.ts`'s `CaveVerticalInterval[]` contract survives unchanged: the
  heightfield simply always returns an array of length 0 or 1.

---

## 4. Candidate representations

Only three are worth stating. One dominates.

### C1 — Binary footprint + flat floor/ceiling + boundary walls (the current spike)

The plan's model. Rejected: the rectangular section is the defect being fixed, wall
geometry is a parallel mechanism with its own seams, and the binary mask forces a hard
edge everywhere.

### C2 — 2D signed-distance footprint + laterally-shaped floor/ceiling

Keep `signedDistance` as the footprint field, but modulate `floorY`/`ceilingY` by
`d/R`. Produces the right shape. Rejected only because it keeps **two** fields that must
agree (`signedDistance` and the floor/ceiling pair): the footprint edge and the
floor/ceiling convergence can drift apart under noise, reopening seam bugs, and it keeps
a discrete `inside` mask that nothing needs.

### C3 — **Floor/ceiling pair as the only field; footprint is `ceilingY − floorY > 0`** ✅

One grid, two `Float32Array`s. The footprint is not stored — it is the sign of the
derived clearance `gap(x,z) = ceilingY − floorY`. Walls are not geometry: they are the
region where `gap → 0`. Collision, occupancy, containment, meshing and rendering all
read the same two arrays.

This directly answers plan-prompt §6: **no discrete `inside` footprint is needed**, and
a 2D influence field is not a 3D SDF in disguise — it is 2 floats per column instead of
`Y/cellSize` samples per column.

**Recommended: C3.**

---

## 5. Recommended representation

### 5.1 State and source of truth

```ts
type CaveHeightfield = {
  originX: number; originZ: number
  cellSize: number
  /** node counts — samples live on grid CORNERS, not cell centres */
  nx: number; nz: number
  floorY: Float32Array    // nx * nz
  ceilY:  Float32Array    // nx * nz
  minClearance: number
  entrance: CaveEntrance
  caveId: string
}
```

- **Corner sampling, not cell centres.** This is what makes shared vertices and smooth
  normals possible (§2.3). Index `iz * nx + ix`, node position `origin + i * cellSize`.
- **No `inside`, no `openSky`, no `signedDistance` array.** `gap = ceilY − floorY`;
  `gap > 0` is the footprint; open-sky is `ceilY ≥ surfaceY − SURFACE_CLIP_EPS`, computed
  on demand from the same analytic sampler production uses. Three arrays removed.
- **Three.js-free**, deterministic from `(CaveTopology, config)` alone.

### 5.2 Centerline / path

Unchanged from the spike and from `caveSdfField.placePrimitivesAlongPath` semantics:
resample each `segment.centerline` by **true arc length** at `centerlineSpacing` (0.5 m),
never by control-point density. `resampleSegmentStations()` already does this correctly
and should be kept, extended to also carry the arc-length parameter `s`.

Crucially: a segment contributes **one continuous influence**, not one influence per
station. Nearest-point is taken over the whole polyline, and `R/A/H` are interpolated at
the resulting `s`. Per-station union would re-introduce the smooth-union beading the
SDF spike warned about.

### 5.3 Per-influence cross-section

For influence `i` at point `(x, z)`:

```text
s   = arc-length parameter of the nearest point on the influence axis
d   = XZ distance to that point
R(s) = targetWidth(s) / 2            from topology, interpolated along s
A(s) = centerline Y at s             from topology  (the axis floor)
H(s) = targetHeight(s)               from topology  (the axis clearance)
Yc(s) = A(s) + BETA * H(s)           the WAIST: where floor meets ceiling
```

`BETA = 0.30`. Then with `u = d / R(s)`:

```text
ff(u) = 1 - (1 - u^NF)^(1/NF)        floor  lift fraction,  NF = 2.5
cf(u) = 1 - (1 - u^NC)^(1/NC)        ceiling drop fraction, NC = 2.0

u <= 1:   f = A + BETA*H*ff(u)
          c = A + H - (1-BETA)*H*cf(u)

u >  1:   f = Yc + KAPPA*(d - R)     diverging extension, KAPPA = 3
          c = Yc - KAPPA*(d - R)
```

Properties (all checked algebraically):

| u | f | c | gap |
|---|---|---|---|
| 0 | `A` | `A + H` | `H` |
| 1 | `Yc` | `Yc` | `0` |
| >1 | rises | falls | negative, `-2·KAPPA·(d-R)` |

So **floor and ceiling converge to a single point at the rim** — the wall is the union
of the outer floor and outer ceiling, exactly as intended, and no wall geometry exists.

The complementary superellipse gives a vertical tangent at `u = 1` (the wall is genuinely
vertical at the waist) and a **zero** tangent at `u = 0` (the floor is genuinely flat
under the player). Both are the properties we want, and neither an ellipse
(`sqrt(1-u²)` — flat only at one point) nor a smoothstep (no vertical tangent, so the
rim closes at a shallow angle and the "wall" looks like a skate ramp) gives both.

Why these exponents:

- `NF = 2.5` — with a 2.6 m passage (`R = 1.3`, `BETA·H = 0.78 m`), the floor has risen
  ≤ 0.3 m out to `u = 0.85`, i.e. **2.2 m of walkable belt inside a 2.6 m nominal width**.
  `NF = 3` gives 2.4 m of belt but a near-vertical last 0.2 m (too rectangular);
  `NF = 2` (circular) gives only 1.8 m of belt. `NF` is *the* knob for
  "flat road ↔ rounded bowl" and should be exposed in the harness.
- `NC = 2.0` — a rounder, domier ceiling. Deliberately **not** equal to `NF`, so the
  ceiling is not a mirror of the floor even before noise (prompt §9).
- `BETA = 0.30` — waist below mid-height, which is what real passages look like: a
  wider floor bowl and a taller dome.
- `KAPPA = 3` — see §5.5 for why the extension slope matters.

ASCII, 2.6 m wide × 2.6 m high passage, `BETA = 0.30`:

```text
            ceiling apex A+H
                 ___----___
             _--´          `--_          cf(u), NC = 2.0
           _-                   -_
          /                       \
  waist  |                         |     Yc = A + 0.30*H   <- floor and ceiling MEET
          \_                     _/
            `-__             __-´        ff(u), NF = 2.5
                `----_____----´
            floor axis A          <- flat here; rise <= 0.3 m over +-1.1 m

  d:  -1.3      -0.65      0      +0.65      +1.3
  u:   1.0       0.5      0.0      0.5        1.0
```

### 5.4 Chamber model

A chamber node is **not** one big influence. It is the smooth union of `N` 2D elliptical
lobes, deterministically generated from the cave's own RNG:

```ts
N = 3 + floor(rng() * 3)                      // 3..5 lobes
for j in 0..N-1:
  theta_j = (j / N) * 2*PI + (rng() - 0.5) * 0.9
  off_j   = (0.15 + rng() * 0.30) * Rc        // centre offset from the node
  a_j     = (0.50 + rng() * 0.30) * Rc        // ellipse semi-axis 1
  b_j     = (0.50 + rng() * 0.30) * Rc        // ellipse semi-axis 2
  phi_j   = rng() * PI                        // ellipse orientation
  dy_j    = (rng() - 0.5) * 0.8               // floor offset, metres
  hf_j    = 0.80 + rng() * 0.35               // height factor on Hc
```

with `Rc = chamber targetWidth / 2`, `Hc = chamber targetHeight`, and
`rng = createCaveRandom(caveId, CAVE_RNG_SALT.lobes)`.

Lobe local coordinate, reusing the `ellipsoidSDF` convention already in
`caveSdfField.ts` (normalise, then rescale by the smallest semi-axis so the result is
metric):

```text
(px, pz) = rotate(x - cx_j, z - cz_j, -phi_j)
uNorm    = sqrt((px/a_j)^2 + (pz/b_j)^2)
rEff     = min(a_j, b_j)
u        = uNorm                       // already normalised: 1 at the lobe rim
d - R    = (uNorm - 1) * rEff          // metric distance outside, for the extension
A_j      = chamberY + dy_j
H_j      = Hc * hf_j
```

Then the same `ff/cf/BETA/KAPPA` cross-section applies unchanged. One profile function
serves passages and chambers.

```text
        lobe layout (top view)              resulting footprint
             ___                                 _,--~--._
            /   \  ___                         ,'         `.
       ___ |  2  |/   \                       (             )
      /   \ \___/|  3  |                       `.         ,'
     |  1  |     \___/                          `~-.___,-'
      \___/   x  node                        irregular, no circle
```

**Why lobes rather than one ellipse + boundary noise:** boundary noise on a single circle
gives a *wobbly circle* — the silhouette still reads as round. Overlapping lobes change
the topology of the silhouette (bays, a pinch between two lobes, an asymmetric long axis)
for the same cost. This is the cheapest way to get a chamber that does not read as a
cylinder, and it is the approach the prompt proposed; the recon supports it.

### 5.5 Union of influences

```text
floorY = smin_k ( f_1, f_2, ... f_n )
ceilY  = -smin_k( -c_1, -c_2, ... -c_n )        // soft max
k = 0.7 m
```

`smin` is **already exported** from `src/world/caves/caveSdfField.ts` — reuse it, do not
write a second one.

- Soft-min on the floor picks the *lowest* floor and rounds the junction; soft-max on the
  ceiling picks the *highest* ceiling. That is exactly void union.
- The `KAPPA`-slope extension (§5.3) is what makes the union safe. At a point outside two
  influences, a phantom void requires `Yc_i − Yc_j > KAPPA·(dOut_i + dOut_j)` — with
  `KAPPA = 3` that means two influences whose waists differ by more than 3 m per metre of
  lateral separation, i.e. the stacked case 2.5D excludes anyway, and which
  `MIN_DISCONNECTED_CLEARANCE` already prevents in the topology builder. With
  `KAPPA = 1` this margin is 3× thinner; do not lower it without re-testing the branch
  fixture.
- Folding order is the topology's own (segments in order, then lobes), so determinism
  holds even though `smin` is not exactly associative — the same caveat the production
  SDF already lives with.

**Tunnel → chamber is smooth for free**: the last segment's `R(s)` already grows toward
the chamber node's `targetWidth` (topology interpolation), the lobes overlap the segment
end, and `smin_0.7` blends the two over ~0.7 m of Y. There is no discrete transition to
special-case. This is the direct answer to prompt §7's *"narrow tunnel → ideal circle"*
concern.

### 5.6 Noise

Two scales, both deterministic, both with explicit guardrails. Needs a 2D value noise;
the repo has only `createValueNoise1D`/`createMultiScaleNoise1D` in
`src/world/caves/spikeNoise.ts`, and the spike carries a private `valueNoise2D` copy.
**Promote one `createValueNoise2D(seed, cellSize)` into `spikeNoise.ts`** and delete the
private copy — one owner, no parallel mechanism.

**Macro (wall shape), cell ≈ 3.0 m, amplitude 0.45 m** — perturbs the *radius*, not the
heights:

```text
R'(x, z) = R(s) + MACRO_AMP * n_macro(x, z) * taper(x, z)
R'       = max(R', max(R_MIN, 0.70 * R(s)))       R_MIN = 0.60 m
```

Because it moves `R`, both `ff` and `cf` respond to it together, so the floor/ceiling weld
at the rim is preserved exactly — the wall waves in and out, it never tears.
`taper` → 0 near the mouth (`mouthAlong > -1.5`) so the aperture stays clean.

**Detail (surface roughness)** — additive on the heights, **attenuated to zero at the rim**:

```text
floorY += FLOOR_AMP * n_floor(x, z) * (1 - ff(uMin))      FLOOR_AMP = 0.12, cell 1.4 m
ceilY  += CEIL_AMP  * n_ceil (x, z) * (1 - cf(uMin))      CEIL_AMP  = 0.30, cell 2.1 m
```

`uMin` = the smallest `u` across influences (the "most interior" one). The
`(1 - ff)`/`(1 - cf)` factors are mandatory: additive noise at the rim would break the
floor↔ceiling convergence and tear the mesh open. Different seeds *and* different cell
sizes keep the ceiling from being a scaled mirror of the floor.

`FLOOR_AMP = 0.12` at cell 1.4 m bounds the noise-induced floor slope at
`atan(2·0.12/1.4) ≈ 9.7°` — far under `SLOPE_MAX_WALKABLE_DEG = 55` and under
`STEP_DOWN_MAX = 0.45`, so detail noise can never make a passage unwalkable or cause a
ground-stick pop. That derivation, not taste, is why the amplitude is 0.12.

**Seeds** — extend the existing production owner `CAVE_RNG_SALT` (`caveRng.ts`):

```ts
export const CAVE_RNG_SALT = {
  structure: 0x01, feature: 0x02, centerline: 0x03, branch: 0x04,
  lobes: 0x05, macro: 0x06, floorDetail: 0x07, ceilDetail: 0x08,   // new
}
```

One stream per purpose, keyed on `caveId` — toggling one never perturbs another.

No worldgen cache namespace is affected: caves are not in `worldgenCacheDb` (only
`locationsCoarseCache` and `seedLibrary` use it), and cave geometry is a pure function of
`(seed, site)`. No version bump is required for this work.

### 5.7 Minimum clearance — corridor only

The §2.4 defect fixed:

```text
uCore = 0.55,  uFade = 0.90
core     = 1 - smoothstep(uCore, uFade, uMin)
required = topology.minClearance * core
ceilY    = softmax(ceilY, floorY + required, 0.25)      // soft, so no crease
```

- Enforced **after** detail noise, so it can repair a pinch the noise created.
- Raises the **ceiling**, never lowers the floor — the floor is the gameplay surface and
  carries the topology's authored descent.
- Goes to zero before the rim, so floor and ceiling are still free to converge.
- `softmax` = `-smin(-a, -b, k)`, reusing the same helper.

### 5.8 Determinism summary

Everything is a pure function of `(CaveTopology, CaveHeightfieldConfig)`; all randomness
comes from `createCaveRandom(topology.caveId, salt)`; all noise is lattice value noise
seeded the same way; influence order is the topology's declaration order. No `Math.random`,
no time, no iteration-order dependence, no player dependence.

---

## 6. Cross-section model — implementable form

```ts
/** Complementary superellipse: 0 at the axis (flat), 1 at the waist (vertical). */
function closure(u: number, n: number): number {
  if (u <= 0) return 0
  if (u >= 1) return 1
  return 1 - Math.pow(1 - Math.pow(u, n), 1 / n)
}

type Influence = { s: number; d: number; R: number; A: number; H: number }

function crossSection(inf: Influence): { f: number; c: number; u: number } {
  const { d, R, A, H } = inf
  const Yc = A + BETA * H
  const u = d / R
  if (u <= 1) {
    return {
      u,
      f: A + BETA * H * closure(u, NF),
      c: A + H - (1 - BETA) * H * closure(u, NC),
    }
  }
  const out = KAPPA * (d - R)
  return { u, f: Yc + out, c: Yc - out }
}

function fieldAt(x: number, z: number): { floorY: number; ceilY: number; uMin: number } {
  let f = Infinity, c = -Infinity, uMin = Infinity
  for (const inf of influencesAt(x, z)) {          // segments first, then lobes
    const cs = crossSection(inf)
    f = f === Infinity ? cs.f : smin(f, cs.f, SMOOTH_K)
    c = c === -Infinity ? cs.c : -smin(-c, -cs.c, SMOOTH_K)
    uMin = Math.min(uMin, cs.u)
  }
  // detail noise, attenuated to zero at the rim
  f += FLOOR_AMP * noiseFloor(x, z) * (1 - closure(uMin, NF))
  c += CEIL_AMP  * noiseCeil (x, z) * (1 - closure(uMin, NC))
  // corridor-only clearance guard
  const required = minClearance * (1 - smoothstep(U_CORE, U_FADE, uMin))
  c = -smin(-c, -(f + required), 0.25)
  return { floorY: f, ceilY: c, uMin }
}
```

`gap = ceilY − floorY`. `gap > 0` ⇔ cave void. That is the whole representation.

**Constants (harness starting values, not production constants):**

```text
BETA 0.30 · NF 2.5 · NC 2.0 · KAPPA 3 · SMOOTH_K 0.7 · U_CORE 0.55 · U_FADE 0.90
cellSize 0.4 · centerlineSpacing 0.5
MACRO_AMP 0.45 @ 3.0 m · R_MIN 0.60 · FLOOR_AMP 0.12 @ 1.4 m · CEIL_AMP 0.30 @ 2.1 m
```

---

## 7. Chamber model — assessment of the overlapping-lobes approach

Spelled out in §5.4. Assessment:

**Works, and is the right first version.** It is `O(N)` extra influences per chamber
(N ≤ 5) evaluated with the same cross-section code as a passage, it unions smoothly into
the tunnel with no special case, it is deterministic, and it breaks the circular
silhouette in a way boundary noise cannot.

**Known weaknesses to watch in the browser:**

- Lobes with very different `A_j` (floor offset) can create a step between sub-bays.
  `dy_j ∈ [-0.4, +0.4]` keeps any step under `STEP_DOWN_MAX = 0.45`; do not widen it
  without re-checking that bound.
- A lobe that reaches far outside `Rc` can poke out under thin overburden. The topology
  builder's `minSurfaceOverFootprint` check uses `targetWidth/2 + PROXY_MARGIN`, so lobe
  extent must stay inside that: `off_j + max(a_j, b_j) ≤ 0.45·Rc + 0.80·Rc = 1.25·Rc`.
  That is 25% beyond the node radius. **Either clamp lobe extent to `1.0·Rc`, or feed
  `1.25·targetWidth/2` into the overburden check.** Flagged as an open decision (§16).
- Production chambers are 9–10 m wide and 9–11 m tall. A 5-lobe union at that scale with
  `BETA = 0.30` puts the waist ~3 m up the wall and the dome at 9–11 m. That should read
  as a cathedral chamber; if it reads as a dome tent, `NC` is the knob.

**Rejected alternative:** a dedicated chamber field type with its own profile. Adds a
second cross-section model for no gain — lobes reuse the passage profile exactly.

---

## 8. Entrance integration

Three separate things, in order.

### 8.1 The cave must actually reach the surface

Extend the entrance segment's axis **outward past the mouth plane** by
`ENTRANCE_OUTWARD = 0.8 m` (i.e. to `mouthAlong ≈ +0.8`), tapering `R` to
`entrance.width / 2`, and set the entrance station's `H` so that

```text
ceilY(mouth aperture) >= walkSurfaceY + APERTURE_LIFT        APERTURE_LIFT = 0.35 m
```

With current constants this already nearly holds: `entrance.y = base − CAVE_MOUTH_DEPTH
(2.4)` and entrance `targetHeight = 2.6`, so the axis ceiling sits at `base + 0.2`.
The explicit lift makes it a guarantee rather than an accident of two constants.

### 8.2 Real hole in the terrain presentation

Use **one predicate**, shared by the terrain mesher and the cave mesher:

```text
breaksSurface(x, z)  :=  gap(x, z) > 0  AND  ceilY(x, z) >= walkSurfaceY(x, z) - SURFACE_CLIP_EPS
```

- **Terrain mesh:** drop a terrain quad when all four of its corners satisfy
  `breaksSurface`. Nowhere else does the cave void reach the surface, so this opens
  exactly the doorway and nothing over the tunnel. Critically, the `gap > 0` term is what
  stops the whole approach pit from being deleted — the pit is carved terrain with no cave
  void above it.
- **Cave mesh:** skip *ceiling* triangles where `breaksSurface` holds (keep the floor —
  it is the entrance ramp). The two meshes therefore stop at the same contour and the
  portal closes on itself.

This is the same condition production already uses to clip SDF columns
(`SURFACE_CLIP_EPS`), mirrored onto the terrain side. No new concept.

### 8.3 Rock presentation for the seam

A quad-granularity cutout leaves a stepped rim. Mask it with existing assets — do **not**
complicate the cave field to produce a procedural stone portal.

Already in the repo:

- `createLargeCaveVisual(site)` — `src/world/largeCaveVisual.ts`. Procedural, deterministic
  from `site.variant`, already used by `createCaves()` with
  `MOUTH_FRAMING_LENGTH = 3`. Builds a 9-rock mouth arc, side rocks along the approach,
  and a back cluster. **This is the right thing to reuse**: no async load, no GLB
  dependency in the harness.
- `createLargeRock(scale, variant)` / `placeOnGround` — `src/settlement/props.ts`.
- GLBs, if a richer look is wanted later: `public/models/nature/rock_a.glb`,
  `rock_b.glb`, `rock_cluster_a.glb` (M18 / M28 in `docs/assets/MODELS.md`).

Rule from the prompt, adopted: rocks may hide a *seam*. They may not hide a
traversal/collision error. Acceptance (§15) checks traversal with the rocks hidden.

---

## 9. Mesh generation

### Grid and sampling

- Corner/node sampling, `(nx) × (nz)` nodes at `cellSize = 0.4`.
- Per node: `floorY`, `ceilY`, and derived `gap`, `mid = (floorY + ceilY) / 2`.

### Triangulation — marching squares on `gap`

Per cell, classify its 4 corners by `gap > 0`:

- **0 inside** → emit nothing.
- **4 inside** → floor: two triangles; ceiling: the same two reversed.
- **1–3 inside** → for each cell edge whose endpoints straddle `gap = 0`, place a **rim
  vertex** at `t = gap_a / (gap_a − gap_b)`, with `y = lerp(mid_a, mid_b, t)`. Emit the
  inside polygon (3–5 corners) as a fan for the floor and reversed for the ceiling.

**The rim vertex is shared by the floor and the ceiling** (same index). That is the entire
wall mechanism: the surface folds over at the rim and is watertight by construction.
There is no boundary-wall pass, no `extractHeightfieldBoundaryEdges`, no seam to align.

### Shared vertices

- Interior floor/ceiling vertices keyed by node index (two maps: one floor, one ceiling).
- Rim vertices keyed by cell-edge id so adjacent cells reuse them.

This is what makes `computeVertexNormals()` produce smooth shading, and it eliminates the
per-cell terracing and the see-through slots of §2.3.

### Winding — verified

```ts
// floor  (+Y normal)
indices.push(v00, v01, v10,   v10, v01, v11)
// ceiling (−Y normal) — exact reverse
indices.push(v00, v10, v01,   v10, v11, v01)
```

Numerically verified against `computeVertexNormals()`'s `(C−B)×(A−B)` in §2.2.
Fan polygons must be emitted CCW-from-above for the floor and reversed for the ceiling.

### Materials

- `flatShading: false`, `computeVertexNormals()`.
- **Keep `side: FrontSide`.** It is the cheapest permanent regression detector for
  winding; `DoubleSide` would have hidden the current bug entirely.
- Vertex colours can stay, but a single cave material is enough for geometry judgement.

### Open-sky

Skip ceiling triangles where `breaksSurface` (§8.2). Keep floor triangles everywhere
`gap > 0`.

---

## 10. Gameplay queries — one source of truth

All five queries read the same two arrays via bilinear sampling. No column index, no
collider boxes, no second geometry.

| Query | Implementation |
|---|---|
| **Column intervals** | `gap ≤ 0` → `[]`. Else one interval `{ floorY, ceilingY: min(ceilY, surfaceY − SURFACE_CLIP_EPS), openSky: ceilY ≥ surfaceY − SURFACE_CLIP_EPS }`. |
| **Ground** | Existing chain, unchanged: `pickInterval(intervals, y)` → `applyCaveGroundHysteresis(hit, y, surfaceY, last)`. Keeps `CAVE_FLOOR_GRACE` and `CAVE_UNDERGROUND_MISS`, therefore keeps the no-surface-snap / no-swim invariant. |
| **Ceiling clamp** | `heightfieldRockCeilingMaxY(ceiling, floor, playerHeight)` → `integrateVerticalMotion(maxY)`. Unchanged. |
| **Occupancy (camera, colliders)** | `gap > 0 && y ∈ [floorY − CAVE_OCCUPANCY_EPS, clippedCeiling]`. Mirrors `occupancyIntervalAt`. Unchanged. |
| **Lateral containment** | **Changed.** Push out of the contour `gap = G_MIN` (not of a footprint edge), `G_MIN = HEIGHTFIELD_PLAYER_HEIGHT + 0.1 = 1.9 m`, along `∇gap`. Same loop as `resolveHeightfieldHorizontal`, one field swapped. |

Containment deserves a note. With a rounded section there is no wall to collide with —
the floor simply rises. Two mechanisms already handle it and need no new code:

- `applySlopeMovementConstraint` removes the uphill component past
  `SLOPE_MAX_WALKABLE_DEG = 55°`, and the superellipse rim exceeds that well before the
  waist. The player naturally cannot walk up the fringe.
- The `gap = G_MIN` push-out is the hard backstop for the head, and is what stops the
  player standing where the ceiling is below head height.

Note `applySlopeMovementConstraint` probes at `SLOPE_SAMPLE_STEP = 1.2 m`, wider than a
2.6 m passage is half-wide. The harness already wraps the sampler in production
`withCaveFloorFallback`; **keep that** — with a rounded floor the probe now lands on real
rising cave floor instead of the hillside, which is the correct reading and makes the
harness/production divergence recorded in `LOOSE-ENDS.md` less severe, not more.

The camera boom keeps the **raw** walk surface as `sampleHeight` (as
`PlayerController.syncCamera` does) with `occupancyAt` doing the interior work. Do not
change that — it is what the harness is testing.

---

## 11. Performance model

Cave scale used below: production route ~30 m, chamber 10 m, bounds ≈ 40 × 40 m,
vertical extent ≈ 18 m, `cellSize = 0.4`.

| | Production SDF | Current spike | Recommended |
|---|---|---|---|
| Field samples | `100 × 45 × 100 ≈ 450,000` (mesh) **+** `100 × 100 × 45` column scan with 24 bisection iters per crossing | `100 × 100 = 10,000` | `101 × 101 ≈ 10,200` nodes |
| Cost per sample | ~40–80 ellipsoid SDFs + `smin` fold + 3 noise octaves | nearest capsule/disc | nearest over ~60 polyline stations + ≤5 lobes, `smin` fold, 2 noise |
| Representation build | measured 0.07 ms *(field closure only — the real cost is in the consumers)* | ~1–3 ms est. | ~2–5 ms est. (same order; ~1.3× the spike for the profile + lobes) |
| Mesh extraction | **112.6 ms measured** (Surface Nets, smaller ~24.5 m fixture) | not yet measured | ~1–3 ms est. (one pass over 10k cells) |
| Column index build | full extra 3D scan (`buildCaveSdfColumnIndex`) | none | **none — the grid is the index** |
| Collider build | `buildCaveSdfColliders` derives boxes | none (SDF variant only) | **none — `gap` is the collider** |
| Vertices | 3,974 (24.5 m fixture) | 4 per cell, unshared, + 4 per boundary edge | ~2,400 shared est. |
| Triangles | 7,948 (24.5 m fixture) | ~2 per cell ×2 + 2 per boundary edge | ~4,000 est. |
| Persistent memory | intervals per column + geometry | 5 arrays × 10k = ~130 KB | **2 × Float32Array × 10.2k = 82 KB** |
| Peak temp memory | ~792 KB field | — | none beyond the two arrays |
| Gameplay query | `O(1)` index lookup after an `O(X·Y·Z)` build | `O(1)` bilinear | `O(1)` bilinear, no build |

**The headline is not the field build — it is that three whole stages disappear:**
volumetric mesh extraction, the column index, and the derived colliders. If that holds in
measurement, B4.2 (asynchronous SDF extraction) and the extraction worker stop being
necessary rather than being optimised.

**Estimates are estimates.** The next iteration must report measured
`representationMs / meshMs / totalMs / vertices / triangles / geometryBytes` for both
variants on the same fixture — the harness already does this and must keep doing it.

Cheap optimisations available if the field build disappoints, in order: per-influence
XZ bounding-box rejection before the nearest-point loop; a coarse uniform grid over
stations; skipping nodes whose 4-neighbourhood is far outside every bbox. **Do not
implement these before measuring** (plan world-terrain-018 §15.6).

---

## 12. 2.5D limitations — stated plainly

One floor and one ceiling per `(x, z)`. The model **cannot** express:

- **stacked passages** — a tunnel over a tunnel;
- **crossing tunnels at different Y**;
- **vertical shafts** — an unbounded `dz/dy`; a shaft is a column with no single
  floor/ceiling pair;
- **natural bridges / arches** — rock with void above and below;
- **true internal overhangs** (and any geometry that needs **two void intervals in the
  same `(x,z)`**) — production `overhang` boxes can exhibit this; intended `shelf`
  semantics do **not** (§3);
- **anything requiring `intervals.length > 1`**. `pickInterval` was built for stacked
  intervals; the heightfield always hands it 0 or 1.

It **can** express, and these cover current topology: descending floors of any grade,
bends, widenings, XZ-separated branches and junctions, irregular chambers, variable
clearance, wall-attached ledges (as floor plateaus) and roof pendants (as ceiling dips).

These limitations must not be patched with exceptions. If the Player decides multi-level
caves are a near-term requirement, the correct answer is to keep the SDF, not to bolt
special cases onto a 2.5D field.

---

## 13. What to keep / change / remove

### Keep unchanged

| File / symbol | Why |
|---|---|
| `src/world/caves/caveTopology.ts` | Representation-neutral contract. No second topology type. |
| `src/world/caves/caveSdfQuery.ts` — `pickInterval`, `applyCaveGroundHysteresis`, `occupancyIntervalAt`, `CAVE_FLOOR_GRACE`, `CAVE_UNDERGROUND_MISS`, `CAVE_OCCUPANCY_EPS`, `SURFACE_CLIP_EPS` | The ground contract both variants share. |
| `src/world/caves/caveSdfField.ts` — `smin` | Reused for the soft union. |
| `src/world/caves/caveRng.ts` | Owner of deterministic per-cave streams. |
| `src/world/caves/mouthCarve.ts`, `mouthOverburden.ts`, `terrainFootprint.ts` | Production entrance/overburden rules. |
| `src/debug/caves/caveHeightfieldTerrain.ts` + its test | Anchor and the two samplers. Do not re-invent. |
| `src/debug/caves/caveHeightfieldWalkWorld.ts` | The one-seam design is correct; only the heightfield side's internals change. |
| `src/debug/caves/caveHeightfieldPlayer.ts` | Walk controller, camera boom, slope wrapper. |
| `src/debug/createCaveHeightfieldTestScene.ts` — harness shell, `[1]/[2]/[3]`, metrics, overlay, SDF baseline path | Comparison infrastructure. |
| `src/debug/caves/caveHeightfieldTraversal.ts` — `heightfieldColumnIntervals`, `queryHeightfieldColumn`, `heightfieldOccupancyAt`, `heightfieldFloorAt`, `createDebugCaveGroundResolver`, `heightfieldRockCeilingMaxY`, `integrateDebugVertical` | Correct. Only their *input* representation changes. |

### Change

| File / symbol | Change |
|---|---|
| `src/debug/caves/caveHeightfieldRepresentation.ts` | Rewrite the field builder per §5–6. Corner sampling. Drop `inside`, `openSky`, `signedDistance` from the type. Keep `resampleSegmentStations` (add arc-length `s`). Keep the bilinear sampler shape, retarget it at `floorY`/`ceilY`. |
| `src/debug/caves/caveHeightfieldMesh.ts` | Replace `emitFloorOrCeiling` + `emitWalls` with the marching-squares welded mesher (§9). **Fix the winding** (§2.2). `flatShading: false`. Keep `FrontSide`. |
| `src/debug/caves/caveHeightfieldTraversal.ts` — `resolveHeightfieldHorizontal`, `queryHeightfieldSpace` | Push out of `gap = G_MIN` instead of the footprint; drop `blocked` and the `isMouthCorridor` pad (the mouth is open because the field says so, not because of a special case). |
| `src/debug/createCaveHeightfieldTestScene.ts` — `buildSurfaceMesh` | Add the `breaksSurface` quad cutout (§8.2) + optional `createLargeCaveVisual` framing. |
| `src/world/caves/spikeNoise.ts` | Add `createValueNoise2D(seed, cellSize)`. |
| `src/world/caves/caveRng.ts` — `CAVE_RNG_SALT` | Add `lobes`, `macro`, `floorDetail`, `ceilDetail`. |
| `src/debug/caves/caveHeightfieldFixtures.ts` | Optionally raise `basic`'s chamber `targetWidth`/`targetHeight` toward production scale (9–10 m / 9–11 m) so lobes are exercised at the real size. Entrance station gains the outward extension + `APERTURE_LIFT`. |

### Remove / replace

| Symbol | Reason |
|---|---|
| `extractHeightfieldBoundaryEdges`, `HeightfieldBoundaryEdge`, `emitWalls`, `isDoorwayOutwardEdge` | Boundary walls are the rejected mechanism. Deleted, not fixed. |
| `CaveHeightfieldRepresentation.inside` / `.openSky` / `.signedDistance` | Replaced by derived `gap` and `breaksSurface`. |
| `heightfieldCellIndex` / `heightfieldCellCenter` (cell-centre helpers) | Grid is node-based now. |
| Private `valueNoise2D` / `hash2` in `caveHeightfieldRepresentation.ts` | Moves to `spikeNoise.ts`. |
| `boundaryEdgeCount` / `insideCellCount` metrics | Replaced by `footprintArea (m²)`, `rimVertexCount`, `walkableWidth` (see §14). |

**Nothing in `src/world/caves/` production behaviour changes**, except two additive
helpers (`createValueNoise2D`, four `CAVE_RNG_SALT` entries) that no production call site
consumes yet.

---

## 14. Implementation plan for the next iteration

Deliberately one small, browser-judgeable step. Suggested plan id: **`world-terrain-019`**
(`docs/plans/PLANNING.md` "Next plan IDs" → `world-terrain: 019`).

### Stage 1 — field (pure, no Three.js)

**Files:** `src/debug/caves/caveHeightfieldRepresentation.ts`,
`src/world/caves/spikeNoise.ts`, `src/world/caves/caveRng.ts`

1. `createValueNoise2D` in `spikeNoise.ts`; delete the private copy.
2. Four new `CAVE_RNG_SALT` entries.
3. `closure(u, n)`, `crossSection(influence)`, influence assembly (segments → polyline
   nearest-point with arc-length `s`; chamber nodes → lobes), `smin`/soft-max fold,
   detail noise with rim attenuation, corridor-only clearance guard; apply topology
   `shelf` as local `floorY` elevation over the feature footprint, `overhang` as local
   `ceilingY` depression (§3).
4. New `CaveHeightfield` type; corner sampling; bilinear `sampleCaveHeightfieldAt`.

**Owns:** the two `Float32Array`s and nothing else. No scene, no Three.js, no state.

### Stage 2 — mesh

**File:** `src/debug/caves/caveHeightfieldMesh.ts`

1. Delete the boundary-wall path.
2. Marching-squares welded mesher over `gap`, shared interior + rim vertices.
3. Correct winding; `computeVertexNormals`; `flatShading: false`; keep `FrontSide`.
4. Skip ceiling triangles where `breaksSurface`.

### Stage 3 — traversal

**File:** `src/debug/caves/caveHeightfieldTraversal.ts`

1. `heightfieldColumnIntervals` reads `gap` instead of `inside`/`signedDistance`.
2. `resolveHeightfieldHorizontal` pushes out of `gap = G_MIN` along `∇gap`.
3. Drop `queryHeightfieldSpace.blocked` and `isMouthCorridor`.
4. `caveHeightfieldWalkWorld.createHeightfieldWalkWorld` rewires; its public shape is
   unchanged, so `caveHeightfieldPlayer.ts` needs **no change at all**.

### Stage 4 — entrance + terrain cutout

**Files:** `src/debug/createCaveHeightfieldTestScene.ts`,
`src/debug/caves/caveHeightfieldFixtures.ts`

1. Entrance station extends outward `ENTRANCE_OUTWARD` with `APERTURE_LIFT`.
2. `breaksSurface` quad cutout in `buildSurfaceMesh`, sharing the predicate with the
   cave mesher (export it from the representation module — one owner).
3. Optional `createLargeCaveVisual` framing behind a `&rocks=0/1` URL flag, default on,
   so acceptance can be checked with rocks hidden.

### Stage 5 — metrics + tests

**Metrics** (overlay + `console.table`, both variants, same fixture): existing six, plus
for the heightfield `cellSize`, `gridNodes`, `footprintArea (m²)`, `rimVertexCount`,
`walkableWidth` at the mid-passage station (width where floor rise ≤ 0.3 m — the direct
readout for "is `NF` right?"), `minGapInCore` (the clearance guard's worst case),
and `maxFloorSlopeDeg` along the centerline.

**Tests** (pure, `src/debug/caves/*.test.ts` — extend the existing files, do not add new
suites):

1. Determinism: same topology + config → byte-identical arrays.
2. Cross-section: `f(0) = A`, `c(0) = A + H`, `f(1) = c(1) = Yc`, `gap` monotonically
   decreasing in `u`, `gap(u>1) < 0`.
3. Flatness: floor rise ≤ 0.3 m for `u ≤ 0.8` at the default `NF`.
4. Clearance: `gap ≥ minClearance` for every column with `uMin ≤ U_CORE`, on all three
   fixtures; and `gap → 0` at the rim (proves the §2.4 defect is gone).
5. Mesh weld: every rim vertex index is referenced by both a floor and a ceiling
   triangle; no boundary edge is referenced by exactly one triangle (watertight).
6. Winding: every floor triangle normal has `ny > 0`, every ceiling triangle `ny < 0` —
   the regression test for §2.2.
7. Noise guardrails: `maxFloorSlopeDeg < SLOPE_MAX_WALKABLE_DEG` along every centerline;
   macro noise never drops `R` below `R_MIN`.
8. Chamber: lobe union footprint area > `0.8 ×` and < `1.3 ×` the nominal circle; the
   silhouette is not radially symmetric (radius variance above a threshold).
9. Tunnel→chamber: `gap` and `floorY` are C⁰-continuous along the centerline with no step
   > `STEP_DOWN_MAX`.
10. Entrance: `breaksSurface` is true over the aperture and false over every node of
    every fixture (proves the cutout does not delete the hillside).
11. Traversal (both variants, existing harness): the full `caveHeightfieldTraversal.test.ts`
    battery must still pass — no surface snap when stably inside, ground handed back on
    exit, boom never parks on the overburden, jump clamped by the rock ceiling.

**Technical verification:** `npx tsc --noEmit`, `pnpm run lint`, `pnpm run build`,
`pnpm run test`. Not a substitute for the browser.

### Dependencies and ownership

```text
Stage 1 (field)  ──►  Stage 2 (mesh)
       │                   │
       └──►  Stage 3 (traversal)  ──┐
                                    ├──►  Stage 4 (entrance)  ──►  Stage 5 (metrics/tests)
                          Stage 2 ──┘
```

State ownership is unchanged from the current spike: the representation owns two typed
arrays; `CaveWalkWorld` owns the ground-hysteresis memory; the walker owns pose. Nothing
else holds cave state.

**Not in scope:** `createCaves()`, `CaveSdfSpatialRepresentation`, cave streaming/worker
lifecycle, production collision ownership, `PlayerController`, persistence, world siting,
real terrain chunks, fauna/NPC navigation, multi-level design.

---

## 15. Acceptance criteria — what the Player checks in the browser

Open `?caveHeightfieldTest`. `[1]` toggles heightfield/SDF on the **same** topology and
surface, `[2]` Walk/Inspect, `[3]` fixture.

**Entrance**

1. The cave mouth is a **real opening** — terrain does not close over it from any approach angle.
2. Walking in from outside is continuous: no step, no fall, no pop; the cave floor meets
   the carved pit floor as one surface.
3. With rock framing disabled (`&rocks=0`), the mouth is still traversable and the hole is
   still real — rocks hide a seam, not a defect.

**Interior geometry**

4. The floor is **visible** and lit from above everywhere inside (the §2.2 regression).
5. The floor descends smoothly from the mouth; no terraces, no see-through slots.
6. The sides are **rounded** — the floor curves up into the wall and the ceiling curves
   down to meet it. **No vertical rectangles anywhere.**
7. The ceiling is organic and clearly **not** a mirrored copy of the floor.
8. The passage widens into the chamber **gradually**; there is no point where a narrow
   tunnel becomes a circular room.
9. The chamber is **irregular** — not a cylinder, not a wobbly circle; it has bays and an
   asymmetric long axis.
10. `bend` and `branch` fixtures show a convincing junction with no crease or seam.

**Traversal**

11. Gravity and ground-stick behave: no falling through the floor, no floating.
12. The player cannot walk up the rounded fringe into the rock; the slope stops them
    naturally rather than an invisible wall stopping them abruptly.
13. Head never clips the ceiling; jumping is clamped by rock, not by the sky.
14. **No terrain clipping overhead** — the hillside is never visible from inside except
    through the mouth.
15. **No surface snap / swim**: deep inside (12–14 m of hillside overhead), the player is
    never lifted onto the outdoor terrain, in any fixture, including directly under the
    steepest part of the hillside.
16. Exiting hands ground back to the surface cleanly.
17. Third-person camera stays inside in narrow passages, does not park on the
    overburden, and exits through the portal at the mouth.

**Comparison**

18. `[1]` flips between heightfield and SDF on **identical** topology, seed, terrain,
    lighting and camera — the only difference is representation.
19. Metrics for both variants are reported and legible: representation ms, mesh ms,
    total ms, vertices, triangles, geometry bytes; plus heightfield
    `footprintArea`, `rimVertexCount`, `walkableWidth`, `minGapInCore`, `maxFloorSlopeDeg`.
20. The Player can state whether the heightfield's visual quality is close enough to SDF
    to justify the measured cost difference.

---

## 16. Risks and open decisions

### Known limitations (accepted, not risks)

- No stacked/crossing/shaft/bridge geometry (§12). Architectural, by design.
- `overhang` may remain a ceiling deformation in 2.5D, not a full volumetric undercut (§3).
  Production SDF `shelf` boxes are not the design target for shelf semantics.
- Chamber lobe floor offsets are bounded by `STEP_DOWN_MAX`, so lobes cannot create a
  dramatic multi-level chamber floor.
- The 0.4 m grid bounds detail; sub-0.4 m rock texture must come from materials, not geometry.

### Technical risks

| Risk | Mitigation |
|---|---|
| Soft-union cross-talk between the branch and the trunk opens a phantom void. | `KAPPA = 3` extension makes it require >3 m of waist offset per metre of separation; `MIN_DISCONNECTED_CLEARANCE = 1.5` already guards the topology. Test 8/9 covers it; the `branch` fixture is the probe. |
| Marching-squares rim is noisy at cell resolution, giving a crinkled silhouette. | `gap` is smooth (superellipse + smin), so the zero contour is smooth; linear edge interpolation should suffice. If not: one Laplacian smoothing pass over rim vertices only, before any resolution increase. |
| Detail noise still pinches the corridor despite the guard. | The guard is applied after noise and raises the ceiling; test 4 asserts it on all fixtures. `minGapInCore` metric makes it visible. |
| `NF = 2.5` reads as a skate ramp (too round) or still as a box (too flat). | Single tuning knob, exposed in the harness; `walkableWidth` metric quantifies it; the Player decides. |
| Field build is slower than estimated because of the nearest-point loop over ~60 stations × 10k nodes. | Measure first. Bbox rejection / station grid are known cheap fixes (§11). Do not pre-optimise. |
| Heightfield `overhang` (ceiling dip) reads flatter than the SDF volumetric box; shelf should match intent better than the current floating SDF slab. | Acceptance item 20. If overhang quality is decisive, that is a legitimate reason to reject the heightfield or keep a small derived mesh for overhang only. |

### Decisions that genuinely need the User

1. **Overhang in 2.5D.** Shelf is already aligned with `floorY` plateaus (§3). For
   `overhang`, accept ceiling deformation, add a small derived mesh for that feature
   only, or defer overhang fidelity until a volumetric path returns? This affects how
   plan world-terrain-008 L1 reads in the heightfield harness.
2. **Lobe extent vs overburden.** Lobes can reach `1.25 × Rc`, past what
   `minSurfaceOverFootprint` currently checks (§7). Clamp lobes to `1.0 × Rc`
   (safer, slightly rounder chambers) or widen the topology's overburden check
   (more irregular chambers, touches production topology)?
3. **Chamber scale in the fixtures.** Raise `basic` toward production scale
   (9–10 m wide, 9–11 m tall) so the model is judged at the real size, accepting that
   the harness fixture then differs from the merged spike's? Recommended yes — a 6.4 m
   chamber does not exercise the lobes.
4. **Is 2.5D acceptable for Seedvale's near-term caves at all?** §12 is the honest list.
   If multi-level caves are wanted inside the next few milestones, the correct answer is
   to keep the SDF and stop here — this design cannot be extended to cover them.

---

## 17. Assessment of the two-heightmap concept

Asked for directly, answered directly.

**The concept is sound** and the recon supports it: production gameplay is already
one-floor-per-XZ, production topology is already XZ-separated, and the volumetric cost
buys presentation quality that two 2D fields can largely reproduce.

**Two parts of the stated intuition are wrong, and are corrected above:**

1. **"floor + ceiling + boundary walls"** (plan world-terrain-018 §4) is the root defect.
   Explicit wall geometry is what produces the rectangular section and the seams. The
   correct model has no walls at all: the wall is where `floorY` and `ceilingY` converge.
   This document rejects that plan section outright rather than repairing the code
   against it.

2. **`floorY(x,z) = surfaceY(x,z)` as a global base** (prompt §4) does not hold. Deep
   inside, the cave floor must follow the topology centerline — which production already
   terrain-adapts via `MAX_TRAVERSABLE_FLOOR_GRADE` and `FLOOR_RAMP_STATION_SPACING` —
   not the hillside 12–14 m overhead. A global surface copy would inherit hillside relief
   into the tunnel floor and make every query depend on the terrain sampler.
   The intuition is right **locally, at the mouth**: there the axis floor *is*
   `base − CAVE_MOUTH_DEPTH`, i.e. the carved surface, which is exactly why the
   surface→cave transition is continuous by construction (§8.1). Local truth, not a
   global base.

The mirrored-ceiling intuition (prompt §9) is likewise not implemented literally: the
ceiling gets its own exponent (`NC ≠ NF`), its own span (`(1−BETA)·H` vs `BETA·H`), and
its own noise seed and lattice size. It is asymmetric by construction.

---

## 18. Decision this document supports

Proceed to implement §14 in the harness. It is a bounded, ~one-session change that is
mostly *deleting* the boundary-wall path, and it produces the first geometry the Player
can actually judge. The representation decision itself stays where
`docs/design/caves/README.md` puts it: with the Player, in the browser, after that.
