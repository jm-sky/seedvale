# Plans — Current Planning Map

Current planning map for implementation plans: backlog, dependencies, active threads and verification queue. Detailed implementation lives in the plan files; implementation notes and reviews live in their dedicated folders; history lives in [archive/](./archive/README.md).

## Metadata reference

Generated from `scripts/docs/config.ts` by `pnpm docs:generate-plan-docs` — see `docs/plans/PLAN-METADATA.md` for the full contract.

Status: `draft` 📝 · `planned` 📋 · `in progress` 🔄 · `verification needed` 🔍 · `done` ✅
Priority: 🔴 high · 🟡 medium · ⚪ low
Effort: `XS` minutes · `S` ~15–30 min · `M` ~30–90 min · `L` ~1–3 h · `XL` several sessions
Type: `feature` · `bug` · `fix` · `polish` · `optimization` · `refactor` · `infrastructure`

Unless noted otherwise, `verification needed` means implementation has passed automated checks but still needs browser/manual verification.

**Depends on** = implementation prerequisites (plan IDs). ~~done~~ is crossed out. Thematic overlap is not a dependency.

---

## Drafts

| File                                                                           | Summary | Pri | Effort | Depends |
| ------------------------------------------------------------------------------ | ------- | --- | ------ | ------- |
| `npc-004-npc-genealogy-lineages.md`                                            | -       | ⚪ | S      | -      |
| `npc-032-expedition-needs-and-survival.md`                                     | -       | 🔴 | L      | npc-029, npc-017, npc-025, items-player-028 |
| `npc-033-companion-combat-cooperation.md`                                      | -       | 🔴 | L      | npc-029, npc-032, items-player-027, ~~npc-025~~ |
| `npc-034-expedition-shared-work-and-activities.md`                             | -       | 🔴 | M      | npc-029, npc-032, items-player-028 |
| `npc-035-shared-expedition-relationship-consequences.md`                       | -       | 🔴 | L      | npc-029, npc-032, npc-033, npc-034 |
| `quests-progression-010-abandoned-gold-mine-colony.md`                         | -       | 🔴 | M      | world-terrain-017, world-018, world-019, settlements-npcs-026, settlements-npcs-027, settlements-npcs-028, settlements-003, settlements-004, quests-progression-002 |
| `settlements-003-colony-bootstrap.md`                                          | -       | 🔴 | L      | world-019, settlements-npcs-028 |
| `settlements-004-gold-economic-realization-and-source-entitlements.md`         | -       | 🔴 | M      | -      |
| `settlements-npcs-020-economy-driven-transport-demand-integration.md`          | -       | 🔴 | S      | settlements-npcs-017, settlements-npcs-018, settlements-npcs-019 |
| `settlements-npcs-021-remote-production-site-logistics.md`                     | -       | 🔴 | M      | settlements-npcs-018, settlements-npcs-019, settlements-npcs-020 |
| `settlements-npcs-027-npc-expedition-assignment-and-provisioning.md`           | -       | 🔴 | M      | settlements-npcs-026 |
| `settlements-npcs-028-long-distance-npc-travel-and-expedition-movement.md`     | -       | 🔴 | L      | settlements-npcs-026, settlements-npcs-027, settlements-npcs-019 |
| `tools-000-weapon-browser-observatory.md`                                      | -       | 🟡 | M      | -      |
| `tools-006--world-observatory.md`                                              | -       | ⚪ | XL     | -      |
| `tools-007--mpfb2-npc-hero-character-pipeline.md`                              | -       | 🔴 | L      | -      |
| `world-terrain-009-seasonal-ground-and-grass-appearance.md`                    | -       | 🟡 | M      | -      |
| `world-terrain-015-water-reflection-content-budget.md`                         | -       | 🟡 | S      | -      |

---

## In progress

| File                                                      | Summary                                                               | Pri | Effort | Depends         |
| --------------------------------------------------------- | --------------------------------------------------------------------- | --- | ------ | --------------- |
| `2026-08-17--149--shader-program-first-use-hitch.md`      | Phase C: `Green` / `MI_WindowGlass` / `Wood`                          | 🔴  | M/L    | -               |
| `world-terrain-010-waterways-and-vegetation.md`           | Phases 2/8/9 deferred — see plan's "Implementation status"            | 🟡  | M      | -      |

---

## Planned

> 💡 - plan have `-implementation-notes.md`, ◼️ - have not

