# Seedvale — MPFB2 Export Copy Optimization Research

**Date:** 2026-09-01  
**Status:** researched  
**Scope:** Blender 5.2 + MPFB2 2.0.17 character preparation

## Current V1 workflow

1. Prepare the character model and add animations.
2. Create the MPFB2 Export Copy manually.
3. Run Seedvale Optimize Character on the Export Copy.
4. Export the optimized character to GLB.

Intended pipeline:

    Export Copy
        ↓
    Decimate + Apply clothing
        ↓
    Generate Delete Groups + Masks
        ↓
    Decimate + Apply body
        ↓
    Fix Clothing / Hair Alpha
        ↓
    GLB

Delete Groups are generated after clothing decimation to reduce the geometry involved in the expensive MPFB2 clothing matching operation.

## Seedvale Character Tools v2

Current panel:

- Optimize Character — recommended combined pipeline.
- Generate + Apply Decimate — individual/debug step.
- Generate Delete Groups + Masks — individual/debug step.
- Fix Clothing / Hair Alpha — individual/debug step.

Current Decimate ratios:

- body: 0.35
- clothing: 0.35
- head: 0.50
- eyes: skipped

Decimate is applied, not merely left as a modifier.

## MPFB2 source recon

Environment:

- Blender 5.2.0 LTS
- MPFB2 2.0.17
- MPFB2 build 20260722

Relevant MPFB2 source:

    services/exportservice.py

ExportService.bake_modifiers_remove_helpers() calls ExportService._delete_vertex_group().

The latter uses Blender context-sensitive operators including:

    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.object.mode_set(...)
    bpy.ops.mesh.select_all(...)

Calling MPFB2 Export Copy operations from an incompatible context caused:

    RuntimeError: bpy.ops.object.select_all.poll() failed, context is incorrect

A View3D override was sufficient to execute the MPFB2 Export Copy operator manually from the Seedvale script.

## Delete Groups — current problem

The current implementation uses:

- ClothesService.get_reference_scale()
- MeshCrossRef
- VertexMatch
- ClothesService.create_new_delete_group()

A temporary copy of each clothing mesh is created for matching.

MPFB2 MeshCrossRef failed on a mesh containing both quads and triangles:

    ValueError:
    Faces must have the same number of vertices.
    Found both 4 and 3

The current implementation therefore triangulates the temporary clothing copy before constructing the MPFB2 cross-reference.

The temporary copy may also contain an ARMATURE modifier and this must be handled carefully because the matching code expects consistent geometry/topology.

## Observed Delete Group failure

Generated Delete Groups currently cause incorrect holes in the body:

- large holes around the shoulders where the body meets the shirt,
- holes around the cheeks where the body meets the beard,
- holes around the neck/decollete,
- after GLB export, some holes become visibly triangular.

The issue occurs even when Optimize Character completes successfully.

## Diagnostic v3 — confirmed geometry state

A diagnostic run after Optimize reported:

    BODY: Human_export_copy
    vertices: 12,768
    polygons: 12,666

Existing Delete Groups:

    Delete.low-poly
      vertices: 0
      coverage: 0.00%

    Delete.low-poly_export_copy
      vertices: 0
      coverage: 0.00%

Tank top:

    Delete.elvs_male_athletic_tank1
      vertices: 1,750
      coverage: 13.71%

Polygon coverage:

    fully inside:    1,601
    partially inside: 301
    outside:         10,764
    partial ratio:   15.83%

Boundary:

    group vertices:       1,750
    adjacent non-group:   301
    boundary/group ratio: 17.20%

Weights:

    count: 1,750
    min:   1.0000
    max:   1.0000
    avg:   1.0000

The affected polygons were reported as 4-vertex polygons: 1,902.

The group consisted of 165 contiguous vertex ranges; the largest reported ranges were:

    3666 - 3977  (312)
    10025 - 10305 (281)
    1505 - 1640  (136)
    7871 - 8002  (132)

