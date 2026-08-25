# AI Workflow — Seedvale Blender + MPFB2

**Target:** Blender 5.2 + current MPFB2 2.x.

## Pipeline

```text
Seedvale NPC spec
  -> Claude Code
  -> Blender MCP
  -> Blender 5.2 / bpy + MPFB2
  -> Seedvale helpers
  -> validate
  -> optimize / LOD
  -> GLB
```

Blender MCP is the control/transport layer. MPFB2 is a Blender addon. Do not create a separate MPFB2 MCP layer when Blender Python + MPFB2 API/services are sufficient.

## Rules

1. Inspect the current Blender scene before changing it.
2. Inspect the installed MPFB2 version before relying on its API.
3. Never assume object names, selection, active context or old tutorial APIs.
4. Prefer direct `bpy.data`, MPFB2 services/API and Seedvale helpers over UI automation.
5. Use `bpy.ops` only when appropriate; establish its required context explicitly.
6. Keep source, generated and export objects/collections separate.
7. Do not destructively modify reusable source characters.
8. Keep Seedvale NPC data independent from Blender object names and scene structure.
9. Use deterministic character seeds/specifications.
10. Validate before export: meshes, tris, materials, assets, rig, transforms and LODs.
11. Export with explicit settings; never depend on accidental Blender UI state.
12. Do not guess an MPFB2 API signature. Inspect the installed source/docs.
13. Do not fix MPFB2 clothing/rig problems with arbitrary parenting before checking the supported asset/rig workflow.
14. Keep batch generation bounded and deterministic; isolate/quarantine failures.
15. Record versions for verified procedures.

## Character spec

The simulation describes intent, not Blender implementation:

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
equipment[]
seed
```

## Helper boundary

Proposed helper concepts:

```text
create_character(spec)
set_body(character, spec)
set_appearance(character, spec)
add_asset(character, asset)
equip_item(character, item)
setup_rig(character, rig)
optimize_character(character, profile)
create_lods(character, profile)
validate_character(character)
export_glb(character, export_spec)
```

These are not existing APIs until implemented and verified.

## Verification

- `researched` — supported by current source/docs.
- `verified` — executed successfully in target Blender/MPFB2.
- `Seedvale-verified` — also passes the Seedvale asset/runtime contract.

Documentation alone is never verification.
