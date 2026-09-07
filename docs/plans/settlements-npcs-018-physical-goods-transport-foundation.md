# Plan: Physical Goods Transport Foundation

**Created:** 2026-09-04
**Status:** `planned` 📋
**Priority:** high · **Effort:** M
**Depends on:** ~~settlements-npcs-014~~
**Domain:** `settlements-npcs`
**Type:** `feature`
**Roadmap:** `physical-goods-transport`

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

Pierwszy vertical slice wymaga dokładnie dwóch endpoint variants:

```ts
type TransportEndpointRef =
  | {
      type: 'household'
      householdId: HouseholdId
    }
  | {
      type: 'settlement-storage'
      settlementId: string
    }
```

`householdId` identyfikuje authoritative owner `Household.items`. `settlementId` identyfikuje authoritative owner `SettlementEconomy.items`; endpoint nie przechowuje runtime economy reference ani world position.

Pozycja fizycznego pickup/unload jest projekcją endpointu rozwiązywaną przez istniejące home/storage landmarks. Nie jest częścią identity endpointu i nie może zastępować ID.

Pierwszy slice nie potrzebuje generic `{ type, id }` ani arbitrary endpoint registry. Rozszerzenie union o kolejne konkretne variants ma być możliwe bez zmiany semantyki `TransportOrder`.

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

  carrierNpcId: string | null

  state: TransportOrderState
}
```

Nie kopiować tego przykładu mechanicznie, jeśli aktualne typy lub conventions sugerują prostszy model.

Dla pierwszego slice `requestedQuantity` jest immutable po utworzeniu. `claimedQuantity` zmienia się dokładnie raz, przy udanym pickup, a `deliveredQuantity` dokładnie raz, przy udanym unload.

Obowiązuje:

```text
0 <= deliveredQuantity <= claimedQuantity <= requestedQuantity
```

W pierwszym slice jeden order reprezentuje jeden concrete `ItemKind`; po successful pickup obowiązuje `claimedQuantity > 0`, a successful completion wymaga `deliveredQuantity === claimedQuantity`.

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

Dla Trader collection pierwszy order powinien dotyczyć jednego deterministycznie wybranego concrete food `ItemKind`, a nie agregatu `food` obejmującego wiele kinds. Dzięki temu order nie potrzebuje manifestu cargo ani batches jako authoritative state.

Rozszerzenie na bulk economic stock albo multi-kind cargo powinno nastąpić dopiero przy rzeczywistym przypadku użycia.

## Lifecycle

Utrzymać lifecycle mały:

```text
pending
   ↓
assigned
   ↓
in-transit
   ↓
