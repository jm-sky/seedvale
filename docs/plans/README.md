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
| `npc-038-work-contract-actor-capability-gating.md`                             | -       | 🔴 | M      | -      |
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
| 💡 `fauna-023-systemic-animal-attraction-food-blood-and-trap-lures.md`         | -       | 🟡 | M      | fauna-014, ~~world-009~~, items-player-025 |
| 💡 `quests-progression-019-dangerous-animal-deeds-local-reputation.md`         | -       | 🟡 | M      | ~~quests-progression-001~~, ~~quests-progression-002~~, fauna-022 |
| 💡 `npc-030-paid-expedition-escort-work-contracts.md`                          | -       | 🔴 | L      | npc-029 |
| 💡 `npc-031-voluntary-expedition-joining.md`                                   | -       | 🔴 | M      | npc-029 |
| 💡 `items-player-028-npc-player-storage-access-policies.md`                    | -       | 🔴 | L      | items-player-027 |
| 💡 `items-player-014-rope-pullable-resource-transport.md`                      | -       | 🟡 | M      | ~~155~~ ~~122~~ |
| 💡 `quests-progression-008-treasure-map-bear-cave.md`                          | -       | 🟡 | M      | ~~world-terrain-019~~, ~~fauna-018~~, ~~fauna-019~~, ~~quests-progression-002~~, ~~quests-progression-011~~ |
| 💡 `settlements-npcs-016-first-processing-chain-and-blacksmith-production.md`  | -       | 🔴 | M      | ~~settlements-npcs-015~~ |
| 💡 `settlements-npcs-017-production-demand-and-economic-pressures.md`          | -       | 🔴 | M      | settlements-npcs-016 |
| 💡 `settlements-npcs-022-household-help-and-age-based-work-participation.md`   | -       | 🔴 | M      | ~~settlements-npcs-002~~ |
| 💡 `npc-027-spatial-context-and-cave-traversal.md`                             | -       | 🔴 | L      | ~~world-terrain-019~~, ~~npc-006~~, ~~npc-007~~ |
| 💡 `world-terrain-017-abandoned-mountain-mine-landmark.md`                     | -       | 🔴 | M      | ~~world-terrain-019~~ |
| 💡 `world-018-cave-aware-rich-finite-resource-deposits.md`                     | -       | 🔴 | M      | ~~world-terrain-019~~, world-terrain-017 |
| ◼️ `world-023-species-driven-sowing-density-and-yield.md`                      | -       | 🔴 | M      | ~~settlements-npcs-030~~ |
| ◼️ `settlements-npcs-031-sustainable-seed-recovery-and-replanting.md`          | -       | 🔴 | L      | settlements-npcs-030, world-023 |
| 💡 `npc-037-stale-work-contract-target-discovery-and-notice-cleanup.md`        | -       | 🔴 | M      | ~~npc-018~~, ~~npc-028~~ |
| 💡 `settlements-npcs-025-resource-storage-visualization.md`                    | -       | 🟡 | M      | ~~settlements-npcs-009~~, ~~settlements-npcs-010~~ |
| ◼️ `tools-005-seedvale-character-preparation-panel.md`                         | -       | 🔴 | M      | -      |
| 💡 `tools-013-npc-decision-verification-and-scenario-tooling.md`               | -       | 🔴 | M      | -      |

---

## Verification needed

Implementation is complete; only meaningful browser/manual verification remains.

## Do sprawdzenia

| Plan | Sprawdź |
|------|---------|
| `items-player-029-wearable-armor-and-combat-equipment.md` | Kupiec sprzedaje `leather_armor`/`chainmail`; „Załóż”/„Zdejmij” w ekwipunku pokazuje ochronę/wysiłek/tempo/ruch; noszona zbroja zauważalnie zmniejsza obrażenia od zwierząt (kolczuga wyraźnie bardziej niż skóra), ale aktywny blok trzymanym przedmiotem nadal działa; kolczuga wyraźnie spowalnia i męczy (atak/sprint/ruch) mocniej niż skórzana; sprzedanie/upuszczenie założonej zbroi natychmiast usuwa efekt bez ducha bonusu; głód/pragnienie nie są łagodzone przez zbroję; save/load zachowuje założony przedmiot (i poprawnie ładuje pusty slot przy starym zapisie); waga zbroi nadal liczy się do przeciążenia ekwipunku |
| `fauna-025-livestock-stray-return-and-recovery.md` | Wywołać flee household livestock i potwierdzić, że małe oddalenie nie tworzy stray; doprowadzić do większego displacement i obserwować naturalne rozpoczęcie stray episode (bez questa); nie pomagać zwierzęciu i sprawdzić, że po uspokojeniu samo próbuje wrócić do home; podczas powrotu wywołać threat/scare i sprawdzić przerwanie oraz późniejszą ponowną próbę (bez teleportu, bez utraty stray); aktywować lost-livestock quest, nie prowadzić zwierzęcia i pozwolić mu wrócić samemu — quest ma rozwiązać się z realnego `returned` state; save/load podczas stray i podczas drogi powrotnej zachowuje pozycję/ownera i pozwala wznowić powrót |
| `world-026-storms-thunder-animal-scare-and-snow-visuals.md` | Wymuś snow: płatki bez kwadratowych rogów z różnych odległości. Wymuś storm: mocny deszcz/wiatr, flash → opóźniony thunder, warianty thunder bez spamu jednego eventu. Stado livestock: nie każdy grzmot i nie każde zwierzę flees; bliżej domu/opiekuna spokojniejsze. Burza nie tworzy questa ani stray. Cave/interior ścisza deszcz/thunder |
| `settlements-007-systemic-settlement-structure-condition-and-shared-repair.md` | `structure.damageHouse(settlementId, familyIndex, amount)` (`?debug=1`) uszkadza dom osady; `[R]` na domu otwiera dialog naprawy dopiero poniżej progu albo gdy naprawa jest aktywna; quote pokazuje materiały/czas i blokuje start bez wystarczających materiałów; start atomowo zużywa materiały z gracza (Inventory + pobliskie dropped items), nigdy dwukrotnie przy wznowieniu; gracz i NPC (naprawiający własny dom z household items) mogą kontynuować ten sam epizod; stream-out/in osady i pełny rebuild `WorldBundle` zachowują condition/progress; save/load w trakcie naprawy zachowuje stan; starszy save bez `structureStates` odtwarza pristine; naprawa nie jest critical interrupt — pragnienie/głód/pogoda/heal nadal wygrywają |
| `settlements-npcs-006-wool-to-material.md` | Textile Worker bez WorkContract; przy ≥4 wełny w `Household.items` konsumuje dokładnie 4 wool i tworzy 12 `wool_material`; 0–3 wełny blokuje bez outputu; przerwanie nie zużywa wełny; produkcja nie bierze wełny z innego gospodarstwa/magazynu |
| `settlements-npcs-015-economic-production-and-input-integration.md` | Hunter z gałęzią/belką w gospodarstwie craftuje strzały przy `work` (gałąź przed belką, 1→1 / 1→8); brak materiału nie zużywa nic; drwal nadal dodaje drewno osady przy depozycie; mixed/stock recipes nie mintują częściowego wyniku |
| `settlements-npcs-023-profession-staffing-and-settlement-composition.md` | Home: Anna/Piotr/Kasia/Marek nadal istnieją, w tej samej kolejności, i oferują authored questy; mała ogród/las osada ma food livelihood bez Tradera/Kowala; osada przy significant ore ma Minera wewnątrz istniejącej liczby domów (bez extra resource family); OUTPOST nadal 1 NPC z forced resource role |
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
- npc: `039`
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
