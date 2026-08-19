# Plan 131 — Implementation Notes

**Plan:** `2026-08-16--131--natural-resource-gathering.md`
**Reviewed:** 2026-08-16
**Status:** `reviewed` 🔎

## Review summary

Kierunek planu jest dobry: wykorzystać istniejące drzewa, depozyty rud, `PlannedAction`, `ItemKind`, household i economy zamiast tworzyć równoległy gathering system.

Plan **nie jest jednak jeszcze 1:1 zgodny z aktualnym codebase**. Przed implementacją trzeba skorygować trzy główne założenia:

1. NPC nie posiada obecnie `Inventory` — istniejący `Inventory` jest implementacją player inventory.
2. `Household` / `SettlementEconomy` obsługują obecnie tylko `food`, `wood` i `water`; `iron`, `coal`, `gold` istnieją jako `ItemKind`, ale nie jako `EconomicKind`.
3. `ResourceDeposits` jest obecnie streamowany względem **gracza**, więc NPC nie może niezależnie od gracza znaleźć dowolnego depozytu poza aktywnym promieniem gracza.

Te trzy punkty są ważniejsze niż samo dodanie `miner` action. Najpierw trzeba domknąć ownership i lifecycle zasobu, dopiero potem decyzję NPC.

## 1. Inventory — najważniejsza korekta

`src/items/Inventory.ts` jest obecnie opisany i używany jako inventory gracza. `NpcAgent` nie ma własnego inventory.

Obecny kod potwierdza więc:

```text
Player
  ↓
Inventory / ItemKind
```

ale nie:

```text
NPC
  ↓
Inventory / ItemKind
```

### Sugestia

Nie tworzyć `NpcInventory` ani `ResourceInventory`.

Najlepszym kierunkiem jest uczynienie istniejącego `Inventory` neutralnym komponentem przenoszenia przedmiotów i użycie go zarówno dla playera, jak i NPC.

Minimalny zakres:

- usunąć z dokumentacji/API założenie, że `Inventory` jest wyłącznie playerowy;
- utworzyć inventory per NPC, z limitem wynikającym z istniejącej konfiguracji lub małego NPC carry limit;
- nie dodawać NPC inventory do pełnego `SaveData` — obecny runtime nie persystuje pełnego NPC state;
- `Inventory.add()` musi być warunkiem sukcesu extraction: jeśli nie ma miejsca, **nie wolno najpierw zmniejszyć world resource**;
- extraction powinno mieć atomowy kontrakt:

```text
can carry?
    ↓ yes
extract from world
    ↓
add to NPC inventory
```

Jeżeli potrzebny jest nowy helper, powinien dotyczyć wyłącznie transferu/atomiczności, nie tworzyć kolejnego systemu inventory.

## 2. Wood — nie udawać, że obecny path już jest fizycznym transportem

`src/economy/npcWork.ts` potwierdza, że obecny `chop → deposit` kończy się przez `commitWoodcutterDeposit()` i `SettlementEconomy.produce(WOODCUTTING_PRODUCTION)`.

`WOODCUTTING_PRODUCTION` daje obecnie bezpośrednio:

```text
woodcutter chop/deposit
    ↓
SettlementEconomy.produce()
    ↓
+2 wood
```

To jest bezpieczne przed mintowaniem przez samo `work`, ale **nie jest jeszcze** przepływem:

```text
Tree → NPC Inventory → Household
```

### Sugestia

Plan 131 powinien potraktować istniejący wood path jako pierwszy przypadek do migracji do fizycznego carry flow.

Nie zmieniać `TreeLifecycle` ani `treeHarvest`.

Zamiast tego:

```text
NPC chop
  ↓
harvestWorldTreeFully()
  ↓
NPC Inventory.add(wood)
  ↓
NPC deposit
  ↓
Household / SettlementEconomy
```

Jeżeli liczba `2 wood` jest obecnym yieldem domenowym, zachować ją w jednym miejscu. Nie kopiować jej do NPC FSM.

`commitWoodcutterDeposit()` powinien zostać usunięty lub przekształcony dopiero wtedy, gdy nowy wspólny transfer zastąpi jego odpowiedzialność. Nie utrzymywać dwóch możliwych ścieżek produkcji drewna.

## 3. Ore — obecna ekonomia nie potrafi przyjąć rudy

`src/items/items.ts` ma:

```text
coal
iron
gold
```

ale `src/economy/kinds.ts` ma tylko:

```text
food
water
wood
```

`HouseholdResourceKind` jest dodatkowo ograniczony do:

```text
food
wood
```

Dlatego obecny zapis planu:

```text
NPC Inventory
    ↓
Household.deposit(ore)
    ↓
SettlementEconomy
```

nie jest możliwy bez zmiany kontraktu economy.

