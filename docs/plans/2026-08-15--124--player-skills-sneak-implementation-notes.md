# Implementation notes: Player Skills — Sneak (plan 124)

> **Note on plan ID:** forgiving melee targeting is
> `2026-08-15--124b--forgiving-melee-targeting-gap-close.md` (resolved as `124b`).
> This Sneak plan keeps `124`.

## Discrepancy vs. the plan text

The plan assumes an "existing Skills menu/UI" (§2: "Activation and
deactivation happen through the existing Skills menu/UI"). No such screen
existed in the codebase — `src/ui-vue/screens/` had no Skills-related file.
Built a new `SkillsScreen.vue` (same pattern as the existing `CharacterScreen.vue`:
a pause-menu-launched modal, presentation-only, driven by `ui-vue/store.ts`
state pushed from `gameLoop.ts`) rather than skipping the requirement.

The plan also describes three movement tiers (walking/running/sprinting).
`PlayerController` only has two: a single base `MOVE_SPEED` ("walk") and a
sprint multiplier (`SPRINT_MULTIPLIER`) — there is no separate "run" input or
speed tier anywhere in the movement code. Treated the plan's "walking" and
"running" targets as the same tier (`PlayerMovementState = 'moving'`); did not
invent a third movement speed to match the plan's wording literally.

## Changed files

- `src/player/PlayerSkills.ts` (new) — `SkillId`/`SkillState`/`PlayerSkills`
  model, `createPlayerSkills()` (`sneak` fixed at `SNEAK_FIXED_VALUE = 0.5`,
  `active: false`), `toggleSneak()`, and the pure `applySneakSpeedModifier()`
  + `SNEAK_SPEED_MULTIPLIER = 0.65` (35% slower — inside the plan's 30–50%
  band, applied identically to walk and sprint speed).
- `src/player/PlayerSkills.test.ts` (new) — pure-logic tests for the above.
- `src/player/PlayerController.ts` — new `readonly skills: PlayerSkills`
  field; new exported `PlayerMovementState = 'stationary' | 'moving' | 'sprinting'`
  type; `movementState()` accessor (reuses the existing private
  `moving`/`sprinting` flags, no new state); `update()` now runs the computed
  walk/sprint speed through `applySneakSpeedModifier()`; `crouch()`/`lieDown()`
  (the existing rest-sequence pose transitions, `restCampSequence.ts` +
  `createApp.ts`'s town-rest path) now also clear `skills.sneak.active` — the
  one existing action-state transition that invalidates Sneak per plan §2.
- `src/fauna/playerAwareness.ts` — new optional `NoticeParams.stealthMultiplier`
  (defaults to 1 via `?? 1` in `detectionProbability`, so every pre-existing
  call/test is unaffected); new `PlayerStealthState` type
  (`{ sneakValue, sneakActive, movement }`) and pure `sneakDetectionMultiplier()`
  — this is exactly the "stealth modifier" extension point plan 120 §7 asked
  for, so no changes were needed to `detectionProbability`'s distance/facing
  math itself beyond multiplying by this one extra factor.
- `src/fauna/playerAwareness.test.ts` — extended with `stealthMultiplier`
  plumbing tests and `sneakDetectionMultiplier` coverage (inactive → 1, zero
  value → 1, stationary < moving < sprinting reduction, sprint never reaches
  1, clamped to `[0,1]` across the input grid).
- `src/fauna/AnimalAgent.ts` — `update()`/`senseEnvironment()` take a new
  `playerStealth: PlayerStealthState` parameter (defaults to a no-op state so
  nothing else calling `AnimalAgent.update()` needs to change); the
  `isPlayerNoticed()` call now passes `stealthMultiplier: sneakDetectionMultiplier(playerStealth)`.
- `src/fauna/createFauna.ts` — `Fauna.update()`'s type + implementation thread
  the same optional `playerStealth` through to each `AnimalAgent.update()` call.
- `src/app/gameLoop.ts` — builds `playerStealth` from
  `player.skills.sneak.{value,active}` + `player.movementState()` each frame
  and passes it to `bundle.fauna.update(...)`; also pushes
  `vueUi.setSkillsState(player.skills.sneak.value, player.skills.sneak.active)`
  next to the existing `hud.setCharacterStats(...)` call (same per-frame
  cheap-bail convention — needed because rest can flip `active` off outside
  the Skills screen's own toggle).
- `src/app/createApp.ts` — one `vueUi.configureSkillsScreen({ onToggleSneak: () => toggleSneak(player.skills) })`
  call after the player is constructed, mirroring how other screens'
  write-path handlers are wired.
- `src/ui-vue/store.ts` — new `SkillsScreenState`, `ui.skillsScreen` slot,
  `openSkillsScreen`/`closeSkillsScreen`/`isSkillsScreenOpen`/
  `configureSkillsScreen`/`setSkillsState` (same shape as the existing
  Character-screen functions).
- `src/ui-vue/mount.ts` — forwards `configureSkillsScreen`/`setSkillsState`
  (the two functions `gameLoop.ts`/`createApp.ts` call from outside the Vue
  tree; open/close/isOpen are called directly from within Vue components, same
  as `CharacterScreen`).
- `src/ui-vue/screens/SkillsScreen.vue` (new) — single Sneak toggle row
  (label, level %, Aktywne/Wyłączone badge), same modal chrome as
  `CharacterScreen.vue`.
- `src/ui-vue/App.vue` — mounts `<SkillsScreen />`.
- `src/ui-vue/screens/PauseMenuEntriesMain.vue` — new "Umiejętności" button
  between "Postać" and "Ekwipunek [I]", opening the new screen. No new
  keybinding was added — activation is menu-only on both desktop and touch,
  satisfying "same interaction works on desktop and mobile" without a new
  input path.

## Movement modifier

`applySneakSpeedModifier(baseSpeed, sneakActive)` — flat ×0.65 while active,
applied in `PlayerController.update()` to whichever `baseSpeed` was already
computed (`MOVE_SPEED` or `MOVE_SPEED * SPRINT_MULTIPLIER`), so it composes
with sprint rather than replacing it. Sprint while Sneaking is therefore still
faster than sneak-walking, just slower than normal sprint.

## Detection probability formula

```
stealthMultiplier = sneakDetectionMultiplier({ sneakValue, sneakActive, movement })
  if !sneakActive → 1
  value = clamp01(sneakValue)
  movementFactor = { stationary: 1, moving: 0.7, sprinting: 0.25 }[movement]
  reduction = value × movementFactor × 0.9   // MAX_STEALTH_REDUCTION
  → clamp01(1 - reduction)

detectionProbability(...) unchanged except the final result (both the
close-range/panic branch and the far-range/facing branch) is multiplied by
stealthMultiplier before being returned.
```

At the fixed `sneakValue = 0.5`: stationary → ×0.55 (45% probability
reduction), moving → ×0.685 (~31% reduction), sprinting → ×0.8875 (~11%
reduction) — matches the plan's behaviour targets (stationary strongest,
moving strong, sprinting low-but-present benefit) without a hard walk/run
split, since the game has none.

Day/night and forest continue to only affect `effectiveNoticeRange` (as
before plan 124) — Sneak is a separate multiplicative factor applied after
distance/facing, so "night" and "dense forest" remain additional, independent
advantages on top of whatever Sneak contributes, per the plan's behaviour
table.

## Determinism

No new randomness. `sneakDetectionMultiplier` is a pure function of
`(sneakValue, sneakActive, movement)`; `detectionProbability` remains a pure
function of its inputs including the new `stealthMultiplier` field. The
existing `detectionRoll`/roll-caching cadence (`PERCEPTION_ROLL_INTERVAL_SEC`,
untouched) still determines when to compare rolls against probability;
identical simulation state still yields identical detection outcomes.

## CPU / update frequency

No new per-frame cost beyond a few extra multiplications/branches already on
the same code path `detectionProbability` was running on every
`senseEnvironment()` call (unchanged frequency). `player.movementState()`
just reads two booleans already tracked. No new spatial queries, raycasts, or
structures.

## Tests / typecheck / lint / build

- `npx vitest run src/fauna/playerAwareness.test.ts src/player/PlayerSkills.test.ts` — all passing (folded into the full run below).
- `npm run test` — 104 files / 831 tests passing (was 98 files / 756 before
  plan 120; 831 now includes plan 124's new coverage).
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean on every file touched by this plan; the 11
  pre-existing `_temp/asset-audit/inspect.mjs` errors are unrelated (same
  ones noted in plan 120's implementation notes).
- `npm run build` (`vue-tsc --noEmit && vite build`) — succeeds; the
  large-chunk warning is pre-existing.

## Browser / gameplay verification

Not performed in this session (per `CLAUDE.md`, browser verification is left
to the user with concrete manual steps). Open items from the plan's
Verification §5:

1. Open pause menu → "Umiejętności" → toggle Sneak on/off on desktop.
2. Same on a touch/mobile layout.
3. Confirm movement is visibly slower while Sneak is active (walk and sprint).
4. Confirm sprinting is still possible while Sneak is active.
5. Approach animals while Sneak is active vs. inactive and compare how close
   you can get before they react — stationary should be hardest to detect,
   sprinting easiest.
6. Compare day vs. night and forest vs. open terrain with Sneak active.
7. Start a rest (camp/tent/town) while Sneak is active and confirm it turns
   off automatically (screen should show "Wyłączone" after standing back up
   unless re-toggled).

No new animation asset was added for the crouched/stealth visual per the
plan's explicit allowance ("Do not block the mechanical implementation on a
new animation asset"); the Skills screen's Aktywne/Wyłączone badge is the
primary feedback for now.
