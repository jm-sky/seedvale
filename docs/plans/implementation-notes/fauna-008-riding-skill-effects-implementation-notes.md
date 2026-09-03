# Implementation Notes: Riding Skill Effects

## Current code reality

- Mounted input is owned by `src/app/actions/mountActions.ts`. `update()` calls `mount.driveMounted(dt, wishX, wishZ, sprintRequested)`, then measures actual mount displacement for Riding XP, syncs the player seat transform, and calls `tickRidingStamina(..., moving)`. Keep this orchestration; do not move skill logic into `AnimalAgent`.
- `PlayerSkills.ts` already has the authoritative Riding value/XP state. The shared skill curve is bounded to `[0.2, 1)`; `riding.value` is derived from XP. Do not add levels/perks or another progression state.
- `PlayerNeeds.ts` currently has a single riding drain constant of `3/s`. `tickRidingStamina()` drains only while the mount actually moved and otherwise uses the existing normal regeneration rate. Preserve this exact stationary branch.
- Human movement is `MOVE_SPEED = 8` and sprint is `MOVE_SPEED * SPRINT_MULTIPLIER`, with `SPRINT_MULTIPLIER = 1.8`, so the authoritative player values are **8 walk / 14.4 sprint** before other movement constraints.
- Rideable species are data-driven through `AnimalDef.mount`. Currently only **horse** and **donkey** are rideable. Their current base speeds are:
  - horse: `2.6 / 6.0` walk/sprint
  - donkey: `2.4 / 5.4` walk/sprint
  Therefore the plan's horse/donkey > human invariant is currently very far from satisfied; it cannot be fixed with a small Riding multiplier alone. The minimum rideable baseline itself must be raised.
- Mounted movement in `AnimalAgent.driveMounted()` uses `walkSpeedNow()` / `sprintSpeedNow()`, then the shared `stepWithSlopeAndCollision()`. `walkSpeedNow()` / `sprintSpeedNow()` only apply the night slowdown to `role === 'prey'`; horse and donkey are livestock, so they currently receive no night speed modifier.
- `stepWithSlopeAndCollision()` applies the shared slope constraint and collision fallback. This is important for the invariant: compare base effective speeds, not raw per-frame displacement on arbitrary terrain. Do not create a riding-specific slope system.
- Player encumbrance is applied inside `PlayerController` to normal player movement. It is not part of mounted movement and should not be silently reused as a mount speed modifier.
- Riding stability already consumes `player.skills.riding.value` independently in `ridingStability.ts`. Leave it untouched; this plan must not alter fall probability or fall damage.
- `AnimalAgent` remains player-skill independent. Its mounted API is already the correct seam: pass an effective speed into `driveMounted()` rather than importing `PlayerSkills` there.

## Architecture decisions

### Speed

Use `PlayerSkills.ts` for pure, bounded Riding mappings, and `mountActions.ts` for applying them to the player-driven mount.

Prefer two small functions alongside the existing skill-effect functions, for example:

- Riding value → mounted speed multiplier
- Riding value → riding stamina drain multiplier

Clamp the input defensively to the same `[0,1]` domain used by the existing skill-effect helpers. The mapping must be deterministic and monotonic.

The important distinction is:

`
rideable animal base speed
    → Riding-derived player modifier
    → existing AnimalAgent mounted movement
    → existing slope/collision constraint
`

Do not change `AnimalDef` speeds through the Riding value and do not make `AnimalAgent` know whether a player is skilled.

### Baseline speed invariant

The current slowest rideable animal is the donkey. Its baseline must become faster than the player's 8 / 14.4 values **before** applying Riding skill.

Because both player and mount use the same slope constraint, a sufficiently higher base speed preserves the ordering on the same slope. Collision/blocking is not a meaningful speed comparison and should not be used to weaken the invariant.

Do not solve this by making Riding at minimum value provide a large multiplier. The plan explicitly requires horse superiority to be independent of skill. The base values in `AnimalDefs` are therefore the natural place for the minimum rideable baseline.

Keep horse and donkey distinct if desired for flavour, but ensure the slowest rideable variant clears both thresholds. A modest additional Riding multiplier can then sit on top of that baseline.

There is currently no mounted-specific night/weather speed modifier for these two rideable species. Do not invent one while implementing this plan.

### Mounted speed API

The cleanest seam is to let `AnimalAgent.driveMounted()` accept the already-resolved effective walk/sprint speeds (or an equivalent small speed-effect input), while retaining the existing internal movement bookkeeping.

Avoid adding a `PlayerSkills` parameter to `AnimalAgent`. Avoid duplicating `stepWithSlopeAndCollision()` in `mountActions.ts`.

The speed effect should apply only to the player-driven mounted path. Normal AI calls to `walkSpeedNow()` / `sprintSpeedNow()` must remain unchanged, so free-roaming horse/donkey behaviour does not become skill-dependent.

