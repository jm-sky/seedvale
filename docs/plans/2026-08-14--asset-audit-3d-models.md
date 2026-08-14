# Seedvale — audyt możliwości assetów 3D (modele i animacje)

**Status:** `done` (dokument; bez zmian gameplayu)
**Created:** 2026-08-14
**Prompt:** [docs/prompts/2026-08-14--001--3d-assets-audit-models-and-animations.md](../prompts/2026-08-14--001--3d-assets-audit-models-and-animations.md)
**Repo source of truth:** kod + pliki GLB/GLTF/FBX, nie same nazwy packów.

Ten dokument **nie implementuje** migracji, physics, NPC AI ani loaderów. Opisuje, co assety naprawdę zawierają, i rekomenduje docelowy pipeline.

---

## Werdykt (skrót)

NPC uwięzieni w domach to **nie** brak workaroundu w `NpcAgent`. To zderzenie trzech faktów:

1. domy Fantasy RTS są **jednym statycznym meshem** bez node’a drzwi, bez bone, bez clipu, bez socketu wejścia;
2. `hut_d` (Second Age — jedyny „prawdziwy” dom z katalogu) **nie ma geometrycznego otworu** — drzwi są namalowane na ścianie;
3. physics 097 używa **koła** `footprintRadius` wokół `house.position`, więc nawet gdyby otwór istniał, collider i tak nie ma portalu.

Quaternius **może** być głównym ekosystemem Seedvale (już jest). Nowe packi **nie** są drop-in zamiennikiem całego pipeline’u.

| Warstwa | Decyzja |
|---|---|
| Budynki / drzwi | Nie naprawiać RTS hutów. Docelowo **MegaKit modular** (ściana z otworem + skrzydło drzwi + authored hinge/entrance). RTS zostaje jako sylwetki / distant / First Age. |
| Postacie | **Nie** podmieniać NPC/playera na Universal Base Characters Standard (superhero, 2 ciała). **Tak** traktować UBC+UAL jako **docelowy rig animacji**, gdy będą stroje wiejskie. Dziś zostawić Modular Men/Women. |
| Animacje | UAL 1+2 pokrywają jump/sit/talk/work/chop/farm/carry, których Modular **nie ma**. Wymagają riga UBC (`hand_r` ≠ `Wrist.R`). |
| Zwierzęta | KEEP wild (wolf/fox/deer/stag) i horse/donkey z Ultimate Animated Animals. Farm Animals Animated **nie jest upgrade’em** krowy/owcy (te same ubogie klipy). Chicken zostaje (brak animated chicken w nowych packach). |
| Natura / drzewa | KEEP Ultimate Stylized Nature. Ultimate Nature Pack = vertex-color, regresja. Textured Trees 2020 = poprzednik, tylko extra warianty. |
| Broń | Medieval Weapons — przydatne po FBX→GLB; **brak grip socketów**; ten sam wrapper co `HELD_ATTACH`. |

**Immediate next step:** plan budynków z prawdziwym entrance (MegaKit wall+door + metadata `entrance` / collider z otworem) — nie kolejny wyjątek w `NpcAgent`.

---

## 0. Metoda

Przeanalizowano rzeczywistą strukturę plików, nie screenshoty.

| Źródło | Co zmierzono |
|---|---|
| glTF JSON (niekompresowane oryginały RTS / MegaKit / UBC) | nodes, meshes, skins, animations, extras, materials |
| `@gltf-transform` + meshopt decoder (wired `public/models/*.glb`) | to samo po `gltfpack` |
| Occupancy slice na wysokości ~28% bbox Y | czy zewnątrz flood-fill dochodzi do środka (`exteriorReachesInterior`) |
| FBX string dump | clip names `Armature\|Idle` itd. w Farm Animals / Weapons |
| Kod | `loadGltf.ts`, `assetAnchors.ts`, `assetAnchorData.ts`, `houseCatalog.ts`, `NpcAgent.ts`, `AnimalAgent.ts`, `heldToolVisual.ts`, `collision.ts`, plan 097 notes |

**Uwaga o `largestGapM`:** na bryłach bez dziury bywa duże, bo to pusta krawędź AABB wokół domu, nie drzwi. **Miara otworu = `exteriorReachesInterior`.**

Klasyfikacja budynków (prompt §5.2):

| Klasa | Znaczenie |
|---|---|
| **A** Gameplay-ready | otwór + drzwi jako osobny node/bone + pivot + możliwość open/close + jednoznaczne wejście |
| **B** Geometry-ready | rzeczywisty otwór, brak animacji/socketu |
| **C** Static visual only | drzwi wyglądają jak drzwi, brak otworu |
| **D** No door | brak drzwi / brak jednoznacznego wejścia |

Żaden zbadany budynek Seedvale **nie jest A**.

---

## 1. Lokalizacje packów

Nowe packi (lokalnie, gitignored):

`_temp/Models/Quaternius Models/`

| Pack (nazwa folderu) | Format użyteczny | Uwaga |
|---|---|---|
| `Universal Base Characters[Standard]` | glTF Godot/UE | **Standard = wycinek.** License: reszta modeli jest w płatnym SOURCE. |
| `Universal Animation Library[Standard]` | `Unreal-Godot/UAL1_Standard.glb` (+ `_RM`) | 43 klipy, rig UBC |
| `Universal Animation Library 2[Standard]` | `UAL2_Standard.glb` (+ `_RM`) | 43 klipy, **ten sam** szkielet 65 kości |
| `Farm Animals Animated by Quaternius` | FBX / OBJ / Blend | **brak glTF**; Cow/Sheep/Horse = ta sama rodzina co wired `cow.glb`/`sheep.glb` |
| `Ultimate Nature Pack by Quaternius` | FBX / OBJ / Blend | vertex-color (`Green`/`Wood`), bez atlasu PBR |
| `Textured Stylized Trees - May 2020` | FBX / OBJ + `Textures/` | poprzednik Ultimate Stylized Nature |
| `Medieval Weapons Pack by Quaternius` | FBX / OBJ / Blend | brak glTF, brak kości/grip |

Już w projekcie (nie „nowe”, ale część ekosystemu):

| Pack | Gdzie |
|---|---|
| Ultimate Fantasy RTS | `public/models/settlement/*`, oryginały `_temp/Models/Ultimate Fantasy RTS - glTF-…/glTF/` |
| Medieval Village MegaKit Standard | parked `public/models/settlement/megakit/`, pełny kit w `_temp/Models/Medieval Village MegaKit - Standard/` |
| Ultimate Stylized Nature | wired `tree_c`, `maple_1`, `birch_1`, `bush_*` |
| Ultimate Modular Men/Women | `public/models/characters/` |
| Ultimate Animated Animals | `wolf`/`fox`/`deer`/`stag` + `horse`/`donkey` |

Loader runtime: `src/assets/loadGltf.ts` (`GLTFLoader` + `MeshoptDecoder`, cache, `SkeletonUtils.clone`). Anchory: metadata w `assetAnchorData.ts` + konwencja `SV_*` w GLB (żaden zbadany asset **nie ma** node’ów `SV_`).

---

## 2. Problem, który uruchomił audyt

Plan 097 §4.6 (implementation notes, 2026-08-14): NPC spawnuje się na `house.position` = środek koła `footprintRadius`. `isWalkable` bez wyjątku „już jestem w środku” blokował każdy krok wychodzący. Łatka pozwala wyjść z koła; **nie modeluje drzwi**.

`createHouseDoorTracker` (`src/audio/doorSounds.ts`) gra SFX przy przekroczeniu **tego samego koła** — nie otwiera mesha.

Wniosek audytu: workaround w AI/physics jest świadomie tymczasowy. Trwały fix wymaga **geometrii otworu + osobnego collidera ścian + punktu entrance**, których obecne hut GLB nie dostarczają.

