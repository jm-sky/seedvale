# Implementation Notes: NPC Daily Routine & Place System

**Plan:** [2026-08-07--020--npc-2-daily-routine-and-place.md](./2026-08-07--020--npc-2-daily-routine-and-place.md)

## Purpose

Repository-specific notes for finishing/verifying plan 020 without re-discovering the history of the implementation. The plan contains several generations of decisions; this document treats the **current code** as the source of truth and clearly separates what is already implemented from what still needs work.

## Current status — important

The plan is **not simply "50% done"**. The repository currently contains most of v2 stage 1 and stage 2 infrastructure, including:

- `PlaceType` = `home | workplace | food | social`;
- `workplaceFor()` per-role workplace mapping;
- `ScheduleTemplate` and `SCHEDULE_TEMPLATES` for all roles;
- `activityAt()` / `nextBoundary()`;
- `NpcAgent.workplace` and `NpcAgent.schedule`;
- generic `goTo` / `execute` / chained action infrastructure;
- schedule-driven sleep/work behavior.

The remaining work is primarily **verification, cleanup, and checking that the intended behavior is actually complete**, rather than blindly implementing the original plan from the top.

See the plan's dated implementation sections for the exact historical decisions. Do not re-implement already-existing stage 1/2 code.

---

## 1. Current architecture

### `src/settlement/places.ts`

`Place` is now the abstraction for meaningful world locations:

```ts
Place {
  id: string
  type: 'home' | 'workplace' | 'food' | 'social'
  position: Vector3
}
```

`workplaceFor()` currently maps:

```text
woodcutter → settlement trees (round-robin)
farmer     → garden
trader     → market
guard      → well
miner      → stockpile
fisher     → dock, fallback well
```

This is intentionally a pragmatic v1/v2 bridge. Do not invent new workplace world content unless the task explicitly calls for it.

### `src/ai/schedule.ts`

`ScheduleTemplate` is a per-role sequence of 24h entries. Existing roles:

- woodcutter
- farmer
- miner
- fisher
- trader
- guard

`hourToTimeOfDay()` maps directly to the `dayNight.ts` convention:

```text
hour / 24
```

`activityAt()` resolves the currently active activity cyclically, including schedules crossing midnight (guard).

`nextBoundary()` returns the next schedule transition and is used by dialogue/activity presentation.

Do not replace this with a second scheduler or a timer-based 24h system. The world clock is already the authoritative time source.

### `src/ai/NpcAgent.ts`

The current FSM is already moving toward the generic model:

```text
choose
  ↓
goTo(destination)
  ↓
execute(action)
  ↓
optional next action
```

Existing resource-specific behavior should be preserved semantically while avoiding new `goWell/goGarden/goTree/goStock` branches.

Schedule state is exposed through `getScheduledActivity(timeOfDay)` and `CurrentActivity` for UI/dialogue.

---

## 2. The critical historical trap

The beginning of plan 020 says that Schedule/Place/FSM work was missing. That was true during the 2026-08-08 review, but later work implemented stage 1 and stage 2.

Do **not** follow the old "0%" checklist literally.

The plan itself contains dated sections:

```text
v1 → Place/home formalization
v2 stage 1 → workplaces + schedule data
v2 stage 2 → generic FSM + schedule integration
```

Implementation work should start from the latest code, not from the original draft.

---

## 3. What stage 2 is supposed to accomplish

The intended runtime loop is:

```text
world clock
    ↓
getScheduledActivity(timeOfDay)
    ↓
┌──────────────────────────────┐
│ sleep → sleep/restore stamina │
│ work  → go to workplace       │
│ eat   → existing need system  │
│ home  → return home           │
│ wake  → transition/informational│
└──────────────────────────────┘
```

The schedule must **not completely replace needs**.

Needs remain a competing reason for action. The intended architecture is closer to:

```text
schedule + needs + current state
              ↓
          choose()
              ↓
       PlannedAction
              ↓
        generic FSM
```

A thirsty NPC should still be able to satisfy a critical need even if the schedule currently says `work`.

Conversely, schedule should provide a stable daily rhythm when no urgent need overrides it.

---

## 4. Verify schedule priority carefully

This is one of the highest-risk areas.

Do not implement a simplistic:

```ts
if (schedule === 'work') work()
```

without checking the existing `pickNeed()` / `choose()` priority logic.

Verify at least:

1. critical needs still win;
2. sleep actually prevents the NPC from continuing normal work/wander;
3. work routes to the role's workplace;
4. after work the NPC can resume normal behavior;
5. schedule transitions do not cause an NPC to oscillate between actions every frame;
6. the same action is not restarted every `choose` cycle if the NPC is already performing it;
7. existing wood/water/food behaviors remain intact.

---

## 5. Sleep and fatigue

NPC fatigue currently historically reused `HealthState.currentHp` as fatigue. Plan 045 is the cleanup/foundation for separating health from stamina/fatigue.

