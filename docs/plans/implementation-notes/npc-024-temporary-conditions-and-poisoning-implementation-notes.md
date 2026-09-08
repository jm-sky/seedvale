# Implementation Notes: npc-024 — Temporary conditions and poisoning

**Reviewed:** 2026-09-08  
**Source:** current `main` codebase + `docs/STATE.md` + `docs/plans/PLANNING.md` + `npc-024-temporary-conditions-and-poisoning.md` + current SPEA/NPC-state/water/item/persistence implementations

## Najważniejsza korekta względem planu

Plan zakłada gotową wspólną warstwę „effective SPEA”. Aktualny kod jej jeszcze nie ma.

`src/shared/PhysicalAttributes.ts` celowo przechowuje wyłącznie bazowe SPEA i wprost wyklucza injuries/illness/conditions. Aktualne efekty profilu są rozproszone między:

- `src/settlement/npcPhysicalProfile.ts` — `resolveHumanStrengthProfile()`, `resolveHumanAgilityProfile()`, `resolveHumanEnduranceProfile()`,
- `src/combat/meleeStrength.ts`, `src/combat/meleeAgility.ts`,
- `src/shared/enduranceStamina.ts`,
- `src/player/physicalWorkStrength.ts`, `src/player/humanCarryCapacity.ts`,
- player używa `PLAYER_STARTING_ATTRIBUTES` z `PlayerController.ts`.

Nie dodawaj condition logic do `PhysicalAttributes`. W ramach tego planu potrzebny jest mały wspólny seam **po resolution profilu, przed capability consumers**. Najczyściej: zbudować pełne resolved/effective `PhysicalAttributes` dla aktora, a następnie nałożyć shared temporary-condition modifiers. NPC powinien składać istniejące strength/agility/endurance profile resolvery w jedno miejsce; Player przepuszcza swoje bazowe wartości przez ten sam condition-modifier krok.

Nie wprowadzaj `if (poisoned)` w combat/work/stamina/carry. Call sites powinny czytać wartości z nowego wspólnego effective-attribute seamu.

## Condition ownership

Dodaj mały shared primitive, np. w `src/shared/temporaryConditions.ts`; nie `ConditionManager`.

V1 wystarczy model w rodzaju:

- bounded `ConditionKind = 'poisoning'`,
- jeden wpis na kind,
- `severity` w stałym zakresie,
- anchor czasu potrzebny do deterministycznej/lazy progresji.

Preferuj lazy elapsed-game-time resolution zamiast per-frame tickowania: stan powinien przechowywać `severity` + `lastUpdatedAtDays` (lub równoważny anchor), a każdy odczyt/mutacja robi `resolve/update(nowDays)`. To naturalnie obsłuży off-screen NPC, time skip i save/load bez globalnego skanu wszystkich NPC.

### NPC

`src/settlement/npcState.ts` jest autorytatywnym właścicielem trwałego stanu NPC. Dodaj conditions do:

- `NpcAuthoritativeState`,
- `NpcStateSnapshot`,
- `createNpcAuthoritativeState()`,
- `fromSnapshot()`,
- `NpcStateRegistry.serialize()`.

`NpcAgent` ma dostać referencję do tego samego mutable state — nie kopię i nie własny condition store.

Uwaga: komentarze w `npcState.ts` są częściowo historycznie nieaktualne, ale sam `NpcStateSnapshot` rzeczywiście trafia dziś do `SaveData.npcStates`; kieruj się aktualnym persistence flow, nie starymi komentarzami.

### Player

Player conditions powinny być częścią istniejącego player runtime state, nie `WorldBundle` i nie osobnego managera. Persistuj je przez istniejący `SaveData` / `buildSaveData()` / restore wiring obok innych player-owned persistent pools. Nie zapisuj effective SPEA.

## Poisoning progression

Ustal proste deterministyczne semantics i trzymaj je w shared primitive:

- exposure tworzy poisoning albo zwiększa istniejące severity,
- clamp severity,
- natural recovery zależy wyłącznie od elapsed game time,
- treatment redukuje severity / przesuwa recovery,
- zero severity usuwa wpis.

Nie zapisuj osobnego „remaining duration”, jeśli ten sam rezultat można wyprowadzić z severity + time anchor.

## Water integration

`src/world/WaterSource.ts` ma już właściwą granicę domenową:

- `quality: safe | unsafe | undrinkable`,
- `consumptionRisk` używane obecnie tylko przez uncovered player well.

`world-017` jest już wdrożony: `src/world/riverWaterQualityResolver.ts` zwraca finalne `WaterQuality` per river pickup point. Poisoning nie może importować hydrologii ani settlement proximity.

`src/app/actions/survivalActions.ts::drinkFromWaterSource()` jest obecnie jedynym bezpośrednim player drink mutation point. Aktualnie:

- `undrinkable` blokuje akcję,
- `unsafe` tylko pokazuje warning,
- `consumptionRisk` używa dwóch `Math.random()` i bezpośrednio zadaje HP/Vigor loss.

Dla npc-024 rozdziel te dwie rzeczy:

1. `quality === 'unsafe'` → shared poisoning exposure roll,
2. istniejący uncovered-well `consumptionRisk` pozostaje swoim osobnym legacy immediate-risk contractem, chyba że plan świadomie go migruje.

