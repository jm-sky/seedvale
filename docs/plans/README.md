# Plans

Implementation plans for features and larger changes.

## Status values

- `in progress` 🔄 — implementation is currently underway
- `verification needed` 🔍 — implementation is complete, but requires verification
- `planned` 📋 — defined plan, ready for implementation
- `todo` ⬜ — idea or task not yet prioritized
- `done` ✅ — implemented and verified

## Priority

🔴 `high` · 🟡 `medium` · ⚪ `low`

## Effort

`XS` — kilka minut · `S` — ~15–30 min · `M` — ~30–90 min · `L` — ~1–3 h · `XL` — większa zmiana / kilka sesji

---

## In progress

| File                                                                                                     | Summary                                     | Progress | Priority  | Effort |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------- | --------- | ------ |
| [2026-08-07--005--game-ui-screens.md](./2026-08-07--005--game-ui-screens.md)                             | Ekrany/dialogi/modale jak w grach           | 50%      | 🔴 high   | L      |
| [2026-08-07--024--world-visual-overhaul.md](./2026-08-07--024--world-visual-overhaul.md)                 | Rośliny, niebo/chmury, góry w tle           | 50%      | 🟡 medium | L      |
| [2026-08-07--020--npc-2-daily-routine-and-place.md](./2026-08-07--020--npc-2-daily-routine-and-place.md) | NPC Place system: home + schedule/workplace | 50%      | 🔴 high   | L      |
| [2026-08-09--046--vue-tailwind-ui-stack.md](./2026-08-09--046--vue-tailwind-ui-stack.md)                 | Vue + Tailwind v4 + lucide-vue-next dla UI  | 25%      | 🔴 high   | XL     |
| [2026-08-08--039--road-signposts.md](./2026-08-08--039--road-signposts.md)                                     | Kierunkowskazy przy drogach: **Fix:** Poprawić kierunek tabliczki, dodać odstęp między znakami, które są w połowie odległości między wioskami.                             | 67%      | 🟡 medium | S      |

---

## Planned

| File                                                                                                             | Summary                                                        | Progress | Priority  | Effort |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------- | --------- | ------ |
| [2026-08-08--040--seasons-weather.md](./2026-08-08--040--seasons-weather.md)                                     | Pory roku i pogoda wpływające na świat                         | 0%       | 🟡 medium | XL     |
| [2026-08-07--045--health-stamina-threat.md](./2026-08-07--045--health-stamina-threat.md)                         | Wspólny Health/Stamina/Threat dla NPC/fauny/gracza             | 0%       | 🟡 medium | XL     |
| [2026-08-09--047--village-generation-overhaul.md](./2026-08-09--047--village-generation-overhaul.md)             | VillageIdentity, VillagePlan, strefy, drogi, scoring i layout  | 0%       | 🔴 high   | XL     |
| [2026-08-09--049--procedural-world-landmarks.md](./2026-08-09--049--procedural-world-landmarks.md)               | Proceduralne obiekty, ruiny i landmarki                        | 0%       | 🟡 medium | XL     |
| [2026-08-10--052--shovel-digging-and-finding stones.md](./2026-08-10--052--shovel-digging-and-finding stones.md) | Kopanie ziemi i znajdowanie kamieni                            | 0%       | 🔴 high   | M      |

---

## Todo

| File                                                                                       | Summary                                               | Progress | Priority  | Effort |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------- | -------- | --------- | ------ |
| [2026-08-07--021--npc-3-animal-life.md](./2026-08-07--021--npc-3-animal-life.md)           | Animal Life: hunger/thirst/energy + potrzeby zwierząt | 0%       | 🟡 medium | L      |
| [2026-08-08--037--npc-genealogy-lineages.md](./2026-08-08--037--npc-genealogy-lineages.md) | Rody NPC + przypisanie wg kierunku osady              | 0%       | ⚪ low     | L      |

---

## Verification needed

