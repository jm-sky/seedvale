# Plan: Physical Goods Transport Foundation

**Created:** 2026-09-04
**Status:** `planned` 📋
**Priority:** high · **Effort:** M
**Depends on:** ~~settlements-npcs-014~~
**Domain:** `settlements-npcs`
**Type:** `feature`
**Roadmap:** `docs/roadmap/physical-goods-transport.md`

## Goal

Wprowadzić wspólny fundament fizycznego transportu dóbr oparty o world-owned `TransportOrder`, bez tworzenia osobnego systemu logistyki ani równoległego modelu inventory.

Pierwsza implementacja ma zamienić istniejący lokalny transfer:

```text
source
  ↓
NPC action closure
  ↓
pickup
  ↓
NpcAgent.carried
  ↓
travel
  ↓
destination
```

na:

```text
source
  ↓
TransportOrder
  ↓
assigned NPC
  ↓
physical pickup
  ↓
NpcAgent.carried
  ↓
physical travel
  ↓
destination
  ↓
TransportOrder.completed
```

`TransportOrder` ma być authoritative record zobowiązania transportowego.

Nie jest właścicielem ani kopią transportowanych dóbr.

Plan ma przygotować wspólny mechanizm dla kolejnych etapów:

- persistent/off-screen transport,
- economic transport demand,
- remote production-site logistics,
- carts and draft animals,
- inter-settlement transport.

Nie implementować tych etapów tutaj.

## Context

`settlements-npcs-014` wprowadził działający lokalny physical goods flow.

Przykład:

```text
producer Household
      ↓
real food surplus
      ↓
Trader
      ↓
physical pickup
      ↓
NpcAgent.carried
      ↓
physical movement
      ↓
SettlementEconomy.items
```

Istniejący flow ma już ważne właściwości:

- `Household` jest właścicielem rzeczywistych dóbr,
- `SettlementEconomy` posiada rzeczywiste destination inventory,
- NPC fizycznie dociera do source i destination,
- source jest rewalidowany przy pickup,
- claim usuwa rzeczywiste items ze source,
- po pickup goods należą do `NpcAgent.carried`,
- unload przenosi te same goods do destination,
- food freshness jest zachowywane,
- przerwany transfer nie wymaga teleportowania dóbr.

Brakuje jednak trwałego modelu samego transport commitment.

Obecnie decyzja:

```text
take goods from X
deliver them to Y
```

jest przede wszystkim częścią bieżącego NPC action flow.

To jest wystarczające dla prostego lokalnego transferu, ale słabą podstawą dla przyszłych:

- distant transports,
- off-screen execution,
- carrier reassignment,
- save/load,
- transport diagnostics,
- carts and animals,
- settlement-to-settlement logistics.

018 ma wydzielić commitment od jego fizycznego wykonania.

## Core ownership rule

Najważniejszy invariant:

```text
before pickup:
    source owns goods

after pickup:
    carrier owns goods

after unload:
    destination owns goods
```

W każdym momencie rzeczywiste goods mają dokładnie jednego właściciela.

`TransportOrder` przechowuje wyłącznie metadata dotyczące transportu.

Nigdy nie może powstać:

```text
source inventory
+
carrier inventory
+
transport inventory
```

reprezentujące te same goods.

## Design principles

### 1. TransportOrder is a commitment, not cargo storage

Order odpowiada na pytania:

```text
what
from where
to where
by whom
how much
what stage
```

Nie odpowiada za przechowywanie realnych items.

Cargo pozostaje w istniejących inventories.

### 2. Reuse Inventory

Nie tworzyć:

- `CargoInventory`,
- `TransportInventory`,
- `LogisticsInventory`.

Pierwszy physical carrier używa istniejącego:

```ts
NpcAgent.carried
```

Jeżeli przyszły off-screen transport będzie potrzebował innego persistent cargo owner, zostanie to zaprojektowane w `settlements-npcs-019`.

### 3. Reuse NPC action lifecycle

Nie tworzyć:

- `TransportFSM`,
- `CarrierAI`,
- transport-specific movement system.

Execution ma nadal korzystać z istniejącego:

