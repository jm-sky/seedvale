# Plan: Player Skills — Sneak

**Created:** 2026-08-15
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** 120

## Goal

Introduce the foundations of a reusable player Skills system and implement the first concrete skill, **Sneak**, using the existing animal perception system rather than creating a parallel detection mechanism.

This phase establishes the mechanics and integration only. There is **no XP, skill progression, levelling, unlock system, or persistence work** yet. Sneak is fixed at **50%**.

## Scope

### 1. Skills foundation

- Add a small, explicit player skill model owned by the player domain.
- Represent skill identity/value separately from the active state of a skill.
- Start with `sneak = 0.5` as a fixed value.
- Keep the model extensible for future skills without implementing them now.
- Avoid a generic framework/registry abstraction unless the existing code clearly requires it.

### 2. Sneak active state

- Add `Sneak` active/inactive state to the player.
- Activation and deactivation happen through the existing **Skills menu/UI** so the same interaction works on desktop and mobile.
- Sneak is a persistent active mode while enabled; it is not hold-to-activate.
- Do not automatically deactivate merely because the player stops moving.
- Disable/deactivate Sneak when an existing player action makes the mode invalid, only where the current player/action architecture already provides such a transition. Do not invent a parallel action-state system.

### 3. Movement integration

Sneak is primarily a stealth modifier, but it also makes the player slower while active.

- Walking: approximately **30–50% slower**.
- Running: approximately **30–50% slower**.
- Sprinting: approximately **30–50% slower**.
- Preserve the existing movement/sprint/stamina systems; apply Sneak as a modifier to their existing speed calculation rather than duplicating movement logic.
- Choose concrete constants from the existing movement implementation and keep them easy to tune.
- Sprint remains possible while Sneak is active, but the resulting stealth benefit is low.

### 4. Animal detection integration

Extend the existing deterministic animal player-awareness pipeline from Plan 120.

Detection should account for:

- fixed player Sneak skill value (`0.5`),
- Sneak active state,
- player movement state:
  - stationary = strongest Sneak effect,
  - walking = strong effect,
  - running = reduced effect,
  - sprinting = low effect, but Sneak remains active,
- day/night factor,
- existing forest/vegetation factor,
- existing terrain/ground information where it is already available and inexpensive to use.

Do **not** create a second animal detection system. Feed Sneak into the existing `playerAwareness` probability calculation.

The exact modifier curve should be explicit, deterministic, clamped and unit-testable. Avoid frame-rate-dependent randomness or per-frame probability rolls.

### 5. Environment / cover

Use existing world information where practical:

- day/night should reuse the existing day factor,
- forest/vegetation should reuse the existing `forestFactor` or equivalent existing world signal,
- ground/terrain type may modify stealth only if the current player/terrain systems expose the information without introducing expensive per-frame queries.

Do not introduce a new foliage/cover simulation solely for Sneak.

### 6. Visual feedback

Provide clear feedback that Sneak is active.

- Reuse existing player animation/movement facilities if available.
- A subtle crouched/stealth movement presentation is desirable if it can be implemented through existing animation/state infrastructure.
- Do not block the mechanical implementation on a new animation asset.
- The Skills UI must clearly distinguish active vs inactive Sneak.

## Likely implementation areas

Confirm exact files against current code before implementation. Expected areas include:

- `src/player/` — player skill state and movement modifier integration
- existing Skills/player UI area — activation and active-state presentation
- `src/fauna/playerAwareness.ts` — Sneak contribution to detection probability
- `src/fauna/AnimalAgent.ts` — pass the relevant player stealth/movement state into the existing perception check
- existing day/night and terrain/vegetation APIs — reuse, do not duplicate
- relevant pure-logic tests near `src/fauna/`

## Behaviour targets

At fixed Sneak 50%:

| Situation | Stealth effect |
|---|---|
| Stationary | strongest |
| Walking | strong |
| Running | reduced |
| Sprinting | low |
| Night | additional existing environmental advantage |
| Dense forest/vegetation | additional existing environmental advantage |
| Open terrain | no cover bonus |

These are behavioural targets, not final balance numbers. Keep the concrete coefficients centralized and easy to tune.

## Out of scope

- XP and skill progression
- skill levels
- perks
- character creation/build system
- additional skills
- save/persistence migration specifically for skills
- NPC stealth skills
- new animal perception architecture
- new terrain/foliage simulation
- new animation assets solely for Sneak

## Verification

1. Unit-test pure Sneak/movement modifier calculations.
2. Unit-test Sneak contribution to `detectionProbability` for stationary/walking/running/sprinting cases.
3. Verify deterministic perception remains deterministic.
4. Run the existing test suite and build/typecheck.
5. Browser/manual verification:
   - activate/deactivate Sneak from the Skills UI on desktop,
   - verify the same UI works on mobile layout/input,
   - verify movement is slower while active,
   - verify sprint remains possible but gives only a small stealth benefit,
   - verify animals are harder to detect the player while Sneak is active,
   - compare stationary vs moving player,
   - compare day/night and forest/open terrain.

## Completion criteria

- Skills foundation exists without premature progression machinery.
- Sneak is fixed at 50%.
- Sneak can be toggled from the Skills menu on desktop and mobile.
- Sneak modifies existing player movement rather than replacing it.
- Sneak modifies the existing animal detection probability rather than creating parallel awareness logic.
- Movement, day/night and forest/terrain effects produce the intended relative behaviour.
- Tests and build pass.
- Browser behaviour is manually verified for the gameplay-facing parts.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
