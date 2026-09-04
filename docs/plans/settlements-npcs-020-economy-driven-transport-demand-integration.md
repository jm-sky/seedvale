# Plan: Economy-driven Transport Demand Integration

**Created:** 2026-09-04  
**Status:** `draft` 📝  
**Type:** feature  
**Priority:** high · **Effort:** S/M  
**Depends on:** settlements-npcs-018, settlements-npcs-019  
**Domain:** `settlements-npcs`  
**Subdomains:** `economy` `logistics`  
**Tags:** `transport` `shortage` `surplus` `trader`  
**Roadmap:** `docs/roadmap/physical-goods-transport.md`  

## Status Note

Ten plan pozostaje w statusie `draft`, dopóki `settlements-npcs-018` i `settlements-npcs-019` nie zostaną zaimplementowane.

`018` i `019` definiują fundamenty, od których zależy ten plan:

```text
TransportOrder
transport ownership / registry
pickup / cargo / delivery semantics
active-order lifecycle
persistence
off-screen progression
NPC transport commitment
```

Nazwy i API opisane w `018` i `019` są obecnie kontraktami projektowymi, a nie source of truth implementacji.

Przed zmianą statusu tego planu na `planned` należy wykonać focused recon faktycznie zaimplementowanego kodu `018`–`019`, a także ponownie sprawdzić post-018 local circulation / Trader flow z `settlements-npcs-014`.

## Goal

Połączyć istniejący stan ekonomii osady z fizycznym transportem tak, aby realny shortage mógł prowadzić do powstania realnego `TransportOrder`.

Pierwszy vertical slice:

```text
SettlementEconomy food shortage
        ↓
derived uncovered transport opportunity
        ↓
Household food surplus
        ↓
Trader evaluates opportunity during normal work
        ↓
TransportOrder
        ↓
physical / off-screen transport
        ↓
authoritative settlement food inventory mutation
        ↓
shortage decreases naturally
```

Plan nie tworzy osobnego `TradeSystem`, `TransportDemandRegistry`, market stock ani równoległego modelu ekonomii.

Ekonomia pozostaje źródłem powodów do transportu.

Transport pozostaje mechanizmem realizacji przepływu dóbr.

## Current State

Aktualny kod posiada już fundamenty pierwszego slice:

### Settlement economy

`SettlementEconomy` posiada:

```text
query(kind)
shortage(kind)
surplus(kind)
hasShortage(kind)
hasSurplus(kind)
```

Shortage jest derived state względem `SettlementDemand.target`.

Dla `food` `SettlementEconomy.query('food')` odczytuje rzeczywiste concrete food items przechowywane w settlement-level `Inventory`.

Oznacza to, że po poprawnej dostawie nie potrzeba osobnego feedback state:

```text
food delivered
    ↓
authoritative settlement inventory changes
    ↓
query('food') changes
    ↓
shortage('food') changes automatically
```

### Household economy

`Household` posiada:

```text
shortage(kind)
shouldAcquire(kind)
surplus(kind)
```

Dla `food` stan również pochodzi z realnego `Household.items`.

### Local goods circulation

`settlements-npcs-014` posiada już działający lokalny przepływ:

```text
Household surplus
    ↓
Trader
    ↓
SettlementEconomy
```

Istniejący household surplus lookup:

- działa lokalnie w obrębie osady,
- wybiera household posiadający realny surplus,
- używa deterministic nearest-first selection,
- posiada stabilny tie-break przez household id,
- ponownie waliduje live surplus przy rzeczywistym claimie.

### Trader

Trader już wykonuje własne profession work evaluation przez istniejący NPC work flow.

Nie potrzeba osobnego economy tick ani transport scheduler tylko dla tego planu.

Trader nie jest jednak właścicielem transport demand. Jest pierwszym aktorem, który podczas normalnego work evaluation może zauważyć i zrealizować istniejącą ekonomicznie okazję do transportu.

### Missing transport integration

Obecny local circulation wykonuje transport bez world-owned persistent transport order.

`018` i `019` mają dostarczyć tę warstwę.

Ten plan ma podłączyć istniejącą ekonomię do tego mechanizmu.

## Architectural Goal

Docelowa zależność:

```text
authoritative economy state
    ↓
derived transport opportunity
    ↓
existing NPC work decision
    ↓
TransportOrder
    ↓
transport execution
    ↓
real inventory mutation
    ↓
new economy state
```

