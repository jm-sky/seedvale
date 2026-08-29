# Seedvale Blender / MPFB2 Automation API Map

**Created:** 2026-08-29  
**Purpose:** Practical API map extracted from Seedvale Blender scripts that have already been executed successfully, supplemented by the 2026-08-29 MPFB2 source recon.

## Status model

- **VERIFIED** — API is used by a Seedvale script with runtime evidence.
- **PARTIALLY VERIFIED** — the API/path works, but the complete intended workflow is not verified.
- **RESEARCHED** — confirmed from Blender/MPFB2 source or documentation, but not established by Seedvale runtime evidence.
- **UNKNOWN** — avoid relying on it until inspected/verified.

> Runtime evidence for a script does not imply that every code path or final output of that script is correct.

---

## 1. MPFB2 imports used by Seedvale

### HumanService

Typical import:

```python
from mpfb.services.humanservice import HumanService
```

Used for:

- `HumanService.create_human()`
- `HumanService.add_mhclo_asset()`
- `HumanService.set_character_skin()`
- `HumanService.add_builtin_rig()`
- `HumanService.refit()`

Status: **VERIFIED / PARTIALLY VERIFIED**, depending on operation.

---

### TargetService

```python
from mpfb.services.targetservice import TargetService
```

Used for:

- `TargetService.target_full_path()`
- `TargetService.load_target()`
- `TargetService.set_target_value()`
- `TargetService.reapply_macro_details()`

Seedvale's `face-variants.py` provides runtime evidence for the target manipulation path.

Status: **VERIFIED / PARTIALLY VERIFIED**.

---

### ClothesService

```python
from mpfb.services.clothesservice import ClothesService
```

Used for the Delete Group workflow.

Important methods:

- `fit_clothes_to_human()`
- `create_new_delete_group()`
- `update_delete_group()`
- `set_up_rigging()`
- `interpolate_weights()`

The Seedvale delete-outfit tooling has runtime evidence for:

```text
MeshCrossRef
→ VertexMatch
→ MHCLO reconstruction
→ ClothesService.create_new_delete_group()
→ Delete.* vertex group
```

Status: **VERIFIED / PARTIALLY VERIFIED**.

---

### GeneralObjectProperties

```python
from mpfb.utils.objectproperties import GeneralObjectProperties
```

Used for MPFB2 object metadata such as:

- `asset_source`
- `object_type`
- `uuid`
- `scale_factor`

Example:

```python
GeneralObjectProperties.get_value(...)
GeneralObjectProperties.set_value(...)
```

Status: **VERIFIED**.

---

### HumanObjectProperties

Used by `face-variants.py` for human-level properties such as gender and macro settings.

Status: **VERIFIED / PARTIALLY VERIFIED**.

Important: an existing comment/value combination around gender was identified as potentially inconsistent with current MPFB2 source. Do not infer semantics from comments alone; verify the actual installed version.

---

### AssetService

```python
from mpfb.services.assetservice import AssetService
```

Relevant methods:

- `list_mhclo_assets()`
- `list_mhmat_assets()`
- `find_asset_absolute_path()`
- `get_asset_roots()`

Used by Seedvale's MPFB2 scanner/inventory tooling.

Status: **VERIFIED / PARTIALLY VERIFIED**.

Known discrepancy from recon:

``list_mhmat_assets()`` can discover skin paths while ``find_asset_absolute_path()`` may fail to resolve the same skin filename under the reported asset roots. Treat root/path assumptions carefully.

---

### LocationService

Used by `face-variants.py` to locate MPFB2 bundled data, including targets.

Relevant pattern:

```python
LocationService.get_mpfb_data("targets")
```

Status: **VERIFIED**.

---

### MeshCrossRef

```python
from mpfb.entities.meshcrossref import MeshCrossRef
```

Purpose:

- build vertex/face cross references,
- support MHCLO matching,
- support clothing reconstruction/fitting.

