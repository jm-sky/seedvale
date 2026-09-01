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

    RuntimeError: Operator bpy.ops.object.select_all.poll() failed, context is incorrect

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

One diagnostic run showed:

    Human_export_copy
      vertices: 12,768
      triangles: 25,332
      Delete groups: 2
        Delete.low-poly: 0 vertices
        Delete.low-poly_export_copy: 0 vertices
      MASK modifiers: 0

Other clothing meshes had no Delete Groups because Delete Groups belong to the body mesh.

A later optimization run completed successfully:

    Optimized: 4 clothing, 4 Delete groups, body Human_export_copy, 4 materials

Despite successful completion, visual inspection showed that the resulting Delete Groups were too aggressive and removed body geometry that should remain visible.

## Important conclusion

The main unresolved problem is the correctness of MPFB2 Delete Group generation when matching against decimated clothing geometry.

The GLB exporter should not yet be treated as the primary cause. The triangular holes may simply expose the topology created by the generated body masks more clearly.

## Current hypothesis

Hypothesis — not yet verified:

After clothing decimation, VertexMatch can produce an overly broad body Delete Group near clothing boundaries. The inverted Mask modifier then removes valid body surface around the clothing.

This needs direct validation by inspecting the generated Delete Groups and their vertex counts/locations before redesigning the algorithm.

## Next research step

1. Run the current pipeline on the same Export Copy.
2. Inspect the generated Delete.* groups on Human_export_copy.
3. Record vertex counts for every Delete Group.
4. Identify whether shoulder, neck and cheek vertices are included.
5. Compare the result with the corresponding decimated clothing geometry.
6. Only then modify the matching algorithm.

Do not add complicated heuristics yet. The target is a simple, deterministic V1 implementation.

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
- Temporary triangulation allows the mixed triangle/quad input to continue through the matching stage.

### Not yet verified

- Correctness of generated Delete Groups after clothing decimation.
- Whether MPFB2 VertexMatch is appropriate for decimated clothing in this exact workflow.
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
