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

## Dependencies

The `Depends on` column describes **implementation dependencies**, not thematic relationships. IDs refer to plan numbers. `—` means no meaningful prerequisite.

A dependency that is `done` is shown with ~~strikethrough~~. This makes it immediately visible whether a plan is **ready to implement**: all dependencies must be crossed out. Dependencies that are still `in progress`, `planned`, `todo`, or `verification needed` remain visible normally.

Use dependencies to determine implementation order. A plan may be conceptually related to another plan without depending on it.

---

## In progress

| File | Summary | Progress | Priority | Effort | Depends on |
|------|---------|----------|----------|--------|------------|
| [2026-08-08--039--road-signposts.md](./2026-08-08--039--road-signposts.md) | Kierunkowskazy: fix yaw tabliczki + odstęp midpoint; skrzyżowania nadal later | 80% | ⚪ low | S | ~~026~~ |
| [2026-08-09--049--procedural-world-landmarks.md](./2026-08-09--049--procedural-world-landmarks.md) | Proceduralne obiekty, ruiny i landmarki | 40% | 🟡 medium | XL | ~~001~~, ~~006~~, ~~007~~, ~~028~~, ~~030~~ |
| [2026-08-07--024--world-visual-overhaul.md](./2026-08-07--024--world-visual-overhaul.md) | Rośliny, niebo/chmury, góry w tle | 50% | ⚪ low | L | ~~028~~ |

---

## Planned

| File | Summary | Progress | Priority | Effort | Depends on |
|------|---------|----------|----------|--------|------------|
| [2026-08-08--040--seasons-weather.md](./2026-08-08--040--seasons-weather.md) | Pory roku i pogoda wpływające na świat | 0% | 🟡 medium | XL | ~~003~~, ~~028~~ |
| [2026-08-11--060--npc-schedule-actions-and-trait-overlays.md](./2026-08-11--060--npc-schedule-actions-and-trait-overlays.md) | Wykonywalne aktywności grafiku NPC + nakładki traits | 0% | 🟡 medium | L | ~~020~~, ~~022~~ |
| [2026-08-12--080--wild-fauna-village-avoidance-and-spawn-spacing.md](./2026-08-12--080--wild-fauna-village-avoidance-and-spawn-spacing.md) | Dzika fauna unika realnego footprintu osady (skalowanego z `VillageSize`) + minimalny rozstaw spawn-pointów | 0% | 🟡 medium | M | ~~047~~, ~~076~~, ~~077~~ |
| [2026-08-12--083--cave-mouth-terrain-depression.md](./2026-08-12--083--cave-mouth-terrain-depression.md) | Jaskinia: realna dziura w terenie (reuse `modifyTerrain`) zamiast płaskiego czarnego walca, sianie pod kątem na zboczu | 0% | ⚪ low | S | ~~052~~, ~~064~~ |

---

## Todo

| File | Summary | Progress | Priority | Effort | Depends on |
|------|---------|----------|----------|--------|------------|
| [2026-08-08--037--npc-genealogy-lineages.md](./2026-08-08--037--npc-genealogy-lineages.md) | Rody NPC + przypisanie wg kierunku osady (kompas N → ~~067~~) | 0% | ⚪ low | L | ~~022~~, ~~031~~ |
| [2026-08-11--069--npc-household-resources.md](./2026-08-11--069--npc-household-resources.md) | Gospodarstwa NPC + przepływ zasobów (etap 1 ekonomii) | 0% | 🟡 medium | L | ~~060~~, ~~071~~ |
| [2026-08-11--070--world-observatory.md](./2026-08-11--070--world-observatory.md) | World Observatory — panel obserwacji życia świata | 0% | ⚪ low | XL | ~~071~~, ~~069~~ |
| [2026-08-11--071--local-economy-and-settlement-development.md](./2026-08-11--071--local-economy-and-settlement-development.md) | Lokalna gospodarka osady + rozwój z życia NPC/zasobów (draft) | 0% | 🟡 medium | XL | ~~060~~, ~~032~~, ~~047~~ |

---

## Verification needed

