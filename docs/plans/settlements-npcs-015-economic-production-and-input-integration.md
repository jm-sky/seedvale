# Plan: Economic Production and Input Integration

**Created:** 2026-09-01  
**Status:** `planned` 📋  
**Type:** feature  
**Priority:** high · **Effort:** M  
**Depends on:** settlements-npcs-014  
**Domain:** `settlements-npcs`  
**Subdomains:** `economy` `production`  
**Tags:** `production` `inventory` `economic-stock`  
**Roadmap:** `economy-production`  

## Goal

Podłączyć istniejący `ProductionDef` do rzeczywistego stanu ekonomii tak, aby wszystkie stock-only, item-only i mixed recipes wykonywały się przez jeden wspólny, synchroniczny execution path używany przez istniejący NPC work flow.

Ten plan jest fundamentem wykonania produkcji. Nie implementuje konkretnego Blacksmitha, Carpentera ani nowych processing chains.

Docelowy przepływ:

```text
NpcAgent / istniejący work completion
        ↓
src/economy/npcWork.ts adapter
        ↓
ProductionDef + jawne source/destination refs
        ↓
validate recipe + aggregate quantities
        ↓
preflight całego live state
        ↓
synchroniczny all-or-nothing commit
        ↓
ProductionResult
```

## Verified current state

Aktualny `main` ma już dwa częściowo wspólne execution paths:

- `src/economy/production.ts` definiuje `ProductionDef` z `inputs`, `outputs`, `itemInputs`, `itemOutputs`.
- `SettlementEconomy.produce()` deleguje stock-only recipe do `EconomicStock.applyRecipe()`.
- Hunter używa `produceFirstAvailableItemRecipe()` → `Inventory.applyRecipe()` na `Household.items`.
- `src/economy/npcWork.ts` jest istniejącym adapterem między NPC work completion a mutacją ekonomii (`commitRoleWork`, `commitWoodcutterDeposit`, `commitHunterArrowProduction`).
- `NpcAgent` pozostaje ownerem decyzji/action timing; mutacja produkcji zachodzi dopiero w istniejącym completion path.

Obecne storage ownership pozostaje bez zmian:

```text
SettlementEconomy
  └─ EconomicStock         authoritative settlement bulk stock
  └─ items: Inventory     authoritative settlement concrete food storage

Household
  └─ stock                household wood only
  └─ items: Inventory     authoritative household concrete items
```

`EconomicKind` i `ItemKind` pozostają odrębnymi modelami. Nie tworzyć wspólnego „universal goods store”.

## Architectural decisions closed by this plan

### 1. Jeden executor, bez nowego production managera

Dodać mały production executor/orchestrator w warstwie `src/economy/` i sprowadzić do niego istniejące wykonanie recipes tam, gdzie zachowuje obecną semantykę.

Nie tworzyć:

- `ProductionManager`,
- globalnego production registry,
- production scheduler/tick,
- trzeciego storage/inventory,
- osobnego profession-specific transaction layer.

Executor ma być zwykłą synchroniczną operacją wywoływaną z istniejącego work completion path.

### 2. Jawny execution context zamiast wyszukiwania ownerów

Executor dostaje `ProductionDef` oraz jawne referencje do source/destination wymaganych przez recipe.

V1 contract:

- `inputs` / `outputs` używają settlement bulk stock należącego do przekazanego `SettlementEconomy`.
- `itemInputs` / `itemOutputs` używają jednego jawnie przekazanego konkretnego `Inventory` ownera, np. `Household.items`.
- brak wymaganego source/destination jest wynikiem failure; executor nie szuka alternatywy w świecie, innych householdach, traderze ani player inventory.

To jest intentional dependency contract dla downstream 016: Blacksmith może przekazać settlement economy jako stock source i własny `Household.items` jako item destination.

### 3. Transaction semantics: preflight + synchroniczny commit

Nie wprowadzać persistent reservations ani locków produkcyjnych.

JS execution path jest synchroniczny, a produkcja zachodzi na poziomie zakończenia work action. Atomicity V1 ma być zapewniona przez:

1. walidację całego recipe,
2. agregację inputów/outputów po `kind`,
3. sprawdzenie całego live state wszystkich source i destination bez mutacji,
4. dopiero potem jeden synchroniczny commit wszystkich inputów i outputów.

Nie zostawiać otwartej alternatywy „reservation/claim/rollback” jako równorzędnego projektu. Existing exchange reservations mogą być wzorcem semantyki, ale nie są production state i nie powinny być reuse'owane jako manager transakcji.

