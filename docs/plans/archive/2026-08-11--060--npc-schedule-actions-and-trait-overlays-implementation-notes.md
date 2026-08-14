# Implementation Notes — 060

## Implemented rules (2026-08-13)

Resolved during implementation (plan left exact hours open):

| Overlay | Rule |
|---|---|
| `night_owl` | Shift **every** entry by `NIGHT_OWL_SHIFT_HOURS = 2` (mod 24). Replaces the old `choose()` skip-sleep exception. |
| Work-oriented | **`fast_worker`**, not a new `hardworking` trait. Delay a `home` that follows `work` by `FAST_WORKER_WORK_EXTEND_HOURS = 1`. Distinct from `FAST_WORKER_WAIT_MULT`. |
| `sociable` | If `hasSocialPlace`, first `SOCIABLE_SOCIAL_HOURS = 2` of each `home` block become `social`; shorter blocks convert entirely. Runtime passes `hasSocialPlace: false`. |
| Order | `fast_worker` → `night_owl` → `sociable`. |
| `wake` | No action; `idleIntentFor('wake') === 'home'`. |
| Arbitration | `pickNeed()` first, then schedule (including sleep). No interrupt of in-flight actions. |

`effectiveScheduleFor` lives in `src/ai/schedule.ts`; tests in `src/ai/schedule.test.ts`. `NpcAgent.schedule` is the effective schedule, computed once in the constructor.

## Purpose

These notes are a repository-specific implementation guide for plan 060. They are intentionally not a copy of the plan. The goal is to let an implementation agent extend the existing NPC schedule/FSM/traits code without re-discovering the architecture.

**Repository source of truth:** current code. The documentation is useful context, but several older NPC documents describe intermediate states. In particular, plan 020 is marked `done`, while `docs/STATE.md` still describes daily routine as partially implemented; the current code is the deciding source for implementation details.

Plan 060 should extend the existing `NpcAgent` + `schedule.ts` + `Place` + shared `PlannedAction` architecture. Do not create another scheduler, another FSM, another personality system, or a generic AI manager.

## Current Codebase

### Core NPC ownership

`src/ai/NpcAgent.ts` is the central runtime owner for NPC needs, personality-derived parameters, traits, schedule, FSM phase, current action and movement. The relevant existing state includes:

- `role: Role`
- `traits: readonly Trait[]`
- `personality: CharacterDef['personality']`
- `workplace: Place | null`
- `schedule: ScheduleTemplate`
- private `phase: Phase`
- private `activeNeed: NeedId`
- private `pendingAction: NpcPlannedAction | null`
- shared `actionLifecycle: ActionLifecycle`
- `home: THREE.Vector3`
- movement target/path state

The FSM phases are currently:

```text
choose
execute
followPath
goSleep
goTo
lookAtPlayer
sleep
wander
```

Do not add `goEatScheduled`, `goHomeScheduled`, `goSocial`, or similar phases.

`NpcAgent` already imports and uses the shared simulation contracts from `src/simulation/` introduced by plan 055: `PlannedAction`, `DecisionContext`, and action lifecycle helpers.

### Character / traits

`src/ai/characters.ts` owns the canonical character data model:

```ts
Role = 'woodcutter' | 'farmer' | 'guard' | 'trader' | 'miner' | 'fisher'
Trait = 'energetic' | 'fast_worker' | 'night_owl' | 'sociable'
CharacterDef = {
  name,
  lastName?,
  gender,
  role,
  personality,
  traits,
}
```

Traits are already generated deterministically by `characterForSeed()` and reserved characters already contain examples of `fast_worker`, `energetic`, `night_owl` and `sociable`. Do not introduce another trait registry.

Existing trait effects are already implemented in `NpcAgent` outside schedule generation. In particular:

- `energetic` modifies stamina fatigue/rest rates;
- `fast_worker` modifies action wait timing via `FAST_WORKER_WAIT_MULT`;
- `sociable` modifies player-reaction distance/duration through `applySociableBoost()`;
- `night_owl` already participates in NPC behaviour, including the low-HP movement slowdown exception and existing sleep-related handling.

Plan 060 should add schedule effects on top of these existing modifiers, not replace them.

### Schedule

`src/ai/schedule.ts` owns the data-only role schedule:

```ts
export type ScheduleActivity = 'eat' | 'home' | 'sleep' | 'wake' | 'work'
export type ScheduleEntry = { hour: number; activity: ScheduleActivity }
export type ScheduleTemplate = readonly ScheduleEntry[]
```

`SCHEDULE_TEMPLATES` contains templates for all six active roles. The schedules use hours in a 24-hour clock and may cross midnight. `activityAt()` resolves the currently active entry cyclically; `nextBoundary()` returns the next schedule boundary.

