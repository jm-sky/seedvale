# Implementation Notes: Physical Goods Transport Foundation

**Plan:** `settlements-npcs-018-physical-goods-transport-foundation.md`  
**Reviewed:** 2026-09-04  
**Status:** `planned` 📋

## Review result

Plan pasuje do obecnej architektury, ale implementacja musi być węższa niż sugeruje część opisu. `settlements-npcs-014` już zapewnia realny `source → NpcAgent.carried → destination` dla concrete food. 018 powinien wydzielić wyłącznie trwałą tożsamość/commitment transportu i przepiąć na nią istniejący Trader collection flow.

Najważniejsza nierozwiązana granica: `NpcAgent.carried` jest dziś jawnie transient i znika przy rekonstrukcji NPC. Nie wolno więc sprawić, aby `TransportOrder` wyglądał na persist/off-screen-safe, kiedy cargo nie ma jeszcze równie trwałego ownera. To należy do 019.

## 1. Aktualny flow, który trzeba migrować

Kluczowy path jest w `src/ai/NpcAgent.ts`:

- `beginTraderWork()` — zachować obecny own-household → economy path jako regression baseline;
- `beginTraderCollection()` — pierwszy vertical slice dla 018;
- `HouseholdExchangeHooks.findSurplusSource()` wybiera bounded, same-settlement source;
- pickup: `claimFoodItems(sourceHousehold.items, requested)`;
- carry: `carryFoodClaim(this.carried, claimed, sourceHousehold.items)`;
- unload: `this.carried.remove(...)` + `economy.depositFood(...)`;
- destination: `settlementStorageDestination('food', ...)`.

Nie tworzyć drugiego Trader flow. `beginTraderCollection()` powinien po migracji być wykonaniem konkretnego `TransportOrder`, nie równoległą ścieżką legacy.

## 2. Ownership, którego nie zmieniać

Aktualni authoritative owners:

- `Household.items` — source concrete goods;
- `NpcAgent.carried` — fizyczny owner po pickup;
- `SettlementEconomy.items` — destination concrete food;
- `TransportOrder` — wyłącznie metadata commitmentu.

`SettlementEconomy.stock`/`EconomicStock` pozostają poza 018. Nie robić `ItemKind | EconomicKind` ani transportować scalar wood tylko dla uogólnienia API.

## 3. Zalecany model domenowy

Wzorować split na `src/world/workContract.ts` + `src/world/createWorkContracts.ts`:

- pure domain record/transitions, bez `THREE` i bez runtime object refs;
- mały world-owned registry/store z `create/find/assign/pickup-completed/delivery-completed`;
- mutacje lifecycle walidowane centralnie, zamiast bezpośredniego ustawiania `order.state` z `NpcAgent`.

Naturalny kierunek plików: `src/world/transportOrder.ts` i `src/world/createTransportOrders.ts`, o ile recon podczas implementacji nie ujawni lepszego istniejącego ownera.

Registry nie potrzebuje ticka, renderera ani managera. `Map` jest sensowny przy lookupach `id`/`carrierNpcId`, ale nie budować indeksów pod przyszłe route planning/matching.

## 4. Endpoint refs i resolvery

Użyć stabilnych ID, nie `Household`/`SettlementEconomy` refs w rekordzie.

Dla pierwszego slice wystarczą endpointy odpowiadające:

- household: `HouseholdId`;
- settlement inventory: `settlementId`.

Do runtime resolution wykorzystać istniejące registry zamiast nowych globalnych lookupów:

- `HouseholdRegistry.get(id)` w `src/settlement/household.ts`;
- istniejący settlement/economy registry owned przez `SettlementsManager`.

Nie używać pozycji świata jako authority endpointu. Pozycja pickup/unload ma nadal wynikać z `Household.homeId`/istniejących landmarks/resolverów storage.

## 5. Order nie powinien przechowywać `FoodItemClaim[]`

`FoodItemClaim` zawiera freshness batches i jest dobrą reprezentacją transakcji itemów, ale po udanym pickup realne dobra należą już do `NpcAgent.carried`.

Order powinien zachować co najwyżej:

- `itemKind` lub węższy selector zgodny z faktycznie wybranym slice;
- requested quantity;
- claimed quantity;
- delivered quantity;
- carrier NPC id;
- lifecycle.

