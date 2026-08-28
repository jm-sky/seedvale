
# Implementation Notes: Local Resource Exchange

**Plan:** settlements-npcs-005-local-resource-exchange.md
**Reviewed:** 2026-08-29
**Status:** planned 📋

## Review summary

Plan ma właściwy kierunek, ale kilka założeń wymaga korekty względem obecnego codebase:

- plan 156 jest już **done** i większość transportu NPC istnieje; nie implementować ponownie generycznego gather → carry → deposit;
- Household przechowuje obecnie tylko food/wood jako EconomicStock; water jest osobnym WaterReserve;
- SettlementEconomy ma rezerwacje, ale Household nie ma analogicznego reservation API;
- obecny trader jako rola NPC już przenosi surplus własnego gospodarstwa do SettlementEconomy przy pasującym shortage;
- istniejący item trade (src/items/trade.ts) dotyczy Inventory/ItemKind/monet i nie jest ekonomią EconomicKind. Nie należy mieszać tych mechanizmów;
- SettlementEconomy zawiera także water, ale dokumentacja i runtime traktują wodę gospodarstwa jako osobny reserve. Nie rozszerzać automatycznie household exchange na wodę przez EconomicKind.

Najważniejszy cel implementacji: **dodać brakujący przepływ popyt → lokalna podaż → transfer do konkretnego właściciela**, wykorzystując istniejące akcje NPC i istniejące stocki, a nie budować nowy system transportu.

## 1. Właściciele stanu

Aktualny podział jest właściwy:

~~~text
SettlementEconomy → settlement bulk stock
Household        → food/wood stock + osobny water reserve + item Inventory
NpcAgent         → tymczasowo niesiony zasób
Three.js props    → tylko prezentacja/interakcja
~~~

Nie przenosić stocku do storage object i nie tworzyć StorageInventory.

Household.stock używa EconomicStock, ale jego publiczny kontrakt jest węższy niż SettlementEconomy: tylko food i wood są legalnymi HouseholdResourceKind. To celowe — iron/coal/gold pozostają stockiem osady.

## 2. Istniejący transport — rozszerzać, nie zastępować

Plan 156 potwierdził istniejący wzorzec:

~~~text
goTo source
  ↓
extract / gather
  ↓
next: deposit
  ↓
goTo destination
  ↓
commit destination
~~~

Wood, water i ore już korzystają z tego wzorca, choć szczegóły ownershipu/carry różnią się między zasobami. Przed dodaniem nowego kodu w NpcAgent znaleźć aktualne ścieżki deposit, carried, waterDuty, mining i woodcutting i wyciągnąć wyłącznie wspólną część, jeśli faktycznie jest potrzebna.

Nie tworzyć ResourceTransportManager, TradeManager, WoodTransport itd.

## 3. Brakujący mechanizm: lokalny transfer

Najbardziej uzasadnione nowe API to mała, deterministyczna operacja domenowa transferująca istniejący stock między właścicielami — **nie manager**.

Powinna operować na już istniejących ownerach:

~~~text
source stock
    ↓ atomic validation/claim
NPC carried state
    ↓
destination stock
~~~

Dla transferu bez pośredniego NPC można mieć mały helper transakcyjny, ale normalna symulacja powinna nadal wykonywać transfer przez NpcAgent i PlannedAction.

Jeżeli cross-owner atomicity wymaga funkcji poza Household i SettlementEconomy, preferowany jest mały moduł pure/domain utility zamiast kolejnego singletonowego systemu.

## 4. Reservation — istotna luka względem planu

Plan zakłada „existing reservation mechanisms”, ale aktualnie rezerwacje istnieją w SettlementEconomy, nie w Household.

SettlementEconomy.reserve() usuwa stock i później może go zwolnić przez releaseReservation(). Household.deposit() nie ma analogicznego mechanizmu.

Przy wielu NPC decyzja może zostać podjęta na podstawie tego samego household surplus/shortage. Nie opierać bezpieczeństwa transferu wyłącznie na snapshotcie z choose().

Minimalne rozwiązanie:
- dla settlement stock wykorzystać istniejące reserve/consumeReservation/releaseReservation;
- dla household source albo dodać analogiczny minimalny reservation seam, albo atomowo odejmować stock dokładnie w momencie rozpoczęcia transportu i przechowywać claimed amount w NPC;
- nie rezerwować zasobu już przy samym scoringu/kandydacie.

Reservation nie może być kolejnym globalnym managerem.

## 5. Conservation / failure

Najważniejszy invariant:

~~~text
source + carried + destination = stała suma
~~~

W praktyce:
- source jest zmniejszany dopiero przy udanym claim;
- claimed amount musi być zapisany w stanie action/NPC;
- destination przyjmuje tylko rzeczywiście niesioną ilość;
- jeśli destination przyjmie mniej, remainder musi mieć jawny następny los (source/settlement stock), nigdy „zniknięcie”;
- cancellation/failure po claim musi zwrócić carried do jednego authoritative ownera;
- nie wykonywać osobno „sprawdź” i później „odejmij” bez ochrony przed zmianą stocku.