`src/ai/schedule.test.ts` already tests normal boundaries and the guard's midnight wrap. Extend this file for pure effective-schedule tests rather than creating a second schedule test location.

### Places

`src/settlement/places.ts` owns:

```ts
PlaceType = 'home' | 'workplace' | 'food' | 'social'
Place = { id, type, position }
```

`workplaceFor()` maps roles to existing settlement landmarks. Important mappings are:

```text
woodcutter → settlement tree
farmer     → garden
trader     → market
miner      → stockpile
guard      → well
fisher     → dock, otherwise well
```

There is currently **no general social-place producer** in the settlement code, despite `PlaceType` already containing `social`. There is also no separate food-place assignment field on `NpcAgent`; the existing food/need path uses the garden directly.

Therefore 060 must not invent a new social-place world object merely to make `sociable` visibly useful. The plan's intended fallback is valid: if no social place exists, the effective schedule remains `home`. Likewise scheduled `eat` should reuse the existing garden/food destination and action path rather than creating a second food-location system.

### Settlement wiring

`src/settlement/createSettlement.ts` builds `Place` homes, resolves each NPC's workplace with `workplaceFor()`, and creates each `NpcAgent`. The settlement update calls:

```text
SettlementsManager.update()
  → Settlement.update()
    → NpcAgent.update(dt, observerPos, observerYaw, timeOfDay, nearbyNpcCount)
```

`src/settlement/SettlementsManager.ts` receives the authoritative `timeOfDay` from the application and forwards it to every loaded settlement. Do not create or update a second NPC clock.

### Needs

`src/ai/Needs.ts` owns need state and `pickNeed()`. The current NPC model has one active need at a time (`activeNeed: NeedId`). Existing water/food/wood routing must remain authoritative when a need is selected.

The intended arbitration is:

```text
pickNeed()
  ├─ active need → existing need FSM
  └─ idle → scheduled activity
             └─ fallback idle/wander
```

Plan 060 explicitly says ordinary schedule changes do not interrupt an action already in progress. Do not add a cancellation/interrupt system.

## Related Plans

### 020 — NPC Daily Routine & Place

Plan 020 established the current `Place`, role schedule, `activityAt()`, workplace mapping and generic `goTo → execute` FSM. Its implementation notes explicitly require schedule and needs to be resolved at one decision point and prohibit dedicated per-activity navigation phases.

Plan 060 is the deferred second layer: schedule entries that were previously informational (`eat`, `home`, `wake`) become meaningful runtime intents, and traits can personalize the role template.

Do not reimplement any of 020's infrastructure.

### 022 — NPC Character Depth

Plan 022 established the canonical `CharacterDef`, `Role`, `Trait`, Big Five personality data and deterministic trait assignment. It deliberately positioned traits as lightweight modifiers over existing behaviour rather than a second personality system.

Plan 060 must consume `NpcAgent.traits` / `CharacterDef.traits` directly.

### 055 — Shared Simulation Architecture

Plan 055 is `done`. The relevant implemented seam is:

```text
state / needs
    ↓
perception / context
    ↓
decision
    ↓
PlannedAction
    ↓
existing domain/world effect
    ↓
state change
```

For NPCs, the architecture remains local to `NpcAgent`; the shared part is the action/context contract, not a universal AI controller.

### 048 — NPC Dialogues v2

Plan 048 added `nextBoundary()` and a public current-activity presentation layer on `NpcAgent`. This matters because schedule changes must not break `getCurrentActivity()` or dialogue text such as the next schedule boundary.

The schedule implementation must therefore remain data-only and continue to expose boundaries through `nextBoundary()`.

### 045 — Health/Stamina foundation

Fatigue is now represented by shared `StaminaState`; do not reintroduce the older HP-as-fatigue model. Schedule `sleep` controls *when* the NPC sleeps. Stamina controls fatigue/recovery and remains an independent state concern.

## Current Architecture

The existing NPC execution path should remain structurally like this:

```text
world day/night clock
        ↓
 timeOfDay passed to NpcAgent
        ↓
     choose
        ↓
    pickNeed()
     /      \
  need      idle
   ↓          ↓
existing   effective schedule
need FSM       ↓
          scheduled activity
                ↓
          generic FSM/action
                ↓
      goTo → execute / sleep / wander
                ↓
         domain world effect
```

Traits belong in the **decision input / schedule transformation layer**, not in rendering and not inside `Place`.

The schedule is a planning input, not an FSM. The FSM owns execution.

## Plan vs Codebase Review

### 1. `eat` is not currently a scheduled action

**Plan assumption:** `eat` should become an observable scheduled activity.

