# Plan: NPC Daily Routine & Place System

Part 2 of ChatGPT plans.

> Draft from ChatGPT without repository files access. Review before implementation!

## Review (2026-08-07, Claude) — vs. realia kodu

- **Zależy od `role`** z [npc-1-identity.md](./2026-08-07--019--npc-1-identity.md) — nierozstrzygnięty, patrz review tamtego planu.
- **„Home Assignment" częściowo już istnieje.** Plan opisuje to jako brakujący system do zbudowania, ale `createSettlement.ts:36-39` już trywialnie przypisuje dom każdemu NPC przy tworzeniu osady (`landmarks.homes[i % landmarks.homes.length]`). Brakuje tylko formalnego typu `Place` — sama funkcjonalność (dom przypisany automatycznie, nie ręcznie) już działa.
- **`workplace: Place` per rola zakłada nowy world content, którego dziś nie ma.** `SettlementLandmarks` ma dziś **jeden wspólny** well/garden/stockpile dla całej osady ([props.ts:5-9](../../src/settlement/props.ts)) — nie ma per-rola workplace (farma, posterunek strażnika, stoisko handlarza). Zrobienie tego wymaga nowej generacji zawartości świata (nowe propsy/lokacje per rola), nie tylko logiki FSM/schedule — plan to zaniża, opisując jako „dodajemy Schedule Template + Place system".
- **Obecny FSM jest zasobowo-specyficzny, nie generyczny.** `Phase` w `NpcAgent.ts` to `goWell/goGarden/goTree/goStock/chop/deposit/drink/eat/wander/...` — zaszyte 1:1 z konkretnymi needs (woda/jedzenie/drewno). Plan zakłada generyczny `goTo(location) → execute(action) → return`, czego dziś nie ma — integracja „Schedule → FSM" to refaktor fazowego automatu, nie tylko nakładka nad nim.
- **Nawiązanie do zegara dnia/nocy jest wykonalne, ale plan go nie wspomina.** `src/world/dayNight.ts` już istnieje z `timeMultiplier`/`dayLengthSec` — harmonogram 07:00/12:00/18:00/22:00 mógłby się z nim spiąć, ale wymaga jawnego wiring, którego plan nie opisuje.

Otwarte decyzje do ustalenia z użytkownikiem przed implementacją — patrz wiadomość w wątku review (2026-08-07).

## Decyzje (2026-08-07) — przycięcie zakresu po review

**W zakresie v1:** tylko formalizacja `home` jako `Place`. `createSettlement.ts:36-39` już dziś przypisuje dom każdemu NPC automatycznie (`landmarks.homes[i % landmarks.homes.length]`) — v1 tego planu to typ `Place { id, type: 'home', position }` i drobny refaktor, żeby ten istniejący przydział przechodził przez formalny typ zamiast gołego `THREE.Vector3`. Bez widocznej zmiany w grze — czysto porządkujące.

**Odłożone (nie w v1, zostają w planie jako przyszłość — wymagają `role` z `npc-character-depth.md`, który sam ma `role` tylko jako dane bez zachowania):**
- `Schedule Template` per rola, personalny harmonogram, traits modyfikujące harmonogram (§ Daily Schedule, Schedule Template, Traits wpływające na harmonogram).
- `workplace: Place` per rola (`Forest_A`, `Farm_2`...) — dziś `SettlementLandmarks` ma jeden wspólny well/garden/stockpile dla całej osady ([props.ts:5-9](../../src/settlement/props.ts)), nie ma per-rola lokacji pracy. To wymaga nowej generacji world contentu (nowe propsy/lokacje), nie tylko logiki — osobna decyzja o zakresie, gdy `role` z `npc-character-depth.md` zacznie mieć realne zachowanie.
- Integracja z FSM (generyczny `goTo(location) → execute(action)`) — dzisiejszy `Phase` w `NpcAgent.ts` jest zasobowo-specyficzny (`goWell/goGarden/goTree/goStock`), refaktor na generyczny system to osobny krok, robiony razem z workplace, nie osobno.
- `food`/`social` typy `Place` — bez konsumenta dopóki nie ma schedule.

Powód przycięcia: pełny zakres zależy od nierozstrzygniętego jeszcze zachowania `role` i wymaga nowej zawartości świata (dodatkowe lokacje per rola) — zbyt duży, nieprecyzyjny skok na raz. Wracamy do pełnego zakresu, gdy `role` z `npc-character-depth.md` wyląduje i będzie decyzja o kolejnych typach miejsc pracy.

**Cel:**  
Dodanie warstwy codziennego życia NPC. Każdy mieszkaniec otrzymuje elastyczny plan dnia, własne miejsca związane z życiem oraz możliwość modyfikowania zachowania przez Identity Model.

