# Plan: Riding Skill Effects

**Created:** 2026-09-03  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** S  
**Depends on:** ~~003~~  
**Domain:** `fauna`
**Roadmap:** `horse-and-riding`  

## Goal

Extend the existing Riding skill so riding competence affects mounted speed and the player's riding stamina consumption.

A fundamental gameplay invariant must hold:

> **Every rideable horse must always be faster than the human player, even at minimum Riding skill.**

Riding skill is a progression modifier on top of an already superior horse baseline; it must not be the mechanism that makes a horse faster than a human.

Preserve existing Riding XP, riding stability and fall-damage behaviour.

## Current architecture

The mounted flow is:

`mountActions.update()` → `AnimalAgent.driveMounted()` → `walkSpeedNow()` / `sprintSpeedNow()` → `tickRidingStamina()` → existing stability/fall handling.

`PlayerSkills` already owns the `riding` skill and its existing progression/effects.

`AnimalAgent` must remain independent from `PlayerSkills`. Player-specific Riding effects belong in the player/riding orchestration layer and should be passed through existing movement/stamina seams.

## Scope

### 1. Mounted speed

First identify authoritative current values for:

- human walk speed,
- human sprint speed,
- horse walk speed,
- horse sprint speed,
- all relevant horse/night/environment modifiers.

Establish the smallest sensible baseline adjustment required so that the slowest rideable horse remains faster than the human in equivalent movement modes at minimum Riding.

Required invariants:

- horse walk speed > human walk speed,
- horse sprint speed > human sprint speed.

Riding skill then provides an additional, moderate speed improvement.

Do not modify normal horse AI movement. Do not make `AnimalAgent` aware of player skills.

### 2. Riding stamina

Extend the existing `tickRidingStamina()` mechanism so Riding skill reduces the player's riding stamina drain.

Keep the current `RIDING_STAMINA_DRAIN_PER_SEC = 3` as the minimum-skill baseline.

Requirements:

- minimum Riding → current 3/s drain,
- higher Riding → lower drain,
- monotonic relationship,
- stationary mounted player still regenerates normally.

Do not change player sprint stamina, mount stamina, exhaustion rules or unrelated stamina costs.

### 3. Existing Riding progression

Keep unchanged:

- Riding XP,
- distance-based progression,
- riding stability/fall probability,
- fall damage modifiers,
- mount/dismount behaviour.

No new riding levels or perk system.

## Recommended ownership

### `PlayerSkills.ts`

Own deterministic, bounded mappings from Riding value to:

- mounted speed multiplier,
- riding stamina drain multiplier.

Keep tuning constants named and together.

### `mountActions.ts`

Resolve player Riding effects and orchestrate effective mounted speed and riding stamina.

### `PlayerNeeds.ts`

Extend `tickRidingStamina()` minimally to accept the Riding-derived effect. Do not create another stamina system.

### `AnimalAgent.ts`

Change only the mounted movement API if necessary to accept effective speed. Never import or reference player skills.

## Non-goals

- redesigning the mount system,
- changing horse AI movement,
- changing horse stamina,
- changing player sprint stamina,
- changing Riding XP,
- changing stability/fall mechanics,
- new riding levels/perks,
- animation/VFX,
- horse combat,
- horse inventory/equipment,
- persistence redesign,
- unrelated fauna refactors.

## Implementation order

1. Recon authoritative human and horse speed values and all mounted speed modifiers.
2. Establish and test the horse > human speed invariants.
3. Add Riding-derived mounted speed through the existing mounted movement seam.
4. Extend riding stamina with the Riding-derived modifier.
5. Add focused tests for speed, stamina and invariants.
6. Run typecheck, lint and relevant tests.
7. Provide browser/manual verification steps.

## Relevant code

Verify current call paths before editing:

- `src/app/actions/mountActions.ts`
- `src/player/PlayerSkills.ts`
- `src/player/PlayerNeeds.ts`
- `src/fauna/AnimalAgent.ts`
- current authoritative player movement implementation.

Do not assume these are the only relevant files.

## Tests

### Speed

- minimum Riding uses horse baseline,
- higher Riding increases mounted speed,
- speed modifier is monotonic,
- minimum-skill horse walk > human walk,
- minimum-skill horse sprint > human sprint,
- slowest rideable horse satisfies both invariants,
- existing horse movement modifiers compose correctly,
- normal AI horse movement is unchanged.

### Stamina

- minimum Riding preserves 3/s,
- higher Riding reduces drain,
- drain reduction is monotonic,
- stationary riding regenerates normally,
- player sprint stamina is unchanged,
- mount stamina is unchanged.

### Regression

- Riding XP unchanged,
- stability/fall unchanged,
- fall damage unchanged,
- mount/dismount unchanged.

## Manual verification

1. Mount the slowest available horse.
2. At low/minimum Riding compare horse walk with player walk.
3. Confirm horse is faster.
4. Compare horse sprint with player sprint.
5. Confirm horse remains faster.
6. Increase Riding and repeat.
7. Confirm mounted speed increases.
8. Ride the same route for a fixed period at low and higher Riding.
9. Confirm stamina drains more slowly at higher Riding.
10. Stop and confirm normal regeneration remains unchanged.

## Architectural constraints

- Reuse existing mount, skill and stamina systems.
- Keep `AnimalAgent` independent of player state.
- Keep horse base/AI movement separate from player Riding effects.
- Preserve horse > human speed independently of skill.
- Keep 3/s as minimum-skill riding drain.
- Prefer named deterministic functions/constants over inline tuning.
- Avoid unrelated refactors.
- Add concise JSDoc with `@domain fauna` for new public/architectural functions where useful.

## Completion criteria

- [ ] Authoritative human/horse movement values identified.
- [ ] Minimum-skill horse walk > human walk.
- [ ] Minimum-skill horse sprint > human sprint.
- [ ] All rideable horse variants satisfy the invariant.
- [ ] Riding skill increases mounted speed.
- [ ] Speed modifier is monotonic and tunable.
- [ ] Minimum Riding preserves 3/s stamina drain.
- [ ] Higher Riding reduces stamina drain.
- [ ] Existing Riding XP/stability/fall behaviour unchanged.
- [ ] Focused tests pass.
- [ ] Typecheck/lint pass.
- [ ] Browser/manual verification completed by the player.

**Zrób git commit i push do main, rebase jeżeli trzeba**