---

## 5–7. Buildings / drzwi / sockety

### 5.1–5.2 Wired i parked Fantasy RTS

Oryginały przed `gltfpack` mają **jeden node = nazwa pliku**, jeden mesh (`Cube.NNN`), **0 animacji, 0 skins, 0 extras**. `gltfpack` dodatkowo gubi nazwy node/mesh.

Mapowanie CREDITS → plik:

| Seedvale | Źródło RTS | `hasWalls` (katalog) | Drzwi (nazwa) | Otwór (`exteriorReachesInterior`) | Klasa |
|---|---|---|---|---|---|
| `hut_a` | `Houses_FirstAge_1_Level1` | false | NO | **true** (brak ścian — ażur) | **B** geometrycznie / **D** jako drzwi |
| `hut_b` | `Houses_FirstAge_2_Level1` | false | NO | **true** | **B** / **D** |
| `hut_c` | `Houses_FirstAge_3_Level1` | false | NO | **true** | **B** / **D** |
| `hut_d` | `Houses_SecondAge_1_Level1` | true | NO (tekstura „drzwi” na `Walls`) | **false** | **C** |
| `towerhouse` | `TowerHouse_FirstAge` | true | NO | **false** | **D** |
| `storage` | `Storage_FirstAge_Level1` | — | NO | **false** | **D** |
| `market` | `Market_FirstAge_Level1` | — | NO | **true** (otwarta wiata) | **B** (nie drzwi) |
| `barracks` | `Barracks_FirstAge_Level1` | — | NO | **false** | **D** |
| `temple` | `Temple_FirstAge_Level1` | — | NO | **false** | **D** |
| `towncenter` | `TownCenter_FirstAge_Level1` | — | NO | **false** | **D** |
| `watchtower` | `WatchTower_FirstAge_Level1` | — | NO | true, gap **0.16 m** | **D** (za wąsko na NPC) |
| `windmill` | `Windmill_FirstAge` | — | NO | **false** | **D** |
| `port` | `Port_FirstAge_Level1` | — | NO | **true** (otwarty pomost) | **B** (nie drzwi) |
| `farm` | `Farm_FirstAge_Level1_Wheat` | — | n/a | pole, nie budynek | **D** |
| `well` | `well.glb` (osobny model) | — | n/a | n/a | **D** |
| `wall` | `Wall_FirstAge` | — | NO | palisada | **D** |

Second Age Level 2 i 3 (`Houses_SecondAge_1_Level2/3`): nadal **jeden mesh, brak otworu**. Wyższy level ≠ drzwi.

Materiały `hut_d`: `Main`, `Walls`, `Stone`, `Wood`, `Wood_Light` — 5 prymitywów **tego samego** mesha, nie osobne skrzydło drzwi.

`houseCatalog.ts` sam to dokumentuje: First Age = „brak ścian, same otwory”; `hut_d` = „Textured door”. Zgodne z geometrią.

### Brama RTS (nie wired)

| Asset | Drzwi | Otwór | Klasa |
|---|---|---|---|
| `WallTowers_Door_FirstAge` | YES (nazwa pliku) | **true**, ~1.3 m | **B** — osobny mesh otwartej bramy |
| `WallTowers_DoorClosed_FirstAge` | YES | **false** | **C** — para statyczna, nie animacja |

To **dwa statyczne warianty**, nie clip open/close i nie bone.

### MegaKit (jedyne A-capable pieces)

Pełny kit: ściany z otworem, framugi, skrzydła drzwi, okiennice open/closed. Parked w repo: m.in. `wall_plaster_door.glb`, `wall_brick_door.glb`, `wall_arch.glb` ([megakit/README.md](../../public/models/settlement/megakit/README.md)).

| Asset | Node | Otwór | Pivot/bone/anim | Rola |
|---|---|---|---|---|
| `Wall_Plaster_Door_Flat` | `Wall_Plaster_Door_Flat` | **true**, ~2.0×3.1 m ściana, occupancy 0.10 | brak | otwór w ścianie |
| `Wall_Plaster_Door_Round` | j.w. | **true** | brak | j.w. |
| `Wall_UnevenBrick_Door_Flat` | j.w. | **true** | brak | j.w. |
| `DoorFrame_Flat_Brick` | `DoorFrame_Flat_Brick` | **true** | brak | framuga ~1.57×2.38 m |
| `DoorFrame_Flat_WoodDark` | j.w. | **true** | brak | framuga |
| `Door_1_Flat` | `Door_1_Flat` | n/a (to skrzydło ~1.12×2.10×0.12 m) | **brak hinge** | liść drzwi |
| `Door_2_Flat` | `Door_2_Flat` | flood-fill true (ażurowe skrzydło) | brak hinge | liść |
| `Wall_Arch` | `Wall_Arch` | **true** (cienki łuk) | brak | przejście |
| `WindowShutters_*_Open/Closed` | nazwa pliku | para statyczna | brak | jak brama RTS |

**ANIMATABLE AT RUNTIME** tylko jeśli Seedvale **doda** empty hinge (środek mesha `Door_1_Flat` nie jest krawędzią ościeżnicy — trzeba zmierzyć i zapisać w metadata). Asset **nie** dostarcza bone `DoorPivot`.

`NOT ANIMATABLE WITHOUT ASSET MODIFICATION`: cały Fantasy RTS house set.

### 6. Door animations

**Żaden** budynek/drzwi: 0 clipów (`open`/`close`/…). MegaKit też 0.

### 7. Building sockets vs Seedvale metadata

W GLB budynków: **zero** `entrance`, `door`, `interior`, `SV_*`.

Seedvale dziś:

| Anchor | Skąd | Zgodność z assetem |
|---|---|---|
| `house:*` `lamp_mount` | `assetAnchorData.ts` (assetLocal) | **nie** z GLB — ręczny offset / raycast `findWallMount` |
| `settlement:well` `interaction` | metadata `[0, 0.72, 0.85]` | **nie** z GLB — well po gltfpack ma puste nazwy node’ów |
| `character:*` `hand.right` | kość `Wrist.R` / aliasy | **zgodne** z Modular (patrz §8) |

Katalog `doorHeightFraction` skaluje dach do „wysokości drzwi”, ale **nie oznacza** otworu w meshu (`hut_d` ma `doorHeightFraction: null`).

---

## 8–10. Player / NPC (obecne)

Modele wired:

- Player: `Adventurer.glb` (`PLAYER_MODEL_URL`)
- Male NPC: `Farmer`, `Worker`, `Casual_Hoodie`, `Casual_2`
- Female NPC: `Female_Worker`, `Female_Casual`, `Female_Medieval`, `Female_Formal`

Wszystkie: **identyczny szkielet 62 kości** (Adventurer === Farmer === Female_Casual). Adventurer ma extra meshe `Backpack`, `Adventurer_*`.

### 8.1 Rzeczywiste kości (nie Mixamo)

Hierarchia (skrót):

```text
Root
 └ Body
    └ Hips
       ├ Abdomen → Torso → Chest → Neck → Head
       │                      ├ Shoulder.L → UpperArm.L → LowerArm.L → Wrist.L → palce
       │                      └ Shoulder.R → UpperArm.R → LowerArm.R → Wrist.R → palce
       ├ UpperLeg.L → LowerLeg.L → Foot.L → PT.L
       └ UpperLeg.R → LowerLeg.R → Foot.R → PT.R
```

Armature node: `CharacterArmature`. Palce: `Index1.L`…`Pinky4.L`, `Thumb1–3`.

**Nie ma** `mixamorig*`, `hand_r`, `pelvis`, `spine_01`.

Komentarz w `heldToolVisual.ts` („`WristR` bez kropki”) jest **nieaktualny** względem GLB: kość nazywa się `Wrist.R`. Aliasy w `RIGHT_HAND_BONE_NAMES` zawierają obie formy — resolve zadziała.