Kluczowy invariant:

```text
Transport demand is derived from authoritative economy state.
```

Nie przechowywać osobnego, trwałego:

```text
TransportDemand
EconomicDeliveryNeed
TradeRequest
SettlementImportRequest
```

jeżeli stan może zostać wyliczony z:

```text
shortage
surplus
active TransportOrders
```

Nie trzeba również tworzyć `TransportOpportunity` jako trwałego typu lub registry, jeżeli pierwszy slice może wyliczać małego lokalnego candidate'a na żądanie.

## 1. Focused Recon after 018–019

Przed implementacją sprawdzić faktycznie zaimplementowane API:

- `TransportOrder` shape,
- transport registry ownership,
- order lifecycle,
- source ownership przed pickup,
- cargo ownership po pickup,
- destination resolution i delivery semantics,
- aktywne order queries,
- carrier assignment,
- NPC commitment rules,
- cancellation / failure,
- persistence,
- off-screen progression,
- reconstruction po stream-in / load.

Następnie ponownie sprawdzić `settlements-npcs-014` i aktualny Trader/local circulation flow, ponieważ `018` ma go zmigrować na `TransportOrder` i obecne granice mogą już nie istnieć w tej samej postaci.

Plan należy dopasować do kodu.

Nie kopiować mechanicznie nazw ani API z draftów `018` i `019`.

## 2. First Supported Demand: Settlement Food Shortage

Pierwsza implementacja obsługuje wyłącznie:

```text
SettlementEconomy shortage('food')
```

Nie dodawać w tym planie:

- household shortage transport,
- production input transport,
- generic resource marketplace,
- cross-settlement trade,
- dynamic pricing,
- caravan planning,
- transport priorities pomiędzy wieloma klasami demand.

Pierwszy przypadek ma być mały i kompletny.

Warunek wejściowy:

```text
economy.shortage('food') > 0
```

ale rzeczywista ilość potrzebna do transportu musi uwzględniać już aktywne dostawy.

## 3. Uncovered Demand and Committed Supply

Nie rezerwować ekonomicznego stocku tylko dlatego, że istnieje transport opportunity.

Wartości potrzebne do anti-over-ordering pozostają derived queries, a nie persistent economic state.

### Destination side

Wyliczyć logicznie:

```text
needed =
    currentSettlementShortage
    - goodsAlreadyCommittedTowardDestination
```

`goodsAlreadyCommittedTowardDestination` oznacza aktywne transporty, których cargo nadal ma dotrzeć do tej osady jako food.

Dokładne lifecycle states należy dopasować do implementacji 018–019.

Jeżeli:

```text
needed <= 0
```

nie tworzyć kolejnego orderu.

### Source side

Analogicznie source household nie może obiecać tego samego surplusu wielu transportom.

Wyliczyć logicznie:

```text
available =
    currentHouseholdSurplus
    - goodsAlreadyCommittedForPickupFromSource
```

Po realnym pickup cargo nie należy już do household source.

Dlatego source-side commitment powinien uwzględniać tylko transporty, które nadal oczekują na pickup.

Nie tworzyć osobnego persistent reservation record ani commitment subsystem.

## 4. Source Selection

Reuse istniejącego lokalnego household surplus lookup.

Preferowany flow:

```text
uncovered settlement food shortage
        ↓
existing local household surplus lookup
        ↓
household with food surplus
        ↓
subtract active pre-pickup commitments
        ↓
usable source
```

Jeżeli istniejący lookup po implementacji 018 nie uwzględnia active transport commitments, rozszerzyć istniejący mechanizm albo dodać mały adapter wokół niego.

Nie tworzyć drugiego world-wide household search.

Selection pozostaje:

```text
same settlement
nearest first
stable id tie-break
deterministic
```

## 5. Evaluation Cadence

Pierwsza wersja nie posiada osobnego:

```text
TransportDemandSystem.tick()
EconomyTransportScheduler
SettlementLogisticsTick
```

Opportunity istnieje semantycznie niezależnie od Tradera, bo wynika z economy state.

W pierwszym vertical slice jest jednak oceniana podczas istniejącego Trader profession work flow.

```text
Trader enters normal work decision
        ↓
evaluate existing economy-derived opportunity
        ↓
find suitable household surplus
        ↓
create / accept TransportOrder
```

