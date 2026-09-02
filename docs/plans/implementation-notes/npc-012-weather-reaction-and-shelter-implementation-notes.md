# Implementation Notes: NPC Weather Reaction & Shelter

**Plan:** `npc-012-weather-reaction-and-shelter.md`
**Reviewed:** 2026-09-01
**Status:** implemented — verification needed 🔍

## Recon verdict

The plan fits the existing NPC architecture, but the current pressure/strategy types are still **Need-specific**. Weather cannot be added cleanly as another `NeedId` without violating the plan.

The implementation should extend the existing decision seam to support a small set of non-Need decision targets, with `seekShelter` as the first one. Do not create a second AI arbitration system.

## Current-code findings

- **`src/ai/NpcAgent.ts` is the central owner of the decision/action lifecycle.** In `update()`, `phase === 'choose'` currently does:
  1. `generateNeedPressures()`
  2. `scoreNeedCandidates()`
  3. `pickActionKind()`
  4. `beginNeed()`.
- **`src/ai/Needs.ts` is currently Need-specific.** `NpcPressure.target` is `NeedId`, and `pickFromPressures()` returns `NeedId`. Keep the existing physiological pressure generation intact where possible; add the smallest generic decision layer above it rather than turning `NeedId` into a fake weather need.
- **`src/ai/decisionModifiers.ts` is also Need-specific.** Personality/role modifiers map `NeedId → ScoredNeedCandidate`. Weather should not gain personality modifiers unless there is an existing meaningful trait extension; the plan explicitly excludes new weather traits.
- **`src/ai/npcStrategies.ts` is the existing strategy seam.** It currently contains only need-oriented strategies. Add a small `seekShelter` strategy/candidate path rather than a new shelter FSM.
- **`src/ai/npcPlan.ts` maps only Needs to persistent Goals.** Weather sheltering is situational, not one of the current persistent Goals. Do not add a long-lived shelter Goal merely to make the types fit; an interruption caused by weather should return to the normal decision flow after the shelter action.
- **Critical interruption already exists.** `NpcAgent.tickCriticalInterrupt()` runs only during `goTo`/`execute`, is throttled to 1 sim-second, and currently uses `pickNeed(..., { critical: true })`. `interruptCurrentAction()` already performs the complete cleanup and returns to `choose`.
- The current critical interrupt deliberately ignores interruptions when `activeNeed !== 'idle'` to avoid need-vs-need thrashing. Preserve that behaviour for weather: weather should primarily pre-empt low-priority/schedule-driven work, not an already active physiological need.
- **Movement is already generic.** `startAction()` creates the shared `ActionLifecycle`, then `goTo → execute` handles movement, queues, watchdog/repath and completion. Shelter must use this path.
- **Home is already a `Place` at the construction boundary.** `src/settlement/places.ts` defines `PlaceType = 'home' | 'workplace' | 'food' | 'social'`. `NpcAgent.create()` receives the home Place, but the agent currently stores only `home.position.clone()` as `this.home`. Avoid replacing the existing vector usages; if a generic shelter resolver needs the Place identity, retain the original Place as a small additional readonly field.
- **Home movement already has a safe approach path.** `beginGoSleep()` → `prepareSleepDestination()` → `applyRimDestination()` is the established way to approach a house. A shelter action should reuse the same rim handling rather than walking to the collider centre.
- **Weather is already a first-class world state.** `src/world/weather.ts` exposes `WeatherState` and `computeClimate()`; `createApp.ts` creates a `ClimateState`; `gameLoop.ts` already calls `tickClimate()` and has the current `climate.weather` before NPC simulation.
- **Do not recompute weather per NPC.** The current game loop already owns the live weather value. The clean integration is to pass `WeatherState` through `SettlementsManager.update()` → `Settlement.update()` → `NpcAgent.update()`. This is cheaper and avoids giving NPCs knowledge of world seed/climate calculation.
- Weather is deterministic and not persisted. Do not add weather/shelter state to `NpcAuthoritativeState` or `SaveData`.

## Architecture decisions