**Current reality:** `ScheduleActivity` already contains `eat`, and the base schedules already contain `eat` entries, but the NPC runtime historically treats it as informational. Existing food behaviour already exists through the need path, using the garden.

**Required change:** make scheduled `eat` call the same existing generic action path used by food needs. Do not create a separate scheduled-eating implementation. The action should use the existing garden/food destination and existing `eat` world-effect callback.

### 2. `home` exists as a schedule activity but does not have a dedicated home FSM phase

**Plan assumption:** NPC should return home and remain nearby.

**Current reality:** `home` is already a `Place` and `home` is already stored in `NpcAgent`; the generic `goTo` machinery exists. No `goHomeScheduled` phase is needed.

**Required change:** when `activityAt()` resolves to `home` and no need is selected, schedule a generic movement intent to `home`. Once the NPC reaches home, use existing low-priority idle/wander behaviour constrained to the home area rather than creating a persistent new FSM phase.

The implementation should avoid restarting a home movement every `choose` cycle. The action must be owned by the existing action lifecycle and only be created when the NPC is not already executing the same destination/activity.

### 3. `wake` should remain a transition marker, not a new action

The plan is correct that a separate wake action has little value. `wake` should resolve to the normal post-sleep decision state. At a `wake` boundary, `choose()` reevaluates needs and then the effective schedule. Do not add `wake` to `ActionId` unless an observable gameplay effect is later justified.

### 4. `social` Place currently has no producer

`PlaceType` already supports `social`, but `places.ts` currently has no `socialPlaceFor()` and settlement generation does not assign a social place.

Therefore:

- do not add a new social landmark in 060;
- the effective-schedule transformer may accept an optional `socialPlace`/availability signal if that is the cleanest pure-data seam;
- current runtime should pass no social place, causing `sociable` schedule substitutions to remain `home`;
- preserve the existing `sociable` player-reaction modifier, so the trait still has runtime value today.

### 5. `night_owl` has existing behaviour

Do not stack a second special-case sleep gate on top of the new effective schedule. The existing `night_owl` behaviour should be absorbed into the deterministic effective-schedule transformation so there is one authoritative schedule result.

After 060, `NpcAgent` should not have one schedule path and a separate `if (traits.includes('night_owl'))` schedule exception that can disagree with it.

### 6. `hardworking` is not currently a Trait

This is an important plan/code mismatch. The current canonical `Trait` union is:

```text
energetic | fast_worker | night_owl | sociable
```

There is **no `hardworking` trait** in `characters.ts` and no generated/reserved character using it.

The 060 plan names `hardworking` as a schedule overlay, but implementing it literally would require expanding the canonical trait pool and character generation. That is a larger scope than the schedule overlay itself and conflicts with the existing `fast_worker` trait concept.

**Recommended minimal correction:** treat `fast_worker` as the existing work-oriented trait for 060 rather than introducing `hardworking`. If product intent specifically requires a distinct `hardworking` trait, that must be a deliberate character-model change, not an incidental 060 implementation detail.

### 7. `fast_worker` already modifies execution duration

`fast_worker` already affects action timing via `FAST_WORKER_WAIT_MULT`. Do not use schedule overlays to duplicate this effect by changing every work action duration.

If 060 needs a longer *work block*, that is a schedule-level concern and must be distinct from `fast_worker`'s per-action execution speed. Because `hardworking` does not exist, the safest v1 is to avoid adding this second concept unless the trait model is explicitly amended.

### 8. Existing schedule roles exceed the original 022 role list

The current role union includes `miner` and `fisher`, and `SCHEDULE_TEMPLATES` covers both. Any effective-schedule function must operate on the generic `ScheduleTemplate` and `Role`, not hard-code only the original four roles.

### 9. Current schedule data is already mutable only through assignment

`SCHEDULE_TEMPLATES` is a `Record<Role, ScheduleTemplate>`, with arrays typed readonly. Do not mutate entries in place. The effective schedule should be a new derived value or immutable structure per NPC.

## Target Architecture

The minimal target is:

```text
Role
  + base SCHEDULE_TEMPLATES[role]
  + immutable traits
  + optional available Places
          ↓
  effectiveScheduleFor(...)
          ↓
   effective ScheduleTemplate
          ↓
 activityAt(effectiveSchedule, timeOfDay)
          ↓
 pickNeed() arbitration
          ↓
 existing NpcAgent FSM
          ↓
 PlannedAction / sleep / wander
          ↓
 existing domain effect
```

There must be exactly one schedule representation used by `NpcAgent` for runtime decisions. `getCurrentActivity()` and dialogue must read the same effective schedule rather than the base template.

## Data Flow

The concrete runtime flow should be:

```text
dayNight.ts timeOfDay
        ↓
SettlementsManager.update(... timeOfDay ...)
        ↓
Settlement.update(... timeOfDay ...)
        ↓
NpcAgent.update(... timeOfDay ...)
        ↓
choose()
        ↓
pickNeed()
  ├──────────────→ beginNeed() → existing need action
  │
  └ idle
       ↓
get/evaluate effective schedule
       ↓
activityAt(effectiveSchedule, timeOfDay)
       ↓
 ┌──────┬──────┬──────┬───────┐
 eat   home   sleep   wake   work
  ↓      ↓      ↓      ↓      ↓
food   home   sleep  choose  workplace
place  movement       again  work action
  └──────────── existing FSM ─────────────┘
```

The schedule transformer itself must not know about Three.js, NPC phase, needs, movement or rendering.

## Detailed Implementation

### Step 1 — Introduce a pure effective-schedule transformation

Extend `src/ai/schedule.ts`, not `NpcAgent.ts`, with the smallest pure function that derives a per-NPC schedule from:

- base `ScheduleTemplate`;
- `readonly Trait[]`;
- optional capabilities needed for schedule overlays, such as whether a social place exists.

Prefer a function conceptually equivalent to:

```ts
effectiveScheduleFor(template, traits, options): ScheduleTemplate
```

Do not expose `NpcAgent`, `Place`, Three.js objects or runtime state from this function.

The function must:

- never mutate `SCHEDULE_TEMPLATES`;
- return deterministic output for identical inputs;
- preserve all activities not affected by overlays;
- normalize shifted hours modulo 24;
- preserve cyclic/midnight semantics;
- keep the result compatible with `activityAt()` and `nextBoundary()`.

### Step 2 — Define exact overlay rules before coding

The current plan says the exact times are to be resolved during implementation. Do not leave these rules implicit in code.

Recommended minimal v1 rules, unless product direction explicitly changes them:

**`night_owl`**

- Shift `sleep` and the associated `wake` boundary later by a fixed amount, e.g. +2 hours.
- Shift the work/eat/home blocks consistently enough that the schedule remains coherent; do not simply move one `sleep` entry and leave the rest unchanged.
- Use modulo-24 arithmetic so guard's schedule remains valid across midnight.
- The result must not create duplicate/conflicting starts.

The exact shift should be one named constant in `schedule.ts`, not scattered arithmetic.

**Work-oriented trait**

The plan names `hardworking`, but the code only has `fast_worker`. Do not silently add `hardworking`. Prefer either:

1. use `fast_worker` as the existing work-oriented schedule modifier, with a clearly documented schedule-level effect distinct from its execution-speed effect; or
2. explicitly revise the plan/character model before implementation if a distinct `hardworking` trait is required.

Given the instruction not to modify other files, option 1 is the smallest implementation path.

**`sociable`**

- Only substitute a `home` block with `social` if a social place is actually available.
- With no social place (the current codebase), keep `home` unchanged.
- Do not create social world geometry as part of 060.

Avoid complicated multi-trait weighting. Apply overlays in a fixed documented order so the transformation is deterministic. A sensible order is:

```text
base role template
  → work-oriented adjustment
  → night_owl time shift
  → sociable home→social substitution when supported
```

However, the implementation should prefer transformations that preserve semantic blocks rather than blindly shifting every entry.

### Step 3 — Store/use the effective schedule in NpcAgent

`NpcAgent` currently has `readonly schedule: ScheduleTemplate` assigned from `SCHEDULE_TEMPLATES[character.role]`.

Change this field to represent the **effective per-NPC schedule**, while keeping the base templates in `schedule.ts` untouched.

The constructor/factory already receives the `member.character`, so it has access to `character.traits`. Compute the derived schedule once during NPC creation rather than every frame.

This is important for performance and for ownership clarity:

```text
SCHEDULE_TEMPLATES → character traits → NpcAgent.schedule
```

not:

```text
SCHEDULE_TEMPLATES + traits → recompute every update frame
```

If social-place availability is part of the transformer options, pass a simple boolean or stable `Place | null` capability at construction time. Do not put a Three.js object into schedule data.

### Step 4 — Make scheduled `eat` use the existing food action

At the schedule decision point, when effective activity is `eat` and no need wins:

- route to the existing garden/food destination;
- reuse the existing `eat` `ActionId` and completion callback;
- use the same need update/timing semantics as the current food action;
- do not create `scheduledEat` or a second hunger mutation path.

The scheduled meal is a lower-priority routine action. If `pickNeed()` selects food first, the existing need path still wins.

Keep the scheduled meal's hunger restoration bounded exactly like the existing food action. Do not add inventory/food-consumption economy to this plan.

### Step 5 — Implement scheduled `home` through generic movement

For `home`:

- use `home` as the destination;
- use existing `goTo`/movement mechanics;
- after arrival, allow the existing idle/wander logic to keep the NPC near home;
- do not add `goHomeScheduled`.

The implementation must avoid action churn. A `home` schedule entry lasting several hours must result in one trip, not repeated `goTo(home)` actions.

### Step 6 — Handle `wake` as a decision boundary

Do not add a wake action.

When `activityAt()` returns `wake`, `choose()` should simply reevaluate the decision. The next activity after the boundary should normally be `work`, `eat`, or `home` depending on the effective schedule.

If the NPC is still in `sleep` because of the existing sleep phase semantics, let the normal sleep completion/decision flow finish; do not create a second wake state machine.

### Step 7 — Preserve scheduled `work` and `sleep`

Existing work/sleep execution should be kept and redirected to `NpcAgent.schedule`, now containing the effective schedule.

For `work`:

```text
scheduled work
  → workplace
  → generic PlannedAction<ActionId='work'>
  → execute
  → choose
```

For `sleep`:

```text
scheduled sleep
  → goSleep
  → sleep
  → choose
```

Do not make schedule changes interrupt a currently executing `work` or need action. The new schedule is consulted at the next decision point.

### Step 8 — Preserve need precedence

The existing decision point must remain the single arbitration location.

Required behaviour:

```text
choose
  ↓
pickNeed()
  ├─ water/food/wood → existing need action
  └─ idle → effective schedule
```

Do not implement a second `if urgentNeed` check inside each schedule activity.

Do not make ordinary schedule changes cancel a current action.

### Step 9 — Keep dialogue/current-activity integration correct

`NpcAgent.getCurrentActivity(timeOfDay)` and the existing `nextBoundary()`-based dialogue must continue to work.

If the getter reports a scheduled `work`/`sleep` boundary, it must use the effective `this.schedule`, not `SCHEDULE_TEMPLATES[this.role]` directly.

The public activity summary remains a presentation-oriented projection of private FSM state. Do not expose `Phase` or `PlannedAction` publicly.

### Step 10 — Add pure unit tests

Extend `src/ai/schedule.test.ts` with deterministic tests for:

- no-trait schedule equals base schedule;
- `night_owl` shifts the intended entries;
- shifted schedules remain valid across midnight;
- guard + `night_owl` does not produce invalid ordering or duplicate boundaries;
- work-oriented trait behaviour, if `fast_worker` is selected for this role, is deterministic;
- `sociable` with no social place leaves `home` unchanged;
- `sociable` with an available social place substitutes the intended home block;
- combining multiple traits is deterministic and does not mutate the source template;
- all six active roles still produce valid effective schedules;
- `activityAt()` and `nextBoundary()` work unchanged against derived schedules.

Also add focused action-selection tests where feasible, but do not turn the unit suite into a Three.js world integration test.

### Step 11 — Manual verification

Use accelerated time and observe several NPCs simultaneously. Browser verification should specifically cover:

- day-role NPC eating at the scheduled meal time;
- NPC returning home during the home block;
- NPC working at the assigned workplace;
- NPC sleeping during the effective sleep block;
- guard schedule crossing midnight;
- `night_owl` NPC visibly following a shifted rhythm;
- sociable NPC not attempting to navigate to a nonexistent social place;
- need pressure overriding schedule;
- two NPCs with different traits following different schedules simultaneously.

## Files and Symbols

| File | Symbol | Change | Reason |
| --- | --- | --- | --- |
| `src/ai/schedule.ts` | `ScheduleActivity`, `ScheduleEntry`, `ScheduleTemplate` | Keep as canonical data model; add pure effective-schedule transformation | Schedule data must remain data-only and reusable/testable |
| `src/ai/schedule.ts` | `SCHEDULE_TEMPLATES` | Do not mutate | Role templates are global base data |
| `src/ai/schedule.ts` | `activityAt()` / `nextBoundary()` | Keep semantics; test against derived schedules | Existing clock/boundary model is correct |
| `src/ai/schedule.test.ts` | existing schedule tests | Extend with overlay/multi-trait/midnight tests | Pure deterministic coverage belongs here |
| `src/ai/NpcAgent.ts` | `schedule` field | Store effective per-NPC schedule instead of raw role template | Runtime decisions and dialogue must use the same personalized schedule |
| `src/ai/NpcAgent.ts` | constructor/factory | Compute effective schedule once from `character.traits` and optional capabilities | Avoid per-frame recomputation |
| `src/ai/NpcAgent.ts` | `choose()` / schedule decision path | Add `eat`/`home`/`wake` behaviour while preserving need precedence | Existing FSM is the execution owner |
| `src/ai/NpcAgent.ts` | existing `startAction()` / generic `goTo`→`execute` path | Reuse for scheduled eat/home/work | Avoid new action phases/navigation systems |
| `src/ai/NpcAgent.ts` | `getCurrentActivity()` / scheduled activity helpers | Ensure effective schedule is used | Preserve dialogue/activity correctness |
| `src/settlement/places.ts` | `PlaceType` / `Place` | No new type needed | `social` and `food` already exist conceptually |
| `src/settlement/places.ts` | `workplaceFor()` | No general redesign | Existing workplace mapping is sufficient for 060 |
| `src/settlement/createSettlement.ts` | NPC creation call | Only pass any minimal capability required by effective schedule; otherwise leave unchanged | Settlement already owns home/workplace assignment |
| `src/settlement/SettlementsManager.ts` | `update()` | No architectural change | Already forwards authoritative `timeOfDay` |
| `src/ai/characters.ts` | `Trait` | Do not add `hardworking` silently | Current canonical trait set has no `hardworking` |

