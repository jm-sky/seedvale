# Implementation Notes: Economic Production and Input Integration

**Plan:** `settlements-npcs-015-economic-production-and-input-integration.md`  
**Reviewed:** 2026-09-02  
**Status:** `planned` 📋

## Review result

Plan jest trafny, ale obecny kod ma dokładnie ten podział, który plan ma usunąć: `SettlementEconomy.produce()` → stock-only, a Hunter → `Inventory.applyRecipe()`. Nie próbować rozszerzać `SettlementEconomy.produce()` o logikę household; wspólnym miejscem powinien być mały executor/orchestrator nad istniejącymi storage owners.

## 1. Najważniejsze aktualne punkty wejścia

- `src/economy/production.ts` — `ProductionDef`, wszystkie istniejące recipes oraz `produceFirstAvailableItemRecipe()`.
- `src/economy/stock.ts` — `EconomicStock.applyRecipe()`; stock-only, all-or-nothing tylko w obrębie jednego stocku.
- `src/economy/settlementEconomy.ts` — `SettlementEconomy.produce()` jest cienkim wrapperem na `stock.applyRecipe()`. Nie dodawać tu mixed-storage orchestration.
- `src/economy/npcWork.ts` — `commitRoleWork()`, `commitWoodcutterDeposit()`, `commitHunterArrowProduction()`. To jest obecny adapter work → production i powinien pozostać miejscem integracji z NPC work.
- `src/ai/NpcAgent.ts` — `beginIdle()` uruchamia realne profession-specific work przed fallbackowym `commitRoleWork()`; `beginArrowCrafting()` robi tylko gating/czas akcji, a właściwe zużycie robi `commitHunterArrowProduction()`.
- `src/items/Inventory.ts` — `Inventory.applyRecipe()` jest istniejącym item-only primitive, ale nie nadaje się jako mixed transaction coordinator.
- `src/settlement/household.ts` — `Household.items` jest authoritative concrete item storage; `Household.stock` praktycznie przechowuje tylko `wood`.
- `src/economy/localExchange.ts` — istnieją atomic/revalidated claim helpers dla local exchange; można wykorzystać ich semantykę jako wzorzec, ale nie mieszać exchange z production.

## 2. Istotna rozbieżność względem planu

Plan opisuje `EconomicStock` i `Inventory` jako dwa adaptery jednego executora. To jest właściwy kierunek, ale nie należy tworzyć abstrakcji storage, która ukryje ownership.

Najprostszy kontrakt powinien przyjmować jawny context, np. settlement `EconomicStock`/economy oraz opcjonalny konkretny `Inventory` ownera, i wykonać recipe synchronicznie. Destination dla `outputs` pozostaje economic stock, a dla `itemOutputs` — przekazane `Inventory`. Nie wyszukiwać ownera w świecie.

`ProductionDef` pozostaje source of truth. Nie zmieniać jego semantyki tylko po to, aby reprezentować storage.

## 3. Ważna pułapka w obecnych applyRecipe()

Oba istniejące primitives mają ograniczenie, którego nowy executor nie może odziedziczyć:

- `EconomicStock.applyRecipe()` najpierw robi `hasAll()`, potem kolejne `remove()`.
- `Inventory.applyRecipe()` działa analogicznie.

Przy zduplikowanym input kind, np. `wood × 2 + wood × 1` przy stanie `wood = 2`, walidacja może przejść, a drugi remove się nie uda. W stocku/itemach może to oznaczać częściową konsumpcję.

Executor powinien **najpierw agregować inputy po kind** albo walidować wymagany finalny total dla każdego kind. Nie zakładać, że istniejące `hasAll()` jest wystarczającą walidacją.

Dodatkowo invalid recipe powinien odrzucać co najmniej niepoprawne ilości (np. ujemne/NaN/Infinity) zanim nastąpi jakakolwiek mutacja.

## 4. Transaction boundary bez trzeciego storage

Nie dodawać persistent reservation store ani globalnego `ProductionManager` tylko na potrzeby tego planu.

W obecnym JS execution jest synchroniczny. Dla recipe work-level wystarczy:

1. validate recipe,
2. resolve jawne sources/destinations,
3. policzyć zagregowane wymagania,
4. sprawdzić cały live state wszystkich sources,
5. sprawdzić możliwość zapisania wszystkich outputs,
6. dopiero wtedy wykonać synchroniczny commit.

Dzięki temu mixed recipe może być atomowe bez wprowadzania asynchronicznego locka.

Jeżeli implementacja użyje helperów typu claim, nie wolno robić `claim stock → claim inventory → jeśli drugi fail, zostaw pierwszy claimed`. Potrzebny jest albo prawdziwy rollback, albo — preferowane tutaj — pełna walidacja + synchroniczny commit.

## 5. Output capacity jest częścią transakcji

`Inventory.add()` może zwrócić `false` z powodu weight/size. Nowy executor nie może najpierw zużyć inputów, a dopiero potem odkryć, że output się nie mieści.

