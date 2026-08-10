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
| [2026-08-07--020--npc-2-daily-routine-and-place.md](./2026-08-07--020--npc-2-daily-routine-and-place.md) | NPC Place system: home + schedule/workplace | 50%      | 🔴 high   | L      |
| [2026-08-09--046--vue-tailwind-ui-stack.md](./2026-08-09--046--vue-tailwind-ui-stack.md)                 | Vue + Tailwind v4 + lucide-vue-next dla UI  | 25%      | 🔴 high   | XL     |
| [2026-08-07--021--npc-3-animal-life.md](./2026-08-07--021--npc-3-animal-life.md)                         | Animal Life: hunger/thirst/energy + potrzeby zwierząt | 0%       | 🟡 medium | L      |
| [2026-08-08--039--road-signposts.md](./2026-08-08--039--road-signposts.md)                               | Kierunkowskazy przy drogach: **Fix:** Poprawić kierunek tabliczki. Dodać odstęp między znakami, które są w połowie odległości między wioskami.                             | 67%      | ⚪ `low` | S      |
| [2026-08-09--049--procedural-world-landmarks.md](./2026-08-09--049--procedural-world-landmarks.md)       | Proceduralne obiekty, ruiny i landmarki                        | 40%      | 🟡 medium | XL     |
| [2026-08-07--024--world-visual-overhaul.md](./2026-08-07--024--world-visual-overhaul.md)                 | Rośliny, niebo/chmury, góry w tle           | 50%      | ⚪ `low` | L      |

---

## Planned

| File                                                                                                             | Summary                                                        | Progress | Priority  | Effort |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------- | --------- | ------ |
| [2026-08-10--052--shovel-digging-and-finding-stones.md](./2026-08-10--052--shovel-digging-and-finding-stones.md) | Kopanie ziemi i znajdowanie kamieni [have implementation notes] | 0%       | 🔴 high   | M      |
| [2026-08-10--054--world-bundle-reference-safety-and-small-refactors.md](./2026-08-10--054--world-bundle-reference-safety-and-small-refactors.md) | Bezpieczeństwo referencji `WorldBundle` + małe refaktory po 053 | 0% | 🟡 medium | S–M |
| [2026-08-07--045--health-stamina-threat.md](./2026-08-07--045--health-stamina-threat.md)                         | Wspólny Health/Stamina/Threat dla NPC/fauny/gracza             | 0%       | 🟡 medium | XL     |
| [2026-08-09--047--village-generation-overhaul.md](./2026-08-09--047--village-generation-overhaul.md)             | VillageIdentity, VillagePlan, strefy, drogi, scoring i layout  | 0%       | 🔴 high   | XL     |
| [2026-08-08--040--seasons-weather.md](./2026-08-08--040--seasons-weather.md)                                     | Pory roku i pogoda wpływające na świat                         | 0%       | 🟡 medium | XL     |

---

## Todo

| File                                                                                       | Summary                                               | Progress | Priority  | Effort |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------- | -------- | --------- | ------ |
| [2026-08-08--037--npc-genealogy-lineages.md](./2026-08-08--037--npc-genealogy-lineages.md) | Rody NPC + przypisanie wg kierunku osady              | 0%       | ⚪ low   | L      |

---

## Verification needed

| File                                                                                                           | Summary                                                 | Progress | Priority  | Effort |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------- | --------- | ------ |
| [2026-08-08--032--natural-resources-economy.md](./2026-08-08--032--natural-resources-economy.md)               | Zasoby naturalne, atrakcyjność lokalizacji, food source | 100%     | 🔴 high   | M      |
| [2026-08-08--036--village-siting-difficult-terrain.md](./2026-08-08--036--village-siting-difficult-terrain.md) | Osadzanie wiosek w trudnym terenie                      | 25%      | 🟡 medium | M      |

---

## Done