Nie wkładać batches/cargo payload do ordera — byłby to drugi model cargo.

## 6. Generic Inventory transfer: ważna pułapka

`src/items/foodItems.ts` ma potrzebne freshness primitives:

- `claimFoodItems()`;
- `carryFoodClaim()` z refundem przy braku capacity carrier;
- `deliverCarriedFoodClaim()`.

Ale `deliverCarriedFoodClaim()` **nie jest bezpiecznym generic unload transaction**: usuwa item z carrier, potem wywołuje `destination.addWithFreshness(...)` i ignoruje wynik. Obecny Trader trafia do `SettlementEconomy.items`, które ma `Infinity` capacity, więc praktycznie nie widać problemu. Dla `TransportOrder` nie utrwalać tej semantyki jako ogólnego API.

Jeżeli powstanie mały reusable transfer primitive, destination acceptance musi być sprawdzone przed usunięciem z carrier albo mieć jawny rollback. `deliveredQuantity` zwiększać dopiero po rzeczywistym sukcesie `carrier → destination`.

Nie robić przy tym szerokiego refactoru `Inventory`.

## 7. Pickup transaction

Trader source selection może nadal użyć `HouseholdExchangeHooks.findSurplusSource()` — order creation nie powinno ponownie skanować świata.

Przy pickup:

1. resolve order + source;
2. ponownie policz live surplus;
3. claim real items przez istniejące freshness-preserving API;
4. załaduj do `NpcAgent.carried`;
5. tylko ilość faktycznie załadowana zapisuje `claimedQuantity` i przełącza order na `in-transit`.

Jeżeli live claim wynosi zero, nie przechodzić do `in-transit`. Minimalny `failed` state jest uzasadniony, jeśli inaczej order pozostałby wiecznie `assigned`; nie dodawać rozbudowanych reason/state enums.

## 8. Action lifecycle i interruption

Nie dodawać `TransportFSM`. Nadal używać `startAction()` i obecnego `goTo → execute → next`.

W closure action chain może być tylko `transportOrderId`; authoritative lifecycle/quantities mają być odczytywane ze store przy pickup/unload. Nie trzymać ponownie całego commitmentu jako lokalnego `carriedClaim` będącego jedyną wiedzą o transporcie.

Freshness batches nadal muszą przejść przez fizyczny transfer. Mogą być potrzebne jako krótkotrwały transaction payload podczas pickup/unload, ale nie jako authoritative order state.

## 9. Najważniejsza granica: streaming i rebuild

`src/settlement/npcState.ts` explicite wyklucza `carried` z `NpcAuthoritativeState`; `NpcAgent` reconstruction zeruje cargo. Tymczasem world-owned registry może przeżyć dłużej niż konkretna instancja agenta.

Dlatego w 018:

- nie deklarować `in-transit` orderów jako bezpiecznych dla settlement stream-out/off-screen;
- nie dodawać ich jeszcze do `SaveData`;
- nie kopiować automatycznie Work Contracts persistence/rebuild semantics dla aktywnego `in-transit`, jeżeli cargo nie jest równocześnie zachowane;
- nie próbować naprawiać tego przez zapisanie cargo w `TransportOrder`.

Jeżeli store zostanie dodany do `WorldBundle`, jego carry-across-rebuild policy musi jawnie respektować tę granicę. Najbezpieczniej dla 018 nie obiecywać continuity aktywnego transportu poza lifetime fizycznego carrier; pełne rozwiązanie należy zostawić 019, gdzie cargo owner/off-screen execution będą projektowane razem.

To jest także obecna słabość physical Trader flow z 014 — 018 nie powinien jej ukrywać poprzez sam persistent commitment record.

## 10. WorldBundle / dependency threading

Jeżeli registry jest world-owned, integracja powinna iść tym samym dependency path co `WorkContracts`:

`WorldBundle → buildSettlementsManager/createSettlementsManager → CreateSettlementDeps → NpcAgent.create`.

Nie robić module-level singletonu ani importu store bezpośrednio do `NpcAgent`.

`WorkContracts` jest dobrym precedensem ownership/dependency injection, ale nie kopiować jego save/rebuild zachowania mechanicznie z powodu transient `NpcAgent.carried` opisanej wyżej.