| File | Summary | Progress | Priority | Effort | Depends on |
|------|---------|----------|----------|--------|------------|
| [2026-08-12--082--village-tool-props-and-temp-assets.md](./2026-08-12--082--village-tool-props-and-temp-assets.md) | Widły/sierp pickup w wiosce; siano/kilof clutter; park pozostałych `_temp` | 100% | 🟡 medium | M | ~~061~~ |
| [2026-08-12--079--interaction-queue-well-drink.md](./2026-08-12--079--interaction-queue-well-drink.md) | Generyczna InteractionQueue; pierwszy klient = drink przy studni | 100% | 🟡 medium | M | ~~020~~ |
| [2026-08-12--078--distance-oneshot-falloff.md](./2026-08-12--078--distance-oneshot-falloff.md) | `playAt`: dalej = ciszej dla one-shotów światowych | 100% | 🟡 medium | S | ~~014~~, ~~016~~ |
| [2026-08-12--077--village-gardens-scale.md](./2026-08-12--077--village-gardens-scale.md) | Ogrody S/M/L z liczby domów (~1/3), clearings vs drzewa | 100% | 🟡 medium | M | ~~047~~, ~~076~~ |
| [2026-08-12--075--time-skip-npc-catchup.md](./2026-08-12--075--time-skip-npc-catchup.md) | Odpoczynek: teleport NPC do nowej pozycji wg zegara + realny catch-up potrzeb/staminy | 100% | 🟡 medium | M | — |
| [2026-08-12--076--village-generator-polish.md](./2026-08-12--076--village-generator-polish.md) | Ścieżki/plac, ognisko, yaw/pad, shells, drzewa dziedzińca, tabliczka 2 słupy | 100% | 🟡 medium | L | ~~047~~, ~~072~~, ~~074~~ |
| [2026-08-09--047--village-generation-overhaul.md](./2026-08-09--047--village-generation-overhaul.md) | VillageIdentity, VillagePlan, strefy, drogi, scoring i layout [have implementation notes] | 100% | 🔴 high | XL | ~~031~~, 032 |
| [2026-08-10--056--hungry-predator-human-aggression.md](./2026-08-10--056--hungry-predator-human-aggression.md) | Głodny predator może przełamać strach przed człowiekiem [have implementation notes] | 100% | 🟡 medium | M | ~~010~~, ~~021~~, ~~045~~, ~~055~~ |
| [2026-08-10--057--axe-player-tree-harvesting.md](./2026-08-10--057--axe-player-tree-harvesting.md) | Siekiera + ścinanie drzew (3 etapy: limbed → felled → harvested) | 100% | 🟡 medium | M | ~~058~~, ~~043~~, ~~030~~ |
| [2026-08-10--058--living-forest-tree-lifecycle.md](./2026-08-10--058--living-forest-tree-lifecycle.md) | Żywy las i cykl życia drzew | 100% | 🟡 medium | XL | ~~007~~, ~~028~~, ~~030~~ |
| [2026-08-09--046--vue-tailwind-ui-stack.md](./2026-08-09--046--vue-tailwind-ui-stack.md) | Vue + Tailwind v4 + lucide-vue-next (Fazy 0–4 zaimplementowane; weryfikacja ręczna desktop/touch) | 100% | 🔴 high | XL | ~~005~~ |
| [2026-08-08--032--natural-resources-economy.md](./2026-08-08--032--natural-resources-economy.md) | Zasoby naturalne, atrakcyjność lokalizacji, food source | 100% | 🔴 high | M | ~~028~~, ~~030~~, ~~031~~ |
| [2026-08-08--036--village-siting-difficult-terrain.md](./2026-08-08--036--village-siting-difficult-terrain.md) | Osadzanie wiosek w trudnym terenie | 25% | 🟡 medium | M | ~~028~~, ~~031~~ |
| [2026-08-10--052--shovel-digging-and-finding-stones.md](./2026-08-10--052--shovel-digging-and-finding-stones.md) | Kopanie ziemi i znajdowanie kamieni [have implementation notes] | 100% | 🔴 high | M | ~~043~~, ~~030~~ |
| [2026-08-11--059--inventory-pick-drop-sfx.md](./2026-08-11--059--inventory-pick-drop-sfx.md) | SFX podniesienia / wyrzucenia itemów | 100% | ⚪ low | S | ~~014~~, ~~043~~ |
| [2026-08-11--061--dig-ux-held-tool-and-level.md](./2026-08-11--061--dig-ux-held-tool-and-level.md) | Dig UX: held tool, kanał 2s, notice kamienia, Wyrównaj | 100% | 🔴 high | M | ~~052~~ |
| [2026-08-11--064--cave-spawner-road-avoidance-and-visual.md](./2026-08-11--064--cave-spawner-road-avoidance-and-visual.md) | Jaskinia: unikaj drogi + proceduralne wejście | 100% | 🟡 medium | S | ~~010~~, ~~026~~ |
| [2026-08-11--065--wire-nature-and-ore-models.md](./2026-08-11--065--wire-nature-and-ore-models.md) | GLB skały/pnie + modele złóż (gold/rock + tint) | 100% | 🟡 medium | M | ~~030~~, ~~032~~ |
| [2026-08-11--072--settlement-visuals-nameplate-palisade.md](./2026-08-11--072--settlement-visuals-nameplate-palisade.md) | Lepsze domy, tabliczka nazwy przy studni, zaczątki palisady/bramy | 100% | 🟡 medium | M | ~~031~~, ~~047~~ |
| [2026-08-12--074--house-catalog-scale-lamps-debug.md](./2026-08-12--074--house-catalog-scale-lamps-debug.md) | Katalog domów per model, lampy, [E] Obejrzyj + ?debug=1 | 100% | 🔴 high | M | ~~072~~ |

