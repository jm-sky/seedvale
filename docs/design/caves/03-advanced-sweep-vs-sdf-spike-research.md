# Advanced Sweep vs Graph + SDF / Volume — Spike Research

**Date:** 2026-09-04  
**Status:** `research`  
**Scope:** compare two cave-geometry representations and define a fair implementation spike.  
**Important:** no production cave architecture is selected here.

## Executive Summary

Research #2 narrows the problem to two viable families that can both sit below a shared cave topology:

```text
CaveTopology
     ↓
 ┌───────────────┐
 ↓               ↓
Advanced Sweep   Graph + SDF / Volume
 ↓               ↓
Mesh             Mesh
```

The repository confirms that Seedvale already has the right high-level separation: deterministic cave definition, cave-space queries, disposable presentation, streamed lifecycle, and collision independent from render mesh. The weak point is the current geometric representation. `caveMesh.ts` renders passages as fixed-radius half-pipes and chambers as circular cylinders/discs, which strongly biases the result toward the observed “connected pipes” appearance.

A second repository finding is equally important: the current `CaveVolume` is itself effectively 2.5D. It reduces cave space at a given `(x,z)` to one selected floor/ceiling interval. That is sufficient for current L1 but is not a complete representation of future upper/lower routes sharing the same horizontal footprint. This does not invalidate the graph, but the future gameplay-space representation must not be assumed to remain `x/z → one floor + one ceiling`.

### Main conclusion

**Advanced Sweep remains a real candidate**, but only if the spike tests a genuinely advanced version: irregular non-circular profiles, independently varying floor/ceiling/walls, multi-scale deformation, stable sweep frames, authored local widening, and explicit junction/chamber treatment. Merely perturbing radius or adding surface noise to a tube is not a meaningful competitor.

**Graph + SDF/Volume has a fundamental representational advantage** for junctions, chamber blending, shelves, overhangs, subtraction and genuinely continuous 3D space. Academic cave work supports exactly this architecture: a skeleton/network controls layout, while implicit primitives, blending and warping construct the conduit volume. However, SDF does **not** automatically solve “pipe look”: capsule-like passages joined with smooth union can still produce smooth connected tubes. The advantage only appears when the field is used as a compositional spatial representation rather than as a different way to draw capsules.

The next implementation spike should therefore build **one deterministic 25–30 m test cave from one shared topology**, then produce two disposable render outputs under identical visual conditions. It should measure generation cost, memory and mesh size, and score visual/gameplay criteria using a fixed rubric. It should not integrate fauna, loot, persistence, final collision or terrain restructuring.

### Current evidence status

- **FACT:** current Seedvale cave presentation is fixed-profile tunnel + circular chamber geometry.
- **FACT:** current cave layout/topology is already separated from rendering.
- **FACT:** implicit/SDF modeling supports composition through blending, Boolean operations and warping, and cave-specific research has used skeleton → SDF construction successfully.
- **FACT:** marching cubes extracts triangle surfaces from sampled scalar fields; Three.js exposes `BufferGeometry` and a MarchingCubes addon suitable for experiments.
- **HYPOTHESIS:** a sufficiently expressive Advanced Sweep may meet Seedvale’s L1 visual bar at materially lower complexity than a volume pipeline.
- **HYPOTHESIS:** SDF/Volume will score materially better on chamber transitions, junctions and non-tubular 3D features.
- **MUST MEASURE:** whether that quality advantage survives equivalent resolution/material/lighting and whether its CPU/memory cost is acceptable for a local 20–30 m cave.

## 1. Research Question

The decision question is:

> Can an Advanced Sweep representation reach Seedvale’s required cave quality without becoming a brittle collection of special cases, or does Graph + SDF/Continuous Volume provide a clearly better foundation for natural, spatial caves?

The purpose of this document is not to decide by theory alone. It defines a small experiment that makes the two approaches comparable under the same topology, seed, dimensions, rendering conditions and gameplay expectations.

The spike must answer four separate questions:

1. **Naturalness:** can the passage stop reading as a swept pipe?
2. **Spatial expressiveness:** can the representation create chambers, ledges, overhangs and vertical relationships without architectural dead ends?
3. **Gameplay control:** can topology, walkable route, clearance and floor continuity stay deterministic and controllable?
4. **Technical cost:** what are the actual CPU, memory, geometry and implementation costs in the current Three.js/WebGL2 stack?

A result is useful only if those dimensions are kept separate. A visually attractive result that sacrifices deterministic gameplay control is not a win; neither is a cheap representation whose geometry remains visibly artificial.

## 2. Seedvale Constraints

### Repository facts

The current cave flow is approximately:

```text
seed + accepted cave site
        ↓
generateCaveDefinitions()
        ↓
CaveDefinition
  nodes + tunnels + bounds + entrance
        ↓
 ┌─────────────────────┬──────────────────────┐
 ↓                     ↓                      ↓
CaveVolume             caveMesh.ts            caveColliders.ts
queries                 presentation           shared registry primitives
        ↓
createCaves.ts owns lifecycle + streaming
```

The existing ownership split is worth preserving during the spike:

- `CaveDefinition` is pure deterministic data.
- `createCaves.ts` owns world lifecycle and presentation activation.
- render mesh is disposable presentation.
- wall collision is not derived from render mesh/BVH.
- surface terrain remains a heightmap above the cave.

The current renderer uses:

```text
Tunnel:
flat floor strip + fixed half-pipe arch

Chamber:
flat disc + cylinder wall + flat ceiling disc
```

That geometry is useful as a baseline but not as the proposed Sweep candidate.

### Current cave-space limitation

`CaveVolume.sampleFloor(x,z)` currently selects one lowest matching floor, and `sampleCeiling(x,z)` follows the selected lowest-floor primitive. This means two vertically separated traversable spaces at the same `(x,z)` cannot both be represented as independent local intervals.

**FACT:** this limitation is independent of whether presentation becomes Sweep or SDF.

**Potential assumption to revisit:** Research #1’s statement that the current cave layout/volume can simply remain the full gameplay source of truth for future 3D topology is too strong if “current volume” means the existing single-interval `(x,z)` query model. The topology graph can remain; the future spatial query representation may need multiple vertical intervals or direct 3D volume queries.

### Product constraints

The spike must preserve these constraints:

- one local cave, approximately 20–30 m;
- Three.js + WebGL2 + TypeScript;
- existing heightmap surface remains unchanged except existing mouth treatment;
- deterministic output from seed/topology;
- no separate interior scene;
- no global voxel/SDF terrain engine;
- no render-mesh/BVH dependency for primary gameplay collision;
- local/disposable presentation compatible with `WorldBundle` lifecycle;
- worker use only if measurements justify it.

### Future architectural capability

The chosen representation must not make these require a rewrite:

- branches and loops;
- multiple entrances;
- several chambers;
- different passage elevations;
- ramps;
- shelves and ledges;
- upper and lower routes reaching the same chamber;
- nearby routes that must remain physically separate.

