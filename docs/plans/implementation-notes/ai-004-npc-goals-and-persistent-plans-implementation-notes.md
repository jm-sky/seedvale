# Implementation Notes: NPC Goals & Persistent Plans

**Plan:** docs/plans/ai-004-npc-goals-and-persistent-plans.md  
**Reviewed:** 2026-08-31  
**Status:** planned 📋

## Recon verdict

AI-004 fits the current architecture, but there is currently **no Goal or persistent Plan abstraction**.

The existing flow is already the required foundation:

```
Need / pressure
  → NeedId
  → strategy candidates
  → NpcStrategyId
  → existing beginNeed() branch
  → NpcPlannedAction
  → goTo → execute
  → world mutation
  → choose()
```

AI-004 should insert persistent intent **between strategy selection and concrete action resolution**. It must not replace PlannedAction or its execution lifecycle.

## Current flow

### Decision

Primary owner: **src/ai/NpcAgent.ts — NpcAgent.update(), phase === 'choose'**.

Current sequence:

1. generateNeedPressures()
2. scoreNeedCandidates()
3. pickActionKind<NeedId>()
4. store lastPressures / lastDecisionCandidates / activeNeed
5. trace need.selected
6. call beginNeed(need)

**DecisionContext** is only a domain-agnostic snapshot/seam. It is not persistent decision state.

### Strategy

**src/ai/npcStrategies.ts** owns:

- NpcStrategyId
- NpcStrategyCandidate
- getFoodStrategyCandidates()
- getWaterStrategyCandidates()
- getWaterDutyStrategyCandidates()
- getWoodStrategyCandidates()
- selectStrategy()

**NpcAgent.selectAndTraceStrategy()** records the exact candidate list and selected strategy, then the existing beginNeed() execution branch continues.

Important: selectedStrategy and lastStrategyCandidates are **diagnostic decision metadata**, not persistent intent. They are overwritten by later decisions.

### PlannedAction

The generic contract is in **src/simulation/types.ts — PlannedAction<TKind>**.

NPC adds the local adapter **NpcPlannedAction** in NpcAgent.ts:

- destination
- durationSec
- onComplete
- next
- queueId
- chainKind

The execution owner remains NpcAgent:

- startAction()
- update(), phase goTo
- update(), phase execute

**startAction() is the boundary where a PlannedAction becomes executable.**

Do not move execution into Plan.

## Action lifecycle

Shared lifecycle:

- src/simulation/actionLifecycle.ts
- src/simulation/actionControl.ts

States:

```
idle → active → complete
             ↘ failed
             ↘ cancelled
```

startAction() calls replaceActionLifecycle() and stores pendingAction.

On execute completion:

1. pendingAction is cleared
2. onComplete() mutates the world
3. next is promoted when present
4. otherwise ActionLifecycle becomes complete
5. queue membership is released
6. action.completed is traced
7. phase returns to choose

This makes PlannedAction.next a suitable **short local chain**. It must not become persistent plan storage.

## Interruption and re-evaluation

**NpcAgent.tickCriticalInterrupt()** checks only while goTo / execute is active.

**interruptCurrentAction()** currently:

- releases conversation state
- fails ActionLifecycle
- leaves queue
- clears pendingAction
- clears path/wait/rescue state
- sets phase = choose
- records action.failed(reason = interrupt)

There is currently **no resume memory**. The next choose derives a fresh Need and Strategy.

AI-004 must change only the higher-level lifecycle: interruption should clear the concrete action but preserve the Plan.

**abandonStuckAction()** is another action-failure path. The Plan should survive it when the Goal remains meaningful.

**requestReevaluation()** already reuses interruptCurrentAction(). AI-004 should make it re-resolve the Plan instead of discarding Plan intent.

Normal schedule/time changes currently do not interrupt an action. Preserve that behaviour.

## NPC authoritative state

**src/settlement/npcState.ts — NpcAuthoritativeState / NpcStateSnapshot / NpcStateRegistry**

Current authoritative state includes:

- health
- stamina
- vigor
- needs
- helperAssignment

NpcAgent transient state includes phase, pendingAction, pathfinding, combat intent and temporary carried state.

For AI-004, the Plan belongs with **NpcAuthoritativeState**, because that state already survives NpcAgent recreation and WorldBundle rebuild.

Recommended boundary:

```
NpcAuthoritativeState
  ├── needs
  ├── helperAssignment
  └── activePlan
       ├── goal
       ├── strategy
       ├── state
       ├── progress
       └── currentStep
```

