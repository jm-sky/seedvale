# Seedvale — MPFB2 Export Copy Recon

**Status:** `researched`  
**Environment:** Blender 5.2.0 LTS · MPFB2 2.0.17 (build 20260722)  
**Updated:** 2026-08-31

## Purpose

Document the current recon of MPFB2 **Export Copy** and separate it from the Seedvale character preparation pipeline.

## Seedvale preparation

The existing `scripts/blender/delete-outfit/seedvale_character_tools.py` implements:

1. **Delete groups + Mask modifiers**
   - Generates MPFB2 `Delete.*` vertex groups on the basemesh.
   - Creates inverted Mask modifiers for clothing.
   - Uses MPFB2 `ClothesService`, `VertexMatch` and `MeshCrossRef`.

2. **Clothing / hair material alpha**
   - Disconnects Principled BSDF Alpha links for matching materials.
   - Sets Blender 5.2 `surface_render_method = "DITHERED"`.

`seedvale.prepare_character` therefore means **preparation only**. It is not the MPFB2 Export Copy implementation.

## MPFB2 Export Copy source

Installed source:

`.../mpfb/ui/operations/exportops/operators/createexportcopy.py`

The operator:

`bpy.ops.mpfb.export_copy()`

calls:

`ExportService.create_character_copy(...)`

and then:

`TargetService.bake_targets(new_basemesh)`

followed by:

`ExportService.bake_modifiers_remove_helpers(...)`

Relevant default settings observed during recon:

- `bake_shapekeys = True`
- `remove_basemesh = False`
- `delete_helpers = True`
- `suffix = "_export_copy"`
- `create_collection = True`
- `mask_modifiers = "KEEP"`
- `subdiv_modifiers = "KEEP"`

MPFB2 creates an `export copy` collection and an exported character object hierarchy.

## Context finding

Calling `bpy.ops.mpfb.export_copy()` from a Text Editor context initially failed its poll.

A context probe showed that `mpfb.export_copy.poll()` succeeds after making `Human` active/selected, and also succeeds under a `VIEW_3D` context override.

A real `VIEW_3D` override was subsequently used successfully far enough for MPFB2 to create the `export copy` collection.

However, MPFB2 later still fails inside its own source:

`ExportService._delete_vertex_group()`

at:

```
bpy.ops.object.select_all(action='DESELECT')
```

with:

`RuntimeError: Operator bpy.ops.object.select_all.poll() failed, context is incorrect`

Therefore the current conclusion is:

> The Export Copy operator itself is callable, but MPFB2 2.0.17 has an internal context-dependent cleanup path which cannot reliably be driven by our automation script through the operator.

We do **not** currently need to solve this. Manual MPFB2 Export Copy is acceptable for the current pipeline.

## Important visual finding

Manual/automated Export Copy testing produced an imperfect result where:

- the copied body was in an upright/base pose,
- clothing remained aligned to the animation/current posed state.

This indicates that Export Copy behaviour around posed clothing/rig state still needs investigation before it is considered part of the automated pipeline.

This is separate from Delete groups and material alpha preparation.

## Current automation boundary

### Automate now

**Character preparation:**

`seedvale.prepare_character`

- generate `Delete.*` groups + masks
- fix clothing/hair blending/alpha

### Manual for now

**MPFB2 Export Copy**

The user can run MPFB2 Export Copy manually. No need to spend further effort automating this step yet.

### Later

**Animation pipeline**

The important future automation target is:

`import animation → apply/bake animation → clean up → export`

This should be investigated independently of the current Export Copy operator-context problem.

## Source recon: ExportService cleanup

Relevant function:

`ExportService.bake_modifiers_remove_helpers()`

It performs helper cleanup and eventually calls:

`ExportService._delete_vertex_group(basemesh, "HelperGeometry")`

and:

`ExportService._delete_vertex_group(basemesh, "JointCubes")`

`_delete_vertex_group()` uses multiple Blender operators, including:

- `bpy.ops.object.select_all()`
- `bpy.ops.object.mode_set()`
- `bpy.ops.mesh.select_all()`
- `bpy.ops.mesh.delete()`

This confirms that the failure is caused by an internal MPFB2 operator-context dependency rather than by Seedvale's Delete Group implementation.

## Decision

Do not make MPFB2 Export Copy automation a blocker.

The Seedvale pipeline currently treats:

`Prepare Character → manual MPFB2 Export Copy`

as acceptable.

Future work should focus on the two important automation areas:

1. **Character preparation** — already implemented:
   - Delete groups + masks
   - clothing/hair alpha/blending

2. **Animation processing** — next major target:
   - animation import
   - correct rig/character pose handling
   - bake
   - cleanup
   - eventual GLB export

## Related files

- `scripts/blender/delete-outfit/seedvale_character_tools.py`
- `docs/blender/MPFB2_REFERENCE.md`
- `docs/blender/MPFB2_RECIPES.md`
- `docs/blender/AUTOMATION_API_MAP.md`
- `docs/blender/CHARACTER_IDENTIFICATION_HEURISTICS.md`
