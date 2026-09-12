# Plan: First Processing Chain and Blacksmith Production

**Created:** 2026-09-01  
**Status:** `planned` 📋  
**Type:** feature  
**Priority:** high · **Effort:** M  
**Depends on:** ~~settlements-npcs-015~~, settlements-npcs-034  
**Domain:** `settlements-npcs`  
**Subdomains:** `economy` `production` `blacksmith`  
**Tags:** `processing` `production-chain` `ore` `coal`  
**Roadmap:** `economy-production`  

## Goal

Dostarczyć pierwszy konkretny realny processing chain na wspólnym mechanizmie `settlements-npcs-015`, bez tworzenia blacksmith-only production subsystemu.

Finalny vertical slice:

```text
ResourceDeposits
  ↓
existing Miner work (`planOreGathering`)
  ↓
SettlementEconomy bulk stock
  iron × 2 + coal × 1
  ↓
existing Blacksmith scheduled work (`planBlacksmithWork`)
  ↓
shared production executor from 015
  ↓
Blacksmith Household.items
  iron_rod × 1
```

`016` ma udowodnić, że wspólny executor z `015` działa w realnym NPC profession flow i z realnymi authoritative owners. Nie projektuje nowej warstwy produkcji.

## Verified current-code facts

Aktualny `main` ma już wszystkie content kinds potrzebne do chainu:

- `EconomicKind`: `iron`, `coal` w `src/economy/kinds.ts`;
- `MineableOre`: `iron`, `coal` w `src/terrain/depositMining.ts`;
- `ORE_ITEM` i `oreEconomicKind()` mapują oba ore types przez identyczne literal names: carried `ItemKind` → settlement `EconomicKind`, bez nowej conversion table;
- `ItemKind`: `iron_rod` w `src/items/items.ts`;
- `Household.items` jest generic concrete-item `Inventory`, więc może autorytatywnie przechowywać `iron_rod`;
- `Role` zawiera `blacksmith` i `miner`;
- `planOreGathering()` w `src/ai/npcProfessionWork.ts` wykonuje realne mine → carry → stockpile deposit i dopiero wtedy `economy.add(oreEconomicKind(...), minedCount, simTime)`;
- `planBlacksmithWork()` już istnieje i dziś obsługuje sharpening;
- `workplaceFor()` identyfikuje Blacksmith workplace jako household-owned `landmarks.blacksmithWorkplaces` entry po `familyIndex/homeIndex`, nie settlement-wide `landmarks.blacksmith`;
- `SettlementEconomy` oraz `Household.items` mają istniejące snapshot/save ownership; 016 nie potrzebuje `ProductionState` w persistence.

Nie zakładać, że `settlements-npcs-015` jest już zaimplementowany. Jego finalne implementation notes są dependency contractem.

## Dependency contract required from 015

Przed implementacją 016 `015` musi dostarczać jeden shared synchronous production executor z następującym kontraktem:

- authoritative recipe type pozostaje `ProductionDef`;
- stock inputs/outputs używają jawnie przekazanego `SettlementEconomy`;
- item inputs/outputs używają jawnie przekazanego `Inventory`;
- executor waliduje i agreguje quantities przed mutacją;
- cały mixed commit jest all-or-nothing;
- output capacity jest preflightowana przed consumption;
- failed execution nie mutuje żadnego ownera;
- rezultat rozróżnia co najmniej success, blocked/missing input, invalid recipe, unavailable destination/context i transaction/revalidation failure;
- blocked-by-input jest stabilnym plain-data outcome, który downstream `017` może obserwować;
- executor jest stateless i nie posiada scheduler/tick/persistent reservations;
- istniejący NPC work-completion path pozostaje schedulerem produkcji;
- `src/economy/npcWork.ts` pozostaje work-completion → economy seam.

Jeżeli implementacja 015 nie spełnia tego kontraktu, 016 jest realnie blocked i nie może lokalnie odtwarzać brakującej transaction layer.

## 1. Authoritative recipe definition