### 9. Humanoid sockets

| Semantyczna rola | Actual bone | W Seedvale |
|---|---|---|
| `hand.right` | `Wrist.R` | TAK (`CHARACTER_ANCHORS`) |
| `hand.left` | `Wrist.L` | **nie** zdefiniowany |
| `head` | `Head` | nie |
| `chest` | `Chest` | nie |
| `back` | — (Adventurer ma mesh `Backpack`, nie socket) | nie |
| `hip` | `Hips` | nie |
| `foot.left/right` | `Foot.L` / `Foot.R` | nie |

Grip narzędzi: `HELD_TOOL_GRIP_ANCHORS` jest **pusty** (placeholder Phase 6). Mount idzie przez `HELD_ATTACH` TRS, nie przez asset socket.

### 10. Klipy Modular (24, te same nazwy u wszystkich)

Zmierzony zestaw (Adventurer; female ma te same nazwy, ~1.25× duration):

`Idle` 1.67s, `Idle_Neutral` 1.67s, `Walk` 1.33s, `Run` 0.80s, `Run_Back` 0.83s, `Run_Left` 0.80s, `Run_Right` 0.80s, `Roll` 1.33s, `Interact` 1.27s, `Wave` 1.67s, `Death` 1.07s, `HitRecieve`, `HitRecieve_2`, `Punch_Left/Right`, `Kick_Left/Right`, `Sword_Slash`, `Idle_Sword`, `Gun_Shoot`, `Idle_Gun`, `Idle_Gun_Pointing`, `Idle_Gun_Shoot`, `Run_Shoot`.

Runtime używa ułamka: player `Idle`/`Walk`/`Run`; NPC `Idle`/`Walk`/`Interact`. Reszta leży w GLB.

| Kategoria | Status | Dowód |
|---|---|---|
| Locomotion | **PARTIALLY AVAILABLE** | idle/walk/run + strafe run; brak jog/sprint/turn-in-place/start-stop |
| Physics | **MISSING** | brak jump/fall/land (zgodne z planem 097 §4 p.5) |
| Daily life | **MISSING** | brak sit/sleep/eat/drink/talk (jest `Wave`/`Interact`) |
| Work | **MISSING** | brak chop/farm/carry/craft |
| Interaction | **PARTIALLY AVAILABLE** | `Interact`; brak open/close/pickup/push |
| Combat | **PARTIALLY AVAILABLE** | punch/kick/sword/hit/death/gun; brak block/dodge |

---

## 11. Universal Base Characters [Standard]

### Co pack naprawdę zawiera

**Dwa** pełne ciała (nie biblioteka NPC):

- `Superhero_Male_FullBody.gltf` — mesh `SuperHero_Male` + `Face` (włosy) + `Face.001` (oczy)
- `Superhero_Female_FullBody.gltf` — `Superhero_Female` + `Eyebrows` + `Eyes`

Tekstury skóry: male/female × light/dark. Oczy: `T_Eye_Brown`.

Hairstyles (osobne glTF, **rigged to Head** albo origin 0):

`Hair_Long`, `Hair_SimpleParted`, `Hair_Buns`, `Hair_Buzzed`, `Hair_BuzzedFemale`, `Hair_Beard`, `Eyebrows_Regular`, `Eyebrows_Female`.

License_Standard.txt: *„only contains a portion of the models”* — SOURCE ma resztę + blendy + gotowe projekty silników.

### Skeleton (65 joints) — Unreal-style

```text
root → pelvis → spine_01 → spine_02 → spine_03 → neck_01 → Head
                 ├ clavicle_l → upperarm_l → lowerarm_l → hand_l → palce *_l
                 ├ clavicle_r → … → hand_r
                 ├ thigh_l → calf_l → foot_l → ball_l → ball_leaf_l
                 └ thigh_r → …
```

`root` rotation `[-0.707, 0, 0, 0.707]` (−90° X) — standard Blender→glTF. Wysokość mesha male ≈ **1.82 m**, female ≈ **1.78 m** (prawie metry świata; Modular po `prepareProp` jest skalowany do `NPC_HEIGHT` 1.75 / `PLAYER_HEIGHT`).

**Brak animacji w UBC** (T-pose / rest). Animacje = UAL.

**Brak** attachment empties poza kośćmi. Sockety = kości `hand_l`/`hand_r`/`Head`/`pelvis`.

### Czy UBC Standard ma być bazą humanoidów Seedvale?

**Nie jako mesh NPC/playera dzisiaj.** **Tak jako docelowy rig**, jeśli pojawią się stroje wiejskie na tym szkielecie.

| Zysk | Koszt |
|---|---|
| Jeden szkielet z UAL 1+2 (jump, sit, sleep-ish `LayToIdle`, farm, chop, carry, talk) | Wymiana 9 GLB + mixer clip map + `Wrist.R` → `hand_r` |
| Modularne włosy (8 szt. w Standard) | Wizualnie **superhero catsuit**, nie osadnik |
| Palce + `ball` stopy (lepsze IK/buty) | Standard ≠ setki NPC: 2 ciała × 2 tony × kilka fryzur |
| Skala ~1.8 m | Retarget Modular←UAL jest osobnym preprocessor pipeline (różne nazwy i hierarchia: brak `Abdomen`/`Torso`/`PT.*`) |

Obecne NPC **można zachować** do czasu strojów. Player i NPC **powinni** docelowo dzielić ten sam system (patrz §30).

---

## 12–13. Universal Animation Library 1 + 2 + retargeting

Oba pliki `*_Standard.glb` i `*_RM.glb`: **te same 43 nazwy klipów**; `_RM` = root motion w krzywych, drugi = in-place. Szkielet = **65 kości UBC, identyczna lista** (`root`, `pelvis`, `hand_r`, …).

Three.js: `AnimationMixer` na UBC zadziała bez retargetu, jeśli clipy i mesh dzielą nazwy kości (UAL jest eksportowane na manekinie UBC). `GLTFLoader` już jest w projekcie. Root motion: albo użyć wariantu bez `_RM` i ruszać agentem z kodu (jak dziś Walk), albo czytać delta z `_RM` — **preprocessing nie jest wymagany do odtworzenia klipu**, tylko decyzja ruchu.

Retarget na **obecny** Modular: **wymagany preprocessor** (Blender/gltf-transform custom): mapa `hand_r→Wrist.R`, `pelvis→Hips`, `spine_01→Abdomen`, itd.; rest pose (UBC T-pose vs Modular A-pose — do weryfikacji wizualnej przy pierwszej próbie); skala 1:1 jest zbliżona. Three.js **nie** ma wbudowanego Mixamo-retarget. To większy koszt niż podmiana mesha na UBC.

### UAL1 — 43 klipy

Locomotion: `Idle_Loop`, `Walk_Loop`, `Walk_Formal_Loop`, `Jog_Fwd_Loop`, `Sprint_Loop`, `Crouch_Fwd_Loop`, `Crouch_Idle_Loop`, `Swim_Fwd_Loop`, `Swim_Idle_Loop`.  
Physics: `Jump_Start`, `Jump_Loop`, `Jump_Land`, `Roll`.  
Daily: `Idle_Talking_Loop`, `Sitting_Enter/Exit/Idle_Loop/Talking_Loop`, `Dance_Loop`, `Idle_Torch_Loop`.  
Work-ish: `Fixing_Kneeling`, `Push_Loop`, `PickUp_Table`, `Driving_Loop`.  
Combat: `Punch_Jab/Cross`, `Sword_Attack`, `Sword_Idle`, `Hit_Chest`, `Hit_Head`, `Death01`, pistolet (aim/shoot/reload).  
Other: `A_TPose`, `Interact`, `Spell_Simple_*`.