L1 need not implement all of these, but the spike must include at least one feature that exposes whether the representation is fundamentally 2.5D or genuinely volumetric.

## 3. Common Test Cave

The shared test cave should be deliberately small but adversarial. A simple straight entrance → tunnel → round room test would mostly compare shading quality and would not expose the important differences.

### Proposed topology

Approximate route length: **27 m**.

```text
Surface mouth
   ↓  4 m broad descending transition
A: asymmetric passage
   ↓  7 m, bends in X/Z and descends ~1.2 m
B: constriction + offset widening
   ↓  5 m
C: main chamber
   ├── D: short side branch, ~5 m
   └── E: elevated shelf on one side of chamber
```

In side/section logic:

```text
mouth
  \__ passage __ constriction ___ chamber floor
                               \
                                \___ short branch

                         ______ shelf / ledge
                        /
          chamber wall /
```

### Required geometric features

The topology/layout input should encode enough intent for both representations to attempt the same space:

- mouth position/orientation;
- main passage center path with a gentle bend;
- gradual descent;
- one deliberately asymmetric passage zone;
- one constriction followed by widening;
- one chamber whose center is offset from the incoming passage axis;
- one short branch entering the chamber at a non-opposite angle;
- one elevated shelf/ledge occupying part of the chamber wall;
- minimum player route/clearance corridor through the whole cave.

### Why this test is representative

It exposes every failure the current implementation has shown without becoming a dungeon generator:

| Failure mode | Where test exposes it |
|---|---|
| pipe-like cross-section | A → B passage |
| repeated radial distance | long passage samples |
| artificial widening | B → C transition |
| chamber seam | C entrance |
| branch junction | D → C |
| floor continuity | descent + chamber floor |
| irregular ceiling | passage + chamber |
| shelf/overhang support | E |
| vertical variation | shelf above chamber floor |
| camera/headroom | constriction + chamber |

The shelf is especially important. It is small enough to implement experimentally, but it is geometrically awkward for a pure swept corridor. It therefore reveals whether Sweep needs a second unrelated geometry mechanism while the SDF candidate can express it naturally as another local volume operation.

### Common constraints

Both outputs must use the same:

- world-space entrance;
- topology node positions;
- path control points;
- intended floor profile along the main route;
- minimum gameplay-clearance envelope;
- chamber approximate bounds;
- branch endpoint;
- shelf target location/height;
- deterministic seed;
- material;
- light rig;
- camera positions/FOV;
- screenshot viewpoints.

The geometry generators may interpret shape metadata differently, but they must not move the chamber, remove the shelf or give one candidate materially more generous dimensions.

## 4. Advanced Sweep

### 4.1 What counts as “Advanced Sweep”

The meaningful competitor is not:

```text
spline + radius(t) + circular cross-section + noise
```

It should instead be closer to a generalized swept volume:

```text
3D spine
  + stable local frame
  + authored profile keyframes
  + independently variable floor / ceiling / left / right shape
  + profile deformation at several scales
  + local passage events
  + explicit chamber/junction construction
```

Sweep-surface literature treats the surface as cross-sections moving along a trajectory under a sweeping rule, and later work extends this with non-uniform scaling and twisting. Rotation-minimizing/parallel-transport frames are relevant because ordinary Frenet frames can twist or become unstable around inflections.

### 4.2 Candidate passage representation

For each sampled spine position `t`, construct a local frame and a non-circular profile.

A useful conceptual profile is not one radius but independent shape controls:

```text
left width(t)
right width(t)
floor offset/profile(t, lateral)
ceiling height/profile(t, lateral)
wall bulge(t, side, height)
```

The ring need not be mathematically elliptical. It could be represented by 10–16 angular/lateral profile samples whose radial/vertical offsets are interpolated between sparse deterministic keyframes.

This enables:

- flat-ish or concave walkable floor;
- one wall farther away than the other;
- ceiling shifted away from centerline;
- keyhole/canyon-like sections instead of round tubes;
- local roof pockets;
- narrowing only at shoulder height while the floor stays wide;
- local floor bank/slope.

### 4.3 Techniques that genuinely reduce pipe look

#### Independent macro profile variation

**Expected high value.**

Width and ceiling height should change independently over several metres. Scaling the whole profile uniformly preserves its radial character; independent deformation changes the spatial silhouette.

#### Non-circular profile families

**Expected high value.**

Profiles should include asymmetric arch, keyhole-like, flattened-ceiling and canyon-like forms. Natural cave literature distinguishes substantially different passage cross-section types; a circular family alone is too narrow.

#### Profile keyframes with smooth interpolation

**Expected high value.**

Sparse deliberate changes over 2–6 m create coherent meso-scale shape. White/high-frequency noise applied independently per ring tends to look like a noisy manufactured tube.

#### Centerline perturbation

**Moderate value.**

It breaks straightness and creates better silhouette, but a curved circular tube remains a tube. It should complement profile variation, not substitute for it.

#### Independent floor and ceiling functions

**High value for gameplay and naturalness.**

A floor can remain traversable while the roof forms pockets/ridges. This is more useful than perturbing every vertex isotropically.

#### Asymmetric wall events

**High value.**

Local wall recesses/bulges that occur on only one side destroy bilateral tunnel regularity.

#### Multi-scale deterministic deformation

**Useful only after macro/meso shape is solved.**

Suggested conceptual scales:

- macro: 3–8 m profile evolution;
- meso: 0.7–2.5 m bulges/scallops;
- micro: sub-metre surface roughness.

Noise should be evaluated in stable cave/world coordinates and amplitude-limited so it cannot violate minimum route clearance.

### 4.4 Techniques that mostly create a “noisy tube”

These should not be allowed to inflate the Sweep candidate’s score:

- scalar `radius(t)` only;
- sinusoidal radius modulation;
- per-vertex random displacement along normals;
- high-frequency noise with an unchanged mean profile;
- bending the centerline while retaining the same circular profile;
- adding separate decorative rock meshes without changing the cave space.

They improve surface variation but do not solve the underlying radial regularity.

### 4.5 Chamber construction

This is where Sweep becomes architecturally less clean.

A chamber could be attempted in three ways:

1. rapidly enlarge the swept profile;
2. create a separate chamber surface and stitch it to passages;
3. create a short family of broad overlapping sweeps through the chamber.

Option 1 tends to produce an inflated tunnel unless the profile changes radically. Option 2 requires explicit seam/topology stitching. Option 3 begins to approximate an implicit-volume construction while retaining surface-level intersection problems.

For a fair spike, the Sweep candidate should use **explicit chamber rings/profile sections**, not a cylinder. The incoming passage should gradually lose its corridor identity over several metres, and the chamber should have at least one asymmetric wall/ceiling region.

### 4.6 Junction handling

This is the most important structural weakness of pure surface Sweep.

At a branch, separately swept meshes can:

- overlap with hidden internal faces;
- leave cracks;
- create z-fighting;
- require trimming;
- require special bridge topology;
- produce awkward normals.

A production-quality sweep system therefore needs a junction algorithm. For the spike, it is acceptable to implement **one explicit Y-like chamber/branch blend region** rather than a general graph junction solver, but the implementation complexity must be counted honestly.

If the Sweep implementation must quietly voxelize or implicitly blend only its junctions, that should be recorded as a hybrid, not credited as a pure Sweep win.

### 4.7 Shelf / ledge

A shelf is not naturally a swept corridor feature. Possible Sweep approaches are:

- encode it into chamber cross-section profiles over an angular sector;
- add an explicit chamber-local platform surface;
- add a secondary sweep around the chamber wall and stitch it.

The first option is the strongest test of Advanced Sweep. If a local chamber parameterization can represent a ledge without becoming unmanageable, Sweep remains viable. If it requires a parallel bespoke geometry system for every non-corridor formation, that is evidence against it.

### 4.8 Assessment

**FACT:** sweep surfaces can express much more than circular tubes; non-homogeneous profile scaling/twisting and stable moving frames are established modeling techniques.

**HYPOTHESIS:** Seedvale’s L1 quality bar may be reachable with a carefully designed generalized sweep because the cave is small and traversal-directed.

**HYPOTHESIS:** chamber/branch/shelf handling will dominate implementation complexity before the passage itself does.

**MUST MEASURE:** whether a strong Sweep still visibly preserves a centerline-derived “tunnel grammar” when viewed from inside the chamber and at junctions.

## 5. Graph + SDF / Continuous Volume

### 5.1 Representation

The graph controls desired traversal/topology, while geometry is expressed as a scalar field over a local cave bounding volume.

Conceptually:

```text
CaveTopology
   ↓
feature primitives
   ├── passage fields
   ├── chamber fields
   ├── branch fields
   ├── shelf/support fields
   └── subtractive/deformation fields
   ↓
composition tree / evaluator
   ↓
continuous inside/outside field
   ↓
local samples
   ↓
mesh extraction
```

Paris et al. explicitly use a cave-network skeleton followed by an SDF construction tree combining primitives, blending and warping. This is highly aligned with Seedvale’s desired graph-control + natural-volume split.

### 5.2 Passage primitives

The simplest passage primitive is distance to a segment/capsule with a radius. That alone is insufficient.

A stronger passage field can evaluate distance in an oriented local frame to an asymmetric profile or to a warped generalized cylinder. The field may be parameterized by nearby path position and deterministic profile controls.

Possible local components:

- swept capsule/ellipsoid;
- oriented rounded box-like region;
- profile distance function;
- warped distance-to-spine field;
- local bulge primitives;
- subtractive wall intrusions.

### 5.3 Chamber primitives

Chambers need not be spheres. They can be combinations of stretched ellipsoids, rounded boxes, locally warped fields and subtractive cuts.

Example conceptual expression:

```text
chamber = smoothUnion(
  stretchedEllipsoidA,
  offsetEllipsoidB,
  roofPocket
)

chamber = subtract(chamber, wallIntrusion)
```

This enables an offset center, irregular roof and non-radial silhouette while still producing one continuous inside region.

### 5.4 Union and smooth union

Ordinary union gives exact set connectivity but may create sharp CSG-style intersections depending on primitive shapes. Smooth union creates gradual blending.

**FACT:** implicit modeling systems are specifically strong at blending and Boolean composition; BlobTree-style work formalizes blending, warping, union/difference/intersection in one hierarchy.

**Important:** indiscriminate smooth union creates “melted blobs.” Blend radius must be feature-specific. Passage → chamber may need a broad blend, while a shelf edge or constriction may require a tighter transition.

### 5.5 Subtraction

Subtraction is one of the strongest representational differences versus a pure surface sweep.

It can create:

- wall recesses;
- roof pockets;
- undercuts;
- separation between nearby upper/lower routes;
- notches under shelves;
- pillars by carving around retained rock.

It should be used sparingly in the spike because the goal is comparison, not geological richness.

### 5.6 Warping and deformation

The useful model is to warp the field evaluation domain or primitive coordinates, not just perturb final mesh vertices.

This means meso-scale irregularity affects the actual cave volume and therefore can be queried consistently for mesh and, if desired later, collision/containment.

A deterministic low-frequency warp can change passage silhouette; higher-frequency noise can add scallops/roughness. Mark et al. similarly distort metaball influence with several noise layers and use world-space coordinates for consistent deformation.

### 5.7 Shelves and overhangs

A local volume representation handles these directly.

One conceptual construction:

```text
walkable chamber void
+ upper alcove void
- retained-rock slab below shelf
```

or define the cave void as a union that opens space above the shelf but not below it.

The important point is not the exact formula: the representation can distinguish empty space above and solid space beneath at the same horizontal location. That is a true volumetric capability.

### 5.8 Multi-level passages

Two nearby routes at different Y values can be represented by distinct passage fields. They remain separate if their field supports do not intersect; they merge only where intentionally blended.

This is a fundamental advantage over a gameplay representation that assumes one vertical interval for each `(x,z)`.

### 5.9 Does SDF actually solve “connected pipes”?

Not automatically.

If the SDF is:

```text
capsule(edge1)
smoothUnion capsule(edge2)
smoothUnion sphere(chamber)
```

then the result is still semantically a collection of rounded pipes and blobs, merely with cleaner joins.

SDF solves the representation problem only when the construction includes:

- non-circular/asymmetric passage fields;
- local warping;
- non-spherical chamber composition;
- controlled blend radii;
- local subtraction/retained-rock features;
- independent floor/ceiling shaping;
- feature-aware deformation.

So the correct claim is:

> SDF gives a more expressive algebra for continuous cave space; it does not provide natural cave shape by itself.

### 5.10 Assessment

**FACT:** SDF/implicit composition has a fundamental advantage for seam-free set combination, topology changes and volumetric local features.

**FACT:** cave-specific academic work demonstrates skeleton → implicit/SDF construction with blending and warping.

**HYPOTHESIS:** for Seedvale, the strongest visible advantage will be chamber/junction/shelf quality rather than ordinary passage quality.

**MUST MEASURE:** sampling resolution required before shelves, constrictions and ceiling detail remain stable enough for gameplay and visual use.

## 6. Shared Topology

The two approaches should not receive independently authored cave layouts. The common input should describe semantic cave intent rather than renderer-specific primitives.

### Shared conceptual data

Without fixing final TypeScript interfaces, the topology needs concepts like:

```text
Entrance
  position
  orientation
  minimum opening dimensions

Passage
  path/control points in full XYZ
  connectivity
  target width/height ranges
  floor profile / traversal slope
  minimum clearance

Chamber
  anchor / approximate extent
  connected passages
  target floor region
  ceiling range

Branch / Connection
  graph relation
  path

Shelf
  chamber-relative location
  target elevation
  approximate footprint
  minimum headroom above

Constraints
  overburden
  minimum route clearance
  keep-separate relations
```

