# Medieval Village MegaKit — parked assets

Full **Quaternius Medieval Village MegaKit (Standard / free)** converted to optimized `.glb` (textures 512 WebP + `gltfpack -cc`).

**Licencja:** CC0 1.0 — [docs/assets/quaternius-medieval-village-megakit-license.txt](../../../docs/assets/quaternius-medieval-village-megakit-license.txt). Standard = wycinek PRO/SOURCE; 176 glTF z paczki jest w całości tutaj.

**Status:** parked / not wired into settlement generation. `wagon.glb` is used by home Kupiec (`src/settlement/props.ts`). Everything else: load via `loadGltf` when needed.

**Uwaga:** kit jest **modularny** (ściany / dachy / drzwi / okna), nie gotowe `House_*.glb`.

Source pack (local, not in git): `seedvale/_temp/Models/Medieval Village MegaKit - Standard/`.

## Counts (176)

| Prefix / role | n | Example |
|---------------|---|---------|
| `roof_*` | 39 | `roof_wooden_2x1.glb`, `roof_roundtiles_4x4.glb` |
| `wall_*` | 20 | `wall_plaster_straight.glb`, `wall_plaster_door_flat.glb` |
| `overhang_*` | 20 | `overhang_plaster_long.glb` |
| `stairs_*` / `stair_*` | 19 | `stairs_exterior.glb` |
| `floor_*` | 12 | `floor_wooddark.glb` |
| `windowshutters_*` | 8 | `windowshutters_wide_flat_open.glb` |
| `door_*` | 8 | `door_1_flat.glb` (leaf, not wall) |
| `corner_*` | 8 | `corner_exterior_wood.glb` |
| `window_*` | 6 | `window_wide_flat1.glb` |
| `doorframe_*` | 4 | `doorframe_flat_wooddark.glb` |
| fences / props / vines / chimney / crate / wagon / support / border / balcony / holecover | rest | see filenames |

Native wall module (measured): **2.00 × 3.12 × 0.41 m** for plaster/brick straight and doorway walls.

## Legacy filenames (first 19, do not rename)

These keep the names from the original parked set so `wagon.glb` and docs stay stable:

| File | Source glTF |
|------|-------------|
| `fence_wood_single.glb` | `Prop_WoodenFence_Single` |
| `fence_wood_ext1.glb` | `Prop_WoodenFence_Extension1` |
| `fence_wood_ext2.glb` | `Prop_WoodenFence_Extension2` |
| `fence_metal_simple.glb` | `Prop_MetalFence_Simple` |
| `fence_metal_ornament.glb` | `Prop_MetalFence_Ornament` |
| `wagon.glb` | `Prop_Wagon` |
| `crate.glb` | `Prop_Crate` |
| `chimney.glb` | `Prop_Chimney` |
| `chimney_2.glb` | `Prop_Chimney2` |
| `support.glb` | `Prop_Support` |
| `vine_1.glb` | `Prop_Vine1` |
| `vine_6.glb` | `Prop_Vine6` |
| `border_straight.glb` | `Prop_ExteriorBorder_Straight1` |
| `wall_arch.glb` | `Wall_Arch` |
| `wall_brick_straight.glb` | `Wall_UnevenBrick_Straight` |
| `wall_brick_door.glb` | `Wall_UnevenBrick_Door_Round` |
| `wall_plaster_straight.glb` | `Wall_Plaster_Straight` |
| `wall_plaster_door.glb` | `Wall_Plaster_Door_Round` |
| `stairs_exterior.glb` | `Stairs_Exterior_Straight` |

All other files are `SourceName.toLowerCase() + '.glb'` (`Wall_Plaster_Door_Flat` → `wall_plaster_door_flat.glb`).

## Plaster cottage (case study)

Minimal set to assemble one tynkowany domek (not wired):

- walls: `wall_plaster_straight`, `wall_plaster_straight_l` / `_r`, or `corner_exterior_wood`
- door opening: `wall_plaster_door_flat`
- frame + leaf: `doorframe_flat_wooddark`, `door_1_flat`
- window: `wall_plaster_window_wide_flat` + `window_wide_flat1` (+ optional shutters)
- floor: `floor_wooddark`
- roof: `roof_wooden_2x1` + `_l` / `_r` / `_corner` / `_middle`
- chimney: `chimney`
- trim: `border_straight`, `prop_exteriorborder_corner`
