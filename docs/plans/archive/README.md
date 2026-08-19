# Archived plans

Historia planowania Seedvale, przeniesiona z [docs/plans/](../README.md) w dwóch snapshotach, gdy plany osiągnęły `done` albo `verification needed` i przestały być potrzebne w bieżącej mapie planowania. Zobacz [Snapshot 1](#snapshot-1--2026-08-07--2026-08-14) i [Snapshot 2](#snapshot-2--2026-08-14--2026-08-19) niżej.

**Nie** source of truth dla „jak jest teraz”. Trwałe reguły: [STATE.md](../../STATE.md), [SETTLEMENTS.md](../../SETTLEMENTS.md), [WATER.md](../../WATER.md), [GRAPHICS.md](../../GRAPHICS.md), [ARCHITECTURE.md](../../ARCHITECTURE.md).

Nowych planów tu **nie przenosimy** ręcznie przy każdym `done`. Plany zostają w [docs/plans/](../README.md) niezależnie od statusu, dopóki kolejny snapshot nie przeniesie tych, które przestały być potrzebne jako current context — zobacz "Recent context vs archive" w [docs/plans/README.md](../README.md).

**Jak używać:** otwórz plan + `*-implementation-notes.md`, gdy dokument domenowy nie wystarcza (dlaczego tak zrobiono, ograniczenia, kroki playtestu). Notes/review leżą obok planu i nie są indeksowane osobno.

---

## Snapshot 1 — 2026-08-07 – 2026-08-14

Pierwsze jednorazowe archiwum: plany z pierwszego okresu projektu, przeniesione gdy osiągnęły `done` albo `verification needed`.

## Verification needed

Implemented; still waiting on browser/play check.

### Osady / wioski

| ID | File | Outcome |
|----|------|---------|
| 036 | [village-siting-difficult-terrain](./2026-08-08--036--village-siting-difficult-terrain.md) | Siting unika tropu/mokrego; częściowo, issue 029 nadal w kolejce |
| 071 | [local-economy-and-settlement-development](./2026-08-11--071--local-economy-and-settlement-development.md) | `SettlementEconomy` stock/demand; woodshed z nadwyżki drewna |
| 074 | [house-catalog-scale-lamps-debug](./2026-08-12--074--house-catalog-scale-lamps-debug.md) | `HOUSE_CATALOG` per model; debug `[E] Obejrzyj` |
| 076 | [village-generator-polish](./2026-08-12--076--village-generator-polish.md) | Zużyte drogi, plaza, yaw domów, First Age shells |
| 077 | [village-gardens-scale](./2026-08-12--077--village-gardens-scale.md) | Ogrody S/M/L ~1 na 3 domy |
| 095 | [village-hay-and-garden-plaza](./2026-08-13--095--village-hay-and-garden-plaza.md) | Stóg siana; ogród poza dyskiem placu |

### Las / narzędzia / zbieractwo

| ID | File | Outcome |
|----|------|---------|
| 058 | [living-forest-tree-lifecycle](./2026-08-10--058--living-forest-tree-lifecycle.md) | Sparse overrides + wzrost od `elapsedDays` |
| 061 | [dig-ux-held-tool-and-level](./2026-08-11--061--dig-ux-held-tool-and-level.md) | Dig/level tylko przy trzymanej łopacie |
| 065 | [wire-nature-and-ore-models](./2026-08-11--065--wire-nature-and-ore-models.md) | GLB skały/klody/złoża + fallback proceduralny |
| 085 | [handheld-lights-and-village-torches](./2026-08-12--085--handheld-lights-and-village-torches.md) | Gałąź/pochodnia w ręku; pochodnie wioski o zmierzchu |
| 086 | [grass-generation-in-worker](./2026-08-12--086--grass-generation-in-worker.md) | Trawa w workerze; baseline `Simulate (ms)` OK |
| 087 | [vegetation-and-prop-instancing](./2026-08-12--087--vegetation-and-prop-instancing.md) | `InstancedMesh` drzew/krzewów/skał per chunk |
| 091 | [renewable-tree-branches](./2026-08-12--091--renewable-tree-branches.md) | Odnawialne gałęzie na żywych drzewach |
| 096 | [fauna-glb-held-tools-lights-vfx](./2026-08-13--096--fauna-glb-held-tools-lights-vfx.md) | GLB fauny, hold melee, blood splat |

### Fauna / jaskinie

| ID | File | Outcome |
|----|------|---------|
| 056 | [hungry-predator-human-aggression](./2026-08-10--056--hungry-predator-human-aggression.md) | `predatorHumanDecision`: hunger vs fear/tłum/ogień |
| 064 | [cave-spawner-road-avoidance-and-visual](./2026-08-11--064--cave-spawner-road-avoidance-and-visual.md) | Spawnery omijają korytarze dróg |
| 080 | [wild-fauna-village-avoidance-and-spawn-spacing](./2026-08-12--080--wild-fauna-village-avoidance-and-spawn-spacing.md) | Unikanie footprintu osady + min. odstęp spawnerów |
| 083 | [cave-mouth-terrain-depression](./2026-08-12--083--cave-mouth-terrain-depression.md) | Jaskinia = dziura w terenie + pierścień skał |
| 094 | [fauna-food-water-for-satiety-hydration](./2026-08-13--094--fauna-food-water-for-satiety-hydration.md) | Forage / brzeg / padlina zamiast flat reliefu |

### Fizyka

| ID | File | Outcome |
|----|------|---------|
| 097 | [physics-falling-collisions-jumping](./2026-08-13--097--physics-falling-collisions-jumping.md) | Opadanie itemów, kolizje, skok (3 fazy) |

### UI / audio / rest

| ID | File | Outcome |
|----|------|---------|
| 059 | [inventory-pick-drop-sfx](./2026-08-11--059--inventory-pick-drop-sfx.md) | SFX podnoszenia/rzucania |
| 075 | [time-skip-npc-catchup](./2026-08-12--075--time-skip-npc-catchup.md) | NPC doganiają czas przy wait/rest |
| 078 | [distance-oneshot-falloff](./2026-08-12--078--distance-oneshot-falloff.md) | `playAt` z linear falloff |
| 084 | [camp-rest-sequence-and-town-rest-visibility](./2026-08-12--084--camp-rest-sequence-and-town-rest-visibility.md) | Obóz + „Odpocznij w mieście” w zasięgu osady |
| 088 | [asset-alignment-browser](./2026-08-12--088--asset-alignment-browser.md) | `/asset-browser.html` + anchory |
| 089 | [better-minimap-and-world-map](./2026-08-12--089--better-minimap-and-world-map.md) | Heading-up minimapa, mapa świata, FoW |
| 090 | [sword-merchant-tent-caves-pickaxe](./2026-08-12--090--sword-merchant-tent-caves-pickaxe.md) | Miecz, Kupiec, namiot, duże jaskinie, kilof |
| 102 | [settlement-build-frame-yielding](./2026-08-13--102--settlement-build-frame-yielding.md) | Yield klatek przy budowie osady (issue 027) |

### NPC

| ID | File | Outcome |
|----|------|---------|
| 060 | [npc-schedule-actions-and-trait-overlays](./2026-08-11--060--npc-schedule-actions-and-trait-overlays.md) | Executable `eat`/`home`/`wake` + overlay cech |
| 092 | [npc-stamina-and-daily-vigor](./2026-08-13--092--npc-stamina-and-daily-vigor.md) | `VigorState`; collapse → sen w miejscu/domu |

---

## Done

### Fundament

| ID | File | Outcome |
|----|------|---------|
| 001 | [v01-terrain-walking](./2026-08-07--001--v01-terrain-walking.md) | Chunked heightmap + chodzenie |
| 003 | [day-night-clock](./2026-08-07--003--day-night-clock.md) | Zegar dnia/nocy |
| 006 | [terrain-worker-pool](./2026-08-07--006--terrain-worker-pool.md) | Generacja terenu w workerach |
| 007 | [world-streaming-persistence](./2026-08-07--007--world-streaming-persistence.md) | Load/unload chunków + IndexedDB |
| 008 | [grass-rendering](./2026-08-07--008--grass-rendering.md) | Instanced grass + wind |
| 009 | [post-processing-pipeline](./2026-08-07--009--post-processing-pipeline.md) | EffectComposer, N8AO, SMAA |
| 024 | [world-visual-overhaul](./2026-08-07--024--world-visual-overhaul.md) | Więcej drzew/krzewów + sky rayleigh (~50%); chmury/góry poza zakresem |
| 028 | [biome-regions](./2026-08-07--028--biome-regions.md) | Biomy / wilgotność |
| 062 | [terrain-generation-overhaul](./2026-08-11--062--terrain-generation-overhaul.md) | Makro + ridges + FBM detalu |
| 063 | [forest-regions-and-habitat-distribution](./2026-08-11--063--forest-regions-and-habitat-distribution.md) | `forestDensityAt`, habitat fauny |
| 066 | [better-visual-effects](./2026-08-11--066--better-visual-effects.md) | Grass scatter, film grade |
| 068 | [uneven-road-surfaces](./2026-08-11--068--uneven-road-surfaces.md) | Wobble/potholes/meander dróg |

### Osady / NPC

| ID | File | Outcome |
|----|------|---------|
| 002 | [v02-settlement-npc](./2026-08-07--002--v02-settlement-npc.md) | Pierwsza osada + NPC |
| 011 | [npc-interactions](./2026-08-07--011--npc-interactions.md) | Dialog v1 |
| 013 | [npc-gender-models](./2026-08-07--013--npc-gender-models.md) | Modele płci |
| 014 | [npc-reaction-sounds](./2026-08-07--014--npc-reaction-sounds.md) | SFX reakcji NPC |
| 020 | [npc-2-daily-routine-and-place](./2026-08-07--020--npc-2-daily-routine-and-place.md) | Place, szablony ról, `activityAt` |
| 022 | [npc-character-depth](./2026-08-07--022--npc-character-depth.md) | Osobowość, cechy, Big Five |
| 025 | [multi-settlements](./2026-08-07--025--multi-settlements.md) | Wiele streamowanych osad |
| 026 | [roads-and-paths](./2026-08-07--026--roads-and-paths.md) | Drogi między osadami |
| 027 | [npc-names](./2026-08-07--027--npc-names.md) | Imiona i nazwiska rodzin |
| 031 | [village-generation](./2026-08-08--031--village-generation.md) | Generator wiosek (poprzednik 047) |
| 038 | [campfire-lighting](./2026-08-08--038--campfire-lighting.md) | Ogniska wioski / gracza |
| 044 | [world-life-details](./2026-08-08--044--world-life-details.md) | Drobne rekwizyty życia osady |
| 048 | [npc-dialogues-v2](./2026-08-09--048--npc-dialogues-v2.md) | Dialog Vue, tematy rozmowy |
| 072 | [settlement-visuals-nameplate-palisade](./2026-08-11--072--settlement-visuals-nameplate-palisade.md) | Tablica przy studni, palisada inland |
| 073 | [tree-types-height-age-overhaul](./2026-08-12--073--tree-types-height-age-overhaul.md) | `sizeClass` + zakres wysokości wg wieku |
| 047 | [village-generation-overhaul](./2026-08-09--047--village-generation-overhaul.md) | `VillagePlan` → `SettlementDef`; plan-first generator |
| 079 | [interaction-queue-well-drink](./2026-08-12--079--interaction-queue-well-drink.md) | FIFO kolejka przy studni |
| 099 | [wheat-field-glb](./2026-08-13--099--wheat-field-glb.md) | `farm.glb` na landmarku `field` |
| 100 | [garden-crops-scale-and-pad](./2026-08-13--100--garden-crops-scale-and-pad.md) | `crops.glb` + pad ziemi pod grządkami |
| 101 | [cactus-reed-well-woodpile](./2026-08-13--101--cactus-reed-well-woodpile.md) | GLB kaktus/trzcina/studnia/stos drewna |

### Fauna / walka

| ID | File | Outcome |
|----|------|---------|
| 004 | [v03-fauna-chase-flee](./2026-08-07--004--v03-fauna-chase-flee.md) | Chase/flee |
| 010 | [predator-prey-system](./2026-08-07--010--predator-prey-system.md) | Role drapieżnik/ofiara |
| 021 | [npc-3-animal-life](./2026-08-07--021--npc-3-animal-life.md) | Hunger/thirst/stamina zwierząt |
| 042 | [fauna-player-awareness](./2026-08-10--042--fauna-player-awareness.md) | Świadomość gracza / panic |
| 045 | [health-stamina-threat](./2026-08-08--045--health-stamina-threat.md) | Wspólny `HealthState` / `StaminaState` |

### Itemy / świat

| ID | File | Outcome |
|----|------|---------|
| 015 | [quests-v1](./2026-08-07--015--quests-v1.md) | `QuestManager` + relay |
| 016 | [ambient-world-audio](./2026-08-07--016--ambient-world-audio.md) | Łóżka ambientu (las, noc, wybrzeże, …) |
| 017 | [gaze-highlight-labels](./2026-08-07--017--gaze-highlight-labels.md) | Etykiety przy spojrzeniu |
| 018 | [quests-v2-world-interactions](./2026-08-07--018--quests-v2-world-interactions.md) | Questy wieloetapowe / świat |
| 029 | [minimap](./2026-08-07--029--minimap.md) | Minimapa v1 |
| 030 | [world-elements-interactions](./2026-08-07--030--world-elements-interactions.md) | Zbieralne w świecie |
| 041 | [wait-rest-time-skip](./2026-08-10--041--wait-rest-time-skip.md) | Czekaj / odpoczynek |
| 043 | [player-inventory-equipment](./2026-08-08--043--player-inventory-equipment.md) | Inventory + waga |
| 050 | [fire-torch](./2026-08-09--050--fire-torch.md) | Ognisko / pochodnia v1 |
| 051 | [visual-atmosphere-lighting](./2026-08-09--051--visual-atmosphere-lighting.md) | Atmosfera / światło |
| 052 | [shovel-digging-and-finding-stones](./2026-08-10--052--shovel-digging-and-finding-stones.md) | Łopata, deformacja terenu, kamienie |
| 057 | [axe-player-tree-harvesting](./2026-08-10--057--axe-player-tree-harvesting.md) | Siekiera, wieloetapowy chop |
| 067 | [minimap-heading-and-north](./2026-08-11--067--minimap-heading-and-north.md) | Heading-up + marker N |
| 082 | [village-tool-props-and-temp-assets](./2026-08-12--082--village-tool-props-and-temp-assets.md) | Widły/sierp pickup + clutter |

### App / UI

| ID | File | Outcome |
|----|------|---------|
| 005 | [game-ui-screens](./2026-08-07--005--game-ui-screens.md) | Ekrany gry (pauza, quest log, …) |
| 023 | [mobile-touch-controls](./2026-08-07--023--mobile-touch-controls.md) | Joystick + look-drag |
| 046 | [vue-tailwind-ui-stack](./2026-08-09--046--vue-tailwind-ui-stack.md) | Vue Fazy 0–4; joystick vanilla; browser verify nadal otwarta |
| 053 | [createapp-refactor](./2026-08-10--053--createapp-refactor.md) | `createApp` + `WorldBundle` |
| 054 | [world-bundle-reference-safety](./2026-08-10--054--world-bundle-reference-safety-and-small-refactors.md) | Żywe odczyty pól bundle po rebuild |
| 055 | [shared-simulation-architecture](./2026-08-10--055--shared-simulation-architecture.md) | `PlannedAction` / lifecycle / scoring |

### Woda / grafika

| ID | File | Outcome |
|----|------|---------|
| 098 | [water-unified-shader-shore-reflections](./2026-08-13--098--water-unified-shader-shore-reflections.md) | Jedna rodzina shadera, brzeg, lustro 256² |

### Superseded / folded

| ID | File | Outcome |
|----|------|---------|
| 012 | [npc-labels](./2026-08-07--012--npc-labels.md) | Wchłonięte przez 017 / 022 |
| 019 | [npc-1-identity](./2026-08-07--019--npc-1-identity.md) | Wchłonięte przez 022 |
| 032 | [natural-resources-economy](./2026-08-08--032--natural-resources-economy.md) | Kierunek; gospodarka lokalna = 071 |
| 039 | [road-signposts](./2026-08-08--039--road-signposts.md) | Drogowskazy między osadami |

---

## Snapshot 2 — 2026-08-14 – 2026-08-19

**Data:** 2026-08-19 (rozszerzone tego samego dnia, patrz amendment niżej). **Zakres:** plany 040–165 (drugi okres pracy, od zamrożenia Snapshot 1 do dziś).

**Co zostało zamknięte:** 42 plany + 1 nieindeksowany dokument audytowy (`asset-audit-3d-models`, referencje z `docs/prompts`/`docs/reviews` zaktualizowane), wszystkie potwierdzone jako `done` (playtest accepted albo — dla kilku małych/wewnętrznych planów — implementacja + techniczna weryfikacja bez dedykowanego playtestu) we własnym nagłówku `Status:` planu, bez formalnej `Depends on` referencji z żadnego obecnie aktywnego/planned/todo/verification planu. Zgrupowane niżej wg tematu.

**Korekta statusu przy okazji tego snapshotu:** sześć planów (`103`, `111`, `112`, `113`, `119`, `145`) siedziało w tabeli „Done”/„Todo” poprzedniego README, mimo że ich własny nagłówek `Status:` mówi `verification needed` — najpierw przeniesione do `## Verification needed` w [live README](../README.md), **nie** zarchiwizowane od razu.

**Amendment (2026-08-19, tego samego dnia):** po browser/playtest verification pięciu z tych planów — `103`, `112`, `113`, `119`, `145` — ich `Status:` zaktualizowany na `done` ✅ ("browser verified 2026-08-19") i przeniesione do tego snapshotu razem z `049` (procedural-world-landmarks, było już `done`, brakowało formalnej `Depends on` referencji więc kwalifikowało się do archiwizacji) i `157` (production-pointlight-budget, `done`, było w Recent context jako bezpośredni poprzednik `149` — usunięte stamtąd po archiwizacji). Plan `111` (house-construction) **nie** jest w tym snapshocie — playtest 2026-08-18 wykrył realny błąd składania domków, więc zostaje `verification needed` w live README do czasu poprawki.

**Jakie plany pozostały aktywne:** pełna, aktualna mapa jest w [live README](../README.md) — `in progress` (093, 149), `planned` (104, 126, 127, 151, 152, 159, 161, 162, 164), `todo` (037, 070) i `verification needed` (111, 129, 132).

**Najważniejsze zależności zachowane jako "Recent context" (nie zarchiwizowane — patrz live README):** `106` player-needs-food-and-cooking, `122` natural-resource-gathering-and-water-distribution, `069` npc-household-resources, `156` npc-household-and-settlement-storage-logistics — fundament, na którym stoją `126`/`127`/`152`/`159`/`070`; `155` inventory-item-instances-and-trap-lifecycle i `160` high-quality-melee-weapons — dependency `161`/`162`; `150` combat-mode-defense-and-downed-state — dependency `162`; `110` quests-v3-closure — dependency `132`, narrative closure dla `093`; `109` megakit-construction-catalog — dependency `111`. (`049` i `157` były tu wcześniej — teraz archived, patrz amendment powyżej; ich rolę jako dependency dokumentuje `Depends on` w live README, np. `132`'s `~~049~~`.)

**Najważniejsze świeże zmiany domknięte w tym snapshocie:** universal melee combat + gap-close + mobile target acquisition (123/124b/142) jako fundament pod combat mode (150, recent context); player skills sneak/survival (124/128); fire lighting + campfire GLB (130/135); item expansion (134); weather surface effects (133) i seasons/weather core (040); cross-chunk vegetation batching, water reflection GPU i grass GPU LOD (143/144/148) jako zamknięty etap S rendering-performance przed obecnym `149`; three.js 0.180→0.185 upgrade (136); fauna herds/juveniles, probabilistic perception, spawn-point limits, habitat/carcass visuals, harvested remains, day-scale respawn (118/120/125/137/138/139); NPC critical-need interrupt (114), reaction-to-player (117), stuck-at-house locomotion (108) + audyt assetów 3D; UI/audio polish (105 UI/UX audit, 107 asset browser, 116 dialogue audio, 121 footstep refresh, 153 mobile playtest fixes, 154 volume controls, 158 jump/land SFX, 163 rest/mobile UI/inventory polish, 165 reset graphics/audio settings); animal traps (141).

### Rendering / performance

| ID | File | Outcome |
|----|------|---------|
| 103 | [performance-diagnostics-benchmark](./2026-08-13--103--performance-diagnostics-benchmark.md) | Diagnostyka wydajności, benchmarki, profile jakości (etapy 1–4; Adaptive = później); browser verified 2026-08-19 |
| 112 | [chunk-streaming-hitch-optimization](./2026-08-14--112--chunk-streaming-hitch-optimization.md) | Rozłożenie `buildAndAttachMesh` na 1/klatkę przez `ChunkManager`; browser verified 2026-08-19 |
| 113 | [rendering-performance-gpu-scaling](./2026-08-14--113--rendering-performance-gpu-scaling.md) | P0/P1 (+ tani P2 LOD/cienie): tańsze N8AO, cień raz/klatkę, instancing, lustro 30 Hz, grass LOD; browser verified 2026-08-19 |
| 119 | [chunk-streaming-performance](./2026-08-15--119--chunk-streaming-performance.md) | Hitchy chunk streaming: preload GLB + kolejka mesh/content; stampede po `await` szablonów usunięty; browser verified 2026-08-19 |
| 136 | [threejs-180-to-185-upgrade](./2026-08-16--136--threejs-180-to-185-upgrade.md) | Upgrade `three` `0.180.0`→`0.185.1` (`PCFShadowMap`, `Clock`→`Timer`) |
| 143 | [cross-chunk-vegetation-batching](./2026-08-17--143--cross-chunk-vegetation-batching.md) | Region 3×3 vegetation batching |
| 144 | [water-reflection-gpu-optimization](./2026-08-17--144--water-reflection-gpu-optimization.md) | Mirror outer-ring cull (Stage S) |
| 145 | [shadow-budget-optimization](./2026-08-17--145--shadow-budget-optimization.md) | R1 pull-based dirty/budget shadow map update + R2 size threshold dla item fallbacków; browser verified 2026-08-19 |
| 148 | [grass-gpu-performance](./2026-08-17--148--grass-gpu-performance.md) | Grass geometry LOD (S) |
| 157 | [production-pointlight-budget](./2026-08-18--157--production-pointlight-budget.md) | Production `NUM_POINT_LIGHTS` budget **16**; real-GPU stream/night verified; direct predecessor of `149` |

### World / terrain / climate

| ID | File | Outcome |
|----|------|---------|
| 040 | [seasons-weather](./2026-08-08--040--seasons-weather.md) | Deterministyczny sezon/pogoda `(seed, elapsedDays)`, fog + GPU particles + rain SFX |
| 049 | [procedural-world-landmarks](./2026-08-09--049--procedural-world-landmarks.md) | Landmarki v1: monolith / stoneCircle / smallRuins / cemetery + bias terenu; dependency of `132` |
| 133 | [weather-surface-effects](./2026-08-16--133--weather-surface-effects.md) | Mokry teren / kałuże / śnieg na shaderze chunka (`uWetness`/`uSnowAmount`) |
| 140 | [landscape-flora-and-village-cobble](./2026-08-17--140--landscape-flora-and-village-cobble.md) | Sosny textured, paproć, grzyb GLB, trzcina, pień harvestu, bruk MD+ |

### Settlements / NPC

| ID | File | Outcome |
|----|------|---------|
| 105 | [ui-ux-review](./2026-08-14--105--ui-ux-review.md) | Audyt UI/UX + H1–H3 / Character / handel / `[U]`; H4 poza handlem otwarte |
| 107 | [asset-browser-agent-discovery](./2026-08-14--107--asset-browser-agent-discovery.md) | Asset Browser: search + parked MegaKit + authored scale |
| 108 | [npc-stuck-at-house-locomotion](./2026-08-14--108--npc-stuck-at-house-locomotion.md) | NPC nie utyka w/przy chatce (rim + rescue) |
| 114 | [npc-critical-need-vigor-interrupt](./2026-08-14--114--npc-critical-need-vigor-interrupt.md) | Krytyczna potrzeba przerywa akcję NPC już w locie |
| 116 | [super-dialogue-audio-pack](./2026-08-14--116--super-dialogue-audio-pack.md) | Dialog NPC: hello/bye/confirm, głos per NPC (5 aktorów) |
| 117 | [npc-reaction-to-player](./2026-08-14--117--npc-reaction-to-player.md) | Reakcje NPC: nie każdy auto-greet; osobowość/relacja/reputacja |
| — | [asset-audit-3d-models](./2026-08-14--asset-audit-3d-models.md) | Audyt assetów 3D (dlaczego NPC utykają w domach) — nieindeksowany dokument, bez `NNN`; przeniesiony razem z 108 |

### Fauna

| ID | File | Outcome |
|----|------|---------|
| 118 | [fauna-stada-i-mlode](./2026-08-14--118--fauna-stada-i-mlode.md) | Stada deer/stag/boar + luźne króliki; młode |
| 120 | [fauna-probabilistic-perception](./2026-08-15--120--fauna-probabilistic-perception.md) | Percepcja: falloff dystansu × facing × dzień/noc/las |
| 125 | [fauna-spawn-point-population-limits](./2026-08-16--125--fauna-spawn-point-population-limits.md) | Lifecycle spawn pointów fauny + `SaveData` v17 |
| 137 | [animal-habitat-and-carcass-visuals](./2026-08-17--137--animal-habitat-and-carcass-visuals.md) | `[E] Zniszcz` kanał, spalony cave/thicket, pozostałości po harvestcie |
| 138 | [harvested-remains-glb](./2026-08-17--138--harvested-remains-glb.md) | Po harvestcie GLB `bones_pile` + kości + skóra + skrawki mięsa |
| 139 | [fauna-day-scale-respawn](./2026-08-17--139--fauna-day-scale-respawn.md) | Respawn cave/thicket w dniach świata, catch-up przy skipie |

### Items / player / combat

| ID | File | Outcome |
|----|------|---------|
| 123 | [universal-melee-combat](./2026-08-15--123--universal-melee-combat.md) | Uniwersalny melee: `ITEM_CATALOG[].melee` + `playerMelee.ts` |
| 124 | [player-skills-sneak](./2026-08-15--124--player-skills-sneak.md) | Skills foundation + Sneak |
| 124b | [forgiving-melee-targeting-gap-close](./2026-08-15--124b--forgiving-melee-targeting-gap-close.md) | Target acquisition + gap-close (lunge ≤3 m) |
| 128 | [player-skills-survival-and-camp](./2026-08-16--128--player-skills-survival-and-camp.md) | Skills v2: XP krzywa, Survival, camp rest quality |
| 130 | [fire-lighting-polish](./2026-08-16--130--fire-lighting-polish.md) | Zapalanie z kanałem, burst/SFX tylko od gracza, iskry+żar |
| 131 | [natural-resource-gathering](./2026-08-16--131--natural-resource-gathering.md) | Wood deposit tylko po udanym harvestcie; NPC ore → `SettlementEconomy` |
| 134 | [item-expansion-and-world-placement](./2026-08-16--134--item-expansion-and-world-placement.md) | Dzida/krótki miecz, mięso per gatunek, `hide`, `cheese`/`dried_meat` |
| 135 | [campfire-glb-body](./2026-08-16--135--campfire-glb-body.md) | Ciało ogniska `campfire_unlit.glb` + `fx/fire.glb` |
| 141 | [animal-traps](./2026-08-17--141--animal-traps.md) | Pułapki: `placed → active → placed/broken`, skill `traps`, save v16 |
| 142 | [mobile-combat-target-acquisition](./2026-08-17--142--mobile-combat-target-acquisition.md) | Touch: szerszy stożek + commit yaw na cel |

### UI / audio / rest

| ID | File | Outcome |
|----|------|---------|
| 121 | [footstep-sound-refresh](./2026-08-15--121--footstep-sound-refresh.md) | Kroki: Anton Z default (sand/grass/stone) |
| 153 | [mobile-playtest-fixes](./2026-08-18--153--mobile-playtest-fixes.md) | Mobile: well crowding, `[R]` quick-use, harvest knife, HP regen, quest icons |
| 154 | [audio-volume-controls](./2026-08-18--154--audio-volume-controls.md) | Suwaki głośności (Wszystko / Otoczenie / Efekty) |
| 158 | [false-jump-land-sfx](./2026-08-18--158--false-jump-land-sfx.md) | Slope-stick + próg land SFX |
| 163 | [rest-mobile-ui-and-inventory-interaction-polish](./2026-08-18--163--rest-mobile-ui-and-inventory-interaction-polish.md) | Odpoczynek Esc/auto-wybudzenie, Merchant Screen mobile, `[Tab]` cycle, kategorie Inventory |
| 165 | [reset-graphics-and-audio-settings](./2026-08-19--165--reset-graphics-and-audio-settings.md) | Pauza → Ustawienia: Resetuj ustawienia |

---

Companion notes stay next to the plan in this folder. Do not add new plans here.