| File | Summary |
|------|---------|
| [2026-08-07--001--v01-terrain-walking.md](./2026-08-07--001--v01-terrain-walking.md) | v0.1: teren + chodzenie 3rd person |
| [2026-08-07--002--v02-settlement-npc.md](./2026-08-07--002--v02-settlement-npc.md) | v0.2: osada + NPC (woda / drewno / jedzenie) |
| [2026-08-07--003--day-night-clock.md](./2026-08-07--003--day-night-clock.md) | Zegar dnia/nocy + time multiplier |
| [2026-08-07--004--v03-fauna-chase-flee.md](./2026-08-07--004--v03-fauna-chase-flee.md) | v0.3: fauna chase/flee |
| [2026-08-07--006--terrain-worker-pool.md](./2026-08-07--006--terrain-worker-pool.md) | Worker pool dla generacji terenu |
| [2026-08-07--007--world-streaming-persistence.md](./2026-08-07--007--world-streaming-persistence.md) | Chunk streaming + zapis |
| [2026-08-07--008--grass-rendering.md](./2026-08-07--008--grass-rendering.md) | Instanced ground cover per chunk |
| [2026-08-07--027--npc-names.md](./2026-08-07--027--npc-names.md) | Kulturowe imiona, nazwiska rodzinne, nickname |
| [2026-08-07--009--post-processing-pipeline.md](./2026-08-07--009--post-processing-pipeline.md) | EffectComposer + N8AO |
| [2026-08-07--010--predator-prey-system.md](./2026-08-07--010--predator-prey-system.md) | Predator-prey, HP, damage, spawner, respawn |
| [2026-08-07--011--npc-interactions.md](./2026-08-07--011--npc-interactions.md) | Proximity prompt + dialog `[E]` |
| [2026-08-07--013--npc-gender-models.md](./2026-08-07--013--npc-gender-models.md) | Modele NPC zsynchronizowane z płcią |
| [2026-08-07--014--npc-reaction-sounds.md](./2026-08-07--014--npc-reaction-sounds.md) | Dźwięki reakcji NPC |
| [2026-08-07--015--quests-v1.md](./2026-08-07--015--quests-v1.md) | Questy v1 + quest log + exp/relacje |
| [2026-08-07--016--ambient-world-audio.md](./2026-08-07--016--ambient-world-audio.md) | Ambient audio zależne od obszaru |
| [2026-08-07--017--gaze-highlight-labels.md](./2026-08-07--017--gaze-highlight-labels.md) | Hover/gaze highlight etykiet NPC i zwierząt |
| [2026-08-07--018--quests-v2-world-interactions.md](./2026-08-07--018--quests-v2-world-interactions.md) | Questy v2 + interakcje ze światem + itemy |
| [2026-08-07--022--npc-character-depth.md](./2026-08-07--022--npc-character-depth.md) | Character DB, role, traits, Big Five, HP, ekran mieszkańców |
| [2026-08-07--023--mobile-touch-controls.md](./2026-08-07--023--mobile-touch-controls.md) | Sterowanie dotykowe + responsywny layout |
| [2026-08-07--025--multi-settlements.md](./2026-08-07--025--multi-settlements.md) | Wiele wiosek + streaming + minimap/panel |
| [2026-08-07--026--roads-and-paths.md](./2026-08-07--026--roads-and-paths.md) | Drogi międzyosadowe i ścieżki lokalne |
| [2026-08-07--028--biome-regions.md](./2026-08-07--028--biome-regions.md) | Obszary biomów + charakterystyczna roślinność |
| [2026-08-07--029--minimap.md](./2026-08-07--029--minimap.md) | Mini-mapa + kierunek do osady |
| [2026-08-07--030--world-elements-interactions.md](./2026-08-07--030--world-elements-interactions.md) | Elementy naturalne + zbieralne |
| [2026-08-08--031--village-generation.md](./2026-08-08--031--village-generation.md) | Generowanie wiosek, rodziny, domy, teren |
| [2026-08-08--038--campfire-lighting.md](./2026-08-08--038--campfire-lighting.md) | Ogniska, paliwo, czas palenia, budowanie ogniska |
| [2026-08-10--041--wait-rest-time-skip.md](./2026-08-10--041--wait-rest-time-skip.md) | Czekaj/odpoczynek + time skip |
| [2026-08-10--042--fauna-player-awareness.md](./2026-08-10--042--fauna-player-awareness.md) | Świadomość gracza przez faunę + ucieczka |
| [2026-08-08--043--player-inventory-equipment.md](./2026-08-08--043--player-inventory-equipment.md) | Ekwipunek gracza v1 + podstawowe wyposażenie |
| [2026-08-08--044--world-life-details.md](./2026-08-08--044--world-life-details.md) | Światła domów, fauna, propsy, studnia, detale świata |
| [2026-08-09--048--npc-dialogues-v2.md](./2026-08-09--048--npc-dialogues-v2.md) | Dialogi NPC v2 + menu rozmowy |
| [2026-08-09--050--fire-torch.md](./2026-08-09--050--fire-torch.md) | Ognisko, palenisko i przenośna pochodnia |
| [2026-08-09--051--visual-atmosphere-lighting.md](./2026-08-09--051--visual-atmosphere-lighting.md) | Fog, dynamiczne światło/niebo, bloom, god rays |
| [2026-08-10--053--createapp-refactor.md](./2026-08-10--053--createapp-refactor.md) | Refaktor `createApp.ts`, game loop, modal state, interactables (R5+R6) |

---

## Quick notes / bugs