### Sugestia — preferowany kierunek

Nie wkładać rudy do `Household`.

Household jest rodzinną spiżarnią / zapasem, a nie magazynem wszystkich dóbr.

Dla ore lepszy przepływ to:

```text
NPC Inventory
    ↓
settlement-level raw resource stock
```

Jeżeli `SettlementEconomy` ma być właścicielem tego stocku, należy rozszerzyć `EconomicKind` o surowce potrzebne do następnego etapu, np.:

```text
food
water
wood
iron
coal
gold
```

ale zrobić to świadomie jako rozszerzenie istniejącego economy systemu, a nie jako nowy `OreEconomy`.

`Household.deposit()` pozostaje wtedy ograniczone do `food` / `wood`.

### Ważne

Nie rozszerzać automatycznie `HouseholdResourceKind` o wszystkie `EconomicKind`.

To zachowałoby sens household jako małego domowego stocku i pozwoliło później produkcji/processingowi używać settlement-level raw materials.

## 4. ResourceDeposits — największy problem z „bez gracza”

`src/terrain/resourceDeposits.ts` obecnie:

- ładuje widoczne depozyty w `LOAD_RADIUS = 160` wokół gracza;
- usuwa je poza `UNLOAD_RADIUS = 220`;
- `queryNearest()` przeszukuje wyłącznie aktualnie załadowane `instances`;
- `mine()` mutuje `remaining` instancji;
- depletion jest obecnie session-only w `depletedIds`.

W praktyce oznacza to:

```text
Player near deposit
    ↓
ResourceDeposits instance exists
    ↓
queryNearest() works
```

ale nie:

```text
NPC near deposit, player far away
    ↓
queryNearest() works
```

To jest bezpośrednio sprzeczne z wymaganiem, że gathering ma działać bez aktywnego gracza.

### Sugestia

Nie należy po prostu zwiększać `LOAD_RADIUS`.

To stworzyłoby koszt renderowania i streamingu zależny od wszystkich NPC/settlements.

Lepszy kierunek:

```text
NaturalResource
      ↓
logical deposit state
      ↓
visual ResourceDeposits instance (tylko gdy potrzebna)
```

Jednocześnie trzeba zachować **jedno źródło depletion state**.

Możliwe minimalne rozwiązanie:

- `ResourceDeposits` dostaje interest points niezależne od gracza, np. aktywne settlement/NPC areas;
- wizualne instancje są nadal tworzone tylko dla obszarów, które rzeczywiście wymagają renderowania;
- NPC może korzystać z logicznego targetu bez konieczności posiadania widocznego GLB pile;
- extraction/depletion pozostaje wspólne dla playera i NPC.

Jeżeli potrzebne będzie rozdzielenie logical deposit state od visual instance, traktować to jako **refactoring istniejącego `ResourceDeposits`**, a nie drugi resource system.

## 5. Persistence — obecny depletion jest session-only

`ResourceDeposits` trzyma `depletedIds` wyłącznie w runtime closure i czyści je przy `dispose()`.

To oznacza, że ore depletion nie jest obecnie częścią save contract.

Plan słusznie nie powinien automatycznie dodawać save schema.

### Sugestia

Dla planu 131 zachować session-only depletion, chyba że wymaganie gameplayowe jednoznacznie mówi, że NPC mining ma przetrwać reload.

Jeżeli NPC wydobędzie ostatnią rudę, a po reloadzie zło wróci, jest to obecne zachowanie systemu i nie należy przypadkowo naprawiać go w ramach tego planu.

Najważniejsze jest, aby stream-out nie resetował depletion **w tej samej sesji**.

## 6. Atomic extraction

To powinien być jeden z głównych kontraktów technicznych planu.

Obecne `mine()` robi:

```text
remaining -= 1
yieldForOre()
```

Dla NPC dochodzi jeszcze capacity inventory.

Nie wolno zrobić:

```text
mine()
  ↓
Inventory.add() === false
```

bo wtedy zasób został zużyty bez uzyskania przedmiotu.

### Preferowany kontrakt

```text
extract(depositId, carrierCapacity)
    ↓
check deposit
    ↓
check yield
    ↓
check carrier capacity
    ↓
mutate deposit
    ↓
return ItemKind/count
```

Player może nadal korzystać z tego samego domain extraction API, a UI/progress/pickaxe pozostaje w player layer.

## 7. Target reservation / wielu NPC

Nie potrzeba pełnego reservation systemu.

Dwa NPC mogą wybrać ten sam deposit. Ważne jest tylko, aby extraction było atomowe.

Przykład:

```text
NPC A → deposit remaining = 1
NPC B → ten sam deposit

A extracts → remaining = 0
B extracts → depleted → retarget
```

To jest wystarczające dla pierwszej wersji.