---

## Done

| File | Summary | Depends on |
|------|---------|------------|
| [2026-08-12--073--tree-types-height-age-overhaul.md](./2026-08-12--073--tree-types-height-age-overhaul.md) | sizeClass + wiek `old` + zakresy wysokości (m) | ~~058~~ |
| [2026-08-07--001--v01-terrain-walking.md](./2026-08-07--001--v01-terrain-walking.md) | v0.1: teren + chodzenie 3rd person | — |
| [2026-08-07--002--v02-settlement-npc.md](./2026-08-07--002--v02-settlement-npc.md) | v0.2: osada + NPC (woda / drewno / jedzenie) | ~~001~~ |
| [2026-08-07--003--day-night-clock.md](./2026-08-07--003--day-night-clock.md) | Zegar dnia/nocy + time multiplier | ~~001~~ |
| [2026-08-07--004--v03-fauna-chase-flee.md](./2026-08-07--004--v03-fauna-chase-flee.md) | v0.3: fauna chase/flee | ~~001~~ |
| [2026-08-07--005--game-ui-screens.md](./2026-08-07--005--game-ui-screens.md) | Ekrany/dialogi/modale jak w grach (World config + Notes/journal domykają ostatnie 2/4) | ~~002~~ |
| [2026-08-07--006--terrain-worker-pool.md](./2026-08-07--006--terrain-worker-pool.md) | Worker pool dla generacji terenu | ~~001~~ |
| [2026-08-07--007--world-streaming-persistence.md](./2026-08-07--007--world-streaming-persistence.md) | Chunk streaming + zapis | ~~001~~, ~~006~~ |
| [2026-08-07--008--grass-rendering.md](./2026-08-07--008--grass-rendering.md) | Instanced ground cover per chunk | ~~001~~, ~~006~~ |
| [2026-08-07--027--npc-names.md](./2026-08-07--027--npc-names.md) | Kulturowe imiona, nazwiska rodzinne, nickname | ~~002~~ |
| [2026-08-07--009--post-processing-pipeline.md](./2026-08-07--009--post-processing-pipeline.md) | EffectComposer + N8AO | ~~001~~ |
| [2026-08-07--010--predator-prey-system.md](./2026-08-07--010--predator-prey-system.md) | Predator-prey, HP, damage, spawner, respawn | ~~004~~ |
| [2026-08-07--011--npc-interactions.md](./2026-08-07--011--npc-interactions.md) | Proximity prompt + dialog `[E]` | ~~002~~ |
| [2026-08-07--013--npc-gender-models.md](./2026-08-07--013--npc-gender-models.md) | Modele NPC zsynchronizowane z płcią | ~~002~~ |
| [2026-08-07--014--npc-reaction-sounds.md](./2026-08-07--014--npc-reaction-sounds.md) | Dźwięki reakcji NPC | ~~002~~, ~~013~~ |
| [2026-08-07--015--quests-v1.md](./2026-08-07--015--quests-v1.md) | Questy v1 + quest log + exp/relacje | ~~011~~, ~~022~~ |
| [2026-08-07--016--ambient-world-audio.md](./2026-08-07--016--ambient-world-audio.md) | Ambient audio zależne od obszaru | ~~001~~ |
| [2026-08-07--017--gaze-highlight-labels.md](./2026-08-07--017--gaze-highlight-labels.md) | Hover/gaze highlight etykiet NPC i zwierząt | ~~011~~ |
| [2026-08-07--018--quests-v2-world-interactions.md](./2026-08-07--018--quests-v2-world-interactions.md) | Questy v2 + interakcje ze światem + itemy | ~~015~~, ~~030~~ |
| [2026-08-07--020--npc-2-daily-routine-and-place.md](./2026-08-07--020--npc-2-daily-routine-and-place.md) | NPC Place system: home + schedule/workplace | ~~002~~, ~~031~~ |
| [2026-08-07--021--npc-3-animal-life.md](./2026-08-07--021--npc-3-animal-life.md) | Animal Life: hunger/thirst/energy + potrzeby zwierząt | ~~010~~, ~~042~~ |
| [2026-08-07--022--npc-character-depth.md](./2026-08-07--022--npc-character-depth.md) | Character DB, role, traits, Big Five, HP, ekran mieszkańców | ~~002~~, ~~010~~ |
| [2026-08-07--023--mobile-touch-controls.md](./2026-08-07--023--mobile-touch-controls.md) | Sterowanie dotykowe + responsywny layout | ~~001~~ |
| [2026-08-07--025--multi-settlements.md](./2026-08-07--025--multi-settlements.md) | Wiele wiosek + streaming + minimap/panel | ~~007~~, ~~031~~ |
| [2026-08-07--026--roads-and-paths.md](./2026-08-07--026--roads-and-paths.md) | Drogi międzyosadowe i ścieżki lokalne | ~~025~~, ~~031~~ |
| [2026-08-07--028--biome-regions.md](./2026-08-07--028--biome-regions.md) | Obszary biomów + charakterystyczna roślinność | ~~001~~ |
| [2026-08-07--029--minimap.md](./2026-08-07--029--minimap.md) | Mini-mapa + kierunek do osady | ~~025~~ |
| [2026-08-07--030--world-elements-interactions.md](./2026-08-07--030--world-elements-interactions.md) | Elementy naturalne + zbieralne | ~~001~~, ~~028~~ |
| [2026-08-08--031--village-generation.md](./2026-08-08--031--village-generation.md) | Generowanie wiosek, rodziny, domy, teren | ~~002~~, ~~028~~ |
| [2026-08-08--038--campfire-lighting.md](./2026-08-08--038--campfire-lighting.md) | Ogniska, paliwo, czas palenia, budowanie ogniska | ~~031~~ |
| [2026-08-10--041--wait-rest-time-skip.md](./2026-08-10--041--wait-rest-time-skip.md) | Czekaj/odpoczynek + time skip | ~~003~~ |
| [2026-08-10--042--fauna-player-awareness.md](./2026-08-10--042--fauna-player-awareness.md) | Świadomość gracza przez faunę + ucieczka | ~~004~~, ~~010~~ |
| [2026-08-08--043--player-inventory-equipment.md](./2026-08-08--043--player-inventory-equipment.md) | Ekwipunek gracza v1 + podstawowe wyposażenie | ~~018~~, ~~030~~ |
| [2026-08-08--044--world-life-details.md](./2026-08-08--044--world-life-details.md) | Światła domów, fauna, propsy, studnia, detale świata | ~~025~~, ~~028~~, ~~031~~ |
| [2026-08-09--048--npc-dialogues-v2.md](./2026-08-09--048--npc-dialogues-v2.md) | Dialogi NPC v2 + menu rozmowy | ~~011~~, ~~015~~ |
| [2026-08-09--050--fire-torch.md](./2026-08-09--050--fire-torch.md) | Ognisko, palenisko i przenośna pochodnia | ~~038~~ |
| [2026-08-09--051--visual-atmosphere-lighting.md](./2026-08-09--051--visual-atmosphere-lighting.md) | Fog, dynamiczne światło/niebo, bloom, god rays | ~~003~~ |
| [2026-08-10--053--createapp-refactor.md](./2026-08-10--053--createapp-refactor.md) | Refaktor `createApp.ts`, game loop, modal state, interactables (R5+R6) | ~~005~~, ~~011~~ |
| [2026-08-10--054--world-bundle-reference-safety-and-small-refactors.md](./2026-08-10--054--world-bundle-reference-safety-and-small-refactors.md) | Bezpieczeństwo referencji `WorldBundle` + małe refaktory po 053 | ~~053~~ |
| [2026-08-08--045--health-stamina-threat.md](./2026-08-08--045--health-stamina-threat.md) | Wspólny Health/Stamina dla NPC/fauny/gracza (Threat odłożony — brak nowego konsumenta) | 100% | 🔴 high | L | ~~010~~, ~~022~~ |
| [2026-08-10--055--shared-simulation-architecture.md](./2026-08-10--055--shared-simulation-architecture.md) | Wspólna architektura symulacji: state → perception → decision → action → world effect | — |
| [2026-08-11--062--terrain-generation-overhaul.md](./2026-08-11--062--terrain-generation-overhaul.md) | Naturalniejsze generowanie terenu (macro + hills + soft detail; variable beach; grass foothill fade) | ~~001~~, ~~006~~, ~~007~~, ~~028~~ |
| [2026-08-11--066--better-visual-effects.md](./2026-08-11--066--better-visual-effects.md) | Lepsze efekty graficzne (grass, terrain, wind, film grade, atmosphere) | — |
| [2026-08-11--067--minimap-heading-and-north.md](./2026-08-11--067--minimap-heading-and-north.md) | Minimapa heading-up + kompas N na ramce | ~~029~~, ~~046~~ |
| [2026-08-11--068--uneven-road-surfaces.md](./2026-08-11--068--uneven-road-surfaces.md) | Nierówne drogi: dziury + falujące krawędzie + meander osi | ~~026~~ |
| [2026-08-11--063--forest-regions-and-habitat-distribution.md](./2026-08-11--063--forest-regions-and-habitat-distribution.md) | Duże regiony leśne + ciągły `forestDensity` / habitat | ~~028~~, ~~062~~ |
| [2026-08-07--012--npc-labels.md](./2026-08-07--012--npc-labels.md) | (archiwum) Etykiety NPC/fauny — zakres w ~~017~~ / ~~022~~ | — |
| [2026-08-07--019--npc-1-identity.md](./2026-08-07--019--npc-1-identity.md) | (archiwum) Draft identity — scalony do ~~022~~ | — |

