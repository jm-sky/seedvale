# Plan: NPC Daily Routine & Place System

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