## 11. Order creation i assignment

Pierwszy slice nie potrzebuje globalnego matcher/scheduler.

Najprostszy flow:

- Trader podczas istniejącego work decision znajduje source dokładnie tak jak dziś;
- tworzy order dla konkretnego source/destination/request;
- od razu przypisuje siebie jako carrier;
- action chain wykonuje ten order.

To wystarczy do wydzielenia commitmentu bez budowania ekonomicznego transport-demand systemu, który należy do późniejszych planów.

Dobrze dodać `findByCarrier(npcId)` albo równoważny bounded lookup, aby ten sam NPC nie tworzył kolejnego aktywnego ordera, gdy poprzedni nadal jest non-terminal. Nie wprowadzać wielu równoległych active orders per NPC w pierwszym slice.

## 12. Ilość i concrete kind

Aktualny Trader collection wybiera food jako agregat i `claimFoodItems()` może claimować kilka `ItemKind` w jednym requested amount. To nie pasuje idealnie do przykładowego `TransportOrder.itemKind: ItemKind`.

Nie ignorować tej rozbieżności.

Preferowana pierwsza wersja: przed utworzeniem ordera wybrać deterministycznie jeden konkretny food `ItemKind` z realnego surplus i transportować bounded quantity jednego kind. Dzięki temu `requested/claimed/delivered` mają jednoznaczną semantykę bez dodawania multi-line cargo manifestu do ordera.

Jeśli implementacja zachowa multi-kind `claimFoodItems()`, order potrzebuje małego requested-goods descriptor zgodnego z tym zachowaniem; nie fałszować go jednym `itemKind`.

## 13. Testy warte dodania

Skupić testy na nowej warstwie, nie powtarzać pełnych testów 014:

- pure lifecycle: pending/assigned/in-transit/completed + guards duplicate execution;
- stable endpoint refs bez runtime objects;
- partial live pickup zapisuje faktycznie claimed quantity;
- zero claim nie tworzy cargo ani `in-transit`;
- carrier capacity failure refunduje source i nie zmienia ordera na `in-transit`;
- completed order nie może claimować/deliverować ponownie;
- unload aktualizuje `deliveredQuantity` dopiero po sukcesie;
- jeden active order per carrier dla vertical slice;
- Trader collection regression: source selection pozostaje same-settlement/deterministic przez istniejące `HouseholdExchangeHooks`.

Nie budować teraz pełnego `NpcAgent` test harness wyłącznie dla tego planu — 014 już udokumentował brak takiego wzorca. Pure order/store + Inventory transaction tests dadzą większość wartości.

## 14. Zalecana kolejność

```text
1. Pure TransportOrder + lifecycle guards.
2. World-owned registry i dependency threading.
3. Ustalić jednoznaczną semantykę concrete item kind dla pierwszego slice.
4. Dodać bezpieczny pickup/unload seam na istniejącym Inventory/freshness API.
5. Przepiąć beginTraderCollection na order id + registry lifecycle.
6. Usunąć legacy commitment state z tego flow, jeśli po migracji stał się redundantny.
7. Testy lifecycle/conservation/duplicate execution + Trader regression.
```

## 15. Najważniejsze pliki

- `src/ai/NpcAgent.ts` — `beginTraderWork`, `beginTraderCollection`, action chain, `carried`.
- `src/items/Inventory.ts` — ownership, capacity, `removeWithFreshness`/`addWithFreshness`.
- `src/items/foodItems.ts` — concrete food claim/carry/freshness helpers.
- `src/settlement/household.ts` — `Household.items`, `HouseholdRegistry.get`.
- `src/settlement/householdExchange.ts` — bounded deterministic source lookup.
- `src/settlement/storageDestinations.ts` — physical WHERE resolver.
- `src/economy/settlementEconomy.ts` — `SettlementEconomy.items`, `depositFood`/`withdrawFood`.
- `src/world/workContract.ts` + `src/world/createWorkContracts.ts` — precedent dla pure commitment + world-owned registry.
- `src/settlement/npcState.ts` — krytyczna transient boundary dla `carried`.
- `src/settlement/createSettlement.ts`, `src/settlement/SettlementsManager.ts`, `src/app/worldBundle.ts` — dependency/lifetime threading.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
