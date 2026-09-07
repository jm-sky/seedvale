# Implementation Notes: quests-progression-002 — Quest Outcomes, Rewards & Consequences

## Rozstrzygnięcia z review

- `QuestManager` (`src/quests/QuestManager.ts`) pozostaje app-level ownerem quest runtime: `defs`, `states`, `relations`, `animalTargets`, dirty flag i lifecycle. Jest tworzony w `src/app/createApp.ts`, żyje poza `WorldBundle`, przeżywa same-session rebuild i jest resetowany przez `QuestManager.reset()` przy New Game. Nie przenosić quest state do `WorldBundle`, UI ani persistence DTO.
- `QuestDef`/`QuestStage`/`QuestObjective`/`QuestState` są dziś w `src/quests/quests.ts`; tam dodać `QuestOutcomeId`, `QuestOutcome`, `QuestReward`, `QuestConsequences`, `title`, `description`, `outcomes`. Nie tworzyć osobnego pliku/modelu dla „simple quest”.
- Runtime state jest dziś `Map<string, { state, stageIndex }>`; zastąpić wartość wspólnym typem zawierającym `resolvedOutcomeId?: QuestOutcomeId`. `QuestProgressEntry` w `QuestManager.ts` i `src/persistence/saveData.ts` nie mogą pozostać dwoma ręcznie rozjeżdżającymi się shape'ami — po zmianie użyć jednego eksportowanego kontraktu quest progress po stronie domeny albo jawnego save DTO mapowanego w jednym miejscu.
- `invalidated` nie jest outcome. Zachować obecny restore/rebuild path w konstruktorze `QuestManager` i `invalidateStaleAnimalTargets()`; tylko `complete`/`failed` są normalnymi terminal states wybieranymi przez outcome.

## Obecny completion / failure path

- Jedyny pełny successful terminal path to prywatne `QuestManager.completeQuest(def)`: ustawia `complete`, czyści `animalTargets`, nalicza implicit relation + EXP, odtwarza completion sound, wywołuje injected `grantItem`, a następnie `applySocialConsequence` dla `settlementId + socialConsequence`.
- `handleGiverInteract()` woła `completeQuest()` w dwóch miejscach: po oddaniu ostatniego `gather_item` oraz z `ready_to_report` przy rozmowie z giverem.
- `advanceStage()` tylko kończy objective/stage i ustawia `ready_to_report`; dla world interactions `onInteractObjective()` nie kończy successful questa bezpośrednio.
- Failure path jest osobny: `failQuest(def, stageIndex)` ustawia `failed`, czyści bound animal i nie daje reward/consequences. Dziś wywołuje go tylko `onInteractObjective()` dla śmierci bound `find_animal` targetu.
- Docelowo oba terminal paths mają przejść przez jeden prywatny `resolveQuest(def, outcomeId)` (publiczne API nie jest potrzebne dla obecnych call sites). Funkcja ma: odrzucić nieistniejący outcome / już-terminalny quest, ustawić `state` z outcome, zapisać `resolvedOutcomeId`, wyczyścić binding, zastosować reward i consequences dokładnie raz. `invalidated` nadal ustawiać bez `resolveQuest()`.
- Nie wiązać automatycznie „ostatni objective” z konkretnym outcome w `advanceStage()`. Obecny liniowy flow może dalej dojść do `ready_to_report`; `handleGiverInteract()` wybiera authored successful outcome. Failure event (`find_animal` death) wybiera authored failed outcome. To zachowuje rozdział objective completion vs resolution bez dialogue-choice engine.

## Reward i inventory — reuse bez zmian ownership

