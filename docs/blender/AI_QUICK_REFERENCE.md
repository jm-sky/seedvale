# Seedvale Blender AI Quick Reference

**Target:** Blender 5.2 + MPFB2 2.x.  
**Seedvale-tested MPFB2:** 2.0.17.

## Before doing anything

1. Inspect Blender and installed MPFB2 version.
2. Read the relevant recipe.
3. Check installed MPFB2 source/API for exact signatures.
4. Inspect the actual asset inventory.
5. Never assume object names, selection, active context or old tutorial APIs.
6. Treat `researched` and `verified` as different states.

## Architecture

```text
Seedvale character spec
  → Blender Python
  → MPFB2 services
  → validate
  → Export Copy
  → GLB
  → Seedvale validation
```

## Prefer

- MPFB2 native services/entities;
- direct `bpy.data` access;
- deterministic specs/seeds;
- isolated source/generated/export collections;
- explicit export settings;
- temporary copies for destructive preprocessing;
- validation before export.

## Avoid

- guessed MPFB2 APIs;
- UI automation where a supported API exists;
- arbitrary parenting as a clothing/rig solution;
- destructive edits to reusable source assets;
- generic polygon budgets;
- relying on Blender UI export state;
- claiming source research is runtime verification.

## Important native operations

```text
HumanService.create_human(...)
HumanService.add_mhclo_asset(...)
HumanService.set_character_skin(...)
HumanService.add_builtin_rig(..., "mixamo")
HumanService.refit(...)
ClothesService.fit_clothes_to_human(...)
ClothesService.update_delete_group(...)
ClothesService.create_new_delete_group(...)
ExportService.create_character_copy(...)
ExportService.bake_modifiers_remove_helpers(...)
bpy.ops.nla.bake(...)
bpy.ops.export_scene.gltf(...)
```

See `MPFB2_REFERENCE.md` for signatures and caveats.

## Verification

A verified procedure records:

- Blender version;
- MPFB2 version;
- Seedvale commit;
- exact procedure;
- expected and actual result;
- limitations.

Visual correctness of exported characters requires Seedvale/browser validation where applicable.

## When stuck

1. Read `TROUBLESHOOTING.md`.
2. Inspect installed MPFB2 source/API.
3. Check Blender 5.2 API.
4. Run a minimal isolated test.
5. Record the result before generalizing it.

Do not guess.
