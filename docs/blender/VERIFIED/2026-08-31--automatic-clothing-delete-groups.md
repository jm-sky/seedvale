# Verified: Automatic Clothing Detection and Delete Groups

**Date:** 2026-08-31  
**Status:** `verified` ✅  
**Blender:** 5.2.0 LTS  
**MPFB2:** 2.0.17  
**Character:** Blacksmith test character  
**Scope:** Automatic clothing detection + existing Delete Group generation

## Purpose

Verify that a Seedvale character can be prepared without manually selecting clothing objects:

```text
Character rig
    ↓
Human detection
    ↓
Component detection
    ↓
CLOTHING candidates
    ↓
existing Seedvale Delete Group mechanism
    ↓
Delete.* vertex groups + inverted Mask modifiers
```

This test does not cover Decimate or Export Copy.

## Scene

Detected character:

- Rig: `Human.rig`
- Bones: 52
- Human: `Human`
- Meshes: 6

Detected components:

| Object | Component | Confidence |
|---|---|---|
| `Human` | HUMAN | HIGH |
| `Human.elvs_male_athletic_tank1` | CLOTHING | LOW |
| `Human.low-poly` | EYES | HIGH |
| `Human.rehmanpolanski_viking_boots` | CLOTHING | MEDIUM |
| `Human.rehmanpolanski_viking_pants` | CLOTHING | MEDIUM |
| `Human.wdg_scruffy_beard` | BEARD | MEDIUM |

The detector found all three clothing meshes automatically. No manual selection was required.

## Existing implementation used

The test deliberately reused the existing runtime-verified implementation in:

`scripts/blender/delete-outfit/seedvale_character_tools.py`

Function:

`create_delete_group_for_clothing(basemesh, clothes)`

The implementation uses MPFB2:

- `ClothesService`
- `VertexMatch`
- `MeshCrossRef`
- `GeneralObjectProperties`
- `ClothesService.create_new_delete_group()`

The probe did not duplicate this algorithm.

## Actual result

Three Delete Groups were created on `Human`:

- `Delete.elvs_male_athletic_tank1`
- `Delete.rehmanpolanski_viking_boots`
- `Delete.rehmanpolanski_viking_pants`

Three inverted Mask modifiers were created:

- `Delete.elvs_male_athletic_tank1 -> Delete.elvs_male_athletic_tank1`
- `Delete.rehmanpolanski_viking_boots -> Delete.rehmanpolanski_viking_boots`
- `Delete.rehmanpolanski_viking_pants -> Delete.rehmanpolanski_viking_pants`

Result:

```text
Delete.* groups: 3
Delete Mask modifiers: 3
```

## Performance observation

Runtime output showed vertex matching cost scales strongly with clothing vertex count.

Observed:

- Tank: 58,081 vertices → 6.9 s
- Boots: 3,196 vertices → 0.7 s
- Pants: 1,312 vertices → substantially less than the tank

The tank therefore represents the important performance case for future optimization.

## Verification status

### Verified

- Character rig detection.
- Human detection for this character.
- Automatic clothing detection for this character.
- No manual clothing selection required.
- Existing Delete Group generation works with automatically detected clothing.
- Delete Groups are created on the Human mesh.
- Inverted Mask modifiers are created for the generated groups.
- Existing vertex matching mechanism works on a 58k-vertex clothing mesh.

### Not verified by this test

- Detector robustness across different characters and asset combinations.
- Reliable clothing subcategory detection (pants / shoes / upper / headwear).
- Decimate before Delete Groups.
- Decimate after Delete Groups.
- Export Copy after generated Delete Groups.
- Delete Groups → Export Copy → Decimate → GLB.
- Final Seedvale GLB visual result.

## Important conclusion

The automatic clothing detection path is now runtime-verified for the Blacksmith test character.

The broader component-identification heuristics remain draft until tested against multiple characters/assets.

## Related files

- `scripts/blender/delete-outfit/seedvale_character_tools.py`
- `scripts/blender/probes/mpfb2-character-delete-groups-probe.py`
- `docs/blender/CHARACTER_IDENTIFICATION_HEURISTICS.md`
- `docs/blender/VERIFIED/README.md`
