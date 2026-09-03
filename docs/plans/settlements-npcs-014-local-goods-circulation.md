# Plan: Local Goods Circulation

**Created:** 2026-09-01  
**Status:** `verification needed` 🔍 — implemented + technically verified (`tsc`/lint/build/test); browser/gameplay not yet verified. See [implementation notes](./implementation-notes/settlements-npcs-014-local-goods-circulation-implementation-notes.md).  
**Type:** feature  
**Priority:** high · **Effort:** M  
**Depends on:** ~~settlements-npcs-008~~ ~~settlements-npcs-009~~ ~~settlements-npcs-010~~
**Domain:** `settlements-npcs`
**Roadmap:** `economy-goods-flow`  

## Cel

Domknąć pierwszy lokalny obieg realnych dóbr:

```text
producer household
    ↓ surplus
local collection
    ↓
SettlementEconomy
    ↓
consumer household
    ↓
NPC consumption
```

Pierwszym pełnym przypadkiem będzie:

```text
Hunter → meat → household surplus → Trader
       → settlement storage → consumer household → consumption
```

Trader jest pierwszym aktorem wykorzystującym mechanizm local goods flow, a nie właścicielem osobnego systemu handlu.

## Recon i istniejące fundamenty

Kod posiada już:

- konkretne itemy w `Household.items`,
- settlement-level concrete food inventory w `SettlementEconomy`,
- household/settlement surplus i shortage,
- lokalne transfery dóbr,
- live claim/revalidation źródłowego stocku,
- istniejący NPC action flow `goTo` / `execute` / `deposit`,
- `storageDestinations` dla fizycznych miejsc dostarczania,
- istniejący Trader workflow,
- Hunter production realnych itemów, w tym mięsa/skóry,
- istniejący food acquisition/consumption flow.

Nie należy tworzyć równoległego inventory, market stock ani `TradeSystem`.

## Model

Rozdzielamy dwa kierunki przepływu:

```text
SUPPLY SIDE
Household surplus
      ↓
LocalGoodsFlow / collection
      ↓
SettlementEconomy


DEMAND SIDE
Household shortage
      ↓
existing acquisition
      ↓
Household inventory
      ↓
NPC consumption
```

Settlement stock jest buforem między produkcją i konsumpcją.

Collection nie wymaga istniejącego shortage jako warunku. Trader może wprowadzić kwalifikujący się surplus do settlement stock, o ile nie narusza bezpiecznego zapasu gospodarstwa i istniejących ograniczeń storage. Dzięki temu ekonomia ma prawdziwy `surplus → stock → future demand`, zamiast reaktywnego transportowania dóbr dopiero po wystąpieniu głodu.

## 1. Local circulating goods

Wprowadzić jedną, jasną definicję tego, które concrete `ItemKind` mogą uczestniczyć w lokalnym obiegu.

Mechanizm powinien rozróżniać:

- dobra przeznaczone do lokalnej konsumpcji/produkcji,
- dobra prywatne,
- equipment,
- quest items,
- inne przedmioty, których nie wolno automatycznie przekazywać.

Nie zakładać, że każdy item z `Inventory` jest automatycznie dobrem ekonomicznym.

Na start lista powinna być minimalna i obejmować przede wszystkim konkretne food items. Hunter meat jest pierwszym obowiązkowym przypadkiem.

Preferować istniejącą capability/tag/configuration, jeżeli codebase posiada już odpowiedni mechanizm, zamiast tworzyć drugi system klasyfikacji itemów.

## 2. Generalise local item transfer

Rozszerzyć istniejący local exchange mechanism, nie zastępować go.

Transfer powinien zachować:

```text
select source
    ↓
live revalidation
    ↓
atomic claim
    ↓
goTo source
    ↓
pickup
    ↓
goTo destination
    ↓
deposit
```

Transfer powinien działać na `ItemKind + quantity`.

Źródłowy inventory pozostaje authoritative do momentu claim/pickup, a destination otrzymuje dokładnie dostarczoną ilość.

Jeżeli istniejące helpery są zbyt food-specific, należy je uogólnić tak, aby zachować dotychczasowe call sites i semantykę.

## 3. Trader local collection

Rozszerzyć Trader workflow o lokalne zbieranie surplusu **innego householdu w tej samej osadzie**.

Trader:

1. znajduje kwalifikujący się surplus,
2. wybiera bounded quantity,
3. wykonuje live claim,
4. fizycznie dociera do source,
5. odbiera goods,
6. dostarcza je do settlement storage.

Trader nie powinien:

- teleportować dóbr,
- tworzyć lub niszczyć inventory,
- opróżniać household reserve,
- pobierać equipment/quest items,
- skanować całego świata.

Trader powinien być konsumentem `LocalGoodsFlow`, a nie jego właścicielem.

## 4. Surplus selection

Wybór surplusu musi respektować istniejącą semantykę household needs/reserve.

```text
household stock
    -
required household reserve
    =
available surplus
```

Nie wystarczy sprawdzenie `inventory.count(item) > 0`.

Candidate discovery powinno być settlement-local i bounded. Nie wykonywać pełnego:

```text
every Trader × every Household × every ItemKind
```

na każdym simulation tick.

W przypadku wielu równorzędnych kandydatów stosować deterministyczne sortowanie/tie-breaker.

## 5. Settlement destination

Dostarczane dobra trafiają do istniejącego settlement storage/inventory należącego do `SettlementEconomy`.

Nie tworzyć:

- Trader inventory jako magazynu ekonomicznego,
- MarketInventory,
- drugiego settlement stock,
- abstrakcyjnego `market quantity`.

Jeżeli dla concrete food istnieje już właściwy deposit path, należy go rozszerzyć zamiast tworzyć drugi.

## 6. Consumer side

Nie budować nowego systemu konsumpcji.

Zweryfikować i w razie potrzeby minimalnie rozszerzyć istniejący food acquisition tak, aby concrete food dostarczone do settlement storage było dostępne dla innych householdów.

Docelowy przepływ:

```text
SettlementEconomy
      ↓
existing household acquisition
      ↓
Household.items
      ↓
existing NPC food consumption
```

Nie tworzyć nowego `MarketDemand` ani nowego typu Need.

## 7. End-to-end Hunter scenario

Hunter pozostaje zwykłym producerem.

Nie dodawać mu specjalnej logiki trade.

Scenariusz testowy:

```text
Hunter hunts
    ↓
meat enters Household A
    ↓
A has safe surplus
    ↓
Trader selects meat
    ↓
Trader claims meat
    ↓
Trader physically collects it
    ↓
SettlementEconomy receives meat
    ↓
Household B has food shortage
    ↓
existing acquisition obtains meat
    ↓
NPC B consumes meat
```

Ten przepływ musi działać bez interakcji gracza.

## 8. Concurrency and failure

Claim musi być atomowy i ponownie zweryfikowany względem live state.

Testować sytuacje:

- drugi actor pobrał część surplusu,
- source inventory zmienił się przed pickup,
- Trader został przerwany,
- destination stało się niedostępne,
- transfer został anulowany.

Żaden przypadek nie może prowadzić do duplikacji dobra ani cichej utraty już skutecznie claimed goods.

Wykorzystać istniejącą semantykę interruption/cancellation zamiast tworzyć osobny lifecycle tylko dla Trader transportu.

## 9. Performance

Collection powinno być wykonywane w istniejącym rytmie decyzji/work Tradera, nie co frame.

Candidate discovery ograniczyć do własnej settlement i niewielkiego zbioru kwalifikujących się householdów/items.

Nie wprowadzać globalnego indeksu rynku na potrzeby tego planu.

Jeżeli recon implementacyjny pokaże, że istniejące hooks mogą dostarczyć kandydatów bez dodatkowych skanów, należy je wykorzystać.

## 10. Tests

### Local transfer

- item source → settlement,
- exact quantity conservation,
- insufficient live stock,
- concurrent claim,
- interrupted transfer,
- failed destination.

### Circulating goods

- non-circulating item is ignored,
- food is eligible,
- household reserve is protected,
- selection is settlement-local,
- selection is deterministic.

### Trader

- finds surplus from another household,
- does not select own household,
- claims bounded quantity,
- physically follows pickup/delivery flow,
- does not collect without an eligible destination,
- repeated execution does not duplicate goods.

### Consumer

- settlement receives meat,
- another household can acquire it,
- settlement stock decreases exactly once,
- NPC consumes the acquired item.

### End-to-end

Hunter → meat → surplus → Trader → settlement → household → consumption.

## Acceptance Criteria

- Concrete food items can circulate between households through settlement storage.
- Hunter-produced meat can leave the producer household as legitimate surplus.
- Trader can physically collect that surplus from another household.
- Settlement storage receives the exact claimed quantity.
- Another household can obtain and consume the good through existing food systems.
- Household reserve is never accidentally collected.
- Concurrent claims cannot duplicate stock.
- Interrupted/failed transfers do not duplicate or silently delete goods.
- The player is not required.
- No parallel market inventory or trade system is introduced.
- `trade.ts` / `tradeCatalog.ts` remain focused on player↔merchant valuation/transactions.
- Collection remains settlement-local and bounded.

## Out of Scope

- dynamic pricing,
- coins / Mint,
- player trading changes,
- inter-settlement trade,
- carts/wagons,
- long-distance transport,
- Blacksmith,
- Carpenter,
- processing chains,
- global market,
- advanced logistics,
- complete classification of every item in the game.

## Dependencies

The plan builds on the completed foundations represented by plans 008–010:

- concrete food storage model,
- physical storage destinations,
- physical storage visualization.

No dependency on the future physical transport system.

## Verification

Automated:

- targeted unit/integration tests,
- full test suite,
- typecheck/build.

Runtime:

- deterministic settlement with Hunter, Trader and at least one consumer household,
- observe the complete meat flow without player intervention,
- verify no item duplication/loss,
- verify Trader does not continuously drain producer household stock.

Manual browser verification remains the player's responsibility.

**Zrób git commit i push do main, rebase jeżeli trzeba**
