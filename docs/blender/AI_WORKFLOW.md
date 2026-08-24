# AI Workflow — Seedvale Blender + MPFB2

## Purpose

This document defines how an AI agent should work with Blender MCP, Blender 5.2 and MPFB2 for Seedvale character assets.

## Operating model

```text
Claude Code
  -> Blender MCP
  -> Blender 5.2
  -> bpy / MPFB2
  -> Seedvale helpers
  -> validation
  -> GLB
```

Blender MCP is the transport/control layer. MPFB2 remains a Blender addon. Do not invent a separate MPFB2 MCP layer when `bpy` and MPFB2 services/API can perform the operation.

## Rules

1. Inspect the current Blender scene before modifying it.
2. Never assume object names, selected objects, active collections, active armatures or MPFB2-generated names.
3. Prefer MPFB2 services/API or Seedvale helpers over UI automation and fragile operator sequences.
4. Use Blender context-dependent operators only when there is no appropriate data/API operation, and establish the required context explicitly.
5. Never destructively modify a reusable MPFB2 source character when a derived/export copy can be used.
6. Keep character generation parameters separate from Blender runtime objects.
7. Keep Seedvale semantics separate from MPFB2 implementation details.
8. Validate the generated character before export: geometry, materials, armature, asset attachments, transforms and expected LOD state.
9. Do not claim a procedure is verified because it is documented. Verification requires an actual Blender test.
10. Record Blender and MPFB2 versions for verified procedures.
11. Prefer deterministic seeds/parameters for reproducible generated NPCs.
12. Keep generated intermediates separate from final export assets.
13. Do not add dependencies merely to automate a Blender operation that `bpy`/MPFB2 already supports.
14. Keep batch generation deterministic and bounded; do not generate hundreds of characters in one interactive operation without an explicit batch plan.
15. Preserve a clear path from Seedvale NPC specification to exported asset metadata.

## Recommended abstraction

Seedvale helpers should eventually expose a small, explicit API such as:

```text
create_character(spec)
set_body(character, spec)
set_appearance(character, spec)
add_asset(character, asset_spec)
equip_item(character, item_spec)
setup_rig(character, rig_spec)
optimize_character(character, optimization_spec)
create_lods(character, lod_spec)
validate_character(character)
export_glb(character, export_spec)
```

These are target helper concepts, not claims that the functions already exist.

## Character specification

The simulation should describe intent, not Blender internals:

```text
sex
age
height
body_type
appearance
hair
beard
clothing
profession
 equipment
seed
```

The Blender pipeline translates this into MPFB2 parameters/assets and then into an optimized GLB.

## Verification levels

### Researched

The procedure is supported by current Blender/MPFB2 documentation or source inspection.

### Verified

The exact procedure has been executed successfully in the stated environment.

### Seedvale-verified

The result also passes Seedvale-specific geometry, material, rig and export validation.

Never collapse these levels into one.
