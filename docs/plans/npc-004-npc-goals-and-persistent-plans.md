# Plan: NPC Goals & Persistent Plans

**Created:** 2026-08-31  
**Status:** `planned` 📋  
**Priority:** high · **Effort:** M  
**Depends on:** ~~001~~ ~~002~~ ~~003~~  
**Domain:** `npc`

## Cel

Rozwinąć obecny przepływ:

```
Need / Pressure
    ↓
Decision
    ↓
Strategy
    ↓
Action
```

do modelu, w którym decyzja NPC może utrzymywać **cel i strategię przez wiele kolejnych działań**:

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

Plan ma reprezentować **trwającą intencję NPC**, a nie statyczny skrypt wszystkich przyszłych działań.

## Zakres

### 1. Goal

Dodać minimalną reprezentację rezultatu, który NPC chce osiągnąć w ramach aktualnej decyzji.

Przykłady:

```
secureFood
obtainWood
secureWater
fulfilWorkDuty
protectHousehold
```

Goal jest rezultatem, a nie sposobem jego osiągnięcia.

Przykład:

```
Goal: secureFood

possible strategies:
  stored food
  hunt
  forage
  farm
  trade
```

Nie tworzyć osobnego rozbudowanego `GoalSystem`.

### 2. Goal + Strategy jako wynik Decision

Decision wybiera **co NPC powinien teraz osiągnąć**, a następnie określa sposób realizacji tego celu.

Przykład:

```
food pressure
    ↓
Decision
    ↓
Goal: secureFood
Strategy: hunt
```

`Goal` i `Strategy` tworzą kontekst aktualnej intencji NPC.

Nie traktować ich jako dwóch niezależnych cykli decyzyjnych.

### 3. Persistent Plan

Wprowadzić persistent plan powiązany z aktualnym `Goal` i `Strategy`.

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

Plan jest własnością bieżącego stanu AI NPC.

Nie tworzyć globalnego managera planów.

### 4. Dynamiczne kroki planu

Plan **nie powinien być statyczną listą wszystkich przyszłych `Action`**.

Powinien przechowywać intencję, postęp oraz bieżący krok, a konkretny następny `Action` powinien być tworzony/wybierany wtedy, gdy jest potrzebny.

Przykład:

```
Goal:
  secureFood

Strategy:
  hunt

Plan:
  active
  progress: deer A collected
  current step: find next suitable deer
```

Następnie:

```
→ goTo deer B
→ hunt deer B
→ collect deer B
```

Jeżeli target zniknie, plan nadal może obowiązywać:

```
deer B disappeared
    ↓
find another suitable deer
```

**Plan przechowuje „co chcę osiągnąć i gdzie jestem”, a nie pełny skrypt przyszłości.**

### 5. Wykorzystanie istniejącego Action system

Nie tworzyć nowego execution engine.

Obecny `PlannedAction` pozostaje mechanizmem wykonywania konkretnych działań.

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
update plan progress
  ↓
resolve next step
```

`PlannedAction.next` może nadal obsługiwać krótkie, lokalne chainy, ale nie powinien być źródłem trwałej pamięci całego planu.

### 6. Plan progress

Plan musi zachowywać istotny postęp.

Przykład:

```
Goal: obtain 30 wood
Strategy: chop

Progress:
  20 / 30 wood obtained
```

Progress powinien przechowywać tylko informacje potrzebne do kontynuowania lub oceny planu.

Nie przechowywać nieograniczonej historii wykonanych `Action`.

### 7. Completion

Po osiągnięciu celu:

```
Plan
  ↓
completed
  ↓
clear active plan
  ↓
re-evaluate
```

Plan powinien być uznany za zakończony na podstawie **Goal**, a nie wyłącznie wykonania określonej liczby kroków.

Jeżeli NPC osiągnął wymagany rezultat inną drogą, plan również może zostać zakończony.

### 8. Interruption i resume

Przerwanie bieżącej `Action` nie powinno automatycznie usuwać planu.

Przykład:

```
Plan: secureFood / hunt
current: hunting deer