Dla Household.deposit() obecny overflow jest już poprawnie kierowany do SettlementEconomy; warto użyć tego zamiast implementować drugi overflow path.

## 6. Household shortage / surplus

Aktualne API jest wystarczające jako punkt wyjścia:

- household.shortage(kind) = poniżej minimum;
- household.shouldAcquire(kind) = poniżej targetu;
- household.surplus(kind) = powyżej targetu;
- capacity jest osobną granicą i nie powinna być traktowana jako potrzeba.

Nie dodawać kolejnego modelu need/target w AI.

Nie interpretować capacity - stock jako shortage. Exchange powinien używać minimum/target, zgodnie z istniejącą polityką gospodarstwa.

## 7. Household ↔ Household

To jest faktycznie nowa funkcjonalność.

Proponowany przepływ:

~~~text
household B: shortage
       ↓
candidate source households in same settlement
       ↓
source surplus
       ↓
reserve/claim amount
       ↓
NPC transport
       ↓
household B
~~~

Nie skanować wszystkich gospodarstw przy każdym frame. SettlementsManager już posiada registry gospodarstw; wykorzystać istniejący lokalny zbiór gospodarstw osady i cadence decyzji NPC.

Deterministyczny wybór źródła powinien mieć stabilny tie-breaker, np. relevance → distance → household.id. Nie używać przypadkowego wyboru.

Nie tworzyć bezpośredniego teleport transfer. W normalnej symulacji musi istnieć realna akcja NPC.

## 8. Settlement storage ↔ Household

Storage fizyczny z planu 156 już jest tylko projekcją SettlementEconomy. Nie dodawać drugiego stocku.

Docelowo:

~~~text
SettlementEconomy surplus
        ↓
NPC decides delivery
        ↓
Household shortage
        ↓
NPC carries
        ↓
Household.stock
~~~

W drugą stronę pozostawić istniejący household surplus → settlement economy flow i tylko wykorzystać wspólną operację transferu, jeżeli zmniejszy to duplikację.

## 9. Trader role vs item merchant — nie pomylić

W codebase są dwa różne pojęcia:

1. **NPC role trader** — obecna praca NPC, która już przenosi własny household food/wood surplus do SettlementEconomy, gdy osada ma matching shortage.
2. **Item trade** — src/items/trade.ts + merchant UI, operujący na Inventory, ItemKind, coins i concrete item instances.

Plan 005 powinien rozszerzać pierwszy mechanizm. Nie przepinać ekonomii na src/items/trade.ts.

Obecny trader jest dobrym kandydatem do pierwszego konsumenta wspólnego exchange seam: zamiast mieć własną logikę household surplus → settlement, powinien używać tej samej operacji transferu co przyszły household shortage delivery.

## 10. Profession ↔ profession

To powinno być przygotowanie API, nie pełna implementacja nowych łańcuchów.

Obecne src/economy/production.ts i npcWork.ts są punktami commitowania produkcji. Nie zmieniać ich na nowy scheduler.

Dla przyszłości wystarczy, aby destination mogło być dowolnym istniejącym ownerem stocku:

~~~text
producer output
    ↓
existing stock owner
    ↓
local consumer shortage
~~~

Nie implementować teraz Blacksmith/Carpenter/mining chain, zgodnie z planem.

## 11. Ore

ore nie jest household resource. MineableOre mapuje się bezpośrednio na EconomicKind (iron, coal, gold, copper_ore), a NPC mining ma już carrying/deposit path.

Dlatego F1 nie powinno próbować robić:

~~~text
ore → Household.stock
~~~

Naturalnym destination jest SettlementEconomy. Jeśli późniejszy profession exchange potrzebuje ore → blacksmith, należy wykorzystać settlement raw stock jako istniejący owner.

## 12. Water

Woda jest obecnie wyjątkiem architektonicznym:

~~~text
Household.water : WaterReserve
~~~

nie Household.stock i nie aktywna ekonomia EconomicKind dla potrzeb gospodarstwa.

Nie refaktoryzować tego do EconomicStock tylko po to, żeby uzyskać jednolity exchange API.

Jeśli plan 005 ma dostarczać wodę z village stock, trzeba najpierw sprawdzić, czy obecny SettlementEconomy.water ma rzeczywistego producenta/konsumenta — aktualny stan mówi, że jest to inertny stock. Bez takiej ścieżki nie budować sztucznego handlu wodą.

Istniejący waterDuty / well → household water flow powinien pozostać źródłem prawdy dla obecnej logistyki wody.

## 13. AI integration

Aktualny flow to:

~~~text
pressure
 ↓
