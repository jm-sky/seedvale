# MPFB2 Asset Reference

**Target:** Blender 5.2 + MPFB2 2.0.17 (Seedvale recon).  
**Status:** researched unless explicitly verified.

This file preserves concrete asset names identified for the Seedvale NPC workflow. Asset availability is based on MakeHuman Community / MPFB2 asset recon; runtime fitting and visual suitability still require Blender verification.

## Skin

| Requested | Resolved asset | Type | Status |
|---|---|---|---|
| Caucasian middle aged male | `middleage_caucasian_male` | MHMAT | matched |
| Old Slavic male | `jartur69_old_slavic_male_with_genitals_and_beard` | MHMAT | matched, CC0 |
| Young Caucasian male | `young_caucasian_male` | MHMAT | matched |
| Young Caucasian female | `young_caucasian_female` | MHMAT | matched |

## Eyes

MPFB2 has an Eyes library:

- subdir: `eyes`
- type: `mhclo`
- object type: `Eyes`
- procedural eyes are also supported.
- `MPFB_RAND_eyes_mode = 'LOWPOLY'` exists.

Concrete Low Poly Eyes asset was **not identified** during the recon.

## Hair

Hair library:

- subdir: `hair`
- type: `mhclo`
- object type: `Hair`

Concrete candidates:

| Requested | Asset | Author | Status |
|---|---|---|---|
| short | `cortu_short_messy_hair` | Cortu | candidate |
| medium | `culturalibre_hair_02` | culturalibre | matched |
| long | `o4saken_long01` | punkduck | candidate |

Bald should normally be represented as **no hair asset**, not as a special asset.

## Beard / moustache

| Asset | Author | Pack | License | Status |
|---|---|---|---|---|
| `rehmanpolanski_moustache_viking` | RehmanPolanski | bodyparts05 | CC0 | matched |
| `culturalibre_faun_beard` | culturalibre | bodyparts05 | CC0 | matched |
| `wdg_scruffy_beard` | WDG | bodyparts05 | CC0 | matched |
| `elvs_scruffy_beard1` | Elvaerwyn | bodyparts06 | CC-BY | matched |
| `rehmanpolanski_beard_viking` | RehmanPolanski | bodyparts05 | CC0 | matched |
| `grinsegold_beard_sigmund_wip` | grinsegold | bodyparts05 | CC0 | matched |

MPFB2 asset pages may classify beard assets as **clothes** because they are MHCLO assets. Do not invent a separate Beard API; resolve/load them through the MHCLO asset workflow.

## Shoes

| Asset | Author | Pack | License | Status |
|---|---|---|---|---|
| `rehmanpolanski_viking_boots` | RehmanPolanski | suits02 | CC0 | matched |
| `culturalibre_male_boots` | culturalibre | shoes01 | CC0 | matched |

## Pants

| Asset | Author | Pack | License | Status |
|---|---|---|---|---|
| `rehmanpolanski_viking_pants` | RehmanPolanski | suits02 | CC0 | matched |

## Upper

| Requested | Asset | Author | Pack | License | Status |
|---|---|---|---|---|---|
| Viking tunic | `rehmanpolanski_viking_tunic` | RehmanPolanski | suits02 | CC0 | matched |
| Elves white shirt | — | — | — | — | exact name not found |
| Elves shirt | — | — | — | — | exact name not found |
| Boho top | `elvs_male_boho_top1` | Elvaerwyn | shirts02 | CC-BY | matched |
| Lace-up blouse | `punkduck_lace_up_blouse` | punkduck | shirts02 | CC-BY | matched |

## Hat

| Asset | Author | Pack | License | Status |
|---|---|---|---|---|
| `javherre_casco_caballero_templario_templar_knight_helmet` | javherre | hats02 | CC0 | matched |
| `culturalibre_cl_don_quixote_hat` | culturalibre | hats03 | CC-BY | matched |

## Current NPC outfit candidates

The current intended combinations are:

| Profession | Body | Hair / beard | Outfit |
|---|---|---|---|
| Blacksmith | Fat + Short | Bald + beard | boots + pants |
| Hunter | Tall + Thin | Hair + beard | boots + pants + upper |
| Lumberjack | Tall + Muscular | Hair + large beard | boots + pants + upper |
| Farmer | Tall + Thin | Hair | boots + pants + upper |

These are **Seedvale asset selections**, not MPFB2 API definitions.

## Asset discovery rules

Prefer resolving concrete assets against the installed MPFB2 inventory rather than hard-coding filesystem paths.

Useful APIs:

```python
AssetService.list_mhclo_assets(...)
AssetService.list_mhmat_assets(...)
AssetService.find_asset_absolute_path(...)
AssetService.get_asset_roots(...)
```

The 2.0.17 recon found a discrepancy where `list_mhmat_assets()` returned skin paths under `data/skins`, while `get_asset_roots()` reported only the configured clothes root and `find_asset_absolute_path(<skin filename>)` returned `None`. This requires runtime investigation.

## Sources

- MakeHuman Community Asset Library: https://static.makehumancommunity.org/assets/
- Existing Seedvale asset recon: `docs/research/2026-08-28--022--mpfb2-assets-recon.md`
- Seedvale MPFB2 scanner: `scripts/blender/mpfb2-scanner/`

No asset should be marked Seedvale-approved solely because it exists in the library. Fitting, alpha/material behaviour, rig compatibility and visual quality require Blender verification.
