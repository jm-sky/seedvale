# Implementation Notes: Non-Home Settlement Food Production v1

Plan: `docs/plans/settlements-npcs-030-non-home-settlement-food-production-v1.md`

Reviewed against `main` on 2026-09-12.

## Najważniejsze decyzje

- Nie dodawać osobnego managera rolnictwa. Długowieczny owner istnieje już w `SettlementsManager`: `HouseholdRegistry` i `EconomyRegistry` przeżywają stream-out/in, a `HouseholdSnapshot` jest już częścią `SaveData.households`.
- Minimalny nowy authoritative state najlepiej trzymać przy household, np. jako opcjonalne `agriculture` w `HouseholdSnapshot` oraz odpowiadający mu runtime state/API na `Household`: marker starter seeds + `lastResolvedAtDays`. Sam snapshot nie powinien stać się drugim mutable ownerem.
- Loaded settlement pozostaje w 100% na istniejącym `NpcAgent` / `planFarmWork()` path. Aggregate resolver może działać wyłącznie między boundary unload → kolejny load.
- Nie próbować symulować historycznych `CropPlacement`s. Aggregate resolver powinien mutować wyłącznie realny `Household.items` / `SettlementEconomy` i temporal anchor.

## Field anchor

`src/settlement/props.ts` nadal zawsze buduje garden pads i tylko z nich dodaje `SettlementLandmarks.cultivationAnchors`; `foodSourceType === 'field'` materializuje `farm.glb` / `createWheatField()` bez gameplay anchoru.

Dla `field` dodaj jeden `CultivationAnchor` w tym samym miejscu, w którym wyliczane są `wheatX/wheatZ`. Nie twórz nowego typu. Footprint powinien mieć jedną stałą/mały helper w `src/world/cultivationAnchor.ts` lub obok istniejących settlement-anchor helpers, zamiast magicznego promienia w `props.ts`.

Ważne: `resolveCultivationAnchor()` bierze pierwszy `settlementAnchors[0]`. Jeżeli `field` ma być authoritative zamiast garden, nie wystarczy dopisać field anchor na końcu istniejącej tablicy. Dla `foodSourceType === 'field'` field musi być pierwszym/wybranym anchorem albo `props.ts` powinno zwrócić listę zgodną z tą regułą.

## Agricultural capacity i bootstrap

`createSettlement.ts` nadal ma pełne `def.families` przed `HouseholdRegistry.getOrCreate()`. Obecnie liczy `hasHunter` przez dowolnego membera z rolą hunter i przekazuje boolean do `getOrCreate()`; `household.ts` nadal ma bezpośredni wyjątek `if (!initial && hasHunter) ...bandage`.

Minimalnie uogólnić ten seam zamiast dodawać drugi boolean. Przekazać do `getOrCreate()` mały starting-resource/profession context albo wynik resolvera starter resources. Nie robić globalnego profession-resource registry.

Nie zmieniać przy okazji istniejącej semantyki hunter bandages. Agricultural capacity ma własną regułę aktywnego workforce; refactor starter-resource seam nie powinien przypadkiem sprawić, że hunter starter zacznie zależeć od wieku.

Dla farmera nie implementować własnego skanowania wieku. `professionStaffing.ts::adultProfessionCoverage(families)` jest już shared resolverem coverage i wewnętrznie używa `isProfessionAdult()` (`age >= 18`). Agricultural eligibility/capacity powinna korzystać z `coverage.farmer`, a nie z runtime `NpcAgent` ani z samego `member.character.role === 'farmer'`.

Capacity można wyliczyć z deterministic `SettlementDef`/`families` + typu cultivation source. Aggregate path nie powinien zależeć od runtime `SettlementLandmarks`, bo te nie istnieją po unloadzie. Runtime anchor jest potrzebny detailed Farmerowi; off-screen eligibility powinna być derivable z `SettlementDef`/`VillagePlan` i adult Farmer coverage.