The shared data should contain **intent**, not `tube.radius` or `sdfSmoothUnionK`.

### Derivation

```text
same CaveTopology
        ↓
 ┌────────────────────────────┐
 ↓                            ↓
SweepGeometryParams           SdfGeometryParams
(profile keyframes,           (primitives, blends,
frames, chamber sections)     warps, subtraction)
 ↓                            ↓
triangle buffers              sampled field
                              ↓
                         mesh extraction
```

### What should remain shared after the spike

Even if one geometry approach wins, these concepts should remain independent of rendering:

- cave identity;
- graph connectivity;
- world-space anchors;
- path elevations;
- intended walkable route;
- clearance constraints;
- overburden constraints;
- cave bounds;
- deterministic seed streams.

### Gameplay-space representation

The spike should **not** redesign final collision, but it should avoid assuming that `sampleFloor(x,z)` remains sufficient forever.

A future shared spatial API may need one of:

```text
queryVerticalIntervals(x,z) -> [floor, ceiling][]
```

or

```text
contains(x,y,z)
distance/clearance queries in full 3D
local walkable-surface queries
```

The implementation spike can keep current L1 movement unchanged, but its test topology should record where the shelf creates more than one meaningful vertical surface relation.

## 7. Naturalness Evaluation

Visual comparison must be structured enough that “looks better” is not the only evidence.

### 7.1 Pipe-look indicators

Score visible presence of:

- repeating or slowly scaled copy of one profile;
- bilateral left/right symmetry;
- walls remaining roughly equidistant from centerline;
- regular arch/ceiling silhouette;
- constant relationship between floor and ceiling;
- local noise that does not alter macro silhouette;
- chamber that looks like an inflated tunnel endpoint;
- branch that looks like another tube glued onto a tube.

### 7.2 Natural-cave indicators

Score presence of:

- substantial width changes over several metres;
- independent height changes;
- asymmetric walls;
- ceiling not centered over the traversal line;
- local bulges and constrictions;
- coherent macro/meso/micro irregularity;
- non-flat/non-uniform ceiling;
- floor variation that remains walkable;
- chamber silhouette clearly different from passage grammar;
- formation/ledge that changes spatial use, not only surface texture;
- transitions that widen or turn irregularly rather than radially inflating.

### 7.3 1–5 rubric

Use identical fixed camera positions and score each category independently.

| Score | Meaning |
|---:|---|
| 1 | strongly artificial; obvious primitive/sweep grammar dominates |
| 2 | some variation, but underlying tube/blob construction is immediately visible |
| 3 | acceptable game cave; occasional procedural regularity remains visible |
| 4 | convincing at normal gameplay distance; only inspection reveals generation grammar |
| 5 | strong natural spatial variation with no obvious repeated construction pattern in the test cave |

Categories:

- passage naturalness;
- pipe resistance;
- chamber naturalness;
- passage → chamber transition;
- branch junction;
- ceiling variation;
- wall asymmetry;
- floor believability;
- shelf/ledge integration;
- overall silhouette diversity.

### 7.4 Evaluation method

Capture the same views for both outputs:

1. entrance looking inward;
2. midway passage looking forward;
3. constriction looking into chamber;
4. chamber looking back toward passage;
5. chamber looking toward branch junction;
6. side view emphasizing shelf/overhang;
7. debug wireframe/top-down/section view.

Do not change lighting between candidates to hide geometry weaknesses.

## 8. 3D Topology Evaluation

The long-term question is not whether L1 includes a full multi-level cave. It is whether the representation can evolve there without being replaced.

### Different elevations

**Sweep:** straightforward for a spine in XYZ. Passage geometry can rise/fall naturally if the moving frame and floor profile are stable.

**SDF:** straightforward; passage primitives exist at arbitrary XYZ.

**Verdict:** no fundamental difference.

### Ramps

**Sweep:** natural along a sloped center path/floor profile.

**SDF:** natural using a sloped passage field or warped primitive.

**Verdict:** both strong.

### Shelves / platforms

**Sweep:** possible but chamber-local parameterization becomes more complex; likely needs explicit feature logic.

**SDF:** natural volumetric feature.

**Expected advantage:** SDF.

### Overhangs

**Sweep:** tunnel roof is inherently an overhang relative to a heightmap, but arbitrary chamber undercuts are awkward.

**SDF:** direct volumetric representation.

**Expected advantage:** SDF.

### Upper/lower routes crossing in X/Z

**Sweep presentation:** separate swept meshes can remain geometrically separate in Y.

**SDF:** separate fields can remain separate until intentionally joined.

**Gameplay cave-space:** current Seedvale `sampleFloor/sampleCeiling` model is insufficient for both approaches if routes overlap horizontally.

**Key result:** the graph can remain shared, but future gameplay spatial queries must become fully 3D/multi-interval regardless of renderer choice.

### Loops and multiple entrances

Topology graph handles these equally well. The geometry problem differs:

- Sweep needs coherent joins where loops reconnect.
- SDF unions naturally reconnect the empty-space volume if samples/resolution preserve the intended connection.

**Expected advantage:** SDF at reconnection points.

### Keep-separate routes

A subtle risk exists for SDF: nearby routes may accidentally merge if smooth-union support or deformation is too broad. Sweep surfaces do not merge unless explicitly connected.

Therefore shared topology should eventually support a **keep-separate/minimum-rock-thickness constraint**.

**MUST MEASURE later:** minimum separable wall thickness at candidate SDF sampling resolution.

## 9. Junctions and Transitions

### Passage → chamber

**Sweep:** requires profile expansion and a change of geometric grammar. A weak implementation looks like a trumpet/inflated tube. A strong implementation needs chamber-specific sections and careful topology.

**SDF:** passage and chamber fields can overlap and blend continuously. The main risk is a melted/blobby transition if blend radii are too large.

**Fundamental advantage:** SDF has the cleaner topological operation; Sweep can still achieve good visual results with more explicit authoring.

### Passage → passage

For a simple continuation both are straightforward.

For a sharp turn or profile change:

- Sweep needs stable frame interpolation and enough longitudinal samples.
- SDF needs enough field resolution to preserve the intended constriction/turn.

No fundamental winner for simple continuation.

### Passage → branch

**Sweep:** explicit junction construction/stitching problem.

**SDF:** union/blend naturally changes topology from one conduit to two.

**Fundamental advantage:** SDF.

### Branch → chamber

Same pattern as passage → chamber, but more connections increase Sweep’s special-case pressure.

### Upper/lower route → same chamber

**Sweep:** each route can be built separately, but merging two meshes into a chamber without internal/intersecting surfaces becomes increasingly complex.

**SDF:** both route fields can join the same chamber volume at different elevations by composition.

**Expected strong advantage:** SDF.

### Floor continuity

