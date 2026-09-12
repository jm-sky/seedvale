# Plan: Household wood authority and repair correctness

**Created:** 2026-09-12  
**Status:** `implemented` ✅  
**Type:** fix  
**Priority:** high · **Effort:** M  
**Depends on:** ~~settlements-007~~, ~~settlements-npcs-015~~, ~~settlements-npcs-032~~  
**Domain:** `settlements-npcs`  
**Subdomains:** `household` `economy` `logistics`  
**Tags:** `wood` `inventory` `repair` `production` `persistence`  
**Roadmap:** -  
**Model:** Opus, Sonnet  

## Cel

Usunąć jeden wspólny błąd ownershipu materiałów, który dziś rozdziela household wood między dwa niezgodne modele i przez to psuje zarówno produkcję, jak i repair arbitration.

Po wdrożeniu:

1. `Household.items` jest **jedynym authoritative stanem drewna należącego do household** — jako konkretne `branch` / `beam`.
2. `SettlementEconomy.wood` pozostaje istniejącym **bulk aggregate osady**; konwersja household item ↔ settlement bulk występuje tylko na jawnej granicy transferu i zawsze zachowuje ilość według istniejącej wartości `branch = 1`, `beam = 2`.
3. hunter arrow production i structure repair konsumują te same realne itemy, które faktycznie trafiły do household.
4. `repairStructure` dostaje dodatni pressure tylko wtedy, gdy naprawa jest realnie możliwa albo istnieje już rozpoczęty repair episode.
5. stale/race pomiędzy scoringiem a `beginRepairStructure()` nie zostawia NPC bez akcji i nie tworzy decision livelock.

Nie tworzyć nowego material/inventory managera ani równoległego crafting systemu.

## Recon — aktualny source of truth

### Household wood jest obecnie rozdwojone

`src/settlement/household.ts`:

- `HouseholdResourceKind = 'food' | 'wood'`;
- `HOUSEHOLD_STOCK_KINDS = ['wood']` — po wcześniejszej migracji food do itemów scalar stock pozostał praktycznie tylko dla wood;
- `Household.stock: EconomicStock` przechowuje scalar wood;
- `Household.items: Inventory` jest już genericznym, persisted storage konkretnego `ItemKind`;
- `has()` / `shortage()` / `shouldAcquire()` / `surplus()` dla wood czytają `stock`;
- `deposit('wood', ...)` zapisuje scalar i overflow kieruje do `SettlementEconomy`.

`src/settlement/householdResourceTransfer.ts` dodatkowo potwierdza rozjazd: player przekazuje realny `branch`/`beam`, ale `transferResourceToHousehold()` usuwa item, liczy `householdWoodValue()` i zapisuje wyłącznie scalar przez `household.deposit('wood', ...)`. To niszczy tożsamość materiału dokładnie na wejściu do household.

### Realne drzewo już produkuje konkretne materiały

`src/world/treeLifecycle.ts` / `src/world/treeHarvest.ts` są authoritative tree-harvest path dla playera i NPC:

- podstawowy yield to `branch`;
- finalne bucking może zwrócić dodatkowo `beam`;
- `harvestFully()` zachowuje oba rodzaje w `yield` + `bonusYield`.

Player path w `src/app/actions/groundActions.ts` już przekazuje oba yieldy dalej jako itemy.

NPC path w `src/ai/NpcAgent.ts` robi inaczej: po sukcesie `harvestWorldTreeFully()` ignoruje zwrócone `branch` / `beam`, ustawia `harvestedWood = WOOD_HARVEST_AMOUNT`, a później `depositWoodHarvest()` zapisuje scalar. To jest główny writer H4.

Dla największego obecnego full-felling batchu kod może zwrócić do 11 `branch` + 4 `beam`. Przy istniejącej wartości `fuelValue(branch)=1`, `fuelValue(beam)=2` daje to 19 branch-equivalent units.

### Konsumenci już oczekują realnych itemów

Hunter:

- `src/economy/production.ts`: `1 branch → 1 arrow`, `1 beam → 8 arrows`;
- `src/economy/npcWork.ts::commitHunterArrowProduction()` używa item recipe executor;
- `src/ai/npcProfessionWork.ts` gate'uje hunter work na `household.items.has('branch'...)` / `has('beam'...)`.

Structure repair:

- `src/settlement/structureCondition.ts` ma canonical `MaterialRequirement[]`;
- residential full repair wymaga 4 `beam` + 4 `branch`;
- `beginStructureRepair()` już ma actor-neutral adapter `hasMaterial` / `consumeMaterial`;
- `NpcAgent.beginRepairStructure()` poprawnie podpina do niego `Household.items`.

Nie ma więc potrzeby tworzenia nowego material resolvera dla repair. Problem leży po stronie household wood ownership/writers oraz pressure eligibility.

### Repair pressure może kłamać o wykonalności

`src/settlement/structureRepairCandidates.ts`:

- `NpcStructureRepairHooks.pressure(nowDays)` liczy pressure z condition;
- rozpoczęty repair dostaje `STRUCTURE_REPAIR_RESUME_PRESSURE`;
- przed rozpoczęciem pressure nie sprawdza quote ani materiałów.

`src/ai/NpcAgent.ts`:

- `choose()` dodaje `repairStructure` do tej samej arbitration co inne pressures;
- gdy wygra, zawsze wywołuje `beginRepairStructure()`;
- `beginRepairStructure()` może dostać z hooka `blocked` i wtedy wraca bez `startAction()`;
- `choose()` mimo to kończy iteration przez `break`, więc nie uruchamia zwykłego fallbacku `beginIdle(...)`.

To potwierdza H5 na aktualnym `main`.

## Decyzja architektoniczna: authoritative household wood = konkretne itemy

### Authority

Usunąć scalar `wood` jako osobny stan household.

Docelowo:

```text
Household.items
  ├─ branch
  └─ beam
        ↓
  derived wood value
        ↓
shortage / target / surplus / presentation
```

`HouseholdResourceKind = 'food' | 'wood'` może pozostać jako **język potrzeb/logistyki**, ale `wood` nie może już oznaczać osobnego persisted countera.

`Household.stock` należy usunąć z publicznego/runtime contractu household, jeżeli po tej migracji nie przechowuje żadnego realnego resource kind. Nie zostawiać pustego `EconomicStock` tylko dla kompatybilności.

### Jedna semantyka ilościowa

Reuse istniejącego katalogu/fuel semantics:

- `branch` = 1 household wood unit,
- `beam` = 2 household wood units.

To jest **derived aggregate view**, nie drugi stan.

Dodać na ownerze household małe API zamiast bezpośrednich odczytów inventory w kodzie potrzeb/presentation, np.:

- `woodCount()` — suma wartości konkretnych `branch`/`beam`;
- `depositWood(itemKind, count, economy, simTime)` — przechowuje konkretne itemy;
- `has/shortage/shouldAcquire/surplus('wood')` — liczone z itemów.

Nazwy mogą zostać dopasowane do istniejącego stylu, ale nie wolno pozostawić drugiego mutable wood countera.

Ważne helpery/publiczne funkcje material ownership powinny dostać zwięzły JSDoc z `@domain settlements-npcs`, jeśli poprawia to preflight discovery.

### Household wood capacity

Obecne scalar `capacity = 5` nie jest kompatybilne z exact materials:

- repair przy progu 50 może wymagać już ok. 2 `beam` + 2 `branch` = 6 units;
- pełny residential repair to 4 `beam` + 4 `branch` = 12 units;
- pełny obecny tree harvest może dać do 19 units.

Ustawić household wood capacity na **20 branch-equivalent units**, zachowując obecne `minimum = 1` i `target = 3`.

20 pozwala przechować jeden maksymalny obecny full-felling batch bez sztucznego rozcinania materiałów i mieści pełny repair set, a kolejne nadwyżki nadal mogą trafiać do settlement economy jak dziś.

