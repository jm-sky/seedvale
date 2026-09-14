# Implementation notes: fauna-028 — AnimalAgent importance/cadence

**Implemented:** 2026-09-14 · plan: [fauna-028](../fauna-028-animal-agent-update-cadence.md)

Recon-level findings that a future agent would otherwise have to rediscover, plus the two places the implementation deviates from the plan.

## Where the cost actually is

Guessing "AI search is expensive" is wrong here and the benchmark says so directly.

- `nearest scans: 38.2/frame (523.2 candidates checked/frame)` — the whole prey/threat candidate scanning is microseconds. Throttling *search* buys nothing.
- The cost of `behaviour` is `steerToward()` → `stepWithSlopeAndCollision()` (`src/terrain/slopeConstraint.ts`): one `sampleSlope` (several `sampleHeight`) plus up to three `isWalkable()` calls, each of which does a `sampleLocalWater()` and iterates `collidersNear()`. That is ~5 height samples + 3 water samples + 3 collider queries per moving animal per frame. Reducing the *step count* is the only lever that moves this number.
- The cost of `life/presentation` is `AnimationMixer.update()` + `labelController.sync()` (`src/ui/agentStatusLabel.ts`, which re-formats an assessment string every call) + `snapY()`/`resolveWaterTraversal()` (two more `sampleLocalWater()` and a `sampleHeight()`).

So the split had to separate *movement* from *needs/timers*, not just "gameplay" from "rendering".

## Section ownership after the split

`tickPresentationAndLife()` is gone; three methods replace it.

| Method | Runs | Contains |
|---|---|---|
| `tickLife(dt, hungerThirstRate, nowDays)` | every tick, real `dt` | timer decrements, `advanceAge`, `tickProduction`, `tickWoolProduction`, `tickDrowning`, `tickAnimalLife` |
| `tickMovementTail()` | exactly when the behaviour section ran | `snapY()`, `resolveWaterTraversal()` |
| `tickPresentation(dt, observerPos, playerObservation)` | presentation cadence, accumulated `dt` | `updateAnim()`, `labelController.sync()`, `anim.update()` |

`driveMounted()` calls all three unconditionally and zeroes both accumulators — a ridden mount is `immediate` by construction and never goes through `update()`'s gate at all.

**Call-order equivalence is deliberate and load-bearing.** In `update()` the order is
`behaviour → clampBounds → tickMovementTail → tickLife → tickPresentation`, which reproduces the old
`snapY → resolveWaterTraversal → tickDrowning → tickAnimalLife → label → mixer` sequence exactly on any tick where everything runs. The one moved call is `updateAnim()` (was between `snapY` and `resolveWaterTraversal`, now first in `tickPresentation`); it only reads `moving`/`sprinting`/anim timers, so nothing depends on its position.

## Non-obvious correctness points

1. **`moving`/`sprinting` must not be reset outside the behaviour gate.** They used to be zeroed at the top of `update()`. They are now zeroed inside `if (runBehaviour)`. Without that, a throttled animal reports `moving: false` to `updateAnim()` (idle-clip flicker) *and* `sprinting: false` to `tickLife()`'s stamina/metabolism bookkeeping. Keeping the last resolved value is the correct reading: the animal genuinely is still walking/sprinting.

2. **Decision runs at full rate, behaviour does not.** `senseEnvironment` + targeting + `decideFaunaBehaviour` are 0.2 ms/frame combined — leaving them full-rate is what makes `isFaunaHighPriorityBranch(branch)` *this tick's* answer, so nothing can react a tick late to entering combat. The cadence gate is placed strictly between branch selection and branch execution.

3. **`clampBounds()` moved inside the gate.** It only ever changes the position after movement, so gating it is a no-op in behaviour terms — but leaving it outside would let it relocate an animal on a tick where `snapY()` does not run.

4. **`threateningHuman` is sticky across a throttled tick.** That is safe only because `threateningHuman` is itself an `engaged` signal: the moment it becomes true the animal is `immediate`, so the branch bodies that clear it always get to run.

5. **`tickMovementTail()` is timed into `faunaLifePresentationMs`, not `faunaBehaviourMs`.** `snapY()` lived in the life/presentation span before the split; keeping it there is what makes the benchmark's `behaviour` vs `life/presentation` numbers comparable across this change. Do not "tidy" it into the behaviour span without re-baselining.

6. **Cadence is seconds, not frames.** Once `dt >= interval` (a slow frame) every gate passes, so the throttling self-disables under load and the maximum extra movement quantum is bounded by the interval rather than by frame rate. This is also why `AnimalAgent.test.ts`'s pre-existing tests (all `dt >= 0.2`) were unaffected: no gate can close at that step size. Any new test that wants to observe throttling must drive `dt = 1/60`.

7. **Phase spread lives in the interval, not in the accumulator.** Seeding the accumulators with a phase only staggers the *first* flush — after that everyone resets to 0 and re-synchronises. `animalBehaviourIntervalSec`/`animalPresentationIntervalSec` take a `phase01` and shorten the interval by up to 30 % instead, which is permanent. It only ever shortens, so `MAX_THROTTLED_STEP_M` still holds. Both accumulators are primed to `CADENCE_PRIME_SEC` (1 s) in the constructor *and* in `hydrate()`, so a fresh/restored agent runs everything on its first tick.

## Deviation from plan

- The plan describes seeding the accumulators with the per-agent phase. That turned out to only stagger the first flush (see point 7); the phase was moved into the interval instead. `animalCadencePhase01` is unchanged.
- The plan did not mention `src/perf/report.ts`. `formatReport()` had stopped emitting the `[Seedvale Agent CPU]` block entirely (the `formatAgentCpuReport` import was dead, and `report.test.ts` was failing on `main` because of it). Restored, because the whole before/after comparison this plan asks for is read out of that block. Unrelated regression, fixed in passing.

## Measured effect (unit-level, not a browser benchmark)

A far, idle wild deer driven for 600 frames at 1/60 s: **150 movement steps** (was 600) and **120 mixer updates** (was 600) — behaviour ~4× less often, presentation ~5× less often, with hunger/thirst/timers bit-identical to an ungated run over the same simulated time.

## Telemetry contract

`agentCpuDiag` gained `recordAnimalCadence(fullRate)`, `recordAnimalBehaviourExecution()` and `recordAnimalPresentationExecution()`. All three route through `addCadenceCount`, the same livestock-channel-vs-fauna-channel owner rule `addSectionMs` uses, so one `update()` is never counted into both reports. `recordFaunaExpensiveBehaviourAgent()` now fires at *execution* time rather than classification time — before cadence existed those were the same tick, so historical numbers remain comparable.
