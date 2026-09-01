# Plan: First Processing Chain and Blacksmith Production

**Created:** 2026-09-01
**Status:** `planned` 📋
**Priority:** high · **Effort:** M
**Depends on:** settlements-npcs-015
**Domain:** `settlements-npcs`
**Subdomains:** `economy` `production` `blacksmith`
**Tags:** `processing` `production-chain` `ore` `coal`

## Goal

Wykorzystać wspólny execution flow dostarczony przez `settlements-npcs-015` do uruchomienia pierwszego rzeczywistego processing chain w ekonomii.

Pierwszy vertical slice:

```text
Miner
  ↓
iron + coal w SettlementEconomy
  ↓
Blacksmith
  ↓
iron_rod
  ↓
Blacksmith household Inventory
```

Celem jest zamknięcie jednej kompletnej transformacji od rzeczywistego surowca do rzeczywistego przetworzonego dobra. Ten mechanizm ma być podstawą dla kolejnych chainów, ale plan nie buduje jeszcze pełnego katalogu craftingu.

## Current State / Recon

Aktualny codebase ma już:

- `ProductionDef` z `inputs`, `outputs`, `itemInputs` i `itemOutputs`,
- `EconomicStock` jako właściciela settlement-level bulk resources,
- `SettlementEconomy` jako właściciela settlement stock i concrete food inventory,
- `Household.items` jako generic concrete-item storage,
- NPC `miner`, który wydobywa `iron` i odkłada je do `SettlementEconomy`,
- `coal` jako istniejący settlement-level resource,
- rolę `blacksmith` i istniejące fizyczne workplace `landmarks.blacksmith`,
- istniejący Blacksmith work flow, który obecnie służy wyłącznie do weapon maintenance,
- `iron_rod` jako istniejący `ItemKind`,
- `Inventory.applyRecipe()` jako atomiczny item recipe primitive,
- plan `015`, który ma dostarczyć wspólny production executor/orchestration z obsługą stock + inventory oraz transactional execution.

Nie znaleziono istniejącego kompletnego recipe `iron + coal → iron_rod`. `iron_rod` istnieje jako realny item, ale obecnie nie jest produkowany przez NPC economy.

## Architectural Goal

Po `015` architektura ma wyglądać:

```text
NpcAgent / scheduled Blacksmith work
        ↓
production definition
        ↓
ProductionExecutor (015)
        ↓
SettlementEconomy input source
        ↓
transactional input consumption
        ↓
Household.items output
```

Ważne granice:

- `ProductionDef` pozostaje źródłem prawdy recipe.
- `ProductionExecutor` z `015` pozostaje właścicielem execution/transaction boundary.
- `SettlementEconomy` pozostaje właścicielem `iron` i `coal`.
- `Household.items` pozostaje właścicielem konkretnego `iron_rod`.
- `NpcAgent` wybiera i wykonuje pracę, ale nie implementuje recipe ani transaction semantics.
- brak fizycznego transportu inputów w tym planie.

Dla pierwszego chainu dostępność inputów jest sprawdzana w settlement-level stock. To jest świadoma granica ekonomiczna pierwszej wersji: fizyczna logistyka pomiędzy kopalnią, storage i workplace należy do przyszłego transport/logistics work.

## 1. Define the First Processing Recipe

Dodać pierwszą konkretną `ProductionDef` dla Blacksmitha.

Initial recipe:

```text
iron × 2
coal × 1
    ↓
iron_rod × 1
```

Recipe powinno używać istniejących:

- `EconomicKind: iron`,
- `EconomicKind: coal`,
- `ItemKind: iron_rod`.

Nie dodawać nowego abstrakcyjnego `metal`, `ingot` ani równoległego stock model tylko po to, aby reprezentować ten chain.

## 2. Integrate with Blacksmith Work

Rozszerzyć istniejący Blacksmith work flow tak, aby podczas scheduled `work`:

1. sprawdził, czy recipe może zostać wykonane,
2. rozpoczął normalny workplace action,
3. po zakończeniu użył wspólnego production executor,
4. zakończył się wynikiem `success` albo `blocked`.

Istniejące weapon sharpening pozostaje osobnym działaniem Blacksmitha.

