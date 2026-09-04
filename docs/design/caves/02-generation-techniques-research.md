# Cave Generation Techniques Research

**Date:** 2026-09-04  
**Status:** `research`  
**Scope:** procedural generation and representation of 3D underground cave geometry for Seedvale.  
**Important:** research-only. No runtime cave implementation was changed as part of this document.

## Executive Summary

Seedvale's current cave system has already crossed the important boundary from a heightmap-only excavation to a separate underground volume, but its geometric representation is still based on analytic tube/chamber primitives. The repository confirms that `CaveDefinition` is a deterministic graph, `CaveVolume` is the gameplay-space representation, and `caveMesh.ts` is presentation derived from it. The current renderer uses a fixed-radius half-pipe for tunnels and circular primitives for chambers. That is structurally coherent but is strongly biased toward the exact "connected pipes" appearance observed in gameplay.

The external research strongly supports separating topology from geometry:

```text
topology / layout
        ↓
passages + chambers + constraints
        ↓
continuous 3D volume representation
        ↓
surface extraction / mesh
        ↓
rendering
```

Two cave-specific research papers are especially relevant. Mark et al. (2015) use a structural L-system followed by noise-perturbed metaball carving and isosurface extraction. Paris et al. (2021) compute a cave-network skeleton separately and then construct conduit geometry as an SDF tree using primitives, blending and warping. These approaches closely match the Seedvale requirement for a topology model that is independent of the render mesh.

Sources:  
- Mark et al., *Procedural Generation of 3D Caves for Games on the GPU*: https://lup.lub.lu.se/record/5464981  
- Paris et al., *Synthesizing Geologically Coherent Cave Networks*: https://doi.org/10.1111/cgf.14420

### Main findings

1. **Pure spline/tube geometry can make a real enclosed 3D cave**, but naturalness does not come automatically from sweeping a cross-section. A fixed circular profile creates a pipe even when the spine bends. A strong sweep needs variable, asymmetric profiles and multi-scale deformation.
2. **Voxels + Marching Cubes are the most straightforward general-purpose volumetric solution.** They naturally represent chambers, branches, loops, overhangs, shelves and different elevations. Their cost is coupled to 3D sampling resolution.
3. **Dual Contouring is a surface extractor, not a cave representation.** Its important advantages are feature preservation and adaptive/octree formulations. It is substantially more complex than Marching Cubes and may be unnecessary for a soft organic cave style.
4. **SDF/implicit surfaces are particularly promising as a cave geometry language.** Boolean union/difference, smooth blending, warping and noise can turn a topology skeleton into one continuous volume instead of multiple overlapping tube shells.
5. **Metaballs are best viewed as an implicit primitive, not the architecture.** They are excellent for smooth local blending, but pure metaball caves tend toward blobs and provide weaker direct control over floors, roofs and gameplay clearances.
6. **Hybrid approaches are stronger than isolated techniques.** The most relevant families are `graph → volume → mesh`, especially `graph → SDF → Marching Cubes` and, later if justified, `graph → SDF → adaptive contouring`.
7. **Seedvale does not need a whole-world volumetric terrain rewrite to use these ideas.** A bounded cave-local volume can coexist with the existing heightmap surface. A full voxel/SDF terrain engine remains a different architectural decision for L3.
8. **Seams have multiple causes.** Implicit unions can remove seams between primitive pieces, but chunk and LOD boundaries still need shared deterministic samples and, for differing resolutions, a transition strategy such as Transvoxel.
9. **Collision should stay separate from rendered mesh generation.** A high-quality cave mesh can be disposable presentation. Gameplay should use the cave-space representation or simplified collision derived from the same authoritative data.
10. **L1 is small enough that quality should dominate raw throughput.** A 20–30 m cave does not justify a global voxel engine, but it is large enough to expose the limitations of a fixed-radius tube.

No final technology is selected here. The next design/spike stage should compare at least a strong variable-sweep candidate against a local implicit/volumetric candidate using the same representative L1 topology and measured CPU, memory and geometry quality.

---

## Seedvale Constraints

### Repository facts

The current repository is authoritative. The relevant current implementation has:

- `CaveDefinition` as deterministic domain data containing `entrance`, `nodes`, `tunnels`, `bounds` and `variant`.
- `CaveVolume` providing `contains`, `sampleFloor`, `sampleCeiling` and approximate boundary distance.
- `caveMesh.ts` deriving one disposable Three.js mesh from the definition.
- `createCaves.ts` owning cave lifecycle, presentation streaming and shared collision registration.
- cave wall collision generated separately from the render mesh using analytic circle colliders.
- the surface remaining a chunked heightmap; the cave interior is not a second global terrain engine.
- a local mouth recess in the heightmap while the underground interior is procedural geometry.

The current `caveMesh.ts` is important evidence: tunnel geometry is a flat floor strip plus a half-pipe arch with fixed radius and ceiling height interpolated along a segment; chambers are circular floor/wall/ceiling primitives. This is a good minimal proof of the graph concept, but not an expressive enough geometric representation for natural caves.

Relevant files:

- `src/world/caveGenerator.ts`
- `src/world/caveVolume.ts`
- `src/world/caveMesh.ts`
- `src/world/caveColliders.ts`
- `src/world/createCaves.ts`
- `docs/design/caves/01-problem-and-requirements.md`
- `docs/plans/world-terrain-007-underground-caves.md`

### Hard product constraints

First target:

```text
L1
single cave
~20–30 m
entrance
  → passage
  → chamber / widened end
  → continuation or dead end
```

Future representation must not make this fundamentally impossible:

```text
L2+
multiple entrances
multiple passages
branches
loops
multiple chambers
cross-connections
different elevations
ramps
platforms / shelves
upper and lower routes
```

Other constraints:

- Three.js + WebGL2 + TypeScript.
- Existing heightmap remains the surface representation.
- No separate interior scene/portal architecture.
- Deterministic generation from seed and stable world coordinates.
- Cave world data must be independent of Three.js objects.
- Streaming must not require all cave meshes to remain active.
- Collision must not primarily depend on rendered mesh/BVH.
- Workers only when measured CPU cost justifies them.
- Player/camera is not the owner of cave world state.
- Several rare caves should remain feasible without converting all terrain to voxels.

### What the current implementation tells us

The graph abstraction is not the problem. The geometry below it is too primitive:

```text
segment + radius + ceiling height
            ↓
       half-pipe mesh

chamber + radius + floor/ceiling
            ↓
       cylinder mesh
```

This makes the following difficult without accumulating special cases:

- irregular cross-sections;
- asymmetric floor and ceiling;
- strong local protrusions;
- independent irregularity scales;
- natural chamber mouths;
- 3-way or larger junctions;
- shelves and ledges;
- upper/lower routes that pass near each other without merging;
- loops whose surfaces must form one coherent volume.