### UAL2 — 43 klipy (komplement, nie duplikat)

Work (Seedvale-critical): `TreeChopping_Loop`, `Farm_Harvest`, `Farm_PlantSeed`, `Farm_Watering`, `Walk_Carry_Loop`, `Consume`.  
Daily: `LayToIdle`, `Idle_FoldArms_Loop`, `Idle_Lantern_Loop`, `Yes`, `Idle_No_Loop`, `Idle_TalkingPhone_Loop`.  
Combat: `Sword_Regular_A/B/C` + rec/combo, `Sword_Block`, `Sword_Dash`, `Sword_Heavy_Combo`, `Shield_*`, `Melee_Hook`, `Hit_Knockback`.  
Physics: `NinjaJump_*`, `Slide_*`, `ClimbUp_1m`, `OverhandThrow`.  
Other: `Chest_Open`, `Zombie_*`.

| Kategoria | UAL 1+2 razem |
|---|---|
| Locomotion | **AVAILABLE** (brak strafe/backward jako osobnych clipów — PARTIAL jeśli chcemy 8-way) |
| Physics | **AVAILABLE** (jump 3-fazy, land, knockback, slide, climb 1 m) |
| Daily life | **PARTIALLY AVAILABLE** (`Sitting_*`, talk, `Consume`, `LayToIdle`; **brak** leżenia/snu loop i picia ze studni) |
| Work | **PARTIALLY AVAILABLE** (chop, farm plant/harvest/water, carry, fix kneeling; **brak** mine/fish/dig/build/craft) |
| Combat | **AVAILABLE** na potrzeby v1 (miecz, tarcza, hit, death) |
| Interaction | **PARTIALLY AVAILABLE** (`Interact`, `PickUp_Table`, `Chest_Open`; brak door open) |

---

## 14. Czy Quaternius może być głównym ekosystemem?

**Tak, z granicami.** Seedvale już stoi na Quaternius (RTS + Stylized Nature + Modular + Animated Animals + MegaKit parked). Nowe packi **wzmacniają animacje i modularne budynki**, nie każą wyrzucać wired natury.

| Domena | Quaternius wystarczy? | Warunek |
|---|---|---|
| Characters (rig/anim) | Tak (UBC+UAL) | Stroje wiejskie: Standard **nie**; SOURCE albo inny pack na tym rigu |
| Characters (wygląd NPC) | Dziś Modular; UBC Standard **nie** | Superhero ≠ osadnik |
| Animals wild | Tak (już wired) | Brak niedźwiedzia/zająca w paczce — CREDITS to już notuje |
| Livestock | Częściowo | Brak animated chicken; owca bez Walk |
| Nature / trees | Tak — **obecny** Ultimate Stylized Nature | Nowy Ultimate Nature Pack: nie jako zamiana |
| Buildings | MegaKit **tak** (modular + otwory); RTS **nie** (wnętrza) | Trzeba składać domy, nie drop-in hut_d |
| Weapons/tools | Tak po konwersji | Grip = runtime, jak dziś |
| Effects | Poza Quaternius (fire/blood już z Poly Pizza, CC-BY) | OK |

---

## 15–16. Farm Animals Animated vs obecne

### Obecne (wired)

| Animal | Pack (CREDITS) | Skeleton | Klipy faktyczne | Runtime (`AnimalAgent`) |
|---|---|---|---|---|
| wolf, fox | Ultimate Animated Animals | `AnimalArmature` ~51 joints | Idle, Idle_2, Walk, Gallop, Eating, Attack, Death, HitReact, Jump_* | Idle / Walk / Gallop |
| deer, stag | j.w. | j.w. | + Attack_Headbutt/Kick, Eating 6–12s | j.w. |
| horse, donkey | j.w. (poly.pizza mirror) | j.w. | pełny zestaw UAA + zduplikowane `AnimalArmature\|*` | j.w. |
| cow | Farm Animals (ten sam clip prefix) | `Armature`, `root`, `FrontFoot.R`… | `Armature\|Idle/Walk/WalkSlow/Run/Jump/Death` | Walk działa po `findAction(['Walk'])`? **nie** — nazwa to `Armature\|Walk` |
| sheep | j.w. | j.w. | **tylko** `Armature\|Idle`, `Armature\|Jump` | brak Walk |
| chicken | jeremy CC-BY | **brak** (0 bones, 0 clips) | statyczny mesh, bbox ~167 jednostek | procedural fallback jeśli load padnie; GLB jest skalowany `prepareProp` |

`findAction` szuka dokładnej nazwy `Walk` / `Idle` — klipy `Armature|Walk` **nie matchują**. Cow/sheep mogą stać w Idle albo nic nie odtwarzać przy chodzeniu. **FINDING-004.**

Nowy pack FBX (stringi):

| Plik | Klipy w FBX | vs current |
|---|---|---|
| `Cow.fbx` | Idle, Walk, WalkSlow, Run, Jump, Death | **to samo** co `cow.glb` |
| `Horse.fbx` | j.w. | **gorsze** niż wired horse (brak Eating/Attack/Gallop) |
| `Sheep.fbx` | Idle, Jump | **to samo** (brak Walk) |
| `Pig.fbx`, `Llama.fbx`, `Pug.fbx` | Idle, Jump | nowe gatunki, bardzo ubogie |
| `Zebra.fbx` | jak Cow | dekor / nie native Seedvale |
| chicken, donkey | **brak w packu** | — |

| Animal | Recommendation |
|---|---|
| wolf/fox/deer/stag | **KEEP CURRENT** |
| horse/donkey | **KEEP CURRENT** (UAA > Farm pack horse) |
| cow | **KEEP CURRENT** mesh; **nie** REPLACE tym packiem. Ewentualnie SUPPLEMENT po rename clipów |
| sheep | **KEEP**; pack nie dodaje Walk |
| chicken | **KEEP** do czasu animated chicken z innego źródła |
| pig/llama | **SUPPLEMENT** tylko jeśli gameplay będzie ich potrzebował; nie po to, by zwiększyć liczbę GLB |

Wildlife: nowe packi **nie** zawierają deer/wolf/fox. Nie proponować losowych zamienników.

Braki animacji zwierząt (nawet UAA): drink, sleep, graze jako osobny clip (Eating ≈ graze), flee (Gallop wystarcza).

---

## 17. Ultimate Nature Pack

150 modeli FBX/OBJ: Common/Birch/Pine/Willow × seasons/snow/dead, Palm, Cactus, Bush, Rock, Grass, Flowers, Wheat, Corn, WoodLog, TreeStump, Lilypad.

- Materiały: nazwane kolory (`Green`, `Wood`, `Snow`) — **vertex/flat**, nie tekstury kory/liści.
- Poly: CommonTree_1 ~1450 v, Birch_1 ~866 v, Rock_1 **37 v**, Grass 120 v.
- Pivot: OBJ origin przy podstawie (typowe dla Quaternius).
- LOD: brak.
- Skala: drzewa ~2.5–3.5 m w OBJ — do `prepareProp`.

Obecny las Seedvale: Ultimate **Stylized** Nature (`maple_1` 3848 tri, `tree_c` 6467 upload verts, tekstury WebP) + instancing (plan 087).

> Czy pack nadaje się do dużego proceduralnego świata Seedvale?

**Jako zamiana — nie** (regresja looku vs już wired textured trees). **Jako extra cheap props** (rocks, stumps, wheat) — ewentualnie, ale skały/wheat już są z RTS/Stylized. Sezonowe warianty (snow/autumn) staną się wartością dopiero przy planie 040 (seasons) — i nawet wtedy lepszy jest textured pack / Stylized.

---

## 18. Textured Stylized Trees (May 2020)

45 OBJ: Birch×10, DeadBirch×10, Tree×10, DeadTree×10, Pine×5. Tekstury 19 PNG (bark + leaves, w tym seasonal kolory).

