# Plan: Wildlife Day/Night Rest and Den Defense

**Created:** 2026-09-16
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~fauna-028~~
**Domain:** `fauna`
**Subdomains:** `habitat` `behavior`
**Tags:** `day-night` `rest` `den-defense` `predators`
**Roadmap:** -

## Goal

Make wild animals react to the world day/night cycle and defend an existing den/home habitat when a human intrudes, without changing current spawn-point placement, spawner generation, respawn rules or habitat locations.

The result should reuse the existing `AnimalAgent` / `AnimalLife` / fauna decision pipeline and existing `spawnPointId` ↔ habitat-spawner relationship. It must not introduce a second schedule system, a fauna copy of NPC `VigorState`, or a new den registry.

## Current state

- `AnimalAgent` already receives `dayFactor` in `AnimalUpdateContext`; fauna player perception already consumes it through `playerAwareness.ts`.
- `AnimalLife` owns fauna hunger/thirst/stamina. `VigorState` is explicitly NPC-only; fauna should continue to use stamina for physical fatigue/rest decisions.
- `AnimalDef` is the canonical species tuning table and already follows declarative capability/config blocks (`metabolism`, `roaming`, `trips`, etc.).
- Wild local roaming is home-relative. Existing habitat spawners (`rockDen`, `thicket`, `wolfDen`) already own stable positions/lifecycle separately from individual animals.
- Animals spawned from a habitat are already linked through `AnimalAgent.spawnPointId`; this relationship is used by spawner lifecycle and quests.
- Predator-vs-human intent is already centralized in `predatorHumanDecision.ts` and should remain the only attack/flee/ignore scorer for ordinary human encounters.
- Fauna top-level arbitration is already centralized in `faunaDecision.ts`; the feature must extend that pipeline rather than add a parallel update loop.

## Scope

### 1. Declarative species activity cycle

Extend `AnimalDef` with a small optional activity/rest configuration instead of hardcoding species branches.

Recommended contract:

- activity profile such as `diurnal`, `nocturnal` or `crepuscular`,
- strength of time-of-day rest bias,
- optional stamina threshold / rest tuning only where the species needs to differ from shared defaults.

The config represents a **bias**, not a fixed schedule. A nocturnal animal should be more likely to rest during daylight, but hunger, thirst, threats, combat, fleeing, trips and other urgent behaviour must still override rest.

Initial species tuning should cover wild animals only. Livestock and rats must keep current behaviour unless explicitly opted into the config.

### 2. Rest pressure from time-of-day + stamina

Add a small pure fauna helper (for example `animalActivity.ts`) that derives whether routine rest is currently desirable from:

- species activity profile,
- `dayFactor` / current light phase already supplied to `AnimalAgent`,
- current stamina ratio,
- deterministic per-animal variation if needed to avoid synchronized populations.

Do not add fauna `VigorState`.

Rest should restore stamina through the existing `AnimalLife`/stamina mechanisms and use the existing sleep/rest presentation if available. If the current animation set has no dedicated sleep clip for a species, behaviour correctness takes priority; presentation may remain idle in V1.

Rest must be interruptible immediately by high-priority branches: player/NPC threat, combat, flee/scare, fire avoidance, rabies/frenzy, mounted/led ownership states, urgent hunger/thirst pursuit and committed travel.

### 3. Rest near the animal's existing home

Routine time-of-day rest should prefer returning toward the animal's existing `home`/habitat position rather than resting at an arbitrary point reached during roaming.

This must reuse current home-relative movement and existing habitat/spawn linkage. Do not relocate any spawn point, regenerate spawners, move den props, or alter current worldgen placement.

Animals without a meaningful habitat/spawn-point binding may rest within their existing home-relative roaming area; this plan does not create new dens for them.

### 4. Den/home defense context

Add a pure helper that determines a territorial-defense modifier/context from:

- the animal's existing `spawnPointId`,
- the matching existing habitat spawner position/type,
- human distance to that habitat,
- species eligibility/config,
- whether the animal is alive/free and still associated with that habitat.

V1 should target real den-like predator habitats, especially `wolfDen`; other existing habitat types may opt in only where semantics fit. A generic ring-spawn/home point must not automatically become an aggressively defended den.

No new world object, persistence registry or spawn-point identity should be introduced.

### 5. Integrate den defense with predator-vs-human intent

Extend `PredatorHumanDecisionInput` with a territorial/den-defense signal rather than adding a second "attack player near den" subsystem.

Being close to a defended den should:

- increase attack pressure / reduce ordinary flee pressure for eligible predators,
- remain species-tunable,
- still respect existing hard safety/context modifiers such as low HP, fire and human crowd suppression unless explicitly justified otherwise,
- use the existing encounter commitment so an animal does not oscillate every tick at the den boundary.

The den modifier should be continuous or banded by distance, not a single global boolean. Outside the defense radius, current predator-human behaviour should remain unchanged.

Do not reuse quest-only `humanTaste` as territorial aggression; these are separate causes and should compose explicitly in the same scorer.