Nie dodawać `ResourceReservationManager` tylko po to, aby uniknąć tego prostego przypadku.

## 8. Food — najpierw audyt, potem zakres

Plan zakłada istniejący food/garden gathering path, ale aktualny economy layer pokazuje przede wszystkim `FARMING_PRODUCTION` jako placeholder.

Nie należy więc przyjmować założenia, że food gathering już spełnia:

```text
Food source → NPC Inventory → Household
```

### Sugestia

W Phase 1 Claude powinien wskazać konkretny istniejący source/action, który faktycznie daje food.

Jeżeli takiego pełnego flow nie ma, nie tworzyć go przypadkiem jako „wyrównania” w planie 131.

Wtedy:

```text
wood → implement
ore → implement
food → reuse only if real source/path exists
```

Food może zostać osobnym follow-upem, jeśli wymaga większego zakresu.

## 9. Decision model

Plan dobrze rozdziela:

```text
Needs
Household stock
Profession
Decision
Action
```

Należy jednak unikać sytuacji, w której NPC miner zawsze wybiera rudę tylko dlatego, że ma `Role = miner`.

Preferowana kolejność:

```text
actual shortage / useful demand
        ↓
role preference
        ↓
available target
        ↓
action
```

Gold nie powinno automatycznie mieć tego samego priorytetu co iron/coal tylko dlatego, że jest „ore”.

Na tym etapie wystarczy preferencja zasobu wynikająca z istniejącego economy demand. Nie tworzyć systemu utility scoring dla wszystkich resource types.

## 10. Recommended implementation order

Po review sugerowana kolejność różni się trochę od obecnych faz planu:

### Phase 0 — Correct contracts

- potwierdzić ownership `Inventory`;
- zdecydować, czy `Inventory` staje się generic carrier;
- zdecydować, które ore należą do `SettlementEconomy`;
- potwierdzić NPC-independent access do depositów;
- nie pisać jeszcze decision logic.

### Phase 1 — Shared carrier + extraction

Najpierw zbudować atomowy przepływ:

```text
world source
    ↓
extract
    ↓
NPC Inventory
```

bez AI.

### Phase 2 — Wood migration

Przenieść istniejący `chop → deposit` na wspólny carrier flow bez zmiany `TreeLifecycle`.

To daje pierwszy pełny przykład i chroni przed budowaniem abstrakcji wyłącznie pod ore.

### Phase 3 — Ore

Dodać NPC extraction z istniejących depozytów oraz settlement-level ore stock.

### Phase 4 — Delivery

Wspólny transport:

```text
NPC Inventory
    ↓
Household (food/wood)
       OR
SettlementEconomy (raw ore)
```

Nie wymuszać sztucznie jednego storage endpointu dla wszystkich zasobów.

### Phase 5 — Decision

Dopiero po działającym source → carry → destination dodać wybór gathering do NPC decision/work flow.

### Phase 6 — Food

Tylko jeśli Phase 1 pokaże istniejący realny source/action, który można podłączyć bez nowego systemu.

## 11. Performance recommendation

Najważniejsza zasada:

> NPC nie powinien wymuszać renderowania zasobów tylko dlatego, że chce je zebrać.

Player-facing GLB pile i simulation target nie muszą mieć identycznego lifecycle.

Dla remote/off-screen NPC późniejszy etap może używać agregacji, ale plan 131 nie powinien jeszcze projektować pełnej off-screen economy.

Dla aktywnych settlementów wystarczy lokalny interest region / logical target query. Nie skanować całego `NaturalResource` registry dla każdego NPC co tick.

## 12. Tests worth adding

Najważniejsze testy domenowe:

- extraction z pełnym inventory → brak depletion;
- extraction z wolnym inventory → yield + depletion;
- extraction ostatniego hitu → deposit depleted;
- drugi NPC po depletion → clean failure + retarget;
- stream-out/stream-in w tej samej sesji → brak respawnu depleted deposit;
- wood harvest → dokładnie jeden yield path;
- ore `ItemKind` → właściwy settlement raw stock;
- household full → food/wood overflow do settlement economy;
- NPC bez gracza w pobliżu → może znaleźć logiczny target.

## 13. Final recommendation

Plan 131 warto realizować, ale **najpierw skorygować jego kontrakty**.

Największa wartość gameplayowa pozostaje właściwa:

```text
resources in world
        ↓
NPC work
        ↓
physical carrying
        ↓
settlement resources
        ↓
future production / trade / problems
```

Nie należy jednak udawać, że obecny codebase już posiada `NPC Inventory`, ore economy i player-independent deposit streaming. To są właśnie trzy brakujące elementy, które trzeba jawnie potraktować jako część implementacji/refaktoru tego planu.

**Zrób git commit i push do main, rebase jeżeli trzeba**
