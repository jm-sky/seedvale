# Plan: NPC Household and Settlement Storage Logistics

**Created:** 2026-08-18
**Status:** `planned` 📋
**Priority:** medium · **Effort:** L
**Depends on:** ~~069~~ ~~122~~ ~~131~~

## Cel

Dokończyć brakujący mechanizm transportowania i przechowywania zasobów przez NPC.

Mechanizm ma być generyczny dla różnych `ItemKind`, zamiast tworzyć osobne systemy dla drewna, jedzenia, wody czy rudy.

Docelowy przepływ:

```text
źródło zasobu
    ↓
NPC zbiera / pozyskuje
    ↓
NPC tymczasowo niesie zasób
    ↓
Household storage albo Settlement storage
    ↓
NPC / zwierzę / system pobiera i zużywa zasób
```

Zarówno gospodarstwo, jak i osada mają fizyczny kontener w świecie oraz interakcję pozwalającą podejrzeć jego zapasy.

---

## 1. Zakres

Implementacja obejmuje:

- generyczny transport zasobów przez NPC;
- tymczasowy stan carrying/inventory NPC;
- dostarczanie zasobu do własnego gospodarstwa;
- dostarczanie nadwyżki do magazynu osady;
- generyczny storage oparty o istniejące `ItemKind` / resource concepts;
- fizyczny kontener gospodarstwa;
- fizyczny kontener osady;
- interakcję i UI podglądu zapasów obu kontenerów;
- dokończenie przepływów `wood`, `food` i `water`;
- podłączenie `ore` do tego samego mechanizmu, jeśli istniejący lifecycle pozwala na transport;
- poprawną obsługę capacity/overflow.

Nie obejmuje:

- handlu;
- cen i pieniędzy;
- produkcji i łańcuchów produkcyjnych;
- ręcznego inventory management gracza;
- osobnego `LogisticsManager` / `ResourceManager`;
- automatycznego teleportowania zasobów;
- pełnego SaveData persistence, jeśli obecny model settlement state tego jeszcze nie zapewnia.

---

## 2. Własność stanu

Zachować istniejący podział:

```text
SettlementEconomy
    ↓
Settlement stock

Household
    ↓
Household stock

NpcAgent
    ↓
temporary carrying only
```

NPC nie może być trwałym magazynem gospodarstwa.

Jeden zasób/ilość powinien mieć w danym momencie jedno źródło prawdy:

```text
source → NPC carrying → household/settlement storage
```

Fizyczny kontener Three.js jest prezentacją/interakcją, a nie właścicielem ilości.

---

## 3. Generyczny transport NPC

Wykorzystać istniejący `NpcAgent`, `PlannedAction`, `ActionLifecycle`, `DecisionContext` oraz istniejące ruch/targeting.

Docelowy schemat:

```text
NPC decision
    ↓
wybór źródła
    ↓
collect ItemKind + quantity
    ↓
NPC carrying
    ↓
wybór destination
    ↓
goTo
    ↓
deposit
    ↓
NPC carrying = 0
```

Nie tworzyć osobnych mechanizmów:

```text
WoodTransport
FoodTransport
WaterTransport
OreTransport
```

Różnice między zasobami powinny pozostać w istniejących source/harvest/depletion APIs.

---

## 4. Household storage

Istniejący `Household` pozostaje właścicielem zapasów.

Storage powinien wykorzystywać istniejące stock APIs zamiast tworzyć równoległy `HouseholdInventory`.

Powinien obsługiwać co najmniej:

```text
get(kind)
has(kind, amount)
add(kind, amount)
remove(kind, amount)
deposit(kind, amount)
```

Capacity pozostaje własnością gospodarstwa/storage policy.

Jeżeli gospodarstwo nie może przyjąć całej ilości:

```text
NPC carrying
    ↓
Household.deposit()
    ↓
accepted amount
    ↓
remainder → Settlement storage/economy
```

