# Implementation notes — 192 — Time & Simulation Consistency

## Recon summary (plan §1)

Repo-wide audit (five parallel searches) covered `dayNight.ts`/`timeSkip.ts`/`gameLoop.ts`, `PlayerNeeds.ts`, `ai/Needs.ts`/`npcVigor.ts`/`NpcAgent.ts`, `cropLifecycle.ts`/`treeLifecycle.ts`/`timedProcess.ts`/`weather.ts`, and `fauna/AnimalAgent.ts`/`herdCohesion.ts`/`combat/`/`player/`/`busyAction.ts`. Findings:

- **No shared time-conversion helper existed.** The `24 / dayLengthSec` (game-hours ⇄ real-seconds) ratio was independently re-derived inline in `dayNight.ts` (`tickDayNight`), `timeSkip.ts` (`start()`), `ai/Needs.ts` (`tickNeeds`), `ai/NpcAgent.ts` (`resolveTimeSkip`), and `app/actions/placementActions.ts` (well-work session). All five were algebraically consistent with each other, just duplicated.
- **`PlayerNeeds.ts` hardcoded `480`** in 7 places (hunger/thirst drain, vigor idle/walk/sprint drain, hunger/thirst severe-duration gates, deprivation vigor penalty) as a *copy* of `dayNight.ts`'s default `dayLengthSec`, never reading the live value. `ai/Needs.ts`'s NPC-side equivalent was already correctly parameterized on `dayLengthSec`. Since `dayLengthSec` is user-adjustable at runtime (debug GUI slider, `WorldConfigScreen.vue`) and not save-persisted, this was a real (if narrow) bug: player-needs tuning silently desynced from its "N game-days" framing whenever day length differed from 480, while NPC needs stayed correct.
- **Lazy World-Time systems** (`cropLifecycle.ts`, `treeLifecycle.ts`, `items/timedProcess.ts`) and **weather/seasons** (`weather.ts`) were already clean: pure functions of `elapsedDays`/`(seed, elapsedDays)`, no `480` dependency beyond an informational comment, single clock (`dayNight.elapsedDays`), no refactor needed.
- **Fauna timers** (`AnimalAgent.ts`, corpse decay, attack cooldowns, etc.) already run correctly on simulation-time `worldDt` — the one comment-only `480` reference (`herdCohesion.ts`'s `JUVENILE_MATURITY_SECONDS`) is a flat real-seconds tuning constant, not a hidden conversion; left as-is per plan §9 (don't move fauna timers to World Time automatically).
- **Combat/player-action timers** (`combat/meleeAttack.ts`, `rangedLifecycle.ts`, `projectile.ts`, `playerCombat.ts`, `busyAction.ts`) are correctly real-time; player-side always ticks on raw `dt`, matching plan §10.
- **Found but out of scope:** during an active `timeSkip`, NPC/fauna needs/vigor/stamina/combat timers are ticked live via an accelerated `worldDt` *and* separately replayed by `NpcAgent.resolveTimeSkip()`'s catch-up on `justFinished` — a double-counting bug that contradicts the "NPCs/fauna freeze during a skip" doc comments in `timeSkip.ts`/`gameLoop.ts` (nothing actually gates `settlementsManager.update`/`fauna.update` on `timeSkip.isActive()`). This plan's acceptance criteria explicitly ask to *preserve* current time-skip behavior, not rebalance it, so it was **not** fixed here — logged to `docs/plans/LOOSE-ENDS.md` (2026-08-22 entry) as a follow-up requiring its own plan.

## Changes made

