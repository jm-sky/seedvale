# Plan: Time-Skip Simulation Semantics

**Created:** 2026-08-22  
**Status:** `verification needed` 🔍 — implemented + technically verified (`tsc`/lint/build/test green); browser verification not yet done, see [implementation notes](./2026-08-22--196--arch--time-skip-simulation-semantics-implementation-notes.md).  
**Priority:** critical · **Effort:** M  
**Depends on:** ~~192~~ ~~193~~

## Cel

Naprawić semantykę `timeSkip`, tak aby jeden okres czasu świata był zastosowany **dokładnie raz** i nie powodował przyspieszonej, ukrytej symulacji klatkowej NPC/fauny.

Obecnie:

```text
timeSkip
  → timeMultiplier
  → accelerated worldDt
  → normal NPC/fauna simulation
  → dodatkowy NPC catch-up
```

prowadzi do double-processing NPC oraz do niekontrolowanej symulacji fauny, combat i corpse lifecycle.

### Docelowy invariant

> **Time-skip może przesunąć World Time o wiele godzin, ale nie może być interpretowany jako wykonanie wielu normalnych klatek symulacji NPC/fauny. Każdy skutek tego przesunięcia czasu musi zostać zastosowany dokładnie raz.**

---

## Zakres

### 1. Ustalić formalny model time-skip

Przed zmianami w kodzie określić dla każdego istotnego systemu:

| System | Podczas skipu | Po skipie |
|---|---|---|
| World Time | advance | — |
| Weather / day-night | advance | — |
| Player normal simulation | określone przez istniejący kontrakt | normal |
| NPC | bez accelerated live tick | deterministic catch-up |
| Fauna | bez accelerated live tick | deterministic catch-up / odpowiednia agregacja |
| Combat | brak ukrytego accelerated combat | normal |
| Corpse lifecycle | brak accelerated runtime tick | zastosowanie czasu zgodnie z lifecycle |
| Household | skutki czasu dokładnie raz | — |
| Settlement Economy | skutki czasu dokładnie raz | — |

Jeżeli istnieją wyjątki, mają być jawne i uzasadnione.

**Nie wprowadzać nowej globalnej warstwy zarządzającej symulacją.**

---

### 2. NPC — usunąć double-processing

Przeanalizować relację:

```text
SettlementsManager.update(worldDt)
        +
NpcAgent.resolveTimeSkip(...)
```

i zapewnić, że ten sam okres czasu nie jest stosowany obiema ścieżkami.

Zweryfikować wszystkie skutki catch-up:

- hunger/thirst,
- vigor/stamina,
- HP damage,
- schedule/work,
- gathering,
- household consumption,
- household water,
- `SettlementEconomy`,
- inventory/resource mutations,
- NPC combat state.

Szczególnie usunąć obecny przypadek, w którym `resolveTimeSkip()` może ponownie zmienić `Household` / `SettlementEconomy`.

---

### 3. Fauna — zatrzymać accelerated live simulation

Podczas aktywnego skipu fauna nie może wykonywać normalnego:

```text
AnimalAgent.update(worldDt × timeMultiplier)
```

dla:

- movement,
- behaviour,
- predator/prey interaction,
- combat,
- damage,
- player/NPC attacks,
- lifecycle ticking.

Następnie ustalić **minimalny deterministic catch-up**, który zachowuje ciągłość świata bez wykonywania godzin normalnej symulacji klatka po klatce.

Nie implementować pełnego off-screen simulation engine w ramach tego planu.

---

### 4. Corpse lifecycle

Zapewnić, że time-skip nie powoduje sztucznego:

```text
fresh → rotting → bones → disposed
```

w ciągu kilku rzeczywistych sekund tylko dlatego, że `worldDt` został pomnożony.

Lifecycle ma otrzymać poprawny skutek upływu World Time **dokładnie raz**.

---

### 5. Combat

Zweryfikować wszystkie NPC/fauna combat timers i lifecycle:

- melee,
- ranged,
- predator attacks,
- damage application,
- target acquisition związany z tickiem.

Podczas time-skip nie może istnieć ukryta ścieżka, w której NPC/fauna wykonują przyspieszony combat przeciwko sobie lub graczowi.

