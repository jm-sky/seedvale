# Plans

Implementation plans for features and larger changes.

## Status values

`todo` · `planned` · `in progress` · `done` · `verification needed`

## Index

| File | Summary | Status |
|------|---------|--------|
| [2026-08-07--001--v01-terrain-walking.md](./2026-08-07--001--v01-terrain-walking.md) | v0.1: teren + chodzenie 3rd person | `done` |
| [2026-08-07--002--v02-settlement-npc.md](./2026-08-07--002--v02-settlement-npc.md) | v0.2: osada + NPC (woda / drewno / jedzenie) | `done` |
| [2026-08-07--004--v03-fauna-chase-flee.md](./2026-08-07--004--v03-fauna-chase-flee.md) | v0.3: fauna chase/flee (logika done; GLB open) | `done` |
| [2026-08-07--003--day-night-clock.md](./2026-08-07--003--day-night-clock.md) | Zegar dnia/nocy + time multiplier | `done` |
| [2026-08-07--005--game-ui-screens.md](./2026-08-07--005--game-ui-screens.md) | Ekrany/dialogi/modale jak w grach | `in progress` |
| [2026-08-07--006--terrain-worker-pool.md](./2026-08-07--006--terrain-worker-pool.md) | Worker pool dla generacji terenu (offload heightmap) | `done` |
| [2026-08-07--024--world-visual-overhaul.md](./2026-08-07--024--world-visual-overhaul.md) | Rośliny (krzewy), niebo/chmury, góry w tle (insp. SimonDev) | `in progress` |
| [2026-08-07--007--world-streaming-persistence.md](./2026-08-07--007--world-streaming-persistence.md) | Chunk streaming (kierunek: duży/sferyczny świat) + zapis | `done` |
| [2026-08-07--009--post-processing-pipeline.md](./2026-08-07--009--post-processing-pipeline.md) | Post-processing pipeline (EffectComposer) + N8AO ambient occlusion | `done` |
| [2026-08-07--008--grass-rendering.md](./2026-08-07--008--grass-rendering.md) | Trawa: instanced ground cover per chunk, reużycie chunk/worker systemu | `done` |
| [2026-08-07--011--npc-interactions.md](./2026-08-07--011--npc-interactions.md) | Interakcje gracz↔NPC: proximity prompt + prosty dialog ([E]) | `done` |
| [2026-08-07--013--npc-gender-models.md](./2026-08-07--013--npc-gender-models.md) | Modele NPC zsynchronizowane z płcią imienia (żeńskie & męskie) | `done` |
| [2026-08-07--014--npc-reaction-sounds.md](./2026-08-07--014--npc-reaction-sounds.md) | Dźwięki reakcji NPC (Hmm/Tak? przy lookAtPlayer, męskie/żeńskie) | `done` |
| [2026-08-07--022--npc-character-depth.md](./2026-08-07--022--npc-character-depth.md) | Character DB: role + traits (scalone z `npc-1-identity.md`), personality→Big Five, HP (współdzielony z fauną) + ekran „Mieszkańcy” | `done` |
| [2026-08-07--015--quests-v1.md](./2026-08-07--015--quests-v1.md) | Questy v1: minimalny relay quest nad istniejącym dialogiem + quest log/exp/relacje | `verification needed` |
| [2026-08-07--016--ambient-world-audio.md](./2026-08-07--016--ambient-world-audio.md) | Ambient audio zależne od obszaru (świerszcze/ptaki dzień-noc, szum fal blisko oceanu) | `in progress` |
| [2026-08-07--029--minimap.md](./2026-08-07--029--minimap.md) | Mini-mapa (bottom-left, collapsible, kierunek do osady) | `done` |
| [2026-08-07--010--predator-prey-system.md](./2026-08-07--010--predator-prey-system.md) | Predator-prey z HP, damage na kontakt, spawner + respawn | `done` |
| [2026-08-07--017--gaze-highlight-labels.md](./2026-08-07--017--gaze-highlight-labels.md) | Hover/gaze highlight (glow) na etykietach NPC + zwierząt, reużywa `pickInGaze` z quests-v2 | `verification needed` |
| [2026-08-07--018--quests-v2-world-interactions.md](./2026-08-07--018--quests-v2-world-interactions.md) | Questy v2: multi-stage + interakcje ze światem (zwierzęta/studnia/drzewa/spawnery) + itemy (muszle/kamienie, world-gen + odnawialna pula) | `verification needed` |
| [2026-08-07--020--npc-2-daily-routine-and-place.md](./2026-08-07--020--npc-2-daily-routine-and-place.md) | NPC Place system, przycięty do minimum: formalizacja `home` (już działa de facto); per-rola workplace/schedule odłożone | `verification needed` (v1 done — `src/settlement/places.ts`) |
| [2026-08-07--021--npc-3-animal-life.md](./2026-08-07--021--npc-3-animal-life.md) | Animal Life, przycięty do warstwy needs: hunger/thirst/energy → wander bias na `AnimalAgent`; memory/territory/population save odłożone | `todo` |
| [2026-08-07--023--mobile-touch-controls.md](./2026-08-07--023--mobile-touch-controls.md) | Sterowanie dotykowe (joystick + look-drag/pinch + przyciski) i responsywny layout (np. Samsung Galaxy A55), bez zmian w logice gry | `done` |
| [2026-08-07--028--biome-regions.md](./2026-08-07--028--biome-regions.md) | Obszary biomów (pustynia/bagno/las) — makro-oś wilgotności + charakterystyczna roślinność (kaktus, trzcina) | `verification needed` |
| [2026-08-07--026--roads-and-paths.md](./2026-08-07--026--roads-and-paths.md) | Drogi (międzyosadowe) i ścieżki (osada↔port/przystań) — trasowanie po małej zmianie wysokości + wygładzenie terenu + kolor | `verification needed` |
| [2026-08-07--025--multi-settlements.md](./2026-08-07--025--multi-settlements.md) | Wielorakie wioski: generator + streaming (load/unload radius), minimap/panel Mieszkańcy rozszerzone; questy międzywioskowe poza zakresem | `verification needed` |
| [2026-08-07--027--npc-names.md](./2026-08-07--027--npc-names.md) | Imiona NPC: kulturowe pule imion per wioska (`nameCultures.ts`) zaimplementowane; pełny model `firstName/lastName/nickname` z ciała planu — nie | `planned` (kulturowe pule: `verification needed`) |
| [2026-08-07--030--world-elements-interactions.md](./2026-08-07--030--world-elements-interactions.md) | Naturalne elementy świata: głazy/kamienie/powalone pnie/ogniska (dekoracje) + gałęzie/grzyby/kwiaty/szyszki (zbieralne), preferencje środowiskowe per chunk | `verification needed` |
| [2026-08-08--031--village-generation.md](./2026-08-08--031--village-generation.md) | Generowanie wiosek: rozmiar (SM/MD/LG) ważony terenem → rodziny (husband/wife/child) → 1 dom na rodzinę → lokalnie wyrównane obszary terenu → obiekty wspólne | `verification needed` |
| [2026-08-08--032--natural-resources-economy.md](./2026-08-08--032--natural-resources-economy.md) | Naturalne zasoby zależne od terenu → atrakcyjność lokalizacji wioski → dedykowane rodziny/outposty → food source → nazwa wioski → fundament pod przyszły crafting/production/handel | `planned` |
| [2026-08-08--036--village-siting-difficult-terrain.md](./2026-08-08--036--village-siting-difficult-terrain.md) | Lepsze osadzanie wiosek w trudnym terenie — dziś płaskość sprawdzana tylko lokalnie (±2.5 jedn.), więc górskie osady wyglądają rozrzucone | `todo` |
| [2026-08-08--037--npc-genealogy-lineages.md](./2026-08-08--037--npc-genealogy-lineages.md) | Rody NPC (Sem/Cham/Jafet) przypisane wg kierunku osady od (0,0) + kompas „N" na minimapie | `todo` |
| [2026-08-08--038--campfire-lighting.md](./2026-08-08--038--campfire-lighting.md) | Zapalanie ognisk gałęziami (paliwo/czas palenia/dokładanie) — zaimplementowane; 50% szans na już zapalone ognisko wioski w nocy — nadal `todo` | `verification needed` |
| [2026-08-08--039--road-signposts.md](./2026-08-08--039--road-signposts.md) | Kierunkowskazy przy drogach międzyosadowych — nazwa docelowej osady, reużywa CSS2D etykiety jak NPC | `todo` |

When adding a new plan: create `YYYY-MM-DD--{NNN}--slug.md` (next sequential number in plans), add a row here.

## Related

- [research/README.md](../research/README.md)
- [reviews/README.md](../reviews/README.md) — m.in. `to-do--water-quality.md`
- [issues/README.md](../issues/README.md)
