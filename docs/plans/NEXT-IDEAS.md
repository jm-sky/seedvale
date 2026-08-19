# Seedvale — NEXT-IDEAS: kolejność wdrożenia i zależności

## Cel

`docs/plans/NEXT-IDEAS.md` zawiera funkcjonalności odzyskane z wcześniejszych planów, które zostały świadomie odłożone.

Poniższa kolejność została ułożona na podstawie:

- aktualnego codebase,
- `docs/STATE.md`,
- istniejących planów,
- zależności pomiędzy systemami,
- kierunku Seedvale,
- wartości integracyjnej i emergent behaviour.

Nie jest to roadmapa produktu. Jest to **proponowana kolejność wdrażania istniejących pozycji z NEXT-IDEAS**.

> Preferować rozszerzanie istniejących systemów i łączenie ich ze sobą zamiast tworzenia równoległych mechanizmów.

---

# 1. Recommended implementation order

## Front backlog

### 0. GPU Weather Renderer — ✅ zaimplementowane 2026-08-15

**Źródłowy plan:** 040 — Seasons & Weather (Etap 3, [implementation notes](./archive/2026-08-08--040--seasons-weather-implementation-notes.md))  
**Effort:** M/L  
**Charakter:** rendering / performance

`world/weatherParticles.ts` przeszedł z CPU `THREE.Points` na GPU `ShaderMaterial` (proceduralne pozycje w vertex shaderze, bez per-particle CPU update loop). Techniczna weryfikacja zielona; brak testu w przeglądarce i brak zmierzonego benchmarku before/after — patrz implementation notes Etap 5.

**Dependencies:**

- istniejący Climate / Weather state,
- istniejący day/night,
- istniejący renderer,
- WebGL2.

**Dlaczego teraz:**

Obecny weather rendering wykorzystuje CPU particles jako świadomy stopgap. GPU Weather Renderer domyka istniejący system bez wprowadzania nowej mechaniki symulacyjnej.

```text
Weather State
      ↓
GPU Weather Renderer
      ↓
Rain / Snow
```

Nie powinien jednak blokować późniejszego gameplayu.

---

### 1. Zbieranie naturalnych zasobów

**Źródłowy plan:** 032 — Natural Resources  
**Effort:** M

**Dependencies:**

- `NaturalResource`,
- resource deposits,
- NPC professions,
- NPC work/actions,
- `Inventory`,
- `ItemKind`,
- Household / storage.

**Dlaczego teraz:**

Natural Resources już istnieją jako fundament świata. Brakuje przede wszystkim rzeczywistego przepływu:

```text
Natural Resource
      ↓
NPC gathering
      ↓
Inventory / storage
```

To pierwszy krok od zasobów istniejących w świecie do realnej gospodarki.

**Ważne:**

Nie budować ponownie Natural Resources. Większość fundamentu już istnieje.

---

### 2. Produkcja i przetwarzanie dóbr

**Źródłowy plan:** 071 — Local Economy / Production  
**Effort:** L

**Dependencies:**

- resource gathering,
- NPC professions,
- work actions,
- `ItemKind`,
- inventory/storage,
- existing household/economy state.

**Dlaczego teraz:**

Po gathering naturalnie powstaje kolejny etap:

```text
Resources
    ↓
Gathering
    ↓
Production
    ↓
Goods
```

To powinno rozszerzać istniejący system ekonomiczny, a nie tworzyć osobny production subsystem.

---

### 3. Miejsca społeczne i życie społeczne NPC

**Źródłowy plan:** 020 — NPC Schedule / Places  
**Effort:** M

**Dependencies:**

- `Place`,
- `Schedule`,
- NPC FSM,
- existing NPC behaviour,
- relationships.

**Dlaczego teraz:**

Fundament już istnieje:

```text
Place
  ↓
Schedule
  ↓
FSM
  ↓
goTo(place)
  ↓
action
```

Istnieją również typy miejsc związane m.in. z `home`, `workplace`, `food` i `social`.

Rozszerzenie social behaviour może więc wykorzystać istniejący `Place`/`Schedule`/FSM zamiast tworzyć nowy system społeczny.

---

### 4. Questy związane z landmarkami

**Źródłowe plany:** 093 / 049  
**Effort:** M