This is a **geometry representation limitation**, not evidence that the topology graph should be discarded.

---

# 1. Graph + Procedural Volume

## 1.1 Concept

This family separates topology from geometry:

```text
graph
  nodes = entrances / chambers / junctions
  edges = passages
        ↓
3D paths + cross-section parameters
        ↓
volume construction
        ↓
mesh
```

A graph is a compact description of where traversable space should exist and how spaces connect; it is not itself a surface.

Paris et al. explicitly compute a cave-network skeleton first and derive conduit geometry from it. Mark et al. similarly separate a structural L-system from a later carving stage. This is strong evidence that the topology/geometry split is useful for cave generation, not merely an abstract software-design preference.

Sources:  
- Paris et al. 2021: https://doi.org/10.1111/cgf.14420  
- Mark et al. 2015: https://lup.lub.lu.se/record/5464981  
- Liapis, *Constructive Generation Methods for Dungeons and Levels*: https://antoniosliapis.com/articles/pcgbook_dungeons.php

## 1.2 Geometry variants

### Swept polygon / generalized cylinder

A 2D cross-section is swept along a 3D spine. The profile can be elliptical, rounded, asymmetric or polygonal, and its dimensions can vary continuously along the path.

Conceptually:

```text
spine P(t)
width W(t)
height H(t)
floor offset F(t)
roof offset C(t)
profile deformation D(t, angle)
```

Generalized cylinders are a standard modeling concept: a contour is swept along a curve, with control over the contour and its sampling.

Source: Algorithmic Botany, *Generalized Cylinders*: https://algorithmicbotany.org/cpfg3.0-tutorial/cylinders.html

This is the natural evolution of Seedvale's current half-pipe approach, but it should be recognized as a **new geometry generator**, not a minor parameter tweak.

### Swept implicit volume

Instead of constructing only the surface, define a scalar distance-like function around the swept path/profile. Multiple passages can then be combined before extracting the surface.

This avoids having to make every passage intersection a special mesh-stitching case.

### Analytic implicit sweep

A field can be evaluated from distance to a path and its cross-section, then combined with other fields using implicit operations. Paris et al. use sweep primitives in an SDF construction tree, followed by blending and warping.

Source: Paris et al. 2021: https://doi.org/10.1111/cgf.14420

## 1.3 Naturalness

A simple sweep is not sufficient for natural cave geometry. Naturalness needs at least three scales:

```text
macro: route curvature / chamber placement / elevation
meso:  cross-section changes / wall bulges / shelves
micro: scallops / roughness / small protrusions
```

The cross-section should not merely scale uniformly. Width, roof height, floor shape and side-wall shape should be independently variable.

A circular profile with a scalar radius remains visually pipe-like even when the path is curved.

## 1.4 Topology

Graph generation is excellent for:

- branches;
- loops;
- multiple entrances;
- multiple chambers;
- deterministic route planning;
- controlled elevations;
- gameplay-aware topology.

The hard part is not the graph. It is converting several graph edges into a single coherent surface.

If closed tube meshes overlap directly, intersections can create internal surfaces, z-fighting, non-manifold regions or visible seams. An implicit union instead defines one connected inside region.

## 1.5 Multi-level topology

The graph can store full 3D positions:

```text
A (high) ───── B (high)
                 \
                  \ ramp
                   C (low)
```

The main sweep-specific issue is maintaining a stable local frame along a strongly curved 3D spine. A naive Frenet frame can twist or flip at degenerate/inflection points; a parallel-transport-like frame is more robust.

An implicit field can be less sensitive to this because spatial distance can be evaluated directly, although an oriented asymmetric cross-section still needs a stable frame.

## 1.6 Platforms and shelves

A sweep is naturally good at corridors but not at arbitrary large shelves inside chambers. Such features can be represented as additional local volumes/primitives:

```text
chamber
+ shelf
+ pillar
- notch
```

This is another reason a compositional volume model can outgrow a single "tube generator" more gracefully.

## 1.7 Assessment

**Strength:** excellent topology control, compact deterministic data and potentially very low runtime geometry cost.  
**Weakness:** pure mesh sweeping makes intersections, loops and chamber transitions progressively harder.  
**Key point:** graph+sweep and graph+implicit volume are different complexity profiles. The first solves merging at the surface level; the second solves it at the volume level.

---

# 2. Voxels + Marching Cubes

## 2.1 Basic model

A voxel cave stores scalar values on a 3D grid:

```text
(x,y,z) → density

inside  < 0
surface = 0
outside > 0
        ↓
Marching Cubes
        ↓
triangle mesh
```

Marching Cubes classifies the eight corners of each cube, chooses a case from the intersection table and interpolates surface positions along edges. The original algorithm also derives normals from the scalar-field gradient.

Source: Lorensen & Cline, *Marching Cubes* (SIGGRAPH 1987): https://doi.org/10.1145/37402.37422

Three.js has a `MarchingCubes` addon, confirming that the basic extraction technique is directly usable in the Three.js ecosystem, although the addon is not itself evidence for a complete Seedvale architecture.

Source: Three.js `MarchingCubes`: https://threejs.org/docs/pages/MarchingCubes.html

## 2.2 Why it fits caves

A volumetric grid can naturally represent:

- enclosed chambers;
- overhangs;
- arches;
- branches;
- loops;
- vertical passages;
- shelves;
- multiple floors;
- nearby upper/lower routes;
- arbitrary intersections.

No heightmap-specific workaround is required inside the cave volume.

## 2.3 Graph + voxel field

A strong local architecture is:

```text
graph
 ↓
passage/chamber primitives
 ↓
write density field
 ↓
noise/deformation
 ↓
Marching Cubes
```

Mark et al. use essentially this separation: structural points first, noise-perturbed metaball carving into a voxel volume second, isosurface extraction third.

Source: Mark et al. 2015 PDF: https://lucris.lub.lu.se/ws/files/6067634/5464988.pdf

## 2.4 Resolution problem

For a local `30 m × 20 m × 10 m` volume, a dense Float32 scalar field is approximately:

| Voxel spacing | Approx. scalar samples* | Float32 field only |
|---|---:|---:|
| 1.0 m | ~6,500 | ~26 KB |
| 0.5 m | ~51,000 | ~0.2 MB |
| 0.25 m | ~269,000 | ~1.1 MB |
| 0.125 m | ~2.1 M | ~8.5 MB |

`*`Approximate `(size / spacing + 1)` samples per axis. Actual bounds and padding change the count.

These are raw scalar storage estimates, not total runtime memory. Mesh buffers, normals, temporary buffers and neighbouring samples add cost.

