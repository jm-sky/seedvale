# Plan: Domestic livestock safe flee

**Created:** 2026-09-17
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** none
**Domain:** `fauna`
**Subdomains:** `domestication` `prey`
**Tags:** `livestock` `flee` `predators` `safety`
**Roadmap:** -
**Model:** Sonnet, Composer

## Goal

Make domestic livestock flee predator danger toward meaningful contextual safety instead of only taking a short generic away-from-threat step and then returning to ordinary home-bounded behaviour.

This plan changes **where** threatened livestock tries to escape. Fauna already has sprint movement and immediate threat cadence; do not add another animal run state.

Target flow:

```text
live predator threat against domestic livestock
→ existing high-priority fauna flee behaviour
→ resolve contextual safe anchor
→ reject anchor if first movement would approach/cross the attacker
→ sprint toward safe direction/anchor
→ fallback to existing away-from-threat flee when no safe anchor is valid
→ danger clears → ordinary livestock roaming/trips resume
```

## Current foundation verified on `main`

### Livestock is ordinary `AnimalAgent`

`docs/state/fauna.md` and `src/fauna/AnimalAgent.ts` confirm livestock shares the same agent/runtime as wild fauna. Do not introduce a livestock FSM or movement controller.

### Sprint already exists

`AnimalDef` owns `walkSpeed` and `sprintSpeed`; `AnimalAgent` owns `walkSpeedNow()` / `sprintSpeedNow()`. Existing threat/flee/chase behaviour already uses sprint movement.

The missing behaviour is contextual destination semantics, not locomotion speed.

### Existing flee is reusable fallback

`AnimalAgent.fleeFrom()` is the current away-from-threat movement primitive used by multiple danger paths. Preserve it as the fallback rather than replacing every caller.

### Livestock already has ownership/home context

`AnimalAgent` already has stable `home` semantics and household-owned livestock carries `ownerHouseId`. Ordinary livestock movement is home-bounded through the existing roaming/clamp logic, including pasture-roam handling.

Use these existing facts; do not scan all households/settlements from inside `AnimalAgent`.

## Scope

### 1. Contextual safe-anchor contract

For domestic household livestock under a real predator threat, resolve safety candidates in this preference order when available:

```text
1. responsible shepherd/handler position
2. owning household/livestock home context
3. owning settlement safe-area context
4. existing away-from-threat flee fallback
```

The exact data shape should be the narrowest read-only context that can be supplied through current fauna/settlement composition seams.

Do not make `AnimalAgent` discover arbitrary NPCs, houses or settlements globally.

### 2. Safety-direction validation

A semantic "safe" anchor must never make the animal initially run toward the attacker.

Before committing to a candidate:

- compare the initial movement direction with the live threat position,
- reject a candidate that reduces separation when a valid away-from-threat alternative exists,
- preserve existing collision/slope/water traversal rules,
- never teleport the animal.

The anchor is a directional preference, not a path guarantee.

### 3. Preserve existing fauna flee execution

Once a safe direction/destination is chosen:

- retain existing high-priority flee behaviour,
- retain `sprintSpeedNow()`,
- retain immediate update cadence,
- retain navigation/watchdog/water/slope semantics,
- retain normal threat-clear transition.

Do not add `isRunning`, another stamina resource, or species-specific sheep-only code.

### 4. Apply generically to domestic livestock

The resolver should work for household livestock such as sheep, cow, horse, donkey and poultry where current movement capability allows it.

Species may naturally differ because existing `AnimalDef`, water/traversal and model movement rules differ; do not encode separate flee systems per species.

### 5. Interaction with ordinary home bounds

Threat escape must not be immediately undone by ordinary local roaming/home clamps while the high-priority flee episode is active.

Reuse the existing pattern where committed/high-priority movement can temporarily own destination semantics. Once the danger clears, ordinary home/pasture rules become authoritative again.

## Expected files

Likely implementation surface, subject to current-code verification:

- `src/fauna/AnimalAgent.ts` — existing flee execution and temporary escape commitment integration.
- a small pure fauna helper for safe-anchor selection if that keeps `AnimalAgent` focused/testable.
- `src/fauna/createFauna.ts` and/or existing settlement livestock composition seam — supply bounded ownership/safety context.
- `src/settlement/livestock.ts` only if it already owns the required household/home/pasture data hookup.
- targeted fauna tests.

Add JSDoc with `@domain fauna` to important reusable/public helpers.

## Non-goals

- NPC run locomotion (`npc-046`).
- Shepherd defend/flee behaviour (`npc-047`).
- Shepherd weapons/loadout (`npc-047`).
- Local NPC alarm/assistance (`npc-048`).
- Guard response (`npc-048`).
- New livestock pathfinder/FSM.
- Teleport-to-home safety.
- Persistence of transient flee destinations.
- Player/camera-dependent protection.

## Verification

Automated tests should cover at minimum:

- ordinary existing animal flee continues to use `sprintSpeedNow()`,
- domestic threatened livestock prefers a provided valid shepherd/handler anchor,
- falls back to household/home then settlement-safe context when earlier anchors are absent,
- rejects an anchor whose initial direction moves toward the predator,
- no valid safe anchor → existing `fleeFrom()` behaviour remains available,
- threat escape is not immediately cancelled by ordinary home clamp/roam rules,
- threat clear restores ordinary home/pasture roaming semantics,
- no global NPC/settlement scan is introduced from `AnimalAgent`,
- `pnpm type-check`,
- targeted Vitest suites for fauna flee/roaming behaviour.

Manual browser verification belongs to the User:

- put owned livestock at pasture near a predator,
- attacked livestock visibly sprints rather than standing/walking,
- when safe, the animal heads toward shepherd/home/settlement context instead of a meaningless short vector,
- it never initially runs through the predator to reach that anchor,
- after danger ends the survivor returns to normal behaviour without a stuck flee state.

> **Zrób git commit i push do main, rebase jeżeli trzeba**