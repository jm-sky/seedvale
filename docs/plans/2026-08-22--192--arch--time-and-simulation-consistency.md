# Plan: Time & Simulation Consistency

**Created:** 2026-08-22  
**Status:** `verification needed` 🔍 — see [implementation notes](./2026-08-22--192--arch--time-and-simulation-consistency-implementation-notes.md)  
**Priority:** high · **Effort:** M  
**Depends on:** none  
**domain:** `world-terrain`  
**Tags:** [architecture, audit, time, simulation, consistency]

## Cel

Ujednolicić obsługę czasu w Seedvale bez tworzenia globalnego `TimeManager` i bez zmiany istniejącego gameplay tuningu.

Główna zasada:

- **World Time** — `DayNightState.elapsedDays`
- **Simulation Time** — `dt` dla aktywnie symulowanych agentów
- **Real-Time Actions** — krótkie timery/cooldowny, jeśli ich semantyka jest rzeczywiście real-time

Refactor ma uporządkować reprezentację i konwersję czasu, a nie zmieniać balans systemów.

---

## 1. Reconnaissance przed zmianami

Przed modyfikacją kodu wykonać repo-wide audit mechanizmów czasu.

Wyszukać m.in.:

- `dt`
- `delta`
- `elapsed`
- `duration`
- `timer`
- `cooldown`
- `setTimeout`
- `setInterval`
- `*_SEC`
- `*_MIN`
- `*_HOUR`
- `*_DAY`
- `timeMultiplier`
- `elapsedDays`
- `timeOfDay`
- `dayLengthSec`
- hardcoded `480`

Utworzyć roboczą tabelę:

| File / symbol | Unit | Category | Time source | Time skip | Decision |
|---|---|---|---|---|---|
| ... | ... | World / Simulation / Action | ... | ... | keep / normalize / refactor |

Tabela ma objąć wszystkie istotne mechanizmy, nie tylko systemy wymienione w tym planie.

---

## 2. World Time

Głównym źródłem World Time pozostaje:

`src/world/dayNight.ts`

`DayNightState` pozostaje właścicielem:

- `elapsedDays`
- `timeOfDay`
- `dayLengthSec`
- `timeMultiplier`

Nie tworzyć drugiego źródła czasu świata.

Zweryfikować `tickDayNight()` i doprowadzić do sytuacji, w której konwersja czasu używana przez day/night jest zgodna z konwersjami używanymi przez pozostałe systemy.

---

## 3. Wspólne konwersje czasu

Wprowadzić mały, stateless mechanizm konwersji zależny od `dayLengthSec`.

Potrzebne są co najmniej konwersje:

- real seconds → game days
- game days → real seconds
- game hours → game days
- game days → game hours

API i lokalizacja dopasować do istniejącej architektury.

Preferować prosty moduł/helper zamiast globalnego managera.

Nie przekazywać całego `DayNightState` do systemu, który potrzebuje wyłącznie `dayLengthSec`.

---

## 4. Hardcoded `480`

Zidentyfikować wszystkie użycia `480` i podzielić je na:

1. time conversion,
2. gameplay tuning,
3. unrelated constant.

Usunąć `480` jako ukryte założenie w konwersjach czasu.

Nie zmieniać wartości gameplayowych.

Jeżeli tuning oznacza np. „3 game-days”, zachować go jako game-time duration i dopiero konwertować na odpowiednią liczbę sekund.

---

## 5. Player Needs

Sprawdzić:

`src/player/PlayerNeeds.ts`

Szczególnie:

- hunger,
- thirst,
- vigor,
- starvation,
- dehydration,
- deprivation penalties.

Obecne wartości są kalibrowane względem `480`. Zastąpić zależność od literalnej wartości zależnością od aktualnego `dayLengthSec`.

Zachować istniejący gameplay tuning.

Przykład:

`3 game-days` ma nadal oznaczać 3 game-days niezależnie od tego, czy dzień trwa 480 czy 600 real seconds.

---

## 6. NPC Needs / Vigor

Sprawdzić:

- `src/ai/Needs.ts`
- `src/ai/npcVigor.ts`
- `src/ai/NpcAgent.ts`

Sklasyfikować wszystkie wartości związane z upływem czasu jako:

- game-time,
- simulation-time,
- real-time action.

Parametry opisujące potrzeby i vigor powinny korzystać z `dayLengthSec`, jeżeli ich tuning jest wyrażony w game-days/game-hours.

Nie zmieniać balansu.

---

## 7. Time Skip

Sprawdzić:

- `src/world/timeSkip.ts`
- `gameLoop.ts`
- powiązane systemy.

Zachować obecne różnice między systemami.

### NPC

Zachować headless catch-up / stepping.

Nie przekazywać gigantycznego `dt` bezpośrednio do aktywnego NPC FSM.

### Player Needs

Zachować obecne zachowanie podczas time skip — potrzeby gracza mają nadal postępować zgodnie z przyspieszonym simulation `dt`.

### World Time

`elapsedDays` musi poprawnie odzwierciedlać przesunięcie czasu świata.

Sprawdzić wpływ skipu na:

- NPC schedule,
- NPC needs/vigor,
- player needs,
- crops,
- trees,
- timed processes,
- weather/seasons.

---

## 8. Lazy World-Time Systems

Zweryfikować i zachować istniejący wzorzec:

- `src/world/cropLifecycle.ts`
- `src/world/treeLifecycle.ts`
- `src/items/timedProcess.ts`