### 4. Recipe validation i agregacja są częścią executora

Przed mutacją executor musi odrzucić invalid recipe co najmniej dla:

- nie-finite amounts,
- ujemnych amounts,
- semantycznie niepoprawnych quantities dla wykonania,
- brakujących wymaganych destination.

Inputy i outputy należy agregować po kind przed availability/capacity checks. To zamyka istniejącą pułapkę `applyRecipe()`, gdzie duplicate kinds mogą przejść `hasAll()` osobno i dopiero później spowodować częściową mutację.

### 5. Output capacity należy do transaction preflight

Dla `Inventory` nie wystarczy sprawdzić każdy output osobno. Preflight musi sprawdzić, czy destination przyjmie łączny finalny zestaw outputów z uwzględnieniem aktualnych weight/size semantics.

Input consumption nie może nastąpić przed potwierdzeniem wszystkich output destinations.

`Household.items` jest dziś nieograniczone, ale executor nie może kodować tego założenia.

### 6. `ProductionResult` jest plain-data contract

Executor zwraca mały discriminated result pozwalający rozróżnić co najmniej:

- success,
- missing/insufficient input,
- invalid recipe,
- unavailable/incompatible destination,
- transaction/revalidation failure.

Brak inputu jest normalnym blocked outcome, nie wyjątkiem.

Dokładne nazwy pól/variantów można dopasować lokalnie do conventions, ale downstream 016/017 musi móc rozpoznać blocked-by-input bez parsowania logów lub wyjątków.

### 7. `src/economy/npcWork.ts` pozostaje integration seam

`commitRoleWork()`, `commitWoodcutterDeposit()` i `commitHunterArrowProduction()` są istniejącym work → economy adapter layer i pozostają punktem integracji.

Nie wywoływać produkcji z nowego globalnego update loop ani bezpośrednio z settlement managera.

`NpcAgent` nadal odpowiada za:

- wybór pracy,
- gating,
- rozpoczęcie action,
- timing/interruption.

Production executor odpowiada wyłącznie za finalną mutację recipe podczas completion.

### 8. Hunter migration bez zmiany gameplay semantics

Hunter ma zostać przełączony na wspólny executor bez zmiany:

- priority: branch przed beam,
- `1 branch → 1 arrow`,
- `1 beam → 8 arrows`,
- cap 24 jako start threshold,
- ownera: `Household.items`,
- mutation timing: on completion.

`produceFirstAvailableItemRecipe()` może zostać zachowane jako cienki compatibility adapter albo usunięte po migracji, ale nie może pozostać drugim niezależnym transaction implementation.

### 9. Existing stock-only production też ma używać wspólnego path

`SettlementEconomy.produce()` nie staje się mixed-storage orchestrator. Może pozostać cienkim compatibility wrapperem dla stock-only callers, ale transaction semantics mają docelowo pochodzić z jednego wspólnego executora.

Nie rozszerzać `SettlementEconomy` o household lookup lub item ownership.

## Persistence and lifecycle

Nie dodawać production persistence state.

Recipe definitions są statyczne; wynik zakończonej produkcji jest już zapisany w authoritative owners:

- settlement bulk/food state przez `SettlementEconomy` snapshot/persistence,
- household concrete items przez istniejący household snapshot/persistence path.

Production executor, validation state, preview i `ProductionResult` są ephemeral.

Po save/load lub in-session `WorldBundle` rebuild nie może istnieć mechanizm replay zakończonego recipe. Rebuild odtwarza owners i ich stock/items, nie queue produkcji.

## Update frequency / off-screen simulation

Production execution jest work/action-completion event, nie per-frame systemem.

Nie dodawać camera/player checks. Jeśli istniejący NPC work action dochodzi do completion off-screen lub przy niższej fidelity, ten sam executor ma wykonać tę samą recipe semantics.

Nie tworzyć osobnego „remote production tick” w 015. Downstream może wykorzystać ten sam executor z własnego existing/hybrid work path, ale reguły zużycia i outputu pozostają identyczne.

Koszt jednego execution ma być proporcjonalny do małego recipe i jawnie przekazanych ownerów, bez skanowania settlementów/inventory świata.

## Integration with professions/workplaces/buildings

015 nie definiuje nowych profesji ani workplaces.

Existing profession-specific action selection pozostaje w `NpcAgent` i istniejących helperach. 015 tylko ujednolica finalny recipe commit.