### 1. Keep Needs and Weather as separate pressure producers

Prefer:

```
Need pressures ─┐
Weather pressure ├→ one decision arbitration → target
                ┘
```

A useful small type boundary is a generic decision target such as:

```
type NpcDecisionTarget = NeedId | 'seekShelter'
```

The exact type/module is implementation detail, but the invariant matters: `weather` is a pressure source, not a Need.

Keep `Needs.ts` focused on need meters and their existing tests. Avoid turning it into a world-condition registry.

### 2. Weather pressure should be pure

A small pure helper in `src/ai/` is preferable, e.g. conceptually `weatherPressure.ts`, taking only `WeatherState` and returning either a zero/absent pressure or a shelter pressure.

Use:
- `rain` intensity,
- `snow` intensity,
- `temperature` only for genuinely cold conditions.

Do not model exposure duration, body temperature, clothing, shelter quality or accumulation. The plan explicitly excludes them.

Recommended qualitative tuning:
- clear/cloudy/fog → no shelter pressure;
- light rain → below/around idle pressure;
- stronger rain → meaningful shelter pressure;
- snow → generally stronger than light rain;
- very low temperature → additive or independent pressure only when genuinely cold.

Keep the score bounded and deterministic. Exact constants should be tuned against the existing need scores, not copied from an imagined model.

### 3. Do not put weather into personality modifiers

`scoreNeedCandidates()` currently modifies already-active Need candidates. Weather should not be routed through conscientiousness/role bonuses and should not add `weatherSensitive` traits.

If a generic decision candidate type is introduced, leave weather's base score unmodified in this plan.

### 4. Shelter strategy is situational, not a persistent Plan

Do not add `secureShelter` to `NpcGoalId` unless implementation discovers a real persistence requirement.

The intended lifecycle is:

```
weather pressure
 → seekShelter strategy
 → resolve home Place
 → existing goTo/execute
 → weather remains active → next choose selects shelter again / remains at home
 → weather clears → normal schedule/needs
```

The existing `NpcPlan` should not retain a stale weather intention across normal interruptions.

### 5. Shelter action should be a normal PlannedAction

There is currently no shelter-specific ActionId. A minimal new action kind is acceptable if needed for diagnostics/trace, but do not create a new phase/FSM.

The action should:
- target the NPC's own home Place/rim,
- use `startAction()`,
- have no meaningful world mutation on completion,
- return to `choose`.

Avoid reusing `goSleep`/sleep semantics: weather sheltering is not sleeping and should not change `sleepReason`, schedule, hunger/thirst rates or sleep lifecycle.

### 6. Staying home under persistent pressure

Do not add a `shelter` phase.

After reaching home, the NPC can remain stationary through an ordinary idle/shelter action or a lightweight shelter-specific state only if the existing lifecycle genuinely needs it. Prefer the smallest option that prevents immediate wander-away/replanning every choose cycle.

A pure decision rule should make `seekShelter` resolve to home when the NPC is outside and otherwise produce no movement when already sufficiently close to home.

Avoid repeatedly creating a zero-distance `goTo` action.

### 7. Critical interrupt integration

Extend the existing critical-interrupt decision rather than adding a second timer.

The current method:
- ticks every frame but evaluates only every 1 sim-second;
- gives vigor collapse unconditional priority;
- skips ordinary need arbitration when `activeNeed !== 'idle'`.

Weather should follow the same boundary. A sufficiently severe weather pressure may interrupt a schedule/work action when `activeNeed === 'idle'`.

For arbitration, preserve the existing invariant that genuinely critical physiological needs can beat weather. Do not let weather become an unconditional top-priority interrupt.

## Important integration details

### Weather plumbing

Current path:

```
gameLoop.ts
  climate.weather
    ↓
SettlementsManager.update(...)
    ↓
Settlement.update(...)
    ↓
NpcAgent.update(...)
```

Add only `WeatherState` to this existing data flow. Do not pass `ClimateState`, world seed, renderer state or weather particle state into NPCs.

Because weather changes only at the climate cycle boundary, the same `WeatherState` can be shared by all NPCs for a frame.