System nie zastępuje istniejącego FSM — jest warstwą planowania nad obecnym systemem zachowań.

---

# Przepływ decyzji NPC

Docelowy przepływ:

```
Role
 ↓
Schedule Template
 ↓
NPC Identity (traits + personality)
 ↓
Personal Schedule
 ↓
Needs override
 ↓
FSM execution
```

---

# Daily Schedule

Każdy NPC posiada indywidualny plan dnia.

Plan nie jest sztywnym kalendarzem — jest bazowym kierunkiem działania.

Przykład:

```
07:00 → work
12:00 → eat
13:00 → work
18:00 → home
22:00 → sleep
```

Potrzeby NPC mogą zmieniać plan:

```
hunger > threshold
↓
przerwij aktualną aktywność
↓
idź jeść
```

---

# Schedule Template

Na początku role definiują szablony dnia.

Przykład:

```
woodcutter:

06:00 wake
07:00 work
12:00 eat
13:00 work
18:00 home
22:00 sleep
```

```
farmer:

06:00 wake
07:00 farm
12:00 eat
13:00 farm
18:00 home
22:00 sleep
```

NPC nie posiada ręcznie zdefiniowanego kalendarza.

Personalny harmonogram powstaje na podstawie:

- roli,
- traits,
- personality.

---

# Traits wpływające na harmonogram

Traits modyfikują bazowy plan dnia.

Przykłady:

```
night_owl
→ przesuwa aktywność na późniejsze godziny

hardworking
→ mniej przerw, dłuższa praca

social
→ więcej czasu w miejscach społecznych
```

Traits nie zastępują roli.

---

# Integracja z FSM

Nie tworzymy drugiego systemu zachowania.

Schedule określa:

```
"co NPC powinien teraz robić"
```

FSM wykonuje:

```
goTo(location)
 ↓
execute action
 ↓
return
```

Przykład:

```
Schedule:
"praca"

FSM:
idź do miejsca pracy
wykonaj akcję
wróć do planu
```

---

# Place System

Dodajemy nowy typ świata:

```ts
Place {
  id
  type
  position
}
```

Minimalny typ:

```ts
type PlaceType =
  | "home"
  | "workplace"
  | "food"
  | "social"
```

Place reprezentuje miejsce, do którego NPC może kierować swoje aktywności.

---

# Rozdzielenie roli i miejsca

Role nie zawierają lokalizacji.

Rola:

```
woodcutter
farmer
guard
trader
```

opisuje:

- funkcję NPC,
- aktywności,
- możliwe zadania.

Miejsce jest osobnym stanem NPC.

Przykład:

```
NPC:

home:
House_5

role:
woodcutter

workplace:
Forest_A
```

Po zmianie roli:

```
woodcutter → farmer

home:
House_5

workplace:
Farm_2
```

Dom pozostaje.

---

# Place jako fundament

Docelowo:

```ts
Place {
  id
  type
  position
  capacity?
  activities?
}
```

Na początku używamy minimalnej wersji.

Rozszerzenia później:

- karczmy,
- warsztaty,
- farmy,
- miejsca społeczne,
- wiele NPC korzystających z jednego miejsca.

---

# Home Assignment

Dom NPC nie jest przypisywany ręcznie.

Podczas generowania świata osada automatycznie przydziela dostępne miejsca mieszkalne mieszkańcom.

Proces:

```
World Generation
↓
Generate Places (homes)
↓
Assign homes to NPCs
↓
Create NPC schedule
```

Na początku:

- każdy NPC otrzymuje jedno miejsce `home`,
- brak systemu przeprowadzek,
- brak budowania i zmiany mieszkań.

Przyszła rozbudowa (osobny plan):

- nowe domy,
- rozwój osady,
- zmiana miejsca zamieszkania,
- relacja NPC ↔ dom.

---

# Zakres pierwszego etapu

Dodajemy:

- system `Place`,
- automatyczne przypisanie domów podczas generowania świata,
- `Schedule Template` zależny od roli,
- generowanie osobistego harmonogramu NPC,
- modyfikację harmonogramu przez traits,
- integrację harmonogramu z istniejącym FSM.

Nie dodajemy jeszcze:

- przeprowadzek,
- budowania domów,
- ekonomii osady,
- pełnych relacji NPC,
- kariery i rozwoju zawodowego.

---

# Kierunek rozwoju

Docelowe zachowanie NPC:

```
Identity
   +
Role
   +
Places
   +
Schedule
   +
Needs
   ↓
FSM
   ↓
Daily life simulation
```

Celem jest stworzenie mieszkańców, którzy mają własne życie i rytm dnia, a nie tylko reagują na obecność gracza.