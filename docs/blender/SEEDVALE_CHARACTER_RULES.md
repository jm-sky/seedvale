# Seedvale Character Rules

This is the Seedvale contract layered above Blender and MPFB2.

## Separation of concerns

Seedvale simulation owns:

- NPC identity;
- sex/age/body intent;
- profession/social role;
- equipment semantics;
- deterministic appearance seed;
- references to the resulting asset.

Blender/MPFB2 owns:

- human mesh generation;
- appearance targets;
- hair/beard/clothing assets;
- rig generation;
- mesh processing;
- LOD construction;
- GLB export.

The simulation must not depend on MPFB2 object names or Blender scene structure.

## Character specification

The eventual generator input should be data-oriented and serializable, for example:

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

Use IDs for assets/professions rather than free-form Blender object names.

## Profession mapping

Profession determines an outfit/equipment specification. It should not directly manipulate Blender objects.

```text
profession
  -> Seedvale outfit profile
  -> asset IDs
  -> equipment IDs
  -> Blender/MPFB2 asset resolution
```

## Runtime constraints

The exact geometry budgets are intentionally not filled in here until measured against Seedvale's current rendering/runtime budget.

When established, record:

- LOD0 triangle target;
- LOD1 triangle target;
- LOD2 triangle target;
- maximum material slots;
- texture resolution policy;
- skeleton/bone contract;
- animation compatibility;
- hair policy;
- clothing policy.

Do not import arbitrary budgets from generic game-development tutorials.

## Export contract

A production character should have:

- a known runtime skeleton;
- only intended export meshes;
- intended materials/textures;
- no authoring helpers;
- validated transforms;
- deterministic asset identifiers/metadata;
- LODs when the profile requires them;
- a reproducible GLB export configuration.

## Quality gates

Before accepting an asset:

```text
character generated
  -> assets present
  -> clothing fitted/attached correctly
  -> rig valid
  -> geometry within profile
  -> materials within profile
  -> LODs valid
  -> GLB exported
  -> Seedvale import/runtime checked where visual correctness matters
```

## Versioning

Every verified asset-generation recipe should record:

- Blender version;
- MPFB2 version;
- relevant Seedvale helper version/commit;
- asset library/source version if applicable.
