# Blender / MPFB2 Troubleshooting

Only confirmed fixes are `verified`. Do not turn a hypothesis into a fix.

## `set up rigging is enabled, but could not find a rig to attach to`

Check in this order:

1. Is an armature actually present?
2. Is it the intended MPFB2 rig for this character?
3. Is the correct character/root active?
4. Is the asset an MPFB2 asset requiring its supported fitting/rigging path?
5. What does the installed MPFB2 `RigService`/asset code expect?

Do not blindly parent the mesh to an armature.

**Status:** researched; Seedvale fix not yet verified.

## Old tutorial/API mismatch

Symptoms: missing service/property/operator or different behaviour.

Action:

```text
installed MPFB2 source/API
  + Blender 5.2 API
  + current script samples
  -> determine actual API
```

Do not guess property/function names.

## Character too heavy

Measure evaluated/export geometry first. Check body, hair, clothing, accessories, modifiers and duplicate meshes. Then apply a Seedvale optimization profile.

Do not choose a generic decimation ratio before identifying the expensive components.

## UBC modular outfit/accessory exported without skinning

Observed 2026-09-17 while preparing custom Fantasy outfit parts in Blender 5.2:

- `male_blacksmith_outfit.glb` was about 63 MB;
- `male_leather_bracers.glb` was about 28 MB;
- `male_steel_bracers.glb` was about 60 MB;
- the Blender objects visibly had an `Armature` modifier, but exported meshes inspected with `gltf-transform inspect` did **not** contain `JOINTS_0` or `WEIGHTS_0`;
- therefore the GLBs were not usable by the current skinned UBC compose/runtime accessory path (`bindAccessoryToPlayerSkeleton` would skip them).

Large source size was mostly embedded 4K PNG textures, not mesh geometry. Example blacksmith source contained Peasant/Ranger 4096x4096 BaseColor/Normal/ORM textures; the mesh payload itself was comparatively small. Runtime optimization (`resize 512`, WebP, `gltfpack -cc -kn`) is expected to reduce texture size later, but it does not repair missing skinning.

Before recreating these assets, verify all of the following in Blender/export:

1. Mesh has the intended `Armature` modifier and its Object points to the UBC armature.
2. Mesh retains vertex groups/weights matching skeleton bone names.
3. Armature is included in the glTF export together with the selected mesh parts.
4. glTF export has Skinning enabled and does not bake away the rig.
5. After export, `gltf-transform inspect <file.glb>` shows `JOINTS_0` and `WEIGHTS_0` on skinned meshes and a skin in the asset.
6. Only then feed the source into the existing UBC compose/optimization pipeline.

The failed large GLBs were intentionally discarded and should not be treated as valid source/runtime assets.

**Status:** researched / unresolved. Export fix not yet verified.

## GLB contains unwanted objects

Check the export collection and explicit glTF export selection/settings. Do not depend on accidental viewport selection or hidden state.

## Verification record

```text
Problem:
Environment:
Cause:
Fix:
Verification:
Date:
Commit:
```