Neither representation gets gameplay floor quality for free.

- Sweep can explicitly own a smooth floor curve/profile and is therefore highly controllable.
- SDF can create a beautiful volume whose extracted lower surface contains bumps/gradients undesirable for movement.

For the spike, both should preserve the same intended **target traversal floor**. Surface roughness near the route should be clamped or masked so visual naturalness does not destroy walkability.

### Collision continuity

Do not infer this from seam-free visual geometry.

The spike should separately verify that the common route has:

- continuous target floor;
- no collision gaps at chamber/branch transitions;
- continuous ceiling clearance assumptions.

Production collision design remains out of scope.

## 10. Collision Implications

The current Seedvale rule should remain: render mesh is presentation, not the authoritative collision source.

### Advanced Sweep options

#### Analytical/profile queries

Because each passage derives from a spine and profile, it can expose:

- nearest spine sample;
- local frame;
- profile boundary;
- floor height;
- ceiling height;
- lateral clearance.

This is efficient and deterministic, but junctions/chambers again need separate logic.

#### Simplified collision primitives

Existing cave wall beads could be generalized from the shared topology/clearance envelope, independent of render rings.

This is easy for L1 but does not represent shelves/ceilings fully.

### SDF/Volume options

#### Direct SDF queries

A signed field can provide inside/outside and approximate boundary distance in full 3D. Gradient sampling can approximate boundary normal.

Advantages:

- same representation works at junctions and arbitrary elevations;
- ceiling/walls are not separate special cases.

Costs:

- field evaluation may traverse several primitives/noise functions;
- a sampled grid may need interpolation;
- exact walkable-floor resolution still requires a dedicated rule.

#### Sampled/simplified collision volume

A coarse cave-local field can derive collision independent from the higher-detail visual mesh.

#### Graph-based walkable route

Even with SDF, player movement can use the topology’s authored floor/clearance corridor rather than “stand on whichever extracted triangle is lowest.” This is likely a good Seedvale fit because gameplay control is more important than physical simulation of every rock bump.

### Movement

For both approaches, the spike should retain a **shared intended walkable corridor** and compare whether visual geometry violates it.

Measure/inspect:

- minimum side clearance along route;
- minimum ceiling clearance;
- maximum intended floor slope;
- whether chamber transition creates sudden floor change.

### Camera clearance

Current third-person camera can escape if geometry/collision do not provide enough enclosure. The geometry spike should therefore include a camera-clearance envelope larger than the player envelope.

This is not final camera collision implementation. It is a geometric acceptance constraint:

> at every main-route sample, the intended camera volume must fit inside the cave shape under ordinary third-person positioning.

### Steep surfaces

Visual wall/ceiling noise must not be treated as walkable ground. A future walkability layer should derive from authored route/floor semantics, not surface normal alone.

### Shelves

A shelf exposes the difference between “cave is one floor height” and “cave has multiple traversable surfaces.”

For the spike, it is enough to:

- render the shelf in both candidates;
- define its target walkable top surface in shared topology;
- record that current `sampleFloor(x,z)` cannot represent both lower chamber floor and elevated shelf at overlapping X/Z.

Do not rebuild movement around it yet.

## 11. Performance

No trustworthy production numbers can be given without implementation. The spike should produce them.

### 11.1 Advanced Sweep expected cost model

Main CPU work:

```text
sample spine
→ build stable frames
→ interpolate profile/deformation
→ emit rings
→ emit indices
→ normals
```

Complexity is roughly proportional to:

```text
longitudinal samples × profile samples
+ chamber/junction feature geometry
```

For one 20–30 m cave this is expected to be small, but that expectation must not be converted into a numeric claim before measurement.

Memory is primarily final vertex/index/normal buffers plus temporary profile arrays.

### 11.2 SDF/Volume expected cost model

Main CPU work:

```text
define local bounds
→ sample scalar field in 3D
→ evaluate primitives/blends/warps/noise
→ extract isosurface
→ normals
```

Cost is strongly tied to 3D sampling resolution.

For illustration only, a `30 × 18 × 12 m` local field would have approximately:

| Sample spacing | Approx. sample count | Float32 scalar field only |
|---:|---:|---:|
| 0.50 m | ~57k | ~0.23 MB |
| 0.35 m | ~156k | ~0.62 MB |
| 0.25 m | ~354k | ~1.4 MB |

These are approximate raw field sizes, not total memory. Temporary extraction data, positions, normals, indices and JS object overhead are additional.

The spike should probably test at least two field spacings rather than declaring one “the SDF result,” because quality/cost trade-off is the core question.

### 11.3 What to measure

Use `performance.now()` around isolated stages.

#### Sweep

- topology → profile parameter preparation;
- frame/profile sampling;
- vertex/index generation;
- normal generation;
- total generation.

#### SDF

- field setup;
- scalar sampling;
- mesh extraction;
- normal generation if separate;
- total generation.

#### Both

- vertex count;
- triangle count;
- position buffer bytes;
- normal buffer bytes;
- index buffer bytes;
- temporary peak/estimated working memory where practical;
- number of `THREE.Mesh` objects/draw calls;
- activation/regeneration time;
- disposal correctness.

### 11.4 Garbage generation

Avoid comparing an optimized typed-array SDF path to an intentionally naive object-heavy Sweep or vice versa.

For both candidates:

- prefer typed arrays or bounded numeric arrays;
- avoid per-sample `THREE.Vector3` allocation in inner loops where practical;
- record obvious temporary allocation patterns;
- force neither candidate into production-level optimization before visual viability is known.

### 11.5 Worker suitability

Both approaches are data-oriented and can potentially run in a worker.

SDF field sampling/extraction is the stronger worker candidate because it may be a larger CPU batch. Sweep generation may be cheap enough that a worker round-trip is unnecessary.

If worker testing is included, transfer raw `ArrayBuffer`s rather than cloning large typed-array payloads; browsers support transferable `ArrayBuffer` ownership across workers.

**MUST MEASURE:** main-thread generation time first. Do not add a worker solely because SDF sounds expensive.

### 11.6 Update cost

For static caves, both should have essentially no geometry update cost after activation. The important runtime costs are:

- initial generation/activation;
- GPU buffer memory;
- draw calls;
- normal rendering cost proportional to visible triangles/material.

Dynamic remeshing is outside current cave requirements.

## 12. Determinism and Streaming

### Determinism

Both representations can be deterministic if all randomness derives from stable feature/world coordinates and explicit seed streams.

Avoid:

- global `Math.random()`;
- generation-order dependent state;
- worker completion order affecting geometry;
- noise keyed to mutable local array indices.

### Stable topology

The shared `CaveTopology` should be generated once deterministically. Geometry candidates then derive from it.

This makes comparisons reproducible and lets the production decision preserve topology even if the geometry representation changes.

### Stable geometry

Sweep determinism is straightforward if profile keyframes/noise are seeded.

SDF determinism requires:

- fixed bounds/padding;
- fixed sample spacing;
- deterministic field evaluation;
- deterministic extraction traversal/order if exact buffer equality matters.

Visual identity can be deterministic even if vertex ordering changes, but tests should define which guarantee matters.

### Local generation

A local SDF does **not** require a global volumetric terrain engine.

The cave can own a bounded box around its topology:

```text
surface heightmap world
        +
rare CaveTopology
        ↓ when presentation needed
local cave bounds
        ↓
local field / extraction
        ↓
BufferGeometry
```

This matches Seedvale’s existing cave streaming concept: definitions can stay cheap/world-level while presentation is activated near the observer.

### Streaming

For L1, one mesh per active cave is preferable to inventing cave chunks.

Future larger caves may justify local cave tiles, but chunking introduces additional requirements:

- shared field samples at tile boundaries;
- deterministic padding;
- crack-free extraction;
- LOD transition handling if resolutions differ.

Do not include cave chunking in this spike.

### Regeneration after unload

Both candidates should be disposable and regenerable from topology + seed.

The spike should verify:

```text
generate → record metrics/hashable geometric summary
 dispose
regenerate → same summary
```

### Save/reload implications

No geometry needs to be persisted. Persist only future non-derivable cave state. Geometry/topology regeneration from seed remains compatible with Seedvale’s existing persistence philosophy.

## 13. Three.js / WebGL2 Practicality

### BufferGeometry

Both candidates should end as ordinary `THREE.BufferGeometry`/`THREE.Mesh` presentation. Three.js `BufferGeometry` stores positions, normals, indices and other attributes in GPU-oriented buffers, supports indexed geometry, `computeVertexNormals()`, and explicit disposal.

For the spike:

- one indexed geometry per cave candidate is preferred;
- one shared material for A/B comparison;
- compute or supply normals;
- call `dispose()` through existing scene disposal path;
- avoid multiple materials/groups because they create extra draw calls and confound comparison.

### Mesh extraction for SDF

Marching Cubes is the simplest fair extractor for the spike:

- well known;
- directly maps sampled scalar fields to triangles;
- Three.js includes a MarchingCubes addon/example.

The production implementation does not need to use the addon itself. A small dedicated extractor may be easier to benchmark and transfer from a worker.

Classic Marching Cubes has ambiguous cases; the Asymptotic Decider and later MC33 work address topological ambiguity. For this limited spike, the important requirement is that extraction not visibly crack or alter the intended test topology. If ambiguities appear in the test cave, record them rather than quietly changing the topology.

### Normals

Options:

- `BufferGeometry.computeVertexNormals()` for both candidates, ensuring comparable post-generation cost;
- for SDF, later derive normals from field gradients if quality benefits justify it.

The spike should initially use the same normal policy where practical so the visual comparison is about geometry, not a better shading pipeline on one side.

### Tangents

Tangents are unnecessary if the shared test material does not use tangent-space normal mapping. Do not add them to the spike unless the chosen material specifically requires them.

### UVs

UV authoring can bias the comparison and is not central to representation. Prefer:

- a plain rock material without UV-dependent detail, or
- the same triplanar/world-space material if an existing one can be reused cheaply.

Do not hide geometric smoothness with aggressive normal maps.

### LOD

No geometry LOD is required for the first 20–30 m spike. Record triangle counts and defer LOD until the winning representation is known.

### CPU vs GPU generation

WebGL2 does not provide the same general compute model as modern compute APIs. Although GPU cave research exists, Seedvale should not introduce a new GPGPU generation architecture for this spike.

Use CPU generation first. If SDF proves valuable but too expensive, worker offload is the next practical step before considering a rendering-stack change.

### Draw calls

Target:

```text
1 cave candidate = 1 mesh = 1 material = 1 draw call
```

Debug overlays/wireframes are excluded from production metric counts.

## 14. Proposed Spike

### 14.1 Goal

Produce two directly comparable cave meshes from one deterministic topology and collect enough evidence to choose the next architectural direction.

### 14.2 Scope

The spike should live behind a development/debug entry point or isolated experimental module and be easy to delete.

Do not replace current caves globally.

Possible shape:

```text
src/tools/caveSpike/
  commonTopology.ts
  advancedSweep.ts
  sdfVolume.ts
  marchingCubes.ts
  metrics.ts
  caveSpikeScene.ts
```

Exact paths are not a requirement; locality and removability are.

### 14.3 Input

One hard-coded but seed-deformed deterministic `CaveTopology` implementing the scenario from section 3.

It should be independent of the current world cave siting/generator so the comparison does not get polluted by placement/rejection work.

Use a fixed seed, for example:

```text
seed = 0xCAVE02
```

(or another valid numeric constant chosen in implementation).

### 14.4 Output A — Advanced Sweep

Minimum meaningful implementation:

- cubic/Catmull-Rom-like or equivalent sampled 3D center path;
- rotation-minimizing/parallel-transport-style stable frame;
- 12–16 profile samples around/through cross-section;
- at least 4 profile keyframes across main passage;
- independent width and ceiling variation;
- asymmetric left/right deformation;
- one constriction;
- multi-scale deterministic deformation with clearance mask;
- explicit non-cylindrical chamber sections;
- explicit branch connection treatment;
- integrated chamber shelf attempt.

Do **not** spend time on a generic arbitrary graph junction algorithm.

### 14.5 Output B — Graph + SDF/Volume

Minimum meaningful implementation:

- same topology/path anchors;
- cave-local scalar field bounds with padding;
- passage fields that are not only constant-radius capsules;
- one irregular/non-spherical chamber composition;
- controlled smooth union at passage/chamber and branch;
- at least one domain warp or low-frequency field deformation;
- one subtractive or retained-rock operation creating the shelf/undercut relationship;
- Marching Cubes extraction;
- at least two sampling spacings, e.g. coarse and quality candidate.

Avoid a large general SDF library. Implement only primitives/operators needed for the test.

### 14.6 Same visual conditions

Both meshes must use:

- identical material instance/config;
- identical light rig;
- identical scene fog/post-processing state;
- identical world transform;
- fixed screenshot cameras;
- optional wireframe/debug toggle applied equally.

### 14.7 Same gameplay constraints

A common validator should sample the intended route and record:

- visual cave contains the player clearance envelope conceptually;
- minimum route width;
- minimum ceiling height;
- floor deviation from target route;
- chamber usable floor area estimate;
- shelf target elevation/area present.

The spike need not use final collision; these are geometry checks.

### 14.8 Implementation order

1. Build/lock shared topology and debug lines.
2. Implement route/clearance sampling and common metrics harness.
3. Implement Advanced Sweep passage only.
4. Add Sweep chamber/branch/shelf.
5. Implement SDF primitive evaluator and field bounds.
6. Extract SDF mesh at coarse resolution.
7. Add asymmetric/warped fields and shelf operation.
8. Run SDF at quality resolution.
9. Capture identical screenshots and metrics.
10. Write a short spike result/decision document.

