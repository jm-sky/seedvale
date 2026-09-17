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

| File                                                                           | Pri | Effort | Depends                                                                                                                                                                                                                                                                                    | Roadmap                                 |
| ------------------------------------------------------------------------------ | --- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| `fauna-032-exceptional-animal-appearance-morphs.md`                            | 🟡 | M      | ~~fauna-018~~, ~~fauna-022~~                                                                                                                                                                                                                                                               | quests-hunters-brotherhood              |
| `items-player-037-ubc-runtime-per-slot-outfits.md`                             | 🟡 | XL     | ~~items-player-030~~, ~~items-player-036~~                                                                                                                                                                                                                                                 | -                                       |
| `npc-004-npc-genealogy-lineages.md`                                            | ⚪ | S      | -                                                                                                                                                                                                                                                                                          | npc-professions-households-and-age      |
| `npc-032-expedition-needs-and-survival.md`                                     | 🔴 | L      | ~~npc-029~~, ~~npc-017~~, ~~npc-025~~, items-player-028                                                                                                                                                                                                                                    | companions                              |
| `npc-033-companion-combat-cooperation.md`                                      | 🔴 | L      | ~~npc-029~~, npc-032, ~~items-player-027~~, ~~npc-025~~                                                                                                                                                                                                                                    | companions                              |
| `npc-034-expedition-shared-work-and-activities.md`                             | 🔴 | M      | ~~npc-029~~, npc-032, items-player-028                                                                                                                                                                                                                                                     | companions                              |
| `npc-035-shared-expedition-relationship-consequences.md`                       | 🔴 | L      | ~~npc-029~~, npc-032, npc-033, npc-034                                                                                                                                                                                                                                                     | companions                              |
| `npc-038-work-contract-actor-capability-gating.md`                             | 🔴 | M      | -                                                                                                                                                                                                                                                                                          | -                                       |
| `tools-000-weapon-browser-observatory.md`                                      | 🟡 | M      | -                                                                                                                                                                                                                                                                                          | -                                       |
| `tools-006--world-observatory.md`                                              | ⚪ | XL     | -                                                                                                                                                                                                                                                                                          | -                                       |
| `tools-007--mpfb2-npc-hero-character-pipeline.md`                              | 🔴 | L      | -                                                                                                                                                                                                                                                                                          | -                                       |
| `world-terrain-009-seasonal-ground-and-grass-appearance.md`                    | ⚪ | M      | -                                                                                                                                                                                                                                                                                          | -                                       |
| `world-terrain-015-water-reflection-content-budget.md`                         | ⚪ | S      | -                                                                                                                                                                                                                                                                                          | -                                       |

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

