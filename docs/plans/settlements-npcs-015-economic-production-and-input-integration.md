# Plan: Economic Production and Input Integration

**Created:** 2026-09-01  
**Status:** `planned` 📋  
**Type:** feature  
**Priority:** high · **Effort:** M  
**Depends on:** settlements-npcs-014  
**Domain:** `settlements-npcs`  
**Subdomains:** `economy` `production`  
**Tags:** `production` `inventory` `economic-stock`

## Goal

Podłączyć istniejący `ProductionDef` do rzeczywistego stanu ekonomii tak, aby produkcja NPC konsumowała realne inputy i tworzyła realne outputy.

Docelowy przepływ:

```text
ProductionDef
    ↓
resolve input sources
    ↓
validate all inputs
    ↓
reserve / claim
    ↓
commit input consumption + outputs
    ↓
production result
```

Pierwszym celem nie jest implementacja Blacksmitha ani Carpentera. Ten plan ma dostarczyć wspólny, bezpieczny mechanizm wykonania produkcji, który późniejsze processing chains będą mogły wykorzystać.

## Current State

Recon wykazał, że codebase posiada wspólną definicję:

```text
ProductionDef
├── inputs: StockAmount[]
├── outputs: StockAmount[]
├── itemInputs?: ItemAmount[]
└── itemOutputs?: ItemAmount[]
```

Jednocześnie wykonanie produkcji jest rozdzielone:

- `SettlementEconomy.produce()` / `EconomicStock.applyRecipe()` obsługuje stock-based production.
- Hunter posiada osobny item-based flow przez `produceFirstAvailableItemRecipe()` i `Household.items`.

W rezultacie model recipe jest częściowo wspólny, ale execution nie jest jeszcze spójny.

Istniejący ownership model pozostaje ważny:

```text
SettlementEconomy
    ↓
EconomicStock / settlement-level bulk resources

Household
    ↓
Inventory / concrete item resources
```

Nie należy scalać tych storage models w jeden nowy magazyn.

## Architectural Goal

Wprowadzić jeden **production execution/orchestration flow**, ale nie jedną klasę storage.

Preferowany model:

```text
ProductionExecutor
    │
    ├── EconomicStock adapter
    └── Inventory adapter
```

Executor odpowiada za orkiestrację recipe i transaction boundary, natomiast adaptery pozostają właścicielami konkretnych storage semantics.

Nie tworzyć trzeciego rodzaju inventory ani równoległego systemu produkcji.

### Transaction boundary

Recipe ma mieć **transactional outcome**: nie może zakończyć się trwałym częściowym zużyciem inputów ani outputem bez skutecznego input commitu.

Preferowana kolejność:

```text
validate all inputs
        ↓
reserve / claim inputs
        ↓
commit consumption + outputs
```

Nie zakładać konkretnego mechanizmu implementacji. Jeżeli istniejące storage helpers wspierają claim/commit, należy je wykorzystać. Jeżeli nie, zaprojektować minimalny mechanizm zapewniający brak partial commit, bez kopiowania całego inventory.

## 1. Unify Production Execution

Zidentyfikować istniejące production call sites i sprowadzić je do wspólnego execution path.

W szczególności:

- zachować `ProductionDef` jako źródło prawdy,
- wykorzystać istniejący item-production flow Huntera jako materiał do uogólnienia,
- ograniczyć/wyeliminować profesyjne wyjątki tylko tam, gdzie wspólny executor rzeczywiście zachowuje ich semantykę,
- nie przepisywać działających mechanizmów bez potrzeby.

`commitRoleWork()` pozostaje częścią istniejącego NPC work flow; nie tworzyć nowego production scheduler.

## 2. Resolve Real Input Sources

Każdy input recipe musi mieć określone źródło zgodne z istniejącym ownership model.

Dla `StockAmount` źródłem może być `EconomicStock`.

Dla `ItemAmount` źródłem może być konkretne `Inventory`.

Production execution nie powinien automatycznie kopiować inputów do tymczasowego magazynu ani samodzielnie wyszukiwać dóbr w świecie.

**Production nie jest logistyką.**

Jeżeli wymagany input nie znajduje się w właściwym source, production pozostaje zablokowane. Udostępnienie brakującego inputu przez Trader/local goods flow/physical transport należy do innych systemów.

## 3. Validate All Inputs

Przed zmianą stanu należy zweryfikować wszystkie wymagane inputy.

Przykład:

```text
wood × 2
coal × 1
branch × 1
```

Produkcja może rozpocząć się tylko wtedy, gdy wszystkie trzy wymagania są spełnione.

Nie dopuszczać do partial recipe:

```text
wood available
coal missing
    ↓
NO wood consumption
NO output
```

Walidacja powinna uwzględniać rzeczywisty live state, ponieważ stock może zostać zmieniony przez innego aktora od czasu wyboru recipe.

## 4. Transactional Input Consumption

Po pozytywnej walidacji inputy muszą zostać zarezerwowane/claimed w sposób uniemożliwiający równoczesnej produkcji wykorzystanie tego samego stocku.

Szczególnie ważny jest mixed recipe:

```text
EconomicStock input
        +
Inventory input
        ↓
one production transaction
        ↓
output
```

Jeżeli jeden z input claims nie może zostać skutecznie wykonany, cała operacja ma zakończyć się bez trwałego częściowego zużycia.

Implementacja może wykorzystać pre-validation, reservation/claim, rollback lub inny istniejący mechanizm, o ile gwarantuje wymagany transactional outcome.

Nie zakładać, że sprawdzenie `count()` samo w sobie jest wystarczające.

## 5. Create Real Outputs

Po skutecznym commit inputów output musi zostać zapisany w prawidłowym ownerze.

```text
itemOutputs
    ↓
Household.items
```