- ~~Mgła (dodana w `2026-08-09--051--visual-atmosphere-lighting.md`) - w górach wszedłem w mgłę i nic nie widziałem. Ogółem mgły jest trochę za dużo.~~ → poprawione (weryfikacja potrzebna), dwie osobne rzeczy: (1) `fogNear` (`src/world/dayNight.ts`) zaczynał się już przy 70 jednostkach, przesunięte do 130-180 (`fogFar` bez zmian — dostrojone do zasięgu strumieniowania chunków). (2) Prawdziwy winowajca "nic nie widziałem" to god rays, nie mgła — `src/render/godRaysShader.ts` akumulował 32 nieklampowane próbki; patrząc blisko słońca wszystkie trafiały w niemal ten sam jasny, jeszcze nie tonemapowany piksel nieba, dając wielokrotność 1.0 i biały/szary "whiteout" po ACES. Dodany clamp na wkład promieni.
- ~~Światło w domach (dodane w `2026-08-08--044--world-life-details.md` i poprawione ostatnio) - kostka wisi w powietrzu obok domu, czasem nawet jakby 2 metry obok.~~ → poprawione (weryfikacja potrzebna): pierwsza poprawka (czekanie na `waitForChunks` dla niedomowych osad, patrz niżej) usuwała tylko jedną przyczynę. Druga, właściwa: `createHouseLight` zakładał lampę na 85% z `hutBounds.max.z`, czyli że ściana jest płaska i zwrócona w +Z na wysokości 40% modelu — nieprawdziwe dla żadnego z 3 wariantów `HUT_URLS` (potwierdzone raycastingiem: jeden ma ścianę tylko do ~25% wysokości, inny ma realną ścianę pod kątem 45°/225°, nie na osi Z). `props.ts::findWallMount` szuka teraz prawdziwego punktu na powierzchni bryły (raycast z zewnątrz, kilka wysokości/kątów) zamiast zgadywać z bounding boxa.
- ~~Obiekty czasem "latają" nad ziemią. Np. krzaki. To wynika pewnie ze złego pozycjonowania, które nie bierze pod uwagę modyfikatorów...?~~ → poprawione (weryfikacja potrzebna): trafna intuicja — `chunkManager.sampleHeight` dla niezaladowanego jeszcze chunka cicho spada do surowej, nie spłaszczonej wysokości terenu (bez blendingu village-clearing), inne niż to, co faktycznie renderuje się w tym miejscu chwilę później. Niedomowe osady (`SettlementsManager.ts::ensureLoaded`) budowały swoje propsy (chatki/lampy/las) zanim ich własne chunki terenu zdążyły się w ogóle załadować — teraz czeka na `chunkManager.waitForChunks(...)` wokół siedziby osady przed budową, tak jak już robiła to osada domowa.
- ~~NPC w trakcie rozmowy z graczem, potrafi sobie odejść.~~ → poprawione (weryfikacja potrzebna): design był poprawny (`src/app/dialogueTimeControl.ts` już spowalnia zegar 4× i mrozi tylko rozmówcę przez monkey-patch `NpcAgent.prototype.update`, reszta świata ma dalej chodzić) — bug w tym, że `ui = reactive({...})` (`ui-vue/store.ts`) głęboko owija przypisane obiekty w Proxy, a `openNpcDialogueMenu` zapisywał `state.npc = npc` bez `markRaw()`. Porównanie `ui.npcDialogueMenu.npc === this` w patchu nigdy nie było prawdziwe (proxy ≠ surowa instancja), więc "zamrożenie" rozmówcy nigdy się nie uruchamiało. `refreshVillagers` już miał ten sam problem rozwiązany (`markRaw(e.npc)`) — `openNpcDialogueMenu` tego brakowało.
- ~~Aplikacja przeładowuje się przy zmianach w plikach .md z katalogu docs/ - nie powinna.~~ → poprawione (weryfikacja potrzebna): potwierdzone bezpośrednio na żywym serwerze (nasłuch na jego HMR websocket) — dotyczyło nie tylko `docs/`, ale KAŻDEGO istniejącego, nie-gitignorowanego pliku w repo przy edycji, także `README.md`/`CLAUDE.md`/`.editorconfig` w roocie. `@source not` w Tailwind CSS załatwiał tylko jedną z dwóch ścieżek reloadu (ta z `triggeredBy` w komunikacie WS) i wymagał restartu dev servera, żeby się w ogóle załapać. Właściwa poprawka na poziomie samego watchera: `vite.config.ts`'s `server.watch.ignored: ['**/*.md']` — żaden plugin w ogóle nie widzi już zmiany.
- Morze/ocean wygląda słabo - lepszy byłby troszkę bardziej przezroczysty. [low priority]

When adding a new plan: create `YYYY-MM-DD--{NNN}--slug.md` (next sequential number in plans), add a row to the appropriate status section above.

## Related

* [research/README.md](../research/README.md)
* [reviews/README.md](../reviews/README.md) — m.in. `to-do--water-quality.md`
* [issues/README.md](../issues/README.md)