Poly: Birch_1 ~1466 v / 1118 f, wysokość OBJ ~9.5 m (większe niż Ultimate Nature Pack).

To **poprzednik** Ultimate Stylized Nature już w `public/models/nature/`. Styl ten sam, atlas starszy, brak LOD.

**Rekomendacja:** dodatkowa biblioteka wariantów (pine/dead), **nie** zamiana `maple_1`/`tree_c`/`birch_1`. Konwersja FBX/OBJ→GLB + WebP jak przy planie tree_c.

---

## 19. Medieval Weapons

23 FBX: miecze (Sword, Sword_2, Sword_Big, Sword_Golden, Claymore, Dagger×2), topory (Axe, Axe_Small, Axe_Double), młoty, Scythe, Spear, 4 łuki, Arrow, 5 tarcz.

- Brak skeleton/animation/grip node.
- OBJ: długie osie zwykle **Y** (Axe 5.26, Spear 9.72, Claymore 6.60); Arrow **Z** 2.73. Inna konwencja niż część obecnych held (`shovel` Y-long 3.87, `axe` Z-long 1.13).
- Attachment: jak dziś — `preparePropFitMax` + `HELD_ATTACH` na `hand.right` / przyszły `hand_l` (tarcza).

Nadaje się na combat/professions po GLB. **Nie** zastępuje siekiery/łopaty bez weryfikacji grip w asset browser (plan 088). `long_sword.glb` (CC-BY ImForth) można docelowo wymienić na CC0 `Sword`/`Claymore`, żeby zdjąć atrybucję.

---

## 20. Props / interactive

| Asset | Nodes | Bones/anim | Interaction w assetcie | Runtime |
|---|---|---|---|---|
| well | unnamed po pack | 0 | 0 | metadata `interaction` |
| lantern | 7 mesh names `ElwFor_Lantern_*` | 0 | 0 | `lamp_mount` / PointLight |
| torch | `Torch` | 0 | 0 | plaza posts |
| crate/barrel | unnamed | 0 | 0 | clutter |
| axe/shovel/long_sword | unnamed / `WoodenTorch` | 0 | 0 | `HELD_ATTACH` |
| MegaKit Door_* | 1 node | 0 | 0 | przyszły hinge |
| campfire_* | parked | baked flame vs unlit | 0 | nie toggle’owalne z mesha |

Brak chest z animacją w wired set. UAL2 ma **clip** `Chest_Open` (postać), nie model skrzyni.

---

## 21. Cross-pack compatibility

| Para | Skeleton | Skala | Orientacja | Styl | Wniosek |
|---|---|---|---|---|---|
| UBC ↔ UAL1 ↔ UAL2 | **identyczny** 65 kości | ~metry | glTF Y-up, root −90° X | manekin/superhero | **działa razem** (to jest zaprojektowane) |
| UBC ↔ Modular Men/Women | **inny** (`hand_r` vs `Wrist.R`) | zbliżona ~1.8 m | oba Blender glTF | low-poly, ale strój inny | **nie** share clipów bez retargetu |
| UAL ↔ Medieval Weapons | n/a | broń w jednostkach Blender ~metry-ish | Y-up | spójny Quaternius | mount ręczny |
| Farm Animals ↔ UAA | **inny** (`Armature` vs `AnimalArmature`) | różna | — | spójny look | nie share clipów |
| MegaKit ↔ RTS houses | n/a | MegaKit ściana 2×3.12 m; RTS hut bbox ~0.9 m przed scale | Y-up | ten sam autor, MegaKit bardziej „murowany” | **nie** sklejać 1:1 bez kanonicznej skali osady |
| Ultimate Nature Pack ↔ Stylized Nature | n/a | Nature Pack drzewa niższe/prostsze | — | flat color vs textured | **nie mieszać** w jednym chunku |
| Weapons ↔ obecne tools | n/a | niespójne osie | — | OK | per-item grip |

Nie zakładać kompatybilności „bo Quaternius”. Jedyna twarda para to **UBC + UAL 1 + UAL 2**.

---

## 22. Asset capability matrix (ważne)

| Asset | Category | Mesh | Skeleton | Bones | Animations | Socket | Pivot | Interaction | Gameplay Ready |
|---|---|---|---|---|---|---|---|---|---|
| hut_a/b/c | house | tak | nie | 0 | 0 | nie | origin | nie | **nie** (ażur + koło collider) |
| hut_d | house | tak | nie | 0 | 0 | nie | origin | wizualne drzwi | **nie** |
| MegaKit Wall_*_Door | building kit | tak | nie | 0 | 0 | nie | origin ściany | otwór TAK | geometry **tak** |
| MegaKit Door_1_Flat | door leaf | tak | nie | 0 | 0 | nie | **nie hinge** | nie | po wrapperze |
| Adventurer / NPC Modular | character | tak | CharacterArmature | 62 | 24 | Wrist.R via metadata | — | Interact/Wave | locomotion **tak**, życie **nie** |
| UBC Male/Female | character | tak | Unreal-style | 65 | 0 w GLTF | kości hand_* | root −90° | — | rig **tak**, strój **nie** |
| UAL1/2 | anim lib | manekin | 65 = UBC | 65 | 43+43 | — | RM optional | Chest_Open clip | **tak** na UBC |
| wolf/fox/deer/stag | fauna | tak | AnimalArmature | ~51 | 12–13 | nie | — | Eating/Attack | **tak** na obecny AI |
| horse/donkey | livestock | tak | AnimalArmature | ~51 | 13 (+dup) | nie | — | j.w. | **tak** |
| cow/sheep | livestock | tak | Armature | ~25–28 | 2–6, złe nazwy | nie | — | — | **partial** |
| chicken | livestock | tak | nie | 0 | 0 | nie | zły authored scale | nie | visual only |
| well | prop | tak | nie | 0 | 0 | metadata only | — | queue | visual **tak** |
| held tools | item | tak | nie | 0 | 0 | HELD_ATTACH | niespójny | melee | **tak** z wrapperem |

| Asset | Current | New candidate | Recommendation | Reason |
|---|---|---|---|---|
| Family homes | hut_d + rare First Age | MegaKit wall+door kit | **REPLACE path** (nowe prefabrykaty), nie vertex-hack hut_d | hut_d = class C |
| Player/NPC mesh | Modular | UBC Standard | **KEEP** mesh; **ADOPT** rig later | superhero + 2 ciała |
| Player/NPC anim | 24 combat/loco | UAL 1+2 | **ADOPT** z rigen UBC | jump/sit/work |
| Horse | UAA | Farm Horse.fbx | **KEEP** | Farm ma mniej klipów |
| Cow/sheep | Farm-like GLB | ten sam pack | **KEEP**; fix clip names | nie upgrade |
| Trees | Stylized Nature | Nature Pack / Trees 2020 | **KEEP**; Trees 2020 = extra pine | vertex-color regresja |
| Long sword | CC-BY | Weapons `Sword`/`Claymore` | **REPLACE later** | CC0, ten sam wrapper |

---

## 23. Buildings matrix

