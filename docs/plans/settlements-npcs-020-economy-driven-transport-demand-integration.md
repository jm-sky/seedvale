# Plan: Economy-driven Transport Demand Integration

**Created:** 2026-09-04  
**Status:** `verification needed` 🔍  
**Type:** feature  
**Priority:** high · **Effort:** S/M  
**Depends on:** ~~settlements-npcs-017~~, ~~settlements-npcs-018~~, ~~settlements-npcs-019~~  
**Domain:** `settlements-npcs`  
**Subdomains:** `economy` `logistics`  
**Tags:** `transport` `shortage` `surplus` `trader`  
**Roadmap:** `physical-goods-transport`  
**Model:** Sonnet, Composer  
**Implemented at:** 2026-09-14 15:30  

## Implementation summary

Vertical slice: uncovered `SettlementEconomy.shortage('food')` + uncommitted household food surplus → Trader work creates a `TransportOrder` → pickup/unload mutates authoritative inventories → shortage falls.

Derived accounting: `src/economy/foodTransportDemand.ts` (incoming `requestedQuantity`/`claimedQuantity`, pre-pickup outgoing, optional per-kind and `excludeOrderId`). No demand registry, no extra tick.

Trader ordering in `planTraderWork()`: resume `findByCarrier` first; food uses `planTraderCollection` (own household eligible as source); wood keeps the 014/018 direct-deposit baseline.

Source selection reuses `HouseholdExchangeHooks.findSurplusSource` with a `surplusOf` callback for uncommitted supply. Quantity is `min(uncovered, aggregate uncommitted, kind-uncommitted, HOUSEHOLD_EXCHANGE_MAX_TRANSFER.food, carrier room)`.

## Recon result — 2026-09-14

Draft exit criteria są spełnione.

`settlements-npcs-018` i `019` są zaimplementowane i dostarczają rzeczywisty transport foundation:

- `src/world/transportOrder.ts` — authoritative `TransportOrder` i lifecycle `pending → assigned → in-transit → completed`, plus `failed` / `cancelled`,
- `src/world/createTransportOrders.ts` — world-owned registry, create/assign/find/findByCarrier i lifecycle mutations,
- `src/world/transportTransactions.ts` — transactional pickup/unload z realnym transferem inventory i rollbackiem,
- `NpcAuthoritativeState.transportCargo` — authoritative carrier-owned cargo po pickup,
- `src/world/transportOffscreen.ts` — off-screen progression dla `in-transit`,
- persistence `TransportOrder` + cargo działa przez istniejący save/load flow,
- debug API potrafi odczytać transport order.

Post-018 Trader flow również jest już zmigrowany:

```text
planTraderWork()
    ↓
planTraderCollection()
    ↓
TransportOrder
    ↓
executeTransportPickup()
    ↓
transportCargo
    ↓
executeTransportUnload()
```

Nie ma już potrzeby migrowania lokalnego carry flow do `TransportOrder` w ramach 020.

Brakujący element to powiązanie **powodu utworzenia orderu** z authoritative economy state oraz accounting już istniejących transport commitments.

## Goal

Połączyć rzeczywisty stan ekonomii osady z istniejącym fizycznym transportem tak, aby realny settlement food shortage prowadził do realnego `TransportOrder`, bez osobnego demand registry ani drugiego systemu logistyki.

Pierwszy vertical slice:

```text
SettlementEconomy food shortage
        ↓
derived uncovered demand
        ↓
local household uncommitted food surplus
        ↓
Trader normal profession work evaluation
        ↓
existing TransportOrder flow
        ↓
physical / off-screen transport
        ↓
settlement inventory mutation
        ↓
shortage decreases naturally
```

Kluczowy invariant:

```text
Transport demand is derived from authoritative economy state.
```

Nie tworzyć trwałego:

```text
TransportDemand
EconomicDeliveryNeed
TradeRequest
SettlementImportRequest
```

## Current State

### Settlement economy

`SettlementEconomy` posiada derived:

```text
query(kind)
shortage(kind)
surplus(kind)
hasShortage(kind)
hasSurplus(kind)
```

Dla `food` stan pochodzi z realnego settlement-level `Inventory`.

Po dostawie:

```text
inventory changes
→ query('food') changes
→ shortage('food') changes
```

Nie potrzeba osobnego feedback state.

### Household economy

`Household` posiada:

```text
shortage(kind)
shouldAcquire(kind)
surplus(kind)
```

Food surplus pochodzi z realnego `Household.items`.

### Local household lookup

Istniejący household exchange flow:

- działa lokalnie w obrębie osady,
- wybiera realny household surplus,
- jest deterministic nearest-first,
- posiada stable household-id tie-break,
- ponownie waliduje live stock przy claimie.

Reuse tego mechanizmu; nie tworzyć drugiego world-wide household search.

### Transport foundation

`TransportOrder` jest authoritative commitment, ale nie właścicielem cargo.

Ownership:

```text
before pickup  → source household inventory
after pickup   → NpcAuthoritativeState.transportCargo
after unload   → destination inventory
```

