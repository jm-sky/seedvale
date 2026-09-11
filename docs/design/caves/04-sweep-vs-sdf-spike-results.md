# Cave V2 Milestone A — Sweep vs SDF Spike Results

**Status:**

```text
Architecture spike implemented
Technical comparison complete
Manual browser comparison complete
Selected representation: SDF / local continuous volume
Milestone A closed
```

Plan: `docs/plans/world-terrain-008-underground-caves-v2.md`

---

## 1. Shared comparison

Both variants consumed the same representation-neutral `CaveTopology` and the same accepted cave entrance:

```text
entrance -> wide transition -> irregular descending passage -> widening/bend -> main chamber -> shelf|overhang
```

Compared implementations:

- **Generalized Sweep** — asymmetric profile sweep with independent wall/floor/ceiling shaping and multi-scale deformation.
- **Graph + local SDF** — continuous void field built from topology primitives, smooth union, genuine 3D subtraction features, extracted with Naive Surface Nets.

The comparison reused the same seed, entrance, mouth carve, framing rocks, lighting, camera, streaming lifecycle and gameplay proxy.

---

## 2. Technical results

Representative seed 42, ~24.5 m route length:

| | Sweep | SDF |
|---|---:|---:|
| topology build | 0.26 ms | 0.26 ms |
| representation build, median | 0.08 ms | 0.07 ms |
| mesh build / extraction, median | 1.25 ms | 112.6 ms |
| vertices | 841 | 3,974 |
| triangles | 1,660 | 7,948 |
| geometry bytes | ~40 KB | ~191 KB |
| peak temporary field memory | n/a | ~792 KB |

Branch stress test:

| | Sweep | SDF |
|---|---:|---:|
| vertices | 1,042 | 4,339 |
| triangles | 2,040 | 8,684 |

SDF therefore has a real production performance risk: roughly ~90× the spike mesh extraction time and ~4.8× the vertex count at `cellSize = 0.4 m`. This is carried into Milestone B performance work; it does not change the representation decision.

---

## 3. What the spike proved

### Sweep

Strengths:

- very cheap geometry generation;
- explicit floor/profile control;
- low triangle count.

Limitations observed:

- still structurally biased toward a swept corridor;
- branch stress test creates independent tube meshes and an unwelded junction seam;
- more machinery would be required for chambers/junctions/overhangs to stop behaving like generalized tubes.

### SDF

Strengths:

- continuous passage → chamber transitions;
- no representation-level seams at unions;
- natural junction path;
- topology `shelf`/`overhang` emitted as SDF solid-box field operations (Milestone A);
  **intended `shelf` semantics** are an elevated floor region adjacent in XZ (heightfield-compatible) —
  the floating box is an **implementation mismatch**, not design intent;
- `overhang` as a genuine 3D ceiling/wall field operation;
- much stronger future path to loops, nearby branches, stacked/multi-level layouts and irregular chambers.

Risks:

- dense grid extraction cost;
- smooth union is spatial, not topology-aware;
- nearby disconnected passages can accidentally merge;
- current field/detail implementation is still spike-quality and needs production separation/tuning.

### Accidental-union stress

At default `smoothK = 0.9`, disconnected clusters with surfaces separated by about 0.2 m still bridged; at ~1.0 m surface separation they remained separate in the spike test.

Production topology therefore needs a minimum-separation / influence constraint for topologically disconnected sections. Do not expect the mesher to infer graph connectivity.

---

## 4. Surface-integration fixes discovered during Milestone A

A deterministic repro (`seed=1922931019`, cave around `(-425.14, 153.05)`) exposed several independent integration bugs. The following fixes are now part of the Cave V2 baseline and must not be reverted:

- Surface Nets quad winding follows crossed-edge sign, preventing back-facing/black cave patches.
- SDF geometry is clipped against deterministic analytic surface height, leaving an open mouth rather than a closed dome above terrain.
- topology is checked against terrain footprint/overburden instead of only inheriting V1 acceptance blindly.
- `CaveVolume.contains()` was aligned with its floor/ceiling span semantics to stop player surface pop-out.
- pass-through topology waypoints no longer create flat floor discs that fight sloping tunnel floors.
- camera boom uses a cave-floor fallback so an off-footprint sample does not immediately resolve to the surface above.

Known residual from the spike: uniform whole-cave sinking can place too much descent in the first ~4 m on steep terrain. Production B1 replaces this with topology-aware/local terrain adaptation rather than tuning the spike sink.

---

## 5. Manual browser decision

The Player manually compared Sweep and SDF and judged **SDF clearly better visually**.

No synthetic numeric rubric is back-filled here; the decisive observation is qualitative and explicit:

- SDF reads substantially more like a cave;
- Sweep remains visibly closer to a generalized tunnel/sweep representation;
- SDF's spatial flexibility is worth carrying forward despite the measured extraction cost.

### Architecture decision

> **Selected: Graph + Local SDF / continuous volume.**

> **Rejected as production direction: Generalized Sweep.**

Sweep may remain briefly as a diagnostic regression reference during the first B1 migration, but it is not a second production cave mode and should be removed after the production SDF path is technically established.

---

## 6. Current runtime state after Milestone A

Commit `baa23db91ed2135b210713e978795888d81b4c41` changed runtime selection so every accepted underground cave uses Cave V2 topology + SDF by default.

Current transitional wiring still has Milestone-A semantics:

```text
V1 generateCaveDefinitions()
    ↓ accepted entrance / cave identity
buildSpikeTestTopology(...)
    ↓
SDF mesh + topologyToCaveDefinition compatibility proxy
```

This is not yet the final architecture. In particular:

- V1 layout acceptance is still upstream even though its layout is discarded;
- `buildSpikeTestTopology()` is hard-coded to the comparison topology;
- the SDF builder still mixes field construction and presentation meshing;
- the SDF builder hardcodes the Milestone-A node chain;
- gameplay/collision still use a derived V1-shaped compatibility proxy.

Those are exactly the B1/B2/B3 migration boundaries in the updated plan.

---

## 7. Open risks carried into Milestone B

- SDF mesh extraction/activation cost can cause main-thread hitching.
- current Naive Surface Nets may or may not be sufficient after production profiling.
- topology needs per-cave RNG, not one world-seed pattern repeated for every cave.
- production overburden needs local/route-aware adaptation instead of uniform sink.
- gameplay floor/ceiling queries remain effectively one-floor-per-XZ through the compatibility path.
- collision fidelity is still proxy-based and not equivalent to the render/SDF shape.
- camera ceiling/wall obstruction remains Milestone B work.
- entrance transition still needs production quality work separate from interior quality.

See `docs/plans/implementation-notes/world-terrain-008-underground-caves-v2-b1-recon.md` for the focused B1 code recon.