---

### 6. Household i Settlement Economy

Zweryfikować wszystkie mutacje wykonywane przez time-skip.

Szczególnie:

- `Household.stock`,
- `Household.water`,
- food/wood/water consumption,
- gathering,
- `SettlementEconomy`.

Dla jednego okresu time-skip:

```text
one elapsed period
      ↓
one application of consequences
```

Nie zmieniać przy tym modelu ownership tych danych — celem jest poprawienie ich aktualizacji, nie tworzenie nowego state managera.

---

### 7. Simulation orchestration

Uporządkować orchestration w `gameLoop.ts`, tak aby kod jasno rozróżniał:

```text
normal simulation tick
        vs
time-skip progression
```

Wykorzystać istniejące mechanizmy:

- `DayNightState`,
- `timeSkip`,
- `worldDt`,
- `SettlementsManager`,
- fauna,
- istniejące simulation contracts.

Nie tworzyć:

- `SimulationManager`,
- globalnego event bus,
- równoległego time system,
- nowej abstrakcji tylko dla time-skip.

---

### 8. Dokumentacja i kontrakty

Zaktualizować dokumentację tak, aby opisywała **rzeczywisty** model:

- `docs/ARCHITECTURE.md`,
- `docs/STATE.md`,
- odpowiednią dokumentację time/simulation, jeśli istnieje.

Usunąć lub poprawić komentarze sugerujące zachowanie inne niż faktycznie egzekwowane przez kod.

---

## Poza zakresem

Nie obejmuje:

- persystencji NPC przez streaming/rebuild — **197**,
- pełnego NPC lifecycle architecture — **197**,
- resource-deposit persistence — **198**,
- entity transfer / quest identity — **199**,
- save persistence gaps — **200**,
- ogólnego refaktoru `gameLoop.ts`,
- pełnego off-screen simulation system,
- multiplayer,
- przebudowy AI NPC/fauny.

---

## Weryfikacja

### Testy

Dodać lub rozszerzyć testy obejmujące:

- time-skip progression,
- NPC catch-up,
- brak podwójnego NPC processing,
- household mutations,
- economy mutations,
- fauna update gating,
- fauna catch-up,
- combat,
- corpse lifecycle,
- zakończenie time-skip.

Kluczowy test regresyjny:

> Ten sam okres World Time zastosowany przez time-skip musi prowadzić do tego samego logicznego skutku niezależnie od liczby real-time frames wykonanych podczas skipu.

### Browser verification

Zweryfikować co najmniej:

1. rozpoczęcie długiego time-skip,
2. brak accelerated NPC simulation,
3. brak accelerated fauna movement/combat,
4. brak ukrytych obrażeń gracza/NPC od fauny,
5. brak przedwczesnego corpse disposal,
6. brak podwójnego zużycia Household/Economy,
7. poprawny stan NPC/fauny po zakończeniu skipu,
8. poprawne przejście z powrotem do normalnej symulacji.

---

## Kryteria akceptacji

- [x] Jeden okres time-skip jest przetwarzany dokładnie raz.
- [x] NPC nie wykonują normalnego accelerated tick + catch-up dla tego samego czasu.
- [x] Fauna nie wykonuje accelerated live simulation.
- [x] Time-skip nie powoduje ukrytego accelerated combat.
- [x] Corpse lifecycle zachowuje poprawną semantykę czasu.
- [x] Household i Settlement Economy nie otrzymują podwójnych mutacji.
- [x] Catch-up jest deterministyczny i nie wymaga symulowania godzin klatka po klatce.
- [x] Normalna symulacja poza time-skip pozostaje bez niepotrzebnych zmian.
- [x] Nie powstaje nowy globalny manager symulacji.
- [x] Kod i dokumentacja opisują ten sam kontrakt.
- [x] Testy przechodzą.
- [ ] Zachowanie zostało zweryfikowane w przeglądarce. — nie wykonane w tej sesji (agent nie uruchamia przeglądarki per `CLAUDE.md`); patrz implementation notes, sekcja "Browser verification" w planie poniżej dla konkretnych kroków dla użytkownika.

> **Zrób git commit i push do main, rebase jeżeli trzeba**