### Home Place

The current `NpcAgent` has:
- constructor input: `home: Place`;
- runtime field: `this.home: THREE.Vector3`.

If the implementation needs a generic resolver, retain the Place as e.g. `homePlace` while keeping `this.home` as the existing movement anchor. Do not rewrite dozens of current home-position call sites just to satisfy the new resolver.

Use the existing `applyRimDestination()` / `prepareSleepDestination()` semantics so house colliders remain respected.

### Schedule

`src/ai/schedule.ts` already supplies schedule context. Do not add `shelter` to `ScheduleActivity`.

Weather pressure should be evaluated alongside the current schedule/need decision, not encoded into schedule templates.

### Off-screen / performance

NPC simulation is already ticked through loaded settlements and is independent of camera/render distance within that simulation boundary. Weather evaluation should occur only at the existing decision cadence.

Do not:
- scan all NPCs from a global weather system,
- add a per-NPC weather timer,
- query terrain/weather particles,
- create `WeatherAI` or `ShelterSystem`.

## Plan / code discrepancy to resolve during implementation

The plan says “generic strategy → resolver → home Place”, but current strategy typing is explicitly need-oriented and current `NpcPlan` is Need/Goal-oriented. This is the main architectural seam that needs a deliberate small extension.

Do **not** solve it by:
- adding `weather` to `NeedId`,
- creating a second decision/arbitration engine,
- adding a parallel shelter FSM,
- adding a persistent weather Goal.

Prefer one generic decision-target layer shared by existing need pressures and the new weather pressure, while keeping the existing Need/Strategy/Plan modules otherwise narrow.

## Testing / verification targets

Existing pure tests provide good seams:
- `src/ai/Needs.test.ts` — existing pressure/arbitration contract;
- `src/ai/npcStrategies.test.ts` — strategy candidate ordering/selection;
- `src/world/weather.test.ts` — deterministic WeatherState generation.

Add focused pure tests for:
- clear/cloudy/fog → no shelter pressure;
- rain/snow intensity mapping;
- very low temperature threshold;
- weather pressure competes correctly with idle/need pressures;
- critical physiological pressure still wins when appropriate;
- shelter strategy resolves to home;
- already-at-home shelter does not start a pointless movement action.

If generic pressure types are changed, update existing Need tests without weakening their current semantics.

## Main pitfalls

- Treating weather as a `NeedId` would leak world conditions into physiological state and break the plan's architecture.
- Recomputing `computeWeather()` for every NPC would duplicate work already done by `gameLoop.ts`.
- Reusing `goSleep` would incorrectly couple sheltering to sleep/vigor/schedule semantics.
- Teleporting home would bypass the existing movement/watchdog/repath/collider pipeline.
- Adding a persistent shelter state/Goal would make a temporary environmental pressure unnecessarily authoritative.
- Letting weather interrupt an already active need action would reintroduce the exact action-thrashing problem the current `activeNeed === 'idle'` critical-interrupt guard prevents.
- A severe-weather action that completes at home must not immediately cause the NPC to wander away while the pressure remains active.
- Do not add persistence: current weather is derived from seed + elapsed world time and NPC runtime state is not full-save persistent.

## Suggested implementation order

1. Add a pure weather-pressure helper and tests.
2. Introduce the smallest generic decision-target/pressure seam needed to combine weather with existing Need pressures.
3. Thread the existing `WeatherState` from `gameLoop.ts` through `SettlementsManager`/settlement into `NpcAgent.update()`.
4. Add the `seekShelter` strategy and home resolver using the existing Place/movement pipeline.
5. Integrate weather into normal choose arbitration.
6. Integrate severe-weather interruption into the existing throttled critical-interrupt path.
7. Ensure persistent bad weather keeps NPCs at home without creating a shelter FSM.
8. Add focused tests and update diagnostics only if the new generic decision target is otherwise invisible.
9. Run targeted typecheck/tests/build; browser verification remains manual per project workflow.

**Zrób git commit i push do main, rebase jeżeli trzeba**
