# Plan 092 — Implementation Notes

**Plan:** `2026-08-13--092--npc-stamina-and-daily-vigor.md`
**Review date:** 2026-08-13
**Dependency order:** `094 → 092 → 071 → 069`
**Verdict:** **Approve with implementation adjustments.**

## 1. Review

The plan fits the current architecture. The main adjustment is to treat vigor as a small physiological state owned by `NpcAgent`, not as another need, scheduler or AI system.

The current code already has the required separation:

```text
HealthState   → HP / death
StaminaState  → short-term effort
VigorState    → daily physiological budget
NpcAgent      → needs + schedule + existing FSM/action execution
```

`StaminaState` is already a small mutable domain type with create/drain/restore/exhaustion helpers, and NPC contract tests explicitly guarantee that stamina exhaustion does not affect HP. Plan 092 should not change stamina semantics.

`NpcAgent` already owns needs, schedule, FSM phase, pending action and movement. Scheduled `sleep` is already executable. Therefore forced sleep should reuse the existing FSM rather than introducing a second sleep mechanism.

## 2. Dependency on 094

Plan 094 is being implemented immediately before 092. That is a good order.

092 should **not** modify fauna. After 094 the intended split remains:

```text
NPC   → Health + Stamina + Vigor
Fauna → Health + Stamina + Hunger + Thirst
```

Do not generalize daily vigor across fauna merely because both NPCs and animals use `StaminaState`. Extract a shared abstraction only if a later plan actually needs it.

## 3. Naming

Use **`VigorState`** in code.

Mirror `StaminaState`:

```ts
export type VigorState = {
  max: number
  current: number
}

createVigorState(max)
drainVigor(vigor, amount)
restoreVigor(vigor, amount)
isCollapsed(vigor)
getVigorRatio(vigor)
```

Use positive-pool semantics. Avoid storing `fatigue`, because that reverses the semantics and makes the distinction from stamina harder to understand.

## 4. Ownership

Put `VigorState` on `NpcAgent`, alongside `health` and `stamina`.

Do **not** put vigor into `Needs.ts`.

Needs answer **what should the NPC do?** Vigor answers **whether the NPC can continue the day's effort**.

```text
Needs → motivation / action selection
Vigor → physiological capacity / sleep gate
```

This distinction is useful for the later `071 → 069` economy work because work can consume daily capacity without becoming a new need.

## 5. No second FSM / scheduler

The draft is correct here and this is the most important architectural constraint.

Do not create:

- `VigorManager`;
- `DailyEnergySystem`;
- another scheduler;
- another need loop;
- another sleep state machine.

The existing `NpcAgent` phases (`choose`, `goTo`, `execute`, `goSleep`, `sleep`, etc.) remain authoritative.

Forced sleep should be an existing-FSM decision:

```text
NpcAgent.update()
  → existing decision/action lifecycle
  → vigor collapse detected
  → interrupt current normal action
  → existing sleep path
```

## 6. Stamina vs vigor

Keep the distinction explicit.

### Stamina
Short burst capacity. It may drain during work/effort and recover during ordinary rest.

### Vigor
Daily budget. It should drain from meaningful daily stress/effort and recover mainly through sleep.

Do **not** make every stamina drain also drain vigor. That would effectively recreate the old single-fatigue model.

## 7. Vigor drain: event/effort based

Avoid a permanent generic `vigor -= dt * rate` loop in v1.

Use explicit domain events/actions:

```text
heavy work / physical effort → drainVigor(...)
strong panic / major stress   → drainVigor(...)
actual damage                 → drainVigor(...)
```

This keeps tuning understandable and avoids another continuous simulation cost.

A small baseline daily drain can be considered later, but should not be required for the first implementation.

## 8. Work integration

The current `NpcAgent` already has a generic action lifecycle and stamina effort handling. Extend the existing **physical work/effort path** to drain vigor.

Do not blindly drain vigor for every `execute` phase. Eating, drinking and lightweight interactions should not consume the same daily budget as chopping wood or other hard work.