Capacity musi być sprawdzane na **całych itemach**. `beam` nie może zostać podzielony na „1 unit w household + 1 unit overflow”. Jeżeli cały item nie mieści się w pozostałym limicie, cały item przechodzi przez overflow boundary.

## Jawna granica Household.items ↔ SettlementEconomy.wood

`SettlementEconomy.wood` pozostaje scalarem. Nie itemizować całej osady w tym planie.

### Household → settlement

Przy overflow / trader transfer:

```text
branch item removed → +1 SettlementEconomy.wood
beam item removed   → +2 SettlementEconomy.wood
```

Mutacja obu stron musi być jedną logiczną transakcją. Nie wolno najpierw skasować itemu i dopiero później próbować dodać bulk resource przez losowy/warunkowy path.

### Settlement → household

Bulk settlement wood nie zawiera informacji, czy wcześniej było branch czy beam. Nie można więc odtwarzać beamów.

Przy `economyWithdraw('wood')` materializować deterministycznie:

```text
1 SettlementEconomy.wood → 1 branch
```

Najpierw policzyć ile branchy household może realnie przyjąć, potem atomowo zmniejszyć settlement stock dokładnie o tę liczbę i dodać tyle samo `branch` do household. Nigdy nie mintować `beam` z bulk wood.

### Household → household

Przenosić realne `branch`/`beam`, nie scalar.

Reuse istniejącego bounded same-settlement exchange i istniejącego NPC carrier/action chain. Selection musi być deterministyczny i operować na całych itemach. Preferować `branch` przed `beam`, ponieważ branch ma unit value 1 i pozwala zachować target bez rozbijania belki; beam jest używany dopiero gdy może zostać przeniesiony w całości bez zejścia źródła poniżej reserve target.

`Household.surplus('wood')` i realny claim muszą używać tej samej reguły. Nie może istnieć sytuacja `surplus() > 0`, ale żaden cały item nie jest legalnie claimowalny (np. household ma tylko 2 beams = value 4 przy target 3).

## Scope implementacji

### 1. Zmienić household owner, bez równoległego stanu

`src/settlement/household.ts`:

- przenieść wood authority do `items`;
- initial wood seedować jako 2/3 `branch`, zachowując dzisiejszą deterministyczną wielkość startowego reserve;
- usunąć runtime/persisted dependence na `stock.wood`;
- dodać derived `woodCount()` i oprzeć na nim `has`, `shortage`, `shouldAcquire`, `surplus`;
- zastąpić scalar `deposit('wood')` item-preserving `depositWood(...)`;
- capacity/overflow liczyć według item value, bez splitowania itemu;
- history nadal rejestrować `wood.deposited` / shortage crossing; amount pozostaje resource-equivalent, aby nie zmieniać semantyki istniejących diagnostics.

Nie rozszerzać household o nowe surowce ani generic material registry.

### 2. Zachować exact tree yield w NPC wood gathering

`src/ai/NpcAgent.ts` + `src/ai/npcLogistics.ts`:

- usunąć użycie `WOOD_HARVEST_AMOUNT` jako zastępstwa wyniku realnego harvestu w household path;
- po `harvestWorldTreeFully()` zachować zwrócone `yield` i `bonusYield`;
- deposit step ma przekazać konkretne `branch`/`beam` do `Household.items` przez household API;
- przy braku household istniejący direct settlement fallback może nadal używać `commitWoodcutterDeposit()` — nie przebudowywać w tym planie całego settlement production modelu.

Nie zmieniać algorytmu tree lifecycle ani player harvest.

Ten plan nie rozwiązuje ogólnego problemu trwałości transient cargo po każdym interruption. Nie wolno jednak ponownie zamieniać konkretnego harvestu w scalar household wood. Zachować istniejący chop→deposit action lifecycle i ograniczyć zmianę do ownership/material identity.

### 3. Naprawić player → household transfer

`src/settlement/householdResourceTransfer.ts`:

- player oddający `branch` ma zwiększyć `household.items.branch`;
- player oddający `beam` ma zwiększyć `household.items.beam`;
- overflow może dopiero na household→settlement boundary zamienić item na scalar value;
- UI/result nadal może pokazywać `resourceAmount` w branch-equivalent units, ale source item identity musi zostać zachowana w household.

### 4. Naprawić local exchange / trader wood flows

`src/economy/localExchange.ts`, `src/ai/npcLogistics.ts`, `src/ai/npcProfessionWork.ts`, `src/settlement/householdExchange.ts`:

- usunąć household wood claim oparty na `household.stock.remove()`;
- household→household przenosi realne itemy i re-validuje live source przy pickup;
- settlement→household tworzy wyłącznie branch 1:1 z faktycznie odjętego bulk wood;
- trader household→settlement konsumuje realne wood items i kredytuje ich derived value;
- source discovery nadal reuses `Household.surplus('wood')`, ale surplus musi oznaczać rzeczywiście claimowalne whole items.

Nie tworzyć `TradeManager`, nowego transport subsystemu ani wood-only inventory.

### 5. Hunter compatibility jako regression contract

Nie zmieniać recipes ani production executor.

Po poprawieniu writers hunter ma automatycznie korzystać z authority:

- branch jest nadal wybierany przed beam;
- `1 branch → 1 arrow`;
- `1 beam → 8 arrows`;
- brak materiału = brak produkcji/outputu.

Jeżeli implementacja wymaga zmiany hunter recipe, oznacza to, że household material boundary została zaprojektowana źle.

### 6. Gate repair pressure na realną wykonalność

`src/settlement/structureRepairCandidates.ts`:

Rozszerzyć istniejący read-only hook pressure tak, aby korzystał z tego samego `StructureRepairQuote.materials` i tego samego actor material adaptera co start repair.

Docelowa semantyka:

```text
active repair episode
→ STRUCTURE_REPAIR_RESUME_PRESSURE

brak active repair
→ quoteStructureRepair(...)
→ brak quote / brak choć jednego required itemu
   → pressure = 0
→ wszystkie required itemy dostępne
   → structureRepairPressureFromCondition(...)
```

Nie duplikować cost constants ani recipe logic w `NpcAgent`.

`NpcAgent.structureRepairPressureCandidate()` ma przekazać read-only callback oparty na aktualnym `household.items.has(...)`. Household-less NPC nie może emitować startable repair pressure.

Rozpoczęty episode **nie wymaga ponownego posiadania materiałów** — materiały zostały już zużyte atomowo przy `beginStructureRepair()`.

### 7. Dodać defensywny fallback przy stale dispatch

Feasibility gate rozwiązuje normalny przypadek, ale stan może zmienić się między scoringiem a begin (inny actor zużyje materiał).

`NpcAgent.beginRepairStructure()` powinno zwracać informację, czy rzeczywiście uruchomiło action (`startAction`).

W branchu `outcome === 'repairStructure'`:

- jeśli repair start/resume uruchomił action → normalnie zakończyć dispatch;
- jeśli nie → przejść do **tego samego zwykłego idle/schedule fallbacku**, którego `choose()` używa, gdy nic nie wygrało (`beginIdle(resolveIdleActivity(...))`).

Nie dodawać globalnego „phase changed?” hacka do całej arbitration. To jest lokalny defensive fallback przy source, który potrafi legalnie stracić eligibility między score a commit.

## Persistence i migracja save

To jest zmiana persisted representation/semantics household, więc wymaga normalnej migracji.

Aktualny recon baseline: `CURRENT_SAVE_VERSION = 38`. Przy implementacji sprawdzić numer ponownie; jeśli nadal 38:

- bump do 39;
- dodać dokładnie jeden `38 → 39` step w `SAVE_MIGRATIONS`;
- zaktualizować current-schema validator.

Migracja każdego legacy `HouseholdSnapshot`:

1. odczytać `stock.wood` (brak traktować jako 0);
2. zachować istniejący `items` wraz z `instances` i `foodBatches`;
3. dodać legacy scalar wood 1:1 do `items.counts.branch`;
4. zachować wszystkie istniejące `branch` i `beam` — niczego nie nadpisywać;
5. usunąć legacy `stock` z current snapshot representation.

Nie clampować migrowanej ilości do nowej household capacity — migracja nie może niszczyć istniejącego save state. Capacity obowiązuje przyszłe deposits.

Docelowy `HouseholdSnapshot` powinien mieć `items` jako bieżący authoritative persisted storage; usunąć `stock` z current schema. `createHousehold()` nie może po restore odtworzyć drugiego scalar countera.

`src/app/saveState.ts` nie powinien potrzebować nowego parallel field: nadal serializuje household registry snapshot.

## Derived readers / presentation do przełączenia

Po usunięciu scalar authority znaleźć i przełączyć wszystkie realne direct readers `household.stock.query('wood')` na owner API, w szczególności:

- `src/ai/NpcAgent.ts` — inspection/debug text;
- `src/settlement/householdResourceTransfer.ts` — transfer summary;
- `src/interaction/resolveInteraction.ts` — household storage dialog;
- `src/settlement/createSettlement.ts` — household wood pile visual sync.

Wood pile pozostaje derived presentation i może nadal dostawać jedną liczbę `woodCount()`; nie musi renderować osobno branch/beam w tym planie.

## Testy

### Household / conservation

Rozszerzyć `src/settlement/household.test.ts` i `src/settlement/householdResourceTransfer.test.ts`:

- nowe household ma startowe 2/3 branches zamiast scalar wood;
- `woodCount()` poprawnie liczy branch=1, beam=2;
- `shortage`, `shouldAcquire`, `surplus` bazują na item authority;
- pełny repair set 4 beam + 4 branch mieści się w household;
- maksymalny obecny tree batch 11 branch + 4 beam (=19 units) mieści się w pustym household;
- capacity=20 nie rozcina beam;
- overflow zachowuje conservation item-value + settlement bulk;
- source z 2 beams przy target=3 nie zgłasza fałszywego claimowalnego surplusu;
- player transfer zachowuje dokładny item kind.

### Logistics / production

Rozszerzyć odpowiednie testy `npcLogistics`, `localExchange`, `npcProfessionWork` / `npcWork`:

- NPC tree harvest przekazuje realne branch/beam zamiast `WOOD_HARVEST_AMOUNT`;
- household exchange przenosi konkretne itemy;
- settlement withdraw 1 wood → 1 branch, nigdy beam;
- trader household→settlement usuwa item i dodaje poprawną wartość scalar;
- hunter regressions pozostają 1→1 / 1→8 i branch-first.

### Repair correctness

Rozszerzyć `src/settlement/structureCondition.test.ts` oraz test seam dla `NpcStructureRepairHooks` / `NpcAgent`:

- condition below threshold + brak branch/beam → repair pressure 0;
- brakuje tylko jednego required kind → pressure 0;
- pełny quote dostępny → normalny non-zero pressure;
- active repair → resume pressure mimo pustego household, bez ponownego zużywania materiałów;
- `beginRepairStructure()` zużywa materiały dokładnie raz;
- materiał zabrany pomiędzy scoringiem a begin → repair dispatch nie startuje repair, ale NPC uruchamia zwykły idle/schedule fallback zamiast pozostać w `choose`;
- kolejna decision iteration nie wybiera tego samego niewykonalnego repair.

### Persistence

Dodać migration/validation test:

```text
legacy stock.wood = 4
legacy items: branch=2, beam=1
→ current items: branch=6, beam=1
→ brak household stock field
```

Dodatkowo round-trip current save musi zachować exact branch/beam i nie odtwarzać scalar wood.

## Edge cases