Dzięki temu:

- nie powstaje dodatkowy global tick,
- system pozostaje bounded,
- decyzja jest częścią normalnego życia NPC,
- player/camera nie sterują ekonomią,
- przyszły inny carrier może reuse ten sam economy-to-transport boundary bez wiązania demand z rolą Trader.

## 6. Local Circulation Migration Boundary

Po implementacji `018` należy zidentyfikować faktyczną granicę pomiędzy:

```text
economic decision
```

a:

```text
transport execution
```

w aktualnym post-018 Trader/local circulation flow.

020 powinien zmienić wyłącznie warunek ekonomiczny prowadzący do transportu:

```text
settlement has uncovered food shortage
+
source household has uncommitted food surplus
→ create / accept TransportOrder
```

Nie utrzymywać równolegle legacy carry flow i `TransportOrder` flow dla tego samego przypadku.

Nie zakładać przed reconem, że dzisiejsze `beginTraderCollection()` albo inne obecne metody nadal będą właściwym integration point.

## 7. Carrier Boundary

Pierwszy slice nie tworzy generic carrier marketplace.

Carrierem jest Trader, który właśnie wykonuje własne normalne work evaluation.

Nie dodawać:

```text
findBestCarrier()
carrier bidding
carrier scoring
global idle NPC search
```

Minimalna zasada:

```text
current Trader
    ↓
can accept transport commitment?
    ↓
yes → create / accept order
no  → skip
```

Reuse aktualnych NPC commitment / availability rules po implementacji `018`–`019`.

Nie integrować transportu z `WorkContractRecord` samym w sobie. Work Contracts są jedynie precedentem dla zasady, że NPC nie powinien posiadać sprzecznych aktywnych commitmentów.

## 8. Quantity

Transport amount powinien być ograniczony przez:

```text
uncovered destination shortage
available uncommitted source surplus
existing transport/order capacity
```

czyli logicznie:

```text
amount = min(
    needed,
    available,
    carrierOrOrderCapacity
)
```

Jeżeli 018 nie posiada jawnej capacity semantics, wykorzystać istniejący bounded transfer convention z local goods circulation zamiast projektować nowy capacity subsystem.

Nie dodawać nowego weight/logistics model tylko na potrzeby 020.

## 9. Pickup Revalidation

Source selection nie gwarantuje, że goods nadal istnieją przy pickup.

Przed pickup:

```text
re-read live household surplus
re-check order state
re-check source ownership
```

Jeżeli goods zniknęły, zachować conservation zgodnie z lifecycle z 018–019, np. przez partial pickup albo fail/cancel order, zależnie od rzeczywistego transport contract.

Nie tworzyć goods z powietrza.

Nie pozwolić na ujemny inventory.

## 10. Delivery and Economy Feedback

Delivery musi użyć authoritative destination resolution i mutation boundary dostarczonego przez zaimplementowane `018`.

Docelowo:

```text
TransportOrder cargo
    ↓
destination resolution from transport foundation
    ↓
authoritative settlement food inventory mutation
    ↓
SettlementEconomy.query / shortage changes
```

Obecne `SettlementEconomy.depositFood(...)` jest przykładem aktualnego mutation API, ale 020 nie może omijać abstraction wprowadzonej przez 018, jeżeli transport foundation dostarczy wspólny destination delivery seam.

Nie modyfikować shortage bezpośrednio.

To zamyka pierwszy pełny loop:

```text
shortage
    ↓
transport opportunity
    ↓
TransportOrder
    ↓
pickup / transport / delivery
    ↓
real inventory mutation
    ↓
lower shortage
```

## 11. No Persistent Demand State

Nie zapisywać osobnego transport-demand state do save.

Po reloadzie authoritative:

```text
SettlementEconomy
+
Households
+
active TransportOrders
```

powinny wystarczyć do ponownego wyliczenia uncovered demand i available uncommitted supply.

## 12. Off-screen Compatibility

020 nie implementuje off-screen transport.

To należy do `019`.

020 musi jedynie tworzyć taki sam `TransportOrder` niezależnie od tego, czy później zostanie wykonany przez detailed physical simulation czy off-screen progression.

Economy layer nie może znać aktualnej fidelity transportu.

## 13. Determinism

Przy identycznym stanie świata:

```text
same shortage
same active orders
same household surplus
same Trader
```

selection powinien prowadzić do tego samego source/order candidate.

Unikać `Math.random()` w:

- demand evaluation,
- source selection,
- committed-supply accounting,
- carrier acceptance.

Reuse deterministic nearest-first + stable-id conventions istniejącego local exchange.

## 14. Performance

Nie wykonywać:

```text
all settlements
×
all households
×
all goods
×
all NPCs
×
every frame
```

Pierwszy slice jest ograniczony przez istniejący Trader work cadence.

Source search pozostaje lokalny dla jednej osady.

Active-order queries powinny reuse registry/indexy z 018–019. Jeżeli takich query nie ma, dodać minimalny query/index helper potrzebny do tego use case zamiast pełnego global scan w hot path.

## 15. Observability

Dodać tylko minimalną diagnostykę potrzebną do zweryfikowania pełnej pętli.

Powinno dać się ustalić:

```text
settlement shortage
uncovered shortage
selected source household
source surplus
pre-pickup outgoing commitments
incoming commitments
created TransportOrder
pickup
delivery
resulting shortage
```

Reuse transport/domain history/debug tooling z 018–019.

Nie tworzyć osobnego economy transport debugger, jeśli obecne narzędzia wystarczą.

## 16. Tests

Dodać focused deterministic tests obejmujące co najmniej:

### Basic demand

```text
settlement food shortage
+
household food surplus
→ transport order can be created
```

### No shortage

```text
settlement has enough food
→ no order
```

### No source

```text
settlement shortage
+
no household surplus
→ no order
```

### Destination commitment

```text
shortage = 5
active incoming = 5
→ no additional order
```

### Partial uncovered demand

```text
shortage = 5
active incoming = 3
→ max new demand = 2
```

### Source commitment

```text
household surplus = 4
active pre-pickup outgoing = 3
→ max available source = 1
```

### Pickup revalidation

```text
source selected
goods consumed before pickup
→ no duplication / no negative stock
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

### Determinism

Ten sam stan świata powinien wybrać ten sam source.

## 17. Explicit Non-goals

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

Te przypadki mogą rozszerzyć ten sam mechanizm później.

## 18. Extension Path

Po zamknięciu pierwszego slice ten sam wzorzec może zostać rozszerzony:

```text
Household shortage
    ↓
TransportOrder
```

następnie:

```text
Production input shortage
    ↓
TransportOrder
```

i później:

```text
Settlement shortage
    ↓
other settlement surplus
    ↓
inter-settlement transport
```

Każdy kolejny etap powinien reuse:

```text
authoritative shortage / surplus
+
derived uncovered demand / committed supply
+
TransportOrder
```

bez tworzenia równoległych logistics systems.

## 19. Implementation Documentation

Jeżeli implementacja doda ważne publiczne lub architektoniczne helpery odpowiedzialne za economy-to-transport boundary, active-order queries albo transport-opportunity derivation, dodać zwięzły JSDoc opisujący ownership i responsibility.

Tam gdzie pomaga to AI preflight / code discovery, użyć odpowiedniego `@domain` tagu zgodnie z istniejącymi conventions.

Nie dodawać JSDoc mechanicznie do lokalnych lub oczywistych helperów.

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
2. pozostawić household z food surplus,
3. pozwolić Traderowi wejść w normalny work flow,
4. potwierdzić powstanie TransportOrder,
5. obserwować pickup,
6. obserwować transport,
7. obserwować delivery,
8. potwierdzić wzrost settlement food inventory,
9. potwierdzić spadek shortage,
10. potwierdzić brak duplicate order po pokryciu demand.
```

## Draft Exit Criteria

Plan może zmienić status z `draft` na `planned` dopiero gdy:

- `settlements-npcs-018` jest zaimplementowany,
- `settlements-npcs-019` jest zaimplementowany,
- wykonano focused recon ich aktualnego kodu,
- wykonano ponowny recon post-018 Trader/local circulation flow z `settlements-npcs-014`,
- zidentyfikowano rzeczywistą granicę między economic decision i transport execution,
- potwierdzono rzeczywiste `TransportOrder` lifecycle/API,
- potwierdzono NPC transport commitment semantics,
- potwierdzono active-order query / accounting możliwości,
- zaktualizowano ten plan do rzeczywistych nazw typów i plików.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
