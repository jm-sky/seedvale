# Cave V2 Milestone A — Sweep vs SDF Spike Results

**Status:**

```text
Architecture spike implemented
Technical comparison complete
Manual comparison required
Decision pending
```

> Do not continue into Milestone B until the player has manually compared both
> representations in the browser and the selected representation has been
> recorded in `docs/plans/world-terrain-008-underground-caves-v2.md`.

Plan: `docs/plans/world-terrain-008-underground-caves-v2.md`
Implementation notes: `docs/plans/implementation-notes/world-terrain-008-underground-caves-v2-implementation-notes.md`

---

## 1. What was built

Both variants consume the exact same `CaveTopology` (`src/world/caves/caveTopology.ts`,
built once by `buildSpikeTestTopology(seed, entrance)` in `src/world/caves/spikeTestCave.ts`)
for the same seed and the same already-accepted V1 entrance — same shape:

```text
entrance -> wide transition -> irregular descending passage -> widening/bend -> main chamber -> shelf|overhang
```

- **Sweep** (`src/world/caves/sweepCaveMesh.ts`): walks the topology centerline,
  builds one closed ring per sample (a noise-shaped floor strip sharing its two
  edge vertices with a noise-shaped arch), with independent floor/ceiling/wall
  noise streams, asymmetric left/right wall bulge, profile keyframes
  interpolated from node `targetWidth`/`targetHeight`, extra centerline
  perturbation on top of the topology's own irregular waypoints, and
  multi-scale surface detail gated by `?debugDisableSystems=caveDetail`.
