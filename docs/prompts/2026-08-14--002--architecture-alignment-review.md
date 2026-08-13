# Seedvale — Architecture Alignment Review

## Cel

Wykonaj kompleksowy review obecnej architektury Seedvale pod kątem zgodności z docelowym modelem systemów opisanym w:

- `docs/roadmap/02-systems-fixed.md` — **główny architectural target**
- `docs/VISION.md` — docelowa wizja świata i symulacji
- `docs/STATE.md` — aktualny stan implementacji
- `docs/plans/README.md` — aktualny status i kolejność planów
- `docs/research/README.md` — istniejący research i decyzje wspierające architekturę
- `CLAUDE.md` — zasady developmentu

Repository:

`https://github.com/jm-sky/seedvale`

---

## Najważniejsze założenie

Nie oceniaj obecnego codebase'u wyłącznie według tego, czy aktualnie działa.

Oceń go względem pytania:

> **Czy obecna implementacja prowadzi Seedvale w kierunku docelowej architektury, czy zaczynamy budować lokalne rozwiązania, które później będą przeszkadzały w osiągnięciu tej architektury?**

`docs/roadmap/02-systems-fixed.md` jest punktem odniesienia dla docelowego modelu systemów.

Nie zakładaj, że każda przyszła część architektury musi już istnieć. Rozróżniaj:

1. poprawnie zaimplementowane,
2. częściowo zaimplementowane,
3. jeszcze niepotrzebne / odroczone,
4. świadomie uproszczone,
5. architektonicznie błędne,
6. technical debt wymagający naprawy przed dalszym rozwojem.

---

# Zakres review

## 1. System boundaries

Sprawdź:

- główne systemy,
- ownership stanu,
- podział odpowiedzialności,
- ukryte God Objects,
- systemy przejmujące odpowiedzialność innych systemów,
- równoległe mechanizmy rozwiązujące ten sam problem.

Szczególnie sprawdź zgodność z:

> simulation state owned by the systems responsible for it

oraz:

> no large central WorldState / God Object.

---

## 2. WorldContext i zależności

Zweryfikuj:

- `WorldContext`,
- `WorldBundle`,
- lifecycle/rebuild,
- zależności pomiędzy systemami,
- shared world context,
- callbacki i referencje,
- coupling.

Sprawdź zgodność z:

```text
small shared WorldContext
+
system-owned state
+
explicit dependencies
+
events where loose coupling is useful
```

---

## 3. Simulation model

Sprawdź, czy architektura pozwala obsługiwać różne poziomy symulacji:

```text
NPC
Household / Family
Work group
Settlement
Wildlife population
Regional / aggregated simulation
```

oraz czy obecny kod nie zakłada, że każda encja musi być zawsze symulowana indywidualnie.

Oceń przygotowanie do:

- distance/relevance based simulation,
- lower-frequency simulation,
- aggregation,
- believable restoration of detailed state.

---

## 4. NPC → Household → Settlement

To jeden z najważniejszych punktów review.

Sprawdź zgodność z:

```text
NPC
  ↓
Household / Family
  ↓
Settlement / Group
```

oraz:

```text
individual state
shared household state
settlement state
```

Zidentyfikuj miejsca, gdzie:

- NPC zaczyna pełnić rolę household economy,
- settlement zaczyna bezpośrednio sterować NPC,
- brakuje właściwego poziomu odpowiedzialności,
- powstaje logika utrudniająca późniejsze dodanie rodzin.

Nie wymagaj jeszcze pełnej implementacji Household.

Oceń, czy obecna architektura pozwala ją naturalnie dodać.

---

## 5. Needs / Problems / Goals / Pressure

Zweryfikuj obecny model decyzji NPC i settlement.

Docelowy model:

```text
State
+ Pressures
+ Traits
+ Relationships
+ Goals
    ↓
Decision
    ↓
Strategy
    ↓
Actions
    ↓
World changes
```

Sprawdź:

- needs,
- problems,
- goals,
- priority/pressure,
- FSM,
- schedule,
- traits/personality,
- stamina/vigor,
- relationships.

Zidentyfikuj:

- dobre fundamenty,
- brakujące abstrakcje,
- niepotrzebne abstrakcje,
- miejsca, gdzie FSM przejmuje zbyt wiele odpowiedzialności,
- miejsca mogące utrudnić późniejsze goals/strategies.

---

## 6. Economy / resources / production / storage / transport

Docelowy przepływ:

```text
actor / group
    ↓
action
    ↓
time + resource consumption
    ↓
produced good
    ↓
storage / transport
    ↓
further use
```

Sprawdź:

- `SettlementEconomy`,
- resources,
- inventory,
- stockpile,
- production,
- professions,
- resource deposits,
- natural resources,
- transport,
- future household resources.

Szukaj szczególnie:

- duplicated resource state,
- duplicated inventory/economy mechanisms,
- player-only economy,
- NPC-only economy,
- settlement economy omijającej rzeczywiste actions,
- produkcji generowanej „z niczego”.

Oceń, czy plan `069` i kolejne plany wzmacniają ten model.

---

## 7. Actions jako mechanizm zmiany świata

Sprawdź, czy rzeczywiste zmiany świata wynikają z:

```text
actions → world state changes
```

a nie z przypadkowych bezpośrednich mutacji wykonywanych przez różne systemy.

Szukaj:

- bezpośrednich zmian zasobów,
- bezpośrednich zmian NPC state,
- wyjątków dla player/NPC,
- specjalnych ścieżek settlement,
- mechanizmów omijających istniejące actions/FSM.

---

## 8. Events / relationships / history

Zweryfikuj zgodność z:

```text
direct dependencies
+
shared event contracts
```

bez tworzenia centralnego:

```text
WorldEventManager
```

Sprawdź przygotowanie pod:

- birth,
- death,
- marriage,
- migration,
- trade,
- discoveries,
- fires,
- important world events,
- relationship changes,
- history/memory.

Nie wymagaj implementacji tych systemów.

Oceń tylko, czy obecna architektura pozwoli je dodać bez tworzenia drugiej równoległej architektury.

---

## 9. Environment ↔ resources ↔ ecosystem ↔ settlement

Sprawdź feedback loops:

```text
environment
    ↓
resources / ecosystem
    ↓
NPC / fauna
    ↓
settlement
    ↓
world changes
    ↓
environment / resources
```

Uwzględnij:

- fauna food/water,
- predators/prey,
- vegetation,
- natural resources,
- settlement resource consumption,
- farming,
- livestock,
- hunting,
- fishing.

Nie wymagaj pełnej ekologii.

Oceń, czy istniejące mechanizmy tworzą właściwe fundamenty dla wybranych, znaczących feedback loops.

---

## 10. Time / scheduling / simulation frequency

Sprawdź:

- day/night,
- NPC schedule,
- needs update,
- fauna update,
- settlement economy,
- world simulation,
- chunk streaming.

Docelowa zasada:

```text
rendering             → high frequency
NPC movement          → frequent
needs                 → slower
population/lifecycle  → slower still
regional simulation   → infrequent
```

Nie projektuj konkretnego scheduler'a, jeśli nie jest potrzebny.

Oceń natomiast, czy obecny kod:

- nie wymusza jednego globalnego ticka,
- nie wykonuje niepotrzebnie ciężkiej pracy per frame,
- nie utrudnia przyszłej agregacji/LOD symulacji.

---

## 11. Persistence i world independence

Sprawdź zgodność z zasadą:

> Persistence covers the continuing world, not only the player.

Zidentyfikuj:

- co jest persistowane,
- co nie jest,
- które systemy mają własny state,
- które state'y są rekonstruowane,
- co resetuje się po reload,
- co resetuje się przy streaming/rebuild.

Szczególnie:

- NPC,
- households,
- settlements,
- economy,
- fauna,
- resources,
- relationships,
- world events/history.

Rozróżnij:

- poprawny obecny brak persistence, bo feature jeszcze nie istnieje,
- architektonicznie niebezpieczny brak persistence.

---

## 12. Player / quests / dialogue

Sprawdź, czy:

```text
Player
NPC
Quest
Dialogue
```

korzystają z tych samych world/simulation primitives.

Szukaj:

- player-only parallel systems,
- quest-only world state,
- dialogue-only state,
- hardcoded quest consequences,
- mechanizmów niepropagujących zmian przez istniejącą symulację.

Docelowo:

```text
Player action
    ↓
same world systems
    ↓
world state change
    ↓
NPC / settlement / ecosystem consequences
```

---

# Dla każdego istotnego problemu

Podaj:

### A. Current

Co obecnie robi kod?

### B. Target

Jak powinno to działać według docelowej architektury?

### C. Gap

Jaka jest różnica?

### D. Severity

Użyj:

- 🔴 Architecture blocker
- 🟠 High-risk technical debt
- 🟡 Medium
- 🟢 Low / acceptable

### E. Action

Czy należy:

- naprawić teraz,
- naprawić przed konkretnym przyszłym planem,
- zostawić,
- świadomie zaakceptować,
- zmienić istniejący plan.

---

# Czego NIE robić

Nie:

- przepisuj architektury tylko dlatego, że można ją inaczej zaprojektować,
- nie proponuj ECS tylko dlatego, że istnieje dużo encji,
- nie proponuj event busa jako rozwiązania wszystkiego,
- nie twórz centralnego `WorldState`,
- nie twórz centralnego `SimulationManager` posiadającego cały state,
- nie projektuj pełnej przyszłej architektury systemów, które jeszcze nie są potrzebne,
- nie traktuj brakujących feature'ów jako błędów architektonicznych,
- nie proponuj dużego refaktoru bez wskazania konkretnego problemu.

Preferuj:

> najmniejszą zmianę, która utrzymuje zgodność z docelową architekturą.

---

# Deliverables

Utwórz:

`docs/reviews/NNN-architecture-alignment.md`

Numer wybierz zgodnie z istniejącym `docs/reviews/README.md`.

Dokument powinien zawierać:

## 1. Executive summary

Czy obecna architektura jest na właściwej ścieżce?

## 2. Architecture target

Krótkie podsumowanie docelowego modelu z `02-systems-fixed.md`.

## 3. Current architecture

Mapa najważniejszych rzeczywistych systemów i ownership.

## 4. Alignment matrix

| Area | Target | Current | Alignment | Severity |
|---|---|---|---|---|

## 5. Findings

Tylko konkretne problemy i ryzyka.

## 6. Architectural strengths

Co już jest zrobione dobrze i czego nie należy teraz przebudowywać.

## 7. Required corrections

Zmiany wymagane, aby nie wejść w złą ścieżkę architektoniczną.

## 8. Deferred corrections

Problemy, które mogą poczekać do konkretnych planów.

## 9. Plan impact

Dla istniejących planów wskaż:

- brak wpływu,
- wymaga aktualizacji,
- wymaga zależności,
- potencjalnie należy zmienić kolejność.

Szczególnie sprawdź najbliższe plany dotyczące:

- fauna,
- stamina/vigor,
- settlement economy,
- NPC farms/resources,
- households/families.

## 10. Architectural rules for future agents

Na końcu przygotuj krótką checklistę:

```text
Before adding a new system:

[ ] Does it have a clear owner of state?
[ ] Does it reuse existing world primitives?
[ ] Does it introduce duplicated state?
[ ] Does it bypass Actions?
[ ] Does it create a parallel economy/inventory?
[ ] Does it preserve NPC → Household → Settlement boundaries?
[ ] Does it work without the player?
[ ] Does it support future aggregated simulation?
[ ] Does it fit the dependency model in 02-systems-fixed.md?
```

Ta sekcja ma być praktycznym kontraktem dla kolejnych agentów.

---

# Final conclusion

Na końcu odpowiedz jednoznacznie:

> **Czy Seedvale może bezpiecznie kontynuować rozwój obecnym kierunkiem, czy przed kolejnymi feature'ami należy wykonać konkretne refaktory architektoniczne?**

Jeżeli wymagane są refaktory, wskaż minimalny zestaw, który należy zrobić teraz.

Nie proponuj „idealnej architektury”.

Celem jest zachowanie zgodności z ustalonym targetem przy możliwie małej ingerencji w działający codebase.
