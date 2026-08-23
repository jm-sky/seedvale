# NPC AI

**Status:** target vision  
**Scope:** decision-making, personality, strategy, planning and memory

## Purpose

NPC AI should turn world state into autonomous, understandable behaviour. NPCs should not merely pick the next action; they should respond to needs and problems, pursue goals, apply pressures and personality, choose strategies, execute plans and react to the consequences.

Deterministic simulation remains authoritative. AI is a deterministic decision system, not an LLM-driven simulation.

## Core model

```text
WORLD STATE
    │
    ├── Needs
    ├── Problems
    ├── Goals
    ├── Opportunities
    ├── Schedule
    ├── Role
    ├── Relationships
    ├── Resources / places
    └── Threats / circumstances
             │
             ▼
         PRESSURES
             │
             ▼
      DECISION CONTEXT
             │
       ┌─────┼──────────────┐
       │     │              │
   Big Five Traits       Role
       │     │              │
       └─────┼──────────────┘
             │
             ▼
          DECISION
             │
             ▼
          STRATEGY
             │
             ▼
            PLAN
             │
             ▼
           ACTIONS
             │
             ▼
       WORLD CHANGES
             │
       ┌─────┴─────┐
       ▼           ▼
    MEMORY    RE-EVALUATION
```

## Concepts

### Needs

Internal states that require satisfaction, such as hunger, thirst or duties required to maintain a household.

Needs answer:

> What does this NPC currently lack or need to maintain?

Needs should not directly determine a concrete action.

### Problems

Undesirable situations in the world, household or social environment that require a response.

Examples:

- settlement food shortage,
- household water reserve too low,
- damaged infrastructure,
- dangerous predator near a home,
- family member requiring help.

Problems answer:

> What is wrong and needs to be dealt with?

### Goals

Desired future states.

Examples:

- secure enough food,
- keep the household supplied with water,
- protect a family member,
- finish building a house,
- maintain a productive farm.

Goals answer:

> What outcome is the NPC trying to achieve?

### Pressures

Factors that affect priority and strategy selection.

Pressures can originate from needs, problems, deadlines, scarcity, danger, relationships, role obligations, opportunities and personality.

A pressure is not itself an action.

```text
food shortage = pressure
hunt deer = strategy/action
```

### Decision

The selection of what the NPC should pursue next from the currently viable possibilities.

A decision should consider current pressures together with personality, role, traits, relationships, abilities, resources, risk and circumstances.

### Strategy

An approach to achieving a goal or resolving a problem.

For example, when food is scarce:

```text
stored food
hunt
farm
forage
trade
ask another household
```

Different NPCs may select different strategies from the same situation.

### Plan

A persistent intention to achieve a goal through a sequence of actions.

A plan should retain enough state to continue meaningful work after interruption, partial completion or re-evaluation.

Possible states:

```text
active
completed
blocked
interrupted
obsolete
partially_completed
```

Plans should reuse the existing action execution system rather than introduce a separate action engine.

### Actions

Concrete operations that change the world: travel, gather, hunt, carry, deposit, eat, drink, work, trade, build, flee, etc.

Actions remain responsible for validating current world state and applying world mutations.

## Personality — Big Five

Big Five is the source-of-truth personality model for NPCs. Personality should influence how an NPC evaluates strategies, not directly dictate individual actions.

| Trait | Potential decision influence |
|---|---|
| Openness | exploration, experimentation, alternative strategies |
| Conscientiousness | preparation, planning, persistence, finishing unfinished work |
| Extraversion | social activity, seeking help, group strategies |
| Agreeableness | cooperation, helping others, conflict avoidance |
| Neuroticism | threat sensitivity, risk aversion, earlier response to problems |

These are tendencies rather than hard rules. Personality must not override critical physiological or world constraints.

For example, two hunters facing the same food shortage can choose different strategies because of personality, while both still recognise that food must eventually be secured.

## Other decision inputs

Personality is only one influence. The decision model should also consider:

- profession / social role,
- traits,
- abilities and physical condition,
- household responsibilities,
- relationships,
- known resources and places,
- inventory and equipment,
- current schedule,
- danger and risk,
- distance and travel cost,
- settlement needs,
- current plans and unfinished work,
- relevant memory.

No single input should become a hidden global priority system.

## Planning and unfinished work

The current `PlannedAction.next` mechanism is a useful foundation for short action chains. The target model should evolve this into persistent plans without replacing action execution.

Example hunter:

```text
Problem:
  settlement meat shortage

Goal:
  secure meat

Strategy:
  hunt nearby deer

Plan:
  hunt deer A
  collect A
  hunt deer B
  collect B
  hunt deer C
  collect C
```

If the hunter kills deer C but has no inventory space, the plan should remain active:

```text
inventory full
→ return to unload
→ remember unfinished collection
→ return to deer C
→ collect C
```

The NPC should remember the unfinished goal/task because it remains relevant, not because every action is stored indefinitely.

## Interruption and re-evaluation

Plans are not immutable scripts.

The world can invalidate or interrupt them:

```text
plan
  ↓
new critical need / danger / opportunity
  ↓
interrupt or re-evaluate
  ↓
resume / modify / abandon plan
```

An action must still validate its assumptions when executed. A plan can therefore survive changing circumstances without assuming that the world remains unchanged.

## Schedule

Schedule represents expected routine rather than the complete decision system.

A scheduled activity can compete with needs, problems and goals. It should not be treated as a permanent script that prevents autonomous responses to important world changes.

## Determinism and world independence

NPC decisions must remain deterministic and simulation-owned.

The player is not required for NPC decision-making. The same decision system must work for detailed near-field simulation and appropriately simplified off-screen simulation.

LLMs may eventually augment dialogue, quests or characterisation, but they must not become the authority for needs, pressures, decisions, plans or world state.

## Evolution of the current implementation

The target model should evolve existing systems rather than create a parallel AI framework:

```text
CURRENT
Needs → pickNeed() → beginNeed() → PlannedAction

TARGET
Needs / Problems / Opportunities
        ↓
    Pressures
        ↓
 DecisionContext
        + Big Five / Traits / Role / Relationships / Abilities
        ↓
     Decision
        ↓
     Strategy
        ↓
       Plan
        ↓
 existing PlannedAction execution
```

Natural future integration points include `choose()`, `DecisionContext`, `pickNeed()`, `beginNeed()`, `PlannedAction.next`, action completion/re-evaluation and role-specific decision branches.

## Relationship to other NPC documentation

This document defines the **AI decision and planning model**.

`npc.md` is the NPC vision index and links to this document and other focused NPC-domain documents.
