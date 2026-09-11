# Implementation Notes: Persistent & Off-screen Transport

**Plan:** `settlements-npcs-019-persistent-and-off-screen-transport.md`  
**Reviewed:** 2026-09-11  
**Status:** `planned` 📋

## Review result

Plan jest nadal trafny, ale codebase zmienił się istotnie od 2026-09-04: `settlements-npcs-026` dodał trwałe `NpcAuthoritativeState.personalInventory`, a `settlements-npcs-018` jest już zaimplementowany jako `TransportOrder` + world-owned registry + transactional Inventory transfer.

Najważniejsza decyzja dla 019: **nie używać `personalInventory` jako cargo transportowego** i nie persistować całego obecnego `NpcAgent.carried`. `personalInventory` to osobiste belongings NPC; zmieszanie go z transport cargo powodowałoby niejednoznaczne ownership/unload dla tego samego `ItemKind`. Najmniejszy poprawny model to osobny, authoritative transport-cargo `Inventory` przypięty do `NpcId` i przeżywający lifetime `NpcAgent`.

Dodatkowo review po `npc-032` ujawnił wymaganie dla generic travel continuity: reusable detailed↔off-screen travel primitive nie może rozliczać wyłącznie pozycji/czasu/cargo. Dla zwykłego travelling NPC musi zachować continuity authoritative survival state (needs/vigor/injury/personal provisions) bez tworzenia drugiego decision loop. To jest shared contract dla transportu, long-distance travel i później accompany/return travel.

## 1. Aktualne granice ownership

Stan po 018/026:

- `TransportOrder` — `src/world/transportOrder.ts`; commitment + lifecycle/quantities, bez cargo.
- `TransportOrders` — `src/world/createTransportOrders.ts`; world-owned runtime registry, obecnie resetowany przy rebuild i niepersistowany.
- `executeTransportPickup` / `executeTransportUnload` — `src/world/transportTransactions.ts`; poprawny transactional transfer z freshness + rollback.
- `NpcAuthoritativeState.personalInventory` — trwałe osobiste belongings; **nie cargo**.
- `NpcAgent.carried` — nadal transient work/logistics payload i jawnie resetuje się przy reconstruction.

Nie zmieniać semantyki `personalInventory`. Nie przenosić mechanicznie wszystkich zastosowań `NpcAgent.carried` do persistence.

## 2. Zalecany persistent cargo owner

Dodać do `NpcAuthoritativeState` osobny `Inventory`, np. `transportCargo`, wraz z `NpcStateSnapshot.transportCargo?: InventoryContentsSnapshot`.

Powody:

- registry już jest właściwym ownerem per-`NpcId` dla stanu przeżywającego stream-out/rebuild/save;
- `InventoryContentsSnapshot` już zachowuje counts, `ItemInstance` metadata i freshness batches;
- nie trzeba tworzyć osobnego transport serializer/store cargo;
- nie miesza się transportu z osobistymi przedmiotami ani innymi transient profession payloads.

`NpcAgent` transport flow powinien dostać bezpośrednią referencję do tego samego `Inventory` i przekazywać ją do `executeTransportPickup` / `executeTransportUnload`. Nie kopiować cargo przy load/unload agenta.

Starszy snapshot bez `transportCargo` → pusty inventory. Nie odtwarzać go z `TransportOrder.claimedQuantity`.

## 3. TransportOrders: persistence i rebuild

`createTransportOrders(initial)` już przyjmuje rekordy startowe, więc nie potrzebuje drugiego restore API.

Dodać plain-data snapshot active/non-terminal orders do:

- `WorldBundle` rebuild carry path w `src/app/worldBundle.ts`;
- `SaveData` / `src/app/saveState.ts`;
- validator/migration/defaulting w `src/persistence/saveData.ts`.

Preferować zapis aktywnych orderów; terminalne rekordy nie są potrzebne do continuity, chyba że istniejące debug/test semantics wymagają ich w bieżącej sesji.

**ID generation:** obecny `Date.now() + module counter` nie gwarantuje kolizji-free continuation po restore/reload. Przy persystowaniu registry agent powinien poprawić generator tak, aby nowo tworzony order nie mógł dostać ID istniejącego restored recordu. Nie wymaga to globalnego ID systemu.

## 4. Execution metadata należy do orderu, nie cargo

Dodać do `TransportOrder` małe optional execution metadata dla abstrakcyjnej podróży, np.:

```ts
execution?: {
  mode: 'off-screen'
  arrivesAtDays: number
}
```

Nie dodawać `detailed` jako persisted state — brak `execution` może oznaczać detailed/nieabstracted execution. Nie rozbudowywać lifecycle (`pending/assigned/in-transit/...`) o states typu `travelling-offscreen`.

`arrivesAtDays` powinno używać absolutnego `dayNight.elapsedDays`, tak jak inne world-time persisted anchors. To daje poprawne save/load i time skip przez zwykłe porównanie czasu.

## 5. Detailed → off-screen handoff

