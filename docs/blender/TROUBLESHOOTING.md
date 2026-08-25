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
