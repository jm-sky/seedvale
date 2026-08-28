# MPFB2 2.0.17 — Asset Recon Results

**Date:** 2026-08-28
**Status:** `in progress`
**MPFB2:** 2.0.17

## 1. MPFB2 Installation

MPFB2 root:

`C:\Users\__USERNAME__\AppData\Roaming\Blender Foundation\Blender\5.2\extensions\extensions_blender_org\mpfb`

---

## 2. AssetService

Module:

`bl_ext.extensions_blender_org.mpfb.services.assetservice`

Class:

`AssetService`

Available methods:

- `alternative_material_tiles_for_asset`
- `alternative_materials_for_asset`
- `check_asset_pack_zip`
- `check_if_modern_makehuman_system_assets_installed`
- `find_asset_absolute_path`
- `find_asset_files_matching_pattern`
- `fix_and_extract_asset_pack_zip`
- `get_asset_list`
- `get_asset_names_in_pack`
- `get_asset_names_in_pack_pattern`
- `get_asset_roots`
- `list_bvh_assets`
- `list_ink_layer_assets`
- `list_mhclo_assets`
- `list_mhmat_assets`
- `list_proxy_assets`
- `path_to_fragment`
- `system_assets_pack_is_installed`
- `update_all_asset_lists`
- `update_asset_list`

---

## 3. Asset Roots

`AssetService.get_asset_roots()` returned:

`D:\Documents\Prywatne\MPFB\data\clothes`

Important observation:

The AssetService reports the `clothes` directory as the configured asset root, while the returned skin asset paths are under:

`D:\Documents\Prywatne\MPFB\data\skins`

---

## 4. Asset Library Structure

| Library | asset_subdir | asset_type | object_type |
|---|---|---|---|
| Topologies library | `proxymeshes` | `proxy` | Proxymeshes |
| Skins library | `skins` | `mhmat` | Material |
| Ink layers | `ink_layers` | `json` | Other |
| Eyes library | `eyes` | `mhclo` | Eyes |
| Eyebrows library | `eyebrows` | `mhclo` | Eyebrows |
| Eyelashes library | `eyelashes` | `mhclo` | Eyelashes |
| Hair library | `hair` | `mhclo` | Hair |
| Teeth library | `teeth` | `mhclo` | Teeth |
| Tongue library | `tongue` | `mhclo` | Tongue |
| Clothes library | `clothes` | `mhclo` | Clothes |
| Poses library | `poses` | `bvh` | Pose |

---

## 5. Asset Counts

### Skin / MHMat

`list_mhmat_assets()`

- type: `list`
- count: `23`

### MHCL0

`list_mhclo_assets()`

- type: `list`
- count: `121`

### Proxy

`list_proxy_assets()`

- type: `list`
- count: `7`

---

# 6. SKIN

## Caucasian Male

### Middle age

`D:/Documents/Prywatne/MPFB/data/skins/middleage_caucasian_male/middleage_caucasian_male.mhmat`

### Old

`D:/Documents/Prywatne/MPFB/data/skins/old_caucasian_male/old_caucasian_male.mhmat`

### Young

`D:/Documents/Prywatne/MPFB/data/skins/young_caucasian_male/young_caucasian_male.mhmat`

`D:/Documents/Prywatne/MPFB/data/skins/young_caucasian_male2/young_caucasian_male2.mhmat`

`D:/Documents/Prywatne/MPFB/data/skins/young_caucasian_male_special_suit/young_caucasian_male_special_suit.mhmat`

---

## Caucasian Female

### Middle age

`D:/Documents/Prywatne/MPFB/data/skins/middleage_caucasian_female/middleage_caucasian_female.mhmat`

### Old

`D:/Documents/Prywatne/MPFB/data/skins/old_caucasian_female/old_caucasian_female.mhmat`

### Young

`D:/Documents/Prywatne/MPFB/data/skins/young_caucasian_female/young_caucasian_female.mhmat`

`D:/Documents/Prywatne/MPFB/data/skins/young_caucasian_female2/young_caucasian_female2.mhmat`

`D:/Documents/Prywatne/MPFB/data/skins/young_caucasian_female_special_suit/young_caucasian_female_special_suit.mhmat`

---

# 7. EYES

## Asset Library definition

```text
Eyes library
asset_subdir = eyes
asset_type  = mhclo
object_type = Eyes
eye_overrides = True
```

## Low Poly

Randomization setting:

```text
MPFB_RAND_eyes_mode = 'LOWPOLY'
```

Direct AssetService matching:

```text
NOTHING MATCHED
```

Therefore:

- Low Poly mode exists.
- Concrete Low Poly Eyes `.mhclo` asset was not identified.

---

# 8. HAIR

## Asset Library definition

```text
Hair library
asset_subdir = hair
asset_type = mhclo
object_type = Hair
```

## Asset Library Hair

```text
NOTHING MATCHED
```

## Hair Proxy

```text
NOTHING MATCHED
```

Therefore:

- Hair Library exists.
- It uses `.mhclo`.
- No concrete Hair asset filename/path was identified.
- No concrete Hair proxy asset was identified.

---

# 9. MIXAMO RIG

## Rig

`C:\Users\__USERNAME__\AppData\Roaming\Blender Foundation\Blender\5.2\extensions\extensions_blender_org\mpfb\data\rigs\standard\rig.mixamo.json`

## Weights

