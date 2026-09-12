# Implementation notes: settlements-npcs-034 — Household wood authority and repair correctness

## Recon baseline

Recon wykonany na `main` 2026-09-12. W trakcie reconu `main` przesunął się przez docs-only commits; przed implementation należy ponownie sprawdzić HEAD, ale istotne production files nie zmieniły się w tym przesunięciu.

Najważniejszy fakt: problem nie wymaga nowego material subsystemu. Kod ma już wszystkie potrzebne primitive'y, tylko household wood writers zapisują do złego ownera.

## 1. Obecny ownership i dokładny rozjazd

### `src/settlement/household.ts`

Aktualny household ma dwa storage mechanisms:

```text
Household.stock: EconomicStock
  └─ wood                 ← obecny household wood authority

Household.items: Inventory
  ├─ food items
  ├─ branch / beam        ← konsumenci production/repair patrzą tutaj
  └─ pozostałe itemy
```

Po migracji food do `items` `HOUSEHOLD_STOCK_KINDS` zawiera tylko `wood`. To oznacza, że po przeniesieniu wood do itemów `Household.stock` nie ma już osobnej roli i nie powinien zostać jako pusty duplicate owner.

Obecne policy:

```ts
food: { minimum: 1, target: 3, capacity: 7 }
wood: { minimum: 1, target: 3, capacity: 5 }
```

Docelowo zachować minimum/target dla wood, ale capacity podnieść do 20 branch-equivalent units z powodów opisanych w planie.

Precedent do naśladowania: food. `foodCount()` jest derived z `Household.items`, a `depositFood()` zachowuje item identity i dopiero overflow przekazuje do settlement economy.

### `src/settlement/householdResourceTransfer.ts`

To dziś jedyny jawny item→scalar adapter dla player delivery:

```text
source branch/beam
→ householdWoodValue(kind)
→ source.remove(item)
→ household.deposit('wood', scalar)
```

`HOUSEHOLD_WOOD_ITEM_KINDS` i `householdWoodValue()` są użyteczną istniejącą semantyką, ale authority musi przesunąć się do `Household.items`. Nie zostawiać tych helperów w miejscu, które zmusza household core do importowania UI/transfer module. Przenieść małą wood-kind/value definicję do household-owning layer albo innego już istniejącego niskopoziomowego modułu bez cyklu; reuse `items/itemFuel.ts::fuelValue`, nie kopiować wartości 1/2 literalami w kilku plikach.

## 2. Realny tree yield — nie używać już synthetic scalar w household path

`src/world/treeLifecycle.ts` / `src/world/treeHarvest.ts` już zwracają exact materials.

`harvestFully()` może zwrócić:

- `yield.kind === 'branch'`,
- `bonusYield.kind === 'beam'`.

Dla obecnego największego batchu:

```text
11 branch + 4 beam
= 11*1 + 4*2
= 19 household wood units
```

Player flow w `src/app/actions/groundActions.ts` zachowuje oba yieldy przez `grantItem()`.

NPC flow w `src/ai/NpcAgent.ts`, branch `need === 'wood' / chopDeposit`, ma dokładnie błąd:

```ts
let harvestedWood = 0
...
const result = harvestWorldTreeFully(...)
if (result.ok) harvestedWood = WOOD_HARVEST_AMOUNT
...
depositWoodHarvest(..., harvestedWood, ...)
```

Nie zmieniać `harvestWorldTreeFully()`. Zmienić local variable na exact harvested item batch i przekazać go do deposit action.

Uwaga scope: `NpcAgent.carried` ma obecnie mały limit (`NPC_CARRY_MAX_WEIGHT = 5`), podczas gdy maksymalny batch branch/beam waży więcej. Nie wciskać pełnego felling batchu do tego inventory tylko po to, żeby „ufizycznić” transport — byłby to unrelated carry-capacity redesign. W tym planie zachować istniejący chop→deposit lifecycle i tylko przestać tracić material identity.

## 3. Household wood aggregate i capacity