```text
goTo(source)
    ↓
execute pickup
    ↓
goTo(destination)
    ↓
execute unload
```

`TransportOrder` opisuje commitment.

`NpcAgent` wykonuje commitment.

### 4. Stable references

Order nie może przechowywać runtime object references do:

- `Household`,
- `SettlementEconomy`,
- `NpcAgent`.

Source, destination i carrier powinny być reprezentowane przez stabilne IDs/refs.

Kierunek:

```ts
type TransportEndpointRef =
  | {
      type: 'household'
      householdId: string
    }
  | {
      type: 'settlement'
      settlementId: string
    }
```

Nie projektować API tak, aby późniejsze dodanie:

```text
resource site
workplace
world storage
merchant
```

wymagało przebudowy całego `TransportOrder`.

### 5. Live claim remains authoritative

Order nie rezerwuje automatycznie goods w momencie utworzenia.

Flow:

```text
order created
    ↓
carrier travels
    ↓
resolve source
    ↓
revalidate live goods
    ↓
claim actual amount
```

Actual source state w momencie pickup jest authoritative.

Dopuszczalne jest:

```text
requested = 10
available at pickup = 6
claimed = 6
```

Nie tworzyć brakujących 4 units.

### 6. Conservation over convenience

Każda operacja pickup/unload musi zachowywać:

```text
source + carrier + destination
```

Nie można:

- duplikować cargo,
- usuwać cargo przy failed pickup,
- usuwać cargo przy failed unload,
- oznaczyć order jako completed przed rzeczywistym unload.

## TransportOrder

Dodać mały domain model reprezentujący transport commitment.

Dokładne nazwy typów i plików ustalić na podstawie aktualnego codebase.

Minimalny kierunek:

```ts
interface TransportOrder {
  id: string

  source: TransportEndpointRef
  destination: TransportEndpointRef

  itemKind: ItemKind
  requestedQuantity: number
  claimedQuantity: number
  deliveredQuantity: number

  carrierNpcId?: string

  state: TransportOrderState
}
```

Nie kopiować tego przykładu mechanicznie, jeśli aktualne typy lub conventions sugerują prostszy model.

## Goods scope

018 obsługuje wyłącznie concrete inventory goods.

Pierwszy model powinien używać:

```ts
ItemKind
```

Nie wprowadzać teraz generic transport union:

```ts
ItemKind | EconomicKind
```

`EconomicStock` i concrete `Inventory` mają różne ownership/transaction semantics.

Nie scalać ich wyłącznie po to, aby `TransportOrder` wyglądał bardziej generycznie.

Pierwszy use case ma transportować realne `Inventory` items.

Rozszerzenie na bulk economic stock powinno nastąpić dopiero przy rzeczywistym przypadku użycia.

## Lifecycle

Utrzymać lifecycle mały.

Preferowany kierunek:

```text
pending
   ↓
assigned
   ↓
in-transit
   ↓
completed
```

Opcjonalne terminal states:

```text
failed
cancelled
```

tylko jeżeli są potrzebne do poprawnej domenowej semantyki.

Nie utrwalać jako persistent states chwilowych action details:

```text
picking-up
walking-to-source
unloading
walking-to-destination
```

To pozostaje stanem `NpcAgent` action lifecycle.

### `pending`

Order istnieje, ale nie ma carrier.

Goods nadal należą do source.

### `assigned`

Carrier został przypisany.

Goods nadal należą do source.

### `in-transit`

Pickup zakończył się sukcesem.

Goods znajdują się w:

```ts
NpcAgent.carried
```

### `completed`

Unload zakończył się sukcesem.

Goods znajdują się w destination.

Order nie może zostać wykonany ponownie.

## World ownership

`TransportOrder` powinien być world-owned runtime state.

Nie przechowywać authoritative order wyłącznie jako pole `NpcAgent`.

Powód:

```text
transport commitment != current NPC action
```

Wzorować ownership/lifecycle na istniejących world-owned commitment patterns, szczególnie jeśli Work Contracts oferują odpowiedni precedent.

Dodać mały registry/store odpowiedzialny za:

- create,
- lookup by ID,
- assignment,
- lifecycle mutations,
- removal/archive policy.

Preferować:

```text
Map<TransportOrderId, TransportOrder>
```

lub istniejący równoważny pattern.

Nie tworzyć `TransportManager` wykonującego globalny tick.

Registry nie odpowiada za:

- economic demand discovery,
- pathfinding,
- carrier AI,
- route planning,
- global source scans,
- global matching.

## Carrier

018 obsługuje wyłącznie NPC carrier.

Order przechowuje:

```text
npcId
```

nie `NpcAgent` reference.

Nie tworzyć teraz hierarchy typu:

```text
Carrier
 ├ NPC
 ├ Horse
 ├ Cart
 └ Caravan
```

To byłaby premature abstraction.

Model nie powinien jednak blokować późniejszego rozszerzenia carrier semantics.

## Pickup transaction

Pickup powinien wykonać:

1. Resolve `TransportOrder`.
2. Resolve source from stable ref.
3. Revalidate source availability.
4. Determine actual claim quantity.
5. Claim real items from source.
6. Attempt to put claimed items into `NpcAgent.carried`.
7. Roll back source claim if carrier cannot accept cargo.
8. Record actual `claimedQuantity`.
9. Transition order to `in-transit`.

Order może przejść do `in-transit` wyłącznie po rzeczywistym sukcesie transferu:

```text
source → carrier
```

### Partial pickup

Jeżeli source ma mniej goods niż requested:

```text
requested = 10
available = 6
```

pierwsza wersja może wykonać:

```text
claimed = 6
```

i transportować tę rzeczywistą ilość.

Nie wymagać pełnej ilości, chyba że istniejący economic flow tego wymaga.

### Concurrent claims

Nie wprowadzać source reservation scheduler.

Dopuszczalny model:

```text
Order A chooses source
Order B chooses same source

A arrives first → claims goods
B arrives later → live revalidation
```

B może otrzymać mniej lub zero.

Goods nie mogą zostać zduplikowane.

## Unload transaction

Unload powinien wykonać:

1. Resolve current order.
2. Resolve destination from stable ref.
3. Verify carrier actually owns expected cargo.
4. Attempt real transfer into destination.
5. Update delivered quantity.
6. Transition to `completed` only after successful transfer.

Jeżeli destination nie może przyjąć cargo:

```text
cargo remains with NPC
order remains non-completed
```

Nie zwracać cargo automatycznie do source.

Nie szukać w 018 alternate destination.

## Interruption semantics

### Before pickup

Jeżeli NPC action zostaje przerwany:

```text
goods remain in source
```

Order może pozostać `assigned` i zostać ponownie podjęty zgodnie z istniejącym NPC commitment/action handling.

### After pickup

Jeżeli NPC action zostaje przerwany:

```text
goods remain in NpcAgent.carried
order remains in-transit
```

Nie:

```text
refund goods to source
```

tylko dlatego, że movement/action zostało przerwane.

Pełne recovery, unload/reload i death handling nie należą do 018.

## First vertical slice

Pierwszy vertical slice ma być migracją istniejącego Trader collection flow.

```text
Household
    ↓
food surplus
    ↓
TransportOrder
    ↓
Trader
    ↓
physical pickup
    ↓
NpcAgent.carried
    ↓
physical travel
    ↓
SettlementEconomy.items
    ↓
completed
```

To nie jest nowa funkcjonalność ekonomiczna.

Celem jest udowodnienie:

```text
existing physical transport
+
reusable TransportOrder
+
explicit ownership lifecycle
```

bez regresji `settlements-npcs-014`.

Remote resource transport nie należy do tego planu.

## Integration with settlements-npcs-014

Nie budować drugiego transport flow obok istniejącego Trader collection.

Zidentyfikować obecny path dla:

```text
Household surplus
→ Trader pickup
→ settlement delivery
```

i przenieść odpowiedzialność za commitment do nowego `TransportOrder`.

Nadal reuse:

- existing surplus discovery,
- bounded source lookup,
- existing NPC movement,
- live source revalidation,
- existing `Inventory`,
- existing freshness handling,
- existing carried inventory,
- destination resolution.

`TransportOrder` dodaje wyłącznie brakującą warstwę:

- durable runtime identity,
- explicit endpoints,
- carrier assignment,
- lifecycle,
- actual claimed/delivered quantity.

Po migracji nie powinny istnieć równoległe:

```text
legacy Trader transport flow
new TransportOrder flow
```

dla tego samego przypadku.

## Generic item transfer

Podczas implementacji ocenić, czy istniejące food-specific helpers należy pozostawić, czy wydzielić mały reusable Inventory transfer primitive.

Generic helper można wprowadzić tylko jeśli upraszcza istniejący kod i jest potrzebny do poprawnego `TransportOrder`.

Powinien zachować:

- `ItemKind`,
- quantity,
- freshness/metadata,
- rollback semantics,
- capacity constraints.

Nie wykonywać szerokiego refactoru całego Inventory API.

## Failure semantics

018 ma obsłużyć tylko failures potrzebne dla physical vertical slice.

### Source disappeared / cannot resolve

Nie tworzyć cargo.

Order może zostać anulowany/failed zgodnie z minimalnym lifecycle.

### Source has zero goods

Nie tworzyć cargo.

### Carrier capacity failure

Source claim musi zostać cofnięty albo transfer musi być skonstruowany tak, aby source nie stracił goods.

### Destination unavailable

Cargo pozostaje z carrier.

Order nie jest completed.

### Duplicate execution

Completed order nie może ponownie claimować ani deliverować cargo.

## Explicit boundary: no persistence yet

`TransportOrder` ma być zaprojektowany jako persistable domain state, ale 018 nie dodaje pełnej save/load persistence.

W szczególności 018 nie rozwiązuje problemu:

```text
save while:
order = in-transit
cargo = NpcAgent.carried
```

jeżeli `NpcAgent.carried` nie posiada obecnie odpowiedniej persistent ownership representation.

Nie dodawać częściowego rozwiązania, które pozwalałoby zapisać order bez możliwości bezpiecznego odtworzenia cargo.

Persistence oraz ownership cargo przy unloaded NPC należą do:

```text
settlements-npcs-019
Persistent & Off-screen Transport
```

## Explicit boundary: no off-screen execution

018 działa na aktywnie symulowanym NPC.

Nie implementować:

- settlement unload continuation,
- abstract travel timers,
- time skip transport completion,
- carrier fidelity transitions,
- long-distance elapsed-time simulation.

Order model powinien być gotowy do ich dodania, ale nie wykonywać ich teraz.

## Performance

Nie dodawać globalnego per-frame transport tick.

NPC wykonują transport poprzez istniejący action flow.

Order registry powinien zapewniać bezpośredni lookup po ID.

Unikać:

- scanning all orders for every NPC,
- scanning all NPCs for every order,
- global source scans,
- global destination scans,
- global path searches.

Pierwszy flow już posiada source i destination wynikające z istniejącej lokalnej ekonomii.

## Files and systems to inspect

Przed implementacją sprawdzić aktualny kod, szczególnie:

- `src/ai/NpcAgent.ts`
- `src/items/Inventory.ts`
- `src/items/foodItems.ts`
- `src/settlement/household.ts`
- `src/economy/settlementEconomy.ts`
- Trader collection flow
- household exchange hooks
- storage destination resolution
- NPC action lifecycle
- existing runtime world-owned registries/stores
- Work Contracts ownership/lifecycle pattern
- NPC carried inventory capacity/failure behaviour

Nie zakładać nowych nazw plików przed reconem.

## Implementation stages

### Stage 1 — Transport domain model

- Define `TransportOrder`.
- Define stable transport endpoint refs.
- Define minimal lifecycle.
- Restrict first cargo specification to concrete `ItemKind`.
- Add world-owned runtime order registry/store.
- Add deterministic create/lookup/update operations.
- Add lifecycle invariant tests.

### Stage 2 — NPC physical execution

Integrate order execution with existing NPC actions:

```text
assigned order
    ↓
goTo source
    ↓
live claim
    ↓
NpcAgent.carried
    ↓
in-transit
    ↓
goTo destination
    ↓
unload
    ↓
completed
```

Do not introduce separate movement logic.

### Stage 3 — Transaction safety