Status: **VERIFIED** through delete-outfit tooling.

---

### VertexMatch

```python
from mpfb.entities.clothes.vertexmatch import VertexMatch
```

Purpose:

- match clothing vertices to basemesh geometry,
- generate vertex mappings/weights/offsets used by MHCLO fitting.

Status: **VERIFIED** through delete-outfit tooling.

---

## 2. Blender imports / API used by Seedvale scripts

### Core import

```python
import bpy
```

Used throughout Blender automation.

---

### Blender data API

Relevant runtime-used areas:

```python
bpy.data.objects
bpy.data.materials
bpy.data.actions
bpy.data.armatures
```

Use direct datablock access where possible; prefer it over context-sensitive operators.

Status: **VERIFIED** where exercised by existing scripts.

---

### Objects and geometry

Relevant APIs:

```python
obj.data.vertices
obj.data.polygons
obj.vertex_groups
obj.modifiers
```

Status: **VERIFIED** through existing tooling.

---

### Materials / node graph

Relevant APIs:

```python
bpy.data.materials
material.node_tree
material.node_tree.nodes
material.node_tree.links
```

Seedvale's material/alpha tooling modifies material/node state.

Status: **VERIFIED** for the existing alpha/blending workflow.

---

### Blender operators

Existing scripts use `bpy.ops` where Blender context is required.

Important rule:

> Do not assume an operator is context-independent. Prefer datablock APIs where practical and explicitly establish selection/mode/context for operators.

---

## 3. Automation capabilities established by existing scripts

### Delete Groups

**VERIFIED**

Existing path:

```text
clothing
→ MeshCrossRef
→ VertexMatch
→ MHCLO data
→ ClothesService.create_new_delete_group()
→ Delete.* vertex group
```

This is an important piece of existing working automation.

Do not replace it merely because MPFB2 also exposes other Delete Group APIs.

---

### Material blending / alpha

**VERIFIED**

Existing Seedvale tooling successfully modifies material/node state for clothing/hair alpha.

This is established runtime knowledge.

The exact relationship between Blender material settings and final glTF alpha behaviour still requires end-to-end GLB validation.

---

### Face variants / target manipulation

**VERIFIED / PARTIALLY VERIFIED**

Existing `face-variants.py` demonstrates real MPFB2 target automation rather than guessed API.

Relevant path:

```text
HumanService
→ HumanObjectProperties
→ TargetService
→ MPFB2 target data
```

---

### Asset inventory / discovery

**VERIFIED**

The scanner tooling establishes a practical method for discovering installed MPFB2 assets and matching names/aliases.

---

## 4. Researched but not yet established by Seedvale runtime

These APIs are useful candidates, but should not be treated as guaranteed in the installed Blender/MPFB2 environment until tested.

### Native clothing assembly

```python
HumanService.add_mhclo_asset(...)
```

Expected to perform import/fitting/material/rigging according to the MHCLO asset.

Status: **RESEARCHED** for the complete generalized workflow.

---

### Native Delete Group update

```python
ClothesService.update_delete_group(...)
```

Status: **RESEARCHED** as an alternative/native path.

Existing Seedvale Delete Group generation remains the stronger runtime reference.

---

### Native Delete Group creation

```python
ClothesService.create_new_delete_group(...)
```

Status: **PARTIALLY VERIFIED** — this exact method participates in the working Seedvale delete-outfit path.

---

### Export Copy

```python
from mpfb.services.exportservice import ExportService

ExportService.create_character_copy(...)
ExportService.bake_modifiers_remove_helpers(...)
```

Also exposed through the MPFB2 export-copy operator.

Status: **RESEARCHED for the generalized API; individual existing workflow usage has runtime evidence.**

The important unverified question is whether our complete Delete.* → export-copy → GLB path preserves the intended geometry.

---

### Mixamo rig

```python
HumanService.add_builtin_rig(basemesh, "mixamo")
```

MPFB2 source contains Mixamo rig definitions and weights.