### Riding stamina

Keep `RIDING_STAMINA_DRAIN_PER_SEC = 3` as the minimum-skill value.

The current function has exactly the desired regeneration semantics:

- moving mount → drain
- stationary mount → normal `STAMINA_REGEN_PER_SEC`

Extend only the drain calculation. A good shape is:

`
effectiveDrain = 3 * ridingDrainMultiplier(ridingValue)
`

with multiplier = 1 at `SKILL_MIN_VALUE`, decreasing monotonically toward a bounded mastery floor.

Pass the resolved multiplier/rate from `mountActions.ts` into `tickRidingStamina()`. Do not make `PlayerNeeds` depend on `PlayerSkills`.

## Important call-site details

In `mountActions.update()`:

1. Read `player.skills.riding.value`.
2. Resolve the Riding speed effect.
3. Pass effective walk/sprint speeds to `driveMounted()`.
4. Continue measuring actual displacement exactly where it is now; Riding XP must still be based on distance actually travelled.
5. Resolve the Riding stamina effect and pass it to `tickRidingStamina()`.
6. Leave stability/fall calls unchanged; they already read Riding skill directly.

Do not calculate Riding effects from requested input direction. The mount movement and stamina logic should continue to be based on the existing `moving` / actual movement semantics.

## Tests worth adding

Keep pure mapping tests in `PlayerSkills` tests if that is the existing test location.

For speed, test the actual mounted-speed seam with both current rideable definitions:

- minimum Riding leaves the baseline unchanged,
- higher Riding increases effective walk/sprint speed,
- multiplier is monotonic,
- donkey minimum baseline > player walk/sprint,
- horse minimum baseline > player walk/sprint,
- both variants remain above the player after the Riding multiplier,
- mounted speed still goes through the existing movement step rather than bypassing slope/collision.

For stamina:

- minimum Riding gives exactly `3/s`,
- higher Riding gives a lower drain,
- drain is monotonic,
- stationary riding still restores using the existing regen rate,
- no changes to normal player sprint stamina or animal stamina.

Prefer pure function tests for the skill mappings and a small focused test for the mounted API rather than broad integration scaffolding.

## Pitfalls / regression points

- **Do not use the current horse values as the baseline.** They are 2.6/6.0 and donkey is even slower; the stated invariant is currently broken.
- **Do not accidentally include Riding skill in free-roaming AI.** `AnimalAgent.walkSpeedNow()` / `sprintSpeedNow()` are shared by normal fauna behaviour.
- **Do not change `walkSpeedNow()` itself to implement player Riding.** That would affect AI movement.
- **Do not let Riding alter animal stamina.** `driveMounted()` still ticks `tickAnimalLife()` and the mount's own stamina is used by sprint/exhaustion logic.
- **Do not use player encumbrance as a mounted speed modifier.** It belongs to the player's normal movement path.
- **Do not replace the stationary stamina branch.** The plan explicitly preserves normal regeneration while mounted and stationary.
- Riding XP uses actual `moved` distance measured after `driveMounted()`; preserve that ordering.
- Stability already reads `riding.value` and should not be refactored as part of this change.
- `AnimalAgent.driveMounted()` currently also controls mount animation, animal-life ticking, stamina UI and health UI. Keep the change to its speed input narrow.
- The plan says "all relevant horse/night/environment modifiers"; in the current implementation the only speed modifiers inside AnimalAgent are the prey-only night modifiers. Horse and donkey do not receive them. The shared slope/collision constraint is applied to mounted movement and is the relevant environmental movement constraint.
- The player’s sprint speed is exactly `8 * 1.8 = 14.4`; use the constant rather than hard-coding 14.4 in production code/tests where possible.

## Suggested implementation sequence

1. Add pure Riding speed/drain mappings in `PlayerSkills.ts`.
2. Raise rideable animal baseline speeds so the minimum-skill invariant is true for every current `def.mount` variant.
3. Extend the existing `driveMounted()` seam with effective player-driven speeds.
4. Extend `tickRidingStamina()` with the Riding-derived drain effect while preserving its stationary branch.
5. Add focused pure + mounted-path tests.
6. Run typecheck, lint and relevant tests.
7. Player performs browser verification; technical checks do not establish gameplay/visual correctness.

## Related existing systems to reuse

- `PlayerSkills.ts`: authoritative Riding progression and existing pure skill-effect pattern.
- `mountActions.ts`: player-specific riding orchestration and the existing mount lifecycle.
- `PlayerNeeds.ts`: authoritative player stamina pool and existing riding drain/regen seam.
- `AnimalAgent.driveMounted()`: generic player-driven mount movement.
- `AnimalDef.mount`: capability-based rideable species definition; do not add a separate rideable-species list.
- `stepWithSlopeAndCollision()`: shared movement constraint/collision path.
- `ridingStability.ts`: existing Riding-dependent stability/fall behaviour; leave intact.
