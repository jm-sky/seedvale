# Plan: NPC Goals & Persistent Plans

**Created:** 2026-08-31  
**Status:** `planned` 📋  
**Priority:** high · **Effort:** M  
**Depends on:** ~~001~~ ~~002~~ ~~003~~  
**Domain:** `ai`

## Cel

Rozwinąć obecny przepływ `Need / Pressure → Decision → Strategy → Action` do modelu, w którym decyzja NPC może utrzymywać cel i strategię przez wiele działań:

```
Need / Problem
    ↓
Pressure
    ↓
Decision
    ↓
Goal + Strategy
    ↓
Persistent Plan
    ↓
current Action
    ↓
world change
    ↓
next Action / re-evaluation
```

Plan reprezentuje **trwającą intencję NPC**, a nie statyczny skrypt przyszłych działań.

## Zakres

### 1. Goal

Dodać minimalną reprezentację rezultatu, który NPC chce osiągnąć w ramach aktualnej decyzji.

Przykłady: `secureFood`, `obtainWood`, `secureWater`, `fulfilWorkDuty`, `protectHousehold`.

Goal opisuje rezultat, nie sposób jego osiągnięcia. Jeden Goal może mieć wiele strategii:

```
secureFood
 ├── stored food
 ├── hunt
 ├── forage
 ├── farm
 └── trade
```

Nie tworzyć osobnego rozbudowanego `GoalSystem`.

### 2. Goal + Strategy jako wynik Decision

Decision wybiera, **co NPC powinien teraz osiągnąć**, oraz sposób realizacji tego celu:

```
food pressure
    ↓
Decision
    ↓
Goal: secureFood
Strategy: hunt
```

Goal i Strategy tworzą kontekst aktualnej intencji, a nie dwa niezależne cykle decyzyjne.

### 3. Persistent Plan

Wprowadzić plan powiązany z aktualnym Goal i Strategy.

Minimalny stan:

```
goal
strategy
state
progress
currentStep
```

Lifecycle:

```
active
interrupted
blocked
partially_completed
completed
obsolete
```

Plan jest własnością bieżącego stanu AI konkretnego NPC. Nie tworzyć globalnego managera planów.

### 4. Dynamiczne kroki

Plan **nie powinien być statyczną listą wszystkich przyszłych Action**.

Przechowuje intencję, progress i bieżący krok. Kolejny konkretny Action jest rozwiązywany, gdy jest potrzebny, na podstawie aktualnego świata.

Przykład:

```
Goal: secureFood
Strategy: hunt
Plan:
  active
  progress: deer A collected
  current step: find next suitable deer
```

Jeżeli target zniknie, plan nadal może obowiązywać i znaleźć inny cel.

**Plan przechowuje „co chcę osiągnąć i gdzie jestem”, a nie pełny skrypt przyszłości.**

### 5. Wykorzystanie istniejącego Action system

Nie tworzyć nowego execution engine.

`PlannedAction` pozostaje mechanizmem wykonywania konkretnych działań:

```
Plan
  ↓
resolve next step
  ↓
PlannedAction
  ↓
existing execution
  ↓
completion / failure
  ↓
update Plan
  ↓
resolve next step
```

`PlannedAction.next` może nadal obsługiwać krótkie lokalne chainy, ale nie jest trwałą pamięcią całego planu.

### 6. Progress

Plan zachowuje tylko postęp potrzebny do kontynuowania lub oceny celu.

Przykład:

```
Goal: obtain 30 wood
Strategy: chop
Progress: 20 / 30 wood
```

Nie przechowywać nieograniczonej historii Action.

### 7. Completion

Cel, a nie liczba kroków, określa zakończenie planu:

```
Goal satisfied
    ↓
Plan.completed
    ↓
clear active plan
    ↓
re-evaluate
```

Jeżeli rezultat został osiągnięty inną drogą, plan również może zostać zakończony.

### 8. Interruption i resume

Przerwanie Action nie usuwa automatycznie planu.

```
Plan: secureFood / hunt
        ↓
wolf attack
        ↓
combat
        ↓
action interrupted
        ↓
re-evaluate plan
        ↓
resume / modify / invalidate
```