lub:

```text
outputs
    ↓
SettlementEconomy / EconomicStock
```

Dokładny destination należy określić na podstawie istniejącego producer/work ownership, a nie tworzyć nowego production inventory.

Output nie może pozostać wyłącznie wartością zwróconą przez helper.

## 6. Production Result

Execution powinno zwracać jawny, mały wynik operacji pozwalający odróżnić co najmniej:

- success,
- blocked / missing or insufficient input,
- invalid recipe,
- unavailable output destination,
- transaction/revalidation failure.

Dokładny typ i nazwy należy dopasować do istniejących conventions.

Result ma być użyteczny dla istniejącego work/decision flow oraz przyszłej diagnostyki, ale nie definiuje jeszcze AI pressure ani nowych Needów.

## 7. NPC Work Integration

Istniejący flow:

```text
NPC work
    ↓
production selection
    ↓
production execution
    ↓
success / blocked
```

powinien pozostać jedyną ścieżką uruchamiania produkcji przez NPC.

Brak inputów powinien skutkować czytelnym wynikiem z execution, który istniejący work/decision flow może obsłużyć bez specjalnego production managera.

Nie projektować w tym planie nowych strategii AI związanych z pozyskiwaniem brakujących inputów.

## 8. Hunter Migration

Hunter jest pierwszym istniejącym przykładem concrete item production.

Zweryfikować i, jeżeli wspólny executor zachowuje obecną semantykę, przenieść:

```text
branch / beam
    ↓
arrow production
    ↓
Household.items
```

do wspólnego execution path.

Nie dodawać Hunterowi specjalnej integracji ekonomicznej.

Jego obecne recipe, ograniczenia i outputy muszą pozostać bez zmian.

## 9. Minimal Production Fixtures

Do testów przygotować małe, deterministyczne recipes reprezentujące oba istniejące storage models.

### Economic stock

```text
wood × 2 → output × 1
```

### Inventory

```text
branch × 1 → arrow × 1
```

### Mixed recipe

```text
EconomicStock input
+
Inventory input
→ concrete output
```

Mixed recipe jest istotnym testem granicy transaction boundary i ownership.

Nie dodawać tych recipes do gameplay catalogue, jeżeli istniejący system test fixtures może je zdefiniować lokalnie.

## 10. Failure and Concurrency

Testować:

- input consumed by another actor between selection and execution,
- partial availability,
- concurrent production against same source,
- invalid recipe,
- unavailable destination,
- interrupted production.

Nie może wystąpić:

```text
partial input consumption
+
free output
```

ani:

```text
double consumption
+
duplicated output
```

Wykorzystać istniejące claim/revalidation semantics tam, gdzie są już dostępne.

## 11. Performance

Production execution jest operacją event/work-level, nie per-frame.

Nie tworzyć globalnego production scan.

Nie dodawać globalnego indeksu produkcji ani rynku.

Input lookup powinien korzystać z już znanych ownerów/source references, a nie wykonywać globalne wyszukiwanie wszystkich inventory przy każdej próbie produkcji.

## Tests

### Production execution

- all inputs available → success,
- missing input → no state change,
- insufficient quantity → no state change,
- invalid recipe → no state change,
- correct output quantity.

### EconomicStock

- stock input decreases exactly,
- stock output increases exactly,
- no mutation on failed execution.

### Inventory

- item input decreases exactly,
- item output increases exactly,
- no mutation on failed execution.

### Mixed recipe

- both source types available → success,
- either source unavailable → complete failure,
- no partial mutation.

### Concurrency

- two producers cannot consume the same stock twice,
- stale availability is revalidated,
- output is created exactly once.

### Hunter

- existing arrow production still works,
- recipe and quantities are unchanged,
- Hunter uses shared execution path where practical.

### NPC work

- successful production completes normally,
- missing input produces a meaningful blocked/result state,
- existing NPC work loop remains stable.

## Acceptance Criteria

- `ProductionDef` remains the authoritative recipe definition.
- NPC production consumes real inputs.
- All inputs are required for successful execution.
- Production has a transactional outcome with no persistent partial commit.
- Failed recipes create no output.
- Successful recipes create real output in the correct owner.
- `EconomicStock` and `Inventory` retain separate ownership/semantics while participating in one production execution flow.
- Existing Hunter production continues to work.
- Production returns a meaningful result for success/failure.
- Production never performs physical/world logistics to obtain missing inputs.
- NPC work invokes production without a parallel scheduler.
- No `ProductionDemand`, new AI Need or production-pressure system is introduced.
- No third production inventory or duplicate economy state is introduced.
- The player is not required for production to function.

## Out of Scope

- Blacksmith implementation,
- Carpenter implementation,
- new processing chains,
- production pressure / new AI Needs,
- dynamic pricing,
- coins,
- market system,
- inter-settlement production,
- long-distance transport,
- physical delivery of production inputs,
- new physical workplaces,
- global production scheduler,
- redesign of `trade.ts` / `tradeCatalog.ts`.

## Dependency

```text
014 — Local Goods Circulation
```

Plan 015 may reuse goods/storage semantics established by 014 where relevant, but production must remain functional independently of Trader activity.

The future physical transport system is not a dependency.

## Verification

Automated:

- targeted production tests,
- inventory/stock tests,
- NPC work tests,
- full test suite,
- typecheck,
- production build.

Runtime:

- run a deterministic settlement with an existing producer,
- verify successful production with available inputs,
- verify blocked production with missing inputs,
- observe exact stock/inventory changes,
- verify production continues without player interaction.

Manual browser verification remains the player's responsibility.

Implementation should add JSDoc with `@domain settlements-npcs` to important new public architectural functions/classes when needed for preflight discovery.

**Zrób git commit i push do main, rebase jeżeli trzeba**
