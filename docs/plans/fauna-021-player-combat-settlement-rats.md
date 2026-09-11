# Plan: Player combat for settlement rats

**Created:** 2026-09-11
**Status:** `verification needed` 🔍
**Type:** bug
**Priority:** high · **Effort:** S
**Depends on:** ~~fauna-016~~ ~~quests-progression-013~~
**Domain:** `fauna`
**Subdomains:** `predation`
**Tags:** `rats` `combat` `player`
**Roadmap:** -

## Goal

Settlement rats must be valid player melee and ranged combat targets through the existing living-combat pipeline, without becoming full animal interactables and without a second rat HP or quest kill counter.

This is a follow-up to `fauna-016` / `quests-progression-013`. Those plans assumed player melee already worked because a rat is a normal `AnimalAgent`. Targeting sources never read `settlement.rats`, so the player cannot attack them. Do not rewrite those historical plans as if this gap was always in scope.

## Current behaviour

Rats are `AnimalAgent('rat')` instances owned by `createSettlementRats` and exposed as `settlement.rats`. They are not in `fauna.getAgents()` and not in `settlement.livestock`.

Player combat collectors only scan livestock + wild fauna:

- `collectLivingCombatTargets` / `collectRangedAnimalCandidates` in `src/player/playerCombat.ts`
- `buildCombatTarget` in `src/app/interactables.ts`
- melee candidates in `src/app/gameLoop.ts` from `kind === 'animal'` interactables

Dog → rat combat already works via `nearbyRats`. Death already goes through `AnimalAgent.takeDamage` → `collapse` → `onDeath` → `countAliveRats` (`!isDead()`). Infestation quests already observe live count.

## Change

Reuse `LivingCombatTarget` / `AnimalAgent.takeDamage`. Add `settlement.rats` next to livestock in one shared visitor used by the three combat collectors.

Gaze: push live rats into `buildInteractables` only while a melee or ranged tool is held, via existing `pushLiveAnimalCandidate` / `animalPromptLabel` (`Atakuj: szczur`). Do not offer unarmed Observe / feed / mount / milk / lead. Do not add rat corpse harvest in this plan.

NPC targeting, dog pest-chase, quest polling, and rat HP (`MAX_HP.rat = 6`) stay unchanged.

## Tests

- live rat enters living and ranged acquisition
- dead rat is not a target
- melee / ranged hit can apply damage through the same `takeDamage` path
- death lowers authoritative alive-rat count
- livestock and NPC targeting still work

## Non-goals

- `RatCombatManager`
- second HP state
- quest kill counter
- forcing rats into `fauna.getAgents()` or livestock
- full animal interaction for rats
- NPC rat-hunting job

## Implementation notes

`docs/plans/implementation-notes/fauna-021-player-combat-settlement-rats-implementation-notes.md`
