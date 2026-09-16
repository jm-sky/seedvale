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

| File                                                                           | Pri | Effort | Depends                                                                                                                                                                                                                                                                                | Roadmap                                 |
| ------------------------------------------------------------------------------ | --- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `fauna-032-exceptional-animal-appearance-morphs.md`                            | 🟡 | M      | ~~fauna-018~~, ~~fauna-022~~                                                                                                                                                                                                                                                           | quests-hunters-brotherhood              |
| `items-player-037-ubc-runtime-per-slot-outfits.md`                             | 🟡 | XL     | ~~items-player-030~~, ~~items-player-036~~                                                                                                                                                                                                                                             | -                                       |
| `npc-004-npc-genealogy-lineages.md`                                            | ⚪ | S      | -                                                                                                                                                                                                                                                                                      | npc-professions-households-and-age      |
| `npc-032-expedition-needs-and-survival.md`                                     | 🔴 | L      | ~~npc-029~~, ~~npc-017~~, ~~npc-025~~, items-player-028                                                                                                                                                                                                                                | companions                              |
| `npc-033-companion-combat-cooperation.md`                                      | 🔴 | L      | ~~npc-029~~, npc-032, ~~items-player-027~~, ~~npc-025~~                                                                                                                                                                                                                                | companions                              |
| `npc-034-expedition-shared-work-and-activities.md`                             | 🔴 | M      | ~~npc-029~~, npc-032, items-player-028                                                                                                                                                                                                                                                 | companions                              |
| `npc-035-shared-expedition-relationship-consequences.md`                       | 🔴 | L      | ~~npc-029~~, npc-032, npc-033, npc-034                                                                                                                                                                                                                                                 | companions                              |
| `npc-038-work-contract-actor-capability-gating.md`                             | 🔴 | M      | -                                                                                                                                                                                                                                                                                      | -                                       |
| `tools-000-weapon-browser-observatory.md`                                      | 🟡 | M      | -                                                                                                                                                                                                                                                                                      | -                                       |
| `tools-006--world-observatory.md`                                              | ⚪ | XL     | -                                                                                                                                                                                                                                                                                      | -                                       |
| `tools-007--mpfb2-npc-hero-character-pipeline.md`                              | 🔴 | L      | -                                                                                                                                                                                                                                                                                      | -                                       |
| `world-terrain-009-seasonal-ground-and-grass-appearance.md`                    | ⚪ | M      | -                                                                                                                                                                                                                                                                                      | -                                       |
| `world-terrain-015-water-reflection-content-budget.md`                         | ⚪ | S      | -                                                                                                                                                                                                                                                                                      | -                                       |

---

## In progress

| File                                                      | Summary                                                               | Pri | Effort | Depends         |
| --------------------------------------------------------- | --------------------------------------------------------------------- | --- | ------ | --------------- |
| `2026-08-17--149--shader-program-first-use-hitch.md`      | Phase C: `Green` / `MI_WindowGlass` / `Wood`                          | 🔴  | M/L    | -               |
| `settlements-npcs-025-resource-storage-visualization.md`  | Stage 2 implemented?                                                  | ⚪  | M      | -      |
| `world-terrain-010-waterways-and-vegetation.md`           | Phases 2/8/9 deferred — see plan's "Implementation status"            | 🟡  | M      | -      |

---

## Planned

> 💡 - plan have `-implementation-notes.md`, ◼️ - have not