Therefore, **do not make 020 invent another fatigue/energy implementation**.

When working on sleep/rest behavior:

```text
020 → schedule says when to sleep
045 → stamina says how tired the NPC is / recovery
```

Keep those responsibilities separate.

---

## 6. Traits are intentionally NOT part of this step

The repository contains traits such as `night_owl`, `hardworking`, and `sociable`, but the decision was explicit:

> first establish one stable schedule per role; only afterwards add trait-based schedule modification.

Do not add:

```text
night_owl → shift schedule
hardworking → longer work
sociable → more social schedule
```

as part of this implementation unless the plan is explicitly reopened.

This avoids mixing schedule correctness with personality balancing.

---

## 7. Workplace limitations are intentional

Current workplace mapping reuses existing landmarks wherever possible.

In particular:

- miner uses stockpile because there is no proper ore-workplace query/location yet;
- guard uses well as a central patrol point;
- fisher falls back to well if no dock exists;
- trader has a dedicated market prop.

These are acceptable v1/v2 compromises, not reasons to introduce a new world-content generation system into 020.

Future work can make workplaces more semantically precise when the village-generation/economy systems are ready.

---

## 8. Day/night integration

Use `src/world/dayNight.ts` as the single time source.

Do not create a separate NPC clock.

The conversion is:

```text
07:00 → 7 / 24
12:00 → 12 / 24
18:00 → 18 / 24
00:00 → 0
```

Guard's schedule intentionally crosses midnight. `activityAt()` already handles this cyclically.

Verify behavior at boundaries, especially:

```text
17:00 guard wake
18:00 guard work
00:00 guard eat
01:00 guard work
06:00 guard home
08:00 guard sleep
```

---

## 9. Generic FSM migration guardrails

The generic action model should remain data-driven:

```ts
PlannedAction {
  action
  destination
  duration
  onComplete
  next?
}
```

This allows chains such as:

```text
wood
  → walk to tree
  → chop
  → walk to stockpile
  → deposit
```

Do not recreate dedicated phase enums for every new scheduled action.

If a new activity needs a new action, prefer adding an `ActionId`/handler to the generic mechanism rather than adding another `goSomething` phase.

---

## 10. Verification matrix

Before marking 020 done, test in-browser with accelerated time and inspect several roles.

| Role | Expected workplace | Expected schedule |
|---|---|---|
| woodcutter | tree | day work |
| farmer | garden | day work |
| miner | stockpile | early/day work |
| fisher | dock or well fallback | early/day work |
| trader | market | daytime work |
| guard | well/patrol point | night work |

For each role verify:

- NPC wakes/sleeps according to schedule;
- NPC travels to workplace for `work`;
- NPC actually stays/works there for a meaningful period;
- NPC returns home when schedule says `home`;
- urgent needs can still override schedule;
- schedule changes are driven by the world clock;
- no jitter/repeated path creation occurs at schedule boundaries.

Also verify several NPCs simultaneously: one NPC sleeping must not freeze the rest of the settlement.

---

## 11. Code-quality cleanup

Because 020 evolved through several stages, expect stale comments, compatibility wording, and possibly obsolete branches.

After behavior is verified:

- remove comments claiming schedule/FSM is still entirely unimplemented;
- remove dead resource-specific FSM paths if they are genuinely replaced;
- keep `Place`/schedule types in their dedicated modules;
- avoid putting schedule logic into rendering/UI code;
- keep `NpcAgent` from becoming a giant schedule-definition file;
- keep schedule templates data-only and testable without Three.js.

Do not perform unrelated NPC architecture refactors in this task.

---

## 12. Tests worth preserving/adding

Unit tests should cover:

### Schedule

- `hourToTimeOfDay()` normal and wrapped hours;
- `activityAt()` at exact boundaries;
- `activityAt()` just before/after boundaries;
- guard schedule across midnight;
- `nextBoundary()` including midnight wrap.

### Places

- each role resolves the intended workplace;
- fisher fallback;
- woodcutter round-robin;
- missing tree list returns `null`.

### FSM integration

Prefer focused tests around action selection rather than trying to fully render the world in unit tests.

Existing `Needs` behavior must remain green.

---

## 13. Definition of done

020 should not be considered complete merely because TypeScript/build/tests pass.

Definition of done:

- Place abstraction is used consistently;
- every active role has a deterministic workplace mapping;
- every active role has a schedule template;
- schedule uses the real world clock;
- generic FSM handles scheduled work/sleep without duplicated `goX` phases;
- needs still override schedule when appropriate;
- sleep/rest integrates cleanly with the future 045 stamina model;
- traits do not secretly modify schedules yet;
- browser verification confirms the visible daily rhythm;
- stale comments/status are cleaned up;
- no second scheduler or parallel FSM was introduced.