Carry activePlan through NpcStateSnapshot for in-session reconstruction.

Do **not** add it to SaveData in AI-004. Current NPC runtime state is explicitly not full save state.

## Goal

There is no existing Goal mechanism.

Do not create a GoalSystem.

Use a small domain-local identifier, for example:

- secureFood
- obtainWood
- secureWater
- fulfilWorkDuty
- protectHousehold

Goal describes the desired result, not its method.

Need remains current pressure/state. Goal is the result selected from that decision context.

Do not create a second Goal arbitration loop.

A small pure type/helper module such as **src/ai/npcPlan.ts** is appropriate if needed.

## Strategy reuse

Reuse **NpcStrategyId** from npcStrategies.ts.

Do not introduce another Strategy hierarchy.

The important change is:

```
current decision
  → Goal
  → Strategy
  → active Plan
```

The candidate list remains ephemeral.

## Recommended Plan shape

Keep it minimal:

```
NpcPlan {
  goal
  strategy
  state
  progress
  currentStep
}
```

State:

- active
- interrupted
- blocked
- partially_completed
- completed
- obsolete

Plan must **not** contain a future PlannedAction list or action history.

currentStep is semantic state, for example:

- findNextTarget
- travelToSource
- collectResource
- returnHome

The exact representation should remain small and only retain information needed to resolve the next action.

Progress must represent actual world results, not planned actions.

Example:

```
Goal: secureFood
Strategy: hunt
progress: { collected: 2 }
currentStep: findNextTarget
```

If the original animal disappears, resolve another target. Do not resurrect the old PlannedAction.

## Dynamic action resolution

This is the central rule:

```
Plan
  ↓
evaluate goal/progress/currentStep
  ↓
query current world
  ↓
resolve one PlannedAction
  ↓
existing startAction()
  ↓
goTo → execute
  ↓
completion/failure
  ↓
update Plan
  ↓
resolve next step
```

No new execution engine.

Existing beginNeed() action builders should remain the world-specific implementation. AI-004 needs only a narrow seam for Plan resolution; avoid rewriting all beginNeed() branches.

## Concrete integration points

### NpcAgent.update(), choose

Existing owner of Need arbitration.

Target behaviour:

1. evaluate existing Plan
2. if valid, resolve its next step
3. otherwise run normal Need → Strategy decision
4. establish Goal + Strategy + Plan
5. resolve first step

A Plan must not suppress decision-making forever. It can be completed, obsolete, blocked, or replaced through the existing decision path.

### selectAndTraceStrategy()

Keep its current responsibility.

When a new Plan is established, copy selected NpcStrategyId into the Plan. Do not make selectedStrategy authoritative.

### beginNeed()

Keep existing world/action branches.

Do not create a parallel Plan-specific implementation of hunt, food, water, wood, exchange, etc.

### startAction()

Leave as the only PlannedAction execution boundary.

No Plan execution state here.

### execute completion

After action.onComplete():

- update Plan progress from the actual world result
- evaluate Goal satisfaction
- completed → clear activePlan → choose
- otherwise keep Plan and resolve the next dynamic step

PlannedAction.next continues to represent only a local chain.

### interruptCurrentAction()

This is the most important lifecycle change.

Keep current cleanup, but:

1. fail/cancel current ActionLifecycle
2. clear transient action state
3. preserve activePlan
4. mark Plan interrupted when appropriate
5. re-evaluate and resolve a fresh action

Never restore a stale PlannedAction.

### abandonStuckAction()

Same principle: concrete action fails, Plan survives if meaningful, then re-evaluates.

Movement watchdog remains independent of Plan.

## Plan lifecycle

### active

Goal and Strategy remain valid and another action can be resolved.

### interrupted

Current action was interrupted, but Goal remains meaningful.

Typical flow:

```
active Plan
 → action
 → interruption
 → interrupted
 → re-evaluate
 → active / blocked / obsolete / new decision
```

### partially_completed

Actual action progress occurred, but Goal is not satisfied.

### blocked

Goal still makes sense, but current Strategy cannot currently produce a valid step.

Do not implement a generic prerequisite solver.

If an already-existing alternative strategy for the same Goal is clearly available, switching can reuse the existing strategy candidate mechanism.

### obsolete

Goal no longer needs to be pursued.

Example: household shortage disappears because another actor supplied it.

### completed

Goal predicate is satisfied, regardless of action count.

Then clear activePlan and return to normal choose().