**Dependencies:**

- QuestManager,
- existing world-driven quests,
- procedural landmarks,
- stable `landmarkId`,
- player interaction.

**Dlaczego teraz:**

Większość fundamentu już istnieje.

Landmarki mają stabilną identyfikację, a QuestManager i world-driven quest foundations są już obecne.

Brakuje przede wszystkim połączenia:

```text
Landmark
    ↓
stable landmarkId
    ↓
Quest objective
    ↓
Player action
    ↓
World consequence
```

To daje dużo world-driven content bez budowania nowego dużego systemu symulacji.

---

### 5. Dalsze detale wizualne terenu

**Źródłowy plan:** terrain rendering / world visual detail  
**Effort:** S/M  
**Charakter:** rendering polish

**Dependencies:**

- istniejący terrain renderer,
- chunk geometry,
- aktualny material/shader pipeline,
- benchmark renderingu.

To osobny temat od gameplayu.

Może poprawić jakość świata po wykonaniu wcześniejszych zmian renderingu, ale nie powinien blokować systemów symulacyjnych.

---

# 2. Główny ciąg dalszego rozwoju

Po pierwszych pięciu elementach naturalny dalszy kierunek wygląda następująco.

## 6. Rozwój ekonomii gospodarstw domowych

**Effort:** L

**Dependencies:**

- gathering,
- production,
- goods,
- Inventory / ItemKind,
- Household,
- SettlementEconomy,
- NPC needs.

Fundament `Household` już istnieje.

Nie należy tworzyć nowego Household System.

Rozszerzenie powinno pogłębić istniejący przepływ:

```text
Goods
  ↓
Household
  ↓
Consumption
  ↓
Stock / Shortage
  ↓
Needs / Pressure
  ↓
Work / Acquisition
```

---

## 7. Wspólny łańcuch ekonomiczny NPC + gracz

**Effort:** M/L

**Dependencies:**

- gathering,
- production,
- household economy,
- inventory,
- ItemKind,
- settlement economy.

Docelowy przepływ:

```text
Natural Resources
      ↓
Gathering
      ↓
Production
      ↓
Goods
      ↓
Household
      ↓
Settlement Economy
      ↓
Surplus / Shortage
      ↓
Trade
```

Gracz powinien uczestniczyć w tych samych podstawowych mechanizmach gospodarczych co NPC, zamiast otrzymywać równoległą ekonomię.

---

## 8. Sezonowy wpływ na pozostałe systemy

**Źródłowy plan:** 040 — Seasons & Weather  
**Effort:** L

**Dependencies:**

- ClimateState,
- resources,
- production,
- household economy,
- NPC behaviour,
- fauna.

Sam system sezonów/pogody jest już częściowo wykonany.

Największa wartość kolejnego etapu będzie pochodzić z jego konsumpcji przez inne systemy:

```text
Season / Weather
       ↓
Natural Resources
       ↓
Production
       ↓
Household
       ↓
Settlement
```

oraz:

```text
Season / Weather
       ↓
Fauna
       ↓
Habitat
       ↓
Population
```

Nie tworzyć kolejnego systemu pogodowego.

---

## 9. Terytoria zwierząt

**Źródłowy plan:** 118 / fauna evolution  
**Effort:** M/L

**Dependencies:**

- existing fauna,
- habitat,
- herds,
- juveniles,
- movement,
- world terrain/environment.

Fauna ma już podstawowe potrzeby, drapieżnictwo, stada i osobniki młode.

Kolejnym krokiem powinno być dodanie przestrzennego modelu:

```text
Habitat
   ↓
Territory
   ↓
Herd / Population
   ↓
Movement / Feeding / Reproduction
```

---

## 10. Persystencja / off-screen simulation fauny

**Źródłowy plan:** 118  
**Effort:** L/XL

**Dependencies:**

- fauna territories,
- population model,
- herds,
- off-screen simulation,
- world streaming,
- persistence.

Nie należy zaczynać od samego zapisywania aktywnych zwierząt.

Docelowy model powinien łączyć:

```text
Detailed Simulation
        ↕
Aggregated Remote Simulation
        ↕
Persistent World State
```

Dzięki temu świat może kontynuować rozwój poza aktualnie załadowanymi chunkami.