Transfer powinien być atomowy z punktu widzenia symulacji.

---

## 5. Settlement storage

Osada również otrzymuje fizyczny magazyn/kontener.

```text
Settlement
    └── Storage Container
          ├── wood
          ├── food
          ├── water
          ├── ore
          └── future ItemKind
```

Nie tworzyć drugiego systemu ekonomii. Settlement storage ma korzystać z istniejącego `SettlementEconomy` / settlement stock.

Kontener jest fizyczną reprezentacją istniejącego stanu osady.

Docelowe przepływy:

```text
NPC → Household
NPC → Settlement storage
Household overflow → Settlement storage
Settlement stock → Household
```

Jeżeli obecna implementacja `SettlementEconomy` jest właściwym właścicielem danego stocku, nie przenosić ownershipu tylko po to, aby stworzyć osobny magazyn.

---

## 6. Fizyczne kontenery

Dodać dwa typy world-facing storage:

```text
Household storage
Settlement storage
```

Wizualna forma może być prosta:

- household: skrzynia/beczka zależnie od rodzaju storage;
- settlement: większa skrzynia/skład/magazyn.

Najważniejsze jest powiązanie kontenera z właściwym `householdId` albo `settlementId`.

Nie przechowywać authoritative quantity w `Object3D`.

Kontener musi dać się odtworzyć po stream-out/in na podstawie simulation state.

---

## 7. Interakcja gracza

Oba kontenery powinny być interaktywnymi `Place`/interactable obiektami zgodnie z istniejącym systemem interakcji.

Interakcja ma początkowo tylko pokazywać zawartość.

Przykład:

```text
Household Storage
-----------------
Wood       8
Food       5
Water      3
Ore        0
```

oraz:

```text
Settlement Storage
------------------
Wood       42
Food       27
Water      18
Ore        11
```

Nie implementować jeszcze ręcznego przenoszenia przedmiotów przez gracza.

Celem UI jest przede wszystkim obserwowalność symulacji.

---

## 8. Wood

Doprowadzić istniejący przepływ do pełnego transportu:

```text
Tree
 ↓
NPC chop
 ↓
NPC carrying wood
 ↓
return home
 ↓
Household storage
```

Jeżeli household storage jest pełne, nadwyżka trafia do settlement storage/economy.

Zachować istniejący `TreeLifecycle` / tree harvest jako authoritative depletion.

---

## 9. Food

Doprowadzić istniejący food gathering do:

```text
Food source
 ↓
NPC carrying food
 ↓
Household storage
 ↓
NPC consumes food
```

Nie tworzyć osobnego food logistics system.

Istniejące needs powinny nadal określać zapotrzebowanie, a household pozostaje magazynem.

---

## 10. Water

Dokończyć brakujący persistent transport:

```text
Well / valid water source
 ↓
NPC collects water
 ↓
NPC carrying
 ↓
Household water storage
```

Następnie:

```text
NPC thirst
 ↓
Household water
 ↓
consume
```

Zachować istniejące natural-source fallback.

Woda nie musi być automatycznie dodawana do `EconomicKind`, jeśli obecna architektura nadal rozdziela water reserve od ekonomicznego stocku.

---

## 11. Ore i kolejne zasoby

Po uruchomieniu wspólnego transportu podłączyć ore:

```text
Ore deposit
 ↓
NPC gathers
 ↓
NPC carrying ore
 ↓
Household / Settlement storage
```

Nie zmieniać lifecycle/depletion źródła.

Mechanizm ma być gotowy na kolejne `ItemKind`, ale nie należy implementować nowych resource chains w tym planie.

---

## 12. Decyzje NPC

Nie tworzyć nowego AI managera.

Household shortage/target powinien zasilać istniejący decision scoring.

Przykładowo:

```text
household food < target
    ↓
NPC eligible for food gathering
    ↓
existing decision/action system
    ↓
collect → carry → deposit
```

Analogicznie dla wood/water i kolejnych zasobów.

