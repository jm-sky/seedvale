# Plan 021 — Implementation Notes

**Plan:** `2026-08-07--021--npc-3-animal-life.md`
**Review date:** 2026-08-10
**Purpose:** implementation/review handoff for Claude Code. This plan is **already implemented at v1** in the current codebase; these notes describe the verified implementation, remaining verification work, known issue(s), and the boundary for future animal-life work.

## 1. Current repository reality

The original plan was written before repository access and has since been narrowed and implemented as `needs → wander bias`.

Current implementation:

- `src/fauna/AnimalLife.ts` exists and defines `AnimalLifeState` with exactly:
  - `hunger`
  - `thirst`
  - `energy`
- `AnimalAgent` owns one `readonly life: AnimalLifeState` alongside the existing shared `HealthState`.
- `AnimalAgent.update()` ticks animal life after predator/prey/environment behavior has established the current-frame `sprinting` flag.
- `hunger` and `thirst` influence wander radius/retarget frequency.
- low `energy` can extend idle time.
- elevated hunger/thirst are relieved when a wander cycle completes, representing abstract grazing/drinking without introducing world food/water objects.
- `AnimalLife.test.ts` covers state creation, need ticking, energy drain/regen and need relief.

The current code therefore already satisfies the intended v1 implementation direction. Claude should **not reimplement plan 021**.

## 2. Existing architecture to preserve

### AnimalAgent

`src/fauna/AnimalAgent.ts` remains the owner of per-animal runtime behavior:

```text
AnimalAgent
  ├── HealthState
  ├── AnimalLifeState
  ├── environmental danger
  ├── predator/prey behavior
  └── wander
```

Do not introduce an `AnimalLifeSystem`, `AnimalNeedsManager`, or second per-animal state container.

### AnimalLife

`src/fauna/AnimalLife.ts` is deliberately a small pure-data/pure-function module. Keep biological ticking here.

Current constants are centralized there:

- `HUNGER_RATE`
- `THIRST_RATE`
- `ENERGY_DRAIN_RATE`
- `ENERGY_REGEN_RATE`
- `ENERGY_REST_THRESHOLD`
- `BIAS_STRENGTH`
- `NEED_ELEVATED_THRESHOLD`
- `NEED_RELIEF_ON_ARRIVAL`

Do not move movement/AI decisions into this module. `AnimalLife` reports state; `AnimalAgent` decides how that state affects behavior.

### Health

`AnimalAgent.health` uses the shared `HealthState` through `src/fauna/faunaCombat.ts`, which re-exports `src/shared/HealthState.ts`.

Do not merge hunger/thirst/energy into HP or create another health model.

## 3. Important current implementation details

### Tick ordering

`AnimalAgent.update()` resets `sprinting`, executes environmental/predator/prey behavior, then calls:

```ts
tickAnimalLife(this.life, dt, this.sprinting)
```

This ordering is intentional: energy drain reflects whether the animal actually sprinted during the current update.

Do not move the tick before behavior selection unless the semantics are intentionally changed and tests are updated.

### Wander bias

`needWanderBias()` combines hunger and thirst into one pressure signal. Higher need:

- expands the wander radius;
- shortens the retarget timer.

This is intentionally an abstract behavioral signal, not pathfinding to a food/water source.

### No real food/water target yet

There is currently no generic fauna food/water query API. Settlement landmarks such as wells/gardens are not a fauna resource system.

Do not add one as part of plan 021 retroactively.

When actual feeding/drinking locations are introduced later, replace/extend the abstract relief mechanism through a real world-resource interaction rather than adding a second parallel needs system.

## 4. Review finding: current rest behavior needs verification/fix

The intended v1 behavior says low-energy animals may extend idle instead of selecting a new wander target.

Current `wander()` sets `restInstead` and extends `wanderTimer`, but `steerToward(this.target, ...)` still runs afterward. If an old target is sufficiently far away, the animal can continue moving despite the rest decision.