Halving voxel size increases the number of 3D cells by approximately 8×, so CPU generation and extraction scale rapidly too.

## 2.5 Quality problem

Coarse resolution can cause:

- disappearing small formations;
- collapsed narrow passages;
- collapsed thin walls;
- grid-dependent silhouettes;
- visible voxel-scale structure.

Higher resolution increases CPU, memory, mesh size and streaming/rebuild cost.

The important consequence is that cave geometry must be designed around the chosen sampling scale; noise cannot recover detail that the grid never represents.

## 2.6 Marching Cubes artefacts

Classic Marching Cubes contains ambiguous configurations. Nielson & Hamann proposed the Asymptotic Decider to resolve this ambiguity.

Source: Nielson & Hamann, *The Asymptotic Decider*: https://escholarship.org/uc/item/17p025zk

Cave-specific risks include:

- loss of thin walls/passages below sampling scale;
- holes or unwanted topology changes from insufficient sampling;
- grid imprint at coarse resolution;
- excessive triangles on simple surfaces;
- cracks when independently generated chunks disagree at boundaries;
- LOD cracks when adjacent regions use different resolutions without transition geometry.

## 2.7 Chunking

A cave-local voxel field can be partitioned independently from the surface terrain chunks:

```text
CaveDefinition
    ↓
local bounds
    ↓
voxel tiles
    ↓
mesh tiles
```

For an L1 cave, one bounded field may be simpler and cheaper than introducing cave chunks. Chunking becomes useful only when a cave system becomes large enough to need partial generation or streaming.

Adjacent tiles must evaluate exactly the same field at shared boundaries. Tile-local randomization must be derived from world coordinates/features, not from generation order.

## 2.8 Dynamic/regenerated chunks

Voxel representations are naturally compatible with local edits:

```text
modify density
    ↓
find affected cells
    ↓
re-mesh affected region
```

This is useful for future digging/destruction, but that requirement is currently outside the cave design scope.

## 2.9 Assessment

**Strength:** simplest general-purpose representation for arbitrary 3D topology.  
**Weakness:** resolution/cost coupling and additional infrastructure for large-scale LOD.  
**Seedvale:** very plausible as a **local cave-only volume**, but not evidence for replacing the global heightmap.

---

# 3. Dual Contouring

## 3.1 Principle

Dual Contouring extracts an isosurface using Hermite data: surface intersections and normals. A quadratic error function (QEF) places a representative vertex in each active cell. The original work also develops an octree-based simplification method.

Source: Ju, Losasso, Schaefer & Warren, *Dual Contouring of Hermite Data* (SIGGRAPH 2002): https://doi.org/10.1145/566570.566586

## 3.2 Advantage over Marching Cubes

DC can preserve sharper features and more deliberate geometric transitions at comparable sampling density. That is useful for:

- shelves;
- ledges;
- sharper ceiling formations;
- planar-ish rock walls;
- stylized strata.

For an intentionally soft cave, however, feature preservation is not automatically a decisive advantage.

## 3.3 Adaptive octrees

An adaptive DC representation can spend resolution where the field changes quickly and use larger cells on simpler regions:

```text
smooth wall       → coarse
sharp formation   → fine
junction          → fine
```

This is potentially valuable for very large caves, but considerably more complex than uniform MC.

## 3.4 Seams and LOD

The original DC work explicitly addresses crack-free adaptive contouring and its octree formulation does not require the crack-patching strategy used by simpler adaptive methods.

Source: Ju et al. 2002: https://doi.org/10.1145/566570.566586

Dual Marching Cubes is another later approach combining adaptive polygonalization with feature preservation and crack-free construction.

Source: Schaefer & Warren, *Dual Marching Cubes*: https://doi.org/10.1111/j.1467-8659.2005.00843.x

## 3.5 Collision

DC does not define collision. It is only the surface extraction stage. Seedvale can therefore use DC while keeping `CaveVolume`/collision semantics independent of the mesh.

## 3.6 Assessment

**Strength:** adaptive geometry and sharp-feature preservation.  
**Weakness:** higher implementation complexity, QEF solving and adaptive-topology corner cases.  
**Seedvale:** interesting later if a simpler volumetric spike proves that adaptive resolution or sharp features are important; not yet justified as the first extractor.

---

# 4. SDF / Implicit Surfaces

## 4.1 Representation

A signed distance field conceptually provides:

```text
D(p) < 0 → inside
D(p) = 0 → surface
D(p) > 0 → outside
```

Distance fields have been studied as general representations supporting shape operations, collision and level-of-detail management.

Source: Frisken, Perry, Rockwood & Jones, *Adaptively Sampled Distance Fields* (SIGGRAPH 2000): https://doi.org/10.1145/344779.344899

## 4.2 Why SDF is attractive

SDF is a natural intermediate language:

```text
graph
 ↓
SDF primitives
 ↓
union / difference / blending
 ↓
noise / warping
 ↓
sample field
 ↓
mesh extraction
```

This directly attacks the connected-pipes problem. Two passages can be combined as one volumetric inside region before any mesh is created.

## 4.3 Boolean operations

For ordinary signed fields, the common constructive operations are conceptually:

```text
union(A,B)       = min(A,B)
intersection     = max(A,B)
difference A-B   = max(A,-B)
```

An implementation must distinguish an exact signed distance from a generic signed scalar field. Smooth/blended operators can alter distance properties even though the sign and zero surface remain useful.

Blender's SDF grid documentation describes union via minimum, difference via sign inversion plus maximum, and threshold-based isosurface extraction.

Sources:  
- Blender SDF Boolean: https://docs.blender.org/manual/en/5.3/modeling/geometry_nodes/volume/operations/sdf_grid_boolean.html  
- Blender Grid to Mesh: https://docs.blender.org/manual/en/5.2/modeling/geometry_nodes/volume/operations/grid_to_mesh.html

## 4.4 Smooth union and tunnel/chamber transitions

A hard union can leave a visible derivative discontinuity where primitives meet. A smooth union creates a transition region.

This is useful for:

```text
small passage → large passage
passage → chamber
branch → junction
shelf → wall
pillar → ceiling
```

However, smoothing everything equally produces inflated, blob-like geometry. The blend width should therefore be a controlled geometry parameter, not a universal "make it natural" knob.

Paris et al. combine blending and warping in their cave SDF construction tree, which is particularly relevant evidence for this approach.

Source: https://doi.org/10.1111/cgf.14420

## 4.5 Noise and warping

A useful procedural stack is:

```text
macro deformation → route/silhouette
meso deformation  → wall/roof/floor shape
micro deformation → scallops/roughness
```