- Obecny injected `QuestItemGrant` z `QuestManager` jest podpięty w `src/app/createApp.ts` do lokalnego `grantItem(kind, count)`.
- `grantItem()` mintuje `createAcquiredInstance(kind)` dla instance-backed kinds, używa `Inventory.addInstance()` / `Inventory.add()`, a overflow odkłada przez `bundle.droppedItems.drop(...)` przy graczu z zachowaniem `SaveItemInstance`. To jest obowiązkowy reward dispatch path także dla każdego elementu `QuestReward.items`; nie używać `inventory.add()` bezpośrednio w questach.
- Coins pozostają `ItemKind = 'coin'`; brak osobnego walletu.
- Zachować obecny special-case `long_sword`/`worldFlags.guardSwordGifted` w callbacku `QuestManager` w `createApp.ts`, ale po migracji `woda-dla-marka` nie może już go triggerować. Nie przenosić tego guarda do `QuestReward`.
- Multiple rewards: `resolveQuest()` iteruje `reward.items` i woła injected grant callback per `{ kind, count }`; callback odpowiada za capacity/overflow/HUD inventory sync.

## Relation i social consequences

- `QuestManager.relations` nadal jest authoritative player↔NPC relation store; `getRelation()`, `getRelationLevel()`, `meetsAvailability()` i `getPlayerStanding()` zostają. Nie usuwać `getPlayerStanding()` w tym planie — po quests-progression-001 nadal konsumuje go NPC assistance przez `PlayerSocialState.standing`.
- Usunąć `QUEST_RELATION_REWARD`, `QuestEffects` i cały implicit fan-out giver + każdy `talk_to_npc` target. Relation zmieniać wyłącznie przez `QuestOutcome.consequences.relations` i istniejący `bumpRelation()` (może pozostać prywatnym primitive).
- Public social standing ma nadal osobnego ownera: `src/reputation/ReputationManager.ts`. Zachować injected `ApplySocialConsequence` w `QuestManager`; outcome `consequences.social` ma zostać zamienione na istniejący `SocialConsequence` przez dołączenie runtime `QuestDef.settlementId` i wywołanie tego callbacku. Nie importować `ReputationManager` do `QuestManager`.
- `src/app/createApp.ts` już dopina `settlementId` do `[...QUESTS, ...landmarkQuests]` z `bundle.settlementsManager.getHomeDef().id`; tego ownership nie zmieniać.
- Wartości z quests-progression-001 przenieść 1:1 do successful outcomes: `grozny-wilk` `{ competence:+10, courage:+12, benevolence:+4, renown:+15 }`; `wilcza-jama` `{ competence:+15, courage:+18, benevolence:+6, renown:+25 }`.

## EXP — dokładny blast radius

Usunąć `QuestManager.exp`, `QUEST_EXP_REWARD`, `getExp()`, `QuestManagerInitial.exp` i `QuestEffects.exp`. Zweryfikowane runtime/UI call sites do migracji:

- `src/app/saveState.ts` — `buildSaveData()` emituje `quests.exp`.
- `src/app/createApp.ts` — initial `hud.setExp(...)`, reset/new-game sync oraz `QuestManager` restore przez `initialSave?.quests`.
- `src/app/gameLoop.ts` — per-frame `hud.setExp(questManager.getExp())`; usunąć cały call, nie zastępować innym progression readoutem.
- `src/ui/createHud.ts` — facade `setExp` → Vue `setHudExp`.
- `src/ui/createQuestLog.ts` — `open/refresh` przyjmują `exp`.
- `src/ui-vue/store.ts` — `questLog.exp`, `openQuestLog(..., exp, ...)`, `refreshQuestLog(..., exp, ...)`.
- `src/ui-vue/screens/QuestLogScreen.vue` — `Exp: {{ ui.questLog.exp }}`.
- `src/quests/QuestManager.test.ts` oraz persistence fixtures oczekujące `exp`.

Nie usuwać player skill XP (`src/player/PlayerSkills.ts`) — to niezależny system.

## Existing quest migration

Wszystkie definicje statyczne są w `QUESTS` (`src/quests/quests.ts`), a contextual landmark quests w `buildLandmarkQuests()` w tym samym pliku.