Before marking plan 021 fully verified, inspect this behavior and make the smallest correction necessary so that `restInstead` genuinely means "stay put" for that update/cycle.

Preferred semantics:

```text
low energy + rest roll succeeds
    → remain stationary
    → extend idle timer
    → no steering toward the previous wander target
```

Do not introduce a new rest FSM just to fix this.

## 5. Review finding: need relief semantics

Current `relieveElevatedNeeds(this.life)` is called when either the wander timer expires **or** the animal has arrived at its target.

The original intent was relief on arrival. Calling it merely because a timer expired can represent an abstract feeding/drinking event without arrival, which is acceptable only if that abstraction is explicitly desired.

For v1, keep the implementation simple, but verify the intended semantics before changing it. If correction is desired, only relieve needs on actual arrival, while allowing timer expiry to select another target without automatically satisfying the need.

This is a gameplay tuning decision, not a reason to redesign `AnimalLife`.

## 6. Testing status

`src/fauna/AnimalLife.test.ts` already covers:

1. per-instance hunger/thirst phase offset;
2. hunger/thirst increase and clamping;
3. energy drain during sprint;
4. energy regeneration outside sprint;
5. elevated-need relief;
6. relief not going below zero.

Additional focused tests are useful for the two review findings above, especially if `wander()` behavior is extracted into a pure helper. Avoid trying to unit-test the entire Three.js `AnimalAgent` class if the behavior can be verified through small pure functions.

Browser/manual verification is still required because plan 021 is currently `verification needed`.

## 7. Relationship to other plans

### 010 — Predator/prey

Already provides the predator/prey movement and attack loop. Plan 021 should remain a state/behavior extension, not replace that system.

### 042 — Fauna player awareness

`src/fauna/playerAwareness.ts` is a pure perception function. It answers whether the player is noticed; it should not consume hunger or decide whether to attack/flee.

This separation is important for plan 056.

### 044 — Village interaction / animal behavior

Current `AnimalAgent` already contains village avoidance/flee-bias and loaded village context. Do not duplicate this context in `AnimalLife`.

### 045 — Health/Stamina/Threat

This is future shared domain infrastructure. The current `AnimalLife.energy` is **not** the same thing as the future shared stamina system. Do not prematurely replace it while implementing plan 021.

When 045 is implemented, decide explicitly whether animal energy should become a consumer/alias of shared stamina. Do not silently create two competing stamina concepts.

### 055 — Shared Simulation Architecture

Plan 055 is the future architectural direction:

```text
needs + perception → decision → action → world effect
```

Plan 021 should be considered an existing concrete example of the `needs` layer, not a reason to create a new generic AI framework immediately.

### 056 — Hungry Predator

Plan 056 should consume the existing `AnimalLifeState.hunger`. It should not add another hunger model.

## 8. Future scope explicitly deferred

Do not add these while finishing/verifying v1:

- age/lifecycle simulation;
- mood/personality;
- animal memory;
- full daily schedules per species;
- real food/water seeking;
- population-level persistence;
- pack coordination;
- generalized animal utility AI;
- LLM decisions.

These can be introduced when another concrete gameplay system needs them.

## 9. Recommended verification sequence

1. Run `npm run test` and confirm `AnimalLife.test.ts` remains green.
2. Run `npx tsc --noEmit`, `npm run lint`, and `npm run build`.
3. Fix/verify the low-energy rest behavior without adding a new FSM.
4. Verify hunger/thirst wander bias visually in the browser.
5. Verify sprinting drains energy and normal movement/idle regenerates it.
6. Verify needs do not create synchronized behavior across animals.
7. Keep plan status `verification needed` until browser behavior is confirmed.

## 10. Key conclusion for Claude

**Plan 021 is not a greenfield implementation task anymore.** The v1 needs layer is already present in `AnimalLife.ts` and `AnimalAgent.ts`. The correct next step is focused verification and correction of the small behavior semantics noted above.

For future work, extend the existing seams. In particular, plan 056 should use `life.hunger` as input to a predator decision and should not introduce a parallel hunger, threat, or AI system.