| File                                                                           | Pri | Effort | Depends                                                                                                                                                                                                                                                                                    | Roadmap                                 |
| ------------------------------------------------------------------------------ | --- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| 💡 `items-player-028-npc-player-storage-access-policies.md`                    | 🔴 | M      | ~~items-player-027~~                                                                                                                                                                                                                                                                       | companions                              |
| 💡 `items-player-032-npc-player-storage-resource-and-context-rules.md`         | 🟡 | L      | items-player-028                                                                                                                                                                                                                                                                           | companions                              |
| 💡 `items-player-014-rope-pullable-resource-transport.md`                      | 🟡 | M      | ~~155~~, ~~122~~                                                                                                                                                                                                                                                                           | physical-resource-storage-and-logistics |
| 💡 `settlements-npcs-022-household-help-and-age-based-work-participation.md`   | 🔴 | M      | ~~settlements-npcs-002~~                                                                                                                                                                                                                                                                   | npc-professions-households-and-age      |
| 💡 `npc-037-stale-work-contract-target-discovery-and-notice-cleanup.md`        | 🔴 | M      | ~~npc-018~~, ~~npc-028~~                                                                                                                                                                                                                                                                   | -                                       |
| 💡 `quests-progression-040-lost-treasure-chronicles-dark-forest-estate-alpha-bear-and-treasure-map.md` | 🔴 | L      | ~~quests-progression-039~~, ~~quests-progression-009~~, ~~quests-progression-036~~, ~~fauna-022~~                                                                                                                                                                                          | quests-lost-something-chronicles        |
| 💡 `quests-progression-041-lost-treasure-chronicles-dungeon-binding-and-persistent-collapsed-access.md` | 🔴 | L      | quests-progression-040, ~~quests-progression-026~~, ~~quests-progression-027~~, ~~world-024~~                                                                                                                                                                                              | quests-lost-something-chronicles        |
| 💡 `quests-progression-042-lost-treasure-chronicles-expedition-remains-journal-and-missing-key-trail.md` | 🔴 | L      | quests-progression-041, ~~quests-progression-027~~, ~~quests-progression-026~~, ~~world-024~~                                                                                                                                                                                              | quests-lost-something-chronicles        |
| 💡 `quests-progression-043-lost-treasure-chronicles-survivor-site-missing-key-and-final-dungeon-access.md` | 🔴 | L      | quests-progression-042, quests-progression-041, ~~world-024~~                                                                                                                                                                                                                              | quests-lost-something-chronicles        |
| ◼️ `quests-progression-044-lost-treasure-chronicles-final-treasure-claims-and-resolution.md` | 🔴 | L      | quests-progression-043, quests-progression-042, ~~quests-progression-027~~                                                                                                                                                                                                                 | quests-lost-something-chronicles        |
| ◼️ `quests-progression-045-lost-treasure-chronicles-property-grant-deed-and-persistent-land-reward.md` | 🔴 | L      | quests-progression-044                                                                                                                                                                                                                                                                     | quests-lost-something-chronicles        |
| ◼️ `quests-progression-046-lost-treasure-chronicles-integration-legacy-catch-up-and-superseded-quest-cleanup.md` | 🔴 | L      | quests-progression-045, quests-progression-044, quests-progression-043, quests-progression-042, quests-progression-041, quests-progression-040, ~~quests-progression-039~~, ~~quests-progression-038~~, ~~quests-progression-037~~, ~~quests-progression-027~~, ~~quests-progression-009~~ | quests-lost-something-chronicles        |
| 💡 `settlements-npcs-038-travelling-merchant-inter-settlement-role.md`         | 🔴 | L      | ~~settlements-npcs-037~~, ~~settlements-npcs-028~~, ~~settlements-npcs-033~~                                                                                                                                                                                                               | physical-goods-transport                |
| 💡 `settlements-003-colony-bootstrap.md`                                       | 🔴 | L      | ~~world-019~~, ~~settlements-npcs-028~~                                                                                                                                                                                                                                                    | quests-abandoned-gold-mine-colony       |
| ◼️ `quests-progression-010-abandoned-gold-mine-colony.md`                      | 🔴 | M      | ~~world-terrain-017~~, ~~world-018~~, ~~world-019~~, ~~settlements-npcs-026~~, ~~settlements-npcs-027~~, ~~settlements-npcs-028~~, settlements-003, settlements-004, ~~quests-progression-002~~                                                                                            | quests-abandoned-gold-mine-colony       |
| 💡 `settlements-004-gold-economic-realization-and-source-entitlements.md`      | 🔴 | M      | ~~world-018~~                                                                                                                                                                                                                                                                              | quests-abandoned-gold-mine-colony       |
| ◼️ `quests-progression-049-hunters-brotherhood-hunting-ground-investigation.md` | 🟡 | M      | ~~quests-progression-048~~, ~~fauna-031~~                                                                                                                                                                                                                                                  | quests-hunters-brotherhood              |
| ◼️ `quests-progression-053-hunters-brotherhood-competing-hunting-strategies.md` | 🟡 | L      | quests-progression-049                                                                                                                                                                                                                                                                     | quests-hunters-brotherhood              |
| ◼️ `quests-progression-054-hunters-brotherhood-exceptional-animal-finale.md`   | 🟡 | L      | quests-progression-053                                                                                                                                                                                                                                                                     | quests-hunters-brotherhood              |
| ◼️ `tools-005-seedvale-character-preparation-panel.md`                         | 🔴 | M      | -                                                                                                                                                                                                                                                                                          | -                                       |
| ◼️ `tools-015-chatterbox-local-voice-generation-pipeline.md`                   | 🔴 | M      | ~~npc-041~~, ~~npc-042~~                                                                                                                                                                                                                                                                   | -                                       |
| 💡 `fauna-034-wildlife-day-night-rest-and-den-defense.md`                      | 🟡 | M      | ~~fauna-028~~                                                                                                                                                                                                                                                                              | -                                       |
| 💡 `items-player-044-shoulder-and-forearm-equipment-slots.md`                  | 🟡 | M      | ~~items-player-039~~                                                                                                                                                                                                                                                                       | -                                       |
| 💡 `npc-046-settlement-threat-response-and-livestock-safety.md`                | 🔴 | M      | -                                                                                                                                                                                                                                                                                          | -                                       |
| 💡 `quests-progression-056-dungeon-bandit-story-item-integrity-and-recovery.md` | 🔴 | M      | ~~quests-progression-026~~, ~~quests-progression-035~~                                                                                                                                                                                                                                     | -                                       |
| 💡 `fauna-037-domestic-livestock-safe-flee.md`                                 | 🔴 | M      | -                                                                                                                                                                                                                                                                                          | -                                       |
| 💡 `npc-047-shepherd-livestock-threat-response.md`                             | 🔴 | M      | npc-046, fauna-037                                                                                                                                                                                                                                                                         | -                                       |
| 💡 `npc-048-local-threat-assistance-and-guard-response.md`                     | 🔴 | M      | npc-046, npc-047                                                                                                                                                                                                                                                                           | -                                       |
| 💡 `settlements-019-settlement-render-submission-budget.md`                    | 🔴 | M      | -                                                                                                                                                                                                                                                                                          | -                                       |
| 💡 `world-terrain-038-shadow-caster-content-budget-v2.md`                      | 🔴 | M      | -                                                                                                                                                                                                                                                                                          | -                                       |
| 💡 `world-terrain-039-n8ao-post-process-cost-budget.md`                        | 🔴 | M      | -                                                                                                                                                                                                                                                                                          | -                                       |
| 💡 `world-terrain-040-vegetation-render-budget-v2.md`                          | 🔴 | M      | -                                                                                                                                                                                                                                                                                          | -                                       |
| ◼️ `world-terrain-041-agent-presentation-render-lod.md`                        | 🔴 | L      | -                                                                                                                                                                                                                                                                                          | -                                       |
| ◼️ `quests-progression-057-injured-cow-medicine-alternative.md`                | 🟡 | M      | ~~quests-progression-016~~, ~~items-player-046~~, ~~npc-025~~                                                                                                                                                                                                                              | -                                       |
| ◼️ `quests-progression-058-injured-dog-discovery-thread.md`                    | 🟡 | M      | quests-progression-057, ~~items-player-046~~, ~~fauna-011~~                                                                                                                                                                                                                                | -                                       |