| Asset | Door | Opening | Door Node | Door Bone | Pivot | Open/Close | Entrance | Socket | Class |
|---|---|---|---|---|---|---|---|---|---|
| hut_a | NO | YES (no walls) | — | — | origin | no | da się zgadnąć z dziury | nie | B/D |
| hut_b | NO | YES | — | — | origin | no | j.w. | nie | B/D |
| hut_c | NO | YES | — | — | origin | no | j.w. | nie | B/D |
| hut_d | UNCLEAR (texture) | **NO** | — | — | origin | no | **nie** z geometrii | `lamp_mount` only | **C** |
| SA1 L2/L3 | NO | NO | — | — | origin | no | nie | nie | D/C |
| towerhouse | NO | NO | — | — | origin | no | nie | nie | D |
| storage/barracks/temple/towncenter/windmill | NO | NO | — | — | origin | no | nie | nie | D |
| market/port | NO | open structure | — | — | origin | n/a | nie drzwi | nie | B |
| watchtower | NO | too small | — | — | origin | no | nie | nie | D |
| WallTowers_Door | YES (filename) | YES | cały mesh | — | origin | osobny closed mesh | tak (środek bramy) | nie | B |
| WallTowers_DoorClosed | YES | NO | cały mesh | — | origin | para | nie | nie | C |
| MegaKit Wall_*_Door | YES | YES | cały mesh=ściana | — | origin | skrzydło osobno | **tak** (środek otworu) | nie | **B** |
| MegaKit Door_1_Flat | YES | n/a (leaf) | `Door_1_Flat` | — | **nie hinge** | runtime yaw | — | nie | C piece / A kit |
| MegaKit DoorFrame_* | YES | YES | framuga | — | origin | — | tak | nie | B |

---

## 24. Character matrix

| Asset | Skeleton | Key bones | Sockets | Loco | Physics | Daily | Work | Combat | Missing |
|---|---|---|---|---|---|---|---|---|---|
| Adventurer + 8 NPC | CharacterArmature 62 | Root, Hips, Chest, Head, Wrist.L/R, Foot.L/R | hand.right metadata | P | MISSING | MISSING | MISSING | P | jump, sit, sleep, eat, chop, farm |
| UBC M/F Standard | Unreal 65 | root, pelvis, spine_01–03, hand_l/r, Head | kości | via UAL | via UAL | via UAL | via UAL | via UAL | wiejski strój, age, faces |
| UAL1+2 | = UBC | = UBC | — | A | A | P | P | A | sleep loop, drink, mine, fish, door |

A = AVAILABLE, P = PARTIAL.

---

## 25. Animal matrix

| Animal | Skeleton | Idle | Walk | Run | Eat | Drink | Attack | Flee | Hit | Death | Missing |
|---|---|---|---|---|---|---|---|---|---|---|---|
| wolf/fox | AnimalArmature | Y | Y | Gallop | Eating | N | Y | Gallop | HitReact | Y | drink/sleep |
| deer/stag | j.w. | Y | Y | Gallop | Y | N | Headbutt/Kick | Gallop | Y | Y | drink/sleep |
| horse/donkey | j.w. | Y | Y | Gallop | Y | N | Y | Gallop | Y | Y | drink |
| cow | Armature | `Armature\|Idle` | `\|Walk` **unmatched** | `\|Run` | N | N | N | N | N | `\|Death` | eat, drink; **clip prefix** |
| sheep | Armature | `\|Idle` | **N** | N | N | N | N | N | N | N | walk, eat |
| chicken | none | N | N | N | N | N | N | N | N | N | wszystko; scale |
| Farm Pig/Llama/Pug | Armature | Idle | N | N | N | N | N | N | N | N | nie brać bez potrzeby |

---

## 26. Missing capabilities

### Critical

- **Building entrance** (pozycja + kierunek + szerokość) w danych, nie w komentarzu katalogu.
- **Collision z otworem** (ściany ≠ pełne koło) — inaczej NPC/player nigdy nie wejdą „jak w drzwi”.
- Hut_d **bez otworu** przy `hasWalls: true` — NPC we wnętrzu to clipping przez ścianę, nie gameplay.

### Important

- Door leaf + hinge (MegaKit Door_* + authored pivot).
- Jump/land klipy — są w UAL, nie w Modular (097 v1 świadomie bez klipu).
- NPC daily: sit, sleep/lie, eat (`Consume`), talk (`Idle_Talking_Loop`).
- NPC work: `TreeChopping_Loop`, farm clips, `Walk_Carry_Loop`.
- `hand.left` + tool `grip` anchors.
- Cow/sheep clip rename **albo** matcher `includes('Walk')`.
- Animated chicken.
- Wiejskie stroje na rigu UBC (Standard nie wystarcza).

### Nice to have

- Door open/close klipy (brak wszędzie — i tak runtime).
- Drink / sleep loops zwierząt.
- Mine/fish/dig/build character clips.
- Strafe w UAL.
- Sezonowe drzewa (Nature Pack snow) przy planie 040.
- CC0 sword zamiast CC-BY `long_sword`.

---

## 27. Replacement candidates

`CURRENT → PROBLEM → CANDIDATE → BENEFIT → COST/RISK → REC`

1. **hut_d → brak otworu / fused mesh → MegaKit Wall_*_Door + Door_1 + DoorFrame → prawdziwe wejście, ten sam styl →** składanie prefabów, nowy collider, streaming koszt; **nie** edytować hut_d w Blenderze (autor nie modeluje). **REPLACE path (nowe budynki).**
2. **Adventurer/NPC Modular → brak jump/life/work → UBC+UAL → pełne klipy →** utrata strojów wiejskich, migracja bone names, Standard = 2 ciała. **NIE replace mesha teraz; ADOPT rig gdy będą outfity.**
3. **horse.glb → (nie ma problemu) → Farm Horse.fbx → mniej klipów → KEEP.**
4. **cow/sheep → złe nazwy klipów / owca bez walk → ten sam Farm pack → zero zysku → KEEP + rename albo matcher.**
5. **chicken → static CC-BY → (brak w nowych packach) → szukać później → KEEP.**
6. **tree_c/maple → (wystarczające) → Ultimate Nature Pack → gorszy shading → KEEP.**
7. **long_sword CC-BY → atrybucja → Weapons Sword/Claymore CC0 → spójny pack → konwersja + grip. REPLACE later.**
8. **First Age hut_a/b/c → ażurowe „domy” → rzadki roll już w katalogu → zostawić jako ruiny/budowa, nie family home MD+.**

---

## 28. Docelowa architektura Seedvale Asset Library

```text
Seedvale Asset Library
├── Characters
│   ├── Base          EXIST (Modular) / TARGET (UBC) — nie Standard superhero jako final
│   ├── Hair          PARTIAL (UBC 8; Modular baked into head mesh)
│   ├── Faces         MISSING (UBC eyes separate; no face morphs in Standard)
│   ├── Outfits       EXIST baked Modular variants (8) / MISSING on UBC
│   └── Equipment     EXIST held tools; TARGET weapons pack + left hand
├── Animations
│   ├── Locomotion    EXIST Modular subset / TARGET UAL
│   ├── Daily Life    MISSING Modular / PARTIAL UAL
│   ├── Work          MISSING Modular / PARTIAL UAL2
│   ├── Combat        EXIST Modular / richer UAL2
│   └── Physics       MISSING Modular / EXIST UAL1 jump
├── Animals
│   ├── Livestock     EXIST mixed quality; chicken weak
│   └── Wildlife      EXIST UAA (wolf/fox/deer/stag)
├── Buildings         RTS shells KEEP distant; TARGET MegaKit modular interiors
├── Nature            KEEP Stylized Nature + RTS rocks
├── Trees             KEEP; Trees 2020 optional variants
├── Props             KEEP well/crate/…; MegaKit clutter already parked
├── Tools             KEEP held GLB
├── Weapons           ADD after convert
└── Effects           KEEP fire/blood
```

---

## 29. NPC diversity

Czy da się zrobić dziesiątki/setki różnych NPC z modularnego systemu **na tym, co leży na dysku?**

**Nie z UBC Standard.** 2 ciała × 2 odcienie × ~6 fryzur = rząd **kilkudziesięciu** wariantów, wszystkie w kostiumie superbohatera.

**Częściowo z Modular:** 4 męskie + 4 żeńskie baked outfits, bez swap włosów/twarzy. Kolor materiałów da się tintować w runtime (nie zrobione jako system). Profesja = strój z puli, nie slot.

