# Seedvale Character Rules

This is the contract between Seedvale simulation and the Blender/MPFB2 asset pipeline.

## Ownership

Seedvale owns:

- NPC identity;
- sex/age/body intent;
- profession/social role;
- equipment semantics;
- deterministic appearance seed;
- resulting asset reference.

Blender/MPFB2 owns:

- mesh/appearance generation;
- hair, beard and clothing assets;
- rig generation;
- mesh optimization;
- LOD construction;
- GLB export.

Simulation code must not depend on Blender object names or scene structure.

## Character spec

The generator input should be serializable and use stable IDs:

```text
sex
age
height
body_type
appearance
hair
beard
clothing
profession
equipment[]
seed
```

Asset/profession/equipment IDs are data. Blender object names are implementation details.

## Profession mapping

```text
profession
  -> outfit profile
  -> asset IDs
  -> equipment IDs
  -> Blender/MPFB2 asset resolution
```

## Runtime budgets

Do not invent these values yet. Fill them only after measuring Seedvale runtime needs:

```text
LOD0 tris = TBD
LOD1 tris = TBD
LOD2 tris = TBD
max material slots = TBD
texture policy = TBD
runtime skeleton = TBD
hair policy = TBD
clothing policy = TBD
```

Never copy generic budgets from tutorials.

## Export quality gate

```text
character generated
  -> required assets present
  -> clothing/assets correctly fitted
  -> rig + skinning valid
  -> geometry within profile
  -> materials/textures within profile
  -> LODs valid
  -> explicit GLB export
  -> Seedvale import/runtime verified when visual correctness matters
```

## Reproducibility

Verified procedures record:

- Blender version;
- MPFB2 version;
- Seedvale commit;
- relevant asset library/source version;
- procedure/result.