- **New `src/world/timeConversion.ts`** — stateless real-time ⇄ game-time helpers (`gameDaysToRealSeconds`, `realSecondsToGameDays`, `gameHoursToRealSeconds`, `realSecondsToGameHours`, `gameHoursToGameDays`, `gameDaysToGameHours`), all taking `dayLengthSec: number` directly rather than `DayNightState`. No global `TimeManager`.
- **`dayNight.ts`'s `tickDayNight`**, **`timeSkip.ts`'s `start()`**, **`ai/Needs.ts`'s `tickNeeds`**, **`ai/NpcAgent.ts`'s `resolveTimeSkip`**, and **`app/actions/placementActions.ts`'s well-work session math** now call the shared helper instead of re-deriving the same ratio inline. Values unchanged — purely a dedup.
- **`PlayerNeeds.ts`** — hunger/thirst drain, vigor idle/walk/sprint drain, hunger/thirst severe-duration gates, and the deprivation vigor penalty are now expressed as an amount over N *game-days* and converted against the live `dayLengthSec` each tick, instead of a hardcoded `480`-derived constant. `tickPlayerNeeds`, `tickPlayerMovementVigor`, `tickHealthRegen`, `isTakingDeprivationDamage` now take `dayLengthSec: number`; `HUNGER_SEVERE_DURATION_SEC`/`THIRST_SEVERE_DURATION_SEC` constants became `hungerSevereDurationSec(dayLengthSec)`/`thirstSevereDurationSec(dayLengthSec)` functions. Stamina/HP-regen/deprivation-stamina-penalty rates stayed flat (never day-length-tuned, no behavior change).
- **`playerDamage.ts`'s `tickPlayerStarvationDamage`**, **`PlayerController.ts`'s `update`**, and **`gameLoop.ts`'s call sites** thread `dayNight.dayLengthSec` through to the above. **`dialogueTimeControl.ts`'s `PlayerController.prototype.update` monkey-patch** updated to match the new signature.
- **Gameplay tuning is unchanged**: at the default `dayLengthSec = 480`, every rate/duration in `PlayerNeeds.ts` computes to the exact same value as before — verified by tests asserting invariance across `dayLengthSec ∈ {480, 600, 240}` (e.g. hunger still empties in exactly 3 game-days at any day length).
- **`docs/ARCHITECTURE.md`** — added a short "Time model" section (World Time / Simulation Time / Real-Time Actions, when to use each, pointer to `timeConversion.ts`).
- **`docs/plans/LOOSE-ENDS.md`** — one entry for the time-skip double-counting bug found during recon (see above), out of this plan's scope.

## Tests added/extended

- `src/world/timeConversion.test.ts` (new) — round-trip and boundary cases (0/1/0.5 day, 1/24 game-hour) across `dayLengthSec ∈ {480, 600, 240}`.
- `src/world/dayNight.test.ts` — `tickDayNight` invariance across the same three day lengths, split-tick independence, `timeMultiplier` scaling, no-op on `dt=0`.
- `src/player/PlayerNeeds.test.ts` — updated all call sites to the new `dayLengthSec` parameter; added a describe block asserting hunger/thirst/vigor/severe-duration tuning stays fixed in game-days across `dayLengthSec ∈ {480, 600, 240}`.
- `src/ai/Needs.test.ts` — added an invariance test confirming `tickNeeds`' game-hour tuning was already (and remains) independent of `dayLengthSec`.

## Verification

- **Technically verified**: `npx tsc --noEmit`, `pnpm run lint:fix`, `pnpm run build`, `pnpm run test` (1597 tests, all green).
- **Not browser/manually verified** — this is a pure refactor of internal rate/duration math with no intended behavior change at the default `dayLengthSec`, but per `CLAUDE.md` it still needs a human pass. Suggested manual checks (plan's own "Verification" section):
  1. Normal day/night cycle looks unchanged.
  2. Player hunger/thirst/vigor drain at the same pace as before (spot-check against pre-change intuition, e.g. `?debug=1` GUI).
  3. Change `dayLengthSec` via the debug GUI (Ustawienia → Panel debug) or `WorldConfigScreen.vue` mid-session and confirm hunger/thirst/vigor drain rate visibly rescales (slower pool-drain per real second at a longer day) while still taking ~3/2.5/1.5 game-days by the in-game clock.
  4. NPC needs/vigor/schedule during a time-skip — unchanged from before this plan (the known double-counting issue is pre-existing, not introduced/changed here).
  5. Crops/trees/timed processes (drying) — unaffected, no code changed.
  6. Weather/seasons — unaffected, no code changed.