Keep constants local and explicit, e.g.:

```text
WORK_VIGOR_COST
STRESS_VIGOR_COST
DAMAGE_VIGOR_COST
```

Exact values should be tuned in-browser rather than over-specified in code comments.

## 9. Damage integration

Keep `HealthState` combat-agnostic. Do not add vigor to `damageHealth()`.

NPC-specific damage handling should conceptually be:

```text
damage NPC
  ↓
damageHealth(npc.health, amount)
  ↓
drainVigor(npc.vigor, DAMAGE_VIGOR_COST)
```

This preserves the shared health model used by NPCs, player and fauna.

## 10. Stress / panic

Do not build a generic stress subsystem for 092.

If the existing NPC behaviour has a clear major panic/threat transition, drain vigor once when that meaningful event occurs. Do not drain vigor every frame merely because a threat remains nearby.

Preferred v1 semantics:

```text
enter strong panic / major threat → one vigor cost
continued flee movement           → stamina only
```

If there is no clean existing event seam, leave stress drain as a documented follow-up rather than creating a new event architecture solely for this plan.

## 11. Forced sleep threshold

Use a clearly named collapse threshold, e.g. `VIGOR_COLLAPSE_THRESHOLD`.

The important behaviour is:

```text
normal vigor → normal behaviour
low vigor    → may continue
collapsed    → normal work/action is no longer allowed
```

Do not require an exact zero if that makes the NPC continue one more full work action. After an action drains vigor below the collapse threshold, the next decision should immediately request sleep.

A second pre-collapse warning threshold can be added only if tuning needs it; it is not necessary for v1.

## 12. Forced sleep must reuse existing sleep

Use the existing `goSleep` / `sleep` machinery.

Conceptually:

```text
vigor collapsed
  ↓
request existing sleep path
  ↓
goSleep / sleep
  ↓
restore vigor according to elapsed sleep time
  ↓
restore stamina through existing sleep/rest semantics
  ↓
choose again
```

Do not add a parallel `forcedSleep` FSM phase unless the current implementation genuinely requires a diagnostic marker. A reason/flag is preferable.

## 13. Where to sleep

For v1:

1. If the NPC is reasonably close to home and the existing sleep destination is usable, use the normal home/sleep route.
2. Otherwise allow the existing sleep path to start at the current valid location rather than inventing a new safety/pathfinding system.

The gameplay requirement is that the NPC visibly stops working and sleeps. Perfect bed-finding is a later concern.

## 14. Sleep recovery

Do **not** refill vigor instantly on entering `sleep`.

Sleep duration must matter. Recovery should use the existing game-time/sleep/time-skip semantics:

```text
elapsed sleep game-hours × recovery rate
→ restoreVigor(...)
```

If sleep currently resolves a time skip discretely, add vigor recovery to that same time-skip result. Do not create another clock or catch-up loop.

## 15. Plan 075 / time skip

Plan 075 already defines the direction for NPC catch-up during time skips. 092 must integrate into that mechanism.

For existing `resolveTimeSkip`/catch-up logic:

- apply the same vigor drain rules where the simulated action would normally drain vigor;
- apply sleep recovery using the same elapsed game-time semantics;
- preserve the existing schedule and need arbitration;
- avoid a separate `updateVigorForTimeSkip()` simulation loop.

The key principle is **one simulation rule, two execution contexts**, not two implementations of the rule.

## 16. Arbitration with needs and schedule

Vigor is a **gate**, not another `NeedId`.

Recommended high-level priority:

```text
existing critical/threat handling
        ↓
collapsed vigor → sleep
        ↓
existing pickNeed()
        ↓
existing schedule
```

Do not let food/water/wood repeatedly win against physiological collapse.

At the same time, do not interrupt an action that the existing FSM explicitly treats as non-interruptible. The implementation should use the same lifecycle rules already used elsewhere rather than inventing a universal cancellation mechanism.