- `relay-anna-piotr`: jeden complete outcome; explicit relation do Anny **i Piotra po +1**, jeżeli celem jest zachowanie obecnego zachowania. To dziś jedyny sposób zachowania starego implicit fan-out bez pozostawiania implicit mechanizmu.
- `shells-dla-kasi`: jeden complete outcome; explicit `Kasia +1` zachowuje obecne zachowanie.
- `woda-dla-marka`: complete outcome; shown `5 x coin`; `Marek +1`; zmienić `reportLine`, bo obecnie tekst mówi o mieczu.
- `zwiadowca`: jeden complete outcome. Aktualny implicit completion daje `Piotr +1`; jeżeli zachowujemy istniejące semantics, zapisać to explicit zamiast zostawiać decyzję implementatorowi. Brak item reward.
- `zagubiona-owca`: **korekta planu** — aktualny kod nie zwraca owcy właścicielce i nie zmienia livestock ownership/pozycji. Successful outcome nazwać np. `found_and_reported` (complete, 10 coins, explicit `Anna +1` jeśli zachowujemy obecne relation); failed outcome `sheep_died` (failed, bez reward/consequences). Nie używać `returned_to_owner`, dopóki domena livestock faktycznie nie implementuje powrotu.
- `drewno-na-naprawe`: complete outcome; 15 coins; brak relation consequence zgodnie z nową decyzją planu (świadomy rebalans względem dzisiejszego implicit `Piotr +1`).
- `grozny-wilk`: complete outcome; zachować `damascus_long_sword`; przenieść `Anna +2` z `effects.relation` jawnie do relations oraz social consequence 1:1; EXP usunąć.
- `wilcza-jama`: complete outcome; zachować `obsidian_sword`; przenieść `Anna +3` jawnie + social consequence 1:1; EXP usunąć.
- `buildLandmarkQuests()`: `stare-ruiny` i `zapomniany-cmentarz` dziś dostają implicit giver +1; zapisać explicit +1, jeśli zachowujemy obecne semantics. `slad-przy-monolicie` ma dziś `effects: { relation: 2, exp: 15 }` — zachować explicit `Anna +2`, usunąć EXP.

## Persistence — obowiązkowa zmiana v6 → v7

- Aktualny `CURRENT_SAVE_VERSION = 6` w `src/persistence/saveData.ts`. Usunięcie `quests.exp` zmienia persisted representation, więc zgodnie z istniejącym kontraktem trzeba ustawić `CURRENT_SAVE_VERSION = 7` i dodać `migrateSaveV6ToV7` + wpis `6:` w `SAVE_MIGRATIONS`.
- `SaveQuests` ma docelowo `{ progress, relations }`; `QuestProgressEntry` dostaje `resolvedOutcomeId?: QuestOutcomeId`.
- `src/app/saveState.ts::buildSaveData()` emituje `questManager.exportProgress()` + `exportRelations()`, bez `exp`.
- Migracja v6→v7 powinna usunąć `quests.exp`, zachować `progress`/`relations` bez resetu. Nie importować `QUESTS`/world quest definitions do persistence tylko po to, by wymyślać outcome IDs.
- Deterministyczne legacy normalization wykonać w konstruktorze `QuestManager`: gdy restored entry jest `complete`/`failed` i nie ma `resolvedOutcomeId`, wybrać **jedyny** outcome w aktualnym `QuestDef` o takim samym terminal `state`; jeśli takich outcome jest 0 lub >1, nie zgadywać — taki def łamie backward-compat contract i test ma to wykryć. Po następnym zwykłym save `exportProgress()` zapisze już ID.
- Active/offered/not_offered/ready_to_report entries pozostają bez `resolvedOutcomeId`. `invalidated` również bez outcome.
- Obecny `isSaveData()` sprawdza `v.quests` tylko jako object, bez shape validation. Przy tej zmianie dodać `isSaveQuests()`/`isQuestProgressEntry()` zgodnie ze stylem pozostałych validatorów: poprawny `QuestState`, string `id`, nieujemny integer `stageIndex`, opcjonalny string `resolvedOutcomeId`, numeric relation values. Dodatkowe legacy `exp` po migracji nie musi być specjalnie odrzucane, ale nowy writer go nie emituje.
- Fixtures do aktualizacji są co najmniej w `src/persistence/saveData.test.ts`, `src/persistence/saveDb.test.ts`, `src/persistence/saveSlots.test.ts` (dziś wpisują `quests: { progress: [], exp: 0, relations: {} }`).

## Quest Log / DTO

