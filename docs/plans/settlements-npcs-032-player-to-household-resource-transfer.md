# Plan: Player → household resource transfer

**Created:** 2026-09-12  
**Status:** `planned` 📋  
**Type:** feature  
**Priority:** high · **Effort:** S  
**Depends on:** none  
**Domain:** `settlements-npcs`  
**Subdomains:** `household` `economy` `logistics`  
**Tags:** `resource-transfer` `food` `wood` `player` `household` `quests`  
**Roadmap:** `quests-and-reputation.md`

## Cel

Dodać systemowy sposób przekazania przez gracza zasobów bezpośrednio do konkretnego `Household`.

V1 obejmuje dwa istniejące household resources:

- `food`,
- `wood`.

Mechanizm ma zmieniać ten sam authoritative household state, którego używają NPC, local exchange, shortage detection i world-driven quest opportunities.

Docelowy przepływ:

```text
player Inventory
→ household resource transfer operation
→ Household.depositFood(...) / Household.deposit('wood', ...)
→ authoritative Household state changes
→ Household.shortage(resource) changes
→ quests/help/delivery systems only observe the result
```

Nie tworzyć quest-specific delivery state ani drugiego inventory/storage systemu.

## Problem

`quests-progression-016` może wykrywać realny household shortage, ale gracz obecnie nie ma player-facing ścieżki:

```text
player
→ specific Household
```

Wpłata do `SettlementEconomy` nie rozwiązuje problemu konkretnego gospodarstwa:

```text
SettlementEconomy
≠
Household
```

Brak jest odnotowany w `docs/plans/LOOSE-ENDS.md` dla household food shortage. Ten plan rozszerza rozwiązanie od razu na drugi istniejący household resource — `wood` — żeby mechanizm nie był jednorazowym food-only wyjątkiem.

## Aktualny stan i ownership

### Household

`src/settlement/household.ts`

`Household` jest authoritative ownerem rodzinnych zasobów:

- food → concrete `ItemKind`s w `Household.items`,
- wood → scalar `EconomicStock` w `Household.stock`.

Istniejące wejścia mutacji:

```ts
household.depositFood(itemKind, amount, economy?, simTime?, batches?)
household.deposit('wood', amount, economy?, simTime?)
```

Oba respektują household capacity i mogą przekazać overflow do właściwego `SettlementEconomy`.

`depositFood()` dodatkowo zachowuje `FoodBatch` i zapisuje istniejącą household history, w tym przejście `shortage.resolved`.

Nie mutować bezpośrednio `household.items` ani `household.stock` z app/UI layer.

### Inventory transfers

`src/items/inventoryTransfer.ts`

Istnieją canonical ownership primitives:

```ts
transferInventoryCount(...)
transferInventoryInstance(...)
```

`transferInventoryCount()` zachowuje freshness dla perishables przez `removeWithFreshness()` / `addWithFreshness()`.

Nie można jednak użyć go bezpośrednio jako całej implementacji player → household, ponieważ household nie jest wyłącznie zwykłym `Inventory`:

- food wymaga `Household.depositFood()` dla capacity/overflow/history,
- wood jest scalar household resource, a nie `Household.items` entry.

### Food helpers

`src/items/foodItems.ts`

Istnieją:

```ts
claimFoodItems()
depositFoodItems()
carryFoodClaim()
deliverCarriedFoodClaim()
```

oraz `Inventory.removeWithFreshness()` / `addWithFreshness()`.

Nie tworzyć nowego freshness modelu ani food-transfer DTO.

### Interaction

`Interactable.kind === 'householdStorage'` już wskazuje live `Household` i jest obecnie read-only.

To jest naturalny player-facing punkt wejścia dla transferu.

Nie dodawać nowego world object ani quest-specific interactable.

## Zakres V1

Obsłużyć:

```text
player → household food
player → household wood
```

Nie obejmować jeszcze:

- arbitrary `Household.items` gifting,
- household withdrawal / stealing,
- player → NPC equipment,
- household water transfer,
- trade/payment,
- access permissions,
- quest-specific counters lub delivery records.

## Shared domain operation

Dodać mały household-owned operation, preferencyjnie w:

```text
src/settlement/householdResourceTransfer.ts
```

Operacja ma być actor-neutral po stronie source inventory — nie może znać `PlayerController`, `QuestManager`, Vue ani Three.js.

Preferowany kierunek kontraktu:

```ts
type HouseholdTransferRequest =
  | { resource: 'food', itemKind: ItemKind, amount: number }
  | { resource: 'wood', itemKind: ItemKind, amount: number }

transferResourceToHousehold({
  source,
  household,
  economy,
  request,
  nowDays,
})
```

`source` ma być zwykłym `Inventory`, żeby ten sam operation mógł później zostać użyty przez player delivery, NPC helper, gift lub inne world actions.