Systemy oparte na:

`startedAtDays + durationDays`

pozostawić jako lazy World-Time systems.

Nie zastępować ich globalnym tickiem.

---

## 9. Fauna

Sklasyfikować mechanizmy czasowe w:

- `src/fauna/AnimalAgent.ts`
- `src/fauna/herdCohesion.ts`
- powiązanych systemach.

Sprawdzić m.in.:

- perception,
- decision intervals,
- movement,
- hunger,
- stamina,
- eating,
- drinking,
- attack cooldown,
- flee/alert timers,
- lifecycle,
- reproduction,
- corpse/dead-animal timing,
- herd cohesion.

Nie przenosić automatycznie wszystkich timerów fauna na World Time.

Jeżeli problem wymaga pełnego off-screen fauna simulation, zapisać go jako osobny follow-up.

---

## 10. Combat i Player Actions

Sklasyfikować timery w:

- `src/combat/`
- `src/player/`
- `src/app/busyAction.ts`

Pozostawić jako Real-Time Actions tam, gdzie ich znaczenie jest związane z:

- cooldownem,
- długością akcji,
- animacją,
- reakcją bojową,
- projectile timing.

Nie konwertować ich mechanicznie na game-time.

---

## 11. Weather / Seasons

Sprawdzić:

`src/world/weather.ts`

oraz systemy sezonowe.

Zweryfikować, czy:

- korzystają z istniejącego World Time,
- nie posiadają drugiego zegara świata,
- nie mają własnej konwersji `dayLengthSec`,
- poprawnie reagują na time skip.

---

## 12. Final consistency pass

Po zmianach wykonać ponowny repo-wide search dla:

- `480`
- `dayLengthSec`
- `elapsedDays`
- `timeMultiplier`
- `dt`
- `duration`
- `cooldown`
- timer-related constants.

Upewnić się, że każdy istotny mechanizm ma:

- jasno określoną jednostkę,
- jasno określoną kategorię czasu,
- jednoznaczne źródło czasu.

Nie refaktorować mechanizmów, które są poprawne tylko dlatego, że wyglądają inaczej.

---

## 13. Testy specyficzne dla planu

Dodać lub rozszerzyć testy dla wspólnych konwersji:

- 0 days,
- 1 day,
- 0.5 day,
- 1 game hour,
- 24 game hours,
- round-trip conversions.

Sprawdzić co najmniej:

- `dayLengthSec = 480`
- `dayLengthSec = 600`
- `dayLengthSec = 240`

Najważniejszy przypadek:

Jeżeli tuning systemu wynosi 3 game-days, zmiana `dayLengthSec` nie może zmienić tego na 2.4 lub 3.75 game-days.

Zmienić ma się wyłącznie liczba real/simulation seconds potrzebnych do osiągnięcia tego samego World Time.

Objąć testami szczególnie:

- Player Needs,
- NPC Needs/Vigor,
- `tickDayNight`,
- istniejące `TimedProcess` tests, jeśli API ulegnie zmianie.

---

## 14. Dokumentacja

Dodać krótką dokumentację modelu czasu w istniejącej dokumentacji architektury.

Powinna określać:

- kiedy używać `elapsedDays`,
- kiedy używać `dt`,
- kiedy używać real-time duration,
- że konwersje zależne od `dayLengthSec` nie powinny być hardcoded w systemach.

Nie tworzyć dużej osobnej dokumentacji.

---

## Verification

Oprócz standardowej weryfikacji projektu:

- zweryfikować testy konwersji,
- zweryfikować `dayLengthSec != 480`,
- zweryfikować Player Needs,
- zweryfikować NPC Needs/Vigor,
- zweryfikować time skip,
- zweryfikować crops/trees/timed processes.

Browser/manual verification:

1. normalny cykl dnia/nocy,
2. player hunger/thirst/vigor,
3. NPC needs/vigor,
4. NPC schedule podczas time skip,
5. crops,
6. trees,
7. timed processes/drying,
8. weather/seasons,
9. aktywna fauna,
10. combat/action cooldowns.

---

## Kryteria akceptacji

- [x] `DayNightState` pozostaje właścicielem World Time.
- [x] Nie powstaje globalny `TimeManager`.
- [x] Wszystkie istotne mechanizmy czasu są sklasyfikowane.
- [x] `480` nie jest używane jako ukryta stała konwersji.
- [x] Player Needs korzystają z aktualnego `dayLengthSec`.
- [x] NPC Needs/Vigor korzystają z aktualnego `dayLengthSec`, jeśli ich tuning jest game-time based.
- [x] Crops/Trees/TimedProcess pozostają lazy World-Time systems.
- [x] NPC time skip zachowuje obecny catch-up model.
- [x] Player Needs zachowują obecne zachowanie podczas time skip.
- [x] Fauna nie zostaje mechanicznie przeniesiona na World Time.
- [x] Combat/action cooldowns pozostają real-time tam, gdzie jest to właściwe.
- [x] Istnieją testy konwersji i zmiennego `dayLengthSec`.
- [x] Zmiana `dayLengthSec` nie zmienia gameplayowego tuningu wyrażonego w game-days/game-hours.
- [x] Dokumentacja opisuje model czasu.
- [x] Nie wprowadzono niepotrzebnego refaktoru poza zakresem.

Zrobiono commit i push na branch `claude/arch-time-simulation-consistency-a7u3su` (nie `main` — sesja pracuje na dedykowanym branchu, zobacz implementation notes).