---

## Verification needed

Implementation is complete; only meaningful browser/manual verification remains.

## Do sprawdzenia

| Plan | Sprawdź |
|------|---------|
| `fauna-038-calm-settlement-wander-gait.md` | Koń luzem przy gospodarstwie chodzi wyraźnie spokojniej (bez slow-motion / foot sliding); prowadzony lub zagrożony nadal normalnie; po dosiadzie walk wyraźnie szybszy od calm wander; sprint/run pod siodłem bez zmian |
| `fauna-036-interruptible-carcass-feeding.md` | Predator reaches a deer carcass and feeds >5 s (≈8) before consume; ordinary food/drink timings unchanged; approach so intent is `flee` → feed stops, carcass harvestable/claimable, reclaim starts from zero; `ignore` does not cancel mid-feed; `attack` cancels through normal transition |
| `items-player-046-medicine-targeted-treatment-interaction.md` | Medicine visible on Skills Screen; self-treat injured player; treat injured NPC/livestock; bare-hands stops at 045 floor; suitable material exceeds floor; weak material fails on heavy injury; cancel consumes nothing; Medicine XP only on real effect; Traps/Repair/Sneak unchanged |
| `fauna-035-dismount-follow-stay-anchor-semantics.md` | Własny koń na Stay w A → jazda do B → zejście → Stay przy B (nie wraca do A); Follow po zejściu dalej idzie za graczem; fall nie zmienia anchora; save/load po Stay dismount zachowuje nowy anchor |
| `npc-045-campfire-spoken-conversation-pairs.md` | Opposite-gender NPCs at a lit campfire: pair → question then delayed answer, positional at speaker; same-gender still converses (may be silent); interrupt before answer → no stale answer; social/relationship behaviour unchanged aside from audio |
| `quests-progression-037-lost-treasure-chronicles-elder-trust-foundation.md` | W pobliskiej osadzie SM/MD jest Kazimierz Nowak (~74 lat) jako zwykły mieszkaniec; home i outpost bez niego. Quest zima: gałęzie albo rozmowa z sąsiadem dają różne endingi; spór odblokowuje się po obu. W sporze obie strony wiarygodne; poparcie starszego vs zgoda zmienia relacje inaczej; `trusted` nie spada za darmo z samych tych dwóch questów. Save/load bez duplikatu NPC i bez ponownego zastosowania konsekwencji |
| `quests-progression-039-lost-treasure-chronicles-chronicle-deciphering-and-specialist.md` | Po 038 z kroniką w ekwipunku Konstanty kieruje do Stanisława (inna osada albo ta sama, bez wymuszania trzeciej); jawny wybór: 35 monet do `personalInventory` albo glosariusz ze skrzyni na skraju osady; odczytanie odsłania obszar majątku (kółko na mapie), nie dwór; zapłata bez reputacji, przysługa +2 relacji i małe benevolence; save/load bez ponownej opłaty ani drugiej kroniki |
| `quests-progression-026-dungeon-bandit-treasure.md` | Guard/hunter giver oferuje loch; deep stash ma rejestr + oznaczony łup; side cache opcjonalne i nie blokują; `finalTreasure` nietknięty; return/guard/keep działają fizycznie (guard zabiera oba itemy); fauna nie jest wymagana; save/rebuild bez respawnu story items |
| `quests-progression-027-lost-treasure-expedition.md` | Sponsor (trader/miner) oferuje loch; kolejne skrzynie (obóz → tobół z dziennikiem → dowody → prawdziwy skarb) w narastającej głębi; `finalTreasure` nietknięty przez quest 026 gdy współdzielą loch; dziennik trafia fizycznie do rodziny/sponsora albo zostaje przy graczu; brak drugiego interesariusza redukuje wybór do sponsor/keep; skarb zawsze zostaje przy graczu; fauna nie jest wymagana; save/rebuild bez respawnu dziennika |
| `quests-progression-031-per-source-opportunity-defs.md` | Kilka zwierząt w gospodarstwie: każde ma stabilny `world:lost-livestock:…` def, ale Quest Log / oferta tylko dla zwierzęcia z aktywnym `lost-alive`/`corpse-uninspected`; naturalny stray mid-session na spokojnym wcześniej zwierzęciu → opportunity bez reloadu; generated nigdy nie woła `startLivestockStray`; authored `zagubiona-owca` i generated nie pokazują dwóch questów dla tego samego zwierzęcia; save z aktywnym `world:lost-livestock:…` odbudowuje ten sam def; limit RPG matrices bez regresji |
| `quests-progression-030-external-resolution-and-real-problem-offering.md` | Wilcza jama: zniszczenie przez gracza → `den_destroyed` / ready_to_report; aktywny quest, den znika bez destroy → `resolved_without_player` bez item reward; offer niezaakceptowany + source gone → `not_offered`. Authored `zagubiona-owca`: accept startuje realny stray (lub reuse istniejącego); generated lost-livestock dla spokojnej owcy nie oferuje i nie teleportuje; naturalny stray → offerable; naturalny `returned` → `live_return` |
| `quests-progression-033-quest-offer-selection-prioritization-and-abandonment.md` | NPC z wieloma questami nie oferuje wszystkiego naraz (tylko 1 normalna nowa oferta); po ukończeniu/decline/abandon pojawia się kolejna sensowna oferta; declined quest nie wraca od razu (suppression); opcjonalna kara relation/reputation przy abandon działa tylko tam, gdzie zdefiniowana; story quest (np. jaskinia niedźwiedzia, zaginiony myśliwy, podejrzany transport, stare kości, skrytka bandytów) respektuje authored wyjątki i nie pokazuje generic decline/abandon; nagły problem świata może przebić normalną ofertę (urgent), ale nie tworzy lawiny urgentów; problem świata trwa dalej po decline/abandon |
| `quests-progression-035-story-item-inventory-and-cave-location-clarity.md` | Mapa skarbu: `Odczytaj` na liście ekwipunku; filtry `Fabularne`/`Inne`; quest jaskini natural/adventure/dungeon podaje archetyp + kierunek (i nazwę tylko przy guard/hunter/miner/trader); `skalna grota` dla authored `rockDen`; kierunek zgadza się z realnym położeniem |
| `quests-progression-025-adventure-cave-old-bones.md` | Osobna adventure cave z profilem `EMPTY` (nie 008/`DOUBLE_TREASURE`); cache ze szczątkami + `signet_ring` istnieje przed przyjęciem; łańcuch giver → claimant A → loot → opcjonalnie B → `return_to_first_claimant` / `give_to_second_claimant` / `keep_signet`; exact-instance hand-in; rebuild/save bez respawnu sygnetu |
| `quests-progression-026-dungeon-bandit-treasure.md` | Dungeon deep `loot` + opcjonalne `sideTreasure` (bez `finalTreasure`); cache z `bandit_ledger`/`marked_valuable` przed przyjęciem; return / give_evidence_to_guard / keep; exact-instance hand-in; rebuild/save bez respawnu |
| `settlements-npcs-027-npc-expedition-assignment-and-provisioning.md` | Brak UI: `formExpeditionAssignment` / `provisionExpeditionAssignment` / `markExpeditionAssignmentReady` na `WorldBundle`; save v45 `expeditionAssignments`; testy jednostkowe już pokrywają resolver/provisioning |
| `tools-013-npc-decision-verification-and-scenario-tooling.md` | `npc(id).decisions()` pokazuje cykle need→strategy→action; `animalThreat.response` ma defend/flee scores; `contract.evaluated` ma breakdown; `settlement(id).decisions()` po `setFrenzyWolves(n)` — sensed/responded/combat/flee/death per NPC; inspector sekcje cycles/threat/contract; brak zmiany gameplayu |
| `settlements-npcs-017-production-demand-and-economic-pressures.md` | Start z iron+coal: kowal robi pręty; wyczerp input → jeden persistent shortage (nie per kowal); presja w inspect bez nowego AI; przywróć input → shortage znika, produkcja wraca; hunter household A/B niezależne; save/load zachowuje tylko nadal zablokowany shortage |
| `settlements-npcs-006-wool-to-material.md` | Textile Worker bez WorkContract; przy ≥4 wełny w `Household.items` konsumuje dokładnie 4 wool i tworzy 12 `wool_material`; 0–3 wełny blokuje bez outputu; przerwanie nie zużywa wełny; produkcja nie bierze wełny z innego gospodarstwa/magazynu |
| `world-024-systemic-treasure-sites-and-keys.md` | Locked chest without the matching key; key is a meaningful distance from its chest; abandoned pickup and buried shovel path; cemetery grave key (if generated) still applies grave-robbing reputation; correct key opens the normal chest UI, another `key` instance does not; save/reload before and after taking/moving a key, and after unlocking/looting; streamed/reloaded looted chests stay empty and unlocked; no cave treasure yet |
| `npc-016-work-contracts-payment-and-employer-interaction.md` | Najemnik po skończonej pracy podchodzi tylko gdy gracz jest w pobliżu; dialog otwiera Zapłać N / Jeszcze nie; monety schodzą z gracza do `personalInventory` NPC; za mało monet / pełny ekwipunek NPC nic nie rusza; powtórne Zapłać nic nie robi; śmierć najemnika nie obciąża gracza; save/load zachowuje należność i już wypłacone monety |
| `npc-010-death-and-corpse-lifecycle.md` | Śmierć NPC: corpse zostaje w miejscu śmierci (nie w domu), loot loadoutu, decay w czasie, save/load bez duplikacji itemów, legacy martwy NPC bez sfabrykowanego corpse |
| `npc-011-npc-burial-and-graves.md` | Członek household po śmierci kogoś z rodziny może dostać burial pressure, odebrać claim, dojść do corpse, wykonać pochówek i zostawić persistent grave + terminal corpse; brak fake NeedId; brak duplikacji grave po reload/rebuild; legacy dead bez corpse nie dostaje grave |
| `npc-026-npc-grave-visits.md` | Żyjący członek rodziny okazjonalnie odwiedza persistent grave zmarłego; wizyta przegrywa z potrzebami/pogodą/snem, wygrywa z idle; cooldown per zmarły przeżywa save/load; brak fake NeedId i nearest-cemetery fallback |
| `npc-012-weather-reaction-and-shelter.md` | Naturalność reakcji NPC na złą pogodę i powrotu do rutyny |
| `npc-015-work-contracts-npc-work-and-construction.md` | Pełny przebieg kontraktu NPC w świecie, w tym przerwanie przez potrzeby i wznowienie |
| `npc-017-work-contracts-food-and-drink.md` | Długi/zdalny kontrakt: ograniczone zaopatrzenie do `personalInventory`, jedzenie/picie z własnych zapasów w trakcie podróży/pracy, przerwanie głodem/pragnieniem bez `releaseWorkContract()`, wyczerpanie zapasów bez magicznego refillu, save/reconstruction zachowuje `personalInventory` |
| `fauna-012-animal-threat-perception-and-vocalization-responses.md` | Wycie wilka i alert bark psa realnie zwiększają flee u pobliskiego prey/livestock poza spatial `fleeRange` (bez paniki na odległe/nieaktualne zdarzenia); kilka psów nie tworzy kaskady szczekania; brak zauważalnego regresu frame time przy większej liczbie zwierząt |
| `npc-002-npc-healing.md` | NPC ranny w walce (`?debug=1&debugNpcCombat=1` do zadania obrażeń) leczy się dopiero po zakończeniu walki: idzie do domu, zużywa catalogowy `injuryTreatment` (`bandage`; `herb` sam nie wystarcza po npc-025), HP rośnie, po czym wraca do normalnej autonomii; bez odpowiedniego treatmentu nie ma healing candidate |
| `npc-025-injury-severity-and-treatment-requirements.md` | `?debug=1`: `injury.applyNpcInjury(id, 'minor'|'serious'|'critical')` pokazuje derived severity i SPEA; minor regeneruje się naturalnie z HP; serious wolniej i mocniej idzie się leczyć; `bandage` leczy uraz, `herb` nie; critical nie schodzi naturalnie do serious; `giveNpcBandage` + leczenie stabilizuje critical; brak leczenia nie zapętla heal; combat nie jest przerywany; save/streaming zachowuje `physicalInjury` |
| `items-player-021-player-skills-and-targeted-skill-actions-foundation.md` | Skills: Medycyna i Naprawa widoczne; wybór Pułapki wchodzi w targeting; [E] na istniejącej pułapce otwiera Sprawdź z żywym stanem/wytrzymałością/przynętą; Esc anuluje targeting bez mutacji świata; bez wybranego skilla arm/disarm/collect działają jak wcześniej |
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
- fauna: `039`
- items-player: `047`
- npc: `049`
- persistence: `006`
- quests-progression: `059`
- settlements: `020`
- settlements-npcs: `043`
- tools: `017`
- ui-input: `025`
- world: `031`
- world-terrain: `042`

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