Nie konwertować fallback/no-op `FARMING_PRODUCTION`, `FISHING_PRODUCTION` ani `MINING_PRODUCTION` w sztuczną produkcję, jeśli realny profession flow już wykonuje pracę własnym mechanizmem.

## Downstream contract

### settlements-npcs-016

015 gwarantuje:

- `ProductionDef` obsługuje stock + item recipe w jednym execution,
- jawny settlement stock source i jawny item `Inventory` destination,
- all-or-nothing mixed commit,
- blocked-by-input result bez mutacji,
- brak globalnego production scheduler/managera,
- wywołanie z istniejącego NPC work completion path.

016 ma dostarczyć content i Blacksmith work integration (`iron + coal → iron_rod`), nie własny executor.

### settlements-npcs-017

015 gwarantuje jawny production outcome, z którego 017 może odczytać persistent shortage candidate. 015 nie tworzy problemów, pressure, demand ani AI state.

017 nie może wymagać, aby executor przechowywał historię failed attempts; persistent interpretation failure należy do existing AI/problem layer implementowanego później.

## Tests

Najważniejsze targeted tests:

- stock-only happy path i exact quantities,
- item-only happy path i exact quantities,
- mixed stock + item happy path,
- missing dowolnego inputu → zero mutation,
- duplicate input kind → aggregate requirement, zero partial consume,
- duplicate outputs → aggregate destination preflight,
- invalid amount (`NaN`, `Infinity`, negative) → zero mutation,
- unavailable item destination → zero mutation,
- combined Inventory outputs przekraczają weight/size capacity → zero mutation,
- second sequential producer sees live state after first commit and cannot reuse consumed input,
- output exactly once,
- Hunter priority/quantities/cap/completion timing unchanged,
- stock-only `SettlementEconomy.produce()` compatibility jeśli wrapper pozostaje,
- `commitRoleWork()` / existing profession regressions.

Nie testować „concurrency” jako parallel threads. W obecnej architekturze istotny przypadek to dwie kolejne synchroniczne próby z revalidation live state.

## Acceptance Criteria

- `ProductionDef` pozostaje authoritative recipe definition.
- Jeden shared synchronous production executor obsługuje stock-only, item-only i mixed recipes.
- Source/destination są jawne; executor nie wyszukuje goods owners w świecie.
- `SettlementEconomy` pozostaje ownerem settlement stock; `Household.items` / inne przekazane `Inventory` pozostają ownerami concrete items.
- Input/output quantities są agregowane i walidowane przed mutacją.
- Cały recipe commit jest all-or-nothing dla wszystkich uczestniczących storage owners.
- Output capacity jest sprawdzana przed input consumption.
- Failed execution nie tworzy outputu ani partial consumption.
- Result pozwala rozpoznać blocked-by-input.
- Hunter używa wspólnego execution path bez zmiany gameplay semantics.
- Existing NPC work/action completion pozostaje jedynym schedulerem produkcji NPC.
- Brak production persistence state, managera, global scan/tick i trzeciego inventory.
- Produkcja nie zależy od playera ani kamery.
- 016 może użyć kontraktu 015 bez tworzenia własnej transaction layer.
- 017 może interpretować blocked result bez zmian w transaction contract.

## Out of Scope

- Blacksmith/Carpenter content,
- konkretne processing chains,
- production demand / economic pressure / new AI Need,
- physical transport i pickup/delivery inputów,
- inter-settlement logistics,
- market/dynamic pricing/coins,
- profession staffing,
- nowe workplaces/buildings,
- player crafting redesign,
- global production scheduler,
- osobny off-screen production simulator,
- redesign `trade.ts` / `tradeCatalog.ts`.

## Dependency

```text
014 — Local Goods Circulation
        ↓
015 — Economic Production and Input Integration
        ↓
016 — First Processing Chain and Blacksmith Production
        ↓
017 — Production Demand and Economic Pressures
```

`015` reuses ownership/storage semantics established by current local-goods code, ale production musi działać niezależnie od Trader activity i przyszłego physical transport.

## Verification

Automated:

- targeted production executor tests,
- `Inventory`/`EconomicStock` regression tests,
- `npcWork` tests,
- full relevant test suite,
- typecheck,
- production build.

Runtime/manual browser verification pozostaje po stronie gracza; agent implementujący nie uruchamia browser verification.

Implementation should add JSDoc with `@domain settlements-npcs` to the shared public executor/result types when useful for preflight discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
