# Plan: NPC Candidate Strategies

**Created:** 2026-08-24  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** M  
**Depends on:** ~~ai-001~~ ~~ai-002~~  
**Domain:** NPC AI / Decision Making

## Cel

Wprowadzić pierwszy jawny poziom **Strategy Selection** pomiędzy wybraną pressure/need a wykonaniem akcji.

Nie tworzyć nowego `StrategySystem` ani persistent planner'a. Wykorzystać istniejące alternatywy znajdujące się obecnie wewnątrz `NpcAgent.beginNeed()`.

### Obecnie

```text
Pressures
  ↓
personality / role scoring
  ↓
NeedId
  ↓
beginNeed()
  ↓
ukryty wybór sposobu działania
  ↓
PlannedAction
```

### Po ai-003

```text
Pressures
  ↓
personality / role scoring
  ↓
NeedId
  ↓
candidate strategies
  ↓
strategy selection
  ↓
existing PlannedAction
```

## Scope

### 1. Zdefiniować strategie

Jawne strategie powinny reprezentować **sposób rozwiązania istniejącej potrzeby**, a nie nowy typ potrzeby.

Pierwszy zakres:

```text
food
 ├─ household food
 ├─ nearby real food source
 └─ settlement garden

water
 ├─ household water
 └─ well

waterDuty
 └─ fetch water → deposit

wood
 └─ chop → deposit
```

Nie wszystkie muszą od razu mieć wielokrotne warianty. Istotne jest ustanowienie mechanizmu.

### 2. Zacząć od food vertical slice

Pierwszym pełnym przypadkiem powinno być `food`, ponieważ istnieją już trzy rzeczywiste ścieżki:

```text
food pressure
    ↓
household food
nearby food
settlement garden
    ↓
available candidates
    ↓
select strategy
    ↓
existing action
```

`water`, `waterDuty` i `wood` powinny zostać przygotowane pod późniejsze wykorzystanie tego mechanizmu, ale nie wymagają pełnej abstrakcji w pierwszej iteracji, jeśli nie jest ona potrzebna do vertical slice.

### 3. Oddzielić wybór strategii od wykonania

Obecne `beginNeed()` zawiera jednocześnie:

- sprawdzanie dostępności,
- wybór alternatywy,
- przygotowanie `PlannedAction`,
- wykonanie konsekwencji.

Wydzielić pierwszy etap:

```text
getCandidateStrategies(need, context)
        ↓
selectStrategy(...)
        ↓
executeStrategy(...)
```

bez zmiany istniejącego `PlannedAction`.

### 4. Wykorzystać istniejące constraints

Dostępność strategii ma wynikać z istniejącego świata:

- household stock,
- water availability,
- nearby food sources,
- trees,
- workplace,
- istniejące economy/resource hooks.

**Nie tworzyć równoległego systemu availability.**

Strategia niedostępna nie powinna trafiać do wyboru.

### 5. Nie tworzyć osobnego strategy scoring engine

Pierwsza wersja powinna być minimalna:

```text
Need
  ↓
candidate strategies
  ↓
availability / constraints
  ↓
existing decision context / modifiers, jeśli rzeczywiście potrzebne
  ↓
selected strategy
```

Nie przenosić jeszcze całego ai-002 na strategie.

W szczególności nie wymuszać użycia `openness`, `extraversion` czy `agreeableness`, dopóki konkretna strategia nie daje im sensownego miejsca.

### 6. Diagnostics

Rozszerzyć istniejącą diagnostykę zamiast tworzyć nowy system:

```text
lastPressures
lastDecisionCandidates
lastStrategyCandidates
selectedStrategy
```

Trace powinien pozwolić zobaczyć:

```text
need: food
strategies:
  household = unavailable
  nearbyFood = available
  garden = available

selected: nearbyFood
```

To będzie ważne przy kolejnych etapach AI.

## Poza scope

Nie robić teraz:

- GOAP,
- utility planner'a,
- persistent goals,
- hierarchical plans,
- osobnego `StrategyManager`,
- nowego FSM,
- przebudowy `PlannedAction`,
- multiplayer architecture,
- LLM decision making,
- kolejnych personality traits tylko po to, żeby je wykorzystać.

## Integracja

Najważniejszym miejscem pozostaje:

```text
NpcAgent.choose
  → generateNeedPressures()
  → scoreNeedCandidates()
  → pick need
  → strategy selection
  → existing begin/action pipeline
```

`Needs.ts` powinien pozostać niezależny od personality i strategii.

`DecisionContext` można rozszerzyć tylko jeśli rzeczywiście będzie potrzebny do strategy selection.

## Kryteria sukcesu

1. Jedna potrzeba może mieć jawnie więcej niż jedną strategię.
2. Niedostępne strategie są odrzucane przed wyborem.
3. Wybrana strategia prowadzi do istniejącego `PlannedAction`.
4. Nie powstaje drugi system wykonywania akcji.
5. Dotychczasowe zachowanie NPC pozostaje zachowane, jeśli dostępna jest tylko jedna strategia.
6. Diagnostics pokazuje **pressure → strategy candidates → selected strategy → action**.
7. Testy pokrywają candidate generation i selection niezależnie od Three.js.

## Verification

- unit tests dla candidate generation,
- unit tests dla strategy selection,
- istniejące AI tests,
- `npm run build`,
- browser verification dla kilku NPC z:
  - jedzeniem w household,
  - brakiem jedzenia w household i pobliskim źródłem,
  - brakiem pobliskiego źródła i dostępem do settlement garden.

## Architektura po ai-003

Najważniejsza decyzja: **ai-003 nie powinien jeszcze tworzyć abstrakcji `Strategy → Plan → Actions`.**

Najpierw należy sprawić, żeby istniejący kod rzeczywiście wykonywał:

```text
Pressure → Strategy → Action
```

Dopiero obserwacja tego mechanizmu pokaże, jaki powinien być następny krok w kierunku:

```text
Strategy → Plan → Actions
```

To ogranicza zakres i ryzyko overengineeringu.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