V1 nie wymaga rozbudowanego mechanizmu wyboru między tymi przypadkami.

### 9. Blocked / obsolete

**Blocked** — cel nadal ma sens, ale strategia jest obecnie niewykonalna.

**Obsolete** — cel przestał być potrzebny.

```
obtainWood + chop + no axe → blocked
secureFood + shortage resolved → obsolete
```

Nie implementować generalnego prerequisite solvera.

### 10. Re-evaluation

AI-004 dodaje tylko re-ewaluację potrzebną do lifecycle planu:

```
plan completed
plan blocked
plan obsolete
important interruption
```

Re-ewaluacja może wznowić, zmodyfikować lub porzucić plan albo rozpocząć nową decyzję.

Frustration, satisfaction i adaptive cognition pozostają poza tym etapem.

### 11. Diagnostics

Istniejąca diagnostyka powinna pokazywać:

```
Decision
  ↓
Goal
  ↓
Strategy
  ↓
Plan
  ↓
Current step / progress
  ↓
Action
```

Przykład:

```
Decision: secureFood
Goal: secureFood
Strategy: hunt
Plan: active
Progress: 2 deer collected
Current: travel to next hunting target
```

## Ownership

```
Decision system
  → wybiera Goal + Strategy

Plan state
  → utrzymuje intencję i progress

Action system
  → wykonuje konkretne działanie

World systems
  → mutują świat

Re-evaluation
  → ocenia, czy plan nadal ma sens
```

Każdy NPC posiada własny bieżący plan.

## Integracja

Rozszerzyć istniejący przepływ:

```
NpcAgent.choose()
       ↓
DecisionContext
       ↓
pressure / decision
       ↓
strategy selection
       ↓
Goal + Strategy
       ↓
create / resume Plan
       ↓
resolve next step
       ↓
PlannedAction
       ↓
existing action execution
       ↓
result
       ↓
update Plan
       ↓
next step / completion / re-evaluation
```

Wykorzystać istniejące mechanizmy decyzji, strategii, `PlannedAction`, completion, re-evaluation i diagnostyki NPC.

Dokładne pliki i symbole implementacyjne należą do osobnych implementation notes.

## Non-goals

- pełny `Problems` / `Opportunities` system,
- hierarchical planning,
- general prerequisite solving,
- semantic memory,
- frustration / satisfaction,
- cognitive-ability-based re-evaluation,
- long-term intentions,
- LLM-driven decisions,
- nowy action/execution engine,
- globalny plan manager.

## Kryteria ukończenia

1. Decision może ustanowić `Goal + Strategy`.
2. NPC posiada jeden aktualny persistent plan.
3. Plan zachowuje Goal, Strategy, state i progress.
4. Plan może być realizowany przez wiele `PlannedAction`.
5. Kolejne działania są rozwiązywane dynamicznie na podstawie aktualnego świata.
6. Osiągnięcie Goal kończy plan niezależnie od liczby Action.
7. Częściowo wykonany plan zachowuje postęp.
8. Interruption nie usuwa automatycznie planu.
9. Plan może zostać wznowiony lub unieważniony.
10. Plan może stać się `blocked` albo `obsolete`.
11. Po zakończeniu/unieważnieniu planu NPC wraca do procesu decyzyjnego.
12. Diagnostics pokazuje Decision → Goal → Strategy → Plan → current step/progress.
13. `PlannedAction` pozostaje mechanizmem wykonywania działań.
14. Nie powstaje równoległy execution system.

## Verification

Zweryfikować build i istniejące testy.

Ręcznie sprawdzić:

```
1. multi-action goal
2. partial completion
3. dynamic next-step resolution
4. target/resource disappearing
5. inventory constraint
6. interruption → resume/re-evaluation
7. goal completion
8. obsolete goal
9. blocked strategy
10. diagnostics
```

Szczególnie sprawdzić, że NPC nie powtarza ukończonego postępu, reaguje na zmianę świata i nie wykonuje nieaktualnych Action.

**Zrób git commit i push do main, rebase jeżeli trzeba**
