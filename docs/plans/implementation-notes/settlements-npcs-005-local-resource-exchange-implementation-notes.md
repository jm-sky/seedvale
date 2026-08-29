# Implementation Notes: Local Resource Exchange

**Plan:** `settlements-npcs-005-local-resource-exchange.md`  
**Reviewed:** 2026-08-29  
**Status:** `planned` 📋

## Review result

Plan jest wykonalny i dobrze pasuje do obecnej architektury, ale **nie należy implementować kolejnego systemu transportu**. Plan 156, household logistics i obecny NPC action pipeline już istnieją.

Najważniejsza luka to:

```text
household B shortage
    ↓
znajdź lokalny household A z surplus
    ↓
claim
    ↓
NPC goTo → execute → goTo → execute
    ↓
household B
```

Obecny `Trader` nie jest jeszcze przykładem takiego fizycznego transportu: `beginTraderWork()` wykonuje akcję przy workplace, a w `onComplete` bezpośrednio odejmuje `Household.stock` i dodaje do `SettlementEconomy`. Nie zakładać więc, że istnieje gotowy generyczny transport ekonomicznych stocków.

## 1. Ownership — zachować bez zmian

```text
SettlementEconomy → settlement-wide EconomicKind stock
Household.stock   → tylko food + wood
Household.water   → osobny WaterReserve
Household.items   → konkretne ItemKind / instances
NpcAgent.carried  → tymczasowy Inventory dla konkretnych itemów
```

Nie przenosić ekonomii do fizycznych storage propsów.

`iron`, `coal`, `gold`, `copper_ore` pozostają settlement-level. Nie rozszerzać `HouseholdResourceKind`.

Woda jest wyjątkiem: nie scalać `Household.water` z `SettlementEconomy` tylko na potrzeby tego planu.

## 2. EconomicKind ≠ ItemKind

To jest istotne dla implementacji.

`EconomicKind` ma `food/wood/water/iron/coal/gold/copper_ore`, natomiast `ItemKind` nie ma ogólnego `food` ani `wood`; istnieją konkretne produkty i materiały.

Dlatego lokalny transfer **nie powinien sztucznie konwertować** scalar `Household.stock` na `Inventory` tylko po to, aby użyć `NpcAgent.carried`.

Dla F1 sensowniejszy jest tymczasowy, jawny stan ekonomicznego ładunku w istniejącym NPC action chain. Jeśli implementacja potrzebuje wspólnej abstrakcji, mały pure/domain helper jest właściwy; nie `TradeManager`/singleton.

## 3. Istniejący stock i atomicity

`SettlementEconomy` ma już:

- `query/add/remove`,
- `shortage()/surplus()`,
- `reserve()`,
- `consumeReservation()`,
- `releaseReservation()`.

`EconomicStock.remove()` jest atomowe w sensie synchronicznego JS: przy braku ilości niczego nie usuwa.

`Household` ma:

- `shortage()`,
- `shouldAcquire()`,
- `surplus()`,
- `deposit()`.

Nie ma jednak household reservation API.

**Nie rezerwować przy samym wyborze strategii.** Przy rozpoczęciu transportu trzeba atomowo claimować źródło albo wprowadzić minimalny reservation seam dla Household. Kwota claimed musi być przechowywana aż do końcowego depositu.

## 4. Conservation invariant

Dla transferu:

```text
source + in-transit + destination = constant
```

Po claimie zasób nie może pozostać w source.

Po anulowaniu/failure musi mieć dokładnie jednego właściciela.

Szczególnie ważne:

- revalidate source przy claimie, nie używać starego wyniku `choose()`;
- destination revalidate przy deposit;
- nie zakładać, że shortage/surplus z momentu wyboru nadal obowiązuje;
- partial destination acceptance musi pozostawić remainder jawnie przypisany;
- cancellation/watchdog/death nie mogą zostawić „zasobu w NPC” bez recovery.

