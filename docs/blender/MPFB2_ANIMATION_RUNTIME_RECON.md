# MPFB2 Animation Runtime Recon

**Date:** 2026-08-29  
**Status:** `verified` ✅  
**Domain:** Blender / MPFB2 / Mixamo animation automation

## Purpose

Record runtime-verified behaviour of the MPFB2 → Mixamo animation workflow in Blender 5.2.

The raw runtime recon is:

`docs/tmp/blender/2026-08-29--002--seedvale_mpfb2_runtime_recon.json`

## Verified workflow

With an MPFB2 Human character and an imported Mixamo animation rig on the scene:

```
Human.rig
    +
Mixamo animation rig
        ↓
mpfb.map_mixamo()
        ↓
bpy.ops.nla.bake(...)
        ↓
Human.rig → Action
```

### Verified: Map to Mixamo

`bpy.ops.mpfb.map_mixamo()`

Observed result:

```
{'FINISHED'}
```

The operator added Mixamo-related bone constraints to the target rig.

The runtime emitted this warning:

> The source and destination rigs do not have exactly the same set of bones. This might cause issues when animating.

Despite the warning, the operation completed successfully and produced the expected mapping.

### Verified: NLA Bake

`bpy.ops.nla.bake(...)`

Observed result:

```
{'FINISHED'}
```

The bake was performed on `Human.rig`.

### Verified: Action on Human

After bake:

- target: `Human.rig`
- Action: `Action`
- frame range: `1–250`
- layers: `1`
- strips: `1`
- channelbags: `1`
- F-curves: `468`
- target pose-bone constraints: `0`

The animation remains on `Human.rig` after the imported Mixamo animation rig is removed.

## Current verified conclusion

The core automation step required by the Seedvale NPC animation workflow is runtime-verified:

**Map to Mixamo → Bake → Action on Human**

This is ready to be extracted into reusable automation code.

## Not yet verified

The following remain separate tasks:

- automatic animation import;
- deriving Action name from animation/file name;
- batch processing multiple animations;
- final GLB export with baked Actions;
- export-copy workflow;
- final material/mask preparation;
- Decimate modifier configuration.

## Future optimization: Decimate

At the final character preparation stage, add a Blender **Decimate** modifier to character meshes to reduce polygon count.

Current working target:

- Decimate ratio approximately **0.2–0.5**;
- apply to all relevant character parts;
- **exclude eyes**.

This is a planned optimization, not yet runtime-verified.

The exact ratio and whether every mesh type should use the same value must be tested on representative NPC variants before being fixed in automation.

## Evidence levels

- **Researched** — established from source/documentation.
- **Runtime-discovered** — observed in the current Blender runtime.
- **Verified** — actually executed in Blender and expected behaviour observed.
- **Draft / heuristic** — proposed behaviour requiring testing.

## Next step

Build the reusable single-animation processing function around the verified:

`map_mixamo → bake → Action`

flow before implementing batch processing.
