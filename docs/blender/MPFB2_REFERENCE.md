# MPFB2 Reference

**Target:** current MPFB2 2.x with Blender 5.2.

## Architecture

MPFB2 is a Blender addon. Automation should therefore happen through Blender Python and MPFB2's own services/API where possible.

Important service concepts documented by MPFB2 include:

- `HumanService` — human/character operations.
- `AssetService` — asset discovery/management.
- `MaterialService` — materials and skin/material operations.
- `TargetService` — body/phenotype/target operations.
- `RigService` — rig creation and rig-related operations.
- `ClothesService` — clothing and related asset operations.

Exact callable names and signatures must be checked against the installed MPFB2 version/source before writing production helpers. Do not infer an API signature from an old tutorial.

## Asset model

MPFB2 uses MakeHuman asset concepts for character components. Clothes and several body/appearance components are handled through the MHCLO asset mechanism. Hair, clothes and other attached assets should therefore be treated as assets with a common discovery/attachment pipeline where appropriate, rather than inventing unrelated mechanisms for every asset type.

## Character variation

Current MPFB2 supports controlled character randomization and batch generation. Random generation can be seed-based and can cover areas such as phenotype, details, skin, hair, body parts and clothing.

For Seedvale, prefer deterministic generation from a Seedvale character seed/specification. This allows the same NPC appearance to be reproduced after regeneration.

## Rigging

MPFB2 provides multiple rig options. A game-oriented rig is relevant to export pipelines. Do not assume that a rig used for authoring/control is automatically the best runtime skeleton for Seedvale.

Rig choice must ultimately be driven by the Seedvale animation/export contract.

Do not automatically introduce Rigify. If Rigify is used, follow MPFB2's supported generation path so equipped/attached assets remain compatible.

## Clothing and attached assets

Clothing should be treated as part of the character asset pipeline:

```text
character
  -> asset selection
  -> asset loading
  -> fitting/attachment
  -> material handling
  -> rig compatibility
  -> validation
```

Do not assume that simply parenting an arbitrary mesh to the armature is equivalent to fitting an MPFB2 clothing asset.

## Source-code rule

When an operation matters to the production pipeline, inspect the installed MPFB2 source or current official documentation first. MPFB2 internals and examples can change between releases.

## Current version policy

Record the exact MPFB2 version in verified notes. At the time this knowledge base was prepared, MPFB2 2.0.17 was the current released version and 2.0.18 was development work. Re-check before implementing against the addon.

## Sources

- MPFB2 documentation: https://static.makehumancommunity.org/mpfb/
- MPFB2 source: https://github.com/makehumancommunity/mpfb2
- MPFB2 script samples: https://github.com/makehumancommunity/mpfb2/tree/master/script_samples