Jedyna mutable prawda:

```text
Household.items.count('branch')
Household.items.count('beam')
```

Derived aggregate:

```text
woodCount = branches * fuelValue(branch) + beams * fuelValue(beam)
```

Nie cache'ować tego jako field.

Dla deposits stosować whole-item acceptance. Przykład:

```text
current woodCount = 19
incoming beam value = 2
capacity = 20
→ beam NIE mieści się w całości
→ 0 beam do household
→ cały beam overflow do settlement (+2 wood)
```

Nie wolno dodać beam do household i potem „odjąć 1 unit” ani przechować częściowego scalar residual.

`HouseholdDepositResult.storedInHousehold` / `overflowedToSettlement` są dzisiaj opisane jako household resource units. Zachować tę semantykę dla wood: zwracane wartości to branch-equivalent units, nie liczba source itemów. `HouseholdTransferResult.sourceAmount` nadal mówi liczbę itemów.

## 4. Surplus i item-aware claim muszą mieć jeden algorytm

Najłatwiejszy nowy bug po migracji to:

```text
2 beams = woodCount 4
reserve target = 3
naive surplus = 1
```

Nie da się jednak przenieść 1 unit bez rozbicia beam; usunięcie beam zostawi 2 < target.

Dlatego nie implementować `surplus('wood')` jako zwykłego `Math.max(0, woodCount() - target)`.

Zdefiniować jeden czysty, deterministyczny selector claimu whole items i używać go zarówno do:

- wyliczenia claimowalnego surplus value,
- faktycznego household→household / household→settlement claimu.

Kolejność:

1. branch — value 1;
2. beam — value 2 tylko jeśli cały item można usunąć bez zejścia poniżej target oraz mieści się w requested/max transfer.

Selector ma zwracać konkretne `{ kind, count }`, a derived amount jest sumą wartości. Nie twórz drugiego inventory ani reservations table.

## 5. Existing logistics seams do reuse

### Settlement → household

`src/ai/npcLogistics.ts::planEconomyWithdraw()` już ma dwulegowy pickup/deposit i `claimEconomySurplus()`.

Dla wood:

- settlement nadal trzyma scalar bulk;
- claimed scalar N materializuje się jako N branches;
- przed claimem ograniczyć N do realnego household room w branch units;
- odjąć dokładnie N od economy i dodać dokładnie N branch;
- beam nigdy nie powstaje z anonymous bulk.

Nie wywoływać household deposit z `economy` jako overflow targetem dla tego samego transferu w sposób, który mógłby natychmiast zawrócić claimed wood z powrotem do settlement. Amount musi być pre-clamped do room.

### Household → household

`src/settlement/householdExchange.ts` ma poprawny bounded nearest-source discovery i live `surplus()` check. Nie przebudowywać discovery.

`src/ai/npcLogistics.ts::planHouseholdExchange()` powinien przy pickup claimować konkretny batch branch/beam z source i przy deposit dodać te same kinds do target household. Jeżeli używany jest istniejący transient carrier dla małego exchange batchu, re-checkować `canAdd` przed source mutation. Alternatywnie użyć istniejącego transfer/action pattern bez nowego durable ownera; kluczowe jest, żeby claim source i deposit destination operowały na tych samych concrete item kinds.

### Household → settlement / trader

`src/ai/npcProfessionWork.ts::planTraderWork()` obecnie dla wood korzysta z `claimHouseholdSurplus()` scalar.

Po zmianie claim zwraca exact batch, a settlement credit to suma `fuelValue` usuniętych itemów. `tryAdvanceDevelopment()` pozostaje po realnym economy add.

`src/economy/localExchange.ts` nie może po migracji zawierać `household.stock.remove(...)`.

## 6. Hunter production — nic nie przebudowywać

Contracts są już poprawne:

`src/economy/production.ts`:

```text
ARROWS_FROM_BRANCH_PRODUCTION: branch 1 → arrow 1
ARROWS_FROM_BEAM_PRODUCTION:   beam 1   → arrow 8
```

