# Implementation Notes: Player Physical Effort — Stamina & Vigor

**Plan:** `items-player-003-player-physical-effort-stamina-vigor.md`
**Verified:** 2026-09-01

## Current code — important discrepancies

- `src/player/PlayerNeeds.ts` already owns the player pools and tuning:
  - Stamina sprint drain: `20/s`
  - Stamina regen: `12/s`
  - `BUSY_ACTION_STAMINA_COST_PER_SEC = 6`
  - Vigor idle drain: `1/game-day`
  - movement Vigor: `100/game-day` extra for walking, `1.5×` for sprint.
- `src/player/PlayerController.ts` calls `tickPlayerStamina()` and `tickPlayerMovementVigor()` inside `update()`. `gameLoop.ts` calls `tickPlayerNeeds()` separately with `worldDt`.
- `src/app/busyAction.ts` already supports `staminaCostPerSec` and drains through a callback; it must not gain ownership of PlayerNeeds.
- `src/app/createApp.ts` wires BusyAction to `drainStamina(player.needs.stamina, amount)`.
- The existing 6/s BusyAction cost is already used by terrain dig/level/mound and player-well work. Other BusyActions generally do not opt in.

### Confirmed Stamina bug

`gameLoop.ts` ticks `busy.tick(dt)` before `player.update(dt, ...)`. BusyAction therefore drains 6/s, but the busy channel also clears movement input and `PlayerController.update()` then calls `tickPlayerStamina(..., sprinting=false)`, restoring 12/s.

Do not add another drain to compensate. Fix the recovery gate so normal Stamina regeneration is suppressed while physical work is active. Keep `BUSY_ACTION_STAMINA_COST_PER_SEC = 6` unless playtesting proves otherwise.

## Recommended architecture

Keep `PlayerNeeds` as the only owner of Stamina/Vigor mutation and tuning. Do not create a fatigue system or per-action drain logic.

Introduce one small shared physical-effort seam owned by `PlayerNeeds` (or a very small player-domain helper next to it):

- effort intensity/profile: light, moderate, heavy;
- Stamina component;
- Vigor component;
- helper to apply effort for a represented duration/progress delta.

Actions should select a profile and represented work duration; they should not call `drainStamina()`/`drainVigor()` directly.

For BusyAction, keep the existing `staminaCostPerSec` mechanism or generalize its options minimally. The Vigor rate can be derived from the selected effort profile and the represented duration, then applied proportionally to actual channel progress. This preserves correct cancellation behaviour.

For simulated work, do **not** convert terrain preparation to BusyAction just to reuse the mechanism.

## Stamina recovery gate

The cleanest seam is to let `PlayerController.update()` know whether normal Stamina recovery is currently allowed, e.g. an additional boolean/accessor. Apply it to all existing `tickPlayerStamina(..., false)` branches as well as normal locomotion.

The game-loop source of truth should be the active physical-work state:

- active physical BusyAction;
- active terrain-preparation work.

A completed/cancelled channel must immediately stop suppressing recovery. Do not persist an "exhausted" or "working" flag in PlayerNeeds.

## Represented time vs real time

This is critical for `workOnWell()`:

`src/app/actions/placementActions.ts` maps an 8-second BusyAction bout to up to `WELL_WORK_SESSION_HOURS = 2` hours of actual work. Cancellation credits the measured fraction of that bout.

Therefore:

- Stamina may remain tied to real elapsed BusyAction seconds.
- Vigor must be tied to represented work hours/progress.
- Changing `WELL_WORK_SESSION_SEC` must not silently change the total Vigor cost of the represented 2h work.
- Cancellation must charge only the represented work actually completed.

The same distinction applies to terrain preparation.

## Terrain preparation

`src/app/actions/terrainPreparationActions.ts` uses `TimeSkip`, not BusyAction:

- `resumeWork()` computes represented `hours`;
- `tickWork()` uses `timeSkip.progress()`;
- `stopActiveWork()` applies final progress before cancelling;
- `onWorkSkipFinished()` applies progress 1.

Integrate effort using the same progress/represented-hours seam. Keep an effort-progress accumulator separate from terrain deformation's throttled `lastAppliedProgress`, or otherwise ensure effort is never double-applied or skipped on cancellation.

Do not rely on ordinary `tickPlayerNeeds(worldDt)` for the work cost; that is only the baseline Vigor drain and would not represent the physical intensity.

## Existing physical actions to reuse/audit

### Already physical + Stamina

- `src/app/actions/groundActions.ts`: dig, pickaxe dig, level, pickaxe level, mound.
- `src/app/actions/placementActions.ts`: `workOnWell()`.

These already use `BUSY_ACTION_STAMINA_COST_PER_SEC`.

### Missing/likely physical candidates

Audit rather than blanket-enable:

- tree chopping in `groundActions.ts`;
- ore-deposit mining in `groundActions.ts`;
- construction/assembly actions in `placementActions.ts`;
- garden maintenance/building.

The current code confirms that many other BusyActions are intentionally just timed interactions: cooking, lighting fire, tent/trap setup, planting, watering, fishing, milking, corpse handling, etc. Do not classify every BusyAction as physical.

The distinction should be based on the actual represented activity, not on duration or animation alone.

## Combat

Combat already has direct Stamina ownership in the player combat modules:

- `src/player/playerMelee.ts` — attack cost plus optional lunge cost.
- `src/player/playerRanged.ts` — bow draw cost.
- `src/app/gameLoop.ts` owns attack triggering and world consequences.

Do not introduce another combat-fatigue subsystem.

Reuse the shared physical-effort model for the Vigor side. The existing attack Stamina costs should remain the authoritative burst costs unless balancing requires changing them. Apply Vigor once per successful attack/draw using the same effort profile, not every frame of the combat lifecycle.

Be careful not to double-charge the melee lunge: it already consumes its own Stamina.

## Double-drain pitfalls

- Do not add work Vigor on top of a second independent "work timer" while also applying movement Vigor. BusyAction blocks movement, so the player should not receive walking drain during stationary work.
- The baseline idle Vigor drain currently runs every `tickPlayerNeeds()`. Decide whether the physical profile is an **additional** rate above this baseline; this is preferable because existing walking/sprint costs are already expressed as idle baseline + movement extra.
- Do not apply the same physical effort once from BusyAction and again from the action completion callback.
- On Escape/damage interruption, charge only progress actually performed.

## Useful existing contracts

- `src/shared/StaminaState.ts` and `src/shared/VigorState.ts` provide the primitive clamped mutations; keep them generic.
- `src/player/PlayerNeeds.ts` is the domain owner and already contains all player tuning.
- `src/app/busyAction.ts` is deliberately player-independent and should remain so; use callbacks/options rather than importing PlayerNeeds.
- `src/app/gameLoop.ts` is the correct integration point for per-frame player-needs ticking and HUD synchronization.
- `src/app/actions/actionContext.ts` is the shared seam for player actions; do not introduce parallel action dependencies.

## Tests worth adding

Prefer small pure tests around the new PlayerNeeds effort helper/profile calculations plus existing BusyAction tests:

- physical work drains Stamina without simultaneous recovery;
- represented-duration Vigor cost is invariant to BusyAction real duration;
- partial cancellation charges only partial represented work;
- different intensities preserve the intended ordering;
- terrain-preparation progress does not double-charge on throttled updates/cancel;
- attack effort does not duplicate existing Stamina costs.

Keep browser verification focused on the plan's stated work/sprint/combat scenarios; technical tests do not prove gameplay balance.

## JSDoc

Add JSDoc for new architectural/public effort functions and use `@domain items-player`. Keep the real-time vs represented-time distinction explicit in the API comments.