No new manager/service should be introduced.

## Trait Integration

Traits have two distinct responsibilities after 060:

```text
Trait
 ├─ existing execution/perception modifiers
 │    ├─ energetic → stamina rates
 │    ├─ fast_worker → action wait multiplier
 │    └─ sociable → player-reaction params
 │
 └─ schedule overlay
      ├─ night_owl → effective time blocks
      ├─ work-oriented trait → schedule block adjustment, if retained
      └─ sociable → home→social only when social Place exists
```

The schedule overlay must not replace the existing trait effects.

Most importantly, do not derive traits from Big Five in 060. Plan 022 explicitly keeps traits as a separate closed pool. Personality remains personality; traits remain traits.

## Schedule / Activity / Action Model

Keep these concepts separate:

```text
ScheduleTemplate
    = planned daily rhythm

Effective Schedule
    = base rhythm + immutable per-NPC trait overlays

ScheduleActivity
    = intent label: eat/home/sleep/wake/work

PlannedAction
    = concrete executable action

FSM Phase
    = runtime execution state
```

Example:

```text
12:00 + farmer + fast_worker
        ↓
activityAt(effectiveSchedule, 12:00)
        ↓
'eat'
        ↓
PlannedAction<'eat'>
        ↓
goTo(garden)
        ↓
execute(eat)
        ↓
existing hunger/world effect
```

Do not encode `ScheduleActivity` values directly as FSM phases.

`wake` is specifically a schedule boundary/intention and should normally map back to decision evaluation rather than to an executable action.

## Integration with Shared Simulation Architecture

Plan 055's model should be followed without introducing a new abstraction layer:

### State

Owned by existing NPC systems:

- `Needs.ts` → needs;
- `NpcAgent` → runtime FSM/action state;
- `StaminaState` → fatigue/recovery;
- character data → role/traits/personality.

### Perception/context

For 060, the relevant context is minimal:

- current `timeOfDay`;
- effective schedule;
- available `Place` capability (especially optional social place);
- current need selection.

Do not build a general perception framework for schedule overlays.

### Decision

`NpcAgent.choose()` remains the local decision point. It combines:

```text
needs > effective scheduled activity > idle fallback
```

This is consistent with 055's rule that decision policies remain local to each agent.

### Action

Use existing shared `PlannedAction` and lifecycle. Scheduled work/eat should become generic planned actions; home should use generic movement; sleep continues through the existing sleep phases because sleep is already a distinct NPC behaviour.

### World effect

Reuse existing domain callbacks:

- eat → existing need/hunger update;
- work → existing work action callback;
- movement → existing NPC position/navigation code;
- sleep → existing sleep/rest state;
- home/social → only movement/idle positioning, no new social simulation.

Rendering remains outside all of this.

## Scope

### In Scope

- Pure per-NPC effective schedule transformation.
- `night_owl` schedule overlay.
- Work-oriented schedule overlay only if mapped to the existing trait model without introducing an unnecessary new trait.
- `sociable` home→social overlay when a social Place actually exists; safe home fallback otherwise.
- Scheduled `eat` execution using the existing food/garden action path.
- Scheduled `home` movement/idle behaviour using existing home Place.
- Explicit `wake` decision boundary without a new wake action.
- Existing scheduled `work`/`sleep` migrated to effective schedule data.
- Preservation of need-over-schedule precedence.
- Unit tests for deterministic schedule transformations and midnight cases.
- Manual verification of the resulting daily rhythm.

### Out of Scope

- LLM/AI-controlled NPC behaviour.
- GOAP, behaviour trees, utility-AI framework, ECS or UniversalAIManager.
- New personality/trait system.
- Adding a distinct `hardworking` trait unless separately decided at the character-model level.
- New social landmarks/world geometry.
- Social relationships or group conversations.
- Economy, production, consumption or crafting.
- New needs.
- New pathfinding/navigation system.
- Schedule interruption/cancellation for ordinary time changes.
- Full NPC persistence.
- Web Worker migration.
- Rendering/UI changes unrelated to existing `getCurrentActivity()`/dialogue compatibility.