Ensure pickup and unload preserve exact goods conservation.

Cover:

- partial source availability,
- carrier capacity failure,
- rollback,
- destination failure,
- duplicate execution.

Reuse existing food/freshness helpers where practical.

### Stage 4 — Migrate Trader vertical slice

Migrate existing household surplus collection to `TransportOrder`.

Preserve existing economic selection behaviour.

Do not add new transport demand generation.

Verify that the resulting path still physically collects and delivers the same goods.

### Stage 5 — Cleanup and observability

Remove or merge redundant legacy state from the migrated flow.

Expose minimal debug information for an order:

```text
id
state
source
destination
item
requested
claimed
delivered
carrier
```

Reuse existing debug tooling where possible.

Do not add a dedicated transport UI.

## Automated verification

Add focused tests for:

- order creation,
- source/destination refs,
- carrier assignment,
- valid lifecycle transitions,
- invalid lifecycle transitions,
- source resolution failure,
- zero source availability,
- partial claim,
- concurrent live claims,
- carrier capacity failure,
- pickup rollback,
- successful pickup,
- interruption after pickup preserving carrier ownership,
- successful unload,
- destination rejection,
- duplicate unload prevention,
- completed order cannot run again,
- exact quantity conservation,
- freshness conservation.

Core conservation invariant:

```text
source_before
+ carrier_before
+ destination_before

=

source_after
+ carrier_after
+ destination_after
```

for every completed or interrupted transaction.

## Manual verification

Player performs browser verification.

Suggested scenario:

```text
Household produces food surplus
        ↓
Trader receives order
        ↓
Trader walks to Household
        ↓
real items disappear from source
        ↓
same items appear in carried inventory
        ↓
Trader walks to settlement storage
        ↓
items leave carried inventory
        ↓
items appear in SettlementEconomy
        ↓
TransportOrder becomes completed
```

Verify also an interrupted/failed pickup case:

```text
source becomes unavailable before arrival
        ↓
no goods created
        ↓
order does not enter in-transit
```

## Explicit non-goals

Do not implement in this plan:

- `SaveData` integration for transport,
- persistent in-transit cargo ownership,
- settlement unload/reload transport continuation,
- off-screen transport,
- time skip transport,
- economic transport demand generation,
- production-demand matching,
- remote production-site logistics,
- mine → settlement logistics,
- inter-settlement logistics,
- automatic carrier selection across the world,
- carrier reassignment,
- carts,
- wagons,
- horses/donkeys as cargo carriers,
- caravans,
- travelling merchants,
- road networks,
- global route planning,
- dynamic pricing,
- market simulation,
- `LogisticsSystem`,
- globally ticking `TransportManager`,
- generic carrier hierarchy,
- cargo recovery after NPC death.

## Follow-up plans

```text
settlements-npcs-018
Physical Goods Transport Foundation
        ↓
settlements-npcs-019
Persistent & Off-screen Transport
        ↓
settlements-npcs-020
Economic Transport Demand Integration
        ↓
settlements-npcs-021
Remote Production Site Logistics
```

018 establishes the physical transport contract.

019 makes that contract survive simulation fidelity boundaries.

020 connects it to actual economic pressures.

021 uses the resulting system for a genuinely distant production/logistics flow.

## Success criteria

The plan is complete when:

1. `TransportOrder` is the authoritative runtime representation of a physical transport commitment.
2. Orders use stable source, destination and carrier references.
3. First cargo type uses existing concrete `ItemKind` goods.
4. Existing NPC actions execute pickup, travel and unload.
5. Actual cargo ownership follows:

   ```text
   source → NpcAgent.carried → destination
   ```

6. `TransportOrder` never duplicates real inventory state.
7. Live pickup revalidation prevents stale claims.
8. Failed pickup cannot silently delete goods.
9. Failed unload cannot silently delete goods.
10. Completed order cannot deliver twice.
11. Existing Trader household-surplus flow uses the shared `TransportOrder` foundation.
12. Existing local economic behaviour remains unchanged.
13. No global transport tick, logistics manager or parallel inventory is introduced.
14. The domain model can be extended by `settlements-npcs-019` without redesigning the core ownership/lifecycle contract.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
