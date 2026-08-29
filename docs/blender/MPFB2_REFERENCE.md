# MPFB2 Reference

**Target:** Blender 5.2 + MPFB2 2.x.  
**Seedvale-tested MPFB2:** 2.0.17.

This file records source-level API knowledge. Unless explicitly marked otherwise, the 2026-08-29 recon findings are `researched`, not runtime-verified.

## Mental model

MPFB2 is a Blender addon. Prefer its services/entities over reimplementing MPFB2 algorithms.

- `HumanService` — humans, assets, rigs, refit, serialization.
- `AssetService` — asset discovery and path resolution.
- `TargetService` — macro/micro targets.
- `MaterialService` — materials.
- `RigService` — rig identification and armature management.
- `ClothesService` — MHCLO fitting, weights and Delete Groups.
- `ExportService` — export-copy preparation.

## Namespace

The installed MPFB2 2.0.17 namespace used by Seedvale is:

```python
from bl_ext.extensions_blender_org.mpfb.services.clothesservice import ClothesService
```

Do not replace this with guessed imports such as `import mpfb`.

## HumanService

### Create human

```python
HumanService.create_human(
    mask_helpers=True,
    detailed_helpers=True,
    extra_vertex_groups=True,
    feet_on_ground=True,
    scale=0.1,
    macro_detail_dict=None,
)
```

Returns a Blender object.

### Add MHCLO asset

```python
HumanService.add_mhclo_asset(
    mhclo_file,
    basemesh,
    asset_type="Clothes",
    subdiv_levels=1,
    material_type="MAKESKIN",
    alternative_materials=None,
    color_adjustments=None,
    set_up_rigging=True,
    interpolate_weights=True,
    import_subrig=True,
    import_weights=True,
)
```

This is the central MPFB2 path for MHCLO clothing and related attached assets. It performs MPFB2 fitting/material/rigging work rather than requiring arbitrary mesh parenting.

### Skin, rig and refit

```python
HumanService.set_character_skin(...)
HumanService.add_builtin_rig(basemesh, "mixamo")
HumanService.refit(...)
```

MPFB2 source contains `mixamo` and `mixamo_unity` rig definitions and weights. Serialization is available through `HumanService.serialize_to_json_*`.

## Targets

Macro properties include `gender`, `age`, `muscle`, `weight`, `proportions`, `height`, `cupsize`, `firmness` and `race`. Values are generally in the 0.0–1.0 range.

```python
HumanObjectProperties.set_value("age", value, entity_reference=human)
TargetService.reapply_macro_details(human)
```

Individual targets:

```python
TargetService.load_target(blender_object, full_path, weight=0.0, name=None)
TargetService.set_target_value(
    blender_object, target_name, value, delete_target_on_zero=False
)
```

Target enumeration can use `LocationService.get_mpfb_data("targets") → target.json`. No dedicated `list_face_targets()` API was confirmed.

## AssetService

Relevant APIs:

```text
find_asset_absolute_path(...)
find_asset_files_matching_pattern(...)
get_asset_list(...)
get_asset_names_in_pack(...)
list_mhclo_assets(...)
list_mhmat_assets(...)
list_bvh_assets(...)
list_proxy_assets(...)
path_to_fragment(...)
update_asset_list(...)
update_all_asset_lists(...)
get_asset_roots(...)
```

### Path-resolution discrepancy

The 2.0.17 recon found that `list_mhmat_assets()` returned skin paths under `data/skins`, while `get_asset_roots()` reported only the configured clothes root. `find_asset_absolute_path(<skin filename>)` returned `None` for returned skin filenames.

Treat this as a runtime investigation target, not as an API contract.

## Clothing / MHCLO

MHCLO fitting is not simple nearest-vertex matching. A clothing vertex is represented through three basemesh vertices, barycentric weights and an offset.

```python
ClothesService.fit_clothes_to_human(
    clothes, basemesh, mhclo=None, set_parent=True
)
```

### MeshCrossRef

Import:

```python
from bl_ext.extensions_blender_org.mpfb.entities.meshcrossref import MeshCrossRef
```

Signature:

```python
MeshCrossRef(
    mesh_object,
    after_modifiers=True,
    build_faces_by_group_reference=False,
    cache_dir=None,
    write_cache=False,
    read_cache=False,
    world_coordinates=True,
)
```

### VertexMatch

Import:

```python
from bl_ext.extensions_blender_org.mpfb.entities.clothes.vertexmatch import VertexMatch
```

Signature:

```python
VertexMatch(
    focus_obj, focus_vert_index, focus_crossref,
    target_obj, target_crossref,
    scale_factor=1.0, reference_scale=None, allow_exact=True
)
```

Source defines fallback strategies including `EXACT`, `RIGID_GROUP`, `SIMPLE_FACE` and `EXTENDED_FACE`.

### Native Delete Groups

```python
ClothesService.create_new_delete_group(
    basemesh, clothes, mhclo, group_name="Delete"
)

ClothesService.update_delete_group(
    mhclo, basemesh,
    replace_delete_group=False,
    delete_group_name=None,
    add_modifier=True,
    skip_if_empty_delete_group=True,
)
```

MPFB2 therefore has a native Delete Group mechanism based on MHCLO data. `update_delete_group` can add a MASK modifier.

**Important:** Seedvale's `delete-outfit` scripts use `MeshCrossRef` / `VertexMatch` as a diagnostic/reconstruction path. Test the native `add_mhclo_asset()` + Delete Group pipeline before making the diagnostic path the final generator.

Clothing rigging also exposes `ClothesService.interpolate_weights(...)` and `ClothesService.set_up_rigging(...)`.

## GeneralObjectProperties

Import:

```python
from bl_ext.extensions_blender_org.mpfb.entities.objectproperties import GeneralObjectProperties
```

Relevant metadata includes `asset_source`, `object_type`, `uuid` and `scale_factor`. Seedvale already uses this MPFB2 property system.

## RigService

Relevant APIs include `RigService.identify_rig(...)` and `RigService.ensure_armature_modifier(...)`.

## MaterialService

Relevant APIs include `create_empty_material`, `create_v2_skin_material`, `delete_all_materials`, `assign_new_or_existing_material` and `identify_material`. Final GLB alpha behaviour remains a runtime verification target.

## ExportService

```python
ExportService.create_character_copy(...)
ExportService.bake_modifiers_remove_helpers(...)
```

`create_character_copy()` creates a deep character hierarchy copy and updates copied armature references.

```python
ExportService.bake_modifiers_remove_helpers(
    basemesh,
    bake_masks=False,
    bake_subdiv=False,
    remove_helpers=True,
    also_proxy=True,
)
```

This can bake MASK/SUBSURF and remove authoring helpers. MPFB2 also exposes `mpfb.export_copy`.

**Status:** researched from current source; not newly runtime-verified in the 2026-08-29 recon.

## Known discrepancies / verification targets

- `face-variants.py` has a comment saying `gender = 1.0` is female, while research/source says `0.0 → female` and `1.0 → male`. Verify runtime before changing it.
- Asset path resolution has the discrepancy described above.
- Native Delete Groups → Export Copy → GLB must be tested with actual Seedvale clothing.
- Hair/beard alpha requirements remain unverified.
- Mixamo website upload/download is not a confirmed MPFB2 API.
- Snap/Map to Mixamo was not located as a confirmed MPFB2 API.