---

## 11. Bandyci jako problemy świata

**Źródłowy plan:** 093  
**Effort:** L/XL

**Dependencies:**

- NPC/group simulation,
- world problems,
- settlements,
- NPC relationships,
- quests,
- consequences.

Bandyci nie powinni być tylko nowym typem przeciwnika.

Lepszy model:

```text
Hostile Group
      ↓
Local Problem
      ↓
NPC / Settlement Consequences
      ↓
Quest
      ↓
Player Intervention
      ↓
World Change
```

---

# 3. Dependency map

## Economy

```text
Natural Resources
       ↓
Resource Gathering
       ↓
NPC Professions / Work
       ↓
Production / Processing
       ↓
Goods / ItemKind
       ↓
Household
       ↓
Settlement Economy
       ↓
Surplus / Shortage
       ↓
Trade
```

## NPC life

```text
Identity
   +
Profession
   +
Needs
   +
Place
   +
Schedule
   ↓
FSM
   ↓
Daily Behaviour
   ↓
Social Behaviour
   ↓
Relationships
   ↓
Dialogue / Quests
```

## Fauna

```text
Habitat
   ↓
Territory
   ↓
Population / Herd
   ↓
Movement / Feeding / Reproduction
   ↓
Off-screen Simulation
   ↓
Persistence
   ↓
Detailed Simulation after Streaming
```

## Climate

```text
Season / Weather
       ↓
Environment
       ↓
Resources
       ↓
Production
       ↓
Household
       ↓
Settlement
```

or:

```text
Season / Weather
       ↓
Fauna Habitat
       ↓
Population
       ↓
Migration / Survival
```

## Quests

```text
World State
      ↓
Problem
      ↓
Pressure
      ↓
Quest
      ↓
Player Action
      ↓
World Change
      ↓
New State / New Problems
```

Landmarks:

```text
Landmark
    ↓
Stable landmarkId
    ↓
Quest Objective
    ↓
Discovery / Travel / Interaction
```

Bandits:

```text
Group
   ↓
Hostile Behaviour
   ↓
Local Problem
   ↓
Settlement / NPC Consequences
   ↓
Quest
```

---

# 4. Natural implementation phases

## Phase A — Technical rendering cleanup

```text
GPU Weather Renderer
        ↓
Terrain Visual Detail
```

Cel:

- zamknąć obecny weather rendering stopgap,
- poprawić visual quality,
- zweryfikować performance.

---

## Phase B — Material economy foundation

```text
Natural Resources
      ↓
Gathering
      ↓
Production
```

Cel:

> Wprowadzić rzeczywisty przepływ materiałów przez świat.

---

## Phase C — NPC community life

```text
Existing Places
      ↓
Social Places
      ↓
Social Behaviour
```

Cel:

> NPC mają funkcjonować jako społeczność, a nie tylko jako wykonawcy pracy.

---

## Phase D — World-driven content

```text
Landmarks
     ↓
Landmark Quests
```

Następnie, znacznie później:

```text
World Problems
     ↓
Bandits / Conflict
     ↓
Quests
```

---

## Phase E — Living economy

```text
Production
    ↓
Household Economy
    ↓
Settlement Economy
    ↓
Surplus / Shortage
    ↓
Trade
```

---

## Phase F — Living ecosystem

```text
Climate
    ↓
Resources / Fauna
    ↓
Territories
    ↓
Population
    ↓
Off-screen Simulation
    ↓
Persistence
```

---

## Phase G — Advanced rendering / scaling

```text
Benchmark
    ↓
Less Work
    ↓
Batching
    ↓
LOD / Culling
    ↓
HLOD
    ↓
Temporal Rendering
    ↓
Advanced GPU Techniques
```

---

# 5. Items that should NOT be treated as immediate gameplay work

## GPU Weather Renderer

**Rendering / performance**

Obecny CPU particle approach jest stopgapem.

To techniczne domknięcie istniejącego systemu, a nie nowa mechanika gameplayowa.

## Terrain visual detail

**Rendering polish**

Poprawia jakość wizualną świata, ale nie tworzy nowych zależności symulacyjnych.

## Temporal Rendering

**Advanced rendering / scalability**

