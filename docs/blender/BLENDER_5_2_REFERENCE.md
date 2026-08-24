# Blender 5.2 Reference

## API policy

Target Blender 5.2. Use the official Blender 5.2 Python API documentation for exact signatures and behaviour.

Do not copy API calls from tutorials written for older Blender versions without checking them against Blender 5.2.

## Automation

Prefer direct data/API access over UI automation:

- inspect `bpy.data` collections, objects, meshes, materials and armatures;
- manipulate datablocks directly when possible;
- use operators (`bpy.ops`) only when the operation is inherently operator-driven or the data API does not provide a suitable operation;
- when using an operator, establish the required active object, selection and mode explicitly.

## Scene safety

Before destructive operations:

1. identify the character/root collection;
2. identify source vs generated/export objects;
3. verify the active scene/view layer;
4. isolate the intended objects;
5. perform the operation;
6. validate the result.

Do not use broad scene-wide operations when a collection/object-scoped operation is sufficient.

## Geometry validation

For each generated character, inspect at minimum:

- object count;
- mesh count;
- triangle count;
- material count;
- image/texture references;
- armature presence;
- object transforms;
- unapplied or unexpected modifiers;
- hidden render/export objects;
- orphaned temporary data where relevant.

Triangle counts should be measured from the actual evaluated/export geometry when the distinction matters; do not rely only on viewport statistics.

## glTF / GLB

Blender's glTF 2.0 exporter is the preferred route for Seedvale GLB export unless a concrete pipeline test proves another route better.

The exporter supports meshes, materials, skinning and animation. Blender's current glTF tooling also exposes gltfpack-related optimization options.

Export validation must check the resulting GLB in the actual Seedvale import/runtime path when visual correctness matters.

## LOD

Do not hard-code generic polygon targets from external tutorials. Seedvale LOD targets belong in `SEEDVALE_CHARACTER_RULES.md` and should be based on actual runtime budgets.

Keep LOD generation reproducible and name/organize LOD variants explicitly.

## Performance

Prefer a small number of optimized materials and meshes. Avoid carrying authoring-only objects, unused accessories, hidden helper meshes, excessive texture variants or unnecessary modifiers into exported assets.

## Sources

- Blender Python API: https://docs.blender.org/api/5.2/
- Blender glTF exporter documentation: https://docs.blender.org/manual/en/5.2/addons/import_export/scene_gltf2.html