## Starter seeds exactly once

Seed items pozostają `CROP_SEED_ITEM` w `src/world/plantedCrops.ts` i zwykłymi count-based itemami w `Household.items`.

Nie używać heurystyki `items.count(seed) === 0`: zero po zużyciu jest prawidłowym stanem. Persistowany marker musi rozróżniać „jeszcze nie bootstrapowano” od „bootstrapowano i zużyto wszystko”.

Dla świeżego household starter można zastosować podczas pierwszego `getOrCreate()`. Dla household odtworzonego ze starszego save marker ma pozwolić na jednorazowy grant przy pierwszym resolve po migracji, jeśli household faktycznie spełnia agricultural capacity.

Starter seeds są zwykłymi non-food item counts, więc nie przechodzą przez `depositFood()` ani freshness batching.

## Persistence / migracja

Aktualny `CURRENT_SAVE_VERSION` na review to `34`. Nie hardcodować tego numeru w implementacji — przed zmianą schema sprawdzić aktualny `main`.

`HouseholdSnapshot` jest zapisany przez `SaveData.households`; `src/app/saveState.ts` zapisuje `settlementsManager.snapshotHouseholds()`.

Jeżeli dodawany jest `lastResolvedAtDays`, migracja starego save musi ustawić jego początek na **zapisaną wartość `SaveData.elapsedDays`**, nie `0`. Inaczej pierwszy resolve po migracji naliczy jako off-screen interval całą dotychczasową historię świata.

Dla starter markeru migracja może oznaczyć istniejące households jako „bootstrap jeszcze nierozstrzygnięty”; eligibility należy sprawdzić dopiero po ponownym odtworzeniu deterministic family/profession composition. Nie próbować inferować roli Farmer z samego `HouseholdSnapshot`.

Rozszerzenie `HouseholdSnapshot` wymaga aktualizacji current validation/migration contract oraz fixtures/tests w `src/persistence/saveData.ts` / `saveData.test.ts`. Zachować optional/default contract tylko tam, gdzie jest świadomie częścią migracji.

## Streaming / temporal handoff

`SettlementsManager.update(..., nowDays?)` zna aktualny `elapsedDays`, ale `recheck()` / `ensureLoaded()` / `unload()` nadal nie przyjmują go bezpośrednio. To jest realna luka względem tekstu planu.

Doprowadzić world-day do boundary streaming w jednym miejscu, np. przez przekazanie `nowDays` do `recheck()` i dalej do `ensureLoaded()`/`unload()` albo przez manager-owned `lastNowDays` aktualizowany przed recheck. Nie pobierać czasu z NPC ani z presentation.

Kolejność powinna być jednoznaczna:

1. przy unloadzie zamknąć detailed interval i ustawić household `lastResolvedAtDays = nowDays`;
2. podczas unloaded state nic nie tickuje;
3. przed `createSettlement()` na kolejnym loadzie rozliczyć `[lastResolvedAtDays, nowDays]`;
4. ustawić anchor na `nowDays` atomowo z rozliczeniem;
5. dopiero potem stworzyć runtime settlement/NPCs.

Repeated resolve dla tego samego `nowDays` musi być no-op. Home settlement (`def.isHome`) omija aggregate path.

Nie trzeba rozliczać produkcji podczas każdego save, jeśli save persistuje nierozliczony temporal anchor: po reloadzie `SaveData.elapsedDays` + anchor nadal definiują ten sam interval. Ważniejsze jest, żeby snapshot nie nadpisywał/zerował anchoru.

## Aggregate resolver

Wydzielić pure/bounded helper poza `SettlementsManager.ts`; manager powinien tylko wybierać households i lifecycle boundary.

Resolver powinien operować per household na:

- elapsed days;
- liczbie realnych seed items;
- `CROP_DEFS[cropId].matureAfterDays` jako minimum czasu jednego zakończonego cyklu v1;
- `CROP_DEFS[cropId].yieldCount` / `harvestItem`;
- małej capacity wynikającej z `adultProfessionCoverage(...).farmer` / dostępnego cultivation source.

