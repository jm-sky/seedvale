# Implementation Notes: ui-input-005 Lodging Navigation Recovery and Cancellation

**Reviewed:** 2026-08-31
**Plan:** `docs/plans/ui-input-005-lodging-navigation-recovery-and-cancellation.md`
**Status:** implementation notes
**Source of truth:** current `main` code, `docs/STATE.md`, and the existing plan 168 implementation notes.

## 1. Current state — several cancellation requirements already exist

Plan 168's implementation already provides the main cancellation seam in `src/app/actions/restActions.ts`:

- `lodgingWalkTarget` is the authoritative active autowalk state.
- `cancelLodgingWalk()` clears the target and releases the forced `keyboard.state.forward`.
- `cancelRest()` clears pending rest/lodging quality, cancels the time skip/rest sequence and restores the player standing pose.
- `abortRest()` already treats an active lodging walk or lodging confirmation as cancellable.
- `isLodgingActive()` already exposes the walk state to the modal/input gating.
- `canCancelRest()` is already the single gate for cancelling an actual sleep time skip.

Do not create another lodging cancellation state machine. Extend these existing functions.

## 2. Esc is already wired — do not add a second keyboard mechanism

The current `src/ui-vue/App.vue` has a global `keydown` handler for `Escape`:

```text
abortRest()
→ abortTerrainPreparation()
→ abortPlacementPreview()
→ abortBusy()
→ closeTopOverlay()/togglePause()
```

Because `abortRest()` is already first, lodging cancellation already happens before pause-menu handling.

`src/input/Keyboard.ts` deliberately has no Escape edge in `KeyState`. Do **not** add Escape to `KeyState` just to satisfy this plan; that would duplicate the existing UI-level Escape flow. The important implementation check is that `abortRest()` continues to return `true` for `lodgingWalkTarget`, preventing the rest of the Esc chain from opening pause.

If the implementation changes the Esc path, preserve this ordering and keep Escape handling single-source.

## 3. Current UI gap: the walk has no cancellation button

`src/ui-vue/screens/TimeSkipOverlay.vue` already renders a rest cancellation button, but only while `ui.timeSkip.visible` is active. The current lodging autowalk happens before the sleep time skip starts, so this overlay is not the correct existing state for the walk.

The current rest button also displays only `Esc`, whereas plan 005 requires **„Anuluj [Esc]”** for the lodging walk.

Prefer a thin HUD-level presentation driven by the existing `isLodgingActive()`/store bridge rather than turning `TimeSkipOverlay` into a general action overlay. The click handler must call the same `abortRest()` used by Escape.

Do not introduce a second cancellation callback or lodging-specific business state in Vue.

## 4. Existing movement architecture

`restActions.ts::tickLodging()` is already the player autowalk implementation. It does not use pathfinding and does not modify `PlayerController`:

- reads the selected `LodgingOption.approachPoint`;
- computes XZ distance;
- writes `keyboard.state.forward = true`;
- writes `mouseLook.state.yaw` toward the target;
- lets the normal `PlayerController.update()` movement/collision pipeline perform the actual movement.

Manual `backward`, `left`, `right`, `sprint` or `jump` input currently cancels the lodging walk.

Keep this seam. This plan is **not** a pathfinding task and should not add `PlayerController.moveTo()`, a navigation graph or an NPC-style navigation system.

## 5. Stuck detection should be local runtime state

The current `tickLodging()` has no progress watchdog: it keeps forcing movement until the arrival tolerance is reached or the player manually interrupts.

Add only minimal closure state next to `lodgingWalkTarget`, e.g.:

```text
lastLodgingDistance
lastLodgingProgressAt
```

Initialize/reset it whenever a lodging walk is armed or cancelled. Compare the current XZ distance with the previous best/meaningful distance rather than measuring elapsed time since the walk started.

Important distinction:

```text
long walk + continuous distance reduction
    → keep walking

distance essentially unchanged for ~10–15 s
    → stuck recovery
```

Use the actual game-loop timing/cadence to choose the final threshold. Do not use the old 3-second-style fixed timeout.

An epsilon is important because frame-to-frame floating-point movement should not count as meaningful progress.

## 6. Recovery: exploit the existing controlled-position seam, not global collision bypass

The repository already exposes `PlayerController.setPosition()`; it is used by `startTentRest()` to place the player at an authoritative rest pose. This makes it the first existing mechanism to evaluate for lodging recovery.

The intended recovery is narrowly scoped:

```text
lodging autowalk
  ↓
no meaningful progress for timeout
  ↓
move/set player to the selected LodgingOption.approachPoint
  ↓
re-run normal arrival validation/completion
```

Do not:

- disable the global collision system;
- add a global noclip flag;
- modify all house colliders as part of this plan;
- create a second movement implementation.

The recovery position must come from the already-selected `LodgingOption.approachPoint`. Never derive an arbitrary position inside the house.

Before using `setPosition()` as the final implementation, verify its interaction with the current `PlayerController.update()` collision resolution. In particular, make sure a recovery position is not immediately pushed away by the same problematic collider before the lodging arrival is processed.

If direct placement at the approach point cannot survive the next movement/collision update, use the smallest existing lodging-scoped workaround that allows the arrival transition to happen. Do not generalize that workaround into PlayerController/global collision state.

## 7. Reuse one arrival/completion path

The existing arrival branch in `tickLodging()` already:

1. checks `LODGING_ARRIVE_TOLERANCE`;
2. clears the walk target;
3. releases forced `forward`;
4. re-collects lodging candidates;
5. validates the selected option is still available;
6. applies `option.facing`;
7. resolves `lodgingRestQuality()`;
8. calls `player.lieDown()`;
9. starts the existing 8h `timeSkip`.

Recovery must converge on this same completion logic. Do not duplicate the sleep-start sequence in a separate recovery branch.

A useful implementation shape is to extract only the existing arrival/completion body into a small local helper if that makes normal arrival and recovery share it cleanly. Keep the revalidation authoritative.

## 8. State reset points

Progress watchdog state must be reset with the lodging action lifecycle, not left to decay naturally.

Relevant transitions:

```text
arm lodging walk
    → initialize progress state

normal arrival
    → clear walk/progress state

manual movement cancellation
    → clear walk/progress state

Esc/button cancellation
    → clear walk/progress state

stuck recovery
    → clear/reinitialize according to whether recovery completes immediately

unavailable target
    → clear walk/progress state
```

The existing `cancelRest()` is especially important because it is shared by Esc and forced interruption. Keep the invariant that no later unrelated sleep inherits lodging runtime state.

## 9. Lodging target revalidation remains authoritative

`LodgingOption` is derived state. The current `isLodgingOptionStillAvailable()` re-collects the current settlement's candidates and matches the selected option ID.

Do not cache an `available` flag for the duration of autowalk.

Recovery must not silently switch to a different bed/hay/friend option. It may only recover the currently selected target, then run the existing availability check. If the selected place disappeared or became unavailable, show the existing failure toast and end the lodging action without starting sleep.

## 10. Collision bug context

The shared house-collision work is not a dependency to fix inside this plan.

`docs/plans/implementation-notes/settlements-001-house-collision-geometry-implementation-notes.md` records that the house OBB work passed technical tests but had a failed browser result: the player could still walk through walls while the door collider blocked. That is exactly why a lodging-only recovery is justified here.

Do not infer from the existence of OBB code that house collision is currently reliable. Conversely, do not reopen the full house-collision plan unless implementation evidence shows the lodging recovery cannot be made safe without it.

The recovery is a gameplay safeguard for a specific lodging action, not a replacement for fixing house collision globally.

## 11. UI integration boundary

Relevant current files:

- `src/app/actions/restActions.ts` — authoritative lodging/cancel state.
- `src/app/gameLoop.ts` — ticks lodging and bridges action state into UI.
- `src/ui-vue/App.vue` — existing global Escape chain.
- `src/ui-vue/store.ts` — existing reactive UI bridge.
- `src/ui-vue/screens/TimeSkipOverlay.vue` — existing time-skip cancellation presentation; useful as a visual/pattern reference, but not currently visible during autowalk.
- `src/app/modalState.ts` — lodging already blocks normal gameplay input while walking.
- `src/input/Keyboard.ts` — normal movement state; no Escape state should be added unless the architecture is deliberately changed.

The UI should derive visibility from the authoritative lodging runtime state. Avoid maintaining a separate `lodgingCancelVisible` flag that can diverge from `isLodgingActive()`.

## 12. Tests worth prioritizing

Keep tests focused on the new runtime policy/seams rather than broad movement tests.

High-value cases:

- progress state resets when a new lodging walk starts;
- meaningful distance reduction prevents recovery;
- tiny distance changes below epsilon do not reset the watchdog;
- no-progress timeout triggers recovery only after the configured long threshold;
- manual cancellation clears watchdog state;
- Esc cancellation returns `true` during autowalk and therefore does not fall through to pause;
- UI button and Escape both reach `abortRest()`;
- recovery targets the selected `approachPoint`;
- recovery does not select another lodging option;
- unavailable selected target after recovery does not start sleep;
- normal arrival and recovered arrival both execute the same sleep hand-off;
- existing camp/tent/wait cancellation remains unchanged.

If the current test structure makes direct `tickLodging()` testing expensive, extract the pure stuck/progress calculation rather than introducing a test-only abstraction around the whole game loop.

## 13. Implementation order

1. Confirm the existing Esc path and do not duplicate it.
2. Add the lodging progress/watchdog runtime state.
3. Extract/reuse one arrival/completion seam if needed.
4. Add the lodging-only recovery using the existing `setPosition()` seam, then verify its interaction with the next `PlayerController.update()`.
5. Add the visible **„Anuluj [Esc]”** HUD control through the existing UI store/handler bridge.
6. Ensure every cancellation/completion path clears watchdog state and forced movement.
7. Add focused tests for progress/stuck/cancellation/recovery.
8. Run `tsc`, lint, tests and build.
9. Browser-test normal lodging, Esc, button cancellation, actual collider blockage, recovery, target invalidation and final sleep.

## 14. Guardrails

Do not:

- add Escape to `KeyState` merely because the plan mentions keyboard input;
- add a global key listener dedicated to lodging;
- create a lodging-specific movement/pathfinding system;
- modify `PlayerController` unless the existing recovery seam proves insufficient;
- disable global collision;
- add global noclip;
- fix all house collider geometry in this plan;
- duplicate lodging completion/sleep logic;
- create a second UI cancellation state machine;
- silently switch to another lodging target after recovery.

## 15. JSDoc

For new or materially changed architectural/public functions, add concise JSDoc where it improves preflight discovery. Use `@domain ui-input` where appropriate.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