`TransportOrders.findByCarrier(npcId)` egzekwuje jeden aktywny transport per carrier.

Incoming/outgoing food commitments są derived z `TransportOrders.list()` przez `src/economy/foodTransportDemand.ts` — bez osobnego demand registry.

### Trader

`planTraderCollection()` już tworzy/obsługuje `TransportOrder` i korzysta z istniejących transakcji pickup/unload.

020 ma zmienić **ekonomiczny warunek i ilość** prowadzącą do orderu, a nie transport execution.

## 1. First Supported Demand

Pierwsza implementacja obsługuje wyłącznie:

```text
SettlementEconomy.shortage('food')
```

Poza zakresem tego slice:

- household shortage transport,
- wood demand,
- production input logistics,
- cross-settlement trade,
- dynamic pricing,
- caravans,
- generic carrier marketplace.

## 2. Uncovered Destination Demand

Nie tworzyć orderu tylko dlatego, że:

```text
economy.shortage('food') > 0
```

Najpierw odjąć aktywne transport commitments już kierowane do settlement storage.

Logicznie:

```text
uncoveredDemand =
    currentSettlementFoodShortage
    - incomingCommittedFood
```

`incomingCommittedFood` obejmuje aktywne `TransportOrder`:

- `itemKind` będący food item,
- destination = bieżące `settlement-storage`,
- stan nadal oznaczający niedostarczone goods.

Accounting quantity:

- `pending` / `assigned` → `requestedQuantity`,
- `in-transit` → `claimedQuantity`,
- terminal states → `0`.

Jeżeli `uncoveredDemand <= 0`, Trader nie tworzy kolejnego orderu.

Nie zapisywać tej wartości do persistence.

## 3. Uncommitted Source Supply

Household surplus nie może zostać obiecany wielu orderom przed pickup.

Logicznie:

```text
availableSourceSurplus =
    currentHouseholdFoodSurplus
    - prePickupCommittedFood
```

`prePickupCommittedFood` obejmuje aktywne ordery z source = ten household, które nadal oczekują na pickup:

```text
pending
assigned
```

Nie odejmować `in-transit`, ponieważ po pickup goods nie należą już do source household.

Nie tworzyć osobnego reservation subsystem.

## 4. Economy-to-Transport Derived Helper

Dodać mały pure/derived boundary odpowiedzialny za wyliczenie:

```text
uncovered destination demand
uncommitted household supply
```

Może korzystać z `TransportOrders.list()` albo minimalnego query helpera w registry.

Nie dodawać globalnego ticka ani nowego persistent managera.

Jeżeli implementacja wybierze helper publiczny/architektoniczny, dodać JSDoc z ownership i `@domain settlements-npcs`.

## 5. Source Selection

Reuse istniejącego local household surplus lookup.

Flow:

```text
uncovered settlement food demand
        ↓
existing local surplus selection
        ↓
subtract pre-pickup commitments
        ↓
first deterministic usable household
```

Selection pozostaje:

```text
same settlement
nearest first
stable household id tie-break
```

Jeżeli pierwszy household ma cały surplus committed, lookup powinien przejść do następnego realnego candidate'a zamiast kończyć bez wyniku.

Nie tworzyć alternatywnego household index tylko dla 020.

## 6. Trader Integration Point

Integration point pozostaje istniejący Trader profession work flow w `src/ai/npcProfessionWork.ts`.

020 nie dodaje:

```text
TransportDemandSystem.tick()
EconomyTransportScheduler
SettlementLogisticsTick
```

Podczas normalnego `planTraderWork()` / `planTraderCollection()`:

```text
1. resume existing active order if carrier already committed,
2. otherwise derive uncovered settlement demand,
3. find source with uncommitted surplus,
4. create assigned TransportOrder for current Trader,
5. execute existing pickup / delivery path.
```

Najważniejszy guardrail:

> Nie zepsuć resume semantics istniejącego aktywnego orderu przez ponowną ocenę ekonomii przy każdym planner call.

Aktywny order jest commitmentem i ma zostać dokończony zgodnie z transport lifecycle.

## 7. Carrier Boundary

Pierwszy slice korzysta wyłącznie z aktualnego Tradera wykonującego normalny work evaluation.

Reuse `TransportOrders.findByCarrier()` / create guard.

Nie dodawać:

```text
findBestCarrier()
carrier bidding
carrier scoring
global idle NPC search
```

## 8. Quantity

Nowy order powinien mieć:

```text
requestedQuantity = min(
    uncoveredDestinationDemand,
    availableUncommittedSourceSurplus,
    existingLocalTransferCap
)
```

Reuse istniejącego bounded transfer convention (`HOUSEHOLD_EXCHANGE_MAX_TRANSFER` / aktualny Trader transfer cap).

Nie dodawać weight/capacity subsystem.

Rzeczywisty pickup nadal może być mniejszy po live revalidation.

## 9. Pickup Revalidation

Nie duplikować istniejącej transakcji.

`executeTransportPickup()` już:

- wymaga `assigned`,
- przyjmuje caller-provided live transferable quantity,
- ogranicza claim do `requestedQuantity`,
- przenosi realne items do `transportCargo`,
- failuje order przy zerowym live transferable quantity,
- nie mutuje orderu przed poprawnym transferem inventory,
- zachowuje conservation.

020 powinien tylko dostarczyć poprawnie wyliczony live surplus przy pickup.

## 10. Delivery and Feedback

Reuse istniejący `executeTransportUnload()` i aktualny settlement-storage destination resolution.

Nie modyfikować shortage bezpośrednio.

Loop:

```text
shortage
→ uncovered demand
→ TransportOrder
→ pickup
→ transport
→ unload to settlement storage
→ economy query sees new inventory
→ shortage decreases
```

## 11. Persistence and Off-screen

020 nie dodaje persistence ani off-screen execution.

To już zapewnia 019.

Nie zapisywać derived transport demand.

Po reloadzie wystarczają:

```text
SettlementEconomy state
Household inventories
active TransportOrders
NPC transportCargo
```

Economy-to-transport layer nie może zależeć od current simulation fidelity.

## 12. Determinism

Przy identycznym:

```text
shortage
active orders
household inventories
Trader
```

wynik source selection i requested quantity powinien być identyczny.

Nie używać `Math.random()` w demand/accounting/selection.

## 13. Performance

020 jest wykonywany w bounded Trader work cadence, nie per-frame.

Pierwszy slice ma lokalny zakres jednej osady.

Dopuszczalny jest mały scan `TransportOrders.list()` podczas Trader evaluation, jeżeli liczba aktywnych orderów pozostaje niewielka. Nie dodawać indeksów bez potrzeby.

Jeżeli profiling/realny scale pokaże koszt, można później rozszerzyć registry o endpoint/item indexes.

## 14. Observability

Reuse istniejący transport debug API.

Minimalnie powinno dać się ustalić:

```text
current shortage
incoming committed quantity
uncovered demand
selected source household
source surplus
pre-pickup committed quantity
requested quantity
order id/state
claimed quantity
delivered quantity
resulting shortage
```

Nie tworzyć osobnego economy transport debugger.

## 15. Tests

Dodać focused deterministic tests.

### Basic demand

```text
settlement shortage > 0
+
household uncommitted food surplus > 0
→ Trader creates assigned TransportOrder
```

### No shortage

```text
settlement shortage = 0
→ no new order
```

### Incoming covers shortage

```text
shortage = 5
active incoming commitment = 5
→ no new order
```

### Partial uncovered demand

```text
shortage = 5
active incoming commitment = 3
→ new requested quantity <= 2
```

### Source commitment

```text
household surplus = 4
pre-pickup outgoing commitment = 3
→ available source <= 1
```

### In-transit is not source reservation

```text
household current surplus = 4
old order from household is already in-transit
→ old claimed cargo is not subtracted again from household surplus
```

### Alternative source

```text
nearest household surplus fully committed
second household has uncommitted surplus
→ deterministic selection chooses second household
```

### Resume active order

```text
Trader already has assigned/in-transit order
→ planner resumes same order
→ no replacement order
```

### Pickup revalidation

```text
source selected
stock changes before pickup
→ existing pickup transaction claims current live amount or fails safely
```

### Feedback loop

```text
shortage
→ order
→ pickup
→ delivery
→ settlement food inventory increases
→ shortage decreases
```

## 16. Explicit Non-goals

Poza zakresem:

- household shortage → transport,
- production input shortage → transport,
- blacksmith supply logistics,
- cross-settlement trade,
- caravans,
- carts / horses,
- pricing,
- currency exchange,
- trader profit,
- transport bidding,
- player-created transport jobs,
- generic carrier marketplace,
- dedicated transport demand persistence,
- strategic trade routes,
- world-wide logistics planner.

## 17. Extension Path

Po tym slice ten sam mechanizm może zostać rozszerzony kolejno na:

```text
Household shortage
→ TransportOrder
```

```text
Production input shortage
→ TransportOrder
```

```text
Settlement shortage
+
remote settlement surplus
→ inter-settlement TransportOrder
```

Każdy kolejny etap powinien reuse:

```text
authoritative shortage / surplus
+
derived uncovered demand / committed supply
+
TransportOrder
```

bez równoległych logistics systems.

## Verification

### Automated

- typecheck,
- lint,
- relevant unit tests,
- build.

### Manual browser verification

Player wykonuje finalną weryfikację w browserze.

Scenariusz:

```text
1. stworzyć settlement food shortage,
2. pozostawić co najmniej dwa households z różnym food surplus,
3. pozwolić Traderowi wejść w normalny work flow,
4. potwierdzić powstanie jednego właściwego TransportOrder,
5. obserwować pickup i delivery,
6. potwierdzić wzrost settlement food inventory,
7. potwierdzić spadek shortage,
8. potwierdzić brak duplicate order przy już pokrytym incoming demand,
9. sprawdzić zachowanie po stream-out / stream-in podczas in-transit.
```

> **Zrób git commit i push do main, rebase jeżeli trzeba**