Dodać jedną statyczną `ProductionDef` w `src/economy/production.ts`:

```text
BLACKSMITH_IRON_ROD_PRODUCTION
id: blacksmith.iron_rod
role: blacksmith
inputs:
  iron × 2
  coal × 1
outputs: []
itemInputs: []
itemOutputs:
  iron_rod × 1
```

Proporcje `2 iron + 1 coal → 1 iron_rod` są jawnie zamknięte przez finalny downstream contract planu `015`; nie są inferowane z mining yield, item weight ani innych przypadkowych wartości codebase.

Nie dodawać:

- `metal`, `ingot` ani nowego `EconomicKind`;
- osobnej blacksmith recipe table/registry;
- procedural recipe DSL;
- conversion mapping `ItemKind ↔ EconomicKind` ponad istniejące identity mapping ore flow.

## 2. Existing Blacksmith profession/workplace is the scheduler

Rozszerzyć istniejący `planBlacksmithWork(ctx)` w `src/ai/npcProfessionWork.ts`.

Nie dodawać osobnego ticka, managera, FSM ani kolejki.

Blacksmith nadal pracuje wyłącznie podczas istniejącego scheduled `work` flow i używa `ctx.workplace`, który pochodzi z `workplaceFor(..., homeIndex)` i wskazuje jego household-owned anvil/grind-workbench yard.

Nie wyszukiwać workplace ponownie w production code i nie odwoływać się do nieistniejącego settlement singleton `landmarks.blacksmith`.

## 3. Deterministic Blacksmith work selection

Zamknąć priority w istniejącym plannerze:

1. jeżeli istnieje realny sharpening target i household ma `whetstone`, zachować obecne sharpening;
2. w przeciwnym razie, jeżeli `economy`, `household` i `workplace` istnieją oraz recipe ma wymagane live inputs, rozpocząć processing work;
3. w przeciwnym razie zwrócić `null`, aby obecny caller użył istniejącego generic work/idle fallbacku.

Sharpening ma pierwszeństwo, ponieważ jest już istniejącą konkretną funkcją Blacksmitha i 016 nie powinien jej wypierać nowym processingiem.

Input check przed startem action jest tylko eligibility preview. Completion zawsze musi ponownie wykonać pełny live preflight przez executor z `015`.

Nie dodawać utility/scoring systemu.

## 4. Work completion integration

`src/economy/npcWork.ts` pozostaje integration seam.

Dodać cienki adapter `commitBlacksmithProduction(economy, household)` wyłącznie jako odpowiednik istniejącego `commitHunterArrowProduction()`:

- wybiera jedną statyczną `BLACKSMITH_IRON_ROD_PRODUCTION`;
- przekazuje shared executorowi explicit owners:
  - stock owner = `SettlementEconomy`,
  - item owner = `household.items`;
- zwraca `ProductionResult` z `015` bez własnej walidacji, reservation, rollback ani mutation semantics.

To nie jest osobny Blacksmith transaction helper: transaction pozostaje w shared executorze 015, a `npcWork.ts` jedynie adaptuje profession completion do niego.

`planBlacksmithWork().onComplete` wywołuje ten adapter dokładnie raz.

## 5. Input path

Realny input path pozostaje istniejący:

```text
ResourceDeposits (`iron` / `coal`)
  ↓ mining.mine()
NpcWorkContext.carried Inventory
  ↓ deposit action at landmarks.stockpile
SettlementEconomy.add(oreEconomicKind(type), minedCount, simTime)
```

016 nie zmienia `planOreGathering()`, `ORE_ITEM`, `oreEconomicKind()`, deposit yield ani resource generation.

Nie wymaga, aby jeden konkretny Miner wydobył oba rodzaje ore. Recipe widzi wyłącznie settlement-level authoritative stock istniejący w momencie completion.

Brak jednego z inputów jest normalnym blocked production outcome.

## 6. Input consumption / output path

Successful completion ma dokładnie taki authoritative efekt:

```text
SettlementEconomy:
  iron  -2
  coal  -1

Blacksmith Household.items:
  iron_rod +1
```

Cała mutacja musi pochodzić ze shared executor 015.

Nie przenosić `iron` ani `coal` do `Household.items` tylko dlatego, że output jest itemem. Nie dodawać `iron_rod` do `EconomicStock`. Nie utrzymywać równolegle bulk + item kopii tego samego produktu.

`iron`/`coal` są bulk settlement inputs; `iron_rod` jest concrete item output. To jest świadomy mixed-storage recipe, nie conversion do jednego universal inventory model.

## 7. Blocked result and downstream 017 seam

016 nie tworzy persistent shortage/problem/pressure state — to zakres `017`.

Musi jednak zachować obserwowalny rezultat wykonania:

- `commitBlacksmithProduction()` zwraca `ProductionResult` z 015;
- `blocked-by-input` nie jest zamieniany na boolean ani wyjątek w economy seam;
- `planBlacksmithWork` może dziś nie konsumować tego wyniku dalej, ale completion path nie może ukryć/utracić jego semantyki w shared adapterze.

To jest wymagany kontrakt dla `017`: późniejsza integracja może podpiąć interpretację failed production outcome w istniejący Problem/Pressure flow bez zmiany executor contract i bez dodawania production history do 016.

`017` nie może zakładać persistent failed-attempt state w 016. Persistence shortage/problem należy do jego własnej integracji z istniejącym AI/problem model.

## 8. Off-screen / lifecycle semantics

016 nie dodaje remote-production simulatora.

Production ma te same semantics co istniejący NPC work system:

- camera/player visibility nie bierze udziału w eligibility ani execution;
- gdy żywy `NpcAgent` dochodzi do work completion, używa tego samego shared executor niezależnie od tego, czy gracz patrzy na workplace;
- settlement stream-out nie ma być zastępowany przez osobny blacksmith tick; istniejący NPC runtime/lifecycle pozostaje właścicielem tego ograniczenia;
- rozpoczęta, ale niezakończona transient action nie tworzy persistent production reservation ani replay po rebuild/load;
- completed production przeżywa rebuild/save, bo zmieniła już `SettlementEconomy` i `Household.items`.

016 nie rozszerza fidelity/off-screen simulation poza to, co już zapewnia settlement/NPC lifecycle.

## 9. Persistence

Brak nowego save schema i brak migration.

Po successful commit:

- settlement `iron`/`coal` quantities są objęte istniejącym `SettlementEconomy.snapshot()` → `SaveData.settlementEconomies`;
- `iron_rod` w `Household.items` jest objęty `HouseholdSnapshot.items` → istniejącym `SaveData.households`;
- recipe definition i `ProductionResult` są statyczne/ephemeral;
- nie dodawać `ProductionState`, queue, reservation ani last-produced record do `SaveData`.

## 10. Minimal blast radius

Oczekiwane gameplay-code files po zaimplementowanym 015:

- `src/economy/production.ts` — jedna recipe definition;
- `src/economy/npcWork.ts` — cienki Blacksmith completion adapter;
- `src/ai/npcProfessionWork.ts` — deterministic selection i `onComplete` wiring;
- targeted tests dla tych istniejących seams.

Nie zmieniać bez konkretnej potrzeby:

- `SettlementEconomy` ownership/model;
- `Household` model;
- `Inventory` model;
- mining/deposit logic;
- `workplaceFor()` / settlement prop generation;
- local exchange/trader;
- persistence schema;
- `NpcAgent` FSM/schedule architecture.

## Tests

### Recipe/content

- `BLACKSMITH_IRON_ROD_PRODUCTION` ma dokładnie stock inputs `iron ×2`, `coal ×1` i item output `iron_rod ×1`;
- recipe role/id są stabilne i Blacksmith-specific content, ale execution pozostaje shared.

### Work selection