## Performance Considerations

The effective schedule should be calculated once per NPC creation, not per frame.

`activityAt()` is already a small linear scan over a tiny role template. Do not optimize it prematurely or move it to a worker.

NPC update remains on the main thread because movement/Three.js state is main-thread-owned. Plan 055 already deliberately uses event-driven NPC decision changes rather than an additional 5 Hz decision loop.

Avoid:

- cloning schedules every `update()`;
- creating new `Place`/Vector3 objects every frame;
- repeatedly creating the same home/work action at every decision tick;
- introducing timers independent of the world clock.

The schedule overlay is pure data and tiny. No Web Worker is justified.

## Risks

### Duplicate scheduler

**Risk:** implementing an independent timer or per-NPC scheduler.

**Mitigation:** `timeOfDay` from `dayNight.ts` remains authoritative; `activityAt(effectiveSchedule, timeOfDay)` is the only schedule resolver.

### Duplicate FSM

**Risk:** adding `goEatScheduled`, `goHomeScheduled`, etc.

**Mitigation:** all executable movement/action work goes through the existing generic `goTo`/`execute`/`PlannedAction` path.

### Trait duplication

**Risk:** adding `hardworking` because the plan names it, even though `Trait` currently has `fast_worker`.

**Mitigation:** resolve this as an explicit plan/code discrepancy. Prefer the existing trait model for the smallest change.

### Social-place mismatch

**Risk:** sociable NPC tries to navigate to a social location that does not exist.

**Mitigation:** current runtime reports no social-place capability; overlay falls back to `home`. Do not create a new landmark just for this plan.

### Schedule/action mismatch

**Risk:** schedule changes while an action is running cause repeated path creation or cancellation.

**Mitigation:** schedule is evaluated only at existing decision points. Do not interrupt active actions for normal boundary changes.

### Need starvation

**Risk:** scheduled eat/home/sleep takes precedence over needs.

**Mitigation:** `pickNeed()` remains before schedule evaluation in `choose()`.

### Dialogue regression

**Risk:** `getCurrentActivity()` or `nextBoundary()` reads the base role schedule while runtime uses the effective schedule.

**Mitigation:** `NpcAgent.schedule` becomes the single runtime schedule source; presentation derives from it.

### Monolithic NpcAgent growth

`NpcAgent` is already large. Keep schedule transformation in `schedule.ts` and avoid adding large schedule-specific data tables or policy frameworks to the class.

## Verification Checklist

### Schedule data

- [ ] Base `SCHEDULE_TEMPLATES` are never mutated.
- [ ] Effective schedules are deterministic.
- [ ] All six roles produce valid effective schedules.
- [ ] Exact schedule boundaries still resolve correctly.
- [ ] Guard schedule still works across midnight.
- [ ] `nextBoundary()` remains correct for derived schedules.
- [ ] Combined traits do not create duplicate/conflicting schedule entries.

### Needs vs schedule

- [ ] Water need wins over scheduled sleep.
- [ ] Food need wins over scheduled sleep.
- [ ] Wood need wins over scheduled work/sleep where `pickNeed()` selects it.
- [ ] After need completion, NPC reevaluates the current effective schedule.
- [ ] Ordinary schedule changes do not cancel an active action.

### Activities

- [ ] Scheduled `eat` sends NPC to the existing food/garden destination.
- [ ] Scheduled `eat` uses the existing eat action/world effect.
- [ ] Scheduled `home` sends NPC home through generic movement.
- [ ] NPC remains around home during the home block rather than continuing random workplace wandering.
- [ ] `wake` does not create a redundant action/state machine.
- [ ] Scheduled work still uses `workplace` and generic `PlannedAction`.
- [ ] Scheduled sleep still uses existing `goSleep`/`sleep` flow.

### Traits

- [ ] `night_owl` changes the effective schedule deterministically.
- [ ] `night_owl` works correctly for guard's midnight-crossing schedule.
- [ ] The existing `fast_worker` execution-speed modifier still works independently of schedule logic.
- [ ] `sociable` does not cause navigation to a nonexistent social place.
- [ ] If a social place is supplied in a focused unit test, `sociable` produces the intended social block.
- [ ] Existing `energetic` stamina behaviour is unchanged.
- [ ] Existing `sociable` player-reaction behaviour is unchanged.

### Regression / autonomy

