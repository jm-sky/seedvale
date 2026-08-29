# MPFB2 Recipes

Recipes are repeatable procedures, not verification. Mark a recipe verified only after executing it in the target Blender/MPFB2 environment.

## Character assembly

```text
inspect Blender + MPFB2 version
  → create human
  → deterministic macro/micro targets
  → skin / eyes
  → MHCLO hair / beard / clothing
  → Mixamo rig
  → validate
  → Export Copy
  → bake/remove helpers
  → GLB
```

**Status:** researched, not end-to-end verified.

## Body / face variation

```text
character spec
  → macro targets
  → individual targets
  → reapply macro details where required
  → validate
```

Seedvale face research currently provides:

- Female: HYB1, HYB2.
- Male: BLACKSMITH, BARD.

These are Seedvale art-direction presets, not MPFB2 built-in presets.

## Add MHCLO asset

```text
resolve installed asset
  → HumanService.add_mhclo_asset(...)
  → MPFB2 fitting
  → material setup
  → rigging/weights
  → validate object
```

Do not manually parent/scale MHCLO assets unless a verified exception requires it.

## Clothing fitting

```text
MHCLO
  → three basemesh vertices + barycentric weights + offset
  → ClothesService.fit_clothes_to_human(...)
```

This is the native fitting model.

## Native Delete Groups

Preferred test path:

```text
human + fitted clothing
  → ClothesService.update_delete_group(...)
     OR
  → ClothesService.create_new_delete_group(...)
  → validate Delete.* group / MASK modifier
```

Do not assume the result is correct in GLB until Export Copy → bake → GLB → Seedvale import has been tested.

## Seedvale diagnostic Delete Group path

Existing diagnostic scripts use:

```text
clothing copy
→ apply ARMATURE where required
→ temporary vertex-group preprocessing
→ MeshCrossRef
→ VertexMatch
→ create_new_delete_group()
→ remove temporary copy
```

This is useful for diagnosing/reconstructing Delete Groups. It should not automatically replace the native MPFB2 asset pipeline.

## Mixamo

Confirmed source-level MPFB2 operation:

```python
HumanService.add_builtin_rig(human, "mixamo")
```

External Mixamo website steps are outside the confirmed MPFB2 API:

```text
Export Reduced doll
→ upload to Mixamo
→ choose/download animation
```

Snap/Map to Mixamo was not located as a confirmed MPFB2 API.

## Animation bake

Once an animation has been mapped/posed in Blender:

```text
select Human / armature
→ bpy.ops.nla.bake(...)
→ rename Action
→ validate
```

Status: researched, not end-to-end verified.

## Export Copy → GLB

```text
working character
  → ExportService.create_character_copy(...)
  → ExportService.bake_modifiers_remove_helpers(...)
  → validate export copy
  → bpy.ops.export_scene.gltf(...)
  → import into Seedvale
  → visual validation
```

This is the primary verification recipe for the current skin-through-clothing problem.

## Batch generation

Do not batch expensive operations before one character is verified.

```text
deterministic spec
→ build one character
→ validate
→ export
→ repeat
```

Quarantine failures and clean temporary data between characters.

## Proposed helper boundary

These are proposed interfaces, not existing APIs:

```text
create_character(spec)
set_body(character, spec)
set_appearance(character, spec)
add_asset(character, asset)
setup_rig(character, rig)
validate_character(character)
export_glb(character, export_spec)
```