This order prevents spending heavily on SDF before the comparison harness exists and prevents judging Sweep before it includes its hardest features.

## 15. Metrics

### 15.1 Measurement table

Leave measured cells empty until the implementation spike.

| Metric | Sweep | SDF/Volume | Evidence type |
|---|---:|---:|---|
| Generation time |  |  | **MUST MEASURE** |
| Field/sample time | n/a |  | **MUST MEASURE** |
| Mesh extraction time | direct emission |  | **MUST MEASURE** |
| Normal generation time |  |  | **MUST MEASURE** |
| Peak/working memory estimate |  |  | **MUST MEASURE** |
| Final geometry buffer bytes |  |  | **MUST MEASURE** |
| Vertices |  |  | **MUST MEASURE** |
| Triangles |  |  | **MUST MEASURE** |
| Draw calls | target 1 | target 1 | expected / verify |
| Collision complexity |  |  | research + spike assessment |
| Naturalness |  |  | rubric 1–5 |
| Pipe resistance |  |  | rubric 1–5 |
| Chamber quality |  |  | rubric 1–5 |
| Junction quality |  |  | rubric 1–5 |
| Shelf/overhang quality |  |  | rubric 1–5 |
| Floor controllability |  |  | rubric + validator |
| 3D topology potential |  |  | research assessment |
| Streaming suitability |  |  | research + measured regen |
| Determinism |  |  | regenerate/hash/check |
| Implementation complexity |  |  | LOC/modules/special cases + qualitative |

### 15.2 Known from research

| Property | Sweep | SDF/Volume |
|---|---|---|
| topology can be graph-driven | yes | yes |
| arbitrary XYZ passages | yes | yes |
| ordinary corridor generation | strong | strong |
| union of intersecting spaces | surface/junction problem | native implicit operation |
| Boolean subtraction | not native to pure sweep | native modeling operation |
| arbitrary local overhang/undercut | possible but feature-specific | natural volumetric representation |
| local bounded generation | yes | yes |
| global voxel terrain required | no | no |

### 15.3 Expected but not established

- Sweep generation should be cheaper for equivalent visual detail.
- SDF should produce cleaner branch/chamber blending.
- SDF should need more temporary memory.
- Sweep should provide more direct control of the main walkable floor.
- SDF should scale conceptually better to upper/lower route merges.

All of these remain **HYPOTHESIS** until the spike.

### 15.4 Naturalness scoring sheet

| Category | Sweep 1–5 | SDF 1–5 | Notes |
|---|---:|---:|---|
| passage silhouette |  |  | |
| pipe resistance |  |  | |
| asymmetry |  |  | |
| ceiling variation |  |  | |
| chamber silhouette |  |  | |
| passage → chamber |  |  | |
| branch junction |  |  | |
| shelf integration |  |  | |
| multi-scale detail |  |  | |
| normal gameplay view |  |  | |

The evaluator should score geometry before seeing timing numbers if possible, reducing the temptation to rationalize a visually weaker result because it is faster.

## 16. Decision Criteria

The spike is only useful if “good enough” is defined before results exist.

### Sweep wins if

All of these are true:

1. average naturalness score is at least **3.5/5**;
2. pipe resistance is at least **4/5**;
3. chamber transition and branch junction are each at least **3/5**;
4. shelf can be represented without creating a separate general-purpose geometry subsystem;
5. no visible cracks/internal-surface artefacts occur in the test cave;
6. the common route/clearance validator passes;
7. implementation complexity remains substantially lower than SDF;
8. future multi-level passages remain possible without replacing topology and without requiring every chamber feature to become a bespoke mesh operation.

Sweep does not need to beat SDF visually if it clears the quality bar and is materially simpler/cheaper.

### SDF/Volume wins if

All of these are true:

1. naturalness or chamber/junction scores are **clearly higher** (practically: ~1 rubric point advantage in several important categories, not a marginal preference);
2. passage → chamber and branch joins are continuous without special surface stitching;
3. shelf/undercut is substantially simpler or more robust;
4. the common route/clearance validator passes;
5. quality resolution preserves intended topology/features;
6. generation/activation cost is acceptable for a rare local cave and does not create unacceptable main-thread hitches;
7. memory/triangle counts remain practical for streamed rare caves;
8. local generation remains self-contained and does not force global terrain changes.

### Neither is sufficient if

Any of these occurs:

- Sweep remains visibly tubular despite strong profile work;
- Sweep’s junction/chamber logic grows into a collection of bespoke topology stitchers;
- SDF needs impractically fine sampling to preserve gameplay clearances/features;
- SDF produces unstable topology/accidental merges at acceptable resolutions;
- both approaches cannot preserve a controlled walkable floor without undermining their geometric model;
- neither can represent the shelf/chamber test cleanly;
- performance of the only visually acceptable candidate is clearly outside Seedvale’s activation budget.

If neither wins, the next candidate should likely be a **hybrid**, for example:

```text
graph + authored walkable floor/clearance
      + implicit volume for walls/ceiling/junctions
```

rather than abandoning the graph.

## 17. Risks and Unknowns

### Sweep risks

- profile complexity may become difficult to reason about;
- stable frame implementation can still produce orientation artefacts if constraints are poor;
- chamber parameterization may become a second modeling system;
- junction stitching may dominate code complexity;
- surface-level noise may disguise but not eliminate tube grammar;
- arbitrary formations may require bespoke topology edits.

### SDF risks

- sampling resolution may erase thin shelves/rock separators;
- nearby routes may accidentally merge;
- smooth unions may produce melted/blobby geometry;
- coarse Marching Cubes may show grid imprint or topology ambiguity;
- temporary field/extraction memory may be higher than expected;
- field evaluation with many primitives/noise layers may become CPU-heavy;
- naïve noise can make floors unpleasant or violate clearance.

### Shared risks

- current gameplay floor/ceiling API is not future multi-level-ready;
- camera quality may fail even if the cave looks good in free camera;
- entrance integration with surface terrain remains a separate problem;
- material/lighting can strongly bias visual evaluation;
- one test cave cannot prove all future topology, only reveal architectural constraints.

### Potential assumption to revisit

Research #1 broadly described SDF as a route to one continuous volume. That remains correct, but **continuous does not necessarily mean desirable**. A too-smooth union can incorrectly merge routes or erase retained-rock features. Future SDF design needs explicit separation/thickness constraints, not only connectivity.

### Unknowns that only the spike can resolve

- What Sweep profile complexity is enough to remove pipe look?
- How much code is required for one clean branch/chamber junction?
- What SDF sample spacing preserves the shelf and constriction?
- How many triangles does the SDF result produce at acceptable quality?
- Is SDF generation cheap enough on representative desktop/browser hardware without a worker?
- Does SDF need gradient-derived normals to look good, changing the cost comparison?
- Can the Sweep chamber remain maintainable once the shelf is included?
- How much floor masking/deformation clamping is needed in each approach?