Nie powinien być traktowany jako kolejny feature gameplayowy.

Preferowana kolejność:

```text
Less Work
    ↓
Batching
    ↓
LOD / Culling
    ↓
HLOD
    ↓
Temporal techniques
```

Temporal Rendering powinien wynikać z benchmarków i rzeczywistego bottlenecku.

---

# 6. Important findings

## 6.1. Ekonomia z NEXT-IDEAS jest w rzeczywistości jednym systemem

Pozycje dotyczące:

- gathering,
- production,
- household economy,
- shared NPC/player economy

nie powinny prowadzić do czterech niezależnych mechanizmów.

Docelowo:

```text
Natural Resources
      ↓
Work
      ↓
Gathering
      ↓
Production
      ↓
Goods
      ↓
Household
      ↓
Settlement
      ↓
Trade
```

---

## 6.2. Natural Resources są już częściowo wykonane

Istnieją m.in.:

- resource generation,
- richness,
- resource attraction,
- resource-aware settlements,
- resource-aware families,
- resource-aware roles,
- resource deposits.

Brakującą warstwą jest przede wszystkim:

```text
Resource
   ↓
Acquisition
   ↓
Inventory / Storage
```

Nie należy ponownie implementować fundamentu Natural Resources.

---

## 6.3. Household już istnieje

`Household` oraz podstawowy ekonomiczny state istnieją.

Nie należy tworzyć drugiego systemu gospodarstw.

Przyszły rozwój powinien rozszerzać:

```text
Household
+
Inventory / ItemKind
+
SettlementEconomy
```

---

## 6.4. NPC Schedule / Place już istnieje

Istnieje fundament:

```text
Place → Schedule → FSM
```

Social behaviour powinien być rozszerzeniem tego mechanizmu.

---

## 6.5. Landmark identity jest już rozwiązane

Stabilne `landmarkId` już istnieje.

Największa brakująca warstwa to:

```text
Landmark
   ↓
Quest
```

a nie generowanie/identyfikacja landmarków od nowa.

---

## 6.6. Fauna persistence wymaga wcześniejszego modelu terytoriów/populacji

Nie wystarczy:

```text
save active animals
```

Potrzebny jest model:

```text
Active Population
       ↕
Remote Population
       ↕
Persistent World State
```

Dlatego Territory powinno poprzedzać pełną persistence.

---

## 6.7. Seasons powinny być shared input

ClimateState już istnieje.

Przyszła wartość powinna wynikać z:

```text
Climate
   ↓
Resources
   ↓
Economy
   ↓
NPC
   ↓
Fauna
```

Nie należy tworzyć równoległych mechanizmów sezonowych dla każdego systemu.

---

## 6.8. Rendering powinien mieć osobny tor

Gameplay / simulation:

```text
economy
NPC
fauna
quests
world state
```

Rendering / performance:

```text
weather renderer
terrain detail
chunk streaming
LOD
temporal rendering
```

Te dwa tory mogą rozwijać się równolegle.

---

# 7. Final proposed sequence

```text
0.  GPU Weather Renderer

1.  Zbieranie naturalnych zasobów
2.  Produkcja i przetwarzanie dóbr
3.  Miejsca społeczne i życie społeczne NPC
4.  Questy związane z landmarkami
5.  Dalsze detale wizualne terenu

6.  Rozwój ekonomii gospodarstw domowych
7.  Wspólny łańcuch ekonomiczny NPC + gracz

8.  Sezonowy wpływ na pozostałe systemy

9.  Terytoria zwierząt
10. Persystencja / off-screen simulation fauny

11. Bandyci jako problemy świata

--- osobny późniejszy tor techniczny ---

12. Temporal Rendering / Advanced GPU Techniques
```

## Główna zasada kolejności

```text
Existing System
      ↓
New Consumer
      ↓
New Integration
      ↓
Emergent Behaviour
      ↓
Next System
```

Celem nie jest maksymalna liczba feature'ów.

Celem jest stopniowe uzyskanie:

```text
resources
   ↓
work
   ↓
goods
   ↓
households
   ↓
settlements
   ↓
relationships
   ↓
problems
   ↓
quests
   ↓
world consequences
```

czyli coraz bardziej **samodzielnego świata, który działa również bez gracza**.