Nie wprowadzać generic storage managera ani nowego ownera stanu.

## Food transfer semantics

Dla food:

```text
validate food ItemKind + amount
→ source.removeWithFreshness(kind, amount, nowDays)
→ FoodBatch[]
→ Household.depositFood(kind, amount, economy, nowDays, batches)
```

Nie używać:

```text
source.remove(...)
→ household.items.add(...)
```

dla perishables.

Freshness/provenance ma przejść bez utraty:

- `acquiredAtDays`,
- decay checkpoint,
- source species dla mięsa,
- FIFO batch semantics.

## Wood transfer semantics

Household wood jest scalar resource, natomiast player inventory przechowuje concrete `ItemKind`s. Nie tworzyć fikcyjnego count-backed `wood` item tylko po to, żeby ujednolicić reprezentację.

V1 powinien użyć jawnej, małej polityki określającej, które istniejące player item kinds reprezentują household-usable wood i ile household wood units wnoszą.

Najbardziej prawdopodobni istniejący kandydaci to `branch` / `beam`; podczas implementacji zweryfikować aktualny katalog oraz istniejące material/fuel conversion semantics i reuse'ować je, jeśli już istnieją.

Jeżeli repo nie ma canonical conversion, zdefiniować ją w jednym shared helperze blisko household transferu, nie w UI i nie w quest layer.

Flow:

```text
supported wood ItemKind + amount
→ compute household wood contribution
→ atomically remove exact source items
→ Household.deposit('wood', contribution, economy, nowDays)
```

Nie mutować `household.stock.add('wood', ...)` bezpośrednio.

Conversion musi być deterministic i testowana.

## Capacity i overflow

Zachować istniejącą household policy:

```text
household room
→ Household

overflow
→ SettlementEconomy
```

Player transfer nie może niszczyć zasobów przy pełnym household.

Jeżeli obecne `depositFood()` / `deposit()` nie zwracają wystarczających danych do bezpiecznego UI/result contract, rozszerzyć je o mały wynik mutacji, np.:

```ts
{
  storedInHousehold: number
  overflowedToSettlement: number
}
```

Dotychczasowi callerzy mogą ignorować return value.

Nie duplikować household capacities poza `household.ts`.

## Result contract

Domain operation powinien zwracać semantic result zamiast `boolean`, co najmniej rozróżniając:

```text
transferred
invalid_resource_item
invalid_amount
source_shortage
```

Dla sukcesu wynik powinien pozwolić UI pokazać:

```text
resource/item consumed from source
amount stored in household
amount overflowed to settlement
```

Nie pozwalać UI odtwarzać tych wartości z własnej kopii household policy.

## Shortage update

Nie dodawać osobnego shortage mutation API.

Istniejące:

```ts
household.shortage('food')
household.shortage('wood')
```

są live-derived z authoritative household state.

Po transferze:

```text
Household mutation
→ shortage(resource) recalculates immediately
```

`depositFood()` i `deposit()` pozostają ownerami household history transition, w tym istniejącego `shortage.resolved`.

Quest lub UI nie może ustawiać shortage ręcznie.

## Reuse dla quests / gift / delivery / help

Mechanizm ma rozdzielać cztery warstwy:

```text
source ownership
    Inventory

household acceptance/mutation
    Household.depositFood / Household.deposit

actor/UI intent
    player / NPC / helper / delivery

quest observation
    read-only Household.shortage(...)
```

Dzięki temu przyszłe scenariusze mogą korzystać z tego samego domain operation:

- world-driven household shortage quest,
- pomoc sąsiedzka,
- dostawa zasobów,
- gift/help actions,
- scripted world event.

Nie dodawać do transfer operation pól typu `questId`, `objectiveId`, `reward` ani `giverNpcId`.

## Quest integration

Ten plan nie implementuje nowej quest family.

Późniejsza integracja `quests-progression-016` powinna jedynie obserwować authoritative source:

```text
HouseholdRegistry
→ householdId
→ household.shortage(resource)
```

Przykład:

```text
shortage > 0
→ problem present

shortage === 0
→ problem resolved
```

Nie sprawdzać, czy gracz użył konkretnego przycisku transferu. Problem może zostać rozwiązany również przez NPC/local economy — świat pozostaje niezależny od gracza.

## UI / interaction

Reuse istniejący:

```text
Interactable.kind === 'householdStorage'
```

Rozszerzyć interaction o akcję typu:

```text
Przekaż zasoby
```

UI ma pokazywać wyłącznie aktualnie transferowalne zasoby z inventory gracza:

- food items,
- supported wood-contribution items.

Preferować reuse istniejących:

- inventory grouping/view helpers,
- item labels,
- quantity controls,
- istniejący Vue transfer UI, jeśli da się go rozszerzyć bez przeniesienia household domain logic do komponentu.

Jeżeli existing container screen zakłada symetryczny `Inventory ↔ Inventory`, nie wciskać household semantics do `containerActions.ts`.

W takim przypadku dodać cienki app adapter, np.:

```text
src/app/actions/householdResourceTransferActions.ts
```

który robi tylko:

```text
UI intent
→ transferResourceToHousehold(...)
→ inventory/HUD/storage refresh
```

## Persistence

Nie dodawać nowego transfer state ani quest delivery state.

Po commit authoritative owners są już istniejące:

```text
player Inventory
Household.items / Household.stock
SettlementEconomy overflow
```

Households są zapisywane przez:

```text
SettlementsManager.snapshotHouseholds()
→ SaveData.households
```

`HouseholdSnapshot.items` zawiera counts, instances i food batches; stock zawiera wood.

Nie bumpować `CURRENT_SAVE_VERSION`, jeżeli persisted representation się nie zmienia.

Podczas implementacji poprawić nieaktualny komentarz `HouseholdSnapshot`, jeśli nadal twierdzi, że snapshot nie jest częścią `SaveData`.

## Relevant files

Główne:

```text
src/settlement/household.ts
src/items/Inventory.ts
src/items/inventoryTransfer.ts
src/items/foodItems.ts
src/items/items.ts
src/items/itemCatalog.ts
src/interaction/Interactable.ts
src/interaction/resolveInteraction.ts
src/app/interactables.ts
src/app/actions/
src/app/saveState.ts
```

Integracje do sprawdzenia:

```text
src/economy/settlementEconomy.ts
src/economy/localExchange.ts
src/settlement/householdExchange.ts
src/ui-vue/
src/quests/opportunities/
```

## Testy

### Domain

Dodać testy potwierdzające:

1. food trafia do dokładnie wskazanego household;
2. wood trafia do dokładnie wskazanego household;
3. inne household pozostaje bez zmian;
4. settlement storage nie jest traktowane jako target household;
5. perishable food zachowuje `FoodBatch` freshness/provenance;
6. non-perishable food działa;
7. unsupported non-food/non-wood item jest odrzucany;
8. brak source itemów nie mutuje żadnego ownera;
9. household food capacity działa;
10. household wood capacity działa;
11. food overflow trafia do właściwego `SettlementEconomy`;
12. wood overflow trafia do właściwego `SettlementEconomy`;
13. nic nie ginie przy overflow;
14. `shortage('food') > 0` przechodzi do `0` po wystarczającym transferze;
15. `shortage('wood') > 0` przechodzi do `0` po wystarczającym transferze;
16. istniejący household history dostaje `shortage.resolved`;
17. wood item → resource conversion jest deterministic;
18. save/restore zachowuje transferred food batches i wood stock.

### Interaction

Zweryfikować technicznie:

```text
householdStorage target
→ action adapter
→ exact live Household
→ shared domain operation
```

Nie wiązać household przez display name NPC ani UI index, jeśli stable `Household.id` / live target jest już dostępny.

## Verification

Automated:

```text
npx tsc --noEmit
```

oraz targeted tests dla:

```text
household
household resource transfer
inventory freshness
interaction/action adapter
```

Manual/browser verification wykonuje użytkownik:

1. doprowadzić household do food shortage;
2. przekazać food przez household storage;
3. potwierdzić zniknięcie shortage;
4. doprowadzić household do wood shortage;
5. przekazać supported wood item;
6. potwierdzić zniknięcie shortage;
7. sprawdzić oba overflow cases przy pełnym household;
8. zapisać/załadować i potwierdzić food freshness + wood stock.

## Non-goals

Nie implementować w tym planie:

- household world-driven quest family,
- quest rewards,
- arbitrary generic household item storage access,
- player → NPC equipment,
- stealing/withdrawal,
- access policies,
- water transfer,
- trading,
- nowego inventory/storage managera,
- nowego persistence registry.

## Implementation notes

Przed implementacją utworzyć:

```text
docs/plans/implementation-notes/settlements-npcs-032-player-to-household-resource-transfer-implementation-notes.md
```

Notes powinny zapisać przede wszystkim:

- finalny `householdStorage` UI/action seam,
- exact supported wood player item kinds i canonical conversion,
- finalny domain operation signature/result contract,
- ewentualny return contract `Household.depositFood()` / `deposit()`,
- persistence call-sites,
- targeted test files,
- ewentualną korektę nieaktualnego komentarza `HouseholdSnapshot`.

Dodać JSDoc do nowego publicznego domain operation, jeśli powstanie:

```text
@domain settlements-npcs
@system household
```

> **Zrób git commit i push do main, rebase jeżeli trzeba**