Brakuje: body/age, osobne twarze, outfit slots, equipment slots poza prawą ręką.

Quaternius **wystarczy**, jeśli:

- kupić/pobrać **UBC Source** (więcej ciał/strojów na tym rigu), **albo**
- pojawi się medieval outfit pack na UAL rig, **albo**
- zostać przy Modular i **nie** obiecywać setek unikalnych sylwetek (wystarczy 8 meshy + imiona/osobowość — zgodne z VISION, że rozpoznawalność to zachowanie, nie unikalny mesh).

Dodatkowe źródło (Kenney, Mixamo) **nie** jest potrzebne do animacji, jeśli idziemy w UAL. Mixamo ma sens **tylko** przy pozostaniu na Modular rigu (łatwiejszy retarget na `Wrist.R` niż UAL→Modular).

---

## 30. Player vs NPC

**SAME CHARACTER SYSTEM.**

Jeden szkielet, jedna mapa klipów, jeden `hand.right`/`hand.left`, jeden loader (`loadGltfAnimated`). Player = inny outfit/mesh na tym samym rigu (dziś Adventurer vs Farmer — już ten sam szkielet).

SEPARATE systems podwoiłyby to, co 097 i held tools już bolą: jump clip, grip, crouch hacks.

---

## 31. Physics / collision implications

### Buildings

**Nie** da się zrobić `wall collision + door opening + entrance` z hut_d: nie ma dziury do wycięcia z koła. Opcje bez edycji mesha:

- **Authored:** `entrance {x,z,yaw,width}` + collider = 2–3 kapsuły/AABB ścian (nie koło). Otwór jest logiczny, mesh nadal ślepy — NPC „wchodzi” przez ścianę wizualnie. Źle dla hut_d.
- **MegaKit:** mesh **ma** dziurę → collider ze ścian wokół otworu, entrance = środek framugi, yaw = normalna ściany. Player i NPC ten sam portal. **To jest właściwa droga.**
- First Age ażur: geometria już pusta, ale koło i tak zamyka. Te chaty nadają się na „nie wchodź / nie śpij w środku”, nie na interior.

Bez wyjątków w `NpcAgent`, jeśli collider nie jest pełnym dyskiem na `home`.

### Characters

Hand/head/feet: **tak**, z kości (`Wrist.R`, `Head`, `Foot.L`). Nie trzeba nowych node’ów. Left hand nie jest w metadata.

### Animals

Tak — różne `modelHeight` / footprint; chicken vs cow już to wymuszają. Farm pack nie zmienia tego.

### Props

Well/lantern: pivot origin, interaction **authored**. Broń: orientation niespójna → per-item, jak `HELD_ATTACH`. MegaKit Door: hinge **authored**.

---

## 32. NPC navigation implications

`House → Entrance → Exterior point / Interior point`

| Źródło | Da się wyznaczyć z assetu? |
|---|---|
| hut_d | **Nie** (ślepą ścianą). Można sfabrykować yaw z `lamp_mount` / najdłuższej krawędzi — zgadywanie. |
| First Age | Dziury są, ale to cały obwód, nie jedne drzwi. |
| MegaKit Wall_*_Door | **Tak:** środek otworu occupancy, kierunek = +Z/−Z lokalny ściany (ściana 2×0.4×3.12). Exterior = punkt przed otworem, interior = za otworem. |
| WallTowers_Door | **Tak** analogicznie (brama). |

Późniejszy pathfinding **może** traktować entrance jako portal **tylko** gdy collider ma szczelinę albo graf ma node `entrance`. Koło 097 portalu nie ma.

---

## 33. Findings

### FINDING-001

**Title:** Family home `hut_d` nie ma geometrycznego wejścia  
**Asset:** `public/models/settlement/hut_d.glb` ← `Houses_SecondAge_1_Level1.gltf`  
**Problem:** jeden mesh, 5 materiałów, `exteriorReachesInterior: false`. Drzwi = albedo na `Walls`.  
**Evidence:** occupancy flood-fill; node list = 1; 0 animations.  
**Impact:** CRITICAL — NPC w środku clipuje ścianę; collider koło zamyka gameplay interior.  
**Recommendation:** nie dziurawić mesha w kodzie. Prefab MegaKit albo nie spać „w środku” bryły.  
**Priority:** CRITICAL

### FINDING-002

**Title:** Brak door node/bone/clip we wszystkich budynkach RTS  
**Asset:** Fantasy RTS houses + civic  
**Problem:** nie da się animować drzwi ani zapiąć socketu bez wrappera.  
**Evidence:** glTF JSON, 0 skins/animations.  
**Impact:** HIGH — open/close tylko runtime na obcym pivotcie, którego nie ma.  
**Recommendation:** MegaKit Door_* + authored hinge.  
**Priority:** HIGH

### FINDING-003

**Title:** Collision homes = pełne koło, asset nie dostarcza portal shape  
**Asset:** `HouseCatalogEntry.footprintRadius` + `createSettlement` colliders  
**Problem:** nawet First Age (ażur) i przyszły otwór są zablokowane przez prymityw. Łatka 097 §4.6 tylko wypuszcza z pułapki.  
**Evidence:** implementation notes 097; `NpcAgent.isWalkable`.  
**Impact:** CRITICAL dla interior navigation.  
**Recommendation:** collider ścian + entrance; nie drugi wyjątek AI.  
**Priority:** CRITICAL

### FINDING-004

**Title:** Cow/sheep clip names nie matchują `AnimalAgent.findAction`  
**Asset:** `cow.glb` `Armature|Walk`; `sheep.glb` brak Walk  
**Problem:** exact name `Walk` / `Idle`.  
**Evidence:** inspect clips; `AnimalAgent.ts` `['Idle','Idle_2']`, `['Walk']`, `['Gallop']`.  
**Impact:** MEDIUM — bydło bez lokomocji skinned.  
**Recommendation:** strip prefix przy load **albo** matcher; owca i tak nie ma Walk w packu.  
**Priority:** MEDIUM  
*(opis, nie fix — poza zakresem audytu)*

### FINDING-005

**Title:** Chicken GLB bez szkieletu, patologiczna skala  
**Asset:** `chicken.glb`  
**Problem:** 0 nodes nazwanych, 0 clips, bbox ~167 jednostek.  
**Impact:** MEDIUM — tylko visual po `prepareProp`.  
**Recommendation:** KEEP aż będzie animated CC0 chicken.  
**Priority:** MEDIUM

### FINDING-006

**Title:** UBC Standard ≠ baza populacji  
**Asset:** `Universal Base Characters[Standard]`  
**Problem:** 2 superhero body; license mówi wprost o wycinku.  
**Impact:** HIGH jeśli ktoś zmigruje NPC „na UBC” oczekując Modular diversity.  
**Recommendation:** UBC jako rig+UAL; meshe wiejskie osobno.  
**Priority:** HIGH

### FINDING-007

**Title:** Modular vs UAL — inny szkielet  
**Asset:** `Wrist.R`… vs `hand_r`…  
**Problem:** nie załadujesz UAL na Farmer.glb.  
**Impact:** HIGH dla jump/work anim.  
**Recommendation:** nie retargetować ad hoc w runtime; albo UBC mesh, albo offline retarget.  
**Priority:** HIGH

### FINDING-008

**Title:** Anchory budynków nie pochodzą z assetu  
**Asset:** `ASSET_ANCHORS` lamp/well  
**Problem:** po `gltfpack` nazwy node’ów hut/well znikają; `SV_*` nigdzie nie występuje.  
**Impact:** LOW/MEDIUM — system kotwic działa, ale jest ręczny.  
**Recommendation:** przy MegaKit dodać authored `entrance` w metadata, nie czekać na `SV_` w packu Quaternius.  
**Priority:** MEDIUM

### FINDING-009