Mark et al. use Simplex and Voronoi noise at several frequencies/amplitudes and curl-noise variation. They explicitly use this to avoid spherical metaball surfaces and to create both fine scalloping and larger rocky outlines.

Source: Mark et al. 2015, §3.2: https://lucris.lub.lu.se/ws/files/6067634/5464988.pdf

## 4.6 Graph-driven SDF

A strong conceptual model for Seedvale is:

```text
CaveGraph
  ├─ entrance
  ├─ passage
  ├─ chamber
  ├─ branch
  └─ loop
       ↓
CaveVolumeField
  ├─ passage sweeps
  ├─ chamber volumes
  ├─ smooth unions
  ├─ local formations
  ├─ subtractive features
  └─ deterministic deformation
       ↓
iso-surface
```

Topology remains explicit; geometry becomes continuous.

## 4.7 Closed and multi-level spaces

An SDF has no heightmap restriction. Separate fields can exist at different Y levels and merge only where their spatial volumes overlap.

This supports:

- upper and lower routes;
- ramps;
- vertical shafts;
- large chambers with multiple elevations;
- nearby passages separated by rock.

This is a strong match for L2+.

## 4.8 Collision

An SDF can provide useful queries for:

- inside/outside;
- boundary proximity;
- local surface location;
- clearance.

But a high-resolution render field should not automatically become the movement collision system. A sampled field can be too coarse near thin features, while evaluating a complex analytic tree for every movement query may be unnecessarily expensive.

A practical architecture can therefore use the field as the authoritative geometric source and derive a cheaper gameplay collision representation from it.

## 4.9 Assessment

**Strength:** excellent composition, natural blending and fit with graph → volume → mesh.  
**Weakness:** field evaluation can be expensive; smooth operations/noise need careful control; a mesh extractor is still required.  
**Seedvale:** one of the strongest candidates for the next technical spike.

---

# 5. Metaballs

## 5.1 Principle

Metaballs are implicit field contributions around points/primitives. Multiple contributions merge smoothly when their fields overlap.

For caves they can be treated as volumetric carving brushes rather than visible solid objects.

Mark et al. use exactly this idea: structural points drive warped metaballs through a voxel volume, creating tunnels and chambers before isosurface extraction.

Source: Mark et al. 2015: https://lup.lub.lu.se/record/5464981

## 5.2 Strengths

Metaballs are good at:

- chamber/tunnel blending;
- rounded junctions;
- local volume expansion;
- organic intersections;
- smooth unions.

## 5.3 Weaknesses

Pure metaball generation tends toward:

- blobs;
- overly round chambers;
- inflated junctions;
- overly smooth walls;
- weak control over floor/roof structure.

Mark et al. avoid the plain spherical look by warping the influence using several noise layers and controlling structural-point spacing. They also use overlapping fields to create more advanced topology.

Source: Mark et al. 2015 PDF, §3.2: https://lucris.lub.lu.se/ws/files/6067634/5464988.pdf

## 5.4 Assessment

**Strength:** excellent local implicit blending.  
**Weakness:** insufficient control as the sole generator.  
**Seedvale:** best considered one primitive inside a broader implicit/SDF system.

---

# 6. Hybrid Approaches

## 6.1 Graph → swept mesh

```text
graph
 ↓
3D spline passages/chambers
 ↓
variable profiles
 ↓
watertight mesh
```

Pros:

- low memory;
- low L1 CPU cost;
- explicit geometry control;
- easy integration with the existing graph concept.

Cons:

- junctions become difficult;
- loops require surface topology management;
- chamber transitions need special geometry;
- local formations need extra mesh logic;
- multi-level near-crossings become harder.

## 6.2 Graph → SDF → Marching Cubes

```text
graph
 ↓
passage/chamber implicit primitives
 ↓
boolean + smooth union
 ↓
macro/meso/micro deformation
 ↓
local sampled field
 ↓
Marching Cubes
```

Pros:

- strong topology/geometry separation;
- natural tunnel/chamber blending;
- branches and loops are volumetric unions;
- multiple elevations are natural;
- shelves/protrusions can be local primitives;
- no primitive-level surface stitching.

Cons:

- voxel sampling cost;
- resolution limits detail;
- mesh extraction required;
- large-cave LOD needs more infrastructure.

This is the clearest candidate for a serious Seedvale spike.

## 6.3 Graph → SDF → adaptive contouring

```text
graph
 ↓
implicit field
 ↓
adaptive representation
 ↓
Dual Contouring / related extractor
 ↓
mesh
```

Pros:

- potential polygon reduction;
- feature preservation;
- path toward adaptive LOD.

Cons:

- substantially higher implementation complexity;
- adaptive topology is harder to debug;
- not clearly needed for L1.

This should follow, not precede, a simpler volumetric spike unless evidence says otherwise.

## 6.4 Graph → coarse volume → local deformation → mesh

The field need only exist inside the cave's bounded volume. This avoids turning the entire world into a dense 3D grid.

```text
graph
 ↓
coarse volume
 ↓
local deformation
 ↓
local sampling
 ↓
mesh
```

This is particularly compatible with Seedvale's "rare cave landmark" product direction.

## 6.5 Direct mesh + implicit junction patches

A possible compromise is direct swept geometry for long passages and small implicit patches for difficult junctions/chambers.

Potential benefit: lower field cost.  
Potential problem: two geometry representations create two classes of edge cases and may ultimately be harder to maintain than one coherent volume representation.

No evidence currently establishes that the added complexity is worthwhile.

## 6.6 Graph/shape grammar + volume

Graph grammars can encode high-level layout and gameplay constraints before geometry is generated. Procedural-level research demonstrates that gameplay-oriented constraints can be represented at the graph level and then mapped into concrete layouts.

Source: Linden, Lopes & Bidarra, *Designing Procedurally Generated Levels*: https://ojs.aaai.org/index.php/AIIDE/article/view/12592

This is relevant to L2+ but should not become a full dungeon-generation framework during the first cave rebuild.

---

# 7. Natural Cave Geometry

A correct volume can still look artificial. The main anti-pipe requirements are geometry requirements, not merely noise settings.

## 7.1 What creates a pipe appearance

Typical causes:

- constant radius;
- circular cross-section;
- constant roof height;
- parallel walls;
- correlated/same-frequency noise everywhere;
- repeated cross-sections;
- chamber represented as a scaled copy of the tunnel;
- visible junction boundaries.

Changing only the path spline does not solve these.

## 7.2 Irregular cross-section

Treat the cross-section as a shape, not a scalar radius:

```text
left wall
right wall
floor width
floor height
roof height
roof asymmetry
side bulges
```

Width and roof height should be able to vary independently.

## 7.3 Continuous variation