wolf attack
    ↓
combat
    ↓
current action interrupted
```

Po zakończeniu sytuacji NPC powinien ponownie ocenić możliwość kontynuowania istniejącego planu:

```
resume
    lub
modify
    lub
invalidate
```

V1 nie wymaga rozbudowanego systemu wyboru między tymi przypadkami.

### 9. Blocked / obsolete plan

Plan może przestać być wykonalny lub potrzebny.

**Blocked** — cel nadal ma sens, ale obecnie nie można go zrealizować.

```
Goal: obtainWood
Strategy: chop
Requirement: axe

NPC has no axe
→ blocked
```

**Obsolete** — cel przestał być potrzebny.

```
Goal: secureFood

household food shortage resolved by another NPC
→ obsolete
```

Nie implementować jeszcze generalnego prerequisite solvera.

### 10. Re-evaluation

AI-004 wprowadza tylko re-ewaluację potrzebną do lifecycle planu.

Re-evaluate po:

```
plan completed
plan blocked
plan obsolete
important interruption
```

Podczas re-ewaluacji NPC może wznowić, zmodyfikować lub porzucić plan albo wykonać nową decyzję.

Nie implementować jeszcze osobnego systemu frustration/adaptive cognition.

### 11. Diagnostics

Istniejąca diagnostyka NPC powinna pokazywać:

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
Decision:
  secure food

Goal:
  secureFood

Strategy:
  hunt

Plan:
  active

Progress:
  2 deer collected

Current:
  travel to next hunting target
```

## Ownership i lifecycle

Odpowiedzialność:

```
Decision system
  → wybiera Goal + Strategy

Plan state
  → utrzymuje bieżącą intencję i progress

Action system
  → wykonuje konkretne działanie

World systems
  → mutują świat

Re-evaluation
  → ocenia, czy plan nadal ma sens
```

Nie tworzyć centralnego AI managera posiadającego stan wszystkich NPC.

Każdy NPC powinien posiadać własny bieżący plan.

## Integracja z istniejącym AI

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

Naturalne punkty integracji obejmują obecne mechanizmy decyzji, strategii, `PlannedAction`, completion, re-evaluation oraz diagnostykę NPC.

Dokładne pliki, symbole i zależności implementacyjne nie są częścią tego planu.

## Non-goals

Poza AI-004:

- pełny `Problems` system,
- pełny `Opportunities` system,
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

AI-004 jest zakończone, gdy:

1. Decision może ustanowić `Goal + Strategy`.
2. NPC może posiadać jeden aktualny persistent plan.
3. Plan zachowuje Goal, Strategy, state i progress.
4. Plan może być realizowany przez wiele `PlannedAction`.
5. Kolejne działania mogą być rozwiązywane dynamicznie na podstawie aktualnego świata.
6. Ukończenie celu kończy plan niezależnie od dokładnej liczby wykonanych Action.
7. Częściowo wykonany plan zachowuje postęp.
8. Interruption nie usuwa automatycznie planu.
9. Plan może zostać wznowiony lub unieważniony.
10. Plan może stać się `blocked` albo `obsolete`.
11. Po zakończeniu/unieważnieniu planu NPC wraca do procesu decyzyjnego.
12. Diagnostics pokazuje Decision → Goal → Strategy → Plan → current step/progress.
13. Istniejący system `PlannedAction` pozostaje mechanizmem wykonywania działań.
14. Nie powstaje równoległy system wykonywania akcji.

## Verification

Zweryfikować build i istniejące testy.

Ręcznie sprawdzić w symulacji:

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

Szczególnie sprawdzić, że NPC:

- nie powtarza ukończonego postępu,
- nie wymaga wcześniej wygenerowanej pełnej listy Action,
- reaguje na zmianę świata,
- nie wykonuje nieaktualnego Action,
- po zakończeniu celu podejmuje nową decyzję.

**Zrób git commit i push do main, rebase jeżeli trzeba**
