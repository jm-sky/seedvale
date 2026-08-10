# Review: NPC Daily Routine and Place Implementation Notes

## Purpose

Architectural review of `2026-08-07--020--npc-2-daily-routine-and-place-implementation-notes.md` against the current repository state.

These are review corrections to apply before implementation/verification. The original implementation notes remain unchanged.

## CRITICAL

### 1. Resolve the sleep vs critical-needs priority explicitly

The implementation notes state that critical needs should still be able to override scheduled sleep.

Current `NpcAgent.update()` does not fully implement that ordering: the scheduled sleep path is checked before the normal `pickNeed()` path. Therefore the current code effectively gives scheduled sleep precedence unless another explicit escape/interrupt path is added.

Before considering this plan complete, choose and document the intended policy. If the intended Seedvale rule is:

```text
critical need > normal schedule > low-priority activity
```

then the implementation must make that ordering explicit rather than relying on the current sleep gate.

## IMPORTANT

### 2. Extend the existing generic NPC FSM; do not add activity-specific movement systems

The current NPC behavior already follows the generic pattern:

```text
choose → goTo → execute → next
```

Daily routine should continue to select activities/intent and reuse the existing navigation/execution states. Do not introduce separate movement controllers for sleep, work, garden, well, etc.

### 3. `Needs` remains the source of need priority

Existing thirst/wood/hunger selection already provides the need-driven behavior. The daily schedule should provide a competing source of intent, with one clear arbitration point rather than a second need scheduler.

A useful conceptual model is:

```text
schedule intent ─┐
                 ├→ decision/arbitration → existing FSM
needs intent ────┘
```

The exact implementation can remain inside `NpcAgent` initially; do not create a new scheduler subsystem unless complexity actually requires it.

### 4. Preserve the existing `Place` abstraction

`places.ts` already provides the runtime abstraction used to resolve workplaces/locations from settlement landmarks. Daily routine should request a `Place` and use the existing movement/execution pipeline rather than storing hard-coded landmark-specific coordinates in the routine system.

Target relationship:

```text
SettlementLandmarks
        ↓
      Place
        ↓
   daily activity
        ↓
 existing NPC FSM
```

## MINOR

### 5. Keep schedule data separate from runtime state

A daily routine should describe planned activities/time windows. Current activity, target place, and FSM state remain runtime state on the NPC.

Avoid duplicating `currentActivity`/destination in both schedule data and `NpcAgent` runtime state.

### 6. Keep the first implementation deterministic

Daily routine selection should remain deterministic/reproducible from NPC/settlement state where practical. Personality and needs can influence decisions, but the routine should not introduce a second source of nondeterministic world simulation.

## OK

The plan's direction of combining daily routine, existing places, needs, personality, and the generic FSM is consistent with Seedvale's architecture. The main correction required before verification is the actual precedence between scheduled sleep and critical needs.
