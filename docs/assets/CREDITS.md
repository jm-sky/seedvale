# Asset credits — Seedvale

Modele 3D użyte w projekcie. Preferujemy CC0; przy CC-BY wpisz wymagany kredyt.

| Asset (ścieżka) | Pack / autor | Źródło | Licencja | Plik źródłowy |
|-----------------|--------------|--------|----------|---------------|
| `public/models/settlement/hut_*.glb` | Ultimate Fantasy RTS / Quaternius | [quaternius.com](https://quaternius.com/packs/ultimatefantasyrts.html) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `Houses_FirstAge_*_Level1` (+ `hut_d` = `Houses_SecondAge_1_Level1`, podpięte) |
| `public/models/settlement/towerhouse.glb` | j.w. | j.w. | CC0 1.0 | `TowerHouse_FirstAge` — podpięte jako wariant domu (plan 072) |
| `public/models/settlement/wall.glb` | j.w. | j.w. | CC0 1.0 | `Wall_FirstAge` — podpięte jako zaczątki palisady przy wejściu (plan 072) |
| `public/models/settlement/logs.glb` | j.w. | j.w. | CC0 1.0 | `Logs` |
| `public/models/settlement/garden.glb` | j.w. | j.w. | CC0 1.0 | `Farm_FirstAge_Level1_Wheat` |
| `public/models/settlement/storage.glb` | j.w. | j.w. | CC0 1.0 | `Storage_FirstAge_Level1` |
| `public/models/nature/tree_a.glb`, `tree_b.glb` | j.w. | j.w. | CC0 1.0 | `Resource_Tree1` / `Resource_Tree2` |
| `public/models/nature/tree_c.glb` | Ultimate Stylized Nature / Quaternius | [quaternius.com](https://quaternius.com/packs/ultimatestylizednature.html) | CC0 1.0 | `MapleTree_3` (textures resized 2048→512 + WebP via `gltf-transform`, 23MB→320KB) |
| `public/models/nature/bush_a.glb` | j.w. | j.w. | CC0 1.0 | `Bush_Small` (WebP-compressed via `gltf-transform`) |
| `public/models/nature/bush_b.glb` | j.w. | j.w. | CC0 1.0 | `Bush_Large` (WebP-compressed via `gltf-transform`) |
| `public/models/characters/*.glb` (NPC, male) | Ultimate Modular Men Pack / Quaternius | [quaternius.com](https://quaternius.com/packs/ultimatemodularcharacters.html) | CC0 1.0 | `Farmer`, `Worker`, `Casual_Hoodie`, `Casual_2` |
| `public/models/characters/Female_*.glb` (NPC, female) | Ultimate Modular Women Pack / Quaternius | [quaternius.com](https://quaternius.com/packs/ultimatemodularwomen.html) | CC0 1.0 | `Worker`, `Casual`, `Medieval`, `Formal` (converted `.gltf` → `.glb` via `gltf-transform copy`) |
| `public/models/characters/Adventurer.glb` (player) | j.w. | [poly.pizza mirror](https://poly.pizza/m/5EGWBMpuXq) | CC0 1.0 | `Adventurer` (anim clip names stripped of `CharacterArmature\|` prefix via `gltf-transform`) |
| `public/models/fauna/wolf.glb` | Ultimate Animated Animal Pack / Quaternius | [quaternius.com](https://quaternius.com/packs/ultimateanimatedanimals.html) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `Wolf` |
| `public/models/fauna/fox.glb` | j.w. | j.w. | CC0 1.0 | `Fox` |
| `public/models/fauna/deer.glb` | j.w. | j.w. | CC0 1.0 | `Deer` |
| `public/models/fauna/stag.glb` | j.w. | j.w. | CC0 1.0 | `Stag` |
| `public/models/settlement/dock_a.glb` | Ultimate Fantasy RTS / Quaternius | [quaternius.com](https://quaternius.com/packs/ultimatefantasyrts.html) | CC0 1.0 | `Dock_FirstAge` (wypełnia istniejący, wcześniej martwy `DOCK_SPECS` w `src/settlement/props.ts` — auto-podpięty pod istniejącą ścieżkę, brak zmian w kodzie) |
| `public/models/nature/rock_a.glb`, `rock_cluster_a.glb`, `fallen_log_a.glb` | j.w. | j.w. | CC0 1.0 | `Rock` / `Rock_Group` / `Logs` — podpięte do chunk environment (`ROCK_SPECS` / `ROCK_CLUSTER_SPECS` / `FALLEN_LOG_SPECS` w `src/settlement/props.ts`, plan 065); fallback proceduralny przy błędzie ładowania |
| `public/models/settlement/market.glb`, `farm.glb`, `windmill.glb`, `towncenter.glb`, `watchtower.glb`, `barracks.glb`, `temple.glb` | j.w. | j.w. | CC0 1.0 | `Market_FirstAge_Level1` / `Farm_FirstAge_Level1_Wheat` / `Windmill_FirstAge` / `TownCenter_FirstAge_Level1` / `WatchTower_FirstAge_Level1` / `Barracks_FirstAge_Level1` / `Temple_FirstAge_Level1` — **rezerwa, niepodpięte**; spekulatywny zapas pod przyszłą ekonomię/outposty (plan 032, luźno wspomniany) |
| `public/models/world/mountain_a.glb`, `mountain_b.glb`, `mountain_c.glb` | j.w. | j.w. | CC0 1.0 | `Mountain_Single` / `Mountain_Group_1` / `MountainLarge_Single` — **rezerwa, niepodpięte**; kandydat pod "góry w tle" z [plans/024](../plans/2026-08-07--024--world-visual-overhaul.md) (otwarty punkt) |
| `public/models/nature/birch_1.glb`, `maple_1.glb`, `deadtree_1.glb`, `flower_clump_1.glb` | Ultimate Stylized Nature / Quaternius | [quaternius.com](https://quaternius.com/packs/ultimatestylizednature.html) | CC0 1.0 | `BirchTree_1` / `MapleTree_1` / `DeadTree_1` / `Flower_1_Clump` (textury 512px + WebP via `gltf-transform`, jak `tree_c`/`bush_*`) — podpięte do `TREE_SPECS`/`BUSH_SPECS` w `src/settlement/props.ts` (globalna wegetacja chunków, nie tylko okolice osady) |
| `public/models/nature/resource_gold_1.glb`, `resource_rock_1.glb` | Ultimate Fantasy RTS / Quaternius | [quaternius.com](https://quaternius.com/packs/ultimatefantasyrts.html) | CC0 1.0 | `Resource_Gold_1` / `Resource_Rock_1` — podpięte do widocznych złóż (`RESOURCE_GOLD_SPECS` / `RESOURCE_ROCK_SPECS` → `terrain/resourceDeposits.ts`, plan 065); żelazo/węgiel dzielą `resource_rock_1` z tintem |
| `public/models/settlement/crate.glb`, `barrel.glb` | j.w. | j.w. | CC0 1.0 | `Crate` / `Barrel` — podpięte przy market stall |
| `public/models/settlement/port.glb` | j.w. | j.w. | CC0 1.0 | `Port_FirstAge_Level1` — **rezerwa, niepodpięte**; większy port (obok istniejącego małego `dock_a.glb`) |
| `public/models/nature/bush_flowers_1.glb`, `flower_clump_2.glb` | Ultimate Stylized Nature / Quaternius | [quaternius.com](https://quaternius.com/packs/ultimatestylizednature.html) | CC0 1.0 | `Bush_Flowers` / `Flower_2_Clump` (textury 512px + WebP) — **rezerwa, niepodpięte**; kolejna wariacja kolorowego poszycia |
| `public/models/items/pitchfork.glb` | Poly by Google | [poly.pizza/m/edEe1ygZiHf](https://poly.pizza/m/edEe1ygZiHf) | **[CC-BY](https://creativecommons.org/licenses/by/3.0/)** | `Pitchfork` — pickup wioski (plan 082); wymagana atrybucja |
| `public/models/items/sickle.glb` | J-Toastie | [poly.pizza/m/InQGR6t3yY](https://poly.pizza/m/InQGR6t3yY) | **[CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/)** | `Sickle` — pickup wioski (plan 082); wymagana atrybucja |
| `public/models/settlement/hay.glb` | Quaternius | [poly.pizza/m/Yu8TOERkpw](https://poly.pizza/m/Yu8TOERkpw) | CC0 1.0 | `Hay` — clutter przy ogrodach (plan 082) |
| `public/models/items/pickaxe.glb` | CreativeTrio | [poly.pizza/m/cJp88qPPLc](https://poly.pizza/m/cJp88qPPLc) | CC0 1.0 | `Pickaxe` — dekor przy stockpile; gameplay mining later (plan 082) |
| `public/models/fauna/sheep.glb` | Quaternius | [poly.pizza/m/C39AUXUUes](https://poly.pizza/m/C39AUXUUes) | CC0 1.0 | `Sheep` — **parked**, niepodpięte (fauna gospodarska) |
| `public/models/fauna/horse.glb` | Quaternius | [poly.pizza/m/qvTrSG9pZF](https://poly.pizza/m/qvTrSG9pZF) | CC0 1.0 | `Horse` — **parked**, niepodpięte |
| `public/models/nature/pine_trees.glb` | Quaternius | [poly.pizza/m/oYtDty0fR6](https://poly.pizza/m/oYtDty0fR6) | CC0 1.0 | `Pine Trees` — **parked**, niepodpięte |
| `public/models/nature/grass_clump.glb` | Quaternius | [poly.pizza/m/UGTOzcO3P2](https://poly.pizza/m/UGTOzcO3P2) | CC0 1.0 | `Grass` — **parked** (instanced grass już w runtime) |
| `public/models/items/long_sword.glb` | ImForth | [poly.pizza/m/fRNfk6uA5hq](https://poly.pizza/m/fRNfk6uA5hq) | **[CC-BY](https://creativecommons.org/licenses/by/3.0/)** | `Long Sword` — **parked**; wymagana atrybucja przy wire |
| `public/models/parked/FishingRod_Lvl2.fbx` | ❓ | `_temp` | **❓** ustalić przed wire | Wymaga FBX→GLB + źródło/licencja |
| `public/models/fx/blood_splat.glb` | Quaternius | [poly.pizza/m/pFSQljR206](https://poly.pizza/m/pFSQljR206) | CC0 1.0 | `Blood Splat` — **parked**; docelowo VFX przy śmierci NPC / fauna / mob (plan 082) |
| `public/models/fauna/chicken.glb` | jeremy | [poly.pizza/m/1YE8U35HXsI](https://poly.pizza/m/1YE8U35HXsI) | **[CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/)** | `Chicken` — **parked** (fauna gospodarska); wymagana atrybucja |
| `public/models/settlement/farm_poly.glb` | Poly by Google | [poly.pizza/m/dSjXKezYeBo](https://poly.pizza/m/dSjXKezYeBo) | **[CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/)** | `Farm` — **parked** (nie mylić z Fantasy RTS `farm.glb`); wymagana atrybucja |
| `public/models/nature/rock_b.glb` | Quaternius | [poly.pizza/m/RtLRqYjfMs](https://poly.pizza/m/RtLRqYjfMs) | CC0 1.0 | `Rock` — **parked** wariant obok wired `rock_a` |

Kopia tekstu licencji z paczki: [quaternius-ultimate-fantasy-rts-license.txt](./quaternius-ultimate-fantasy-rts-license.txt) (w zipie oznaczona mylnie jako „Platformer Pack”; treść = CC0).  
Modular Men: [quaternius-ultimate-modular-men-license.txt](./quaternius-ultimate-modular-men-license.txt).  
Modular Women: [quaternius-ultimate-modular-women-license.txt](./quaternius-ultimate-modular-women-license.txt).  
Fauna: [quaternius-ultimate-animated-animals-license.txt](./quaternius-ultimate-animated-animals-license.txt).

**Uwaga:** paczka Quaternius nie ma bear/rabbit — Seedvale mapuje drapieżniki na `wolf`/`fox`, ofiary na `deer`/`stag`.

**Uwaga (tree_c/bush_*):** Ultimate Stylized Nature nie ma osobnego pliku licencji w pobranym zestawie (Blends/FBX/gITF/OBJ/PNG) — jak wszystkie paczki Quaternius, licencja to CC0 1.0.

Research: [../research/2026-08-07-3d-asset-sources.md](../research/2026-08-07-3d-asset-sources.md).

| `public/models/settlement/megakit/*.glb` (19 szt.) | Medieval Village MegaKit Standard / Quaternius | [quaternius.itch.io/medieval-village-megakit](https://quaternius.itch.io/medieval-village-megakit) | CC0 1.0 | Fences, wagon, crate, chimneys, vines, walls, stairs — parked (not wired); see `public/models/settlement/megakit/README.md`. License: [quaternius-medieval-village-megakit-license.txt](./quaternius-medieval-village-megakit-license.txt) |