| File                                                                           | Pri | Effort | Depends                                                                                                                                                                                                                                                                                | Roadmap                                 |
| ------------------------------------------------------------------------------ | --- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 💡 `items-player-028-npc-player-storage-access-policies.md`                    | 🔴 | M      | ~~items-player-027~~                                                                                                                                                                                                                                                                   | companions                              |
| 💡 `items-player-032-npc-player-storage-resource-and-context-rules.md`         | 🟡 | L      | items-player-028                                                                                                                                                                                                                                                                       | companions                              |
| 💡 `items-player-014-rope-pullable-resource-transport.md`                      | 🟡 | M      | ~~155~~, ~~122~~                                                                                                                                                                                                                                                                       | physical-resource-storage-and-logistics |
| 💡 `settlements-npcs-022-household-help-and-age-based-work-participation.md`   | 🔴 | M      | ~~settlements-npcs-002~~                                                                                                                                                                                                                                                               | npc-professions-households-and-age      |
| 💡 `npc-037-stale-work-contract-target-discovery-and-notice-cleanup.md`        | 🔴 | M      | ~~npc-018~~, ~~npc-028~~                                                                                                                                                                                                                                                               | -                                       |
| 💡 `settlements-013-horse-training-progression-vendor-and-paddock.md`          | 🟡 | M      | ~~settlements-009~~, ~~settlements-012~~                                                                                                                                                                                                                                               | -                                       |
| ◼️ `settlements-014-persistent-settlement-definition-worldgen-cache.md`        | 🔴 | M      | ~~settlements-009~~, ~~settlements-011~~, ~~settlements-012~~, settlements-013                                                                                                                                                                                                         | -                                       |
| 💡 `quests-progression-039-lost-treasure-chronicles-chronicle-deciphering-and-specialist.md` | 🔴 | M      | ~~quests-progression-038~~, ~~quests-progression-037~~                                                                                                                                                                                                                                 | quests-lost-something-chronicles        |
| 💡 `quests-progression-040-lost-treasure-chronicles-dark-forest-estate-alpha-bear-and-treasure-map.md` | 🔴 | L      | quests-progression-039, ~~quests-progression-009~~, ~~quests-progression-036~~, ~~fauna-022~~                                                                                                                                                                                          | quests-lost-something-chronicles        |
| 💡 `quests-progression-041-lost-treasure-chronicles-dungeon-binding-and-persistent-collapsed-access.md` | 🔴 | L      | quests-progression-040, ~~quests-progression-026~~, ~~quests-progression-027~~, ~~world-024~~                                                                                                                                                                                          | quests-lost-something-chronicles        |
| 💡 `quests-progression-042-lost-treasure-chronicles-expedition-remains-journal-and-missing-key-trail.md` | 🔴 | L      | quests-progression-041, ~~quests-progression-027~~, ~~quests-progression-026~~, ~~world-024~~                                                                                                                                                                                          | quests-lost-something-chronicles        |
| 💡 `quests-progression-043-lost-treasure-chronicles-survivor-site-missing-key-and-final-dungeon-access.md` | 🔴 | L      | quests-progression-042, quests-progression-041, ~~world-024~~                                                                                                                                                                                                                          | quests-lost-something-chronicles        |
| ◼️ `quests-progression-044-lost-treasure-chronicles-final-treasure-claims-and-resolution.md` | 🔴 | L      | quests-progression-043, quests-progression-042, ~~quests-progression-027~~                                                                                                                                                                                                             | quests-lost-something-chronicles        |
| ◼️ `quests-progression-045-lost-treasure-chronicles-property-grant-deed-and-persistent-land-reward.md` | 🔴 | L      | quests-progression-044                                                                                                                                                                                                                                                                 | quests-lost-something-chronicles        |
| ◼️ `quests-progression-046-lost-treasure-chronicles-integration-legacy-catch-up-and-superseded-quest-cleanup.md` | 🔴 | L      | quests-progression-045, quests-progression-044, quests-progression-043, quests-progression-042, quests-progression-041, quests-progression-040, quests-progression-039, ~~quests-progression-038~~, ~~quests-progression-037~~, ~~quests-progression-027~~, ~~quests-progression-009~~ | quests-lost-something-chronicles        |
| 💡 `settlements-npcs-038-travelling-merchant-inter-settlement-role.md`         | 🔴 | L      | ~~settlements-npcs-037~~, ~~settlements-npcs-028~~, ~~settlements-npcs-033~~                                                                                                                                                                                                           | physical-goods-transport                |
| 💡 `settlements-003-colony-bootstrap.md`                                       | 🔴 | L      | ~~world-019~~, ~~settlements-npcs-028~~                                                                                                                                                                                                                                                | quests-abandoned-gold-mine-colony       |
| ◼️ `quests-progression-010-abandoned-gold-mine-colony.md`                      | 🔴 | M      | ~~world-terrain-017~~, ~~world-018~~, ~~world-019~~, ~~settlements-npcs-026~~, ~~settlements-npcs-027~~, ~~settlements-npcs-028~~, settlements-003, settlements-004, ~~quests-progression-002~~                                                                                        | quests-abandoned-gold-mine-colony       |
| ◼️ `settlements-004-gold-economic-realization-and-source-entitlements.md`      | 🔴 | M      | ~~world-018~~                                                                                                                                                                                                                                                                          | quests-abandoned-gold-mine-colony       |
| 💡 `fauna-031-wildlife-habitat-pressure-assessment.md`                         | 🟡 | S      | ~~fauna-010~~, ~~fauna-028~~                                                                                                                                                                                                                                                           | quests-hunters-brotherhood              |
| ◼️ `quests-progression-048-hunters-brotherhood-introduction-and-membership.md` | 🟡 | M      | ~~quests-progression-020~~, ~~quests-progression-033~~, ~~quests-progression-034~~                                                                                                                                                                                                     | quests-hunters-brotherhood              |
| ◼️ `quests-progression-049-hunters-brotherhood-hunting-ground-investigation.md` | 🟡 | M      | quests-progression-048, fauna-031                                                                                                                                                                                                                                                      | quests-hunters-brotherhood              |
| ◼️ `quests-progression-053-hunters-brotherhood-competing-hunting-strategies.md` | 🟡 | L      | quests-progression-049                                                                                                                                                                                                                                                                 | quests-hunters-brotherhood              |
| ◼️ `quests-progression-054-hunters-brotherhood-exceptional-animal-finale.md`   | 🟡 | L      | quests-progression-053                                                                                                                                                                                                                                                                 | quests-hunters-brotherhood              |
| 💡 `items-player-039-ubc-runtime-pauldrons.md`                                 | 🟡 | M      | ~~items-player-030~~, ~~items-player-036~~                                                                                                                                                                                                                                             | -                                       |
| ◼️ `items-player-040-armor-quality-pricing-and-world-availability.md`          | 🟡 | M      | ~~items-player-030~~, ~~settlements-012~~                                                                                                                                                                                                                                              | -                                       |
| ◼️ `tools-005-seedvale-character-preparation-panel.md`                         | 🔴 | M      | -                                                                                                                                                                                                                                                                                      | -                                       |

---

## Verification needed

Implementation is complete; only meaningful browser/manual verification remains.

## Do sprawdzenia