Random per-ring changes create visible segmentation. Parameters should vary smoothly along the path, using low-frequency deterministic functions.

```text
W(t) = baseWidth + lowNoise(t) * widthAmplitude
H(t) = baseHeight + lowNoise2(t) * heightAmplitude
```

Separate channels should control width, roof and floor rather than one noise value driving all dimensions.

## 7.4 Multi-scale irregularity

A useful starting hierarchy is:

| Scale | Role | Example |
|---|---|---|
| Macro | 5–20 m | route curvature, chamber silhouette |
| Meso | 1–4 m | wall bulges, roof shelves, floor undulation |
| Micro | 0.1–0.7 m | scallops, small bumps, roughness |

These are **design starting ranges**, not measurements of natural cave geology.

The existing Seedvale plan's approximate `0.5 m` micro features and `~2 m` larger protrusions fit this hierarchy, but browser validation should determine the actual useful ranges.

## 7.5 Tunnel → chamber

Avoid:

```text
tube ends
  ↓
cylinder starts
```

A convincing transition changes several properties over a finite distance:

- width increases;
- roof rises;
- floor broadens;
- walls become less constrained;
- irregularity amplitude can increase;
- formations become more likely.

Implicit blending is particularly natural here; a carefully designed swept transition can also work.

## 7.6 Chamber → tunnel

The tunnel mouth need not be centred in the chamber or perfectly circular. An asymmetric transition is often more believable and reduces the visual signature of a generated cylinder attached to a generated tube.

## 7.7 Floor, walls and ceiling

Gameplay does not require equal roughness everywhere.

A useful separation is:

```text
floor   → readable traversal surface
walls   → medium irregularity
ceiling → stronger silhouette variation
```

This should be part of the generated geometry/volume rather than only a shader displacement, otherwise visible and gameplay geometry can disagree.

## 7.8 Local formations

Useful formations include:

- pillars;
- shelves;
- overhangs;
- roof teeth;
- wall protrusions;
- depressions;
- alcoves.

These are better as controlled local primitives/deformation fields than as uniform global noise.

## 7.9 Seam taxonomy

There are three distinct seam classes:

1. **Primitive seam** — independently generated tunnel/chamber surfaces.
2. **Chunk seam** — neighbouring geometry tiles disagree at a boundary.
3. **LOD seam** — neighbouring tiles have different resolution.

A single implicit volume can eliminate the first. It does not automatically eliminate the other two.

For multiresolution voxel terrain, Transvoxel uses transition cells between full- and half-resolution regions specifically to eliminate cracks and holes at resolution boundaries.

Source: Eric Lengyel, *The Transvoxel Algorithm*: https://transvoxel.org/

## 7.10 Naturalness versus controllability

Mark et al. deliberately discuss believability and expressivity as priorities while still constraining the generator to a believable range. This is useful for Seedvale because cave geometry needs both hard gameplay guarantees and bounded procedural freedom.

Source: Mark et al. 2015: https://lucris.lub.lu.se/ws/files/6067634/5464988.pdf

Hard constraints should include:

- minimum clearance;
- minimum roof thickness;
- connectivity;
- reachable target chamber;
- no accidental surface breakthrough;
- acceptable traversal slope.

Soft variation can include:

- wall roughness;
- chamber asymmetry;
- exact protrusion placement;
- route curvature;
- local roof height.

---

# 8. Topology Capabilities

| Capability | Graph + sweep | Voxels + MC | Dual Contouring | SDF / implicit | Metaballs alone |
|---|---|---|---|---|---|
| Closed 3D space | High | High | High | High | High |
| Branching | High | High | High | High | Medium–High |
| Loops | High | High | High | High | Medium |
| Multiple entrances | High | High | High | High | Medium |
| Multi-level routes | High | High | High | High | Medium |
| Ramps | High | High | High | High | Medium |
| Platforms/shelves | Medium | High | High | High | Low–Medium |
| Complex junctions | Medium | High | High | High | Medium–High |
| Natural tunnel/chamber blend | Medium | High | High | High | High |
| Direct topology control | High | Medium | Medium | High when graph-driven | Low–Medium |
| Local geometric authoring | High | High | High | High | Medium |

Topology and surface extraction should therefore remain separate design decisions. A graph can feed a sweep, voxel field or implicit field.

---

# 9. Performance Considerations

## 9.1 Cost categories

```text
layout generation
+ field generation
+ surface extraction
+ BufferGeometry construction
+ GPU upload
+ draw calls
+ collision data
```

## 9.2 Direct sweep

CPU is usually lowest for L1 because work is proportional to path/profile samples. GPU cost is controlled directly through polygon count. Memory is low.

Pure vertex/index generation is also an easy worker candidate, but L1 may be too small for worker overhead to matter.

## 9.3 Voxel + MC

CPU cost includes field evaluation and cell extraction. Halving voxel size increases 3D cell count by roughly 8×.

GPU rendering cost depends on the final mesh, not directly on the number of voxels.

Memory includes scalar field plus mesh and temporary buffers.

Field evaluation and extraction are excellent worker candidates because they are pure data operations.

## 9.4 SDF

Two implementation strategies exist:

**Analytic:** evaluate the SDF function directly at samples.  
Pros: compact, deterministic, no persistent dense field.  
Cons: complex trees/noise can be expensive per sample.

**Sampled:** evaluate once into a local grid, then extract.  
Pros: simple MC/DC input, repeated queries are cheap, easy caching.  
Cons: inherits voxel resolution/memory trade-offs.

For Seedvale, a sampled local field is likely more practical than runtime ray-marching the cave as a shader scene, but this is a design hypothesis to validate in the spike.

## 9.5 GPU versus CPU

For rare 20–30 m caves, generation/activation latency is likely more important than raw draw cost. A small final mesh can be inexpensive to render while still taking noticeable CPU time to generate.

This matches Seedvale's existing performance architecture: workers should handle CPU-heavy serializable calculations when measured cost justifies communication, while Three.js object creation remains on the main thread.

Repository reference: `docs/architecture/performance-and-workers.md`.

## 9.6 LOD

L1 does not automatically need cave LOD.

LOD becomes relevant when:

- caves reach hundreds of metres;
- multiple cave systems are active/visible;
- long underground routes are streamed over large areas.

Voxel LOD is harder than heightmap LOD because arbitrary 3D topology makes boundary mismatches more complex. Transvoxel is a dedicated solution for this class of problem.

Source: https://transvoxel.org/

## 9.7 What the spike should measure

Do not infer Seedvale performance from algorithm names. Measure:

```text
field generation ms
mesh extraction ms
BufferGeometry construction ms
peak temporary memory
vertex count
triangle count
GPU upload time if measurable
activation hitch
rebuild hitch
```

Use at least:

- compact L1;
- large chamber;
- 3-way junction;
- loop;
- multi-level crossing.

---

# 10. Collision Considerations

## 10.1 General rule

The render mesh should not be authoritative gameplay state.

This already matches the current Seedvale cave split: `CaveVolume` owns floor/ceiling/containment semantics, `caveMesh.ts` is presentation, and `caveColliders.ts` builds separate wall colliders.

## 10.2 Sweep collision

An analytic graph/sweep can expose:

- nearest passage;
- local profile coordinates;
- floor;
- ceiling;
- wall clearance.

This is cheap for simple topologies. At junctions, however, collision must represent the union of all valid walkable volumes rather than choosing an arbitrary nearest edge.

## 10.3 Voxel/SDF collision

A field can provide inside/outside and approximate clearance, but querying a high-resolution render field for every movement step may be wasteful.

A better conceptual split is:

```text
high-quality volume
    → visual mesh

simplified collision representation
    → movement
```

Both should derive from the same authoritative cave data.

## 10.4 Floor queries

"Floor" is not the same as "nearest surface" once a cave has shelves and multiple levels.

A robust query should consider the actor's current Y and movement direction so that an upper route does not accidentally select a lower floor.

## 10.5 Camera clearance

Camera clearance is a property of cave space and camera policy, not a special property of MC, DC or SDF.

The representation should make it possible to query free space along the camera boom without raycasting a large render mesh every frame. An analytic or SDF-derived distance query may help, but this must be validated against Seedvale's existing camera behaviour.

---

# 11. Determinism and Streaming

## 11.1 Seed hierarchy

Use stable random inputs:

```text
world seed
 + caveId / world coordinate
 + feature id
 + noise channel
```

Generation order should not change geometry.

The current `caveGenerator.ts` already follows this principle with a cave-local deterministic random stream derived from seed and site coordinates.

## 11.2 Streaming

A local volume fits the existing lifecycle:

```text
CaveDefinition exists as data
        ↓
player near cave
        ↓
generate/activate presentation
        ↓
mesh + collision active
        ↓
player leaves
        ↓
dispose presentation
```

No per-frame field generation is necessary.

## 11.3 Regeneration versus cache

For rare deterministic caves:

1. regenerate when activated;
2. optionally cache generated geometry data;
3. do not persist generated mesh/field unless a future requirement proves it necessary.

Gameplay state should be persisted; deterministic geometry should be reproducible.

Caching is a performance optimization to add only if activation measurements justify it.

## 11.4 Chunk boundaries

Interior geometry should be a deterministic function of cave/world coordinates and should not depend on whichever surface chunk happens to be loaded.

Surface integration at the entrance remains a separate concern.

## 11.5 Worker model

Natural boundary:

```text
main thread
  CaveDefinition/request
        ↓
worker
  field generation
  mesh extraction
  typed arrays
        ↓ transferable buffers
main thread
  BufferGeometry
  Mesh
  scene attach
```

This fits Seedvale's existing worker architecture. It should be introduced only after measured CPU cost shows that the work is large enough to benefit.

## 11.6 Future dynamic edits

If cave digging is ever added:

```text
base field(seed, caveId)
        +
player/system edits
        ↓
current field
```

Persist edits, not the entire generated field.

---

# 12. Comparison Matrix

Ratings are qualitative summaries, not benchmark scores.

| Technique | Naturalness | Anti-pipe | Chambers | Branching | Loops | Multi-level | Performance | Memory | Collision | Complexity | Seedvale fit |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Graph + fixed/variable sweep mesh | Medium | Medium | Medium–High | High | High | High | High for L1 | High | High | Medium | High for L1, uncertain L2 |
| Voxels + Marching Cubes | High | High | High | High | High | High | Medium | Medium–Low at high resolution | Medium | Medium | High as local cave volume |
| Dual Contouring | High | High | High | High | High | High | Medium | Medium | Medium | High | Medium–High, likely later |
| SDF / implicit + extraction | High | High | High | High | High | High | Medium | Medium–High depending on storage | High if collision is separate | Medium–High | High candidate |
| Metaballs | Medium–High | Medium–High | High | High | Medium | Medium | Medium | Medium | Medium | Medium | Medium as primitive, low alone |
| Graph + SDF + MC | High | High | High | High | High | High | Medium | Medium | High | Medium–High | **High candidate for spike** |
| Graph + SDF + adaptive DC | High | High | High | High | High | High | Medium | High at adaptive scale | High | High | Candidate for later optimization |
| Heightmap excavation | Low | Low | Low | Low | Low | Low | High | High | High for surface only | Low | **Not suitable for real caves** |

The important combination for Seedvale is:

```text
topology control
+
continuous 3D volume
+
controlled irregularity
+
seam-free extraction
+
independent collision semantics
+
local generation
```

---

# 13. Candidates Worth Further Investigation

No final architecture is selected here.

## Candidate A — Variable swept cave mesh

Extend the existing graph with:

- 3D spline passages;
- stable local frames;
- variable asymmetric cross-sections;
- independent floor/roof variation;
- macro/meso deformation;
- explicit chamber transitions.

**Why spike:** establishes the minimum complexity required to beat the pipe appearance without introducing a volumetric field.

**Risk:** the first serious junction/loop may reveal rapidly growing surface-topology complexity.

## Candidate B — Graph → local SDF → Marching Cubes

```text
CaveGraph
 ↓
passage/chamber SDF primitives
 ↓
smooth union / subtraction
 ↓
multi-scale deterministic deformation
 ↓
local sampled field
 ↓
Marching Cubes
```

**Why spike:** strongest combination of cave-specific research evidence, topology control and continuous geometry; directly addresses pipe/junction/seam issues at the representation level.

**Risk:** voxel resolution, field-generation CPU cost and mesh extraction complexity.

## Candidate C — Graph → local SDF → adaptive Dual Contouring

Same volume architecture as B with adaptive extraction.

**Why investigate later:** useful if B demonstrates a need for sharper features or adaptive LOD.

**Why not first:** considerably more implementation complexity without an established L1 requirement.

## Candidate D — Graph + direct mesh with implicit junction patches

Use direct sweeps for ordinary passages and local implicit patches for difficult junctions/chambers.

**Why investigate:** potentially combines low cost of sweeps with better junction blending.

**Risk:** two geometry systems can create more complexity than they remove.

---

# 14. Risks / Unknowns

## 14.1 SDF does not guarantee naturalness

A mathematically elegant volume can still look like a blob or a pipe. Primitive design, profile variation and noise hierarchy remain critical.

## 14.2 Voxel resolution versus visual quality

The minimum useful spacing for Seedvale is unknown.

**Spike:** compare approximately 0.5 m, 0.25 m and 0.125 m sampling on identical geometry.