Nie utożsamiaj `WaterConsumptionRisk` z poisoning risk: obecny typ niesie HP/Vigor damage i semantycznie jest innym mechanizmem.

### Deterministyczny roll

Nie używaj render-frame state ani pozycji kamery. Boundary to **konkretna udana akcja drink**.

Jeżeli codebase nie ma gotowego wspólnego seeded-event helpera, dodaj mały lokalny pure helper oparty o jawny event key, np. `(worldSeed, actorId, consumptionSequence/eventNonce, source context)`. Klucz musi różnić kolejne drink events; samo `(seed, source position)` spowoduje identyczny wynik przy każdym piciu.

Nie zapisuj globalnego RNG. Jeśli potrzebny jest sequence counter dla Playera, musi być authoritative/persisted albo wynikać z już trwałego game-time/event context tak, żeby save/load nie pozwalał rerollować tego samego zdarzenia.

## Treatment capability

`src/items/itemCatalog.ts` ma już `consumable`, ale `consumable.need === 'health'` jest zbyt szerokie — dokładnie dlatego nie wolno podczepiać poisoning treatment pod ten flag.

Dodaj w `ItemCatalogEntry` osobne wąskie pole danych, np. treatment dla condition kind + magnitude. Nie dodawaj tego do `ItemCapability`: `ItemCapability` służy obecnie operacjom narzędziowym bez per-item tuningu, podczas gdy treatment ma parametry.

`herb` dostaje poisoning treatment; `bandage` nie. Zachowaj dotychczasowe HP-heal z `consumable` dla obu tam, gdzie już istnieje.

`survivalActions.consumeItem()` powinien po udanym zużyciu aplikować katalogowy treatment przez shared condition operation; UI/toast pozostaje w action layer.

NPC healing z `npc-002` korzysta z `Inventory.findConsumableForNeed('health')`. Nie rozszerzaj go automatycznie: health consumable lookup nie oznacza poisoning treatment. Autonomous NPC treatment można zostawić poza V1, zgodnie z planem.

## SPEA / stamina pułapka

Endurance nie jest dziś jedną dynamiczną wartością konsumowaną wszędzie. `NpcStateRegistry` ustawia derived stamina max przy create/restore, a Player tworzy `PlayerNeeds` z początkowego Endurance. Temporary poisoning nie może po prostu zmienić endurance resolvera i zakładać, że istniejące `StaminaState.max` samo się przeliczy.

W V1 preferuj:

- podawanie effective Endurance do tych runtime recovery/cost resolverów, które już przyjmują Endurance,
- nie mutowanie bazowego `PhysicalProfile.attributes`,
- ostrożność z dynamiczną zmianą `stamina.max`: jeżeli ma reagować na poisoning, musi istnieć jedna jawna synchronizacja z clampingiem `current`; nie aktualizuj max opportunistycznie w wielu call sites.

Sprawdź analogicznie Strength/Agility consumers po wprowadzeniu wspólnego effective seam — część z nich obecnie pobiera resolved profile bezpośrednio.

## Persistence

`src/persistence/saveData.ts` jest schema authority. NPC condition snapshot może jechać wewnątrz istniejącego `npcStates`.

Player potrzebuje nowego optional/sparse pola albo rozszerzenia istniejącego player-owned save fragmentu; wybierz rozwiązanie zgodne z aktualnym `buildSaveData()`/restore flow. Starszy save powinien odtwarzać brak aktywnych conditions bez zmiany znaczenia innych pól.

Persistuj tylko authoritative condition state + time anchor. Po restore effective attributes mają być wyliczone ponownie.

## UI / debug

Normalny Player UI potrzebuje tylko czytelnego statusu active poisoning + ewentualnie severity tier; nie pokazuj pełnych modifierów w production HUD.

Dla NPC respektuj `npc-023` observation boundary. Dokładny kind/severity tylko w debug/full-label path.

Debug test hook powinien wywoływać dokładnie shared condition API (`apply exposure`, `set/apply poisoning`, `clear`) zamiast modyfikować wewnętrzne pola ad hoc.

## Testy, które szczególnie warto mieć

Poza planem zweryfikuj regressions wynikające z obecnej architektury:

- profile resolver + condition modifier nie mutuje `PhysicalProfile.attributes`,
- wielokrotne odczyty effective SPEA nie kumulują modifierów,
- NPC unload/recreate korzysta z tego samego condition state z `NpcStateRegistry`,
- save/load nie resetuje recovery anchor ani nie umożliwia rerollu tego samego eventu,
- dynamiczne Endurance nie zostawia `StaminaState.current > max`, jeśli max jest zmieniany,
- `herb` nadal leczy HP zgodnie z katalogiem i dodatkowo condition; `bandage` tylko dotychczasowe HP,
- lake i contextually-unsafe river przechodzą przez ten sam `WaterQuality === 'unsafe'` exposure path.

## Sugerowana kolejność implementacji

1. Shared condition state + progression + modifiers + unit tests.
2. Wspólny effective-SPEA seam i migracja aktualnych Player/NPC consumers potrzebnych dla S/E/A.
3. NPC + Player authoritative ownership i persistence.
4. Unsafe-water exposure + deterministic event roll.
5. Catalog treatment + `herb` integration.
6. Player status + NPC/debug inspection/test controls.

Nie łącz tego z refaktorem `physicalInjury`, NPC drinking AI, contaminated containers ani pełnym disease frameworkiem.