## Progress ownership

Update progress from existing world-effect callbacks.

Examples:

- hunt: successful kill/harvest result
- wood: actual harvested/deposited amount
- food: actual consumed/claimed/harvested result
- exchange: actual transferred amount

Never increment progress merely because a PlannedAction was created or completed.

This prevents false progress when another actor changes the world before arrival.

## Re-evaluation rules

Minimum evaluator:

1. Goal satisfied → completed
2. Goal no longer needed → obsolete
3. Strategy cannot produce a step → blocked
4. important interruption → interrupted, then attempt resolution
5. otherwise → active

Out of scope:

- prerequisite graphs
- utility/meta planning
- frustration/satisfaction
- cognitive scoring
- long-term intention management

## Diagnostics

Existing diagnostic mechanisms are already the correct surface:

- NpcInspectionSnapshot
- NpcWhy
- NpcTraceEvent
- NpcTraceBuffer
- src/ui/createNpcInspector.ts
- src/debug/npcInspector.ts
- src/debug/npcDebugApi.ts

Current inspector already shows Decision / Why, Strategy, Current action and History.

Extend it to:

```
Decision
  ↓
Goal
  ↓
Strategy
  ↓
Plan state
  ↓
progress
  ↓
current step
  ↓
current PlannedAction
```

Add Plan fields to NpcInspectionSnapshot rather than deriving them from pendingAction.

Useful trace events:

- plan.created
- plan.stateChanged
- plan.progressed
- plan.completed
- optionally plan.replanned

Keep trace semantic and bounded.

Important distinction: lastStrategyCandidates / selectedStrategy describe the last decision. They must not be reused as the Plan representation.

## Tests

### Pure Plan tests

If npcPlan.ts is introduced, keep it Three.js-free.

Cover:

- Plan creation
- active → interrupted → active
- partial progress
- Goal completion
- obsolete Goal
- blocked Strategy
- currentStep persistence
- no action history / no future PlannedAction list

### Existing strategy tests

Keep npcStrategies.test.ts focused on candidate generation and selection.

Do not move strategy generation into Plan.

### Diagnostic fixtures

Update:

- src/ai/npcWhy.test.ts
- src/debug/npcInspector.test.ts
- src/debug/npcDebugApi.test.ts

Add assertions for Goal / Strategy / Plan state / progress / currentStep.

### Integration scenarios

Test where the existing harness permits:

1. multi-action Goal
2. partial completion
3. dynamic next-step resolution
4. target/resource disappearing
5. interruption → Plan survives
6. stale PlannedAction is not replayed
7. Goal satisfied by another actor
8. blocked strategy
9. obsolete Goal
10. completed Plan clears and returns to choose
11. diagnostics show Decision → Goal → Strategy → Plan → step → action

Do not add Plan semantics to src/simulation/actionLifecycle.ts. That lifecycle remains generic and action-local.

## Persistence and performance

Plan is **in-session authoritative NPC state**, not SaveData.

```
NpcAuthoritativeState
  → activePlan
  → survives NpcAgent recreation / WorldBundle rebuild
  → not SaveData
```

Evaluate Plans only at decision/re-evaluation boundaries.

Do not evaluate every render frame, scan world resources globally, keep action history, or move Plan evaluation to a Worker.

## Recommended implementation order

1. Add minimal Goal + Plan types.
2. Add activePlan to NpcAuthoritativeState and snapshot carry.
3. Add pure Plan lifecycle helpers.
4. Establish Plan from existing Need + selected NpcStrategyId.
5. Add narrow dynamic next-step resolution seam.
6. Update Plan progress from existing action results.
7. Preserve Plan across interruption/abandonment.
8. Add completed / blocked / obsolete handling.
9. Extend trace and inspection snapshot/UI.
10. Add focused tests.
11. Run targeted typecheck/lint/build/test verification.

Avoid unrelated refactors of NpcAgent.

## Guardrails

Do not introduce:

- GoalSystem
- PlanManager
- second action/execution engine
- future-action queue owned by Plan
- hierarchical planning
- prerequisite solver
- semantic memory
- frustration/satisfaction
- LLM-driven decisions
- full NPC save persistence
- unrelated beginNeed() refactor
- new world-resource registries

The architectural invariant is:

```
Plan
  = Goal + Strategy + progress + semantic current step

PlannedAction
  = one concrete action resolved from the current world

ActionLifecycle
  = execution state of that concrete action
```

These layers must remain distinct.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