| File                                                                           | Summary | Pri | Effort | Depends |
| ------------------------------------------------------------------------------ | ------- | --- | ------ | ------- |
| 💡 `fauna-019-real-cave-habitats-and-animal-home-navigation.md`                | -       | 🟡 | L      | ~~world-terrain-019~~, ~~fauna-016~~ |
| 💡 `fauna-022-animal-variants-and-exceptional-dangerous-animals.md`            | -       | 🔴 | M      | -      |
| 💡 `items-player-014-rope-pullable-resource-transport.md`                      | -       | 🟡 | M      | ~~155~~ ~~122~~ |
| 💡 `items-player-027-player-to-npc-item-transfer-and-equipment.md`             | -       | 🔴 | M      | ~~settlements-npcs-026~~ |
| 💡 `items-player-028-npc-player-storage-access-policies.md`                    | -       | 🔴 | L      | items-player-027 |
| 💡 `items-player-029-wearable-armor-and-combat-equipment.md`                   | -       | 🟡 | L      | -      |
| 💡 `npc-027-spatial-context-and-cave-traversal.md`                             | -       | 🔴 | L      | ~~world-terrain-019~~, ~~npc-006~~, ~~npc-007~~ |
| 💡 `npc-029-npc-accompany-follow-commitment.md`                                | -       | 🔴 | M      | settlements-npcs-019 |
| 💡 `npc-030-paid-expedition-escort-work-contracts.md`                          | -       | 🔴 | L      | npc-029 |
| ◼️ `npc-031-voluntary-expedition-joining.md`                                   | -       | 🔴 | M      | npc-029 |
| ◼️ `quests-progression-008-treasure-map-bear-cave.md`                          | -       | 🟡 | M      | ~~world-terrain-019~~, ~~fauna-018~~, fauna-019, ~~quests-progression-002~~, ~~quests-progression-011~~ |
| 💡 `quests-progression-019-dangerous-animal-deeds-local-reputation.md`         | -       | 🟡 | M      | ~~quests-progression-001~~, ~~quests-progression-002~~, fauna-022 |
| 💡 `settlements-npcs-016-first-processing-chain-and-blacksmith-production.md`  | -       | 🔴 | M      | ~~settlements-npcs-015~~ |
| 💡 `settlements-npcs-017-production-demand-and-economic-pressures.md`          | -       | 🔴 | M      | settlements-npcs-016 |
| 💡 `settlements-npcs-022-household-help-and-age-based-work-participation.md`   | -       | 🔴 | M      | ~~settlements-npcs-002~~ |
| 💡 `settlements-npcs-025-resource-storage-visualization.md`                    | -       | 🟡 | M      | ~~settlements-npcs-009~~, ~~settlements-npcs-010~~ |
| 💡 `settlements-npcs-030-non-home-settlement-food-production-v1.md`            | -       | 🔴 | M      | -      |
| ◼️ `settlements-npcs-031-sustainable-seed-recovery-and-replanting.md`          | -       | 🔴 | L      | settlements-npcs-030, world-023 |
| ◼️ `tools-005-seedvale-character-preparation-panel.md`                         | -       | 🔴 | M      | -      |
| 💡 `tools-013-npc-decision-verification-and-scenario-tooling.md`               | -       | 🔴 | M      | -      |
| 💡 `world-018-cave-aware-rich-finite-resource-deposits.md`                     | -       | 🔴 | M      | ~~world-terrain-019~~, world-terrain-017 |
| ◼️ `world-023-species-driven-sowing-density-and-yield.md`                      | -       | 🔴 | M      | settlements-npcs-030 |
| 💡 `world-025-persistent-abandoned-cemetery-worldgen-cache.md`                 | -       | 🔴 | M      | ~~world-015~~, ~~world-022~~ |
| 💡 `world-terrain-017-abandoned-mountain-mine-landmark.md`                     | -       | 🔴 | M      | ~~world-terrain-019~~ |
| 💡 `fauna-023-systemic-animal-attraction-food-blood-and-trap-lures.md`         | -       | 🟡 | M      | fauna-014, ~~world-009~~, items-player-025 |
| ◼️ `settlements-npcs-032-player-to-household-resource-transfer.md`             | -       | 🔴 | S      | -      |
| 💡 `fauna-024-lost-livestock-stray-displacement.md`                            | -       | 🔴 | M      | quests-progression-016, fauna-020 |
| ◼️ `world-026-storms-thunder-animal-scare-and-snow-visuals.md`                 | -       | 🔴 | M      | -      |
| ◼️ `fauna-025-livestock-stray-return-and-recovery.md`                          | -       | 🔴 | M      | fauna-024 |
| 💡 `settlements-007-systemic-settlement-structure-condition-and-shared-repair.md` | -       | 🔴 | L      | ~~world-020~~, ~~world-021~~, ~~settlements-005~~, ~~items-player-017~~ |
 💡 `items-player-014-rope-pullable-resource-transport.md`                      | -       | 🟡 | M      | ~~155~~ ~~122~~ |