Status: **RESEARCHED** unless the particular Seedvale script/runtime execution is documented separately.

---

### Blender animation bake

```python
bpy.ops.nla.bake(...)
```

Status: **RESEARCHED**.

The API is available in Blender 5.2, but the complete:

```text
Mixamo FBX
→ mapping/snap
→ bake
→ Action
→ GLB
```

workflow is not yet established end-to-end.

---

### GLB export

```python
bpy.ops.export_scene.gltf(...)
```

Status: **RESEARCHED at API level; existing Seedvale GLB generation provides runtime evidence of export.**

Final visual correctness in Seedvale remains a separate verification target.

---

## 5. Imports → capabilities map

| Import / class | Main capability | Evidence |
|---|---|---|
| `bpy` | Blender automation | VERIFIED |
| `HumanService` | human / assets / skin / rig | VERIFIED / PARTIAL |
| `TargetService` | macro/individual targets | VERIFIED / PARTIAL |
| `HumanObjectProperties` | human properties | VERIFIED / PARTIAL |
| `GeneralObjectProperties` | MPFB2 object metadata | VERIFIED |
| `AssetService` | asset discovery | VERIFIED / PARTIAL |
| `LocationService` | MPFB2 bundled data | VERIFIED |
| `ClothesService` | fitting / Delete Groups / clothing rigging | VERIFIED / PARTIAL |
| `MeshCrossRef` | mesh cross-reference | VERIFIED |
| `VertexMatch` | MHCLO vertex mapping | VERIFIED |
| `ExportService` | export-copy preparation | RESEARCHED / PARTIAL |
| `bpy.data.*` | direct Blender datablocks | VERIFIED |
| `bpy.ops.nla.bake` | animation baking | RESEARCHED |
| `bpy.ops.export_scene.gltf` | GLB export | RESEARCHED / PARTIAL |

---

## 6. Rules for future automation

1. **Prefer APIs already exercised by Seedvale.**
2. Treat existing working scripts as runtime reference implementations.
3. Do not replace a verified path with a source-only alternative without a reason and a test.
4. Keep `researched` and `verified` knowledge separate.
5. Record the exact import path when discovering a new MPFB2 class/service.
6. Record the exact method signature when it matters to automation.
7. Prefer deterministic functions and direct datablock access over context-sensitive operators.
8. Keep asset names separate from asset paths; resolve paths through MPFB2 when possible.
9. Never assume that successful GLB generation means correct GLB rendering.
10. For a new automation, first identify which existing verified building blocks it can compose.

## 7. Primary source files

- `scripts/blender/delete-outfit/seedvale_character_tools.py`
- `scripts/blender/delete-outfit/fix_materials_and_hair_alpha.py`
- `scripts/blender/face-variants.py`
- `scripts/blender/mpfb2-scanner/scan.py`
- `scripts/blender/mpfb2-scanner/asset-inventory.py`
- `scripts/blender/mpfb2-scanner/config.py`
- `scripts/blender/mpfb2-scanner/aliases.py`

Related knowledge:

- `docs/blender/MPFB2_REFERENCE.md`
- `docs/blender/MPFB2_RECIPES.md`
- `docs/blender/MPFB2_ASSETS.md`
- `docs/blender/BLENDER_5_2_REFERENCE.md`
- `docs/blender/VERIFIED/README.md`
- `docs/research/2026-08-28--021--mpfb2-female-face-research.md`
- `docs/research/2026-08-28--022--mpfb2-assets-recon.md`
- `docs/research/2026-08-28--023--character-face-research.md`

## 8. Next useful extension

When Blender is available, extend this map with runtime inspection of:

- exact installed MPFB2 version,
- callable signatures from the installed package,
- registered MPFB2 operators,
- installed asset inventory,
- rig identifiers,
- target inventory,
- material/alpha behaviour,
- export-copy behaviour.

The generated/runtime map should complement, not overwrite, the source-level research.
