# Plan: Animal Life Simulation

> Draft from ChatGPT without repository files access. Review before implementation!

## Review (2026-08-07, Claude) — vs. realia kodu

- **Duża część już istnieje** w zaimplementowanym (status `done`) [predator-prey-system.md](./2026-08-07--predator-prey-system.md):
  - „Territory / Home Range" (§5) → już jest: `AnimalAgent.home` + `ROAM_RADIUS = 50` ([AnimalAgent.ts:26,405-416](../../src/fauna/AnimalAgent.ts)), zwierzę nie oddala się poza promień od miejsca spawnu.
  - „Daily Schedule" (§2, dzień/noc różne zachowania) → częściowo już jest: `isNight` zmienia prędkość prey (`NIGHT_PREY_WALK_MULT`/`NIGHT_PREY_SPRINT_MULT`, [AnimalAgent.ts:261-274](../../src/fauna/AnimalAgent.ts)), liczone z `skyParamsFromTime` w `createFauna`.
  - Plan nie odnosi się do żadnego z tych mechanizmów — czyta się jak zaprojektowany od zera, nie jako rozszerzenie istniejącego `AnimalAgent`/`HealthState`/`AnimalSpawner`.
- **Hunger/thirst/energy jako needs-driven behavior** to sensowne rozszerzenie, ale wymaga nowych zapytań środowiskowych, których dziś nie ma — fauna nie ma odpowiednika `landmarks.well/garden` (te są NPC/settlement-specific, [props.ts](../../src/settlement/props.ts)). To realny nowy zakres pracy (world content + query API), nie tylko logika stanu, czego plan nie sygnalizuje.
- **Save/Persistence (§7) proponuje inny kierunek niż obecna architektura.** Plan chce agregować do poziomu populacji (`AnimalPopulation: gatunek/liczba/region`), ale dzisiejszy system jest per-agent (`AnimalSpawner.ts`, indywidualny `HealthState` na sztukę) — i **`SaveData` w ogóle nie zapisuje dziś stanu fauny/NPC** (potwierdzone w [npc-character-depth.md](./2026-08-07--npc-character-depth.md), sekcja „Poza zakresem v1"). Aggregate-population save to inny model danych niż obecny per-agent — wymaga decyzji projektowej, nie tylko dopisania sekcji do planu.
- **Bez zastrzeżeń:** warstwowanie tick (60fps ruch / co kilka sekund decyzje / co kilka minut aging-populacja, §6) jest spójne z etosem projektu (worker pool, perf-conscious chunk streaming).

Otwarte decyzje do ustalenia z użytkownikiem przed implementacją — patrz wiadomość w wątku review (2026-08-07).

## Decyzje (2026-08-07) — przycięcie zakresu po review

Zdecydowano ograniczyć v1 do warstwy **needs → wander bias** na istniejącym `AnimalAgent` ([AnimalAgent.ts](../../src/fauna/AnimalAgent.ts)).

**W zakresie v1:**
- §1 Animal State — tylko `hunger`, `thirst`, `energy` (bez `age`/`mood`/`currentActivity` — nie mają dziś żadnego konsumenta, dodać gdy pojawi się realna potrzeba).
- §3 Needs → Behavior — `hunger`/`thirst`/`energy` tickują w czasie (analogicznie do `NeedState` u NPC, [Needs.ts](../../src/ai/Needs.ts)) i wpływają na `wander()`/`pickWanderTarget()` w `AnimalAgent.ts` — np. wysoki `hunger` → częstszy/szerszy promień wander („grazing”), niska `energy` → dłuższe `idle` zamiast wander. **Bez** nowych lokacji jedzenia/wody — fauna nie ma dziś odpowiednika `landmarks.well/garden` ([props.ts](../../src/settlement/props.ts)), a dodanie go to osobny, większy zakres pracy (world content + query API). To sygnał behawioralny (bias istniejącego wander), nie nawigacja do konkretnego miejsca.

**Odłożone (nie w v1, zostają w planie jako przyszłość):**
- §2 Daily Schedule — częściowo już pokryte istniejącym `isNight` (prędkość prey w dzień/noc, patrz Review); pełny wzorzec pór dnia per gatunek odłożony.
- §4 Animal Memory — odłożone, brak dziś jakiejkolwiek pamięci lokalnej u fauny.
- §5 Territory/Home Range — `home` + `ROAM_RADIUS` już istnieje ([AnimalAgent.ts:26,405-416](../../src/fauna/AnimalAgent.ts)), nic dodatkowego do zrobienia w v1.
- §7 Save/Persistence — obecny `SaveData` nie zapisuje fauny w ogóle (patrz Review); aggregate-population model to osobna decyzja projektowa na później, po ustaleniu czy w ogóle chcemy persystować faunę.
- §8 Przyszłość — bez zmian, pozostaje jako lista pomysłów na potem.

## Cel

Nadać zwierzętom własny rytm życia. Zwierzę nie jest tylko encją reagującą
na gracza lub pobliskie obiekty — ma potrzeby, stan i cykl dobowy.

"Animals exist before the player sees them."

---

## 1. Animal State (podstawa)

Dodać trwały stan zwierzęcia:

AnimalLifeState:
- age
- hunger
- thirst
- energy
- health (istniejące HealthState)
- mood/stress
- currentActivity

Przykład:

Wolf:
- energy ↓ podczas polowania
- hunger ↑ z czasem
- rest przy niskiej energii

Deer:
- hunger → szukanie roślinności
- thirst → szukanie wody
- stress → ucieczka

---

## 2. Daily Schedule

Nie sztywny kalendarz, tylko wzorce aktywności zależne od pory dnia.

AnimalSchedule:

Morning:
- deer → grazing
- wolf → hunting/rest

Day:
- deer → feeding/wandering
- wolf → resting

Night:
- wolf → hunting
- deer → sleeping/hidden

Schedule powinien generować "preferencję zachowania",
nie wymuszać waypointów.

---

## 3. Animal Needs → Behavior

Podobnie jak NPC:

Needs
 ↓
Decision
 ↓
Behavior State

Przykład:

Hunger high
 ↓
FindFood
 ↓
Graze

Energy low
 ↓
FindSafePlace
 ↓
Rest

Threat detected
 ↓
Flee

---

## 4. Animal Memory

Lekka pamięć lokalna:

- ostatnie miejsce jedzenia
- ostatnie zagrożenie
- ulubione miejsce odpoczynku
- terytorium

Nie AI/LLM.

---

## 5. Territory / Home Range

Każde zwierzę ma obszar życia:

Deer:
- kilka km²
- punkty wodne
- miejsca żerowania

Wolf:
- terytorium
- polowania w grupie (później)

To pozwoli uniknąć przypadkowego chodzenia.

---

## 6. Simulation Tick

Nie wszystko musi działać co klatkę.

Animal simulation:

60 FPS:
- ruch
- animacja
- proximity

Co kilka sekund:
- decyzje
- potrzeby

Co kilka minut:
- starzenie
- populacja
- migracja

---

## 7. Save / Persistence

Docelowo zapisywać:

AnimalPopulation:
- gatunek
- liczba osobników
- region
- stan populacji

Nie każdy królik jako osobny obiekt.

---

## 8. Przyszłość

Możliwe rozszerzenia:

- rozmnażanie
- stada
- migracje sezonowe
- choroby
- relacje predator/prey bardziej biologiczne
- wpływ pogody