| 💡 `settlements-npcs-016-first-processing-chain-and-blacksmith-production.md`  | -       | 🔴 | M      | ~~settlements-npcs-015~~ |
| 💡 `settlements-npcs-017-production-demand-and-economic-pressures.md`          | -       | 🔴 | M      | settlements-npcs-016 |
| 💡 `settlements-npcs-022-household-help-and-age-based-work-participation.md`   | -       | 🔴 | M      | ~~settlements-npcs-002~~ |
| 💡 `settlements-npcs-025-resource-storage-visualization.md`                    | -       | 🟡 | M      | ~~settlements-npcs-009~~, ~~settlements-npcs-010~~ |
| 💡 `fauna-019-real-cave-habitats-and-animal-home-navigation.md`                | -       | 🟡 | L      | ~~world-terrain-019~~, ~~fauna-016~~ |
| 💡 `npc-027-spatial-context-and-cave-traversal.md`                             | -       | 🔴 | L      | ~~world-terrain-019~~, ~~npc-006~~, ~~npc-007~~ |
| ◼️ `quests-progression-008-treasure-map-bear-cave.md`                          | -       | 🟡 | M      | ~~world-terrain-019~~, ~~fauna-018~~, fauna-019, ~~quests-progression-002~~, ~~quests-progression-011~~ |
| 💡 `world-terrain-017-abandoned-mountain-mine-landmark.md`                     | -       | 🔴 | M      | ~~world-terrain-019~~ |
| 💡 `world-018-cave-aware-rich-finite-resource-deposits.md`                     | -       | 🔴 | M      | ~~world-terrain-019~~, world-terrain-017 |
| ◼️ `tools-005-seedvale-character-preparation-panel.md`                         | -       | 🔴 | M      | -      |
| 💡 `tools-013-npc-decision-verification-and-scenario-tooling.md`               | -       | 🔴 | M      | -      |
| 💡 `settlements-npcs-030-non-home-settlement-food-production-v1.md`            | -       | 🔴 | M      | -      |
| ◼️ `world-023-species-driven-sowing-density-and-yield.md`                      | -       | 🔴 | M      | settlements-npcs-030 |
| ◼️ `settlements-npcs-031-sustainable-seed-recovery-and-replanting.md`          | -       | 🔴 | L      | settlements-npcs-030, world-023 |
| 💡 `npc-029-npc-accompany-follow-commitment.md`                                | -       | 🔴 | M      | settlements-npcs-019 |
| 💡 `npc-030-paid-expedition-escort-work-contracts.md`                          | -       | 🔴 | L      | npc-029 |
| ◼️ `npc-031-voluntary-expedition-joining.md`                                   | -       | 🔴 | M      | npc-029 |
| 💡 `items-player-027-player-to-npc-item-transfer-and-equipment.md`             | -       | 🔴 | M      | ~~settlements-npcs-026~~ |
| 💡 `items-player-028-npc-player-storage-access-policies.md`                    | -       | 🔴 | L      | items-player-027 |
| 💡 `quests-progression-019-dangerous-animal-deeds-local-reputation.md`         | -       | 🟡 | M      | ~~quests-progression-001~~, ~~quests-progression-002~~, fauna-022 |
| 💡 `world-025-persistent-abandoned-cemetery-worldgen-cache.md`                 | -       | 🔴 | M      | ~~world-015~~, ~~world-022~~ |
| 💡 `fauna-022-animal-variants-and-exceptional-dangerous-animals.md`            | -       | 🔴 | M      | -      |
| 💡 `items-player-029-wearable-armor-and-combat-equipment.md`                   | -       | 🟡 | L      | -      |

---

## Verification needed

Implementation is complete; only meaningful browser/manual verification remains.

## Do sprawdzenia