## 14.3 MC versus DC

The theoretical DC advantages are established, but their value for Seedvale's cave style is not measured.

**Spike:** extract the same field with MC and DC and compare silhouette, formations, triangle count and generation time.

## 14.4 Analytic SDF versus sampled field

A compact analytic function is attractive but can be expensive when evaluated millions of times.

**Unknown:** whether a local L1 field is small enough that straightforward CPU evaluation is already sufficient.

## 14.5 Smooth operations and distance guarantees

After smooth blending or arbitrary deformation, the scalar field may no longer be an exact signed distance. Do not assume its numeric value is a guaranteed clearance bound without validation.

## 14.6 Thin features

Any volumetric approach can lose a feature below its sampling scale. Minimum passage diameter and minimum wall/roof thickness must be generation constraints.

## 14.7 Surface overburden

Even a perfect local volume must respect the heightmap above it:

```text
surface height - cave ceiling ≥ required roof thickness
```

This must be checked along the whole cave, not just at endpoints. No interior meshing technique removes this Seedvale-specific constraint.

## 14.8 Entrance integration

The surface/cave mouth remains a separate transition problem. A local volumetric interior does not automatically make a heightmap entrance seamless.

## 14.9 Camera containment

A watertight cave mesh does not automatically guarantee a correct third-person camera. Camera obstruction must use cave-space semantics appropriately.

## 14.10 Premature cave chunking

A 20–30 m cave may not need cave chunks. Adding them too early risks a parallel streaming architecture.

## 14.11 Whole-world voxel temptation

A successful local voxel/SDF cave experiment must not be interpreted as evidence for replacing Seedvale's surface terrain. That would affect terrain, workers, vegetation, roads, water, collision, persistence and streaming.

## 14.12 Collision remains a separate design question

The best visual representation may not be the cheapest or most robust movement representation. The architecture should allow them to differ while sharing one source of truth.

## 14.13 Browser/WebGL2 performance is unmeasured

The literature establishes algorithmic feasibility, not Seedvale-specific browser performance. The actual CPU, typed-array allocation, main-thread upload and GPU costs must be measured in the project.

---

# Potential assumption to revisit

## Existing assumption: graph + analytic primitives can remain the long-term geometry representation

The current topology/data direction looks sound: entrances, passages and chambers are good concepts for the world representation. The weaker assumption is that a single radius/ceiling-height analytic primitive should remain sufficient for increasingly natural L2 geometry.

The current code demonstrates the risk: the passage is encoded as a radius plus ceiling height and rendered as a half-pipe. That is structurally correct but predisposed to the exact pipe-like appearance observed during gameplay.

This document does **not** change `01-problem-and-requirements.md` or select a replacement. It only identifies the assumption for the technical spike.

---

# Research Conclusions by Question

1. **True closed 3D space:** graph+sweep, voxel/MC, DC, SDF/implicit and metaball-derived volumes can all create it; heightmaps cannot.
2. **Natural caves:** volumetric/implicit methods provide the strongest direct tools for continuous irregular geometry; variable swept profiles can also work but require more geometry logic.
3. **Branching and loops:** graph + volume is strongest; graph+sweep supports them but junction construction becomes harder.
4. **Different elevations:** all true 3D approaches; a 3D topology model is the important prerequisite.
5. **Platforms/shelves:** voxel/SDF approaches are strongest because these are simply additional spatial features; sweep-only geometry needs dedicated formation logic.
6. **Natural joining:** implicit union/blending is particularly well suited; mesh sweeps require explicit stitching or booleans.
7. **Minimum clearance:** enforce width/height/clearance in generation and validate the generated volume; do not rely on the final render mesh alone.
8. **Roof thickness:** sample surface height against the cave ceiling envelope along the entire underground layout.
9. **Seams:** use continuous implicit volumes for primitive joins, shared deterministic boundaries for tiles, and an explicit transition scheme for differing LOD.
10. **Irregularity:** separate macro path/volume variation, meso cross-section deformation and micro surface detail using independent deterministic channels.
11. **Tunnel/chamber transitions:** use continuous profile changes or implicit blending rather than attaching fixed primitives abruptly.
12. **Typical artefacts:** sweep—twisting, seams, repeated profiles and junction complexity; MC—resolution imprint, ambiguity and thin-feature loss; DC—QEF/adaptive complexity; SDF—over-smoothing, field-evaluation cost and distance-property caveats; metaballs—blobbiness and weak direct control.
13. **CPU:** direct sweep is generally cheapest for L1; local voxel/SDF is more expensive but bounded by cave volume; DC is more complex than MC. Exact Seedvale cost remains empirical.
14. **GPU:** primarily determined by final mesh/material/draw-call cost, not directly by the representation used to generate it.
15. **Memory:** direct mesh is lowest; dense fields scale approximately with `1 / voxelSize³`; sparse/adaptive representations reduce storage at the cost of complexity.
16. **Chunking/streaming:** local cave volumes can be streamed independently; L1 may not need cave chunks; larger systems may.
17. **Collision:** analytic graph volumes are straightforward for simple layouts; arbitrary volumetric collision is harder; simplified collision derived from the same source is preferable.
18. **Determinism:** all candidates support it if random inputs are derived from stable seed/cave/feature identifiers and fields use world-space coordinates.
19. **Workers:** SDF/voxel evaluation and extraction are strong worker candidates if measured CPU cost is significant; L1 sweep generation may be too small to justify a worker.
20. **L2/L3:** graph + volume scales naturally to L2; L3 requires much more streaming/LOD/terrain infrastructure regardless of extractor.
21. **Whole terrain rewrite:** local sweep/voxel/SDF does not require one; whole-world volumetric terrain does.
22. **Rare local caves:** yes, all local-volume approaches support this well.
23. **20–30 m caves:** yes, all true 3D candidates are technically suitable; the decision is mainly quality versus implementation complexity.
24. **Large cave systems:** graph+volume and voxel/SDF scale architecturally, but large systems need spatial partitioning/caching and likely LOD; direct sweeps scale in geometry but junction complexity grows.

---

# Sources

## Primary / academic sources

1. William E. Lorensen, Harvey E. Cline. **Marching Cubes: A High Resolution 3D Surface Construction Algorithm.** SIGGRAPH 1987. DOI 10.1145/37402.37422.  
   https://doi.org/10.1145/37402.37422

2. Tao Ju, Frank Losasso, Scott Schaefer, Joe Warren. **Dual Contouring of Hermite Data.** SIGGRAPH 2002. DOI 10.1145/566570.566586.  
   https://doi.org/10.1145/566570.566586