Nie tworzyć:

- `BlacksmithProductionManager`,
- osobnego production FSM,
- osobnego production tick,
- osobnej kolejki Blacksmitha.

## 3. Input Availability

Production może wykonać się tylko, gdy wszystkie wymagane inputy są dostępne.

```text
iron < 2 OR coal < 1
    ↓
blocked
    ↓
NO input mutation
NO iron_rod
```

Availability check może być tylko preview. Final execution musi ponownie zweryfikować live state przez transaction semantics z `015`.

Nie wykonywać:

- globalnego wyszukiwania rud,
- skanowania wszystkich householdów,
- magicznego pobierania itemów z dowolnego miejsca świata,
- fizycznego transportu.

## 4. Output Ownership

Po skutecznym wykonaniu:

```text
SettlementEconomy
  iron -2
  coal -1

Blacksmith Household.items
  iron_rod +1
```

Output nie może być tylko wartością zwróconą przez production helper.

Jeżeli `Household.items` nie ma miejsca na output z powodu istniejących inventory semantics, execution ma zwrócić failure bez utraty inputów.

Nie tworzyć osobnego `ProductionOutputInventory`.

## 5. Production Result Integration

Wykorzystać wynik wykonania dostarczony przez `015`.

Blacksmith work powinien rozróżniać co najmniej:

- successful processing,
- missing/insufficient input,
- unavailable output destination,
- transaction/revalidation failure.

Brak inputu nie powinien powodować wyjątkowego NPC flow ani uszkadzać normalnego schedule.

Ten plan nie tworzy jeszcze production-demand/problem/pressure integration. To należy do `017`.

## 6. Processing Selection

Jeżeli Blacksmith może mieć więcej niż jedno dostępne działanie (np. sharpening i processing), użyć istniejącego work/decision flow i deterministic priority.

Nie wprowadzać nowego utility/scoring system.

Priorytet powinien być jawny i stabilny. Dokładna kolejność pomiędzy istniejącym sharpening a processing należy dopasować do aktualnego Blacksmith flow tak, aby nie odebrać istniejącej funkcji utrzymania broni.

Jeżeli recipe nie może zostać wykonane, Blacksmith ma zachować istniejący fallback do normalnego work/idle behaviour.

## 7. Reuse Existing Mining Flow

Nie zmieniać sposobu, w jaki Miner wydobywa rudę, poza minimalną integracją konieczną do dostarczenia inputu do chainu.

Istniejący flow:

```text
ore deposit
  ↓
Miner
  ↓
NPC carried item
  ↓
stockpile
  ↓
SettlementEconomy
```

pozostaje źródłem `iron`.

Nie tworzyć drugiego NPC mining output registry.

## 8. No Physical Transport Yet

Ten plan świadomie nie implementuje:

- kopalnia → settlement transport,
- settlement storage → blacksmith physical pickup,
- carts/wagons,
- carrier/cargo,
- inter-settlement logistics.

Pierwszy processing chain operuje na istniejącym settlement economic ownership.

Powód: `015` definiuje production, a fizyczny transport ma być osobnym mechanizmem wynikającym z realnych source/destination/demand relationships. `016` powinien dostarczyć processing semantics, nie przedwcześnie tworzyć transport system.

## 9. Future Chain Compatibility

Nowe recipe powinno być zdefiniowane tak, aby późniejsze chainy mogły używać tego samego execution path.

Przyszłe przykłady:

```text
copper_ore + coal → copper
wood/logs → planks/beams
processed goods → tools/weapons
```

Nie implementować ich teraz.

W szczególności nie dodawać jeszcze:

- Carpenter production,
- tool crafting,
- weapon crafting,
- copper processing,
- leather processing,
- Mint/coins.

## 10. Interaction with Local Goods Flow

Nie rozszerzać `settlements-npcs-014` o ogólny market system.

Pierwszy chain może konsumować settlement-level stock już posiadany przez `SettlementEconomy`.

Processed `iron_rod` trafia do Blacksmith household, ale nie wymaga jeszcze ogólnego non-food local circulation. Rozszerzenie obiegu concrete non-food goods powinno wynikać z późniejszych realnych potrzeb, a nie być częścią tego planu.

