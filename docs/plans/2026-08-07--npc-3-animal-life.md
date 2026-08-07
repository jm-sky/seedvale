# Plan: Animal Life Simulation

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