- [ ] Existing water/food/wood behaviour remains intact.
- [ ] Existing dialogue `getCurrentActivity()` output remains correct.
- [ ] Existing schedule boundary dialogue remains correct.
- [ ] Several NPCs can execute different scheduled activities concurrently.
- [ ] One sleeping NPC does not affect other NPCs.
- [ ] NPCs continue to simulate without player interaction.
- [ ] No rendering object is required by the schedule transformation.
- [ ] No per-frame schedule allocation/recalculation was introduced.

### Technical checks

Run the project's standard checks after implementation:

```text
npx tsc --noEmit
npm run lint
npm run build
npm run test
```

Passing these checks is not sufficient for gameplay verification; manual browser testing is required for the visible daily rhythm.

## Implementation Guidance for Claude Code

1. **Start from the current code, not the historical plan text.** `src/ai/schedule.ts`, `src/ai/NpcAgent.ts`, `src/ai/characters.ts`, `src/ai/Needs.ts`, `src/settlement/places.ts` and `src/settlement/createSettlement.ts` are the primary implementation surfaces.
2. **Do not recreate plan 020.** `Place`, `ScheduleTemplate`, `activityAt()`, `nextBoundary()`, workplace mapping and generic `goTo → execute` already exist.
3. **Do not create a new scheduler.** The world clock supplies `timeOfDay`; derive the active entry with `activityAt()`.
4. **Create the effective schedule as pure data.** Put the transformation in `src/ai/schedule.ts`, test it in `src/ai/schedule.test.ts`, and compute it once when creating `NpcAgent`.
5. **Treat `NpcAgent.schedule` as the runtime effective schedule.** This avoids having runtime decisions use one schedule while dialogue uses another.
6. **Resolve the `hardworking` discrepancy explicitly.** The canonical trait is currently `fast_worker`; do not silently extend `Trait` with a new value. Prefer the smallest compatible interpretation unless the plan is deliberately revised first.
7. **Do not add a social landmark.** `PlaceType.social` exists, but there is no current social-place assignment. Make the sociable overlay capability-aware and fall back to `home`.
8. **Scheduled `eat` must reuse the existing food action.** Find the current `eat` `NpcPlannedAction` construction/completion path in `NpcAgent.ts` and route scheduled eating through it instead of adding another hunger mutation.
9. **Scheduled `home` must reuse generic movement.** Do not add a home-specific phase. Ensure the action is not restarted repeatedly while the NPC is already at/homeward-bound.
10. **`wake` is a decision boundary.** Do not add a `wake` action unless implementation reveals a concrete player-visible effect that cannot be achieved by reevaluating `choose()`.
11. **Keep needs first.** The decision order must remain `pickNeed()` → schedule only when `idle`. Do not scatter priority checks across individual schedule branches.
12. **Do not interrupt active actions at schedule boundaries.** Reevaluate after the existing action completes. Critical interruption is future work.
13. **Keep plan 055's ownership boundaries.** Decision stays local to `NpcAgent`; actions use `PlannedAction`; world effects remain existing domain callbacks; rendering stays outside the simulation decision.
14. **Do not add workers.** This work is tiny deterministic data transformation and existing NPC movement remains main-thread/Three.js work.
15. **Keep tests data-oriented.** Most schedule/trait tests should not instantiate `NpcAgent` or Three.js. Focus on effective schedules, `activityAt()`, `nextBoundary()` and action-selection seams.
16. **After implementation, inspect all references to `NpcAgent.schedule`, `getScheduledActivity()`, `getCurrentActivity()` and `nextBoundary()`.** The common regression is leaving one consumer on the raw role template.
17. **Check the existing schedule comments.** `src/ai/schedule.ts` and `NpcAgent.ts` currently contain comments saying traits are deferred / schedules are uniform per role. Those comments become stale after 060 and should be updated as part of the touched code, without unrelated cleanup.
18. **Do not broaden scope into personality redesign.** Big Five and `nearestArchetype()` already exist. 060 only consumes the existing `traits` values.
19. **Verify the guard first when testing midnight logic.** It is the current schedule specifically designed to wrap through 00:00 and is the best regression detector for naive time shifting.
20. **If the desired `hardworking` semantics cannot be represented cleanly by `fast_worker`, stop and surface that as a plan decision rather than silently inventing a second trait system.**

The implementation should remain a small extension of the existing chain:

```text
timeOfDay
  ↓
base role schedule
  ↓
trait overlay (pure data, once per NPC)
  ↓
activityAt()
  ↓
pickNeed() arbitration
  ↓
existing NpcAgent FSM
  ↓
existing PlannedAction / sleep / movement
  ↓
existing world effects
```

That is the intended 060 architecture. The key constraint is that schedule personalization must strengthen the existing NPC simulation rather than becoming a parallel AI/scheduling system.