Najlepiej wykorzystać istniejące `PlannedAction.next` i lifecycle zamiast budować osobny transport FSM.

## 5. Household ↔ Household

To jest główna nowa funkcja.

Źródła powinny być ograniczone do **tego samego settlement**. Nie skanować wszystkich gospodarstw świata.

Obecny `SettlementsManager` posiada `HouseholdRegistry`, ale registry nie udostępnia obecnie gotowego query „all households for settlement”. Najmniejszym rozszerzeniem jest lokalny bounded lookup, np. iteracja registry dla danego settlementu; nie potrzeba globalnego indeksu.

Kandydat:

```text
destination shortage
→ same settlement
→ source surplus
→ stable ordering: relevance/distance/id
→ claim
```

Nie używać `Math.random()` do wyboru źródła.

Jeżeli odległość jest potrzebna, użyć pozycji household home, nie skanować Object3D.

## 6. SettlementEconomy ↔ Household

Oba kierunki powinny korzystać z tego samego transfer seam:

```text
SettlementEconomy surplus → NPC → Household shortage
Household surplus         → NPC → SettlementEconomy
```

Drugi kierunek już częściowo istnieje w `Household.deposit()` / obecnych ścieżkach produkcji.

Nie tworzyć drugiego settlement storage. Fizyczny stockpile pozostaje prezentacją istniejącego `SettlementEconomy`.

Dla transferu do Household trzeba respektować jego capacity. Obecne `deposit()` automatycznie kieruje overflow do settlement economy, ale jego API zwraca `void`; jeśli exchange potrzebuje dokładnej ilości przyjętej, lepiej rozszerzyć istniejący kontrakt o wynik niż pisać równoległą matematykę capacity.

## 7. AI integration — nie dodawać nowego Need

Aktualny flow jest:

```text
generateNeedPressures()
→ scoreNeedCandidates()
→ pick NeedId
→ beginNeed() / beginIdle()
→ PlannedAction
```

`NeedId` obecnie obejmuje tylko `food | water | waterDuty | wood | idle`.

Exchange powinien realizować istniejący `food`/`wood` shortage, a nie tworzyć `trade` jako nową potrzebę.

Najbardziej naturalny seam to candidate strategy:

```text
food/wood need
→ household stock available?
→ local exchange available?
→ existing source/gather fallback
```

Obecny `npcStrategies.ts` jest już dokładnie takim seamem. Rozszerzyć go tylko o rzeczywiście potrzebną strategię, zamiast budować drugi scoring engine.

Personality/role może modyfikować istniejące pressure/strategy scoring, ale nie może omijać hard constraints źródła i celu.

## 8. Trader

Nie przepinać na `src/items/trade.ts`.

Są dwa niezależne systemy:

1. NPC role `trader` + `Household.stock` + `SettlementEconomy`;
2. player-facing item trade: `Inventory` / `ItemKind` / coins / merchant UI.

`beginTraderWork()` jest obecnie prostym abstrakcyjnym transferem household → settlement. Plan 005 może ujednolicić jego **domain transfer operation** z nowym exchange seam, ale nie musi wymuszać fizycznego carry dla istniejącego zachowania, jeśli nie daje to wartości.

Nie wywoływać UI ani `MerchantScreen` z symulacji.

## 9. Profession ↔ Profession

Na tym etapie przygotować owner-agnostic transfer, ale nie implementować nowych łańcuchów produkcyjnych.

Aktualny mining path:

```ResourceDeposits
→ NPC carried Inventory
→ SettlementEconomy
```

jest już działający i powinien pozostać bez zmian.

Przyszły:

```miner → ore → blacksmith
woodcutter → wood → carpenter
```

powinien używać istniejących ownerów stocku, nie nowych profession stores.

## 10. Existing action pipeline

W `NpcAgent` użyć istniejącego:

```startAction()
→ goTo
→ execute / onComplete
→ optional next
→ goTo
→ execute / onComplete
```

