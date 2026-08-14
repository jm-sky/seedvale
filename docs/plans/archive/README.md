# Archived plans

**Jednorazowe archiwum** planów z pierwszego okresu projektu (~2026-08-07–2026-08-14), przeniesionych gdy osiągnęły `done` albo `verification needed`.

**Nie** source of truth dla „jak jest teraz”. Trwałe reguły: [STATE.md](../../STATE.md), [SETTLEMENTS.md](../../SETTLEMENTS.md), [WATER.md](../../WATER.md), [GRAPHICS.md](../../GRAPHICS.md), [ARCHITECTURE.md](../../ARCHITECTURE.md).

Nowych planów tu **nie przenosimy**. Kolejne plany zostają w [docs/plans/](../README.md) niezależnie od statusu.

**Jak używać:** otwórz plan + `*-implementation-notes.md`, gdy dokument domenowy nie wystarcza (dlaczego tak zrobiono, ograniczenia, kroki playtestu). Notes/review leżą obok planu i nie są indeksowane osobno.

---

## Verification needed

Implemented; still waiting on browser/play check. Compact queue also in the [live README](../README.md#playtest-queue-archived-batch).

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

Companion notes stay next to the plan in this folder. Do not add new plans here.