**Title:** `heldToolVisual` dokumentuje `WristR`, GLB ma `Wrist.R`  
**Asset:** Adventurer/NPC  
**Problem:** aliasy w kodzie pokrywają obie nazwy — działa. Komentarz myli audytorów.  
**Impact:** LOW  
**Recommendation:** poprawić komentarz przy okazji.  
**Priority:** LOW

### FINDING-010

**Title:** Ultimate Nature Pack to inny produkt niż Ultimate Stylized Nature  
**Asset:** `_temp/.../Ultimate Nature Pack by Quaternius`  
**Problem:** vertex-color, niższe drzewa; łatwo pomylić z already-wired Stylized.  
**Impact:** MEDIUM (zła migracja lasu).  
**Recommendation:** nie podmieniać.  
**Priority:** MEDIUM

---

## 34. Kolejność migracji (zależności)

Nie implementować teraz. Sugerowana kolejność, bo późniejsze kroki jedzą wcześniejsze:

1. **Building entrance + collider z otworem** (MegaKit wall/door + metadata). Odblokowuje NPC w domach bez AI special-case. Nie zależy od UAL.
2. **Clip-name hygiene fauna** (cow/sheep) — małe, niezależne.
3. **Character rig decision freeze:** Modular do czasu outfitów **albo** start UBC+UAL dla **tylko playera** (jump 097) — wtedy dwa rigi na chwilę, sprzeczne z §30. Lepiej: player+NPC razem, gdy będą stroje.
4. **Konwersja UAL+UBC → public/models** (nie wired) + prototyp mixer na manekinie w asset browser (088).
5. **Medieval Weapons → GLB** gdy combat/equipment; grip w browserze.
6. **Trees 2020 pine** tylko jeśli plan 024/073 chce więcej gatunków.
7. **Farm pig/llama** — nie, dopóki gameplay nie wymaga.

Zależność: (3–4) nie odblokowują (1). **Nie** czekać na UBC, żeby naprawić drzwi.

---

## 35. Odpowiedzi końcowe

### Buildings

1. Czy każdy typ domu ma drzwi? **Nie.** First Age nie. `hut_d` ma tylko teksturę.
2. Osobny node/bone? **Nie** (RTS). MegaKit: osobny plik skrzydła, nie bone.
3. Pivot? **Origin modelu**, nie hinge.
4. Animacje drzwi? **Nie.**
5. Rzeczywisty otwór? First Age **tak** (brak ścian). `hut_d` **nie**. MegaKit wall-door **tak**.
6. Entrance position? Z MegaKit **tak**; z hut_d **nie** bez zgadywania.
7. Entrance direction? MegaKit: normalna ściany. RTS: nie.
8. Collision z otworem? Z MegaKit geometrią **tak**. Z kołem 097 **nie**. Z hut_d meshem **nie**.
9. Player i NPC ten sam entrance? **Powinni** — jeden portal w collision layer.

### Characters

10. Obecne NPC wystarczające? **Na v1 lokomocji tak; na życie osady (sen, praca, posiłek) nie.**
11. UBC lepszą bazą? **Rig tak, Standard mesh nie.**
12. Player i NPC ten sam system? **Tak.**
13. Kluczowe animacje teraz: Idle, Walk, Run, Interact, Wave, Death, combat subset.
14. Brak: jump, sit, sleep, eat, drink, chop, farm, carry, talk loop.
15. Sockety: `hand.right` → `Wrist.R`.
16. Brak: left hand, head/back/hip/feet jako seeded anchors, tool grip, building entrance.

### Animals

17. Obecne wild **tak**; livestock **nierówno**.
18. Farm Animals Animated **nie powinny** zastąpić horse/donkey/wild; cow/sheep to ten sam poziom.
19. Brak: drink/sleep; sheep walk; chicken wszystko; cow clip names.
20. Wildlife: **nie** wymaga nowych packów z tej dostawy.

### Ecosystem

21. Quaternius głównym źródłem? **Tak.**
22. Zewnętrzne: CC-BY leftovers (chicken, sickle, pitchfork, fire, wood_pile, long_sword); fishing rod license ❓.
23. Więcej modeli NPC? **Stroje/ciała na rigu UBC albo świadoma limitacja 8 baked.**
24. Rodzaj: medieval outfits, age, hair slots — nie kolejny Farmer.glb.
25. Dodatkowy pack: **UBC Source albo medieval UAL-compatible outfits**, gdy zacznie się migracja postaci. MegaKit już jest.
26. Zastąpić vs rozszerzyć: budynki interior **zastąpić ścieżką MegaKit**; naturę **rozszerzyć**; postacie **rozszerzyć rigen później**; fauna **zachować**.

---

## 36. Decision

RECOMMENDATION

**Characters:**  
KEEP Modular Men/Women + Adventurer jako wired visuals. UBC Standard **nie** jest docelowym meshem osadnika. Docelowy **rig** = UBC (65 kości) w momencie, gdy będą wiejskie stroje na tym szkielecie. Player = NPC.

**Animations:**  
KEEP obecne 24 klipy do lokomocji v1. ADOPT UAL 1+2 jako docelową bibliotekę (jump, sit, talk, chop, farm, carry, consume, sword). Wymaga riga UBC; nie podpinać pod `Wrist.R` w runtime. Wariant **bez** `_RM` na start (ruch z agenta, jak dziś).

**Animals:**  
KEEP UAA wild + horse/donkey. KEEP cow/sheep meshy; nie REPLACE Farm packiem. KEEP chicken. SUPPLEMENT pig/llama tylko z feature. Nie dodawać zebry/puga „dla liczby”.

**Buildings:**  
KEEP RTS jako sylwetki/civic distant. **Nie** używać hut_d jako gameplay-ready interior. TARGET: MegaKit modular (wall with opening + door leaf + authored hinge/entrance) + collision nie-koło. First Age = rare shell, nie MD+ home.

**Nature:**  
KEEP Ultimate Stylized Nature + instancing. Ultimate Nature Pack: **nie** jako las. Ewentualnie tanie skały/sezon później.

**Trees:**  
KEEP current. Textured Trees 2020 = optional variant library (pine/dead), nie zamiana.

**Weapons:**  
CONVERT selected CC0 (sword, axe, spear, bow, shield) gdy combat/equipment. Grip = istniejący wrapper. Kandydat na REPLACE `long_sword` CC-BY.

**Additional sources needed:**  
(1) Wiejskie stroje na UBC **albo** UBC Source — gdy migracja postaci. (2) Animated chicken. (3) Nic do drzwi — MegaKit już na dysku. Mixamo tylko jeśli zostajemy przy Modular na stałe.

**Immediate next step:**  
Plan implementacyjny **building entrance + wall colliders + MegaKit doorway prefab** (zależny od 097, nie od UAL). Osobno, niski koszt: fauna clip-name matcher. Nie otwierać migracji postaci w tym samym PR.

---

## 37. Metryka ukończenia

Na podstawie tego dokumentu, bez zgadywania, wiadomo:

- jakie modele są wired / parked / w `_temp`;
- nodes/bones/clipy (rzeczywiste nazwy);
- które drzwi są dziurą (MegaKit, First Age ażur, brama RTS open), które tylko teksturą (`hut_d`), których nie ma;
- co da się animować w runtime (MegaKit leaf + nasz hinge; UAL na UBC; nie RTS hut);
- możliwości NPC (24 klipy combat/loco) vs UAL (życie/praca/skok);
- możliwości zwierząt per gatunek;
- co KEEP / REPLACE / SUPPLEMENT;
- czego brakuje (entrance, UBC outfits, chicken, clip prefix);
- jaki jest następny krok (budynki, nie retarget).

Technicznie zweryfikowane: inspekcja GLB/GLTF/FBX + kod (2026-08-14). Browser/manual: nie dotyczy (brak zmian runtime).
