# Blender / MPFB2 Troubleshooting

Only confirmed fixes should be marked `verified`. Until then, record symptoms and hypotheses without presenting them as facts.

## `set up rigging is enabled, but could not find a rig to attach to`

### Meaning

The operation expects an available/compatible rig but cannot find one in the current MPFB2/Blender state.

### Investigation

1. Inspect the character objects and armature objects.
2. Check whether a rig was actually generated.
3. Check the active character/root object.
4. Check whether the clothing/asset is an MPFB2 asset requiring MPFB2's fitting/rigging path.
5. Check the installed MPFB2 version and its current rig service implementation.
6. Reproduce with a minimal character before changing the pipeline.

Do not fix this by blindly parenting the clothing mesh to an armature.

**Status:** researched; exact Seedvale fix requires verification in the current installation.

## API mismatch from old tutorial

### Symptoms

A script references a service, operator or property that does not exist or behaves differently.

### Response

- inspect the installed MPFB2 source/API;
- check the Blender 5.2 API;
- prefer current script samples;
- update the recipe with the exact version tested.

Never patch around an API mismatch by guessing property names.

## Excessive polygon count

### Symptoms

A generated character is too expensive for Seedvale.

### Response

Measure the actual evaluated/export geometry first. Then identify the largest contributors:

- body mesh;
- hair;
- clothing;
- accessories;
- modifiers;
- duplicate/hidden meshes.

Apply a Seedvale optimization profile rather than a generic decimation ratio.

## GLB unexpectedly contains extra objects

### Response

Inspect the export collection and explicit glTF export selection. Do not rely on the current viewport selection or hidden state unless the export configuration intentionally uses it.

## Verification record

When a problem is solved, append:

```text
Problem:
Environment:
Cause:
Fix:
Verification:
Date:
Commit:
```