completed
```

Terminal pre-pickup failures:

```text
pending/assigned → cancelled
assigned         → failed
```

`failed` oznacza, że konkretnego ordera nie da się już wykonać bez ponownego utworzenia commitmentu, np. source endpoint nie istnieje albo live pickup daje zero goods. `cancelled` oznacza świadome wycofanie commitmentu zanim cargo zmieni ownera.

Nie utrwalać jako states chwilowych action details:

```text
picking-up
walking-to-source
unloading
walking-to-destination
```

To pozostaje stanem NPC action lifecycle.

### Exact lifecycle matrix

| Order state | Cargo owner | Carrier assignment | Dozwolone transitions | Invariants | Recovery po interruption |
|---|---|---|---|---|---|
| `pending` | source | `null` | `assigned`, `cancelled` | `claimed=0`, `delivered=0`; source/destination/request immutable | brak cargo do recovery; order może czekać lub zostać anulowany |
| `assigned` | source | dokładnie jeden `carrierNpcId` | `in-transit`, `failed`, `cancelled` | `claimed=0`, `delivered=0`; carrier nie ma jeszcze cargo tego ordera | temporary action interruption nie zmienia ordera; ten sam carrier może wznowić pickup; genuine abandonment przed pickup może zwolnić assignment do `pending` tylko jeśli implementacja tego potrzebuje, bez zmiany ownership |
| `in-transit` | assigned carrier | ten sam `carrierNpcId` | `completed` | `claimed>0`, `delivered=0`; carrier musi rzeczywiście posiadać claimed cargo; source nie posiada już tych units | interruption nie zmienia lifecycle; cargo zostaje u carrier, order pozostaje `in-transit`; nie wolno release/cancel/fail, jeżeli skutkiem byłoby pozostawienie cargo bez commitmentu |
| `completed` | destination | historyczne `carrierNpcId` może pozostać dla diagnostics | brak | `delivered=claimed>0`; cargo nie jest już u carrier; terminal/idempotent | brak recovery; każde ponowne pickup/unload jest rejected/no-op |
| `failed` | source | assignment może pozostać jako diagnostyczne albo zostać wyczyszczone atomowo | brak | `claimed=0`, `delivered=0`; nic nie opuściło source | terminal; nowa próba wymaga nowego ordera po ponownej ocenie świata |
| `cancelled` | source | `null` po anulowaniu | brak | `claimed=0`, `delivered=0`; anulowanie po pickup jest niedozwolone w 018 | terminal; cargo recovery nie istnieje, bo cancel wolno wykonać tylko przed pickup |

Dla 018 temporary action interruption i domain failure to różne pojęcia. Przerwanie `PlannedAction` nie powinno automatycznie mutować `TransportOrder`, tak jak chwilowe interruption WorkContract nie oznacza abandonment commitmentu.

Po przejściu do `in-transit` jedyną poprawną terminalizacją w 018 jest rzeczywisty successful unload do destination. Death/rebuild/off-screen cases wymagające innego recovery należą do 019.

## World ownership

`TransportOrder` powinien być world-owned runtime state.

Nie przechowywać authoritative order wyłącznie jako pole `NpcAgent`.

Powód:

```text
transport commitment != current NPC action
```

Wzorować ownership/lifecycle na istniejącym WorkContract patternie tylko w zakresie:

- pure domain record,
- stable IDs,
- world-owned registry,
- centralnie walidowane transitions,
- lookup commitmentu po stable carrier ID.

Nie kopiować WorkContract persistence/rebuild semantics mechanicznie: aktywny transport ma realne cargo w `NpcAgent.carried`, które w 018 nie jest jeszcze persistent ownerem.

Dodać mały registry/store odpowiedzialny za:

- create,
- lookup by ID,
- assignment,
- lifecycle mutations,
- bounded lookup active order by carrier,
- removal/archive policy.

Pierwszy slice ma invariant:

```text
at most one non-terminal TransportOrder per carrierNpcId
```

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

Pickup jest jedną domenową transakcją `source → carrier`, nawet jeśli implementacyjnie używa istniejących Inventory primitives.

Preconditions:

- order istnieje i jest `assigned`,
- wykonujący NPC ma ID równe `carrierNpcId`,
- source endpoint daje się resolve,
- `claimedQuantity === 0`,
- carrier nie posiada już cargo tego ordera.

Transaction:

1. Resolve `TransportOrder`.
2. Resolve source from stable ref.
3. Revalidate exact `itemKind` availability/surplus.
4. `actual = min(requestedQuantity, live transferable quantity)`.
5. Jeżeli `actual <= 0`, niczego nie usuwać i zakończyć order jako `failed`.
6. Sprawdzić carrier capacity dla całego `actual` przed commit, jeżeli istniejące API na to pozwala.
7. Claim real items + freshness metadata ze source.
8. Umieścić dokładnie claimowane units w `NpcAgent.carried`.
9. Jeżeli add do carrier nie powiedzie się po source removal, atomowo odtworzyć source z tymi samymi freshness batches; order pozostaje `assigned` albo przechodzi `failed` zgodnie z przyczyną, ale `claimedQuantity` pozostaje `0`.
10. Dopiero po rzeczywistym sukcesie ustawić `claimedQuantity = actual` i przejść `assigned → in-transit`.

Nie wolno ustawić `claimedQuantity` na ilość tylko wybraną/zdjętą tymczasowo. To ilość faktycznie przejęta przez carrier.

### Partial pickup

Partial pickup jest dozwolony względem requested quantity:

```text
requested = 10
live transferable = 6
carrier can hold 6
→ claimed = 6
→ in-transit
```

Nie ma drugiego pickup dla pozostałych 4 units w tym samym orderze. Po pierwszym successful pickup request zostaje zamknięty do faktycznie claimed amount; pozostałe zapotrzebowanie może później wygenerować nowy order.

Carrier capacity nie tworzy dodatkowego rodzaju partial pickup w pierwszym slice. Jeżeli wybrane `actual` nie mieści się w całości, transakcja nie może częściowo zdjąć source i częściowo oddać reszty jako ukryte zachowanie. Najpierw ograniczyć `actual` do legalnej ilości na podstawie jawnej polityki albo odrzucić pickup i zachować source bez zmian.

Dla Trader vertical slice preferować bounded quantity, która mieści się w carrier, zamiast wprowadzać nowy capacity-driven split policy.

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

Unload jest jedną domenową transakcją `carrier → destination`.

Preconditions:

- order istnieje i jest `in-transit`,
- wykonujący NPC odpowiada `carrierNpcId`,
- `claimedQuantity > 0`,
- `deliveredQuantity === 0`,
- destination endpoint daje się resolve,
- carrier faktycznie posiada co najmniej `claimedQuantity` orderowego `itemKind` wraz z metadata potrzebną do zachowania freshness.

Transaction:

1. Resolve current order.
2. Resolve destination from stable ref.
3. Sprawdzić destination acceptance/capacity zanim cargo zostanie bezpowrotnie usunięte z carrier, albo użyć remove + exact rollback.
4. Przenieść dokładnie `claimedQuantity` z carrier do destination z zachowaniem freshness/metadata.
5. Dopiero po rzeczywistym sukcesie ustawić `deliveredQuantity = claimedQuantity`.
6. Transition `in-transit → completed` wykonać atomowo z zaakceptowanym transferem.

Destination rejection/unavailability:

```text
carrier retains all cargo
claimed unchanged
delivered = 0
state = in-transit
```

Nie zwracać cargo automatycznie do source. Nie szukać alternate destination w 018.

Jeżeli precondition „carrier owns expected cargo” jest złamany, nie tworzyć brakujących goods i nie oznaczać ordera jako completed. To jest invariant violation wymagający diagnostyki; 018 nie może naprawiać go przez mint/refund z order metadata.

### Duplicate execution / idempotency

- pickup wolno wykonać tylko w `assigned`; każde wywołanie dla `in-transit`/terminal state jest rejected/no-op bez Inventory mutation,
- unload wolno wykonać tylko w `in-transit` z `deliveredQuantity === 0`,
- `completed`, `failed` i `cancelled` są terminalne,
- ponowne callback execution po lifecycle transition nie może drugi raz usuwać/dodawać goods,
- order mutation i inventory mutation muszą być uporządkowane tak, aby żaden callback retry nie mógł zobaczyć stanu pozwalającego powtórzyć już committed transfer.

## Interruption semantics

### Before pickup

Jeżeli NPC action zostaje przerwany:

```text
goods remain in source
order remains assigned
```

Temporary interruption nie oznacza release assignmentu. Carrier po re-evaluation powinien wznowić ten sam non-terminal commitment zamiast tworzyć drugi order.

Jeżeli carrier naprawdę nie może już wykonać ordera przed pickup, order może zostać anulowany/failed albo assignment zwolniony do `pending` zgodnie z minimalnym registry API; w każdym wariancie `claimed=0`, więc cargo ownership nie wymaga recovery.

### After pickup

Jeżeli NPC action zostaje przerwany:

```text
goods remain in NpcAgent.carried
order remains in-transit
```

Nie:

```text
refund goods to source
cancel order
release carrier
```

tylko dlatego, że movement/action zostało przerwane.

Wznowienie ma prowadzić z istniejącego `in-transit` ordera bez ponownego pickup.

Pełne recovery po NPC death, unload/reload, save/load i zmianie fidelity nie należy do 018.

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

## Trader migration mapping

Migracja ma zachować bieżące zachowanie ekonomiczne, a przenieść tylko ownership commitmentu i transaction boundaries.

| Obecna odpowiedzialność Trader flow | Docelowo | Decyzja |
|---|---|---|
| bounded same-settlement source discovery | istniejący household-exchange/source lookup | **reuse**; nie przenosić source scanning do transport registry |
| wyliczenie transferable surplus/request cap | caller tworzący order | **reuse** istniejących reguł, ale przed utworzeniem ordera wybrać jeden concrete `ItemKind` |
| pamiętanie „mam odebrać z X i dostarczyć do Y” w action chain/closure | `TransportOrder` | **replace** przez stable order ID + world-owned record |
| runtime Household/Economy references w closure | endpoint resolution z stable refs | **replace** jako authoritative commitment; krótkotrwałe resolved refs mogą istnieć tylko podczas execution |
| `claimFoodItems` / freshness-aware removal | Inventory transaction seam | **reuse** primitives, ale nie multi-kind claim jako shape pierwszego ordera |
| `carryFoodClaim` capacity refund | pickup transaction semantics | **reuse concept**; zachować exact rollback, nie traktować helpera jako lifecycle authority |
| local `carriedClaim` closure jako jedyna pamięć o tym, co jest w drodze | `TransportOrder.claimedQuantity` + real `NpcAgent.carried` | **replace** jako commitment state; freshness payload nadal może być krótkotrwałym transaction data, nie cargo ownerem |
| `NpcAgent.carried` | physical cargo owner po pickup | **reuse bez zmiany ownership** |
| movement source → destination | istniejący `PlannedAction` / NPC movement | **reuse**; transport registry nie ma FSM/ticka/pathfindingu |
| direct `carrier.remove` + `economy.depositFood` | guarded unload transaction | **replace seam** tak, aby destination failure nie usuwało cargo |
| `tryAdvanceDevelopment(economy)` po successful deposit | downstream economic side effect | **reuse**, ale wyłącznie po realnym successful unload |
| action interruption | action lifecycle + order lookup/resume | **replace implicit closure recovery** przez jawne `assigned`/`in-transit` semantics |

Po migracji nie powinny istnieć dwa równoległe commitment paths dla cross-household Trader collection.

Own-household Trader → economy flow nie musi być migrowany w 018, jeżeli nie jest potrzebny do pierwszego vertical slice; pozostaje regression baseline, a nie drugi system transport-demand.

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

## Failure matrix

018 ma obsłużyć tylko failures potrzebne dla physical vertical slice.

| Failure | Order state przed failure | Cargo owner przed failure | Expected recovery |
|---|---|---|---|
| source endpoint cannot resolve | `assigned` | source / brak przeniesionego cargo | nie tworzyć cargo; `assigned → failed`; `claimed=delivered=0` |
| source exists, requested kind now absent / transferable quantity 0 | `assigned` | source | brak Inventory mutation; `assigned → failed` |
| source has less than requested, ale >0 | `assigned` | source | claim live partial amount; successful pickup → `in-transit`; brak retry na remainder w tym orderze |
| carrier lacks capacity before source mutation | `assigned` | source | source bez zmian; order nie przechodzi `in-transit`; caller może zakończyć jako `failed` albo później retry, ale nie tworzyć partial hidden claim |
| carrier add fails after source removal | `assigned` w trakcie pickup transaction | tymczasowo transaction-local, nie committed owner | exact rollback do source z freshness/metadata; `claimed=0`; brak `in-transit` |
| duplicate pickup callback | `in-transit`/terminal | carrier/destination/source zależnie od terminal state | reject/no-op; żadnej Inventory mutation |
| temporary action interruption before pickup | `assigned` | source | order zostaje `assigned`; ten sam commitment może zostać wznowiony |
| temporary action interruption after pickup | `in-transit` | carrier | cargo pozostaje u carrier; order zostaje `in-transit`; resume unload bez nowego pickup |
| destination endpoint temporarily unavailable | `in-transit` | carrier | żadnego remove z carrier; order pozostaje `in-transit` |
| destination rejects capacity/acceptance | `in-transit` | carrier | cargo pozostaje w całości u carrier; `delivered=0`; order pozostaje `in-transit` |
| carrier expected cargo missing/corrupted | `in-transit` | invariant mówi: carrier, ale runtime temu przeczy | nie mintować i nie refundować z order metadata; nie complete; surface invariant violation; pełne recovery poza 018 |
| duplicate unload callback | `completed` | destination | reject/no-op; brak drugiego depositu |
| cancel request before pickup | `pending`/`assigned` | source | terminal `cancelled`; carrier assignment cleared; goods bez zmian |
| cancel/fail/release request after pickup | `in-transit` | carrier | reject w 018; order musi nadal wskazywać cargo commitment aż do unload lub późniejszego recovery z 019 |
| NPC death / stream-out / rebuild / save while in-transit | `in-transit` | carrier według domain invariant, ale obecny carrier storage nie jest trwały | poza zakresem 018; nie udawać recovery przez zapis ordera ani kopiowanie cargo do ordera |

## Conservation scenarios

Każdy scenariusz porównuje dokładnie transportowany `ItemKind`, a dla perishables również freshness batches/metadata. Dla quantity zawsze musi zachodzić:

```text
source + carrier + destination = constant
```

### 1. Successful full transfer

```text
before: source=8 carrier=0 destination=3 total=11
request=5
pickup: source=3 carrier=5 destination=3 total=11
unload: source=3 carrier=0 destination=8 total=11
order: claimed=5 delivered=5 completed
```

### 2. Partial live availability

```text
before: source=4 carrier=0 destination=7 total=11
request=6
pickup claims 4: source=0 carrier=4 destination=7 total=11
unload: source=0 carrier=0 destination=11 total=11
order: claimed=4 delivered=4 completed
```

Brakujące 2 units nie powstają i nie pozostają „owed” w completed orderze.

### 3. Carrier capacity failure with rollback

```text
before: source=5 carrier=0 destination=2 total=7
transaction temporarily removes 5 from source
carrier rejects
rollback: source=5 carrier=0 destination=2 total=7
order: claimed=0 delivered=0, not in-transit
```

Dla perishable food source po rollback ma te same acquisition/freshness batches co przed próbą.

### 4. Interruption after pickup

```text
before: source=6 carrier=0 destination=1 total=7
pickup 3: source=3 carrier=3 destination=1 total=7
movement interrupted: source=3 carrier=3 destination=1 total=7
resume + unload: source=3 carrier=0 destination=4 total=7
```

Interruption nie teleportuje ani nie refunduje cargo.

### 5. Destination rejection

```text
before unload: source=2 carrier=4 destination=5 total=11
first unload rejected: source=2 carrier=4 destination=5 total=11
later successful unload: source=2 carrier=0 destination=9 total=11
```

Order pozostaje `in-transit` pomiędzy próbami.

### 6. Duplicate execution

```text
completed state: source=2 carrier=0 destination=9 total=11
retry pickup/unload callbacks
result: source=2 carrier=0 destination=9 total=11
```

Żaden terminal retry nie może zmienić inventory.

### 7. Concurrent orders against one source

```text
source starts 7
A requests 5
B requests 5
A arrives first → claims 5, source=2
B revalidates live → claims 2, source=0
```

Suma goods A+B+source pozostaje 7; oba orders zapisują własną faktycznie claimed quantity.

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

Order registry powinien zapewniać bezpośredni lookup po ID i bounded lookup aktywnego ordera po carrier ID.

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
- profession work / Trader collection flow
- `src/items/Inventory.ts`
- `src/items/foodItems.ts`
- `src/settlement/household.ts`
- `src/economy/settlementEconomy.ts`
- household exchange hooks
- storage destination resolution
- NPC action lifecycle / `PlannedAction`
- existing runtime world-owned registries/stores
- Work Contracts ownership/lifecycle pattern
- NPC carried inventory capacity/failure behaviour
- persistence/rebuild boundaries for `NpcAgent.carried`

Nie zakładać nowych nazw plików przed reconem.

## Implementation stages

### Stage 1 — Transport domain model

- Define `TransportOrder`.
- Define exact first-slice endpoint refs.
- Define lifecycle including terminal pre-pickup `failed`/`cancelled` semantics.
- Restrict first cargo specification to one concrete `ItemKind` per order.
- Add world-owned runtime order registry/store.
- Add deterministic create/lookup/update operations and one-active-order-per-carrier guard.
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

Temporary action interruption must resume the same order; it must not silently create a replacement order.

### Stage 3 — Transaction safety

Ensure pickup and unload preserve exact goods conservation.

Cover:

- partial source availability,
- carrier capacity failure,
- rollback,
- destination failure,
- duplicate execution,
- metadata/freshness conservation.

Reuse existing food/freshness helpers where practical, but do not inherit unsafe destination semantics from a helper that removes before confirming acceptance.

### Stage 4 — Migrate Trader vertical slice

Migrate existing cross-household food-surplus collection to `TransportOrder`.

Preserve existing economic source-selection behaviour.

Select one concrete food `ItemKind` deterministically for the first order shape.

Do not add new transport demand generation.

Verify that the resulting path still physically collects and delivers the same goods.

### Stage 5 — Cleanup and observability

Remove or merge redundant legacy commitment state from the migrated flow.

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
- exact source/destination refs,
- carrier assignment,
- one active order per carrier,
- valid lifecycle transitions,
- invalid lifecycle transitions,
- cannot cancel/fail/release after pickup,
- source resolution failure,
- zero source availability,
- partial live claim,
- concurrent live claims,
- carrier capacity failure,
- pickup rollback,
- successful pickup,
- interruption before pickup preserving source ownership,
- interruption after pickup preserving carrier ownership,
- successful unload,
- destination rejection,
- duplicate pickup prevention,
- duplicate unload prevention,
- completed order cannot run again,
- exact quantity conservation,
- freshness/metadata conservation.

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

for every successful, failed or interrupted transaction that remains inside 018's runtime fidelity boundary.

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
order becomes failed without entering in-transit
```

or:

```text
pickup succeeds
        ↓
action is temporarily interrupted
        ↓
cargo remains carried
        ↓
same in-transit order resumes and unloads
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
- carrier reassignment after pickup,
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
3. First cargo type uses one existing concrete `ItemKind` per order.
4. Existing NPC actions execute pickup, travel and unload.
5. Actual cargo ownership follows:

   ```text
   source → NpcAgent.carried → destination
   ```

6. `TransportOrder` never duplicates real inventory state.
7. Live pickup revalidation prevents stale claims.
8. Failed pickup cannot silently delete goods.
9. Failed unload cannot silently delete goods.
10. `in-transit` order cannot be cancelled/failed/released in a way that orphans cargo.
11. Completed order cannot claim or deliver twice.
12. Existing Trader cross-household surplus flow uses the shared `TransportOrder` foundation.
13. Existing local economic selection behaviour remains unchanged.
14. No global transport tick, logistics manager or parallel inventory is introduced.
15. Conservation scenarios hold for success, partial pickup, interruption, rollback, destination failure and duplicate execution.
16. The domain model can be extended by `settlements-npcs-019` without redesigning the core ownership/lifecycle contract.

> **Zrób git commit i push do main, rebase jeżeli trzeba**