## 17. Schedule interaction

Scheduled sleep remains the normal sleep source.

Vigor adds a physiological source:

```text
schedule says sleep → existing sleep
vigor says collapse → existing sleep
```

Do not modify `effectiveScheduleFor()` or schedule templates just to support vigor.

`night_owl` continues to use the existing effective schedule. If vigor collapses, physiological sleep may override the normal work schedule as intended.

## 18. Traits

Do not add new traits in v1.

The existing `energetic` trait already modifies stamina fatigue/rest rates. Do not automatically make it modify vigor as well; that would introduce stacked hidden multipliers before the new resource is tuned.

Trait modifiers can be added later if they prove valuable.

## 19. Persistence

First inspect the actual NPC persistence model.

If NPC physiological state is already persisted, add vigor beside existing health/stamina using the existing save schema/version mechanism.

If NPC runtime state is regenerated and not persisted, initialize vigor full and explicitly leave persistence outside 092 rather than creating a large save feature just for this resource.

## 20. Expected files

Likely:

```text
src/shared/VigorState.ts
src/shared/VigorState.test.ts
src/ai/NpcAgent.ts
src/ai/npcVigor.test.ts
```

Potentially the existing time-skip/sleep implementation and save files, but only where current contracts require it.

Avoid modifying `HealthState.ts`, `StaminaState.ts`, `Needs.ts` or `schedule.ts` unless implementation reveals a genuine contract issue.

## 21. Tests

`VigorState.test.ts` should mirror the existing `StaminaState.test.ts`:

- starts full;
- drains correctly;
- clamps at zero;
- ignores non-positive amounts;
- restores correctly;
- clamps at max;
- collapse predicate is deterministic;
- ratio is current/max.

NPC contract tests should cover:

- work drains vigor;
- stamina and vigor remain independent;
- damage drains vigor but HP still controls death;
- zero/low vigor does not kill the NPC;
- sleep restores vigor;
- ordinary rest can restore stamina without bypassing vigor's sleep-based recovery;
- collapsed vigor causes sleep while schedule says `work`;
- idle/wander does not rapidly consume vigor;
- scheduled sleep remains unchanged.

Prefer pure state/decision tests over Three.js movement tests where possible.

## 22. Tuning

The exact numbers should be tuned in-browser. The important relationship is:

```text
normal work block → noticeable but non-catastrophic vigor loss
several work blocks / major stress → eventually requires sleep
ordinary idle/rest → stamina recovery, little/no vigor recovery
sleep → meaningful vigor recovery
```

Vigor should model a daily limit, not become a second stamina bar that empties repeatedly during normal play.

## 23. Verification

Run:

```text
npm run test
npx tsc --noEmit
npm run lint
npm run build
```

Browser verification:

- observe a normal NPC through work → sleep;
- verify work changes stamina and vigor independently;
- verify stamina recovers during ordinary rest;
- verify vigor does not drain rapidly during idle/wander;
- injure an NPC and confirm HP/vigor are independent;
- bring an NPC to the collapse threshold and verify it visibly stops working and sleeps;
- verify no second scheduler/FSM appears;
- verify scheduled sleep still works;
- verify `night_owl` behaviour remains intact;
- verify fauna behaviour from 094 is unchanged;
- test a long time skip and confirm vigor follows the same catch-up semantics.

## 24. Final architecture

```text
HealthState ───────────────→ HP / death

StaminaState ──────────────→ short-term effort

VigorState ────────────────→ daily capacity / sleep gate
                                  │
Needs ────────────────→ NpcAgent decision
                                  │
Schedule ──────────────→ existing FSM
                                  │
                    ┌─────────────┴─────────────┐
                    ↓                           ↓
                 work/effort                  sleep
                    ↓                           ↓
              stamina + vigor             restore vigor
```

**Key rule:** `VigorState` is a physiological resource used by the existing NPC decision/FSM. It is not a new AI system. Sleep remains the existing action; vigor only adds the additional reason for entering it.