`C:\Users\__USERNAME__\AppData\Roaming\Blender Foundation\Blender\5.2\extensions\extensions_blender_org\mpfb\data\rigs\standard\weights.mixamo.json`

Also available:

```text
data/rigs/standard/rig.mixamo_unity.json
data/rigs/standard/weights.mixamo_unity.json
```

Target:

```text
rig.mixamo.json
weights.mixamo.json
```

---

# 10. MPFB2 Settings

## Skin

```text
MPFB_ASLS_skin_type = 'MAKESKIN'
MPFB_FPR_override_skin_model = 'PRESET'
MPFB_NH_override_skin_model = 'PRESET'

MPFB_RAND_randomize_skin = True
MPFB_RAND_skin_type = 'MAKESKIN'
MPFB_RAND_skin_material_instances = False
MPFB_RAND_skin_fallback = True
MPFB_RAND_skin_include = ''
MPFB_RAND_skin_exclude = 'special_suit'
MPFB_RAND_skin_pack = ''
MPFB_RAND_asset_material_type = 'MAKESKIN'
```

## Eyes

```text
MPFB_ASLS_eyes_type = 'MAKESKIN'
MPFB_ASLS_procedural_eyes = True

MPFB_IP_procedural_eyes = True

MPFB_FPR_override_eyes_model = 'PRESET'
MPFB_NH_override_eyes_model = 'PRESET'

MPFB_RAND_eyes_material_type = 'MAKESKIN'
MPFB_RAND_eyes_mode = 'LOWPOLY'
MPFB_RAND_eyes_randomize_alt_materials = True
```

## Eye IK

```text
MPFB_SIK_eye_ik = True
MPFB_SIK_eye_parenting_strategy = 'HEAD'
```

## Hair

```text
MPFB_RAND_hair_randomize = True
MPFB_RAND_hair_fallback = True
MPFB_RAND_hair_match_gender = False
MPFB_RAND_hair_randomize_alt_materials = False

MPFB_RAND_hair_include = ''
MPFB_RAND_hair_exclude = ''
MPFB_RAND_hair_pack = ''
```

---

# 11. Relevant MPFB2 Files

## Eyes

```text
data/node_trees/procedural_eyes.json
data/settings/eye_settings.default.json

ui/apply_assets/assetlibrary/properties/eyes_type.json
ui/apply_assets/assetlibrary/properties/procedural_eyes.json

ui/new_human/importerpresets/properties/procedural_eyes.json
ui/new_human/newhuman/properties/override_eyes_model.json

ui/new_human/randomize/properties/eyes_material_type.json
ui/new_human/randomize/properties/eyes_mode.json
ui/new_human/randomize/properties/eyes_randomize_alt_materials.json

ui/rigging/standardrig/helperproperties/eye_ik.json
ui/rigging/standardrig/helperproperties/eye_parenting_strategy.json
ui/rigging/standardrig/rigproperties/eye_mode.json
```

---

# 12. Path Resolution

`list_mhmat_assets()` successfully returned full paths such as:

```text
D:/Documents/Prywatne/MPFB/data/skins/young_caucasian_male/young_caucasian_male.mhmat
```

However:

```text
find_asset_absolute_path("young_caucasian_male.mhmat")
```

returned:

```text
None
```

with warning:

```text
Tried to locate non-existing asset young_caucasian_male.mhmat
```

The same happened for the other returned skin filenames.

This indicates a discrepancy between:

```text
list_mhmat_assets()
```

and:

```text
find_asset_absolute_path()
```

---

# 13. Current Target Status

| Target | Status |
|---|---|
| Caucasian Male skin | FOUND |
| Caucasian Female skin | FOUND |
| Low Poly Eyes mode | FOUND |
| Concrete Low Poly Eyes asset | NOT FOUND |
| Mixamo rig | FOUND |
| Mixamo weights | FOUND |
| Hair Library | FOUND |
| Concrete Hair asset | NOT FOUND |
| Hair proxy asset | NOT FOUND |
| Scene modification | NONE |

---

# 14. Recommended Skin Candidates

Based purely on asset naming:

```text
young_caucasian_male.mhmat
young_caucasian_female.mhmat
```

Alternative variants exist:

```text
young_caucasian_male2.mhmat
young_caucasian_female2.mhmat
```

No visual-quality conclusion has been made from the recon alone.

---

# 15. Explicitly Excluded

```text
generated hair
Hair Editor
makeup
makeweight
New Human
developer tools
```

---

# 16. Final Recon Conclusion

Confirmed:

```text
SKIN
  Caucasian Male     ✅
  Caucasian Female   ✅

EYES
  Low Poly mode      ✅
  Asset              ⚠️ not identified

RIG
  Mixamo             ✅
  Weights            ✅

HAIR
  Asset Library      ✅ library exists
  MHCL0 asset        ⚠️ not identified
  Proxy              ⚠️ not identified
```

## Main unresolved issue

`AssetService.get_asset_roots()` returns only:

```text
D:\Documents\Prywatne\MPFB\data\clothes
```

while `list_mhmat_assets()` returns assets from:

```text
D:\Documents\Prywatne\MPFB\data\skins
```

and `find_asset_absolute_path()` cannot resolve those assets.

This discrepancy is currently the most important lead for discovering the actual Eyes and Hair assets.

All recon operations were READ ONLY.
No scene modifications were performed.