scoreNeedCandidates()
 ↓
NeedId
 ↓
candidate strategies
 ↓
availability/constraints
 ↓
strategy selection
 ↓
PlannedAction
~~~

Exchange powinien wejść jako **candidate strategy realizująca istniejącą potrzebę/pressure**, nie jako nowy Need i nie jako osobny TradeAI.

Hard constraints:
- source exists;
- source ma dostępny surplus;
- destination ma shortage/target deficit;
- NPC należy do tej samej osady;
- NPC może wykonać transport;
- source/destination są osiągalne przez istniejący movement/action path.

Personality/role może wpływać na scoring przez istniejący ai-002 seam, ale nie może pokonać hard constraints.

## 14. Performance

Największe ryzyko to O(N²): każdy NPC szuka każdego household/source.

Preferować:
- decyzję w istniejącej cadence NpcAgent.choose();
- ograniczenie do aktualnej osady;
- tylko kandydatów z realnym surplus/shortage;
- stabilny lokalny wybór;
- brak per-frame skanów;
- brak nowych workerów — transfer jest mały i synchroniczny.

Jeśli później liczba gospodarstw wzrośnie, dopiero pomiar powinien uzasadnić indeks przestrzenny/cache.

## 15. Streaming / rebuild

HouseholdRegistry i EconomyRegistry należą do SettlementsManager i przeżywają stream-out/in w tej samej sesji. Storage props z planu 156 są odtwarzane z tych danych.

Nie przechowywać exchange state w Three.js.

Jeśli NPC zostanie streamowany/recreated w trakcie transportu, nie wolno dopuścić do:
- ponownego wykonania extract;
- pozostawienia claimed stocku poza ownerem;
- podwójnego deposit.

Trzeba wykorzystać istniejące lifecycle/action cancellation semantics zamiast dopisywać drugi mechanizm recovery.

Pełna persistence exchange reservation/active transport nie jest obecnie uzasadniona: NPC runtime nie jest pełnym snapshotem SaveData.

## 16. Konkretne miejsca do wykorzystania

Przed implementacją sprawdzić aktualne symbole w:

- src/settlement/household.ts — stock, shortage, shouldAcquire, surplus, deposit, registry;
- src/economy/settlementEconomy.ts — stock, shortage/surplus i istniejące reservations;
- src/economy/registry.ts — settlement economy ownership/lifecycle;
- src/economy/npcWork.ts — obecny trader/work commit seam;
- src/ai/NpcAgent.ts — carrying, decisions, PlannedAction, deposit, current trader behaviour;
- src/ai/Needs.ts + candidate-strategy files — miejsce integracji decyzji;
- src/settlement/SettlementsManager.ts / createSettlement.ts — dostęp do household/economy i lokalnych NPC;
- src/settlement/props.ts, src/interaction/Interactable.ts, src/interaction/resolveInteraction.ts — istniejące storage presentation/interactions;
- src/terrain/depositMining.ts — ore → EconomicKind mapping;
- src/items/trade.ts — tylko jako regresja/odrębny item-trade system, nie jako backend exchange.

## 17. Testy o największej wartości

Oprócz testów planu wymusić przypadki atomicity:

- source surplus dokładnie równy requested amount;
- source surplus mniejszy od requested amount;
- dwa transfery konkurujące o ten sam surplus;
- destination shortage mniejszy od carried amount;
- source/destination ten sam household;
- cancelled transport po claim;
- failed destination po claim;
- overflow household → settlement economy;
- brak transferu z household poniżej targetu;
- deterministic tie-break dwóch równych źródeł;
- trader role używa wspólnego mechanizmu;
- item trade pozostaje bez zmian.

Browser verification powinna potwierdzić **realny ruch NPC**, a nie tylko zmianę liczb w stocku.

## 18. Review conclusion

Plan jest **wart implementacji**, ale implementacja powinna być mniejsza niż sugeruje sekcja generic transport. Transport, household storage, settlement storage, ore transport i podstawowy trader flow już istnieją.

Największy nowy element to:

~~~text
household shortage
      ↓
local source selection
      ↓
atomic claim
      ↓
existing NPC carrying/action pipeline
      ↓
household deposit
~~~

oraz ujednolicenie istniejącego trader flow z tym samym transfer seam.

Nie należy:
- tworzyć nowego economy/trade managera;
- przepisywać istniejącego transportu;
- traktować item trade jako EconomicKind exchange;
- przenosić ore do household;
- scalać water reserve z economy bez konkretnej potrzeby;
- robić globalnego skanowania gospodarstw co frame.

**Verification status:** review oparty na aktualnym main, STATE.md, planie 005, planach 069/156, aktualnym economy/household/NPC/item-trade code oraz architekturze. To jest review dokumentacyjne; nie wykonano browser verification planu 005, ponieważ nie jest jeszcze zaimplementowany.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
