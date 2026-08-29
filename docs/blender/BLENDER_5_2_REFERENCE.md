# Blender 5.2 Reference

**Target:** Blender 5.2.

Recon findings are `researched` unless explicitly marked verified.

## API rules

- Use the Blender 5.2 Python API as truth.
- Prefer direct `bpy.data` / datablock access.
- Use `bpy.ops` only where necessary and establish context explicitly.
- Scope operations to the intended character/collection.
- Do not copy older tutorial calls without checking Blender 5.2.

## Useful datablocks

```python
bpy.data.objects
bpy.data.meshes
bpy.data.materials
bpy.data.armatures
bpy.data.actions
bpy.data.collections
```

## Animation baking

Blender 5.2 exposes:

```python
bpy.ops.nla.bake(
    frame_start=1,
    frame_end=250,
    step=1,
    only_selected=True,
    visual_keying=False,
    clear_constraints=False,
    clear_parents=False,
    use_current_action=False,
    clean_curves=False,
    bake_types={'POSE'},
)
```

Exact context, selection and channel settings depend on the actual animation. Status: researched.

## GLB / glTF export

Use:

```python
bpy.ops.export_scene.gltf(...)
```

Relevant options include `export_format`, `export_animations`, `export_skins`, `export_morph`, `export_morph_animation`, `export_materials`, `export_image_format`, `use_selection`, `use_visible`, `collection`, `export_yup`, `export_use_gltfpack`, `export_meshopt_compression_enable` and `export_draco_mesh_compression_enable`.

The exporter is independent of MPFB2. A likely deterministic pipeline is:

```text
MPFB2 character
→ Export Copy
→ bake/remove helpers
→ validate
→ bpy.ops.export_scene.gltf(...)
```

## Alpha / materials

glTF alpha behaviour depends on the exported material/node graph. Do not assume a Blender viewport/render setting alone determines correct GLB output.

```text
Opaque material → OPAQUE
Real alpha material → MASK or BLEND as appropriate
```

The current Seedvale alpha workaround is diagnostic, not a confirmed universal rule.

## Scene and geometry safety

Before destructive work:

```text
identify source/generated/export collections
→ verify active scene/view layer
→ isolate intended objects
→ operate
→ validate
```

Validate where relevant:

- object/mesh count;
- evaluated triangle count;
- material slots;
- textures/images;
- armature/skinning;
- transforms;
- remaining modifiers;
- unintended export objects.

## Sources

- Blender 5.2 API: https://docs.blender.org/api/5.2/
- Blender 5.2 glTF manual: https://docs.blender.org/manual/en/5.2/addons/import_export/scene_gltf2.html