Handoff musi nastąpić **przed dispose live `NpcAgent`**, kiedy nadal istnieje jego pozycja i wiadomo, czy jedzie do source czy destination.

Nie próbować po unloadzie rekonstruować path/pozycji.

Minimalny model:

- `assigned` → remaining distance do source;
- `in-transit` → remaining distance do destination;
- duration = remaining distance / uzgodniona efektywna prędkość;
- zapisać `arrivesAtDays`.

Nie persistować dokładnej pozycji NPC tylko dla transportu. Nie symulować pathfindingu off-screen.

Potrzebny jest jeden jawny hook na stream-out w `SettlementsManager` / `Settlement.dispose` path; nie opierać tego na `NpcAgent.dispose()` bez kontekstu world time i endpoint resolverów.

## 6. Off-screen progression nie może zależeć od loaded settlement

`SettlementsManager.resolveTimeSkip()` obecnie replayuje tylko live `NpcAgent`s załadowanych settlements. To **nie wystarczy** dla 019.

Transport off-screen powinien być procesowany na poziomie world-owned `TransportOrders`, niezależnie od `entry.settlement?.npcs`, na bounded checkpointach:

- po zakończeniu time skip,
- podczas/po settlement stream transition,
- przy restore/rebuild,
- ewentualnie w niskoczęstotliwościowym world checkpoint, jeśli normalny upływ czasu ma kończyć unloaded transport bez ponownego stream-in.

Nie dodawać per-frame pętli nad wszystkimi orderami. Liczba aktywnych orderów jest mała; iteracja tylko po active/off-screen commitments jest wystarczająca.

## 6a. Generic NPC survival continuity podczas off-screen travel

Reusable travel primitive, który 019 ma pozostawić dla `settlements-npcs-028` i `npc-029`, musi mieć jawny hook do rozliczenia elapsed travel consequences zwykłego NPC.

Nie oznacza to przeniesienia całego `NpcAgent.choose()` poza ekran ani implementacji transport-specific hunger systemu.

Docelowy kontrakt:

```text
off-screen travel interval
+ same NpcAuthoritativeState
+ journey duration/context
→ bounded/lazy survival resolution
→ same NpcAuthoritativeState
```

Co najmniej:

- hunger/thirst nie mogą zostać zamrożone przez stream-out;
- stamina/vigor nie mogą być resetowane przy reification; coarse travel/rest policy ma zachować ciągłość bez frame-level tickowania;
- `physicalInjury` korzysta z istniejącego lazy elapsed recovery (`injuryRecoveryUpdatedAtDays`), bez drugiej kopii recovery state;
- personal food/water są konsumowane wyłącznie z `personalInventory` przez shared provision semantics, nie z `transportCargo` i nie z nowego travel inventory;
- depletion ma realne konsekwencje; nie tworzyć magicznego refill;
- save/load/time-skip i zwykły elapsed world time muszą rozliczać ten sam interval idempotentnie.

Nie implementować pełnej listy detailed actions off-screen. Preferować deterministic checkpoint/lazy resolution, które aktualizuje existing authoritative state i zwraca neutralny rezultat, np. `continue` / `cannotProgress`, jeśli finalny design tego wymaga.

**Execution ownership invariant pozostaje:**

```text
detailed NPC simulation
XOR
off-screen NPC travel simulation
```

Nie może istnieć równoległy `CompanionOffscreenSimulation` ani expedition-only needs state. Shared survival hook ma być dostępny dla każdego generic NPC travel commitmentu, nawet jeśli pierwszy caller 019 używa go tylko w ograniczonym zakresie transportu.

Nie mieszać inventory owners:

```text
personalInventory → personal food/drink/medicine/weapons/tools
transportCargo    → transport-order cargo only
carried           → transient runtime work payload only
```

## 7. Endpoint resolution i off-screen unload

Pierwszy slice ma tylko:

- `household` → `HouseholdRegistry.get(householdId)`;
- `settlement-storage` → manager-owned `EconomyRegistry` / `SettlementEconomy.items`.

Oba registry przeżywają stream-out i są już snapshotowane przez `SettlementsManager`; aktywny order został utworzony z istniejących endpointów, więc nie potrzeba nowej generic storage abstraction.

Warto dodać mały resolver w settlement/world integration layer zwracający authoritative `Inventory | null` dla istniejącego `TransportEndpointRef`. Nie importować `SettlementsManager` do pure `transportOrder.ts`.

Off-screen unload ma użyć **tego samego** `executeTransportUnload`, nie osobnej ścieżki mutującej quantities/storage.

Jeśli endpoint nie może zostać rozwiązany: zostawić order `in-transit` + cargo u NPC; nie complete/refund/mint.

## 8. Resume po stream-in

Przy reconstruction live agent powinien:

1. rozliczyć pending shared off-screen survival interval dokładnie raz;
2. dostać ten sam `transportCargo` z `NpcAuthoritativeState`;
3. sprawdzić `transportOrders.findByCarrier(npcId)`;
4. jeśli off-screen arrival jeszcze nie nastąpił — skasować off-screen execution ownership i wznowić właściwy physical leg;
5. jeśli arrival nastąpił i unload został wykonany — nie wznawiać transportu;
6. jeśli arrival nastąpił, ale endpoint był nierozwiązywalny — wznowić final delivery z istniejącym cargo.

