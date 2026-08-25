# Blender 5.2 Reference

**Target:** Blender 5.2.

## API rules

- Use the Blender 5.2 Python API as the API truth.
- Do not copy Python calls from older tutorials without checking 5.2.
- Prefer direct `bpy.data`/datablock access.
- Use `bpy.ops` only when needed; explicitly establish active object, selection and mode/context.
- Scope operations to the intended character/collection; avoid broad scene-wide operations.

## Scene safety

Before destructive work:

```text
identify source/generated/export collections
  -> verify active scene/view layer
  -> isolate intended objects
  -> operate
  -> validate
```

## Geometry validation

Validate the actual intended export/evaluated geometry when relevant:

- mesh/object count;
- triangle count;
- material slots;
- textures/images;
- armature/skinning;
- transforms;
- unexpected modifiers;
- unintended export objects.

Do not use viewport statistics as the only source when evaluated/export geometry matters.

## GLB

Use Blender's glTF 2.0 exporter for Seedvale unless a tested pipeline requires another route. Configure export settings explicitly.

Blender 5.2's glTF tooling exposes gltfpack-related optimization/simplification options. Test their effect on Seedvale output before making them part of the standard profile.

Visual export correctness must be checked through the actual Seedvale import/runtime path.

## LOD / optimization

Do not copy generic polygon targets from tutorials. Seedvale budgets belong in `SEEDVALE_CHARACTER_RULES.md` and must be based on measured runtime needs.

Remove authoring-only objects, unnecessary materials/textures and unnecessary modifiers from export assets.

## Sources

- Blender 5.2 API: https://docs.blender.org/api/5.2/
- Blender 5.2 glTF manual: https://docs.blender.org/manual/en/5.2/addons/import_export/scene_gltf2.html
