# Seedvale — MPFB2 Character Identification Heuristics

**Created:** 2026-08-29  
**Status:** `draft` ⚠️  
**Source:** `docs/tmp/blender/2026-08-29--001--mpfb2-character-structure-and-identification.json`

> These are draft heuristics from one runtime recon. They must be verified against multiple MPFB2 characters and assets before becoming identification rules.

## Goal

Replace hard-coded asset-name detection such as `"viking_pants" in obj.name` with reusable structural identification.

Preferred priority:

1. MPFB2 metadata, when reliably available
2. Character hierarchy and parent/child relationships
3. Blender object type
4. Armature/modifier relationships
5. Vertex-group structure
6. Materials and mesh characteristics
7. Asset name/keywords as fallback only

UUID is intentionally not considered a stable identifier.

## Observed hierarchy

The tested character had a structure equivalent to:

```text
Human.rig
├── Human
├── Human.short04
├── Human.grinsegold_moustache
├── Human.low-poly
├── Human.rehmanpolanski_viking_boots
├── Human.rehmanpolanski_viking_pants
└── Human.elvs_male_athletic_tank1

Human.rig_export_copy
├── Human_export_copy
└── ...
```

Exact names are observations, not rules.

## Draft: Rig

**Heuristic:**

```text
ARMATURE
+ belongs to character hierarchy
+ referenced by character mesh Armature modifiers
```

**Confidence:** Medium — TO VERIFY.

## Draft: Human / base mesh

Observed characteristics:

- MESH
- belongs to the character rig
- Armature modifier targets the character rig
- contains a large body/joint/helper vertex-group set
- is the primary body mesh

**Heuristic:**

```text
MESH
+ character hierarchy
+ character Armature modifier
+ characteristic MPFB2 human/body vertex groups
+ primary body mesh
```

**Confidence:** Medium — TO VERIFY.

The exact compact signature of the body vertex groups still needs to be established.

## Draft: Eyes

Observed:

- MESH
- character hierarchy
- rigged to the character
- predominantly/only Head-related weights
- separate mesh/material characteristics

**Heuristic:**

```text
MESH
+ character rig
+ Head-related weights
+ eye-specific mesh/material evidence
```

**Confidence:** Low/Medium — TO VERIFY.

Head weights alone are insufficient because hair, beard and headwear may also use them.

## Draft: Hair

Observed:

- MESH
- character hierarchy
- rigged to the character
- predominantly Head-related weights

**Heuristic:**

```text
MESH
+ character hierarchy
+ rig relationship
+ Head-related weights
+ hair-specific mesh/material evidence
```

**Confidence:** Low — TO VERIFY.

Need to compare several hair assets and bald/no-hair characters.

## Draft: Beard / moustache

Observed:

- separate MESH
- character hierarchy
- head-attached rigging

**Heuristic:**

```text
MESH
+ character hierarchy
+ head-related rigging
+ beard-specific mesh/material evidence
```

**Confidence:** Low — TO VERIFY.

Hierarchy alone cannot currently distinguish beard from hair, moustache or other head accessories.

## Draft: Clothes

Observed:

- MESH
- character hierarchy
- Armature modifier
- body/clothing-related vertex groups
- separate from Human base mesh

**Heuristic:**

```text
MESH
+ character rig
+ Armature modifier
+ NOT Human
+ NOT eyes/hair/beard
```

MPFB2 `object_type == Clothes` would be preferred if a reliable runtime access path is found.

**Confidence:** Medium — TO VERIFY.

## Draft: Clothing subcategories

Not established yet:

- pants
- shoes
- upper
- hat/accessory

Do not use concrete asset names as the primary classifier. Investigate body-region vertex groups, MHCLO information, materials, dimensions and other structural evidence.

**Confidence:** Not established.

## Draft: Export Copy

Observed Export Copy preserves the character hierarchy under a separate root, e.g. `Human.rig_export_copy`.

**Draft heuristic:**

Identify it from MPFB2 ExportService semantics and hierarchy/collection relationships. Treat `_export_copy` naming only as a fallback diagnostic clue.

**Confidence:** Medium — TO VERIFY.

## MPFB2 metadata observation

The recon attempted to read:

- `object_type`
- `asset_source`
- `scale_factor`

through the tested `GeneralObjectProperties` path. The resulting MPFB2 metadata was not populated for the relevant scene objects.

Therefore the future detector must not depend on these values being present on every object.

This does not prove that MPFB2 metadata is unavailable internally; the access path still needs investigation.

**Status:** Observed — TO INVESTIGATE.

## Do not use as primary identification

Avoid:

- concrete asset names
- UUIDs
- object names alone
- one vertex group such as `mixamorig:Head`
- material name alone

## Proposed detector architecture

```text
Scene
 ↓
Find character rig/root
 ↓
Collect character meshes
 ↓
Identify Human
 ↓
Classify remaining meshes
 ├── Eyes
 ├── Hair
 ├── Beard
 └── Clothes/accessories
      ├── Pants
      ├── Shoes
      ├── Upper
      └── Headwear
```

Use layered evidence and report ambiguity rather than silently selecting an object.

Conceptually:

```python
Candidate(
    object=obj,
    score=...,
    reasons=[
        "Armature modifier targets character rig",
        "matches human body vertex-group signature",
    ],
)
```

## Fallback strategy

```text
structural evidence
      ↓
strong confidence?
 ├─ yes → use result
 └─ no
      ↓
MPFB2/source metadata
      ↓
still ambiguous?
      ↓
asset-name fallback
      ↓
report ambiguity
```

## Runtime verification required

Test at minimum:

- three body variants
- low-poly eyes
- bald, short, medium and long hair
- multiple beard variants
- Viking pants
- both boot variants
- multiple upper garments
- Viking tunic
- headwear
- original character
- Export Copy
- post-bake/export preparation

Only reproducible rules should later be promoted to `docs/blender/VERIFIED/`.

## Related files

- `docs/blender/AUTOMATION_API_MAP.md`
- `docs/blender/MPFB2_REFERENCE.md`
- `docs/blender/MPFB2_RECIPES.md`
- `docs/blender/BLENDER_5_2_REFERENCE.md`
- `docs/tmp/blender/2026-08-29--001--mpfb2-character-structure-and-identification.json`
- `scripts/blender/`

**Zrób git commit i push do main, rebase jeżeli trzeba**