- **SDF** (`src/world/caves/sdfCaveMesh.ts`): places ellipsoid "void" primitives
  along the same centerline, smooth-unions them (`smin`, `smoothK`), subtracts
  a solid box for the shelf/overhang feature, adds a coarse per-axis domain
  noise, and extracts the iso-surface with a from-scratch **Naive Surface
  Nets** mesher (this repository has no marching-cubes/dual-contouring
  implementation anywhere — the mesher is part of this spike's cost).

Both share: the real accepted entrance/mouth carve, the same seed, the same
material (`src/world/caves/caveSpikeMaterial.ts`, identical config to V1's
`caveMesh.ts`), the same framing rocks, the same lighting, the same camera,
the same streaming lifecycle, and the same walkable/collision proxy
(`src/world/caves/topologyAdapter.ts` → `createCaveVolume` +
`buildCaveWallColliders`, unchanged from V1). Representation is the only
variable.

### Repro

```text
?seed=42&caveSpike=sweep&debug=1
?seed=42&caveSpike=sdf&debug=1
?seed=42&caveSpike=sweep&debug=1&debugDisableSystems=caveDetail   (structural-only)
```

The console logs the chosen spike cave's `caveId` and entrance `(x, z)` once on
boot. Reach it in-world with the existing debug API (no teleport was added):

```js
seedvale.debug.worldLocations.list().filter(l => l.kind === 'cave')
seedvale.debug.teleportTo({ kind: 'village', position: { x, z }, distance: 0 })
```

---

## 1a. Manual-test-environment ergonomics patch (2026-09-05)

Manual comparison is still open, but SDF is the current visual candidate, so a
small patch improved manual-testing ergonomics before the architecture
decision gate. Scope: test-environment only — no topology/mesh/collision
changes, no Milestone B work.

- **Camera stays in the cave.** `PlayerController.syncCamera()` now checks
  whether the player's own origin is currently inside a cave (via the
  existing `CaveGroundQuery`) and, if so, wraps the boom's `sampleHeight`
  callback (`cameraBoom.ts`'s new `withCaveFloorFallback()`) so an
  out-of-footprint boom sample falls back to the origin's own known cave
  floor instead of the surface heightfield high above. Previously a boom
  sample landing outside the (narrow) cave's XZ footprint read the real
  surface, which could deny the boom against a phantom "wall" or lift/hold it
  near that surface height. Outside a cave this is the identity wrapper — no
  behaviour change. Ceiling occlusion and undersized cave-wall colliders
  remain unfixed (Milestone B, plan §22), as before.
- **Torch is brighter and reaches farther in caves.** `PlayerTorch` accepts an
  optional `isInCave` callback (wired in `createApp.ts` from the same
  `bundle.caves.contains(...)` query `caveGroundQuery` already uses). A pure
  `resolveTorchLight()` (`torchLightPresets.ts`) applies a ×1.6 intensity /
  ×2.2 distance multiplier to the player's own torch `PointLight` only, on
  top of the existing fuel-ratio scaling, in both `light()` and `update()` so
  it isn't overwritten a frame after ignite. Surface presets, fuel duration,
  flame visuals, village/standing torches and the point-light budget are all
  unchanged.
- **SDF spike material reads as slightly damp stone.** `createCaveSpikeMaterial()`
  (`caveSpikeMaterial.ts`) now takes a `'sweep' | 'sdf'` variant and lowers
  roughness to `0.7` (from `1`) for `sdf` only, for a subtle torch highlight
  that reads the SDF surface's irregularity better. `metalness` stays `0`.
  Sweep is unchanged (not the manual-comparison candidate; needs no polish).

None of this changes topology, either spike's geometry/mesh generation, the
walkable/collision proxy, or the manual-comparison rubric below — it only
makes the existing SDF candidate easier to evaluate in-browser.

---

## 2. Technical results

Both variants ran against the shared test topology (seed 42, a representative
accepted entrance, ~24.5 m route length by construction — within the plan's
20–30 m band).

| | Sweep | SDF |
|---|---|---|
| topology build (shared, once) | 0.26 ms | 0.26 ms |
| representation build (median of 9) | 0.08 ms | 0.07 ms |
| mesh build / extraction (median of 9) | 1.25 ms | 112.6 ms |
| vertices | 841 | 3 974 |
| triangles | 1 660 | 7 948 |
| geometry bytes (pos+index+normals) | ~40 KB | ~191 KB |
| peak temp bytes (grid, estimate) | n/a | ~792 KB (`nx·ny·nz·4`) |
| mesher | hand-written ring sweep (existing pattern) | hand-written Naive Surface Nets (new — nothing to reuse) |

With the junction stress branch enabled (short side tunnel off the
widening/bend node, `?includeBranch`-equivalent test config):

| | Sweep | SDF |
|---|---|---|
| vertices | 1 042 | 4 339 |
| triangles | 2 040 | 8 684 |

SDF's grid-based extraction costs roughly **90x** the mesh-build time and
**~4.8x** the vertex count of Sweep for the same cave, at the default
`cellSize = 0.4 m`. This is a direct, measured consequence of dense uniform
grid sampling vs. an arc-length-parameterised ring walk, not an
implementation accident — a coarser `cellSize` would reduce it at the cost of
surface fidelity (not re-tuned for this report; see Open Risks).

### Accidental-union stress test (plan §10)

Two spatially close but **topologically disconnected** void clusters (radius
1.5 m spheres), swept across separation distances at the default
`smoothK = 0.9`:

| gap between centers | surface separation | result |
|---|---|---|
| 1.8 m | -1.2 m (overlapping) | bridged (1 component) |
| 2.6 m | -0.4 m (overlapping) | bridged (1 component) |
| 3.2 m | 0.2 m | bridged (1 component) |
| 4.0 m | 1.0 m | **not** bridged (2 components) |
| 5.0 m | 2.0 m | not bridged (2 components) |

Confirms the plan's warning directly: the smooth union is purely spatial, not
graph-aware — clusters whose surfaces are within roughly a metre of each
other bridge into one connected mesh **regardless of whether the topology
ever asked them to connect**. In this test cave the main trunk and the branch
never come this close together, so no accidental bridge was observed on the
actual test cave — but the mechanism is real and must be a placement
constraint for any future multi-route topology, not something the mesher
alone can prevent.

### Structural-vs-detail (plan §11)

Both variants respected `?debugDisableSystems=caveDetail`: vertex/cell count
is unaffected (same ring/grid topology either way), only positions shift, and
`caveTopology.test.ts`/`sweepCaveMesh.test.ts`/`sdfCaveMesh.test.ts` assert the
resulting bounds stay within a small tolerance of the detail-enabled bounds —
i.e. structural geometry is stable independent of small-scale surface noise
for both variants.

### Junction quality (Sweep, branch stress test)

The branch is built as an independent swept tube starting at the same
widening/bend ring position but with its own profile/noise evaluation — the
two tubes are **not welded**; they are two separate ring-loops sharing only a
start position. This produces a visible seam at the junction by construction.
This is an honest limitation of this spike's tube-only topology, not
something the plan requires solving in Milestone A (proper local-authority
octagonal blending or T-junction ring merging is more machinery than a spike
warrants) — recorded here for the manual review and for Milestone B if Sweep
is selected and branches become part of the production topology.

### SDF is not just a rubber tube

The SDF field is not a single tube capsule: floor and ceiling shaping come
from the ellipsoid radii tracking the topology's own `targetWidth`/
`targetHeight` keyframes (so passage/chamber widening is expressed in the
underlying field, not only in surface noise), the shelf/overhang is a genuine
boolean subtraction (a real 3D feature the mesh could not represent as a
sweep cross-section without a discontinuity), and the branch — when present —
is a second primitive chain smooth-unioned into the same field, so its
junction is a true continuous surface rather than two separate tube-loops
(unlike Sweep's branch handling above). This is the SDF representation's
structural argument, independent of visual score.

---

## 3. Manual gameplay/visual observations

**Not filled in — requires the player to compare both variants in the
browser** (plan §15 gate). Use the rubric in plan §14 (naturalness, pipe-look
resistance, transitions, seams, wall asymmetry, floor/ceiling quality,
shelf/overhang quality, junction quality, gameplay controllability, camera
clearance, future 3D topology potential, implementation complexity).

Known, representation-independent caveat for the manual pass: the
third-person camera boom is broken in caves for a cause unrelated to either
representation (`resolveCameraBoom` resolves `sampleHeight` at the player's Y,
not the sample point's — see implementation notes "Camera Integration"). It
affects Sweep and SDF identically. Compare mainly in the main chamber (wider
footprint, boom survives better) and judge "camera clearance" as *what the
geometry would allow*, not as "does the boom behave" — see plan §22
(Milestone B work).

| Rubric item (1-5) | Sweep | SDF |
|---|---|---|
| Naturalness | _pending_ | _pending_ |
| Pipe-look resistance | _pending_ | _pending_ |
| Passage → chamber transition | _pending_ | _pending_ |
| Seam resistance | _pending_ | _pending_ |
| Wall asymmetry | _pending_ | _pending_ |
| Floor quality | _pending_ | _pending_ |
| Ceiling quality | _pending_ | _pending_ |
| Shelf/overhang quality | _pending_ | _pending_ |
| Junction quality | _pending_ | _pending_ |
| Gameplay controllability | _pending_ | _pending_ |
| Camera clearance (geometry-only) | _pending_ | _pending_ |
| Future 3D topology potential | _pending_ | _pending_ |
| Implementation complexity | _pending_ | _pending_ |

---

## 4. Architecture decision

**Not made.** Per plan §15, this requires the player's manual browser
comparison first. Fill in after that pass:

- Selected representation:
- Rejected variant and reasons:
- Whether `CaveVolume` becomes an L1 adapter, is generalised, or is replaced
  (plan §17):

---

## 5. Open risks

Carried over from the implementation notes' "Open Decisions After Spike",
plus what the spike itself surfaced:

- SDF's default `cellSize = 0.4 m` costs ~90x Sweep's mesh-build time for this
  cave. Not re-tuned here — a production decision, not a spike-blocking one,
  but real: a coarser cell size trades fidelity for that cost and was not
  explored.
- The accidental-union mechanism is real and spatial-only; any future
  multi-route topology with nearby-but-disconnected passages needs an
  explicit minimum-separation constraint at the topology/placement level, not
  just careful `smoothK` tuning.
- Sweep's branch handling in this spike does not weld the junction — a real
  seam, not a rendering bug. If Sweep is selected and branches become
  production topology, junction welding is unsolved Milestone-B work.
- SDF's domain-warp noise is a crude per-axis 1D sum, not true 3D noise — a
  deliberate simplification; the manual pass may read this as lower detail
  quality than Sweep's arc-length/angle-parameterised noise, which is a
  spike-implementation artifact, not necessarily representative of a
  production-tuned SDF noise field.
- Whether `CaveVolume` becomes an L1 adapter, is generalised, or is replaced
  (plan §17) — open.
- The minimal sufficient collision model for the chosen representation, still
  inside `ColliderRegistry` — open (Milestone A collision is the same
  approximate proxy for both variants and was explicitly not evaluated for
  quality, per plan).
- Whether the camera fix (plan §22) is cave-specific or a shared boom
  improvement — open, and unrelated to this decision.
- Whether the entrance/mouth carve gets a real sculpted ramp, and whether
  overburden validation moves to polyline sampling — open, unrelated to this
  decision (both variants inherit the same V1 mouth carve unchanged).
