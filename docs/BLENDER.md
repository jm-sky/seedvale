# Blender / MPFB2 Automation Reference

> Practical reference for Blender + MPFB2 character automation in Seedvale.
>
> **Source of truth:** verified code and experiments in `scripts/blender/`, supported by research documents. This document describes reusable technical knowledge, not Seedvale gameplay plans.

## Environment

- Blender: **5.2.x**
- MPFB2: **2.0.17**
- MPFB2 Blender extension namespace:
  `bl_ext.extensions_blender_org.mpfb`

### Important

Do not assume an API exists because it is mentioned in documentation or UI. Prefer APIs verified against the installed MPFB2 version.

---

## Repository References

### Research

- [MPFB2 assets reconnaissance](research/2026-08-28--022--mpfb2-assets-recon.md)
- [MPFB2 female face research](research/2026-08-28--021--mpfb2-female-face-research.md)
- [Character face research](research/2026-08-28--023--character-face-research.md)

### Blender scripts

- [Blender scripts directory](../scripts/blender/)
- [MPFB2 scanner](../scripts/blender/mpfb2-scanner/)
- [Delete outfit tools](../scripts/blender/delete-outfit/)

The scanner and delete-outfit tools contain the most useful currently verified examples of Blender/MPFB2 Python automation.

---

# 1. Blender Python

Automation is built around Blender's Python API:

```python
import bpy
```

Prefer direct data access through `bpy.data` where practical instead of relying on UI state.

Useful data collections include:

```python
bpy.data.objects
bpy.data.meshes
bpy.data.materials
bpy.data.armatures
bpy.data.actions
bpy.data.collections
```

### Selection and context

Avoid making automation dependent on:

- current selection,
- active object,
- current editor,
- current mode,

unless the operator explicitly requires them.

When using `bpy.ops`, prepare the required context explicitly and validate the result.

---

# 2. MPFB2 Python Namespace

Current MPFB2 installation exposes its Python package under:

```python
bl_ext.extensions_blender_org.mpfb
```

For example:

```python
from bl_ext.extensions_blender_org.mpfb.services.clothesservice import (
    ClothesService,
)
```

The following imports were found to be invalid in the tested installation:

```python
import mpfb
from mpfb.services...
```

### GeneralObjectProperties

The tested location is:

```python
from bl_ext.extensions_blender_org.mpfb.entities.objectproperties import (
    GeneralObjectProperties,
)
```

It is **not** located under `mpfb.services.properties`.

### LocationService

Do not assume a `mpfb.services.locations` module exists. In the tested installation it does not.

Where a `MeshCrossRef` cache is optional, the verified workaround is:

```python
cache_dir = None
```

---

# 3. Discovering MPFB2

The repository already contains a scanner for inspecting the installed MPFB2 environment:

- [asset-inventory.py](../scripts/blender/mpfb2-scanner/asset-inventory.py)

It detects:

- Blender version/build,
- installed MPFB2 module,
- MPFB2 root,
- likely resource directories,
- asset files,
- asset categories,
- file extensions,
- available `bpy.ops.mpfb` operators,
- MPFB-related Blender properties.

This is preferable to maintaining a manually invented list of MPFB2 assets.

---

# 4. Asset Discovery

MPFB2 resources are organized into categories such as:

- clothes / clothing,
- hair,
- skin,
- materials,
- targets,
- poses,
- rigs,
- presets,
- packs.

The scanner classifies files by their actual resource paths.

See:

- [asset-inventory.py](../scripts/blender/mpfb2-scanner/asset-inventory.py)
- [aliases.py](../scripts/blender/mpfb2-scanner/aliases.py)

## Asset aliases

The scanner already contains semantic aliases for categories such as:

- bald / hair,
- short / medium / long hair,
- beard / moustache,
- shirt,
- trousers,
- tunic,
- vest,
- belt,
- boots,
- shoes,
- cloak,
- materials,
- profession-specific clothing.

These aliases are useful for automation and discovery, but should not be treated as proof that a concrete asset exists. Always resolve aliases against the installed asset inventory.

---

# 5. Character Components

The current character workflow separates appearance into reusable components:

```text
Base Body
    ↓
Face
    ↓
Skin + Eyes
    ↓
Hair
    ↓
Beard
    ↓
Outfit
    ↓
Rig / Animations
    ↓
Export Copy
    ↓
GLB
```

The useful automation boundary is therefore the component rather than a complete profession-specific model.

---

# 6. Face / Morph Targets

Face research documents contain verified information about MPFB2 targets and their observed visual effects.

Useful information to preserve:

- target names,
- target categories,
- tested values,
- approximate visual effect,
- combinations that were tested.

See:

- [MPFB2 female face research](research/2026-08-28--021--mpfb2-female-face-research.md)
- [character face research](research/2026-08-28--023--character-face-research.md)

Research conclusions should be transferred here only after they are useful as reusable automation knowledge.

---

# 7. Skin and Eyes

Current tested assets:

- Skin: `Caucasian middle aged male`
- Eyes: `Low-poly eyes`

The MPFB2 asset workflow should be preferred over manually constructing replacement meshes/materials.

Asset names and paths should be resolved against the actual installed library rather than hard-coded from memory.

---

# 8. Mixamo Rig and Animations

Current verified workflow:

```text
MPFB2 character
    ↓
Export "Mixamo Reduced doll"
    ↓
Mixamo
    ↓
Download animation
    ↓
Import into Blender
    ↓
Snap to Mixamo / Map to Mixamo
    ↓
Select Human
    ↓
Animation → Bake
    ↓
Rename Action
```

Actions should be finalized before creating the export copy.

The important automation boundary is the individual animation:

```text
import → map/snap → bake → rename
```

Batch automation can iterate over the same operation for multiple animations.

---

# 9. Clothing and Delete Groups

This is currently the best-verified MPFB2 automation path in the repository.

MPFB2 uses `Delete.*` vertex groups on the basemesh to hide body geometry under clothing.

Example:

```text
Human
├── Delete.rehmanpolanski_viking_tunic
└── Delete.rehmanpolanski_viking_pants
```

The repository has a working implementation using the native MPFB2 mechanism:

```python
ClothesService.create_new_delete_group(...)
```

Supporting MPFB2 classes include:

```text
MeshCrossRef
VertexMatch
Mhclo
ClothesService
```

See:

- [delete-outfit README](../scripts/blender/delete-outfit/README.md)
- [delete-group addon](../scripts/blender/delete-outfit/blender-delete-group-addon-v2.py)

## Verified algorithm

The tested workflow is:

```text
Human + clothing
        ↓
temporary clothing copy
        ↓
apply ARMATURE modifier
        ↓
remove temporary vertex groups
        ↓
create temporary body group
        ↓
build basemesh MeshCrossRef
        ↓
build clothing MeshCrossRef
        ↓
VertexMatch
        ↓
ClothesService.create_new_delete_group(...)
        ↓
Delete.* on Human
        ↓
remove temporary copy
```

The original clothing asset is not modified.

## Modifier rule

A tested clothing object may contain:

```text
Armature
Subdivision
```

The verified approach is:

- apply `ARMATURE` when required by the Delete-group calculation,
- leave `Subdivision` unless there is a specific reason to apply/remove it,
- do not blindly apply every modifier.

## Performance

Building the basemesh `MeshCrossRef` is currently the expensive part of this operation.

An observed example:

```text
Basemesh vertices:    19,158
Clothes vertices:      1,312

Basemesh CrossRef:     ~28.6 s
Clothes CrossRef:       ~0.2 s
Vertex matching:        ~0.1 s
```

This matters for batch automation. Reusing/caching work should be investigated only when correctness is preserved.

---

# 10. MPFB2 Export Copy

The working character should not be treated as the final exported asset.

Current workflow:

```text
Human
 + skin
 + eyes
 + clothes
 + Delete.* groups
 + Mixamo rig
 + animations
        ↓
MPFB2 Export Copy
        ↓
GLB
```

The repository documents a tested Export Copy configuration including:

- Bake mask modifiers,
- Make subdiv modifiers,
- Bake modelling shapekeys,
- Delete helpers,
- keep the required basemesh data.

See:

- [delete-outfit README](../scripts/blender/delete-outfit/README.md)

---

# 11. Materials and Alpha