Przed commit sprawdzić zdolność destination do przyjęcia **łącznego finalnego outputu**, nie tylko każdego `add()` osobno. W szczególności dwa outputy mogą osobno wyglądać poprawnie, ale razem przekroczyć limit.

Dla obecnego `Household.items` limit jest `Infinity`, ale executor nie powinien zakładać tego na stałe.

Nie używać `Inventory.applyRecipe()` jako finalnego mixed commit, bo ignoruje wynik `add()` i może skonsumować input bez utworzenia outputu.

## 6. ProductionResult

Wynik powinien być małym plain-data discriminated union, zgodnym z istniejącymi conventions. Potrzebne są przynajmniej rozróżnienia:

- success,
- blocked/missing-input,
- invalid-recipe,
- unavailable-destination,
- transaction/revalidation failure.

Nie zwracać wyjątków jako normalnego sygnału braku surowców.

Dla Huntera obecne API zwraca `ProductionDef | null`; można zachować ten prosty adapter na zewnątrz, jeśli ogranicza to zmianę call sites, ale wewnętrzny executor powinien już zwracać jawny result.

## 7. Hunter — zachować istniejącą semantykę

`HUNTER_ARROW_PRODUCTIONS` musi pozostać w tej samej kolejności: branch przed beam.

Obecne zachowanie:
- 1 branch → 1 arrow,
- 1 beam → 8 arrows,
- cap 24 jest tylko progiem rozpoczęcia kolejnej produkcji,
- recipe działa na `household.items`,
- żadnego `SettlementEconomy` dla branch/beam/arrow.

Nie dodawać Hunterowi ekonomicznego wood conversion. Wspólny executor ma tylko zastąpić item-only execution, nie zmienić recipe.

`beginArrowCrafting()` nadal powinien robić tylko decyzję/gating i rozpoczęcie action; mutation ma nastąpić w istniejącym `onComplete`.

## 8. NPC work / fallback

Nie tworzyć drugiego schedulera produkcji.

`NpcAgent.beginIdle()` już ma kolejność realnych zawodowych operacji → fallback `work` → `commitRoleWork()`. Nowy executor powinien być wywoływany przez istniejące `npcWork.ts` adapters, a nie bezpośrednio z globalnego update loop.

Uwaga: obecne `commitRoleWork()` dla Farmer/Fisher/Miner jest fallbackiem/no-op dla profesji, które mają własne realne flows. Nie próbować automatycznie zamienić każdego role work w production.

## 9. 014 i ownership

Plan 014 jest nadal oznaczony jako `planned` w `docs/plans/README.md`, mimo że jego implementation notes i aktualny codebase pokazują już local-goods claim/delivery mechanisms. Dla 015 źródłem prawdy jest kod.

Szczególnie:
- `Household.items` = konkretne itemy gospodarstwa,
- `Household.stock` = scalar wood,
- `SettlementEconomy.items` = settlement food,
- `SettlementEconomy.stock` = settlement bulk economic resources.

Nie traktować `Household.stock` jako źródła dowolnego `StockAmount`; `StockAmount.kind` odnosi się do `EconomicKind`, a household storage ma własny ograniczony ownership model.

## 10. Testy — najcenniejsze przypadki

Rozszerzyć istniejące `src/economy/production.test.ts` / `npcWork.test.ts` lub dodać mały test executora.

Najważniejsze testy poza prostym happy path:

- duplicate input kind nie powoduje partial consume,
- mixed stock + inventory przy braku któregokolwiek inputu pozostawia oba źródła bez zmian,
- output destination rejection pozostawia inputy bez zmian,
- dwa outputy respektują łączny limit Inventory,
- drugi producer po pierwszym nie może ponownie zużyć tego samego inputu,
- stale state jest sprawdzany tuż przed commit,
- output jest tworzony dokładnie raz.

Nie testować concurrency jako prawdziwych równoległych JS threads — w tym modelu istotna jest revalidation między osobnymi synchronicznymi execution calls.

## 11. Minimalny kierunek implementacji

Sugerowana kolejność:

1. ustalić mały `ProductionExecutor` + context/source types,
2. dodać validation/agregację inputów i destination preflight,
3. zaimplementować synchroniczny all-or-nothing commit dla stock-only,
4. dodać item-only przez ten sam executor,
5. dodać mixed transaction,
6. przełączyć `SettlementEconomy.produce()` / `commitRoleWork()` tam, gdzie nie zmienia to ownership,
7. przełączyć Huntera przez wspólny path,
8. usunąć/ograniczyć stare równoległe execution paths dopiero po zachowaniu testów.

Nie rozszerzać zakresu na Blacksmith/Carpenter, processing chains, production pressure, transport ani redesign trade.

## 12. JSDoc / preflight

Dla nowego publicznego executora i istotnych typów dodać JSDoc z `@domain settlements-npcs`, aby mechanizm był łatwy do odnalezienia przez preflight.

**Zrób git commit i push do main, rebase jeżeli trzeba**
