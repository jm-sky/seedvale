# MPFB2 Animation Runtime Recon

**Date:** 2026-08-29  
**Status:** `runtime-discovered` — not yet fully verified  
**Domain:** Blender / MPFB2 / Mixamo animation automation

## Purpose

Record runtime discoveries from the Blender 5.2 + MPFB2 recon so they are not lost between sessions.

The source of this document is the runtime recon generated from the actual Blender environment:

`docs/tmp/blender/2026-08-29--002--seedvale_mpfb2_runtime_recon.json`

This document intentionally distinguishes runtime discovery from successful execution.

## Runtime-discovered MPFB2 animation operators

The current runtime recon identified these MPFB2 operators as relevant to animation:

- `mpfb.load_animation`
- `mpfb.map_mixamo`
- `mpfb.repeat_animation`
- `mpfb.save_animation`

### Evidence level

**Runtime-discovered:** these operators were present in the current MPFB2 Blender runtime recon.

**Not yet verified:** this does not establish that we know their correct parameters, context requirements, execution behaviour, or suitability for batch automation.

## Relevant Blender animation API

The recon also identified these Blender-side APIs relevant to the intended pipeline:

- `bpy.ops.nla.bake`
- `bpy.data.actions`
- `bpy.types.Object.animation_data`
- `bpy.types.Action.fcurves`

These are the candidate building blocks for the post-mapping bake and Action handling.

## Intended automation flow

The immediate target is:

```
Mixamo animation
      ↓
MPFB2 load_animation
      ↓
MPFB2 map_mixamo
      ↓
Blender NLA bake
      ↓
Action
      ↓
rename / retain Action
```

The final reusable pipeline should eventually support batch processing of multiple Mixamo animations.

## What remains to verify

A small runtime test should establish:

1. how `mpfb.load_animation` is invoked and which parameters it requires;
2. how `mpfb.map_mixamo` is invoked and which parameters/context it requires;
3. whether mapping produces the expected animation on the Seedvale character rig;
4. how `bpy.ops.nla.bake` should be configured after mapping;
5. whether the resulting Action is suitable for export;
6. whether the complete sequence can be executed repeatedly for a batch of animations.

## Important evidence rule

Do not mark an operation as **Verified** merely because it appears in MPFB2 source code, documentation, or runtime introspection.

Use:

- **Researched** — established from source/documentation.
- **Runtime-discovered** — observed in the current Blender runtime.
- **Verified** — actually executed in Blender and the expected result was observed.
- **Draft / heuristic** — proposed behaviour that still requires testing.

## Recon limitation

The raw runtime recon is intentionally broad and should not become the working API reference by itself. The next step is a focused runtime execution test of the four MPFB2 animation operators and Blender bake API above.

## Next step

Create/run a small test script against the current Blender character and one imported Mixamo animation. Record the exact operator parameters, context requirements, execution result, generated Action(s), and any errors.

Do not build the complete NPC generator yet.