- sharpening target + whetstone → sharpening wygrywa nad processingiem;
- brak sharpening targetu + dostępne inputs → processing action at existing `ctx.workplace`;
- brak `economy`/`household`/`workplace` → `null`;
- brak jednego inputu → nie rozpoczyna bezcelowego processing action, zachowuje fallback;
- preview available, lecz input zużyty przed completion → executor zwraca blocked, zero partial mutation/output.

### Completion / transaction

W testach shared executor 015 + thin adapter:

- `iron=2`, `coal=1` → `iron=0`, `coal=0`, `iron_rod +1`;
- nadmiar stocku zmniejsza się dokładnie o recipe amounts;
- insufficient iron → zero mutation;
- insufficient coal → zero mutation;
- unavailable/bounded item destination → zero input consumption;
- sequential attempts revalidate live state; drugi nie reuse'uje już zużytego stocku;
- successful completion daje output dokładnie raz.

### Existing-system regressions

- current sharpening semantics bez zmian;
- Hunter arrow production nadal używa shared 015 executor path;
- Miner `planOreGathering()` nadal deponuje `iron`/`coal` do `SettlementEconomy` bez nowej konwersji;
- generic `commitRoleWork()` fallback pozostaje no-op dla placeholder Blacksmith (brak Blacksmith entry w `productionForRole`);
- no second production scheduler/tick.

### Persistence contract

- existing economy snapshot round-trip zachowuje post-production `iron`/`coal`;
- existing household snapshot round-trip zachowuje `iron_rod`;
- brak nowych SaveData fields/migrations.

## Acceptance Criteria

- Istnieje realny NPC processing chain `iron ×2 + coal ×1 → iron_rod ×1`.
- Quantities pochodzą z jawnego dependency contract 015, nie z wymyślonego mappingu.
- Inputs są realnymi `EconomicKind` produkowanymi przez istniejący mining/deposit flow.
- Output jest realnym `ItemKind` i trafia wyłącznie do Blacksmith `Household.items`.
- Blacksmith używa istniejącego household-owned workplace i istniejącego scheduled work flow.
- Sharpening zachowuje pierwszeństwo i dotychczasową semantykę.
- Cały commit używa shared executor 015; 016 nie implementuje validation/atomicity/reservations osobno.
- Blocked-by-input `ProductionResult` pozostaje dostępny w work-completion seam dla 017.
- Brak własnego production managera, FSM, ticka, queue, persistence state i third inventory.
- Brak physical input transport i global scans.
- Produkcja nie wymaga playera/kamery.
- Completed result persistuje wyłącznie przez istniejących authoritative owners.

## Out of Scope

- production shortage → Problems/Pressures (`017`),
- persistent failed-attempt history,
- physical goods transport,
- inter-settlement logistics,
- market/dynamic pricing,
- supply/demand AI,
- profession staffing,
- player crafting,
- Carpenter i pozostałe profesje,
- copper processing,
- tool/weapon crafting,
- generic factory framework,
- procedural recipe DSL,
- nowy off-screen production simulator.

## True blockers

Jedyny prawdziwy blocker: `settlements-npcs-015` musi być zaimplementowany zgodnie z finalnym dependency contractem opisanym wyżej. Obecny `main` przed 015 ma dwa osobne recipe execution primitives i nie daje jeszcze poprawnego mixed stock→item atomic commit.

Nie znaleziono brakującego content kind, profession, workplace, storage owner ani persistence owner, który blokowałby 016 po 015.

## Verification

Automated:

- targeted `production` / shared executor tests z 015;
- `src/economy/npcWork` tests dla Blacksmith adaptera;
- `src/ai/npcProfessionWork` tests dla priority/eligibility/completion;
- existing mining/deposit regression;
- existing household/economy snapshot regression;
- typecheck;
- production build;
- relevant test suite.

Manual browser verification wykonuje użytkownik, nie agent implementujący.

Implementation should add JSDoc with `@domain settlements-npcs` tylko dla nowych ważnych publicznych symboli, jeżeli poprawi to preflight; nie dokumentować oczywistych constants ponad potrzebę.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