---

## Index completeness

Każdy główny plik `docs/plans/YYYY-MM-DD--NNN--*.md` (bez `*-implementation-notes.md` i `README.md`) powinien mieć wiersz w tabelach powyżej. Pliki `012` / `019` są historyczne, ale indeksowane w Done jako archiwum.

---

## Quick notes / bugs

- **Światło w domach**
  - ~~Światło w domach (dodane w `2026-08-08--044--world-life-details.md` i poprawione ostatnio) - kostka wisi w powietrzu obok domu, czasem nawet jakby 2 metry obok.~~ → poprawione (weryfikacja potrzebna): pierwsza poprawka (czekanie na `waitForChunks` dla niedomowych osad, patrz niżej) usuwała tylko jedną przyczynę. Druga, właściwa: `createHouseLight` zakładał lampę na 85% z `hutBounds.max.z`, czyli że ściana jest płaska i zwrócona w +Z na wysokości 40% modelu — nieprawdziwe dla żadnego z 3 wariantów `HUT_URLS` (potwierdzone raycastingiem: jeden ma ścianę tylko do ~25% wysokości, inny ma realną ścianę pod kątem 45°/225°, nie na osi Z). `props.ts::findWallMount` szuka teraz prawdziwego punktu na powierzchni bryły (raycast z zewnątrz, kilka wysokości/kątów) zamiast zgadywać z bounding boxa.
  - **UPDATE 2026-08-11:** jeszcze nie jest idealnie. Trzeba chyba zrobić porządne mapowanie per konkretny model budynku.
