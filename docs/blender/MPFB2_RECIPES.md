# MPFB2 Recipes

Recipes are repeatable procedures, not verification. Mark a recipe verified only after executing it in the target Blender/MPFB2 environment.

## Create character

```text
inspect scene + MPFB2 version
  -> isolated character context
  -> create human via supported MPFB2 API
  -> apply deterministic Seedvale spec
  -> add required assets
  -> create runtime rig
  -> validate
```

## Deterministic variation

```text
Seedvale NPC
  -> stable appearance seed/spec
  -> MPFB2 targets/randomization
  -> reproducible appearance
```

Do not rely on Blender global randomness or UI state.

## Add hair / beard / clothing

```text
resolve installed asset
  -> load asset
  -> use MPFB2 fitting/attachment mechanism
  -> verify generated objects
  -> verify rig compatibility
```

Do not assume display names are stable IDs. Resolve against the installed asset library.

## Profession outfit

Profession is resolved by Seedvale before Blender execution:

```text
profession
  -> outfit profile
  -> asset IDs
  -> equipment IDs
  -> MPFB2 asset resolution
```

Examples:

```text
hunter    -> hunter clothes + bow + knife
farmer    -> simple/work clothes + scythe
woodcutter -> work clothes + axe
```

Exact asset IDs belong to Seedvale data, not MPFB2 API code.

## Rig

```text
Seedvale runtime rig contract
  -> MPFB2-supported rig generation
  -> attached assets follow rig
  -> validate bones + skinning
```

Do not solve rigging errors with arbitrary parenting before inspecting the MPFB2 workflow.

## Optimize / LOD

```text
reproducible source
  -> remove authoring-only content
  -> simplify geometry/materials where justified
  -> create LODs
  -> validate each LOD
```

Use Seedvale optimization profiles, not generic tutorial ratios.

## Export GLB

```text
validate export collection
  -> explicit glTF settings
  -> export .glb
  -> inspect/import through Seedvale
```

Do not depend on current Blender UI export state.

## Batch

Use deterministic specs/seeds. Generate in controlled batches, validate every result and quarantine failures. Clean temporary data between characters where safe.

## Proposed helper API

```text
create_character(spec)
set_body(character, spec)
set_appearance(character, spec)
add_asset(character, asset)
equip_item(character, item)
setup_rig(character, rig)
optimize_character(character, profile)
create_lods(character, profile)
validate_character(character)
export_glb(character, export_spec)
```

These names are proposed interfaces, not existing APIs.