| Plan | Sprawdź |
|------|---------|
| `settlements-npcs-006-wool-to-material.md` | Textile Worker bez WorkContract; przy ≥4 wełny w `Household.items` konsumuje dokładnie 4 wool i tworzy 12 `wool_material`; 0–3 wełny blokuje bez outputu; przerwanie nie zużywa wełny; produkcja nie bierze wełny z innego gospodarstwa/magazynu |
| `fauna-004-sheep-wool-and-shepherd.md` | 12-dniowy sezon / 48-dniowy rok; shepherd w większych osadach z 2–6 owcami gospodarstwa, nie wszędzie; home `ensureSheep` bez wymuszania shepherd; strzyżenie 4 wełny do household items (nie jedzenie); wełna wraca po 24 dniach bez catch-up; mleko niezależne; pasterz podchodzi do ruchomej owcy i reaguje na wilka atakującego własne stado |
| `settlements-npcs-015-economic-production-and-input-integration.md` | Hunter z gałęzią/belką w gospodarstwie craftuje strzały przy `work` (gałąź przed belką, 1→1 / 1→8); brak materiału nie zużywa nic; drwal nadal dodaje drewno osady przy depozycie; mixed/stock recipes nie mintują częściowego wyniku |
| `ui-input-016-building-placement-construction-ux-coherence.md` | Ghost: ready zielony / preparation bursztyn / invalid czerwony; nearby materiały zmieniają ghost przy ruchu; stromy dom → Przygotuj teren [E] (łopata); pułapka i grządka mają ghost; ogniska mają różne footprinty; namiot i chata pokazują znacznik wejścia; praca ciągła aż do stopu, Esc/touch Przerwij; `[V]` obóz i koryto; `[R]` nie kasuje od razu (potwierdzenie + recovery); palisada Postaw kolejny; pełny obóz nadal kończy preview po confirm |
| `settlements-npcs-023-profession-staffing-and-settlement-composition.md` | Home: Anna/Piotr/Kasia/Marek nadal istnieją, w tej samej kolejności, i oferują authored questy; mała ogród/las osada ma food livelihood bez Tradera/Kowala; osada przy significant ore ma Minera wewnątrz istniejącej liczby domów (bez extra resource family); OUTPOST nadal 1 NPC z forced resource role |
| `quests-progression-017-rpg-settlement-quest-matrices.md` | Sąsiadująca osada: NPC oferuje generated „Sekret starego miejsca” na realny landmark; interakcja zalicza etap; `Umowa między osadami` prowadzi do NPC w innej osadzie po id (to samo imię w home nie kradnie celu); `Podejrzany transport` to rozmowa+wybór bez quest-owned przesyłki; live „Wilki pod osadą” w home nie znika przez RPG; save/load trzyma te same cele |
| `world-024-systemic-treasure-sites-and-keys.md` | Locked chest without the matching key; key is a meaningful distance from its chest; abandoned pickup and buried shovel path; cemetery grave key (if generated) still applies grave-robbing reputation; correct key opens the normal chest UI, another `key` instance does not; save/reload before and after taking/moving a key, and after unlocking/looting; streamed/reloaded looted chests stay empty and unlocked; no cave treasure yet |
| `items-player-026-treasure-loot-forced-entry-and-traps.md` | Systemic chest has 50–200 coins plus a sized ruby/diamond; matching key opens without trap risk; `[R] Wyłam` needs a held pry tool (axe/pickaxe/battle_axe/pitchfork) and is a timed action; failed attempt can retry but save/reload does not reroll the same attempt; mechanical damage/fire leave coins and gems; destroyed chest leaves remains with surviving valuables once; blade trap hurts through normal HP; player-placed chests stay unchanged |
| `items-player-023-systemic-item-utility-and-food-safety.md` | Można rozpalić/dołożyć szyszkę, gałąź i belkę; szyszka daje zauważalnie mniej czasu niż gałąź, belka więcej; automatyczny wybór opału nie spala belki, gdy dostępna jest szyszka/gałąź; komunikaty przy ogniu mówią o paliwie/opale, nie tylko o gałęzi; świeże surowe mięso może spowodować zatrucie zależnie od gatunku, a medium-fresh jest bardziej ryzykowne; pieczone/suszone mięso nie wywołuje raw-meat poisoning i nadal daje większą sytość z zachowanym gatunkowym provenance; save/load nie resetuje sequence deterministycznych food-risk rolls ani aktywnego poisoning |
| `quests-progression-016-world-driven-settlement-quest-opportunities.md` | Po dniu 2, gdy jama ma pressure: hunter (albo pierwszy dorosły) oferuje generated „Wilki pod osadą”; zniszczenie jamy zalicza questa i wypłaca nagrodę; jeśli problem zniknie przed akceptacją, oferta znika; save/load aktywnego generated questa trzyma tego samego givera i `spawnerId`; authored `wilki-pod-osada` nadal istnieje osobno |
| `items-player-022-gameplay-interaction-usability-polish.md` | Namiot+podest+posłanie = jeden cel Tab/gaze z inspection wszystkich części i repair per część; `+N%` czytelnie zielone; preview małej/średniej chaty pokazuje wejście przy obrocie; `[F]`/`[G]` oczywiste przy przyciskach; kupka gałęzi+belek to 2 cele Tab; stojąca pochodnia gaśnie po 6 h świata / time-skip / save-load |
| `quests-progression-015-stable-npc-identity-for-quests.md` | Dwa NPC o tym samym imieniu: rozmowa z niewłaściwym nie zalicza `talk_to_npc` / choice / oferty givera; marker zostaje przy właściwym id; save/load i stream-out/in osady trzymają ten sam target; authored Anna/Piotr/Kasia/Marek nadal oferują, przechodzą etapy, kończą się i wypłacają jak wcześniej |
| `npc-016-work-contracts-payment-and-employer-interaction.md` | Najemnik po skończonej pracy podchodzi tylko gdy gracz jest w pobliżu; dialog otwiera Zapłać N / Jeszcze nie; monety schodzą z gracza do `personalInventory` NPC; za mało monet / pełny ekwipunek NPC nic nie rusza; powtórne Zapłać nic nie robi; śmierć najemnika nie obciąża gracza; save/load zachowuje należność i już wypłacone monety |
| `settlements-005-residential-house-construction.md` | Placement małej/średniej chaty, stage-gated materiały, praca gracza i NPC, terrain prep przy stoku, ukończenie → lodging high, anulowanie niedokończonej, save/load |
| `settlements-006-merchant-sell-pricing-condition-and-social-standing.md` | Neutralny handlarz ~90% nominalnej wartości; lepsza relacja/reputacja podbija ofertę (max ~105% dla nie-stockowanych); zużyty trap taniej proporcjonalnie do stanu; broken trap ~5% salvage; podsumowanie transakcji = finalna wypłata; brak arbitrażu buy→sell na stockowanych towarach |
| `fauna-009-wolf-howling-and-rooster-vocalization.md` | Wycie wilków i pianie kogutów: timing, zachowanie i brak spamowania audio |
| `items-player-003-player-physical-effort-stamina-vigor.md` | Odczuwalny balans Stamina/Vigor podczas ruchu, pracy i regeneracji |
| `items-player-002-food-provenance-freshness-and-storage.md` | Świeżość w ekwipunku/skrzyni (0.5×), pieczenie/suszenie dziedziczy zużytą część shelf-life i gatunek, zepsute nie da się przetworzyć, save/load nie resetuje wieku |
| `npc-006-shared-npc-animal-pathfinding.md` | NPC i zwierzęta poruszają się naturalnie, omijają przeszkody i nie zacinają się |
| `settlements-npcs-014-local-goods-circulation.md` | Naturalny obieg dóbr: producent → handlarz → magazyn → gospodarstwo |
| `settlements-npcs-018-physical-goods-transport-foundation.md` | Trader idzie do gospodarstwa z nadwyżką jedzenia, items znikają ze źródła i pojawiają się w carried, po dojściu do magazynu osady ładują się do SettlementEconomy, `debug.transport(id)` pokazuje `completed`; niedostępne źródło przed odbiorem nie mintuje dóbr i kończy order jako `failed`; przerwanie po pickup zostawia cargo u Tradera i wznawia ten sam `in-transit` order |
| `npc-010-death-and-corpse-lifecycle.md` | Śmierć NPC: corpse zostaje w miejscu śmierci (nie w domu), loot loadoutu, decay w czasie, save/load bez duplikacji itemów, legacy martwy NPC bez sfabrykowanego corpse |
| `npc-011-npc-burial-and-graves.md` | Członek household po śmierci kogoś z rodziny może dostać burial pressure, odebrać claim, dojść do corpse, wykonać pochówek i zostawić persistent grave + terminal corpse; brak fake NeedId; brak duplikacji grave po reload/rebuild; legacy dead bez corpse nie dostaje grave |
| `npc-026-npc-grave-visits.md` | Żyjący członek rodziny okazjonalnie odwiedza persistent grave zmarłego; wizyta przegrywa z potrzebami/pogodą/snem, wygrywa z idle; cooldown per zmarły przeżywa save/load; brak fake NeedId i nearest-cemetery fallback |
| `ui-input-004-construction-placement-and-terrain-preparation-ux.md` | UX budowania, placementu i przygotowania terenu |
| `npc-007-interaction-destination-approach.md` | NPC naturalnie podchodzą do studni i nie wpadają w pętle ruchu |
| `2026-08-21--191--mountain-peaks-and-massifs.md` | Góry, doliny, rzeki, seamy i płynność streamingu |
| `npc-013-night-campfire-gathering.md` | Naturalność nocnych spotkań NPC przy ognisku |
| `npc-012-weather-reaction-and-shelter.md` | Naturalność reakcji NPC na złą pogodę i powrotu do rutyny |
| `npc-015-work-contracts-npc-work-and-construction.md` | Pełny przebieg kontraktu NPC w świecie, w tym przerwanie przez potrzeby i wznowienie |
| `npc-017-work-contracts-food-and-drink.md` | Długi/zdalny kontrakt: ograniczone zaopatrzenie do `personalInventory`, jedzenie/picie z własnych zapasów w trakcie podróży/pracy, przerwanie głodem/pragnieniem bez `releaseWorkContract()`, wyczerpanie zapasów bez magicznego refillu, save/reconstruction zachowuje `personalInventory` |
| `npc-028-work-contracts-multiple-workers.md` | Zlecenie na 2–3 najemników: kilku NPC przyjmuje to samo ogłoszenie, pracują niezależnie na tym samym celu, zwolnienie/śmierć jednego otwiera slot bez resetu wkładu, wynagrodzenie jest łączne (nie per osoba), save/load nie duplikuje assignmentów |
| `fauna-006-wolf-settlement-entry.md` | Wilk sensownie ściga cel do osady, ale nie wchodzi do niej bez powodu |
| `world-terrain-005-distance-based-terrain-detail-lod.md` | Jakość i wydajność grass/road LOD z różnych odległości |
| `world-terrain-006-world-generation-placement-correctness.md` | Rzeki, brzegi, góry, roślinność, placement obiektów i seamy chunków |
| `fauna-011-domestic-dogs-and-household-guarding.md` | Psy: warianty modeli/animacje, dieta bez huntingu, karmienie, szczekanie kontekstowe, obrona household przed wilkiem, powrót do domu po zagrożeniu |
| `fauna-012-animal-threat-perception-and-vocalization-responses.md` | Wycie wilka i alert bark psa realnie zwiększają flee u pobliskiego prey/livestock poza spatial `fleeRange` (bez paniki na odległe/nieaktualne zdarzenia); kilka psów nie tworzy kaskady szczekania; brak zauważalnego regresu frame time przy większej liczbie zwierząt |
| `world-013-world-location-catalog-performance-optimization.md` | Zakup Near/Far Map u handlarza i rozmowa ze strażnikiem nie powodują widocznego freeze; feedback pokazuje prawidłową liczbę nowych miejsc |
| `world-terrain-016-settlement-cemeteries-and-abandoned-graveyards.md` | SM ma własny albo shared cemetery z pobliską SM; MD/LG/XL mają dedicated; shared nie duplikuje się w discovery; opuszczony cemetery tylko daleko od osad; unload/reload chunku nie przesuwa cemetery |
| `ui-input-008-river-debug-location-quality.md` | `teleportTo.riverNearest()`/`nextRiver()` prowadzą do czytelnego odcinka rzeki na lądzie (nie do jeziora/morza/ujścia); kolejne `nextRiver()` dają różne rzeki w stabilnej kolejności |
| `world-terrain-013-river-drainage-continuity-and-terrain-adaptation.md` | Seed `3`: rzeka wcześniej urywająca się ~50–100 m przed morzem dochodzi teraz do odbiornika (albo okazuje się realnie zamkniętą nieckę); na kilku seedach sprawdź ujścia przy szwach tile'i, drenaż górski i śródlądowy, małe strumienie vs duże rzeki oraz spójność koryta/wody po naprawie (bez sztucznych kanałów do morza) |
| `world-terrain-011-river-sink-resolution-and-inland-drainage-recovery.md` | Śródlądowe rzeki na kilku seedach (równiny, doliny, drenaż górski, szwy tile'i, małe strumienie vs duże rzeki) nie kończą się na suchym lądzie; naprawione ujścia wyglądają wiarygodnie (bez sztucznych kanionów), wyrównanie koryta/wody po naprawie |
| `world-terrain-012-macro-meadow-variation.md` | Widoczne szerokie zielone/suche łąki (~30-80 m) na otwartym terenie, płynne przejścia bez twardych linii i bez szwów chunków; drobna zmienność per-blade nadal widoczna w obrębie makro-regionu; wyłączenie `macroVariationEnabled` (GUI → Grass) przywraca poprzedni wygląd |
| `fauna-016-animal-habitats-roaming-water-trips-and-settlement-rats.md` | Deer/stag habitat (las/skraj lasu), brak spawnu przy drogach, species-specific roaming, dalekie wyprawy do wody z powrotem do local behaviour, szczury jako mała populacja osadnicza (widoczne, zmniejszają zapasy, zabijalne przez psa/gracza) |
| `npc-002-npc-healing.md` | NPC ranny w walce (`?debug=1&debugNpcCombat=1` do zadania obrażeń) leczy się dopiero po zakończeniu walki: idzie do domu, zużywa catalogowy `injuryTreatment` (`bandage`; `herb` sam nie wystarcza po npc-025), HP rośnie, po czym wraca do normalnej autonomii; bez odpowiedniego treatmentu nie ma healing candidate |
| `npc-025-injury-severity-and-treatment-requirements.md` | `?debug=1`: `injury.applyNpcInjury(id, 'minor'|'serious'|'critical')` pokazuje derived severity i SPEA; minor regeneruje się naturalnie z HP; serious wolniej i mocniej idzie się leczyć; `bandage` leczy uraz, `herb` nie; critical nie schodzi naturalnie do serious; `giveNpcBandage` + leczenie stabilizuje critical; brak leczenia nie zapętla heal; combat nie jest przerywany; save/streaming zachowuje `physicalInjury` |
| `ui-input-011-new-game-setup-on-empty-save-state.md` | Pusta lista zapisów i usunięcie ostatniego zapisu zostawiają Start Screen z otwartym formularzem Nowej gry (bez automatycznego tworzenia świata); imię gracza i nazwa zapisu są niezależne i utrzymują się per save po wczytaniu; wpisy Seed Library przeżywają usunięcie wszystkich zapisów; `?seed=` jest tylko wstępnym wyborem |
| `ui-input-012-placement-preview-shapes-rotation-and-coverage.md` | Studnia wchodzi w preview; palisada/namiot/skrzynia/posłanie/podest pokazują box i kierunek; F/G (i przyciski) obracają o 45° bez ruszania celu aim; kamera po starcie preview nie kręci obiektem; G nie wyrzuca itemu podczas rotowalnego preview; snapping palisady pod 45°/90° |
| `ui-input-014-construction-status-and-context-actions.md` | Desktop: `E`/`R` bez zmian, `V` otwiera inspection tylko dla studni/przygotowania terenu/palisady/pochodni/chaty; brak reakcji na nieinspectable. Mobile: `[Inspect] [R] [E]`, Inspect widoczny tylko przy inspectable targecie. Studnia (budowa/gotowa/naprawa + wybrane pojemniki), terrain prep, palisada, pochodnia, small/medium house, aktywne zlecenie; Quick Actions hire-help bez regresji |
| `ui-input-013-character-stats.md` | Character Screen: bez conditions SPEA `effective == base` bez badges; zatrucie pokazuje chorobę, obniża SPEA i daje zgodne badges; wszystkie 8 skills. Skills Screen: tylko Sneak/Traps/Repair; Sneak toggle oraz Traps/Repair targeting działają. Desktop 2 kolumny, mobile 1; reputacja/renown/known-for bez regresji |
| `items-player-021-player-skills-and-targeted-skill-actions-foundation.md` | Skills: Medycyna i Naprawa widoczne; wybór Pułapki wchodzi w targeting; [E] na istniejącej pułapce otwiera Sprawdź z żywym stanem/wytrzymałością/przynętą; Esc anuluje targeting bez mutacji świata; bez wybranego skilla arm/disarm/collect działają jak wcześniej |
| `items-player-019-player-camp-repair-and-sewing-kit.md` | Zakup zestawu do szycia; naprawa namiotu/posłania/podestu; brak narzędzia/materiału; przerwa + wznowienie; save/load w trakcie naprawy; aktywna naprawa namiotu blokuje składanie; id/condition namiotu przeżywa pack → save/load → redeploy |
| `fauna-020-player-owned-animals-and-follow-stay-behaviour.md` | Transfer konia zachowuje ten sam `animalId`; unload osady nie usuwa owned horse; Follow z hysteresis; Stay nie blokuje potrzeb/threat; dismount przywraca control state; save/load ownership/control/position; brak duplikatu po reload osady; death + tombstone blokuje respawn slotu |
| `fauna-007-animal-leading-and-cart-harness.md` | Koń/osioł: Prowadź na linie, zwierzę idzie za graczem bez teleportu; Odepnij linę wraca do normalnego AI; potrzeby i threat wygrywają z lead; Przywiąż do wózka / Odepnij wózek; wózek jedzie za zwierzęciem; łańcuch gracz→koń→wózek; krowa nie zaprzęga; hitch nie przeżywa save/load |
| `fauna-018-persistent-habitat-occupants.md` | Save/load i in-session rebuild zachowują identity/durable state zadeklarowanego occupanta; save przy corpse przywraca corpse; po `readyToRemove()` tombstone blokuje respawn i reconstruction; zwykły habitat fill nie tworzy duplikatu; ordinary fauna nadal nie jest masowo persystowana |
| `settlements-npcs-019-persistent-and-off-screen-transport.md` | Trader podnosi towar → order `in-transit` → NpcAgent/WorldBundle rebuild nie resetuje `transportCargo`, pickup się nie powtarza; osada carriera streamuje się out mid-transit → order dostaje `execution` off-screen, cargo zostaje u NPC, po powrocie w zasięg dostawa kończy się dokładnie raz (albo już się zakończyła off-screen — bez drugiego unload); save podczas `in-transit` → reload → to samo cargo/order, dostawa raz; time skip dłuższy niż pozostały czas podróży kończy dostawę raz, krótszy zostawia order `in-transit`; ilości source+cargo+destination stałe w każdym scenariuszu |

---

## Recent context

Done plans kept here only while they are relevant to current planning or dependencies. Otherwise they belong in [archive/](./archive/README.md).

| File                                                                    | Why it's here                               |
| ----------------------------------------------------------------------- | ------------------------------------------- |
| `world-terrain-007-underground-caves.md`                                | Historical V1; superseded by Cave V2        |
| `world-terrain-008-underground-caves-v2.md`                             | Closed V2/SDF stage; 019 is production next |
| `world-terrain-018-cave-heightfield-representation-spike.md`            | Accepted heightfield spike; 019 migrates it |
| `2026-08-14--106--player-needs-food-and-cooking.md`                     | Dependency of `126`, `152`, `159`           |
| `2026-08-11--069--npc-household-resources.md`                           | Dependency of `152`, `070`                  |
| `2026-08-14--109--megakit-construction-catalog.md`                      | Dependency of `111`                         |
| `2026-08-14--110--quests-v3-closure-world-identity-and-lifecycle.md`    | Dependency of `132`; closes `093` lifecycle |
| `2026-08-15--122--natural-resource-gathering-and-water-distribution.md` | Dependency of `126`, `127`, `152`           |
| `2026-08-18--150--combat-mode-defense-and-downed-state.md`              | Dependency of `162`                         |
| `2026-08-18--155--inventory-item-instances-and-trap-lifecycle.md`       | Dependency of `159`, `161`, `162`           |
| `2026-08-18--156--npc-household-and-settlement-storage-logistics.md`    | Dependency of `152`, `159`                  |
| `2026-08-18--160--high-quality-melee-weapons.md`                        | Dependency of `161`                         |
| `2026-08-19--166--named-save-slots.md`                                  | Recent browser-verified persistence work    |
| `2026-08-22--193--arch--simulation-architecture-consistency.md`         | Findings driving `194`/`195`                |

---

## Plan naming

New plans use:

`<domain>-<id>-<title>.md`

The ID is three-digit and local to the domain.

Existing legacy plans keep their current date/global-ID names and are not renamed.

## Plan domains

New plans declare a primary `Domain:` in frontmatter. Use optional `Tags:` only for genuinely secondary domains.

| Domain | Summary | Subdomains |
|---|---|---|
| `ai` | AI-assisted dialogue, characterisation and related AI systems | `dialogue`, `characterisation`, `generation`, `agents` |
| `fauna` | Wildlife, predators/prey and ecosystem simulation | `predation`, `prey`, `habitat`, `reproduction`, `migration`, `lifecycle`, `population`, `domestication` |
| `items-player` | Player inventory, items, tools and item interaction | `inventory`, `items`, `tools`, `interaction`, `player-needs` |
| `npc` | NPC behaviour, needs, goals, traits, decisions and actions | `behavior`, `needs`, `goals`, `decision-making`, `relationships`, `memory`, `lifecycle`, `work`, `combat`, `dialogue` |
| `persistence` | Save data, storage, serialization and migrations | `save-data`, `serialization`, `storage`, `migration` |
| `quests-progression` | Quests, relationships, progression and rewards | `quests`, `relationships`, `progression`, `rewards` |
| `settlements` | Settlements, buildings, population, resources and development | `buildings`, `population`, `resources`, `development`, `economy` |
| `settlements-npcs` | Households, schedules, settlement NPCs and local economy | `household`, `schedules`, `economy`, `logistics`, `social` |
| `tools` | Development tools, diagnostics and automation | `debug`, `development`, `diagnostics`, `automation` |
| `ui-input` | UI, HUD, input and player interaction | `hud`, `menus`, `input`, `interaction`, `feedback` |
| `world` | World state, resources, places, time, weather and simulation | `resources`, `places`, `time`, `weather`, `events`, `simulation` |
| `world-terrain` | Terrain, chunks, vegetation, roads and world rendering | `terrain`, `chunks`, `vegetation`, `roads`, `landmarks`, `rendering` |

`Domain` means "where to look first". Use `Tags` sparingly.

`Roadmap` is optional, and should point to a file in `docs/roadmap` folder.

## Next plan IDs

- ai: `005`
- fauna: `026`
- items-player: `030`
- npc: `036`
- persistence: `005`
- quests-progression: `020`
- settlements: `008`
- settlements-npcs: `033`
- tools: `014`
- ui-input: `017`
- world: `027`
- world-terrain: `023`

This ids section is maintained automatically from the plan files.

Next ideas: [NEXT-IDEAS.md](./NEXT-IDEAS.md)
Loose ends: [LOOSE-ENDS.md](./LOOSE-ENDS.md)

---

## Active threads

Current dependency chains and architectural threads. Not a replacement for `Depends on`.

```text
Combat & weapons
  (155 inventory instances) → (160 HQ melee) → (161 weapon maintenance)
  (150 combat mode) + (155) → (162 bows/ranged) → (177 NPC combat melee+ranged — no live AI trigger yet) → 179 animal attack & NPC defense

Household economy & storage
  (106 food/cooking) + (069 household resources) + (122 water distribution) → (156 storage logistics)
      → 152 NPC food/drink help
      → 159 fishing/preservation/bait
  (122) → (126 seed planting), (127 player-built well)

World-driven quests
  (049) + 093 + (110) → 132 → 016 (settlement opportunities, wolf-den pressure slice)

Rendering performance
  (157 PointLight budget 16) → 149 shader program first-use hitch
  chunk mesh streaming → world-terrain-004

Construction & lodging
  (109) → (111) → (169)
  (165) → (168) → (169)

Natural vegetation
  (140 landscape flora) → (172 natural crop lifecycle) → (126 seed planting)
```

---

## Index completeness

Every base plan in this folder belongs to exactly one section above. Implementation notes, reviews, `README.md`, `NEXT-IDEAS.md`, `LOOSE-ENDS.md` and `archive/` are excluded.

When a plan reaches `done` and is no longer relevant to an active dependency, it stays here until the next deliberate archive snapshot.

Keep summaries short. The README should contain only information useful for choosing, planning or verifying another plan. Implementation detail belongs in the plan and its companion notes/reviews.
