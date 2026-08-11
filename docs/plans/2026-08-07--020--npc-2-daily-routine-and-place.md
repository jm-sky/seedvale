# Plan: NPC Daily Routine & Place System

**Status:** `done` — implementation is complete and verified. Traits-based schedule personalization is intentionally deferred to [plan 060](./2026-08-11--060--npc-schedule-actions-and-trait-overlays.md).

> **Implementation notes:** [2026-08-07--020--npc-2-daily-routine-and-place-implementation-notes.md](./2026-08-07--npc-2-daily-routine-and-place-implementation-notes.md)

## Current implementation status

This plan has been implemented in stages. The sections below describe the **current state**, not the historical state at the time the plan was originally written.

### Implemented

- `Place` abstraction with `home`, `workplace`, `food`, and `social` types.
- Automatic home assignment through `Place` during settlement/NPC creation.
- Role-based `workplaceFor()` mapping.
- Settlement market landmark for traders.
- Role-based `ScheduleTemplate` and deterministic `activityAt()` resolution, including schedules crossing midnight.
- `NpcAgent` receives `workplace` and `schedule`.
- Generic FSM flow using `goTo` / `execute` / chained actions instead of the old resource-specific `goWell` / `goGarden` / `goTree` / `goStock` phases.
- Schedule is consumed by the FSM: needs still take priority; scheduled `work` uses the NPC's workplace when available.
- Sleep is driven by scheduled activity rather than the old global `isNight` gate; roles such as `guard` can sleep during the day and work at night.
- `timeOfDay` is wired from the world clock through settlement updates into NPC updates.
- Existing water/food/wood need behavior and timings were preserved intentionally during the FSM refactor.
- Unit-level schedule/place tests and project checks (`tsc`, lint, build, test) are green.

### Intentionally deferred

- Traits/personalities modifying the role schedule (`night_owl`, `hardworking`, `social`, etc.). The base role schedule is established first; traits can later become an additional layer.
- Moving/house changes, career progression, settlement economy, and broader social-place systems beyond the current `Place` foundation.

## Current workplace mapping

The current implementation uses existing landmarks where possible instead of introducing unnecessary world geometry:

| Role | Workplace |
|------|-----------|
| `woodcutter` | settlement tree landmarks, assigned round-robin |
| `farmer` | settlement garden |
| `trader` | settlement market stall |
| `guard` | settlement well/central landmark reuse |
| `miner` | settlement stockpile reuse |
| `fisher` | settlement dock when available, otherwise fallback |

This is intentionally pragmatic. More semantically specific workplaces can be introduced later when the settlement/world-generation systems provide them.

## Schedule → FSM

The current decision flow is:

```text
role
 ↓
ScheduleTemplate
 ↓
scheduledActivity(timeOfDay)
 ↓
Needs override when urgent
 ↓
generic FSM
 ↓
goTo(place)
 ↓
execute(action)
 ↓
return to decision loop
```

A schedule is a planning input, not a second AI/FSM. The FSM remains responsible for actually executing movement and actions.

## Schedule ↔ world clock

Schedules use the same `timeOfDay` representation as the world clock:

```text
timeOfDay = hour / 24
```

Examples:

```text
07:00 → 0.2917
12:00 → 0.5000
18:00 → 0.7500
22:00 → 0.9167
```

The schedule resolver handles cyclic ranges, including activities that cross midnight.

## Verification still required

Browser verification should confirm:

1. NPCs still satisfy water/food/wood needs as before.
2. NPCs with no urgent need follow their role schedule and visit their workplace.
3. `guard` sleeps during the day and works at night.
4. Normal day-role NPCs do not enter sleep merely because dusk begins; they follow their scheduled sleep period.
5. Home/workplace assignments are visually sensible.
6. Existing interaction/dialogue behavior is unaffected.

The plan should remain `verification needed` until these runtime checks are confirmed.

## Scope intentionally excluded from this implementation

- Traits modifying schedules.
- NPC relocation/moving house.
- Building new homes dynamically.
- Full settlement economy.
- Full NPC relationship simulation.
- Career progression.

## Historical note

Earlier versions of this plan contained implementation reviews describing Schedule, workplace, and the generic FSM as unimplemented. Those statements were accurate at the time but are now historical and have been removed from the active plan to avoid misleading implementers.

The repository-specific implementation guidance is maintained in the linked implementation notes.

## Design direction

The long-term NPC daily-life pipeline remains:

```text
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

The goal is to make NPCs behave like residents with their own rhythm rather than actors that only react to the player.
