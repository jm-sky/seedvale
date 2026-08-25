# Seedvale Blender AI Quick Reference

**Target:** Blender 5.2 + current MPFB2 2.x.

## Before doing anything

1. Inspect the Blender scene and installed MPFB2 version.
2. Inspect the relevant Seedvale recipe/rule.
3. Check the installed MPFB2 source/API for exact signatures.
4. Never assume object names, selection, active context or old tutorial APIs.

## Architecture

```text
Seedvale NPC spec
  -> Blender MCP
  -> Blender 5.2 / bpy
  -> MPFB2
  -> Seedvale helpers
  -> validate
  -> LOD / optimize
  -> GLB
```

Blender MCP is only the control/transport layer. MPFB2 is a Blender addon; use its Python API/services rather than inventing an MPFB2-specific MCP layer.

## Prefer

- direct `bpy.data` / datablock access;
- MPFB2 services/API;
- Seedvale helpers;
- deterministic character seeds;
- isolated source/generated/export collections;
- explicit export settings;
- validation before export.

## Avoid

- UI automation when an API exists;
- guessed MPFB2 properties/functions;
- arbitrary parenting as a clothing/rig fix;
- destructive edits to reusable source characters;
- generic polygon budgets copied from tutorials;
- exporting based on accidental UI state;
- claiming documentation is verification.

## MPFB2 mental model

Useful service areas:

`HumanService` · `AssetService` · `TargetService` · `MaterialService` · `RigService` · `ClothesService`

MHCLO-based assets are central to the MPFB2 asset workflow. Hair/clothes/body assets should use the supported asset/fitting mechanism.

MPFB2 supports controlled/random character generation and batch workflows. Seedvale should provide a deterministic seed/specification so appearance can be reproduced.

## Character pipeline

```text
spec
 -> human/body/appearance
 -> hair/beard/clothing assets
 -> equipment
 -> game/runtime rig
 -> optimize
 -> LODs
 -> validate
 -> GLB
```

## Verification

`researched` != `verified`.

A verified procedure records:

- Blender version;
- MPFB2 version;
- Seedvale commit;
- exact procedure/result.

Visual correctness of exported characters requires Seedvale/browser verification where applicable.

## When stuck

Search `TROUBLESHOOTING.md`, then inspect the installed MPFB2 source/API and Blender 5.2 API. Do not guess.