To już obsługuje watchdog, exhaustion, cancellation i debug trace.

Nie tworzyć `ResourceTransportManager`, `TradeScheduler`, `ExchangeFSM` ani specjalnego phase w NPC.

Jeżeli trzeba dodać ekonomiczny cargo state, powinien być mały i związany z aktualnym action lifecycle, a nie trwałym inventory.

## 11. Streaming / lifecycle

`HouseholdRegistry` i `EconomyRegistry` żyją na `SettlementsManager`, więc stock przeżywa unload/reload settlementu.

`WorldBundle.rebuildWorldBundle()` również snapshotuje household/economy state.

Nie zapisywać aktywnego transportu w Three.js.

Pełna persistence NPC transportu nie jest obecnie uzasadniona, bo NPC runtime nie jest pełnym snapshotem SaveData. Przy stream-out/recreation trzeba natomiast zastosować istniejący action cleanup tak, aby claimed resource został zwrócony lub przekazany jednoznacznie.

## 12. Performance

Największa pułapka to O(N²):

```text
każdy NPC → każdy household
```

Nie robić globalnego wyszukiwania per frame.

Wystarczy:

- query tylko przy decyzji NPC;
- tylko aktualny settlement;
- tylko householdy z dodatnim surplus;
- tylko cele z realnym shortage;
- stabilne sortowanie/tie-break;
- brak workera — operacja jest mała i synchroniczna.

Dopiero pomiar może uzasadnić późniejszy indeks/cache.

## 13. Tests — najważniejsze przypadki

Poza podstawowymi testami planu koniecznie:

- source surplus dokładnie = requested;
- source surplus < requested;
- dwóch NPC próbuje pobrać ten sam surplus;
- destination shortage < carried;
- source == destination;
- cancellation po claimie;
- failed destination po claimie;
- overflow Household → SettlementEconomy;
- brak transferu, gdy source jest tylko na poziomie targetu;
- deterministic tie-break źródeł;
- trader regression;
- item trade regression.

Testy domenowe powinny testować liczby i ownership; browser test ma potwierdzić rzeczywisty ruch NPC.

## 14. Zalecana kolejność implementacji

```text
1. Audyt aktualnych helperów deposit/stock i pełnego beginNeed()/beginIdle()
2. Mały owner-agnostic transfer/claim seam
3. Household → Household
4. SettlementEconomy → Household
5. Wspólne użycie przez istniejący Trader tam, gdzie faktycznie usuwa duplikację
6. Integracja jako istniejąca food/wood strategy
7. Atomicity/cancellation tests
8. Regression tests
9. Browser verification
```

Nie refaktoryzować Woodcutter/Hunter/Miner, jeśli wspólny seam nie daje realnego uproszczenia.

## 15. Najważniejsze pułapki

- Nie zakładać, że obecny Trader fizycznie przenosi stock — obecnie nie.
- Nie mapować automatycznie `EconomicKind` → `ItemKind`.
- Nie rozszerzać Household na ore/water tylko dla wspólnego API.
- Nie tworzyć nowego Need `trade`.
- Nie robić globalnego skanu gospodarstw.
- Nie rezerwować przy scoringu.
- Nie teleportować stocku między ownerami poza istniejącym action chain.
- Nie używać player-facing `items/trade.ts` jako backendu economic exchange.
- Nie przechowywać authoritative exchange state w Object3D.
- Nie dodawać persistence aktywnego transportu bez rozwiązania pełnego NPC runtime lifecycle.

**Verification status:** review wykonany na `main` względem `docs/STATE.md`, planu 005, aktualnych `Household`, `SettlementEconomy`, `EconomicStock`, `NpcAgent`, `npcStrategies`, `SettlementsManager`, planów 156/002 oraz istniejącego item-trade. Nie wykonano browser verification, ponieważ plan 005 jest nadal `planned`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