### 6. Decision priority and interruption

Integrate routine rest as a low-priority behaviour inside the existing fauna decision structure.

Required ordering principle:

`combat/threat/flee/scare/fire/rabies/etc. > urgent needs/committed trip > den response where encounter exists > routine rest > ordinary roaming`

Exact placement must follow the current `faunaDecision.ts` + predator/prey branch structure discovered during implementation; do not create a separate scheduler.

A resting animal that notices a human entering its defended den radius must wake/react in the same update path used by ordinary perception and predator-human intent.

## Non-goals

- No changes to spawn-point coordinates, spawner placement, worldgen or habitat generation.
- No new den/tree/vegetation placement.
- No fauna `VigorState`.
- No reproduction, nesting, offspring defense or seasonal denning.
- No new persistence format solely for day/night rest state; derive routine activity from current world time and current animal state.
- No player-only trigger volume around dens.
- No quest-specific aggression rules beyond continuing to compose with existing quest modifiers.
- No broad rewrite of `AnimalAgent` or the fauna decision architecture.

## Relevant files / integration points

- `src/fauna/animalDefs.ts` — species-level declarative activity/territorial tuning.
- `src/fauna/AnimalLife.ts` — existing stamina state and restore/drain semantics; reuse rather than add vigor.
- `src/fauna/AnimalAgent.ts` — consumes `dayFactor`, owns current home/spawn linkage and executes selected behaviour.
- `src/fauna/faunaDecision.ts` — top-level fixed-priority fauna arbitration.
- `src/fauna/predatorHumanDecision.ts` — extend existing predator-vs-human scoring with den-defense context.
- `src/fauna/predatorIntentCommitment.ts` — preserve encounter commitment semantics when territorial pressure changes.
- `src/fauna/AnimalSpawner.ts` / `src/fauna/createFauna.ts` — existing habitat spawner identity/position and `spawnPointId` association; read only for this feature, no placement changes.
- `src/fauna/playerAwareness.ts` — current day/night-aware human perception; do not duplicate its perception rules.
- `src/fauna/animalUpdateCadence.ts` — existing adaptive update cadence; new routine logic must work correctly under skipped/accumulated movement updates.

## Architectural decisions

1. **Species data, not species branches.** Activity cycle and territoriality belong in declarative fauna configuration.
2. **Stamina, not Vigor.** Fauna already owns stamina physiology; Vigor stays NPC-only.
3. **Existing habitat identity is authoritative.** `spawnPointId` + current spawner/home data defines whether there is a den worth defending.
4. **Existing human-intent scorer remains authoritative.** Territorial defense modifies `predatorHumanDecision`; it does not bypass it.
5. **Rest is pressure/bias, not schedule.** Time of day makes rest more desirable but never freezes animals into clock-driven behaviour.
6. **No spawn/worldgen changes.** Existing spawn locations and den placement are explicitly out of scope.
7. **Deterministic simulation.** Any per-animal staggering/random-looking rest timing must derive from stable identity/time inputs, not `Math.random()` per frame.

## Implementation outline

1. Add pure activity-cycle helpers and tests.
2. Extend `AnimalDef` with declarative activity/territorial config and tune initial wild species.
3. Wire low-priority routine rest into the existing `AnimalAgent`/decision flow, returning toward existing home where appropriate.
4. Expose existing habitat/spawner position to the predator encounter calculation without changing ownership or placement.
5. Add territorial-defense input/scoring to `predatorHumanDecision.ts` and preserve commitment semantics.
6. Add/extend unit tests for time-of-day rest bias, stamina interaction, den-distance aggression, fire/crowd/low-HP composition and unchanged behaviour outside den radius.
7. Add JSDoc with `@domain fauna` on new important public/pure helpers so preflight can discover the feature boundary.

## Verification

Automated:

- `pnpm typecheck`
- targeted Vitest suites for new activity helper and `predatorHumanDecision.ts`
- relevant `AnimalAgent` / fauna decision tests if touched
- `pnpm lint`
- `pnpm build`

Manual browser verification by the User:

- observe nocturnal species across day/night transition: daylight increases routine resting but does not prevent urgent reactions,
- observe a diurnal species at night and verify analogous bias,
- approach a resting predator and verify it wakes/reacts,
- approach an eligible existing `wolfDen` and verify wolves become more defensive near it,
- move away from the den and verify aggression returns to ordinary predator-human behaviour,
- verify fire/crowd/low-HP behaviour still influences the encounter,
- verify current spawn points, den locations and population placement are unchanged.

## Done when

- wild fauna has species-driven day/night activity bias,
- routine rest is tied to stamina and time of day without adding fauna vigor,
- eligible predators defend existing den habitats through the existing human-intent scorer,
- resting is interruptible by existing high-priority behaviour,
- animals outside a defended den radius retain current predator-human behaviour,
- no spawn point/worldgen/persistence-location behaviour changes,
- tests/build pass and browser verification remains for the User.

> **Zrób git commit i push do main, rebase jeżeli trzeba**