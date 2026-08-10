# Implementation Notes: NPC Daily Routine & Place System

**Plan:** [2026-08-07--020--npc-2-daily-routine-and-place.md](./2026-08-07--020--npc-2-daily-routine-and-place.md)

## Purpose

Repository-specific notes for finishing/verifying plan 020 without re-discovering the history of the implementation. The plan contains several generations of decisions; this document treats the **current code** as the source of truth and clearly separates what is already implemented from what still needs work.

## Current status — important

The repository currently contains most of v2 stage 1 and stage 2 infrastructure, including:

- `PlaceType` = `home | workplace | food | social`;
- `workplaceFor()` per-role workplace mapping;
- `ScheduleTemplate` and `SCHEDULE_TEMPLATES` for all active roles;
- `activityAt()` / `nextBoundary()`;
- `NpcAgent.workplace` and `NpcAgent.schedule`;
- generic `goTo` / `execute` / chained action infrastructure;
- schedule-driven sleep/work behavior.

The remaining work is primarily **verification, arbitration correctness, cleanup, and checking that the intended behavior is actually complete**, rather than blindly implementing the original plan from the top.

Do not re-implement already-existing stage 1/2 code.

---

## 1. Current architecture

### `src/settlement/places.ts`

`Place` is the abstraction for meaningful world locations:

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

This intentionally reuses existing settlement landmarks. Do not invent new workplace world content or a parallel location system as part of 020.

The intended dependency remains:

```text
SettlementLandmarks
       ↓
     Place
       ↓
 daily activity
       ↓
 existing NPC FSM
```

Routine/schedule code must not store hard-coded landmark coordinates or maintain its own workplace representation.

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

Do not replace this with a second scheduler or a timer-based 24h system. The world clock is the authoritative time source.

### `src/ai/NpcAgent.ts`

The current FSM already uses the generic action model:

```text
choose
  ↓
goTo(destination)
  ↓
execute(action)
  ↓
optional next action
```

Resource-specific movement phases have been collapsed into `PlannedAction`. Existing `followPath`, `goSleep`, `sleep`, `wander`, and `lookAtPlayer` phases remain because they represent distinct FSM behavior rather than duplicated "go somewhere and perform one resource action" systems.

Daily routine must continue to select intent and feed this existing FSM. Do not add independent mechanisms such as `goSleep()`, `goGarden()`, `goWell()`, `goWork()`, or separate navigation controllers for individual activities.

---

## 2. Schedule and needs are competing intent sources

The schedule must **not replace the existing Needs system**.

The architecture is:

```text
schedule intent ─┐
                 ├→ decision / arbitration → existing FSM
needs intent ────┘
```

The arbitration can remain inside `NpcAgent` for this scope. Do not introduce a second scheduler or a separate need system merely to formalize this relationship.

`Needs.pickNeed()` remains the source of need priority. The schedule supplies a lower-priority daily intent when no need currently requires action.

### Required precedence

Use the following rule as the intended Seedvale policy:

```text
selected need intent
      > scheduled routine
      > low-priority idle/wander activity
```

More generally, this corresponds to:

```text
critical need
    > normal schedule
    > low-priority activity
```

The current `Needs` implementation does not expose a separate `critical` flag or severity enum. It expresses urgency through `pickNeed()` scores and thresholds. Therefore 020 must not invent a second notion of need criticality. For the current implementation, if `pickNeed()` returns `water`, `food`, or `wood`, that need intent wins over the schedule; only `idle` allows the schedule to select the routine activity.

This is the key arbitration rule to preserve when the sleep path is corrected.

### Sleep must not bypass arbitration

The current `NpcAgent.update()` checks scheduled `sleep` before calling `pickNeed()`. That ordering is inconsistent with the policy above: it can put an NPC into `goSleep` without first allowing an active need to win.

The implementation/verification work for 020 must therefore make the arbitration explicit at the `choose` decision point. Conceptually:

```text
choose
  ↓
pickNeed()
  ├─ active need → beginNeed() → generic FSM
  └─ idle → evaluate schedule
              ├─ sleep → goSleep/sleep
              ├─ work  → generic work action
              └─ other → normal idle behavior
```

Do not solve this by adding an interrupt system for every need. The existing `choose()`/`pickNeed()` path is the natural arbitration point. If a future system introduces truly urgent needs that must interrupt an action already in progress, that should be designed explicitly rather than smuggled into 020.

---

## 3. Runtime state vs schedule data

Keep planned schedule data separate from runtime NPC state.

### Schedule data describes

- activity;
- start time / time window;
- role-level daily rhythm.

`ScheduleTemplate` must remain data-only and independent of Three.js runtime state.

### `NpcAgent` runtime state describes

- current FSM `phase`;
- current `pendingAction` / intent;
- current need;
- current destination/target used by the active FSM phase;
- other transient movement/execution state.

Do not duplicate the same `currentActivity`, destination, or FSM state inside schedule entries. `getCurrentActivity()` may expose a derived presentation summary, but it must not become a second source of truth.

---

## 4. Sleep and fatigue

NPC fatigue currently reuses `HealthState.currentHp` as fatigue. Plan 045 is the cleanup/foundation for separating health from stamina/fatigue.

Therefore, **do not make 020 invent another fatigue/energy implementation**.

Responsibilities remain:

```text
020 → schedule says when to sleep
045 → stamina/fatigue model says how tired the NPC is / recovery
```

Keep those responsibilities separate.

Scheduled sleep should use the existing `goSleep` → `sleep` FSM behavior and the existing rest mechanism. It should not introduce another sleep state machine.

---

## 5. Personality and traits

Existing personality/archetype handling must remain the single personality mechanism. Daily routine must not create a second personality system.

Current traits already influence other NPC behavior such as fatigue/rest, work timing, and player-reaction behavior. However, the first stable schedule remains **role-based and uniform per role**.

Traits such as `night_owl`, `hardworking`, and `sociable` must not modify the schedule template in this step unless the plan is explicitly reopened.

In particular, do not add schedule overlays such as:

```text
night_owl → shifted schedule
hardworking → longer work shift
sociable → more social schedule
```

This keeps schedule correctness separate from personality balancing while still preserving the personality mechanisms already present elsewhere in `NpcAgent`.

`night_owl` currently has a special sleep-gate behavior in `NpcAgent`; preserve that existing behavior unless 020 explicitly changes it. It is not a new schedule-generation system.

---

## 6. Determinism and randomness

Do not introduce a new source of nondeterministic routine selection.

The schedule itself is deterministic: a role maps to one schedule template and `activityAt()` derives the active activity solely from the world clock.

Existing NPC behavior already uses `Math.random()` for some choices, including idle wandering, dock-path selection, water destination selection, reaction sounds, and action duration. Do not remove or redesign those unrelated existing patterns as part of 020.

If routine-specific randomness is ever added, it must be justified and should follow the project's existing NPC/world randomness conventions rather than creating another independent simulation source.

---

## 7. Workplace limitations are intentional

Current workplace mapping reuses existing landmarks wherever possible.

In particular:

- miner uses stockpile because there is no proper ore-workplace query/location yet;
- guard uses well as a central patrol point;
- fisher falls back to well if no dock exists;
- trader has a dedicated market prop;
- woodcutter uses an existing settlement tree selected by the existing tree-index mechanism.

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

The generic action model is:

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

Scheduled work should use the same mechanism:

```text
work intent
  → goTo(workplace.position)
  → execute(work)
  → choose
```

Do not recreate dedicated phase enums or navigation methods for every new scheduled activity.

If a future activity needs a new action, prefer adding an `ActionId`/handler to the generic mechanism rather than adding another `goSomething` phase.

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
- NPC returns home when schedule says `home` where home behavior is implemented;
- an active need returned by `pickNeed()` wins over scheduled sleep/work;
- schedule is consulted only after the need decision returns `idle`;
- schedule changes are driven by the world clock;
- no jitter/repeated path creation occurs at schedule boundaries;
- the same action is not restarted every `choose` cycle while it is already executing;
- existing wood/water/food behaviors remain intact.

Also verify several NPCs simultaneously: one NPC sleeping must not freeze the rest of the settlement.

Explicitly test sleep/need arbitration at representative times:

1. NPC is scheduled to sleep and has no active need → sleep wins over idle behavior.
2. NPC is scheduled to sleep and `pickNeed()` returns a need → need wins and routes through the existing need FSM.
3. NPC is scheduled to work and `pickNeed()` returns a need → need wins; after completion, `choose()` reevaluates the schedule.
4. NPC has no active need and schedule says work → generic `work` action routes to the role's `Place`.

---

## 11. Code-quality cleanup

Because 020 evolved through several stages, expect stale comments, compatibility wording, and possibly obsolete branches.

After behavior is verified:

- remove comments claiming schedule/FSM is still entirely unimplemented;
- remove dead resource-specific FSM paths if they are genuinely replaced;
- keep `Place`/schedule types in their dedicated modules;
- avoid putting schedule logic into rendering/UI code;
- keep `NpcAgent` from becoming a giant schedule-definition file;
- keep schedule templates data-only and testable without Three.js;
- keep arbitration in one clear decision point rather than scattering schedule-vs-need checks across FSM phases.

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

### Arbitration / FSM integration

- active `pickNeed()` result wins over scheduled sleep;
- active `pickNeed()` result wins over scheduled work;
- schedule is evaluated when `pickNeed()` returns `idle`;
- scheduled work creates the generic `goTo` → `execute` action;
- sleep transition does not bypass need selection;
- focused action-selection tests are preferred over rendering the full world in unit tests.

Existing `Needs` behavior must remain green.

---

## 13. Definition of done

020 should not be considered complete merely because TypeScript/build/tests pass.

Definition of done:

- `Place` abstraction is used consistently;
- every active role has a deterministic workplace mapping;
- every active role has a schedule template;
- schedule uses the real world clock;
- schedule and needs are competing intent sources resolved at one clear decision point;
- an active need selected by `pickNeed()` takes precedence over scheduled sleep/work;
- generic FSM handles scheduled work/sleep without duplicated `goX` navigation phases;
- sleep/rest integrates cleanly with the future 045 stamina model;
- traits do not secretly modify schedules yet;
- existing personality/archetype mechanisms remain the only personality system;
- runtime state is not duplicated into schedule data;
- browser verification confirms the visible daily rhythm and sleep/need arbitration;
- stale comments/status are cleaned up;
- no second scheduler, parallel Needs system, parallel Place/location system, or parallel FSM was introduced;
- no unrelated `src/` refactor is bundled into the 020 work.