## 18. Recommendation for the Next Experiment

Build the comparison spike before changing `world-terrain-007`.

### Exact next implementation spike

1. Create one deterministic, renderer-independent test topology of ~27 m.
2. Add fixed camera viewpoints and one shared material/light setup.
3. Add a common route/clearance validator and timing/geometry metrics.
4. Implement a **strong Advanced Sweep**, not the current half-pipe with noise:
   - stable transport frame;
   - asymmetric profile keyframes;
   - independent floor/ceiling/walls;
   - meso + micro deformation;
   - chamber-specific sections;
   - one branch junction;
   - one shelf.
5. Implement a **minimal but real SDF/Volume candidate**:
   - asymmetric passage field;
   - composed chamber;
   - controlled smooth unions;
   - deterministic warp;
   - one subtraction/retained-rock operation for shelf;
   - Marching Cubes at two resolutions.
6. Record timing, memory estimates, vertices, triangles and regeneration determinism.
7. Capture identical screenshots and score the naturalness rubric.
8. Record implementation complexity/special cases.
9. Decide using the predeclared criteria in section 16.

### Direct answers to the final questions

1. **Is Advanced Sweep still a real candidate?**  
   **Yes.** The current implementation does not test its real potential. A generalized asymmetric sweep could plausibly meet L1 quality while staying cheaper and more controllable. Its viability depends mainly on chamber/junction/shelf complexity, not on whether a tunnel can be made irregular.

2. **Does Graph + SDF/Volume have a fundamental advantage?**  
   **Yes, representationally.** It has a fundamental advantage for continuous topology changes, Boolean/subtractive features, shelves/overhangs and multiple 3D spaces joining naturally. That is not yet proof that it is the best production choice, because quality resolution and technical cost remain unmeasured.

3. **What remains unresolved?**  
   The actual visual gap, Sweep special-case complexity, SDF resolution requirements, CPU/memory/triangle cost, floor-control effort and whether either candidate meets normal third-person camera clearance without compromising shape.

4. **What should the next implementation spike do?**  
   Build the single common test cave and both disposable geometry outputs exactly as specified above, under identical rendering and gameplay constraints, with no production integration.

5. **What results are sufficient for an architectural decision?**  
   A decision can be made when both candidates have: measured generation/memory/mesh costs, identical-view screenshots, completed rubric scores, route/clearance validation, deterministic regeneration, and an honest count/assessment of junction/chamber special-case complexity. If Sweep clears the quality threshold with materially lower complexity, choose Sweep. If SDF is clearly better at the hard spatial features while its local generation cost is acceptable, choose Graph + SDF/Volume. If neither clears the thresholds, test a hybrid rather than forcing a winner.

## Sources

- **Paris, A.; Guérin, E.; Peytavie, A.; Collon, P.; Galin, E. (2021), _Synthesizing Geologically Coherent Cave Networks_. Computer Graphics Forum 40(7), 277–287.**  
  https://doi.org/10.1111/cgf.14420  
  Cave-specific evidence for separating network skeleton generation from conduit geometry and representing conduits with an SDF construction tree using primitives, blending and warping.

- **Mark, B.; Berechet, T.; Mahlmann, T.; Togelius, J. (2015), _Procedural Generation of 3D Caves for Games on the GPU_. Foundations of Digital Games.**  
  https://lup.lub.lu.se/record/5464981  
  Cave-specific modular pipeline: structural points, noise-warped metaball carving into a 3D volume, then isosurface extraction. Useful evidence for multi-scale field deformation and keeping structure separate from carving.

- **Lorensen, W. E.; Cline, H. E. (1987), _Marching Cubes: A High Resolution 3D Surface Construction Algorithm_. SIGGRAPH.**  
  https://doi.org/10.1145/37402.37422  
  Original scalar-field isosurface extraction algorithm and gradient-based surface-normal basis.

- **Nielson, G. M.; Hamann, B. (1991), _The Asymptotic Decider: Resolving the Ambiguity in Marching Cubes_. IEEE Visualization.**  
  https://doi.org/10.1109/VISUAL.1991.175782  
  Documents and addresses ambiguous Marching Cubes configurations; relevant if the spike exposes topology ambiguity.

- **Chernyaev, E. V. (1995/1996), _Marching Cubes 33: Construction of Topologically Correct Isosurfaces_.**  
  Commonly cited MC33 work extending case handling for topological correctness; relevant as a possible later extractor refinement, not required for the first spike.

- **Ju, T.; Losasso, F.; Schaefer, S.; Warren, J. (2002), _Dual Contouring of Hermite Data_. SIGGRAPH.**  
  https://doi.org/10.1145/566570.566586  
  Alternative contouring family using Hermite data and octree simplification. Relevant if Marching Cubes quality/adaptivity becomes a blocker after the representation decision.

- **Wyvill, B.; Guy, A.; Galin, E. (1999), _Extending the CSG Tree. Warping, Blending and Boolean Operations in an Implicit Surface Modeling System_. Computer Graphics Forum 18(2), 149–158.**  
  https://doi.org/10.1111/1467-8659.00365  
  Strong technical basis for treating blending, warping and Boolean composition as a unified implicit modeling hierarchy.

- **Abdel-Malek, K.; Yang, J.; Blackmore, D. (2001), _On swept volume formulations: implicit surfaces_. Computer-Aided Design 33(1), 113–121.**  
  https://doi.org/10.1016/S0010-4485(00)00065-8  
  Background on implicit swept-volume formulations and the relationship between sweep representations and implicit solids.

- **Marhl, M.; Guid, N.; Oblonšek, Č.; Horvat, M. (1996), _Extensions of sweep surface constructions_. Computers & Graphics 20(6), 893–903.**  
  https://doi.org/10.1016/S0097-8493(96)00059-3  
  Evidence that sweep surfaces can support non-homogeneous scaling and twisting rather than only fixed circular profiles.

- **Hanson, A. J.; Ma, H. (1995/1999 course material), _Parallel Transport Approach to Curve Framing_.**  
  https://graphics.cs.cmu.edu/nsp/course/cs229/handouts/papers/course11.pdf  
  Motivation for minimal-turning/parallel-transport frames and the instability of Frenet framing near vanishing curvature, relevant to 3D sweep implementation.

- **Three.js documentation — `BufferGeometry`.**  
  https://threejs.org/docs/pages/BufferGeometry.html  
  Practical representation of vertex/index/normal buffers, normal computation and disposal for both spike outputs.

- **Three.js documentation — `MarchingCubes` addon.**  
  https://threejs.org/docs/pages/MarchingCubes.html  
  Confirms a directly available Three.js Marching Cubes implementation suitable for experimentation; not treated as a production architecture recommendation.

- **MDN — Using Web Workers / Transferable objects.**  
  https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers  
  https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects  
  Basis for worker-transfer recommendations if measured SDF generation warrants off-main-thread execution.
