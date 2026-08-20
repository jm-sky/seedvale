# Local Assets Inventory

> **Local staging inventory — not runtime assets**

This document describes assets currently available locally under `_temp/`.

`_temp/` is intentionally excluded from Git and is **not used by the game runtime**.

Runtime assets live under:

```text
public/models/
├── characters/
├── fauna/
├── fx/
├── items/
├── nature/
├── parked/
├── settlement/
└── world/
```

The normal asset flow is:

```text
_temp/ → inspect/select → convert/optimize → public/models/ → wire into game
```

Typical conversion/optimization:

```text
FBX → GLB
gltf-transform
gltfpack -cc
```

Credits and runtime model documentation:

* `docs/assets/CREDITS.md`
* `docs/assets/MODELS.md`

## Asset staging structure

| Directory           | Purpose                                                         |
| ------------------- | --------------------------------------------------------------- |
| `_temp/nature/`     | Flora, trees, grass, rocks, paths and other loose nature assets |
| `_temp/settlement/` | Buildings, village clutter, fireplaces, graves, crops           |
| `_temp/items/`      | Tools, weapons and held props                                   |
| `_temp/fauna/`      | Animals and wildlife                                            |
| `_temp/fx/`         | VFX and temporary/harvest remains                               |
| `_temp/people/`     | Character bases, outfits and low-poly NPC models                |
| `_temp/packs/`      | Complete downloaded asset packs; keep each pack together        |
| `_temp/animations/` | Animation sources, primarily Mixamo FBX files                   |

`characters/` and `world/` are currently not represented as loose `_temp` categories.

## Rules for agents

1. Look for loose assets in the relevant category first.
2. Search complete packs only when the loose categories do not contain a suitable asset.
3. Do **not** redistribute files from a pack across categories.
4. Keep downloaded packs intact.
5. Do not modify the original layout inside `packs/` or `people/`.
6. Do not wire runtime code directly to `_temp/`.
7. Before adding an asset to runtime, check its license/source and update `CREDITS.md` / `MODELS.md`.
8. Preserve original filenames where practical. Names such as `Title by Author - hash.glb` may identify the source asset.

## Where to look

| Asset type               | First places to search                                                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Characters**           | `people/`; animation sources in `packs/Universal Animation Library[Standard]/` and `packs/Universal Animation Library 2[Standard]/`                   |
| **Weapons**              | `items/`; `packs/50-swords/`; `packs/Medieval Weapons Pack by Quaternius/`; `packs/Ultimate RPG Pack/`                                                |
| **Animals**              | `fauna/`; `packs/Farm Animals Animated by Quaternius/`; `packs/Cute Fish Pack/`                                                                       |
| **Buildings**            | `settlement/`; `packs/ultimate-fantasy-rts/`; `packs/Medieval Village MegaKit[Standard]/`                                                             |
| **Plants**               | `nature/`; `settlement/`; `packs/ultimate-stylized-nature/`; `packs/Ultimate Nature Pack by Quaternius/`; `packs/Textured Stylized Trees - May 2020/` |
| **Rocks / nature props** | `nature/`; `packs/ultimate-stylized-nature/`; `packs/ultimate-fantasy-rts/`                                                                           |
| **Props / furniture**    | `items/`; `settlement/`; `packs/fantasy-props-megakit/`; `packs/Food Pack/`; `packs/Furniture Pack/`; `packs/Ultimate RPG Pack/`                      |
| **VFX / remains**        | `fx/`                                                                                                                                                 |

## Known packs

| Directory                                        | Source / contents                             |
| ------------------------------------------------ | --------------------------------------------- |
| `packs/50-swords/`                               | 50 sword set                                  |
| `packs/ultimate-fantasy-rts/`                    | Ultimate Fantasy RTS — Quaternius             |
| `packs/ultimate-stylized-nature/`                | Ultimate Stylized Nature — Quaternius         |
| `packs/fantasy-props-megakit/`                   | Fantasy Props MegaKit                         |
| `packs/Medieval Village MegaKit[Standard]/`      | Medieval Village MegaKit                      |
| `packs/Ultimate Nature Pack by Quaternius/`      | Quaternius                                    |
| `packs/Universal Animation Library[Standard]/`   | Quaternius                                    |
| `packs/Universal Animation Library 2[Standard]/` | Quaternius                                    |
| `packs/Farm Animals Animated by Quaternius/`     | Quaternius                                    |
| `packs/Textured Stylized Trees - May 2020/`      | Quaternius                                    |
| `packs/Medieval Weapons Pack by Quaternius/`     | Quaternius                                    |
| `packs/Cute Fish Pack/`                          | Quaternius — fish, docks, boats, fishing rods |
| `packs/Food Pack/`                               | Quaternius — food and dishes                  |
| `packs/Furniture Pack/`                          | Quaternius — furniture                        |
| `packs/Ultimate RPG Pack/`                       | Quaternius — RPG props, loot, weapons, armour |

