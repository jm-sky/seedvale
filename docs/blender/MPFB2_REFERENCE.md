# MPFB2 Reference

**Target:** Blender 5.2 + current MPFB2 2.x.

## Mental model

MPFB2 is a Blender addon. Automate it through Blender Python and MPFB2's supported services/API.

Important service areas:

- `HumanService` — character/human operations.
- `AssetService` — asset discovery/loading.
- `TargetService` — body/phenotype/target operations.
- `MaterialService` — materials.
- `RigService` — rig generation.
- `ClothesService` — clothing operations.

Exact signatures are version-sensitive. Inspect the installed MPFB2 source/API before implementing production helpers.

## Assets

MPFB2 uses MakeHuman asset concepts and MHCLO-based fitting for clothing and related attached assets. Hair/clothes/body assets should use the supported asset/fitting path rather than arbitrary mesh parenting.

## Variation

MPFB2 supports controlled/random character generation and batch workflows. Seedvale should provide a deterministic character seed/specification so an NPC appearance can be reproduced.

## Rigging

Choose the runtime rig from the Seedvale animation/export contract. Do not assume an authoring rig is the correct runtime rig. Do not introduce Rigify unless there is a concrete Seedvale requirement and the MPFB2-supported workflow is understood.

## Version policy

Record the exact installed MPFB2 version in verified notes. At knowledge-base creation, **2.0.17** was the latest release and **2.0.18** was development work. Re-check before implementation.

## Official sources

- MPFB2 docs: https://static.makehumancommunity.org/mpfb/
- MPFB2 source: https://github.com/makehumancommunity/mpfb2
- MPFB2 script samples: https://github.com/makehumancommunity/mpfb2/tree/master/script_samples