Nie wykonywać ponownie source selection ani pickup dla `in-transit`.

Reification nie może resetować needs/vigor/injury ani ponownie konsumować personal provisions za interval już rozliczony off-screen.

## 9. Save snapshot consistency

`saveState.ts` powinien snapshotować order registry i `NpcStateRegistry` w tej samej synchronicznej operacji save. Nie wprowadzać osobnego async checkpointu cargo.

Przy restore walidować conservatively:

- active order ma poprawny carrier id;
- `in-transit` ma `claimedQuantity > 0`;
- carrier state istnieje lub może zostać deterministycznie utworzony przez normalny NPC registry flow;
- cargo inventory posiada co najmniej `claimedQuantity` danego kind przed unload;
- off-screen survival checkpoint/timestamp nie powoduje double-application po restore.

W przypadku niespójności nie naprawiać save przez tworzenie goods. Zachować cargo/record do diagnostyki lub pozostawić order nierozwiązany.

## 10. Death / corpse boundary

`npcPostDeath.ts` przenosi `personalInventory` do corpse loot, a komentarze jawnie wykluczają `NpcAgent.carried` work/economy payload. Nie wciskać transport cargo do `personalInventory`, aby przypadkiem nie stało się zwykłym corpse loot.

019 może pozostawić death recovery unresolved zgodnie z planem, ale musi zapewnić:

- order nie staje się completed;
- source nie dostaje automatycznego refundu;
- cargo nie jest kasowane/mintowane.

Jeżeli `transportCargo` zostaje na authoritative NPC state po śmierci, opisać to JSDoc jako świadomy deferred ownership case dla późniejszego corpse/cargo handoff.

## 11. Testy o najwyższej wartości

Dodać testy przede wszystkim na boundaries:

- pickup → snapshot `NpcStateRegistry` → restore → ten sam cargo/freshness/instances;
- pickup → `WorldBundle`-style registry reconstruction → order + cargo zachowane, brak drugiego pickup;
- save/load `in-transit` order + cargo;
- off-screen timestamp przed/po `arrivesAtDays`;
- unloaded traveller: hunger/thirst i personal provisions rozliczone przez shared off-screen survival hook, bez użycia transport cargo;
- vigor/stamina nie resetują się po reification;
- injury lazy recovery nie jest pominięty ani podwójnie rozliczony;
- repeated checkpoint/time-skip jest idempotentny;
- unload off-screen używa transactional seam i nie duplikuje goods;
- stream-in przed arrival przełącza execution owner dokładnie raz;
- `personalInventory` item tego samego kind nie jest użyty do delivery;
- missing destination zostawia cargo u carrier;
- legacy save bez order/transport cargo → empty state.

Nie budować szerokiego simulation scheduler test harness tylko dla tego planu.

## 12. Zalecana kolejność implementacji

```text
1. Dodać NpcAuthoritativeState.transportCargo + snapshot/restore.
2. Przepiąć istniejący Trader TransportOrder flow z transient carried na transportCargo.
3. Carry TransportOrders + transportCargo przez WorldBundle rebuild.
4. Dodać SaveData/saveState/validation/migration.
5. Dodać execution metadata + jawny detailed→off-screen handoff.
6. Wydzielić shared off-screen travel checkpoint contract, w tym neutralny hook do authoritative NPC survival continuity.
7. Dodać world-owned off-screen resolution/checkpoint + endpoint resolver.
8. Podpiąć time skip i stream-in resume.
9. Testy conservation/idempotency/survival continuity/legacy restore.
```

Nie zaczynać od off-screen timing przed domknięciem kroków 1–4.

## 13. Najważniejsze pliki

- `src/world/transportOrder.ts`
- `src/world/createTransportOrders.ts`
- `src/world/transportTransactions.ts`
- `src/ai/npcProfessionWork.ts`
- `src/ai/NpcAgent.ts`
- `src/ai/Needs.ts`
- `src/ai/npcPersonalProvisions.ts`
- `src/settlement/npcState.ts`
- `src/settlement/SettlementsManager.ts`
- `src/settlement/household.ts`
- `src/economy/settlementEconomy.ts` / registry
- `src/app/worldBundle.ts`
- `src/app/saveState.ts`
- `src/persistence/saveData.ts`
- `src/world/timeSkip.ts`
- `src/app/gameLoop.ts`

## 14. Dokumentacja po implementacji

Zaktualizować komentarze, które nadal deklarują transport jako runtime-only (`transportOrder.ts`, `createTransportOrders.ts`, `worldBundle.ts`, `npcState.ts`) oraz właściwe sekcje `docs/state/npc.md` / `docs/state/persistence.md`. Dodać JSDoc z `@domain settlements-npcs` do nowego publicznego handoff/checkpoint API, jeśli powstanie.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
