# MPFB2 Recipes

These recipes describe intended repeatable operations. A recipe is not `verified` until tested in the target Blender/MPFB2 installation.

## Create a character

```text
1. Inspect the current scene and installed MPFB2 version.
2. Create/select an isolated character context.
3. Create the MPFB2 human through its supported API/service.
4. Apply deterministic Seedvale parameters.
5. Apply appearance/body targets.
6. Add required assets.
7. Create the selected game rig.
8. Validate.
```

## Deterministic variation

Use a Seedvale character seed as the stable input. Avoid relying on Blender global randomness or UI state.

```text
Seedvale NPC identity
  -> stable appearance seed
  -> MPFB2 random/target parameters
  -> deterministic generated appearance
```

## Add hair / beard / clothing

Treat these as MPFB2 assets where supported:

```text
resolve asset
  -> load asset
  -> attach/fitting operation
  -> verify generated object(s)
  -> verify rig compatibility
```

Do not assume an asset's display name is a stable internal identifier. Resolve against the installed asset library and record the selected asset path/id in generated metadata.

## Profession outfit

Seedvale should resolve profession to an asset specification before Blender execution:

```text
hunter
  -> clothing: hunter set
  -> equipment: bow + knife

farmer
  -> clothing: simple/work set
  -> equipment: scythe

woodcutter
  -> clothing: work set
  -> equipment: axe
```

The exact asset names are data, not hard-coded MPFB2 API semantics.

## Optimize

Recommended order:

```text
remove unused authoring objects
  -> consolidate/remove unnecessary materials
  -> apply justified modifiers
  -> simplify geometry
  -> create LODs
  -> validate each LOD
```

Never optimize before establishing a reproducible source character. Keep the source and export representations distinguishable.

## Rig

```text
select game/runtime rig contract
  -> generate through MPFB2-supported path
  -> ensure attached assets follow the rig
  -> validate bone hierarchy
  -> validate skinning
```

Do not solve rigging errors by arbitrary parenting until the MPFB2 rig/asset mechanism has been inspected.

## Export GLB

```text
validate source/export collection
  -> select intended export objects
  -> configure glTF exporter explicitly
  -> export .glb
  -> inspect file/import in Seedvale
```

Export settings must be explicit in the helper. Do not depend on whatever settings happen to be active in the Blender UI.

## Batch generation

For batches:

1. use a deterministic list of character specifications/seeds;
2. create one isolated character at a time or use a controlled MPFB2 batch mechanism;
3. validate each result;
4. write a per-character result record;
5. stop or quarantine failures instead of silently exporting broken characters;
6. clean temporary Blender data between characters when safe.

## Planned Seedvale helper layer

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

These are proposed interfaces only. Implement them after inspecting the installed MPFB2 API and testing the required operations.