`src/economy/npcWork.ts::commitHunterArrowProduction()` używa shared item recipe executor.

`src/ai/npcProfessionWork.ts` gate'uje work przez `household.items.has(branch/beam)`.

Po migracji wood writerów hunter powinien zacząć działać bez special adaptera. Jeżeli implementacja zaczyna konwertować scalar wood wewnątrz hunter production, zatrzymać się — to odtworzyłoby dual semantics.

## 7. Structure repair — reuse quote i transaction

`src/settlement/structureCondition.ts` jest poprawnym ownerem repair policy i transaction.

Nie przenosić material checks do `NpcAgent` i nie kopiować:

- `RESIDENTIAL_STRUCTURE_FULL_REPAIR_BEAMS`,
- `RESIDENTIAL_STRUCTURE_FULL_REPAIR_BRANCHES`,
- scaling/rounding z `materialsForRestoredFraction()`.

`quoteStructureRepair()` jest jedynym źródłem wymagań.

`beginStructureRepair()` jest nadal authoritative commit:

1. quote live state;
2. preflight wszystkich requirements;
3. consume materials;
4. utworzenie `RepairProgress`.

### Pressure eligibility seam

Najmniejsza zgodna zmiana jest w `src/settlement/structureRepairCandidates.ts::NpcStructureRepairHooks.pressure`.

Możliwy kontrakt:

```ts
pressure: (
  nowDays: number,
  hasMaterial: (requirement: MaterialRequirement) => boolean,
) => number
```

Inside hook:

```text
resolve state/policy
if active repair → RESUME_PRESSURE
quote = quoteStructureRepair(...)
if !quote → 0
if some quote.materials unavailable → 0
return structureRepairPressureFromCondition(...)
```

To trzyma policy/quote w settlements domain i pozwala `NpcAgent` tylko dostarczyć actor-specific storage adapter.

`NpcAgent.structureRepairPressureCandidate()` powinien podać callback z `this.household?.items.has(...)`. Brak household = brak startable pressure.

Active repair nie pyta o inventory — materiały zostały zużyte przy start.

## 8. Dispatch fallback — lokalny, nie globalny

Aktualny `choose()`:

```text
repairStructure wins
→ beginRepairStructure()
→ break
```

Aktualny `beginRepairStructure()` może zrobić `return` po `blocked` bez `startAction()`.

Zmienić return type na `boolean` albo równoważny mały outcome:

```text
true  = repair action faktycznie wystartowała / resumed
false = nie wystartowała
```

W repair branch `choose()` przy `false` wykonać dokładnie istniejący zwykły fallback:

```ts
this.beginIdle(this.resolveIdleActivity(scheduledActivity, timeOfDay))
```

Nie wprowadzać globalnego post-dispatch phase detectora. Race po material eligibility jest lokalnym failure mode repair i tam należy go obsłużyć.

## 9. Direct scalar readers do usunięcia

Recon znalazł production-code direct readers/writers household stock wood m.in. w:

- `src/settlement/household.ts`
- `src/economy/localExchange.ts`
- `src/settlement/householdResourceTransfer.ts`
- `src/ai/NpcAgent.ts` (inspection/debug snapshot)
- `src/interaction/resolveInteraction.ts`
- `src/settlement/createSettlement.ts` (wood visual sync)

Test fixtures dodatkowo używają `household.stock.query/add/remove` w:

- `src/settlement/household.test.ts`
- `src/settlement/householdResourceTransfer.test.ts`
- `src/economy/localExchange.test.ts`
- `src/ai/npcLogistics.test.ts`
- `src/settlement/storageVisuals.test.ts`

Po zmianie wyszukać jeszcze raz `household.stock`, `stock.query('wood')`, `deposit('wood'` i `claimHouseholdSurplus`, żeby nie zostawić legacy writera.

Presentation ma czytać `household.woodCount()`; renderer nie staje się ownerem.

## 10. Persistence — dokładna migration boundary

Aktualny baseline w `src/persistence/saveData.ts`:

```ts
export const CURRENT_SAVE_VERSION = 38
```

`isHouseholdSnapshot()` obecnie wymaga `stock` object i opcjonalnie waliduje `items`.

Implementation musi przed zmianą ponownie odczytać current version. Jeżeli 38 nadal jest current:

```text
CURRENT_SAVE_VERSION = 39
SAVE_MIGRATIONS[38] = migrateSaveV38ToV39
```

Migration per household:

```text
legacyWood = finite non-negative stock.wood ?? 0
items = existing valid inventory snapshot OR empty inventory snapshot
items.counts.branch += legacyWood
remove stock
preserve water/hayForage/agriculture/items.instances/items.foodBatches
```

Nie zmieniać beamów ani istniejących branchy. Legacy wood jest integerem w realnych writers, więc 1:1 branch migration zachowuje dawną resource quantity bez zgadywania beam composition.

Current `HouseholdSnapshot` powinien przestać mieć `stock`. `items` powinno być current-schema authoritative field; migration ma je zapewnić. Jeżeli konstruktor utrzymuje optional fallback wyłącznie dla in-session/test backward compatibility, validator current SaveData nadal ma wymagać aktualnego jednoznacznego shape.

Nie dodawać nowego `SaveData.householdWood` field.

## 11. Test seams i ważne fixtures

### Household

Najważniejsze cases:

```text
branches=3, beams=2 → woodCount=7
2 beams only + target3 → claimable surplus=0
branch1 + beam2 (value5) → branch może być surplus, beam zależnie od reserve
capacity19 + incoming beam → cały beam overflow
```

Test capacity używa derived units, nie inventory weight/size — household Inventory jest już unbounded physical storage.

### Tree/hunter integration

Nie trzeba robić pełnego browser scenario. Unit/integration seam ma pokazać:

```text
harvest result contains branch+beam
→ household deposit contains same concrete kinds
→ hunter gate widzi material
→ existing commitHunterArrowProduction consumes it
```

### Repair

Dodać test wokół `createNpcStructureRepairHooks` (obecnie brak osobnego test file, można utworzyć `structureRepairCandidates.test.ts` jeśli to najczystszy seam) oraz odpowiedni `NpcAgent` test dla fallbacku.

Kluczowy race fixture:

1. pressure sees required items;
2. po pressure, przed begin, test usuwa jeden item;
3. `beginRepairStructure` zwraca false;
4. NPC nie zostaje w bezakcyjnym repair branch — startuje normalny idle/schedule action;
5. kolejny pressure = 0.

### Persistence

Migration fixture musi zawierać jednocześnie legacy scalar wood i już istniejące branch/beam, żeby wykryć overwrite/double conversion.

## 12. Kolejność implementacji

1. Household exact wood helpers/API + tests.
2. Save snapshot/migration + tests, żeby nowy owner miał stabilny persisted contract.
3. Player transfer + derived readers/presentation.
4. NPC tree deposit i wood logistics/exchange/trader.
5. Hunter regression tests.
6. Repair pressure eligibility.
7. Repair dispatch fallback + race test.
8. Search for stale scalar call-sites.
9. Targeted tests/typecheck; potem state docs tylko jeśli current-state wording wymaga korekty.

## 13. Plan dependencies / nie wchodzić w ich scope

- `settlements-007`: reuse `quoteStructureRepair` / `beginStructureRepair` / work progress; nie redesignować repair.
- `settlements-npcs-015`: reuse item production executor i hunter recipes.
- `settlements-npcs-032`: zmienić tylko wood destination semantics na exact items.
- `settlements-npcs-016`: ma zależeć od 034; nie implementować blacksmith chain tutaj.
- `settlements-npcs-017`: ma zależeć od 034; nie implementować demand pressure tutaj.

Nie poprawiać przy okazji wszystkich cargo/interruption edge cases z Living World audits. Scope 034 to wood authority + repair correctness.

> **Zrób git commit i push do main, rebase jeżeli trzeba**