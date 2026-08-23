# NPC AI — Needs, Pressures & Decisions Audit

**Date:** 2026-08-23  
**Scope:** current NPC decision flow, personality/Big Five, needs, actions and planning  
**Status:** audit  

## 1. Executive summary

The current NPC AI is a solid action-execution system with need-driven arbitration, schedules, interruptions, re-evaluation and short action chains. It is not yet a full decision/planning model.

Current effective flow:

```text
world state
  → needs / schedule
  → pickNeed()
  → beginNeed()
  → PlannedAction
  → execute
  → world mutation
  → re-evaluate
```

Target evolution:

```text
world state
  → needs / problems / opportunities
  → pressures
  → decision context
  → personality / Big Five + role + traits + relationships + abilities
  → decision
  → strategy
  → persistent plan
  → actions
  → world changes / memory
  → re-evaluation
```

The important architectural conclusion is that Seedvale does **not** need a second AI framework. Existing `DecisionContext`, `PlannedAction.next`, interruption and re-evaluation are natural extension points.

## 2. What exists now

### Needs

Needs are scored and the highest-pressure need can interrupt normal activity. Current needs include physiological needs and settlement/resource duties. Shortage modifiers and critical thresholds already influence priority.

### Schedule

Schedule provides routine behaviour when no higher-priority need takes control. It is currently a fallback rather than a peer strategy source.

### Decisions

`choose()` builds a `DecisionContext`, evaluates needs and falls back to schedule. `pickNeed()` is currently the main arbitration mechanism.

### Strategies

Some strategy-like behaviour already exists inside `beginNeed()` and related branches, especially where food/resource sources are selected. These are procedural branches rather than explicit strategy objects/concepts.

### Actions

`NpcPlannedAction` and `next` already support short chains such as gathering followed by depositing. Action execution validates state and can be interrupted/re-evaluated.

### Personality

`BigFivePersonality` is already the source-of-truth personality representation. OCEAN values are deterministic per NPC. Personality currently affects player reactions, reaction timing/ranges and dialogue archetype selection, but it does not yet materially participate in ordinary resource/work decisions.

### Traits and roles

Traits and roles already affect concrete behaviour such as schedules, work and execution modifiers. They should remain distinct from Big Five.

### Memory

Trace/debug facilities exist, but they are not yet a semantic memory of unfinished goals, discovered problems or persistent intentions.

## 3. What we want

Keep these concepts distinct:

- **Needs** — internal states requiring satisfaction.
- **Problems** — undesirable world/social situations requiring response.
- **Goals** — desired future states.
- **Pressures** — factors that influence priority and strategy choice.
- **Strategies** — approaches to goals/problems.
- **Decisions** — selection among viable strategies/actions.
- **Plans** — persistent, progress-aware sequences of work.
- **Actions** — executable world operations.
- **Memory** — information retained because it can affect future decisions.

Personality should modify decision-making, not directly dictate actions.

Big Five should influence tendencies such as planning, exploration, social preference, cooperation, persistence and risk sensitivity while remaining subordinate to critical world/physiological constraints.

Example:

```text
food shortage
  → pressure: high
  → viable strategies: hunt / farm / trade / gather
  → Big Five + role + resources + relationships
  → strategy selection
  → plan
```

## 4. Big Five integration

The five dimensions should eventually influence decision/strategy scoring:

| Dimension | Possible decision influence |
|---|---|
| Openness | exploration, experimentation, alternative strategies |
| Conscientiousness | planning, preparation, persistence, completing unfinished work |
| Extraversion | social strategies, seeking help, group activity |
| Agreeableness | cooperation, helping others, conflict avoidance |
| Neuroticism | threat sensitivity, risk aversion, earlier response to problems |

These are behavioural tendencies, not hard-coded rules. The same world pressure should be capable of producing different strategies for different NPCs.

## 5. Persistent planning

`PlannedAction.next` is a useful foundation but currently represents short action chains rather than a persistent plan.

A future plan should be able to represent:

```text
goal
strategy
steps
current step
progress
state
reason
```

Possible plan states include `active`, `completed`, `blocked`, `interrupted`, `obsolete` and `partially_completed`.

Example hunter behaviour:

```text
Goal: secure meat
Strategy: hunt nearby deer
Plan:
  hunt deer A
  collect A
  hunt deer B
  collect B
  hunt deer C
  collect C
```

If inventory becomes full after killing deer C, the plan should retain the unfinished collection task rather than losing the intention when the current action ends.

## 6. Priority findings

### P1 — Decision model is too close to execution

Current flow effectively maps selected needs directly to concrete actions. Decision/strategy should become a distinct layer without moving world mutations out of the execution layer.

### P1 — Pressures are implicit

Shortage flags, need scores and thresholds act as pressure, but there is no explicit pressure model combining world, social, role and personal factors.

### P1 — Big Five does not yet influence ordinary decisions

The personality model already exists and is deterministic, but its effect is currently concentrated in player reactions/dialogue rather than everyday strategy selection.

### P1 — No persistent intention/plan

The NPC remembers its current action/chain, but not a durable goal and remaining work across interruptions and partial completion.

### P2 — Problems and goals are not explicit

Many existing procedural branches implicitly represent problems/goals, but they are not first-class concepts.

### P2 — Strategies are embedded in procedural branches

Existing behaviour should be gradually extracted conceptually, not rewritten wholesale.

### P2 — Semantic memory is missing

Debug trace should remain separate from future NPC memory.

## 7. Recommended evolution

Do not replace the current action system. Evolve it incrementally:

```text
Current:
Needs → pickNeed → beginNeed → PlannedAction

Future:
Needs / Problems / Opportunities
        ↓
    Pressures
        ↓
 DecisionContext
        + Big Five / traits / role / relationships / abilities
        ↓
     Decision
        ↓
     Strategy
        ↓
       Plan
        ↓
 existing PlannedAction execution
```

The deterministic simulation remains authoritative.

## 8. Code extension points

The following locations are natural future integration points. They should be annotated in code rather than prematurely redesigned.

- `choose()` — decision boundary; eventually collect/score pressures and personality-aware strategies.
- `DecisionContext` — future home for the inputs required by the decision layer.
- `pickNeed()` — future pressure arbitration rather than the complete decision system.
- `beginNeed()` — future strategy/plan selection boundary before action execution.
- `PlannedAction.next` — future bridge from short action chains to persistent plan steps.
- action completion/re-evaluation — future plan progress, interruption and remaining-work handling.
- role-specific branches — future role preferences/strategy scoring.
- threat handling — future personality/risk-tolerance influence.
- trace/diagnostics — keep separate from semantic NPC memory.

## 9. Example future behaviour

A hunter, three deer and limited inventory illustrate the desired model:

```text
problem: settlement meat shortage
pressure: high
role: hunter
personality: conscientious + low neuroticism
strategy: hunt nearby deer
plan: secure meat

kill deer 1 → collect
kill deer 2 → collect
kill deer 3 → inventory full

plan remains active
remaining task: collect deer 3
→ return/unload
→ resume plan
→ collect deer 3
```

The plan is persistent, while individual actions remain interruptible and revalidated against current world state.

## 10. Verification boundary

This document describes the current code architecture and intended evolution. It does not claim browser/gameplay verification of emergent NPC behaviour.