- **Latające obiekty**
  - ~~Obiekty czasem "latają" nad ziemią. Np. krzaki. To wynika pewnie ze złego pozycjonowania, które nie bierze pod uwagę modyfikatorów...?~~ → poprawione (weryfikacja potrzebna): trafna intuicja — `chunkManager.sampleHeight` dla niezaladowanego jeszcze chunka cicho spada do surowej, nie spłaszczonej wysokości terenu (bez blendingu village-clearing), inne niż to, co faktycznie renderuje się w tym miejscu chwilę później. Niedomowe osady (`SettlementsManager.ts::ensureLoaded`) budowały swoje propsy (chatki/lampy/las) zanim ich własne chunki terenu zdążyły się w ogóle załadować — teraz czeka na `chunkManager.waitForChunks(...)` wokół siedziby osady przed budową, tak jak już robiła to osada domowa.
  - **UPDATE 2026-08-11:** jeszcze nie jest idealnie.
- **Morze/ocean** (2026-08-11)
  - na telefonie wygląda słabo - są jakieś artefakty; widać krawędzie między obszarami; po morzu pływają dziwne plamy
  - można spróbować z bardziej przezroczystą wodą
- **Fauna sytość / nawodnienie** (2026-08-11)
  - paski nad zwierzęciem działają, ale bez realnego jedzenia/picia głównie maleją — zob. [issue 015](../issues/2026-08-11--015--fauna-food-water-for-satiety-hydration.md)

When adding a new plan: create `YYYY-MM-DD--{NNN}--slug.md` (next sequential number in plans), add a row to the appropriate status section above.

## Related

* [research/README.md](../research/README.md)
* [reviews/README.md](../reviews/README.md) — m.in. `to-do--water-quality.md`
* [issues/README.md](../issues/README.md)