- Household ma beam, ale pozostały capacity-room to tylko 1 unit → cały beam idzie overflow, nigdy split.
- Household ma wood value > target, ale tylko niepodzielne beams i usunięcie jednego zeszłoby poniżej target → `surplus('wood') = 0` dla exchange purposes.
- Repair ma active episode i household po starcie stracił wszystkie wood items → praca trwa dalej; materiałów nie pobiera się drugi raz.
- Quote może zmienić się wraz z condition przed startem → pressure i begin zawsze liczą z live state, bez cache kosztu.
- Concurrent actor może zabrać materiał po pressure evaluation → begin nadal jest authoritative commit gate; fallback obsługuje porażkę.
- Legacy save może już mieć branch/beam z innych źródeł → migracja dodaje scalar jako branches, nie zastępuje istniejących itemów.
- Household capacity nie jest używana jako loader validation limit — stary save może legalnie mieć więcej.

## Wpływ na istniejące plany

### `settlements-007-systemic-settlement-structure-condition-and-shared-repair`

Nie przebudowywać repair lifecycle. Ten plan naprawia jego material eligibility/dispatch i zapewnia, że jego istniejące `Household.items` source faktycznie jest zasilane przez wood flow.

### `settlements-npcs-015-economic-production-and-input-integration`

Nie zmieniać shared production executor. Hunter recipes są regression contractem dla nowej household authority.

### `settlements-npcs-016-first-processing-chain-and-blacksmith-production`

Dodać dependency na `settlements-npcs-034`. Plan 016 zapisuje konkretne outputs do `Household.items`; powinien wejść dopiero po usunięciu dual wood semantics, żeby kolejne production chains nie utrwalały błędnego ownership modelu.

### `settlements-npcs-017-production-demand-and-economic-pressures`

Dodać dependency na `settlements-npcs-034` obok 016. Demand/pressure nie może być budowany na niejednoznacznym household material state.

Nie implementować tutaj blacksmith chain ani production-demand pressure.

## Czego NIE zmieniać

- nie tworzyć pełnego crafting systemu;
- nie implementować blacksmith production z planu 016;
- nie implementować production demand z planu 017;
- nie itemizować całego `SettlementEconomy.wood`;
- nie tworzyć nowego `MaterialManager`, `WoodInventory`, `RepairManager` ani drugiego recipe executor;
- nie zmieniać player construction material systemu w `items/constructionMaterials.ts` poza ewentualnym reuse istniejących typów;
- nie zmieniać tree generation / tree lifecycle yields;
- nie rozszerzać weather damage / `world-026`;
- nie robić globalnego refactoru `NpcAgent` arbitration;
- nie dodawać questów ani UI feature poza koniecznym przełączeniem istniejących wood readouts;
- nie uruchamiać browser verification ani `pnpm docs:sync`.

## Oczekiwane pliki implementacyjne

Najbardziej prawdopodobny scope:

- `src/settlement/household.ts`
- `src/settlement/householdResourceTransfer.ts`
- `src/economy/localExchange.ts`
- `src/ai/npcLogistics.ts`
- `src/ai/npcProfessionWork.ts`
- `src/ai/NpcAgent.ts`
- `src/settlement/structureRepairCandidates.ts`
- `src/persistence/saveData.ts`
- `src/settlement/createSettlement.ts`
- `src/interaction/resolveInteraction.ts`
- odpowiednie testy tych modułów
- state docs tylko tam, gdzie implementacja realnie zmieni opis current state.

`src/settlement/structureCondition.ts`, `src/economy/production.ts`, `src/economy/npcWork.ts`, `src/world/treeLifecycle.ts` i `src/world/treeHarvest.ts` są przede wszystkim contracts/reuse points; zmieniać je tylko, jeżeli implementacja wymaga małego API seam, nie przepisania logiki.

## Verification

Automatycznie:

- targeted tests household / transfer / local exchange / NPC logistics / production / repair / persistence;
- `pnpm typecheck`;
- `pnpm test` według normalnego project workflow, jeśli koszt jest akceptowalny.

Manual/browser verification wykonuje użytkownik. AI nie uruchamia browser verification.

> **Zrób git commit i push do main, rebase jeżeli trzeba**