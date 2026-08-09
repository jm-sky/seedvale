# Plans

Implementation plans for features and larger changes.

## Status values

`todo` · `planned` · `in progress` · `done` · `verification needed`

## Index

| File | Summary | Status |
|------|---------|--------|
| [2026-08-07--001--v01-terrain-walking.md](./2026-08-07--001--v01-terrain-walking.md) | v0.1: teren + chodzenie 3rd person | `done` ✅ |
| [2026-08-07--002--v02-settlement-npc.md](./2026-08-07--002--v02-settlement-npc.md) | v0.2: osada + NPC (woda / drewno / jedzenie) | `done` ✅ |
| [2026-08-07--004--v03-fauna-chase-flee.md](./2026-08-07--004--v03-fauna-chase-flee.md) | v0.3: fauna chase/flee (logika done; GLB open) | `done` ✅ |
| [2026-08-07--003--day-night-clock.md](./2026-08-07--003--day-night-clock.md) | Zegar dnia/nocy + time multiplier | `done` ✅ (5/5 — NPC sen zależny od pory + persystencja `timeOfDay` w save zaimplementowane) |
| [2026-08-07--005--game-ui-screens.md](./2026-08-07--005--game-ui-screens.md) | Ekrany/dialogi/modale jak w grach | `in progress` 🔄 (2/4 — Pause menu + NPC dialog/Quest log/Villagers done; World config screen i Notes/journal nie rozpoczęte) |
| [2026-08-07--006--terrain-worker-pool.md](./2026-08-08--006--terrain-worker-pool.md) | Worker pool dla generacji terenu (offload heightmap) | `done` ✅ |
| [2026-08-07--024--world-visual-overhaul.md](./2026-08-07--024--world-visual-overhaul.md) | Rośliny (krzewy), niebo/chmury, góry w tle (insp. SimonDev) | `in progress` 🔄 (~50% — część 1 rośliny + część 2 kolor nieba done; chmury + część 3 góry w tle nie rozpoczęte) |
| [2026-08-07--007--world-streaming-persistence.md](./2026-08-07--007--world-streaming-persistence.md) | Chunk streaming (kierunek: duży/sferyczny świat) + zapis | `done` ✅ |
| [2026-08-07--009--post-processing-pipeline.md](./2026-08-07--009--post-processing-pipeline.md) | Post-processing pipeline (EffectComposer) + N8AO ambient occlusion | `done` ✅ |
| [2026-08-07--008--grass-rendering.md](./2026-08-07--008--grass-rendering.md) | Trawa: instanced ground cover per chunk, reużycie chunk/worker systemu | `done` ✅ |
| [2026-08-07--011--npc-interactions.md](./2026-08-07--011--npc-interactions.md) | Interakcje gracz↔NPC: proximity prompt + prosty dialog ([E]) | `done` ✅ |
| [2026-08-07--013--npc-gender-models.md](./2026-08-07--013--npc-gender-models.md) | Modele NPC zsynchronizowane z płcią imienia (żeńskie & męskie) | `done` ✅ |
| [2026-08-07--014--npc-reaction-sounds.md](./2026-08-07--014--npc-reaction-sounds.md) | Dźwięki reakcji NPC (Hmm/Tak? przy lookAtPlayer, męskie/żeńskie) | `done` ✅ |
| [2026-08-07--022--npc-character-depth.md](./2026-08-07--022--npc-character-depth.md) | Character DB: role + traits (scalone z `npc-1-identity.md`), personality→Big Five, HP (współdzielony z fauną) + ekran „Mieszkańcy” | `done` ✅ |
| [2026-08-07--015--quests-v1.md](./2026-08-07--015--quests-v1.md) | Questy v1: minimalny relay quest nad istniejącym dialogiem + quest log/exp/relacje | `done` ✅ |
| [2026-08-07--016--ambient-world-audio.md](./2026-08-07--016--ambient-world-audio.md) | Ambient audio zależne od obszaru (świerszcze/ptaki dzień-noc, szum fal blisko oceanu) | `verification needed` 🔍 (4/5 — fundament, dzień/noc, sampler obszaru, warstwy forest/coast done; warstwa mountain czeka na asset wiatru) |
| [2026-08-07--029--minimap.md](./2026-08-07--029--minimap.md) | Mini-mapa (bottom-left, collapsible, kierunek do osady) | `done` ✅ |
| [2026-08-07--010--predator-prey-system.md](./2026-08-07--010--predator-prey-system.md) | Predator-prey z HP, damage na kontakt, spawner + respawn | `done` ✅ |
| [2026-08-07--017--gaze-highlight-labels.md](./2026-08-07--017--gaze-highlight-labels.md) | Hover/gaze highlight (glow) na etykietach NPC + zwierząt, reużywa `pickInGaze` z quests-v2 | `done` ✅ |
| [2026-08-07--018--quests-v2-world-interactions.md](./2026-08-07--018--quests-v2-world-interactions.md) | Questy v2: multi-stage + interakcje ze światem (zwierzęta/studnia/drzewa/spawnery) + itemy (muszle/kamienie, world-gen + odnawialna pula) | `done` ✅ |
| [2026-08-07--020--npc-2-daily-routine-and-place.md](./2026-08-07--020--npc-2-daily-routine-and-place.md) | NPC Place system: v1 `home` **done**; v2 (Schedule Template per rola, `workplace` hybrid landmark/nowy prop, generyczny FSM `goTo`/`execute`) odmrożony 2026-08-09, zakres ustalony, implementacja jeszcze nie ruszona | `in progress` 🔄 (v1 **done**; v2 scope zdecydowany — patrz „Decyzje (2026-08-09)” w pliku planu — kod jeszcze nie napisany: `PlaceType` dalej ograniczony do `'home'`, `role` dalej tylko dana) |
| [2026-08-07--021--npc-3-animal-life.md](./2026-08-07--021--npc-3-animal-life.md) | Animal Life, przycięty do warstwy needs: hunger/thirst/energy → wander bias na `AnimalAgent`; memory/territory/population save odłożone | `todo` ⬜ |
| [2026-08-07--023--mobile-touch-controls.md](./2026-08-07--023--mobile-touch-controls.md) | Sterowanie dotykowe (joystick + look-drag/pinch + przyciski) i responsywny layout (np. Samsung Galaxy A55), bez zmian w logice gry | `done` ✅ |
| [2026-08-07--028--biome-regions.md](./2026-08-07--028--biome-regions.md) | Obszary biomów (pustynia/bagno/las) — makro-oś wilgotności + charakterystyczna roślinność (kaktus, trzcina) | `done` ✅ |
| [2026-08-07--026--roads-and-paths.md](./2026-08-07--026--roads-and-paths.md) | Drogi (międzyosadowe) i ścieżki (osada↔port/przystań) — trasowanie po małej zmianie wysokości + wygładzenie terenu + kolor | `verification needed` 🔍 |
| [2026-08-07--025--multi-settlements.md](./2026-08-07--025--multi-settlements.md) | Wielorakie wioski: generator + streaming (load/unload radius), minimap/panel Mieszkańcy rozszerzone; questy międzywioskowe poza zakresem | `verification needed` 🔍 |
| [2026-08-07--027--npc-names.md](./2026-08-07--027--npc-names.md) | Imiona NPC: kulturowe pule imion per wioska (`nameCultures.ts`) + `lastName` per rodzina (issue 008) zaimplementowane; `nickname` z ciała planu — nie | `verification needed` 🔍 (`nickname`: `planned` 📋) |
| [2026-08-07--030--world-elements-interactions.md](./2026-08-07--030--world-elements-interactions.md) | Naturalne elementy świata: głazy/kamienie/powalone pnie/ogniska (dekoracje) + gałęzie/grzyby/kwiaty/szyszki (zbieralne), preferencje środowiskowe per chunk | `verification needed` 🔍 |
| [2026-08-08--031--village-generation.md](./2026-08-08--031--village-generation.md) | Generowanie wiosek: rozmiar (SM/MD/LG) ważony terenem → rodziny (husband/wife/child) → 1 dom na rodzinę → lokalnie wyrównane obszary terenu → obiekty wspólne | `verification needed` 🔍 |
| [2026-08-08--032--natural-resources-economy.md](./2026-08-08--032--natural-resources-economy.md) | Naturalne zasoby zależne od terenu → atrakcyjność lokalizacji wioski → dedykowane rodziny/outposty → food source → nazwa wioski → fundament pod przyszły crafting/production/handel | `verification needed` 🔍 (checklist §14 zaimplementowana, `src/terrain/naturalResources.ts`) |
| [2026-08-08--036--village-siting-difficult-terrain.md](./2026-08-08--036--village-siting-difficult-terrain.md) | Lepsze osadzanie wiosek w trudnym terenie — dziś płaskość sprawdzana tylko lokalnie (±2.5 jedn.), więc górskie osady wyglądają rozrzucone | `verification needed` 🔍 (1/4 — Punkt 1: core-object flatness retry) |
| [2026-08-08--037--npc-genealogy-lineages.md](./2026-08-08--037--npc-genealogy-lineages.md) | Rody NPC (Sem/Cham/Jafet) przypisane wg kierunku osady od (0,0) + kompas „N" na minimapie | `todo` ⬜ |
| [2026-08-08--038--campfire-lighting.md](./2026-08-08--038--campfire-lighting.md) | Zapalanie ognisk gałęziami (paliwo/czas palenia/dokładanie) + wolnostojące ogniska budowane przez gracza (2x gałąź + 2x kamień, menu pauzy) + 50% szans na już zapalone ognisko wioski w nocy — wszystkie zaimplementowane | `verification needed` 🔍 (4/4 — punkty 1-4 done) |
| [2026-08-08--039--road-signposts.md](./2026-08-08--039--road-signposts.md) | Kierunkowskazy przy drogach międzyosadowych — nazwa docelowej osady, reużywa CSS2D etykiety jak NPC | `verification needed` 🔍 (2/3 — krawędź osady + w połowie trasy) |
| [2026-08-08--040--seasons-weather.md](./2026-08-08--040--seasons-weather.md) | Pory roku + pogoda (szkic od ChatGPT) — sezony wpływają na zasoby/roślinność, pogoda na widoczność/dźwięk | `planned` 📋 |
| [2026-08-10--041--wait-rest-time-skip.md](./2026-08-10--041--wait-rest-time-skip.md) | Czekaj (1/3/6h, widoczne przyspieszenie) + Odpoczynek (obóz/miasto, 8h, fade-to-black) w Quick Actions — czysty skok czasu, bez player-stat systemu | `verification needed` 🔍 |
| [2026-08-10--042--fauna-player-awareness.md](./2026-08-10--042--fauna-player-awareness.md) | Zwierzęta unikają zapalonych ognisk + uciekają przed zauważonym graczem (stożek widzenia, pora dnia, biom, gatunek) — HP/stamina odłożone do Fazy 2 | `verification needed` 🔍 |
| [2026-08-08--043--player-inventory-equipment.md](./2026-08-08--043--player-inventory-equipment.md) | Ekwipunek gracza v1: dedykowany ekran, waga, akcje, zbieranie + nóż/krzesiwo/koc; zarys equipment, durability i craftingu na przyszłość | `done` ✅ (potwierdzone w przeglądarce; Użyj/Połącz z §6 świadomie pominięte — brak jeszcze aktywnego narzędzia/craftingu do podpięcia) |
| [2026-08-08--044--world-life-details.md](./2026-08-08--044--world-life-details.md) | Drobne życie i detale świata: światła w domach, nowe zwierzęta dzikie i gospodarskie, propsy, studnia, kwiaty/kamienie, naturalność drzew i fauna vs wioska | `verification needed` 🔍 (zaimplementowane, wymaga weryfikacji wizualnej w przeglądarce) |
| [2026-08-08--045--health-stamina-threat.md](./2026-08-08--045--health-stamina-threat.md) | Wspólny Health/Stamina/Threat: stamina dla NPC/fauny/gracza, exhaustion, attack/flee i reakcje na obrażenia | `planned` 📋 (draft) |
| [2026-08-09--046--vue-tailwind-ui-stack.md](./2026-08-09--046--vue-tailwind-ui-stack.md) | Vue.js + Tailwind v4 + lucide-vue-next jako stack dla UI gry (dialogi/menu) — odwraca decyzję z planu 005 „poza zakresem"; migracja screen-po-screen za dzisiejszym fasadowym kontraktem, rozwiązuje issue 005 (ikony) i issue 006 (paginacja Mieszkańcy) po drodze | `in progress` 🔄 (Faza 0 — setup + PoC — done; pierwszy realny ekran, plan 048's `NpcDialogueMenu.vue`, już wylądował poza kolejnością Faz; Fazy 1+ dalej nieruszone) |
| [2026-08-09--047--village-generation-overhaul.md](./2026-08-09--047--village-generation-overhaul.md) | Przebudowa generowania wiosek: VillageIdentity (type/size/traits/history), VillagePlan, strefy, centrum, drogi, teren, relacje budynków, layout patterns, scoring i kontrolowana losowość | `planned` 📋 |
| [2026-08-09--048--npc-dialogues-v2.md](./2026-08-09--048--npc-dialogues-v2.md) | Dialogi NPC v2: menu rozmowy (5 tematów) nad istniejącym `dialogue.ts`/needs/schedule/questy/rodzina/wioska — zweryfikowane wobec kodu, zakres v1 przycięty | `verification needed` 🔍 (zaimplementowane 2026-08-10 — `src/ai/dialogueTemplates.ts`, `NpcAgent.familyMembers`/`getCurrentActivity`, `src/ui-vue/NpcDialogueMenu.vue`; wymaga weryfikacji wizualnej w przeglądarce) |
| [2026-08-09--049--procedural-world-landmarks.md](./2026-08-09--049--procedural-world-landmarks.md) | Proceduralne obiekty i landmarki terenu: częste dekoracje, rzadkie ruiny/lokacje, bardzo rzadkie landmarki; modułowe low-poly konstrukcje i zasada czytelności | `planned` 📋 |
| [2026-08-09--050--fire-torch.md](./2026-08-09--050--fire-torch.md) | Ognisko i pochodnia: proste ognisko z drewna, palenisko z kamieni + ognisko oraz przenośna pochodnia | `planned` 📋 |
| [2026-08-09--051--visual-atmosphere-lighting.md](./2026-08-09--051--visual-atmosphere-lighting.md) | Visual polish: atmospheric fog, dynamiczne niebo/światło, subtelny bloom/glow i god rays | `planned` 📋 |

When adding a new plan: create `YYYY-MM-DD--{NNN}--slug.md` (next sequential number in plans), add a row here.

## Related

- [research/README.md](../research/README.md)
- [reviews/README.md](../reviews/README.md) — m.in. `to-do--water-quality.md`
- [issues/README.md](../issues/README.md)