| Plan | Sprawdź |
|------|---------|
| `quests-progression-052-second-wave-socially-consequential-authored-dialogue.md` | Ten sam końcowy wybór przy niskiej vs wysokiej relacji/reputacji daje inną kwestię NPC; canonical outcome i exact item instance bez zmian; delty społeczne czytelne, nie nadmierne; unrelated dialogue/trade nie zablokowane |
| `world-029-low-cost-lighting-and-film-grade-tuning.md` | Clear: `?time=06:00`, południe, 18:00, północ; powtórzyć deszcz/burzę; skały/drzewa/NPC/budynki w słońcu i cieniu; brak whiteoutu horyzontu, przepaleń bloom, agresywnie niebieskich cieni, zbyt ciemnej nocy; pogoda nadal wyraźnie przyciemnia światło; film grade wspiera materiały, nie maskuje lighting |
| `world-terrain-036-low-cost-natural-material-response-tuning.md` | Skały w słońcu/cieniu bez plastikowego połysku; żywe i martwe drzewo oraz fallen log z bliska — kora czytelna, korona bez regresji alpha/wind; brak hitch przy streamingu; brak nowych draw calls |
| `quests-progression-047-deferred-world-knowledge-and-location-research.md` | New game; guard „Opowiedz mi coś o okolicy” na zimnym świecie bez freeze, prosi o powrót; za wcześnie — nadal pending; po godzinie świata — 1–3 konkretne miejsca; save w trakcie research i continue; `slad-przy-monolicie` — Anna później daje kierunek, tylko wskazany monolit kończy objective; immediate location quests bez zmian |
| `settlements-012-regional-specialist-trade-and-settlement-scale-quality.md` | SM/MD mało Merchantów; LG/XL mogą mieć kilku z różnymi specjalizacjami i własnymi stallami; duża osada nie jest jednym supermerchantem; mountain/forest/coast różne oferty; premium częstsze w dużych, bez hard-lock; kupiony rare nie wraca po reopen; ceny nadal z relacji/reputacji; market bez kolizji centralnych propsów |
| `settlements-010-closed-and-cautious-settlement-character.md` | Część leśnych osad `closed`, home `default`; pełniejszy perimeter i para pochodni przy każdym inland road entrance; więcej guardów; ostrożniejsi NPC, ale zaufanie/reputacja nadal wygrywają; niska naturalna presja drapieżników dostaje tylko brakującą capacity, wysoka nie puchnie |
| `quests-progression-037-lost-treasure-chronicles-elder-trust-foundation.md` | W pobliskiej osadzie SM/MD jest Kazimierz Nowak (~74 lat) jako zwykły mieszkaniec; home i outpost bez niego. Quest zima: gałęzie albo rozmowa z sąsiadem dają różne endingi; spór odblokowuje się po obu. W sporze obie strony wiarygodne; poparcie starszego vs zgoda zmienia relacje inaczej; `trusted` nie spada za darmo z samych tych dwóch questów. Save/load bez duplikatu NPC i bez ponownego zastosowania konsekwencji |
| `world-terrain-017-abandoned-mountain-mine-landmark.md` | Nowy świat: `abandonedMine` istnieje niezależnie od questów; wejście w górach, nie na izolowanym pagórku; `mineId` stały po reload/rebuild; dungeon nie jest kopalnią; questy bear-cave / old-bones / lost-hunter / suspicious-transport / dungeon bandit / lost-treasure expedition bez zmiany targetu jaskini |
| `settlements-009-settlement-outskirts-and-pasture.md` | MD ma małe pastwisko poza zabudową; LG/XL wyraźniejsza strefa; pasture nie przecina budynków/rzeki/głównej drogi; przy palisadzie za skrzydłami wejścia; czytelny płot (preferencyjnie dwa odcinki z przerwą); shepherd w dzień idzie na pasture; stado z nim; trough/studnia dostępne; drapieżnik może zagrozić stadu poza ochroną core; NPC/zwierzęta wracają wieczorem do household |
| `settlements-npcs-027-npc-expedition-assignment-and-provisioning.md` | Brak UI: `formExpeditionAssignment` / `provisionExpeditionAssignment` / `markExpeditionAssignmentReady` na `WorldBundle`; save v45 `expeditionAssignments`; testy jednostkowe już pokrywają resolver/provisioning |
| `items-player-038-ubc-jump-land-move-lock.md` | UBC: skok z WASD — krótki recover, potem chód/sprint bez slajdu w pozie stania; skok w miejscu — pełny Jump_Land |
| `npc-040-ubc-profession-appearance-variants.md` | Home: dorośli farmerzy nie są klonami (fryzura/broda/hue); woodcutterzy ziemisty brąz, farmerzy szafir; hunter = Ranger fiolet (`T_Ranger_2`), nie zielony/brązowy gracza; część mężczyzn z brodą, kobiety bez; Kasia/trader = Wizard (Long/Buns vs kapelusz — oględziny); Ranger hood vs Long/Buns — oględziny; reload/rebuild ten sam look; gracz Peasant oliwkowy / leather Ranger zielony; `?playerTint=brown` nie recoloruje NPC |
| `items-player-035-ubc-ual-player-animation-coverage.md` | `?modelTest&model=ubc/male_ranger&anims=ubc/ual1_player` >4 clipów; Peasant/Ranger: locomotion, slash, łuk, sneak crouch, pływanie, skok bez tiltu, HP 0 = Death01; Adventurer bez regresji; `ual1_player.glb` setki KB |
| `items-player-034-equipment-driven-player-outfit.md` | Default Peasant; załóż leather/chainmail → Ranger bez reloadu; zdejmij → Peasant; Continue z założoną skórą; `?player=adventurer` ignoruje zbroję; `?playerTint=brown` |
| `items-player-033-ubc-player-model-alpha.md` | `?player=peasant` / `?player=ranger` / default Peasant: idle/chód/sprint/cios, trzymane narzędzie, cienie. Opcjonalnie `?modelTest&model=ubc/male_peasant&anims=ubc/ual1_player` |
| `settlements-017-deterministically-unique-settlement-names.md` | Nowy świat, kilka pobliskich osad: brak dwóch identycznych nazw na drogowskazach/UI; ten sam seed po reloadzie te same nazwy; daleka osada nie zmienia nazw już odwiedzonych |
| `settlements-016-legacy-ruby-trade-valuation.md` | Sprzedać authored `ruby` (bear-cave / dark-forest chest) kupcowi — buyback wyraźnie powyżej 1 coina, w okolicy `ruby_medium` (neutralnie 63); `ruby_small/medium/large` bez zmian |
| `quests-progression-036-one-shot-authored-treasure-map-pickup.md` | Podnieść authored treasure map; rebuild/powrót w miejsce źródłowe — pickup nie wraca; save/load — nie wraca; wyrzucenie mapy z inventory — źródło nadal puste; New Game — pickup znowu leży |
| `quests-progression-038-lost-treasure-chronicles-archaeologist-and-chronicle-search.md` | Po zimie starszy wskazuje Konstantego w większej osadzie (strong lead dodaje nazwisko badacza); dwa miejsca: cmentarz i ruiny; kronika tylko w jednym; drugi daje ślad; kopanie grobu bez zgody = istniejąca kara, z questem opiekuna tylko ten grób jest legalny; rozdział kończy się gdy kronika jest w ekwipunku (nie na ziemi); save/rebuild bez drugiej kroniki |
| `world-terrain-034-bidirectional-cave-traversal-safety.md` | Wejść do kilku jaskiń i wyjść tą samą drogą; szczególnie komora z dużą różnicą wysokości; brak cliffów/stepów blokujących ruch w obie strony |
| `ui-input-020-world-interaction-targeting-and-acquisition-feedback-regressions.md` | Zebrać stone/branch ręcznie i przez kopanie/drzewo — toast `+N · Masz: total`; zabić zwierzęta pod różnymi kątami i oprawić bez walki o cel; przy studni z NPC Tab aż studnia; `[V]` inspection studni; niedokończona studnia bez `[R] wymagania` |
| `fauna-030-player-owned-animal-stay-safety-and-recovery.md` | Kupić konia, Stay w home settlement, odejść daleko i wrócić — koń w okolicy anchora; save/load i ponowny powrót do osady; spragniony koń pije z naturalnej wody/trough lokalnie i wraca; nie znika przy streamingu osady; śmierć nie odtwarza duplikatu merchant-horse |
| `quests-progression-035-story-item-inventory-and-cave-location-clarity.md` | Mapa skarbu: `Odczytaj` na liście ekwipunku; filtry `Fabularne`/`Inne`; quest jaskini natural/adventure/dungeon podaje archetyp + kierunek (i nazwę tylko przy guard/hunter/miner/trader); `skalna grota` dla authored `rockDen`; kierunek zgadza się z realnym położeniem |
| `tools-013-npc-decision-verification-and-scenario-tooling.md` | `npc(id).decisions()` pokazuje cykle need→strategy→action; `animalThreat.response` ma defend/flee scores; `contract.evaluated` ma breakdown; `settlement(id).decisions()` po `setFrenzyWolves(n)` — sensed/responded/combat/flee/death per NPC; inspector sekcje cycles/threat/contract; brak zmiany gameplayu |
| `world-023-species-driven-sowing-density-and-yield.md` | Zasadzić po jednej jednostce seed_carrot/potato/cabbage: znika 1 seed, widać gatunkową grupę roślin jako jeden interactable; zbiór daje species yield (marchew 5, ziemniak 8, kapusta 2), garden care/hydration nadal skaluje ten base yield; Farmer i aggregate off-screen używają tego samego `CROP_DEFS`; chunk reload/save nie losuje layoutu ani nie mnoży placements; naturalny crop zostaje pojedynczą dziką rośliną, nie polem |
| `fauna-028-animal-agent-update-cadence.md` | Benchmark przed/po: `FAUNA`/`livestock` `behaviour` i `life/presentation` ms/frame wyraźnie w dół, `expensive behaviour agents/frame` znacznie poniżej ~27.8, `high-priority agents/frame` bez zmian; wizualnie — zwierzęta blisko gracza (≤20 m) animują się bez zmian, dalekie wolniej ale bez zacinania/teleportów; wilk atakujący/uciekający, spłoszone stado, pies broniący zagrody, jeździec, zwierzę na lince i wóz z zaprzęgiem reagują klatka po klatce; zwierzę tonące traci HP natychmiast; zwierzęta poza ekranem nadal jedzą, piją, dojrzewają i wędrują; brak nowego periodycznego spike'u co N klatek |
| `ui-input-017-quest-log-information-architecture.md` | Quest Log otwiera się na Bieżące (active + ready_to_report); Oferty i Historia osobno; `not_offered` nigdy nie widać; ready_to_report na górze Bieżących i wyróżnione; failed/invalidated/abandoned w Historii z własnymi etykietami, nie jako sukces |
| `settlements-npcs-033-player-trading-with-any-npc.md` | Hunter produkuje strzały ponad protected reserve → dialog Huntera pokazuje `Handel` z tylko nadwyżką strzał; zakup zmniejsza `Household.items` i zwiększa ekwipunek gracza dokładnie o kupioną ilość, a monety trafiają do `personalInventory` Huntera; reserve (per-hunter `HUNT_RESUPPLY_ARROW_TARGET`) nigdy nie schodzi poniżej progu w ofercie; zmiana relacji/reputacji zmienia cenę we właściwym kierunku (lepsza relacja ≤ cena, gorsza ≥ cena) bez arbitrażu z merchant buyback; zwykły NPC bez uprawnionych dóbr nie pokazuje `Handel` i nie generuje fake stocku; zamknięcie/otwarcie ekranu odświeża ofertę z żywego stanu; Kupiec nadal ma pełny `MERCHANT_STOCK`, konia i barter; save/load po handlu zachowuje zredukowany stock, przedmioty gracza i monety NPC bez nowego pola w `SaveData` |
| `settlements-npcs-036-generic-npc-owned-goods-trading.md` | Textile/herbalist/blacksmith outputs (`wool_material`, `linen_material`, `bandage`, `dressing`, `iron_rod`) w `Household.items` pojawiają się jako `Handel` i po zakupie znikają dokładnie z gospodarstwa; Hunter arrow reserve bez regresji; `branch`/`beam`/nasiona/żywność/`wool`/`flax`/`herb` nie wchodzą do oferty; allowlistowany stack w `personalInventory` sprzedaje się stamtąd, loadout/`coin`/story/`carried`/`transportCargo` nigdy; Kupiec `MERCHANT_STOCK`/koń/barter bez zmian; save/load bez nowego pola |
| `settlements-npcs-017-production-demand-and-economic-pressures.md` | Start z iron+coal: kowal robi pręty; wyczerp input → jeden persistent shortage (nie per kowal); presja w inspect bez nowego AI; przywróć input → shortage znika, produkcja wraca; hunter household A/B niezależne; save/load zachowuje tylko nadal zablokowany shortage |
| `world-terrain-027-landmark-variety-and-quest-hooks.md` | Łódź naturalnie na brzegu; wrak wyraźnie większy; wieża na wybrzeżu/w górach; stare drzewo = dedykowany model + polana; wóz przy drodze, nie na niej; landmarki nie nachodzą na osady; `interact_landmark` działa bez questa; questy wraku/wieży wiążą realne `landmarkId`; loot nie jest wymagany w V1 |
| `quests-progression-026-dungeon-bandit-treasure.md` | Guard/hunter giver oferuje loch; deep stash ma rejestr + oznaczony łup; side cache opcjonalne i nie blokują; `finalTreasure` nietknięty; return/guard/keep działają fizycznie (guard zabiera oba itemy); fauna nie jest wymagana; save/rebuild bez respawnu story items |
| `quests-progression-027-lost-treasure-expedition.md` | Sponsor (trader/miner) oferuje loch; kolejne skrzynie (obóz → tobół z dziennikiem → dowody → prawdziwy skarb) w narastającej głębi; `finalTreasure` nietknięty przez quest 026 gdy współdzielą loch; dziennik trafia fizycznie do rodziny/sponsora albo zostaje przy graczu; brak drugiego interesariusza redukuje wybór do sponsor/keep; skarb zawsze zostaje przy graczu; fauna nie jest wymagana; save/rebuild bez respawnu dziennika |
| `quests-progression-031-per-source-opportunity-defs.md` | Kilka zwierząt w gospodarstwie: każde ma stabilny `world:lost-livestock:…` def, ale Quest Log / oferta tylko dla zwierzęcia z aktywnym `lost-alive`/`corpse-uninspected`; naturalny stray mid-session na spokojnym wcześniej zwierzęciu → opportunity bez reloadu; generated nigdy nie woła `startLivestockStray`; authored `zagubiona-owca` i generated nie pokazują dwóch questów dla tego samego zwierzęcia; save z aktywnym `world:lost-livestock:…` odbudowuje ten sam def; limit RPG matrices bez regresji |
| `quests-progression-030-external-resolution-and-real-problem-offering.md` | Wilcza jama: zniszczenie przez gracza → `den_destroyed` / ready_to_report; aktywny quest, den znika bez destroy → `resolved_without_player` bez item reward; offer niezaakceptowany + source gone → `not_offered`. Authored `zagubiona-owca`: accept startuje realny stray (lub reuse istniejącego); generated lost-livestock dla spokojnej owcy nie oferuje i nie teleportuje; naturalny stray → offerable; naturalny `returned` → `live_return` |
| `quests-progression-033-quest-offer-selection-prioritization-and-abandonment.md` | NPC z wieloma questami nie oferuje wszystkiego naraz (tylko 1 normalna nowa oferta); po ukończeniu/decline/abandon pojawia się kolejna sensowna oferta; declined quest nie wraca od razu (suppression); opcjonalna kara relation/reputation przy abandon działa tylko tam, gdzie zdefiniowana; story quest (np. jaskinia niedźwiedzia, zaginiony myśliwy, podejrzany transport, stare kości, skrytka bandytów) respektuje authored wyjątki i nie pokazuje generic decline/abandon; nagły problem świata może przebić normalną ofertę (urgent), ale nie tworzy lawiny urgentów; problem świata trwa dalej po decline/abandon |
| `world-terrain-026-cave-distant-mouth-occlusion.md` | Z kilku odległości i kątów: daleki otwór jaskini nie pokazuje jasnego nieba; wejście w pełną prezentację bez „gołej” dziury; wyjście przywraca proxy; blisko wejścia bez zmian; wnętrze/dungeon normalnie; wielokrotne przejścia przez 55/80 m bez leaków i bez thrashu terenu |
| `quests-progression-022-lazy-social-news-propagation-and-reputation-catch-up.md` | Na cold world/cache zabij wilka/niedźwiedzia i potwierdź brak freeze; zabicie przy aktywnej osadzie od razu podnosi lokalne competence/courage/renown; zabicie z dala od aktywnych osad nie daje natychmiastowej reputacji, ale odwiedzenie pobliskiej osady w ciągu 7 dni (TTL) daje catch-up; kolejna pobliska osada może dostać słabszy relayed renown bez sztucznego pełnego local reputation; save/load z pending eventem → późniejszy catch-up działa dokładnie raz; po >7 dniach nowo odwiedzona osada nie dostaje starego animal-deed news |
| `settlements-npcs-034-household-wood-authority-and-repair-correctness.md` | Household wood jako konkretne `branch`/`beam` w `Household.items` (nie scalar stock); hunter arrow production i structure repair konsumują te same realne itemy, które trafiły do household; `repairStructure` dostaje dodatni pressure tylko gdy naprawa jest realnie możliwa albo epizod już trwa; brak decision livelock przy race scoring/`beginRepairStructure()`; save v39 migruje legacy `stock.wood` do `items.branch` |
| `settlements-npcs-035-household-wells-and-population-scaling.md` | Duża osada: centralna studnia + household wells wg 3+/50%/floor(pop/6); studnie przy domach bez kolizji z budynkami/yard; kolejki rozdzielone; NPC z różnych householdów wybierają lokalne źródła; waterDuty wraca do właściwego domu; SFX/facing/interaction bez regresji; reload/Continue odtwarza ten sam układ |
| `fauna-026-predator-livestock-encounter-set.md` | Puść dzikiego wilka w pobliże gospodarstwa z owcą/krową/kurą — wilk realnie wybiera je jako prey (nie tylko dzikie zwierzęta), goni, atakuje i może zabić przez zwykły combat (nie instant-kill); zabite zwierzę przechodzi przez zwykły corpse/`onAnimalDeath`; `huntingPrey()` niesie realny household owner, więc pasterz (`shepherdFlock`) i pies stróżujący (`dogGuard`) reagują na realne polowanie na własny inwentarz, nie tylko na atak na człowieka; pies broni własnego stada wilka polującego na jego household livestock i przestaje po śmierci/oddaleniu wilka; usunięcie zwierzęcia ze świata w trakcie pościgu (np. stream-out osady) natychmiast przerywa pościg bez "ostatniego" trafienia; dzikie polowanie wilk↔dzikie zwierzę działa jak wcześniej, gdy w pobliżu nie ma inwentarza; brak zauważalnego spadku FPS przy większej liczbie zwierząt w pobliżu osady |
| `fauna-023-systemic-animal-attraction-food-blood-and-trap-lures.md` | Połóż `raw_meat` przy wilku → podejście i zjedzenie (nie instant z dystansu); lis na świeże mięso, roślinożerca nie; niedźwiedź na mięso + berries/apple/nuts/honey + blood; bear fresh/rotting carcass tak, bones nie; bear ignoruje bait w simple/good trap; zabranie mięsa przed dojściem = brak relief; trail z kilku kawałków/krwi; wilk do good trap z detection/capture; flee/walka przerywają attraction |
| `items-player-031-armor-category-and-character-defense-summary.md` | Ekwipunek: filtr `Pancerze`, zbroje nie pod `Broń`; Kupiec: filtr `Pancerze` w BUY/OFFER; ekran Postaci: sekcja `Pancerz` z agregatem z `resolveEquipmentModifiers()` i sześcioma slotami; save/load i zmiana zbroi przy otwartym ekranie odświeżają wartości |
| `items-player-029-wearable-armor-and-combat-equipment.md` | Kupiec sprzedaje `leather_armor`/`chainmail`; „Załóż”/„Zdejmij” w ekwipunku pokazuje ochronę/wysiłek/tempo/ruch; noszona zbroja zauważalnie zmniejsza obrażenia od zwierząt (kolczuga wyraźnie bardziej niż skóra), ale aktywny blok trzymanym przedmiotem nadal działa; kolczuga wyraźnie spowalnia i męczy (atak/sprint/ruch) mocniej niż skórzana; sprzedanie/upuszczenie założonej zbroi natychmiast usuwa efekt bez ducha bonusu; głód/pragnienie nie są łagodzone przez zbroję; save/load zachowuje założony przedmiot (i poprawnie ładuje pusty slot przy starym zapisie); waga zbroi nadal liczy się do przeciążenia ekwipunku |
| `fauna-025-livestock-stray-return-and-recovery.md` | Wywołać flee household livestock i potwierdzić, że małe oddalenie nie tworzy stray; doprowadzić do większego displacement i obserwować naturalne rozpoczęcie stray episode (bez questa); nie pomagać zwierzęciu i sprawdzić, że po uspokojeniu samo próbuje wrócić do home; podczas powrotu wywołać threat/scare i sprawdzić przerwanie oraz późniejszą ponowną próbę (bez teleportu, bez utraty stray); aktywować lost-livestock quest, nie prowadzić zwierzęcia i pozwolić mu wrócić samemu — quest ma rozwiązać się z realnego `returned` state; save/load podczas stray i podczas drogi powrotnej zachowuje pozycję/ownera i pozwala wznowić powrót |
| `world-026-storms-thunder-animal-scare-and-snow-visuals.md` | Wymuś snow: płatki bez kwadratowych rogów z różnych odległości. Wymuś storm: mocny deszcz/wiatr, flash → opóźniony thunder, warianty thunder bez spamu jednego eventu. Stado livestock: nie każdy grzmot i nie każde zwierzę flees; bliżej domu/opiekuna spokojniejsze. Burza nie tworzy questa ani stray. Cave/interior ścisza deszcz/thunder |
| `settlements-007-systemic-settlement-structure-condition-and-shared-repair.md` | `structure.damageHouse(settlementId, familyIndex, amount)` (`?debug=1`) uszkadza dom osady; `[R]` na domu otwiera dialog naprawy dopiero poniżej progu albo gdy naprawa jest aktywna; quote pokazuje materiały/czas i blokuje start bez wystarczających materiałów; start atomowo zużywa materiały z gracza (Inventory + pobliskie dropped items), nigdy dwukrotnie przy wznowieniu; gracz i NPC (naprawiający własny dom z household items) mogą kontynuować ten sam epizod; stream-out/in osady i pełny rebuild `WorldBundle` zachowują condition/progress; save/load w trakcie naprawy zachowuje stan; starszy save bez `structureStates` odtwarza pristine; naprawa nie jest critical interrupt — pragnienie/głód/pogoda/heal nadal wygrywają |
| `settlements-npcs-006-wool-to-material.md` | Textile Worker bez WorkContract; przy ≥4 wełny w `Household.items` konsumuje dokładnie 4 wool i tworzy 12 `wool_material`; 0–3 wełny blokuje bez outputu; przerwanie nie zużywa wełny; produkcja nie bierze wełny z innego gospodarstwa/magazynu |
| `settlements-npcs-015-economic-production-and-input-integration.md` | Hunter z gałęzią/belką w gospodarstwie craftuje strzały przy `work` (gałąź przed belką, 1→1 / 1→8); brak materiału nie zużywa nic; drwal nadal dodaje drewno osady przy depozycie; mixed/stock recipes nie mintują częściowego wyniku |
| `settlements-npcs-016-first-processing-chain-and-blacksmith-production.md` | Kowal: sharpening nadal pierwszeństwo przy whetstone i broń poniżej progu; inaczej przy `iron`×2 + `coal`×1 w stocku osady kończy `work` → `iron_rod` w `Household.items`; brak któregoś inputu nie startuje processing; zużycie stocku przed completion = blocked bez częściowej mutacji; miner deposit bez zmian; brak osobnego production ticka |
| `settlements-npcs-023-profession-staffing-and-settlement-composition.md` | Home: Anna/Piotr/Kasia/Marek nadal istnieją, w tej samej kolejności, i oferują authored questy; mała ogród/las osada ma food livelihood bez Tradera/Kowala; osada przy significant ore ma Minera wewnątrz istniejącej liczby domów (bez extra resource family); OUTPOST nadal 1 NPC z forced resource role |
| `world-terrain-028-archetype-aware-cave-story-and-loot-anchors.md` | Większość adventure caves bez auto-skrzyń; ~20% ma dwa skrzynie jak dawniej; natural/dungeon mają storyFind/loot (i dungeon side/final treasure anchors); rebuild/save bez nowych pól profilu; dungeon sideTreasure nie spawnuje adventure loot |
| `quests-progression-025-adventure-cave-old-bones.md` | Osobna adventure cave z profilem `EMPTY` (nie 008/`DOUBLE_TREASURE`); cache ze szczątkami + `signet_ring` istnieje przed przyjęciem; łańcuch giver → claimant A → loot → opcjonalnie B → `return_to_first_claimant` / `give_to_second_claimant` / `keep_signet`; exact-instance hand-in; rebuild/save bez respawnu sygnetu |
| `quests-progression-026-dungeon-bandit-treasure.md` | Dungeon deep `loot` + opcjonalne `sideTreasure` (bez `finalTreasure`); cache z `bandit_ledger`/`marked_valuable` przed przyjęciem; return / give_evidence_to_guard / keep; exact-instance hand-in; rebuild/save bez respawnu |
| `world-024-systemic-treasure-sites-and-keys.md` | Locked chest without the matching key; key is a meaningful distance from its chest; abandoned pickup and buried shovel path; cemetery grave key (if generated) still applies grave-robbing reputation; correct key opens the normal chest UI, another `key` instance does not; save/reload before and after taking/moving a key, and after unlocking/looting; streamed/reloaded looted chests stay empty and unlocked; no cave treasure yet |
| `items-player-026-treasure-loot-forced-entry-and-traps.md` | Systemic chest has 50–200 coins plus a sized ruby/diamond; matching key opens without trap risk; `[R] Wyłam` needs a held pry tool (axe/pickaxe/battle_axe/pitchfork) and is a timed action; failed attempt can retry but save/reload does not reroll the same attempt; mechanical damage/fire leave coins and gems; destroyed chest leaves remains with surviving valuables once; blade trap hurts through normal HP; player-placed chests stay unchanged |
| `npc-016-work-contracts-payment-and-employer-interaction.md` | Najemnik po skończonej pracy podchodzi tylko gdy gracz jest w pobliżu; dialog otwiera Zapłać N / Jeszcze nie; monety schodzą z gracza do `personalInventory` NPC; za mało monet / pełny ekwipunek NPC nic nie rusza; powtórne Zapłać nic nie robi; śmierć najemnika nie obciąża gracza; save/load zachowuje należność i już wypłacone monety |
| `settlements-005-residential-house-construction.md` | Placement małej/średniej chaty, stage-gated materiały, praca gracza i NPC, terrain prep przy stoku, ukończenie → lodging high, anulowanie niedokończonej, save/load |
| `settlements-npcs-014-local-goods-circulation.md` | Naturalny obieg dóbr: producent → handlarz → magazyn → gospodarstwo |
| `npc-010-death-and-corpse-lifecycle.md` | Śmierć NPC: corpse zostaje w miejscu śmierci (nie w domu), loot loadoutu, decay w czasie, save/load bez duplikacji itemów, legacy martwy NPC bez sfabrykowanego corpse |
| `npc-011-npc-burial-and-graves.md` | Członek household po śmierci kogoś z rodziny może dostać burial pressure, odebrać claim, dojść do corpse, wykonać pochówek i zostawić persistent grave + terminal corpse; brak fake NeedId; brak duplikacji grave po reload/rebuild; legacy dead bez corpse nie dostaje grave |
| `npc-026-npc-grave-visits.md` | Żyjący członek rodziny okazjonalnie odwiedza persistent grave zmarłego; wizyta przegrywa z potrzebami/pogodą/snem, wygrywa z idle; cooldown per zmarły przeżywa save/load; brak fake NeedId i nearest-cemetery fallback |
| `npc-007-interaction-destination-approach.md` | NPC naturalnie podchodzą do studni i nie wpadają w pętle ruchu |
| `npc-013-night-campfire-gathering.md` | Naturalność nocnych spotkań NPC przy ognisku |
| `npc-012-weather-reaction-and-shelter.md` | Naturalność reakcji NPC na złą pogodę i powrotu do rutyny |
| `npc-015-work-contracts-npc-work-and-construction.md` | Pełny przebieg kontraktu NPC w świecie, w tym przerwanie przez potrzeby i wznowienie |
| `npc-017-work-contracts-food-and-drink.md` | Długi/zdalny kontrakt: ograniczone zaopatrzenie do `personalInventory`, jedzenie/picie z własnych zapasów w trakcie podróży/pracy, przerwanie głodem/pragnieniem bez `releaseWorkContract()`, wyczerpanie zapasów bez magicznego refillu, save/reconstruction zachowuje `personalInventory` |
| `fauna-012-animal-threat-perception-and-vocalization-responses.md` | Wycie wilka i alert bark psa realnie zwiększają flee u pobliskiego prey/livestock poza spatial `fleeRange` (bez paniki na odległe/nieaktualne zdarzenia); kilka psów nie tworzy kaskady szczekania; brak zauważalnego regresu frame time przy większej liczbie zwierząt |
| `fauna-016-animal-habitats-roaming-water-trips-and-settlement-rats.md` | Deer/stag habitat (las/skraj lasu), brak spawnu przy drogach, species-specific roaming, dalekie wyprawy do wody z powrotem do local behaviour, szczury jako mała populacja osadnicza (widoczne, zmniejszają zapasy, zabijalne przez psa/gracza) |
| `npc-002-npc-healing.md` | NPC ranny w walce (`?debug=1&debugNpcCombat=1` do zadania obrażeń) leczy się dopiero po zakończeniu walki: idzie do domu, zużywa catalogowy `injuryTreatment` (`bandage`; `herb` sam nie wystarcza po npc-025), HP rośnie, po czym wraca do normalnej autonomii; bez odpowiedniego treatmentu nie ma healing candidate |
| `npc-025-injury-severity-and-treatment-requirements.md` | `?debug=1`: `injury.applyNpcInjury(id, 'minor'|'serious'|'critical')` pokazuje derived severity i SPEA; minor regeneruje się naturalnie z HP; serious wolniej i mocniej idzie się leczyć; `bandage` leczy uraz, `herb` nie; critical nie schodzi naturalnie do serious; `giveNpcBandage` + leczenie stabilizuje critical; brak leczenia nie zapętla heal; combat nie jest przerywany; save/streaming zachowuje `physicalInjury` |
| `items-player-021-player-skills-and-targeted-skill-actions-foundation.md` | Skills: Medycyna i Naprawa widoczne; wybór Pułapki wchodzi w targeting; [E] na istniejącej pułapce otwiera Sprawdź z żywym stanem/wytrzymałością/przynętą; Esc anuluje targeting bez mutacji świata; bez wybranego skilla arm/disarm/collect działają jak wcześniej |
| `items-player-019-player-camp-repair-and-sewing-kit.md` | Zakup zestawu do szycia; naprawa namiotu/posłania/podestu; brak narzędzia/materiału; przerwa + wznowienie; save/load w trakcie naprawy; aktywna naprawa namiotu blokuje składanie; id/condition namiotu przeżywa pack → save/load → redeploy |
| `fauna-007-animal-leading-and-cart-harness.md` | Koń/osioł: Prowadź na linie, zwierzę idzie za graczem bez teleportu; Odepnij linę wraca do normalnego AI; potrzeby i threat wygrywają z lead; Przywiąż do wózka / Odepnij wózek; wózek jedzie za zwierzęciem; łańcuch gracz→koń→wózek; krowa nie zaprzęga; hitch nie przeżywa save/load |
| `settlements-npcs-019-persistent-and-off-screen-transport.md` | Trader podnosi towar → order `in-transit` → NpcAgent/WorldBundle rebuild nie resetuje `transportCargo`, pickup się nie powtarza; osada carriera streamuje się out mid-transit → order dostaje `execution` off-screen, cargo zostaje u NPC, po powrocie w zasięg dostawa kończy się dokładnie raz (albo już się zakończyła off-screen — bez drugiego unload); save podczas `in-transit` → reload → to samo cargo/order, dostawa raz; time skip dłuższy niż pozostały czas podróży kończy dostawę raz, krótszy zostawia order `in-transit`; ilości source+cargo+destination stałe w każdym scenariuszu |
| `npc-029-npc-accompany-follow-commitment.md` | `?debug=1`: `npc(id).startAccompany('follow')` — NPC trzyma dystans bez klejenia się do gracza, hysteresis nie drga na progu; `setAccompanyMode('stay')` zostaje przy kotwicy i nie goni; powrót do follow dogania pieszo bez teleportu; głód/pragnienie/sen/combat/flee przerywają follow i ten sam commitment wraca; zakończenie (`endAccompany`) wraca do zwykłego schedule; save/load i stream-out/in osady nie resetują NPC do spawnu w domu ani nie duplikują; NPC bez commitmentu zachowuje się jak wcześniej |
| `npc-030-paid-expedition-escort-work-contracts.md` | Quick Actions „Zleć eskortę" tworzy nieogłoszony kontrakt (czas trwania + nagroda), bez placementu w świecie; zaniesienie na tablicę ogłasza go; różne zwykłe NPC akceptują/odrzucają zależnie od nagrody/relacji/roli/zajętości/prowiantu; zaakceptowany NPC podąża przez zwykły accompany (potrzeby/pogoda/walka przerywają, wraca); zakończenie po upływie czasu wypłaca pełną nagrodę przez istniejący dialog płatności; anulowanie w trakcie usługi daje proporcjonalną zapłatę, przed startem — zero; śmierć/porzucenie NPC nie tworzy nowej zapłaty; save/load w trakcie eskorty zachowuje kontrakt+commitment; istniejące kontrakty budowlane (tworzenie/tablica/multi-worker/płatność) działają bez zmian |
| `npc-031-voluntary-expedition-joining.md` | W dialogu NPC „Zaproponuj udział w wyprawie" → wybór czasu trwania → natychmiastowa zgoda/odmowa, bez ekonomii/Work Contract; ciekawski/otwarty NPC z małymi zobowiązaniami plausibly akceptuje, taki sam ale obciążony rodziną/pracą raczej odmawia; zaufany gracz przyjmowany mimo niskiego renown, sławny ale nielubiany gracz nie jest automatycznie akceptowany; NPC może samodzielnie podejść i zaproponować dołączenie (auto-otwarty topic w dialogu), bez spamowania kolejnych propozycji; odmowa (gracza lub NPC) nie zostawia ukrytego stanu towarzysza; akceptacja daje dokładnie ten sam accompany/follow co płatna eskorta (npc-029), bez UI płatności; zakończenie commitmentu wraca NPC do normalnego harmonogramu |

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
- fauna: `033`
- items-player: `041`
- npc: `041`
- persistence: `005`
- quests-progression: `055`
- settlements: `018`
- settlements-npcs: `039`
- tools: `015`
- ui-input: `022`
- world: `030`
- world-terrain: `037`

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