The corresponding Mask existed and was configured as:

    group = Delete.elvs_male_athletic_tank1
    invert = True

## Interpretation of Diagnostic v3

The diagnostic confirms that the Mask is not simply absent or empty.

The tank top Delete Group is substantial and has a significant boundary:

- 1,750 body vertices are removed by the group.
- 301 group-adjacent vertices form the boundary with non-group vertices.
- 301 polygons are only partially covered.

This makes an overly aggressive body boundary a strong hypothesis for the visible holes.

The diagnostic does NOT yet prove whether the cause is:

1. MPFB2 VertexMatch itself,
2. decimated clothing geometry,
3. coordinate/evaluation mismatch,
4. temporary ARMATURE application,
5. temporary triangulation,
6. Mask evaluation,
7. GLB export.

The triangular appearance after GLB export is therefore not sufficient evidence that glTF export is the root cause.

## Important pipeline constraint

The current implementation intentionally uses:

    Decimate clothing
        ↓
    Generate Delete Groups
        ↓
    Decimate body

This ordering is needed for performance, but it may alter the clothing surface used by VertexMatch.

The next investigation must determine whether Delete Group geometry remains valid after clothing decimation.

## Current hypothesis

**Hypothesis — not yet verified:**

After clothing decimation, VertexMatch produces an overly broad body Delete Group near clothing boundaries. The inverted Mask then removes valid body surface around the clothing.

A second related possibility is that the temporary ARMATURE/triangulation processing changes the coordinates/topology used for matching.

## Current conclusion

Do **not** treat the current Delete Group implementation as verified for production.

Do not blindly change decimate ratios or add arbitrary smoothing/expansion heuristics.

The next step is a narrow geometric diagnosis comparing:

- generated Delete Group,
- decimated clothing,
- body surface,
- boundary vertices,
- and the evaluated geometry immediately before Mask application.

## Recommended next investigation

1. Run Optimize Character on a clean Export Copy.
2. Run Delete Diagnostic v3.
3. Determine which Delete Group vertices correspond to the shoulder/neck/cheek regions.
4. Compare those vertices with the nearest surface of the corresponding clothing mesh.
5. Test the same matching operation without clothing decimation on one controlled copy.
6. Compare Delete Group counts and boundary behaviour.
7. Only then decide whether the V1 algorithm should use original clothing geometry, evaluated clothing geometry, or another MPFB2-supported matching path.

The goal remains a simple deterministic V1 implementation.

## Manual Export Copy

Manual MPFB2 Export Copy creation is acceptable for now.

Full automation of:

- animation import,
- animation baking,
- MPFB2 cleanup,
- Export Copy creation,

is deferred.

The immediate Seedvale tooling focus is:

- Delete Groups + Masks,
- clothing/hair alpha handling,
- Decimate generation/application.

## Status

### Researched

- MPFB2 ExportService source was inspected.
- MPFB2 Delete Group generation path was inspected.
- Blender operator context was identified as the cause of the select_all poll failure.
- Decimate-before-Delete-Groups is the current intended V1 pipeline.
- MPFB2 MeshCrossRef requires consistent face vertex counts.
- Temporary triangulation allows mixed triangle/quad input to continue through the matching stage.
- Diagnostic v3 confirmed a substantial tank-top Delete Group and significant boundary coverage.

### Not yet verified

- Correctness of generated Delete Groups after clothing decimation.
- Whether MPFB2 VertexMatch is appropriate for decimated clothing in this exact workflow.
- Whether temporary ARMATURE application affects matching coordinates.
- Whether triangular GLB holes are caused entirely by generated body masks.
- Whether the current alpha fix is sufficient for every clothing/hair material.
- Final triangle/GLB-size budget after a correct Delete Group implementation.

## Current decision

Keep the V1 pipeline simple:

    Export Copy
    → Decimate + Apply clothing
    → Generate Delete Groups + Masks
    → Decimate + Apply body
    → Fix Alpha
    → GLB

Do not change the order until the Delete Group generation itself has been diagnosed.