| File                                                                                                           | Summary                                                 | Progress | Priority  | Effort |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------- | --------- | ------ |
| [2026-08-08--032--natural-resources-economy.md](./2026-08-08--032--natural-resources-economy.md)               | Zasoby naturalne, atrakcyjność lokalizacji, food source | 100%     | 🔴 high   | M      |
| [2026-08-08--036--village-siting-difficult-terrain.md](./2026-08-08--036--village-siting-difficult-terrain.md) | Osadzanie wiosek w trudnym terenie                      | 25%      | 🟡 medium | M      |

---

## Done

| File                                                                                                   | Summary                                                     | Progress |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | -------- |
| [2026-08-07--001--v01-terrain-walking.md](./2026-08-07--001--v01-terrain-walking.md)                   | v0.1: teren + chodzenie 3rd person                          | 100%     |
| [2026-08-07--002--v02-settlement-npc.md](./2026-08-07--002--v02-settlement-npc.md)                     | v0.2: osada + NPC (woda / drewno / jedzenie)                | 100%     |
| [2026-08-07--003--day-night-clock.md](./2026-08-07--003--day-night-clock.md)                           | Zegar dnia/nocy + time multiplier                           | 100%     |
| [2026-08-07--004--v03-fauna-chase-flee.md](./2026-08-07--004--v03-fauna-chase-flee.md)                 | v0.3: fauna chase/flee                                      | 100%     |
| [2026-08-07--006--terrain-worker-pool.md](./2026-08-07--006--terrain-worker-pool.md)                   | Worker pool dla generacji terenu                            | 100%     |
| [2026-08-07--007--world-streaming-persistence.md](./2026-08-07--007--world-streaming-persistence.md)   | Chunk streaming + zapis                                     | 100%     |
| [2026-08-07--008--grass-rendering.md](./2026-08-07--008--grass-rendering.md)                           | Instanced ground cover per chunk                            | 100%     |
| [2026-08-07--027--npc-names.md](./2026-08-07--027--npc-names.md)                                               | Kulturowe imiona, nazwiska rodzinne, nickname           | 100%     | 🟡 medium | S      |
| [2026-08-07--009--post-processing-pipeline.md](./2026-08-07--009--post-processing-pipeline.md)         | EffectComposer + N8AO                                       | 100%     |
| [2026-08-07--010--predator-prey-system.md](./2026-08-07--010--predator-prey-system.md)                 | Predator-prey, HP, damage, spawner, respawn                 | 100%     |
| [2026-08-07--011--npc-interactions.md](./2026-08-07--011--npc-interactions.md)                         | Proximity prompt + dialog `[E]`                             | 100%     |
| [2026-08-07--013--npc-gender-models.md](./2026-08-07--013--npc-gender-models.md)                       | Modele NPC zsynchronizowane z płcią                         | 100%     |
| [2026-08-07--014--npc-reaction-sounds.md](./2026-08-07--014--npc-reaction-sounds.md)                   | Dźwięki reakcji NPC                                         | 100%     |
| [2026-08-07--015--quests-v1.md](./2026-08-07--015--quests-v1.md)                                       | Questy v1 + quest log + exp/relacje                         | 100%     |
| [2026-08-07--016--ambient-world-audio.md](./2026-08-07--016--ambient-world-audio.md)                   | Ambient audio zależne od obszaru                            | 100%     |
| [2026-08-07--017--gaze-highlight-labels.md](./2026-08-07--017--gaze-highlight-labels.md)               | Hover/gaze highlight etykiet NPC i zwierząt                 | 100%     |
| [2026-08-07--018--quests-v2-world-interactions.md](./2026-08-07--018--quests-v2-world-interactions.md) | Questy v2 + interakcje ze światem + itemy                   | 100%     |
| [2026-08-07--022--npc-character-depth.md](./2026-08-07--022--npc-character-depth.md)                   | Character DB, role, traits, Big Five, HP, ekran mieszkańców | 100%     |
| [2026-08-07--023--mobile-touch-controls.md](./2026-08-07--023--mobile-touch-controls.md)               | Sterowanie dotykowe + responsywny layout                    | 100%     |
| [2026-08-07--025--multi-settlements.md](./2026-08-07--025--multi-settlements.md)                       | Wiele wiosek + streaming + minimap/panel                    | 100%     |
| [2026-08-07--026--roads-and-paths.md](./2026-08-07--026--roads-and-paths.md)                                   | Drogi międzyosadowe i ścieżki lokalne                   | 100%     | 🟡 medium | M      |
| [2026-08-07--028--biome-regions.md](./2026-08-07--028--biome-regions.md)                               | Obszary biomów + charakterystyczna roślinność               | 100%     |
| [2026-08-07--029--minimap.md](./2026-08-07--029--minimap.md)                                           | Mini-mapa + kierunek do osady                               | 100%     |
| [2026-08-07--030--world-elements-interactions.md](./2026-08-07--030--world-elements-interactions.md)   | Elementy naturalne + zbieralne                              | 100%     |
| [2026-08-08--031--village-generation.md](./2026-08-08--031--village-generation.md)                     | Generowanie wiosek, rodziny, domy, teren                    | 100%     |
| [2026-08-08--038--campfire-lighting.md](./2026-08-08--038--campfire-lighting.md)                       | Ogniska, paliwo, czas palenia, budowanie ogniska            | 100%     |
| [2026-08-10--041--wait-rest-time-skip.md](./2026-08-10--041--wait-rest-time-skip.md)                   | Czekaj/odpoczynek + time skip                               | 100%     |
| [2026-08-10--042--fauna-player-awareness.md](./2026-08-10--042--fauna-player-awareness.md)                     | Świadomość gracza przez faunę + ucieczka                | 100%     | 🟡 medium | M      |
| [2026-08-08--043--player-inventory-equipment.md](./2026-08-08--043--player-inventory-equipment.md)     | Ekwipunek gracza v1 + podstawowe wyposażenie                | 100%     |
| [2026-08-08--044--world-life-details.md](./2026-08-08--044--world-life-details.md)                             | Światła domów, fauna, propsy, studnia, detale świata    | 100%     | 🟡 medium | M      |
| [2026-08-09--048--npc-dialogues-v2.md](./2026-08-09--048--npc-dialogues-v2.md)                         | Dialogi NPC v2 + menu rozmowy                               | 100%     |
| [2026-08-09--050--fire-torch.md](./2026-08-09--050--fire-torch.md)                                     | Ognisko, palenisko i przenośna pochodnia                    | 100%     |
| [2026-08-09--051--visual-atmosphere-lighting.md](./2026-08-09--051--visual-atmosphere-lighting.md)             | Fog, dynamiczne światło/niebo, bloom, god rays          | 100%     | 🟡 medium | M      |
| [2026-08-10--053--createapp-refactor.md](./2026-08-10--053--createapp-refactor.md)                             | Refaktor `createApp.ts`, game loop, modal state, interactables (R5+R6) | 100%     | 🟡 medium | L      |

---

## Quick notes / bugs

- Mgła (dodana w `2026-08-09--051--visual-atmosphere-lighting.md`) - w górach wszedłem w mgłę i nic nie widziałem. Ogółem mgły jest trochę za dużo.
- Światło w domach (dodane w `2026-08-08--044--world-life-details.md` i poprawione ostatnio) - kostka wisi w powietrzu obok domu, czasem nawet jakby 2 metry obok.
- Obiekty czasem "latają" nad ziemią. Np. krzaki. To wynika pewnie ze złego pozycjonowania, które nie bierze pod uwagę modyfikatorów...?
- NPC w trakcie rozmowy z graczem, potrafi sobie odejść.
- Aplikacja przeładowuje się przy zmianach w plikach .md z katalogu docs/ - nie powinna.
- Morze/ocean wygląda słabo - lepszy byłby troszkę bardziej przezroczysty. [low priority]

When adding a new plan: create `YYYY-MM-DD--{NNN}--slug.md` (next sequential number in plans), add a row to the appropriate status section above.

## Related

* [research/README.md](../research/README.md)
* [reviews/README.md](../reviews/README.md) — m.in. `to-do--water-quality.md`
* [issues/README.md](../issues/README.md)