3. Sarah F. Frisken, Ronald N. Perry, Alyn P. Rockwood, Thouis R. Jones. **Adaptively Sampled Distance Fields: A General Representation of Shape for Computer Graphics.** SIGGRAPH 2000. DOI 10.1145/344779.344899.  
   https://doi.org/10.1145/344779.344899

4. Gregory M. Nielson, Bernd Hamann. **The Asymptotic Decider: Resolving the Ambiguity in Marching Cubes.** Visualization 1991. DOI 10.1109/VISUAL.1991.175782.  
   https://escholarship.org/uc/item/17p025zk

5. Scott Schaefer, Joe Warren. **Dual Marching Cubes: Primal Contouring of Dual Grids.** Computer Graphics Forum 2005. DOI 10.1111/j.1467-8659.2005.00843.x.  
   https://doi.org/10.1111/j.1467-8659.2005.00843.x

6. Axel Paris, Eric Guérin, Adrien Peytavie, Pauline Collon, Eric Galin. **Synthesizing Geologically Coherent Cave Networks.** Computer Graphics Forum 2021, 40(7), 277–287. DOI 10.1111/cgf.14420.  
   https://doi.org/10.1111/cgf.14420

7. Benjamin Mark, Tudor Berechet, Tobias Mahlmann, Julian Togelius. **Procedural Generation of 3D Caves for Games on the GPU.** Foundations of Digital Games 2015.  
   https://lup.lub.lu.se/record/5464981

8. Lawrence Johnson, Georgios N. Yannakakis, Julian Togelius. **Cellular Automata for Real-Time Generation of Infinite Cave Levels.** Foundations of Digital Games 2010. DOI 10.1145/1814256.1814266.  
   https://www.um.edu.mt/library/oar/handle/123456789/22895

9. Tomasz Zawadzki. **Hybrid of Shape Grammar and Morphing for Procedural Modeling of 3D Caves.** Transactions in GIS 2012. DOI 10.1111/j.1467-9671.2012.01322.x.  
   https://onlinelibrary.wiley.com/doi/10.1111/j.1467-9671.2012.01322.x

10. Martin Douda. **Cave Networks Generation.** Czech Technical University, 2024.  
    https://dcgi.fel.cvut.cz/en/theses/2024/doudamar/

11. Izabella Antoniuk. **Generating layout for complex cave-like levels with schematic maps and Cellular Automata.** Machine Graphics & Vision 2023. DOI 10.22630/MGV.2023.32.2.3.  
    https://mgv.sggw.edu.pl/article/view/5921

## Technical / implementation sources

12. Three.js documentation. **MarchingCubes.**  
    https://threejs.org/docs/pages/MarchingCubes.html

13. Eric Lengyel. **The Transvoxel Algorithm for Voxel Terrain.**  
    https://transvoxel.org/

14. Voxel Tools documentation. **Procedural generation / caves with graph generator.**  
    https://voxel-tools.readthedocs.io/en/latest/procedural_generation/

15. Blender Manual. **Grid to Mesh Node.**  
    https://docs.blender.org/manual/en/5.2/modeling/geometry_nodes/volume/operations/grid_to_mesh.html

16. Blender Manual. **SDF Grid Boolean Node.**  
    https://docs.blender.org/manual/en/5.3/modeling/geometry_nodes/volume/operations/sdf_grid_boolean.html

17. Algorithmic Botany. **Generalized Cylinders.**  
    https://algorithmicbotany.org/cpfg3.0-tutorial/cylinders.html

18. Roland Linden, Ricardo Lopes, Rafael Bidarra. **Designing Procedurally Generated Levels.** AIIDE 2013. DOI 10.1609/aiide.v9i3.12592.  
    https://ojs.aaai.org/index.php/AIIDE/article/view/12592

19. Antonios Liapis. **PCG Book Chapter: Constructive Generation Methods for Dungeons and Levels.**  
    https://antoniosliapis.com/articles/pcgbook_dungeons.php

## Seedvale repository sources consulted

20. `CLAUDE.md` — repository source-of-truth and engineering workflow.  
    https://github.com/jm-sky/seedvale/blob/main/CLAUDE.md

21. `docs/STATE.md` — current implementation state.  
    https://github.com/jm-sky/seedvale/blob/main/docs/STATE.md

22. `docs/architecture/ARCHITECTURE.md` — world lifecycle and system boundaries.  
    https://github.com/jm-sky/seedvale/blob/main/docs/architecture/ARCHITECTURE.md

23. `docs/architecture/GRAPHICS.md` — rendering/performance constraints.  
    https://github.com/jm-sky/seedvale/blob/main/docs/architecture/GRAPHICS.md

24. `docs/architecture/performance-and-workers.md` — worker and streaming constraints.  
    https://github.com/jm-sky/seedvale/blob/main/docs/architecture/performance-and-workers.md

25. `docs/design/caves/README.md` — cave design process.  
    https://github.com/jm-sky/seedvale/blob/main/docs/design/caves/README.md

26. `docs/design/caves/01-problem-and-requirements.md` — cave requirements.  
    https://github.com/jm-sky/seedvale/blob/main/docs/design/caves/01-problem-and-requirements.md

27. `docs/plans/world-terrain-007-underground-caves.md` — current cave plan/status.  
    https://github.com/jm-sky/seedvale/blob/main/docs/plans/world-terrain-007-underground-caves.md

28. `src/world/caveGenerator.ts` — current deterministic graph generator.  
    https://github.com/jm-sky/seedvale/blob/main/src/world/caveGenerator.ts

29. `src/world/caveVolume.ts` — current analytic cave-space representation.  
    https://github.com/jm-sky/seedvale/blob/main/src/world/caveVolume.ts

30. `src/world/caveMesh.ts` — current procedural interior mesh.  
    https://github.com/jm-sky/seedvale/blob/main/src/world/caveMesh.ts

31. `src/world/caveColliders.ts` — current analytic cave-wall collision.  
    https://github.com/jm-sky/seedvale/blob/main/src/world/caveColliders.ts

32. `src/world/createCaves.ts` — current cave lifecycle and streaming.  
    https://github.com/jm-sky/seedvale/blob/main/src/world/createCaves.ts

33. `docs/research/2026-08-13--008--real-caves-in-three-js--brief.md` — earlier cave research.  
    https://github.com/jm-sky/seedvale/blob/main/docs/research/2026-08-13--008--real-caves-in-three-js--brief.md

34. `docs/research/2026-08-13--009--underground-caves.md` — earlier detailed cave research.  
    https://github.com/jm-sky/seedvale/blob/main/docs/research/2026-08-13--009--underground-caves.md

---

**Research-only status:** no cave runtime code, terrain code, collision code, PlayerController code, or other runtime system was changed for this research. The only repository change is this document.