- `QuestManager.list()` buduje `QuestListEntry`; rozszerzyć właśnie ten DTO o `title`, `description`, `resolvedOutcomeId`/`resultText` dla terminalnego wpisu oraz `promisedReward` jako presentation DTO albo `QuestReward` readonly. Nie każ Vue wyszukiwać `QuestDef` po id.
- `src/ui/createQuestLog.ts` pozostaje cienką fasadą; po EXP removal jego `open/refresh` przekazują tylko entries + relation lookup.
- `src/ui-vue/screens/QuestLogScreen.vue` obecnie kluczuje wiersz `giverName + state + stageIndex`; po dodaniu identity użyć stabilnego `entry.id`.
- Reward preview wyliczać po stronie `QuestManager.list()`: pokazać tylko gdy wszystkie complete outcomes, które mogą być finalnym successful resolution, mają identyczny `shown` reward; w przeciwnym razie `null`. Nie implementować possible-outcomes UI ani logiki wyboru po stronie Vue.
- Hidden reward nie tworzy placeholdera.

## Testy i guardrails

Rozszerzyć przede wszystkim `src/quests/QuestManager.test.ts` zamiast tworzyć równoległy harness. Istnieją tam już helpery `acceptOffer`, restore tests, failed lifecycle, stale animal binding i social consequence exact-once.

Dodać/zmienić testy dla:

- single complete outcome i co najmniej jeden def z complete + failed outcome (`zagubiona-owca` jest naturalnym realnym przypadkiem);
- `resolveQuest` exact-once: drugie resolution nie daje itemu/relation/social consequence i nie zmienia `resolvedOutcomeId`;
- wrong/unknown outcome id nie mutuje state;
- reward multiple items + coin + none; grant callback dostaje wszystkie pozycje dokładnie raz;
- relation tylko z authored `consequences.relations`, bez giver/target implicit fan-out;
- `grozny-wilk`/`wilcza-jama` exact existing social deltas;
- sheep death wybiera `sheep_died`; znalezienie + report wybiera `found_and_reported`;
- `invalidated` pozostaje bez outcome i nie aplikuje reward/consequences;
- restore legacy terminal entry bez ID normalizuje przez jedyny outcome o zgodnym state;
- restore przy 0 lub >1 pasujących legacy outcomes nie może arbitralnie wybrać jednego;
- `exportProgress()` round-tripuje `resolvedOutcomeId`;
- persistence v6→v7 usuwa EXP bez utraty quest progress/relations i pipeline nadal fail-closed;
- `QuestLogScreen.vue` nie pokazuje EXP; shown reward widoczny, hidden/ambiguous nie.

Pułapki:

- Nie wywoływać reward/consequences przy przejściu do `ready_to_report`; successful resolution nadal następuje dopiero w istniejącym turn-in path.
- `failQuest()` dziś zwraca stage `failLine`; po scaleniu do `resolveQuest` zachować presentation line w callerze albo zwracać `resultText/failLine` bez mieszania go z gameplay resolution.
- Completion sound jest presentation side effect obecnego successful turn-in. Odtwarzać tylko dla `state: 'complete'`, nie dla failed outcome.
- Nie ruszać `animalTargets` persistence — pozostaje runtime-only; zachować obecne livestock rebind / wild invalidation semantics.
- Nie uruchamiać `pnpm docs:sync` ręcznie.

## Korekty do planu wynikające z aktualnego kodu

1. Wszystkie przykłady/verification `returned_to_owner` dla `zagubiona-owca` traktować jako `found_and_reported`; obecny quest nie zwraca ani nie reassignuje owcy.
2. Persistence ma jawnie wymagać `CURRENT_SAVE_VERSION` **6 → 7** i `SAVE_MIGRATIONS[6]`; samo „tolerowanie starszego `quests.exp`” nie spełnia obowiązującego kontraktu schema-versioning.
3. Legacy `resolvedOutcomeId` normalizować w `QuestManager` przez jedyny outcome o zgodnym terminal state, nie przez quest-id mapping w `saveData.ts`.
4. `getPlayerStanding()` nie jest częścią starego EXP i pozostaje potrzebne dla NPC assistance; nie usuwać go przy cleanup quest progression.

> **Zrób git commit i push do main, rebase jeżeli trzeba**