## 11. Persistence and Rebuild

Wykorzystać istniejące ownership/persistence semantics.

Recipe definitions są statyczne i nie wymagają persistence.

Live stock/inventory pozostaje authoritative w:

- `SettlementEconomy`,
- `Household.items`.

Po world rebuild/reload nie może powstać dodatkowy output ani ponowne wykonanie zakończonej produkcji.

Nie dodawać osobnego production persistence state, jeżeli istniejący work/action lifecycle nie wymaga go.

## 12. Performance

Production execution pozostaje event/work-level.

Nie dodawać:

- per-frame production scans,
- global recipe scans,
- global production registry,
- workerów,
- nowych economy ticks.

Recipe selection powinno operować na małej, statycznej liście dostępnych Blacksmith recipes.

## Tests

### Recipe definition

- recipe uses existing `iron`, `coal` and `iron_rod`,
- input/output quantities are deterministic,
- recipe belongs to Blacksmith processing.

### Successful production

- sufficient `iron` + `coal` → exactly one `iron_rod`,
- exact input quantities are consumed,
- output lands in the Blacksmith household,
- no free output appears elsewhere.

### Failure

- missing iron → no mutation,
- insufficient iron → no mutation,
- missing coal → no mutation,
- insufficient output capacity → no mutation,
- invalid/stale execution → no partial commit.

### Transaction/concurrency

- two production attempts cannot consume the same input twice,
- stale availability is revalidated,
- failed transaction creates no output,
- successful transaction creates output exactly once.

### Blacksmith integration

- Blacksmith can enter processing work when recipe is available,
- Blacksmith uses the existing workplace,
- existing sharpening behaviour remains functional,
- blocked processing falls back safely to existing work/idle behaviour,
- no second production scheduler is created.

### Miner → processing

- Miner-produced `iron` reaches `SettlementEconomy`,
- Blacksmith can consume that stock,
- no player interaction is required.

### Regression

- Hunter arrow production remains unchanged,
- existing generic production tests remain valid,
- existing local goods flow remains valid,
- existing NPC work/schedule remains valid.

## Acceptance Criteria

- A complete real processing chain exists: `iron + coal → iron_rod`.
- The chain uses the production execution mechanism from `015`.
- Input quantities are consumed atomically.
- Missing input blocks production without partial mutation.
- Output is a real existing `ItemKind` in the correct household inventory.
- Blacksmith uses the existing physical workplace.
- Existing weapon sharpening remains functional.
- Miner output can become Blacksmith input.
- No physical transport system is introduced.
- No new production scheduler is introduced.
- No duplicate inventory/economy state is introduced.
- No new AI pressure/problem system is introduced.
- The player is not required for the chain to function.
- The chain remains usable by future processing recipes without a parallel mechanism.

## Out of Scope

- production demand / economic pressures (`017`),
- physical goods transport,
- inter-settlement logistics,
- carts/wagons/carriers,
- Carpenter,
- copper processing,
- leather processing,
- tool production,
- weapon production,
- Mint/coins,
- dynamic pricing,
- global market,
- production UI,
- player crafting redesign,
- new AI Need,
- dedicated Blacksmith AI,
- global production scheduler.

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

Direct implementation dependency is `015`; `014` is inherited through `015`.

## Verification

Automated:

- targeted production tests,
- Blacksmith work tests,
- inventory/stock tests,
- concurrency/transaction tests,
- NPC work regression tests,
- full test suite,
- typecheck,
- production build.

Runtime:

- run a settlement with Miner + Blacksmith,
- observe Miner producing `iron`,
- provide/observe sufficient `coal`,
- observe Blacksmith processing,
- verify `iron`/coal decrease exactly,
- verify `iron_rod` appears in the Blacksmith household,
- remove/deplete an input and verify processing blocks without partial mutation,
- repeat with multiple work cycles and verify no duplication,
- confirm the player is not needed.

Manual browser verification remains the player's responsibility.

Implementation should add JSDoc with `@domain settlements-npcs` to important new public architectural functions/classes when needed for preflight discovery.

**Zrób git commit i push do main, rebase jeżeli trzeba**