This area is still under investigation.

A tested GLB showed that materials without actual alpha textures were exported as `alphaMode: BLEND`, while genuine hair/beard alpha materials also used `BLEND`.

Therefore:

> Do not globally force all MPFB2 materials to opaque.

The correct automation must distinguish:

```text
Opaque RGB material
    → OPAQUE

Real alpha material
    → BLEND / MASK as appropriate
```

Existing diagnostic script:

- [fix_materials_and_hair_alpha.py](../scripts/blender/delete-outfit/fix_materials_and_hair_alpha.py)

That script is diagnostic/work-in-progress, not a general final material pipeline.

Before changing material settings automatically, inspect:

- material render/surface method,
- Principled BSDF Alpha input,
- Alpha links,
- Base Color texture,
- texture channels,
- image format,
- exporter result.

---

# 12. GLB Export

The current tested path is:

```text
MPFB2 Export Copy
    ↓
Blender glTF / GLB export
```

Important tested export requirements include:

- selected objects,
- +Y Up,
- UVs,
- normals,
- Actions animation mode,
- skinning with 4 bone influences,
- rest-position armature,
- required shape-key settings.

The exact exporter settings should remain tied to the tested Blender version because Blender's glTF UI/API can change.

---

# 13. Automation Principles

For future scripts:

1. **Inspect before modifying.**
2. Prefer direct Blender data API where practical.
3. Use MPFB2 native services instead of reimplementing MPFB2 algorithms.
4. Do not modify source assets unnecessarily.
5. Use temporary copies for destructive preprocessing.
6. Validate every important output.
7. Make scripts deterministic where practical.
8. Avoid dependence on current selection/context.
9. Log discovered objects, assets and operations.
10. Fail loudly when an expected asset/API/result is missing.
11. Keep Blender/MPFB2 version assumptions explicit.
12. Separate discovery, transformation and export.
13. Do not batch expensive operations until the single-item workflow is verified.

---

# 14. Automation Recipe Pattern

A reusable automation should preferably follow:

```text
Load / inspect
    ↓
Resolve assets
    ↓
Validate prerequisites
    ↓
Apply MPFB2 operation
    ↓
Apply Blender operation
    ↓
Validate result
    ↓
Export copy
    ↓
Export GLB
    ↓
Validate exported result
```

For batch generation:

```text
Asset registry
    ↓
Variant definition
    ↓
Build one character
    ↓
Validate
    ↓
Export
    ↓
Repeat
```

The individual operations should remain independently testable.

---

# 15. Existing Automation Inventory

## MPFB2 scanner

[mpfb2-scanner](../scripts/blender/mpfb2-scanner/)

Purpose:

- inspect installed MPFB2,
- discover resource directories,
- inventory assets,
- discover operators/properties.

## Delete-group automation

[delete-outfit](../scripts/blender/delete-outfit/)

Purpose:

- generate MPFB2-native `Delete.*` groups,
- prepare clothing for export,
- diagnose material/alpha issues.

## Material diagnostic

[fix_materials_and_hair_alpha.py](../scripts/blender/delete-outfit/fix_materials_and_hair_alpha.py)

Purpose:

- inspect/change selected MPFB2 material alpha behavior.

**Status:** experimental; not a universal material fixer.

---

# 16. Knowledge Gaps

The following should be documented only after verification against the installed environment:

- complete MPFB2 Python API surface,
- reliable programmatic asset loading,
- programmatic hair/beard/outfit attachment,
- programmatic face-target manipulation,
- Mixamo mapping/bake automation,
- Export Copy Python API,
- complete material/alpha rules,
- reliable GLB export API,
- asset compatibility rules,
- batch-safe MPFB2 operations.

These are investigation targets, not assumed capabilities.

---

# 17. Related Workflow Documentation

The older complete workflow and troubleshooting notes remain useful as implementation history:

- [MPFB2 → Mixamo → GLB README](../scripts/blender/delete-outfit/README.md)
- [Delete-group status](../scripts/blender/delete-outfit/STATUS.md)
- [Original GLB problem](../scripts/blender/delete-outfit/PROBLEM.md)

For technical truth, prefer the current scripts and verified experiments over historical assumptions in planning documents.