Schedule, profession, traits i needs pozostają istniejącymi źródłami priorytetów.

---

## 13. Settlement storage jako wspólna pula

Settlement storage ma pełnić rolę wspólnego zapasu osady, nie tylko dekoracyjnego kontenera.

Przepływ:

```text
Household full
    ↓
Settlement storage
```

oraz w przyszłości:

```text
Household shortage
    ↓
NPC transport
    ↓
Settlement storage
    ↓
Household
```

Nie implementować jeszcze automatycznego transferu tylko dlatego, że storage istnieje — ma to wykorzystywać istniejący action/decision model.

---

## 14. Streaming

Household i settlement stock muszą pozostać częścią settlement simulation state, a nie live Three.js objects.

Po stream-out/in:

```text
simulation state
    ↓
recreate storage object
    ↓
show current stock
```

Transport przerwany przez streaming nie może duplikować zasobu ani go tworzyć znikąd.

Nie deklarować pełnego save/load persistence bez rozszerzenia i testów `SaveData`.

---

## 15. Performance

Nie skanować wszystkich źródeł dla każdego NPC co frame.

Wykorzystać istniejącą cadence/throttling decyzji NPC oraz lokalne kandydatury/spatial queries.

Storage UI i interakcja nie powinny powodować ciągłego przeliczania całej ekonomii.

---

## 16. Implementacja etapami

### A — Audit

Sprawdzić aktualny:

- `NpcAgent` carrying/inventory;
- NPC action lifecycle;
- `Household` / `HouseholdRegistry`;
- `SettlementEconomy` / registry;
- existing interactable/Place system;
- settlement prop creation/streaming;
- `ItemKind` / resource representation;
- wood, food, water and ore source APIs.

### B — Generic transport

Zaimplementować jeden reusable gather → carry → destination → deposit flow.

### C — Household storage

Podłączyć household storage jako destination i doprowadzić wood/food do pełnego przepływu.

### D — Settlement storage

Dodać settlement container, interaction i podgląd stocku.

### E — Water

Dokończyć well → NPC → household water → consumption.

### F — Ore

Podłączyć ore do tego samego mechanizmu.

### G — Verification

Sprawdzić pełne przepływy i przypadki brzegowe.

---

## 17. Kryteria ukończenia

1. NPC może zebrać różne `ItemKind`.
2. NPC fizycznie przenosi zasób do destination.
3. NPC może zdeponować zasób w swoim household.
4. Household ma rzeczywisty stock i capacity.
5. Nadwyżka może trafić do settlement storage/economy.
6. Settlement posiada własny fizyczny kontener.
7. Household posiada własny fizyczny kontener.
8. Oba kontenery mają interakcję podglądu zawartości.
9. Wood działa end-to-end.
10. Food działa end-to-end.
11. Water działa end-to-end.
12. Ore może korzystać z tego samego transportu bez osobnego systemu.
13. NPC może konsumować zasoby z household.
14. Storage nie jest authoritative state w Three.js.
15. Stream-out/in nie duplikuje ani nie gubi stocku.
16. Nie powstaje równoległy `ResourceManager`, `LogisticsManager` ani drugi inventory/economy system.

---

## 18. Weryfikacja

Minimalny browser smoke test:

```text
NPC gathers wood
 ↓
NPC carries wood
 ↓
NPC returns home
 ↓
household storage increases
 ↓
player interacts with container
 ↓
UI shows wood
```

Następnie:

```text
household full
 ↓
NPC deposits overflow
 ↓
settlement storage increases
 ↓
player interacts with settlement container
 ↓
UI shows overflow
```

Analogicznie sprawdzić food i water, a następnie ore.

Sprawdzić również:

- empty/depleted source;
- full household storage;
- full settlement storage;
- interrupted transport;
- two NPCs using one source;
- stream-out/in podczas transportu;
- brak duplikacji zasobów;
- brak nieskończonego gather/deposit loop.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