## Character assets

| Directory                                               | Source / contents                                       |
| ------------------------------------------------------- | ------------------------------------------------------- |
| `people/Free Medieval 3D People Low Poly Pack/`         | Low-poly NPC models                                     |
| `people/Modular Character Outfits - Fantasy[Standard]/` | Quaternius — peasant/ranger, male/female, modular parts |
| `people/Universal Base Characters[Standard]/`           | Quaternius — base characters and hairstyles             |

Character animations are kept separately in the animation packs.

## Runtime candidates

Assets selected for actual game use should eventually be copied or converted into `public/models/`.

Examples:

```text
_temp/items/...
    ↓
public/models/items/...
```

or:

```text
_temp/packs/<pack>/...
    ↓
select asset
    ↓
convert/optimize
    ↓
public/models/<category>/...
```

The original staging asset should remain untouched.

## Special notes

### M15 fishing rod

Current known asset:

```text
_temp/items/FishingRod_Lvl2.fbx
```

There is also a copy under:

```text
public/models/parked/
```

Before wiring the staging version into runtime:

* convert FBX → GLB if appropriate,
* verify the asset license/source,
* update `docs/assets/CREDITS.md`,
* update `docs/assets/MODELS.md` if it becomes a runtime model.

---

<!-- BEGIN GENERATED ASSET REPORT -->

> Generated: 2026-08-20T11:25:43.228Z
> Do not edit this section manually.

### Summary

- Total files: **6,672**
- Total size: **4.04 GiB**
- Categories: **0**

### File types

| Extension  | Files |
|------------|------:|
| `.wav`     | 2,424 |
| `.fbx`     |   998 |
| `.mtl`     |   496 |
| `.obj`     |   496 |
| `.gltf`    |   477 |
| `.png`     |   387 |
| `.blend`   |   227 |
| `.ogg`     |   141 |
| `.glb`     |    99 |
| `.jpg`     |    13 |
| `.gif`     |     1 |

### Top 10 directories

| #  | Directory                                | Files | Size      |
|---:|------------------------------------------|------:|----------:|
|  1 | `asset-audit`                            |   525 |  32.1 MiB |
|  2 | `Models`                                 | 3,552 |  1.39 GiB |
|  3 | `Models/packs`                           | 3,163 | 953.4 MiB |
|  4 | `Models/packs/Medieval Village MegaKit[Standard]` |   936 | 166.3 MiB |
|  5 | `Models/packs/Ultimate Nature Pack by Quaternius` |   602 |  95.0 MiB |
|  6 | `Sounds`                                 | 2,588 |  2.61 GiB |
|  7 | `Sounds/footsteps`                       | 1,908 | 817.2 MiB |
|  8 | `Sounds/footsteps/BVKER-Footsteps`       | 1,756 | 809.2 MiB |
|  9 | `Sounds/Super Dialogue Audio Pack v1`    |   548 | 111.6 MiB |
| 10 | `Sounds/Super Dialogue Audio Pack v1/Step 2 - Audio Files` |   546 | 111.5 MiB |

### Top 10 largest files (without sound packs)

| #  | File | Size      |
|---:|------|----------:|
|  1 | `Sounds/footsteps/BVKER-Footsteps/BVKER - Footsteps Foley Sound Effects/Synth Sounds/Vinyl Crackles/BVKER - Footsteps Vinyl Crackles 08.wav` |  23.7 MiB |
|  2 | `Models/packs/Universal Animation Library 2[Standard]/Unity/UAL2_Standard_RM.fbx` |  23.7 MiB |
|  3 | `Models/packs/Universal Animation Library 2[Standard]/Unity/UAL2_Standard.fbx` |  23.6 MiB |
|  4 | `Models/packs/Universal Animation Library[Standard]/Unity/UAL1_Standard_RM.fbx` |  22.7 MiB |
|  5 | `Models/packs/Universal Animation Library[Standard]/Unity/UAL1_Standard.fbx` |  22.7 MiB |
|  6 | `Models/packs/ultimate-stylized-nature/Textures/BirchTree_Bark.png` |  22.1 MiB |
|  7 | `Models/packs/ultimate-stylized-nature/glTF/BirchTree_Bark_Normal.png` |  21.7 MiB |
|  8 | `Models/packs/ultimate-stylized-nature/Textures/BirchTree_Bark_Normal.png` |  21.7 MiB |
|  9 | `Models/packs/ultimate-stylized-nature/Textures/MapleTree_Bark.png` |  21.2 MiB |
| 10 | `Models/packs/ultimate-stylized-nature/glTF/MapleTree_Bark_Normal.png` |  21.0 MiB |

### Category inventory



<!-- END GENERATED ASSET REPORT -->