Nie kopiować crop timing/yield do agriculture helpera.

Koszt nie może rosnąć z liczbą dni. Wylicz maksymalną liczbę completed batches matematycznie i clampuj ją realnym seed count/capacity; iteracja najwyżej po trzech `CropId` jest wystarczająca.

`FARM_SEED_PRIORITY` jest obecnie prywatną polityką w `npcProfessionWork.ts`. Jeśli aggregate path ma używać identycznej kolejności cropów, wyciągnąć tę małą politykę do shared helpera zamiast kopiować tablicę. Nie przenosić tam całego Farmer AI.

Każdy batch: najpierw atomowo usuwa realny seed, potem `household.depositFood(def.harvestItem, def.yieldCount, economy, nowDays)`. Aktualne `depositFood()` obsługuje capacity/overflow oraz food freshness; brak przekazanego `FoodBatch[]` oznacza nowo wyprodukowaną żywność datowaną bieżącym `simTime`, więc aggregate harvest nie powinien tworzyć własnego provenance/freshness mechanizmu.

Uwaga semantyczna: batch catch-up agreguje historyczne harvesty do chwili resolve. V1 może traktować wynik jako produkcję materializowaną w `nowDays`, ale trzeba zachować tę decyzję jawnie i nie próbować częściowo backdate'ować freshness bez kompletnego historycznego cycle modelu. Inaczej powstanie pozorna precyzja i koszt zależny od liczby cykli.

## Detailed crops przy stream-out

Planted detailed crops są world-owned (`SaveData.plantedCrops` / `ChunkManager`), nie household-owned. Aggregate resolver nie może ich usuwać, harvestować ani zamieniać w synthetic history.

W konsekwencji seed już zużyty na fizyczny `CropPlacement` przed unloadem nie jest dostępny dla aggregate produkcji i nie może zostać policzony drugi raz. Taki crop po powrocie pozostaje obsługiwany przez istniejący detailed crop lifecycle. V1 nie powinno próbować „przejmować” go do aggregate state.

## Powiązane plany

- `settlements-npcs-031-sustainable-seed-recovery-and-replanting.md` zależy od tego planu; nie implementować tu recovery/refill.
- `world-023-species-driven-sowing-density-and-yield.md` jest nadal `planned`. Nie zakładać jego nowych pól ani yield semantics. Ten plan ma używać bieżących `CROP_DEFS`; po implementacji world-023 shared definitions pozostaną integration seam.
- `settlements-npcs-032-player-to-household-resource-transfer.md` zmienił household food mutation seam: `depositFood(itemKind, amount, economy?, simTime?, batches?)` zwraca `HouseholdDepositResult` i zachowuje freshness/provenance przy transferach. Aggregate production ma nadal używać tego wejścia, ale ignorować result poza ewentualną diagnostyką — overflow jest już wykonywany wewnątrz metody.

## Testy o największej wartości

Poza testami wskazanymi w planie szczególnie sprawdzić:

- `field` jest wybranym anchorem mimo obecności garden anchorów;
- child Farmer nie daje capacity/starter seeds;
- refactor starter-resource seam nie zmienia dotychczasowej reguły hunter bandages;
- migracja starego save ustawia temporal anchor na jego `elapsedDays` i nie produkuje retroaktywnie;
- `unload@D1 → load@D3` rozlicza tylko `D1..D3`, a drugi resolve w `D3` nic nie zmienia;
- loaded settlement nigdy nie wykonuje aggregate resolvera;
- seed zużyty przez detailed planting nie jest ponownie konsumowany/produkowany przez catch-up;
- aggregate harvest używa istniejącego `depositFood()` i poprawnie kieruje overflow do `SettlementEconomy`;
- bardzo duży elapsed interval ma stały/bounded koszt.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
