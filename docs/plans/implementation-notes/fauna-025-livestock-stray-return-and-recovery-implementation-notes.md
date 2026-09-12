# Implementation Notes: fauna-025 — Livestock stray return and recovery

**Prepared:** 2026-09-12  
**Plan:** `fauna-025-livestock-stray-return-and-recovery.md`

## 1. Dependency reality / implementation gate

`fauna-025` is correctly `planned`, but its direct dependency `fauna-024` is also still `planned` on current `main`.

There is therefore no production stray state/API to extend yet: current code has no `AnimalStrayState`, `startLivestockStray()` or equivalent. Treat the final `fauna-024` implementation as the contract boundary for this plan. Do not pre-implement a second provisional stray representation in `fauna-025`.

The implementation agent should first verify the final `fauna-024` symbols. Where they differ from the names used below, preserve their semantics and extend them rather than reshaping them merely to match this document.

## 2. Current architecture to preserve

Livestock is the normal `AnimalAgent`, persisted per individual through `src/settlement/livestock.ts` / `LivestockRegistry`. `AnimalOwner` remains authoritative ownership; household ownership must not change while the animal is stray or returning.

Important existing locomotion facts:

- `AnimalAgent.home` is already the anchor for ordinary roaming and trip return,
- settlement livestock passes the explicit `LIVESTOCK_WANDER_RADIUS = [3, 6]` override from `src/settlement/livestock.ts`,
- ordinary wander targets are chosen around `home`,
- `AnimalAgent` already owns one committed `trip: AnimalTrip | null`,
- `wander()` calls `tickTrip()` before ordinary local wandering,
- threats/combat/fire/guard branches pre-empt `wander()` and therefore naturally interrupt a committed trip without deleting it,
- `AnimalAgent.clampBounds()` already exempts an active trip from the ordinary home-radius clamp,
- `isWalkable()` is the shared physical water/collider gate used by autonomous movement,
- `animalRoaming.ts` owns `AnimalTrip` plus the shared bounded `probeBestPointNear()` primitive.

Do not introduce `LostAnimalAI`, a second movement controller, or quest-owned movement.

## 3. Exact files / symbols

### `src/fauna/AnimalAgent.ts`

Relevant existing seams:

- `AnimalAgentDeps.wanderRadius`
- `home`
- `wanderRadius`
- `trip: AnimalTrip | null`
- `wander(dt)`
- `tickTrip(dt)`
- `continueTrip(dt)`
- `pickWanderTarget()` / `pickPointNear()`
- `isWalkable()`
- `clampBounds()`
- `snapshot()` / `hydrate()`
- existing threat/prey/predator/needs branches above the wander tail

Keep return integration small. Prefer a derived stray-return resolver/helper and a narrow commitment seam over another large branch inside `update()`.

### `src/fauna/animalRoaming.ts`

Current types:

```text
AnimalTripKind = 'water' | 'settlement'
AnimalTripPhase = 'traveling' | 'staying' | 'returning'
AnimalTrip = { kind, destination, phase, stayRemainingSec }
```

`probeBestPointNear()` is the existing bounded radial candidate primitive. Reuse it if a walkable point around the home anchor must be selected.

A `home-return` trip is semantically different from the current outbound/stay/return lifecycle: it starts away from home and has no useful `staying` phase. Do not force fake stay semantics merely to fit the current state machine. Either minimally generalize `AnimalTrip` so a committed destination can represent this one-way trip, or use the generic committed-destination seam delivered by `fauna-024` if that plan introduces one.

Do not add a second `strayTrip` field alongside `trip`.

### `src/settlement/livestock.ts`

Relevant current ownership/persistence:

- `LivestockSaveRecord`
- `LivestockPersistence`
- `LivestockRegistry`
- `livestockToSaveRecord()`
- `spawnAnimalFromRecord()`
- `LIVESTOCK_WANDER_RADIUS = [3, 6]`

`LivestockSaveRecord` already composes `AnimalSaveState`, so persisted stray fields from `fauna-024` should continue to round-trip through that existing path. `fauna-025` should not add another save collection.

### `src/fauna/animalOwnership.ts`

Use the existing household-owner predicate/shape. Natural stray classification must be restricted to live household-owned livestock. Player-owned animals, merchant/unowned animals, wild fauna and rats are outside this plan.

### `src/fauna/faunaDecision.ts` and needs/threat paths in `AnimalAgent`

The top-level fauna priority table is threat/social arbitration; hunger/thirst seeking is still resolved inside lower predator/prey branches rather than through an NPC-style unified pressure system.

Therefore the plan's “return-home pressure” must be implemented against the architecture that actually exists. Do not invent a generic fauna pressure framework just for this feature.

## 4. Natural stray classification

`fauna-024` intentionally does not implement autonomous natural-lost detection. Add that here by evaluating the animal locally during its existing update, not by scanning all livestock from a manager.

Recommended pure state-machine shape:

```text
not eligible / back inside home band
→ reset outside-home grace

eligible + outside normal home area
→ accumulate outside-home duration

outside long/far enough
→ call fauna-024's one authoritative begin-stray operation
```

Use the existing livestock home semantics as the baseline. The fixed `[3, 6]` wander band means the outer `6 m` value is the concrete normal local target radius today, but do not treat one frame just beyond that boundary as “lost”. The exact classification threshold/grace should be centralized in the stray helper/module, with distance derived relative to the current wander/home contract rather than copied into unrelated call sites.

Do not classify from “was scared” or “was fleeing”. Classification is spatial/temporal world state. Predator flee, thunder scare and any later displacement source all become equivalent inputs naturally.

Persist the grace accumulator only if losing it on stream-out/load would materially let a genuinely displaced animal evade classification indefinitely. Prefer reconstructible/minimal state; do not persist per-frame return machinery.

## 5. Return intent: fit the existing two-tier behaviour pipeline

There is no generic animal pressure scorer to extend. Implement return as a low-priority locomotion intent that becomes eligible only when higher-priority state has released control.

A small pure resolver should answer something equivalent to:

```text
not stray / dead
→ no return

active threat/scare/combat or current mandatory override
→ defer

critical hunger/thirst or committed survival trip
→ defer

eligible + retry gate open
→ request/continue home-return commitment
```

Do not add return as a priority above threat/fire/guard behaviour. The existing architecture already provides the desired threat interruption if return is consumed from the same low-priority movement tail as trips/wander.

Needs require explicit care: because hunger/thirst logic is ad hoc inside predator/prey branches, trace those branches after `fauna-024` lands and place the return check only after urgent source-seeking has had its intended opportunity. Do not silently make return suppress water/food seeking for a critically needy animal.

## 6. One locomotion owner

Preferred architecture after `fauna-024`:

```text
stray return resolver
→ commit one home-return destination through existing trip/committed-movement seam
→ ordinary AnimalAgent steering/path fallback/isWalkable
```

A return attempt should target a valid walkable point in the home area. `home` itself is usually the natural anchor, but if it is currently invalid/blocked, use a bounded `probeBestPointNear(home, ...)` search rather than teleporting or repeatedly steering into an invalid point.

The search happens when committing/retrying an attempt, not every frame.

The current trip implementation has useful interruption semantics: when another behaviour prevents `wander()` from running, the committed trip simply remains intact and resumes later. Preserve that property unless a survival need intentionally cancels the return commitment.

If return is cancelled for a need/threat detour, keep `stray.active`; only arrival in the canonical return radius clears the episode.

## 7. Existing trip conflict to resolve explicitly

`AnimalAgent` currently permits only one `trip`. A strayed animal may already have a water trip or a `fauna-024` displacement commitment.

Use one deterministic policy, not parallel commitments:

1. direct threat/flee always controls the current tick,
2. `fauna-024` initial displacement must finish/cancel according to its own contract before autonomous return begins,
3. an urgent hunger/thirst survival trip may defer/cancel return,
4. once survival movement is no longer urgent, return can be recommitted,
5. ordinary periodic water-trip opportunity must not start while a stray return should dominate.

If `fauna-024` generalizes the trip kind, extend that same arbitration. Do not let `maybeStartWaterTrip()` randomly steal the only committed movement slot from an active return attempt.

## 8. Retry semantics

Return is not guaranteed. Failed target selection/pathing must not clear stray or teleport the animal.

Keep retry state cheap and runtime-only where possible:

```text
attempt unavailable/interrupted
→ clear only return commitment
→ bounded cooldown
→ retry if still stray and higher-priority needs/threats permit
```

Do not retry candidate probing every tick. A short cooldown or existing retarget cadence is sufficient; exact tuning belongs in one fauna module.

A save/load may forget an in-flight retry timer/commitment and reconstruct intent from:

```text
stray.active + alive + position + home
```

That is preferable to persisting a second movement FSM unless `fauna-024` establishes a different canonical persistence contract.

## 9. Return detection must reuse fauna-024

`fauna-024` owns the authoritative returned predicate/clear operation. Reuse it verbatim; do not create a second radius or quest-specific “returned” flag.

When it fires:

```text
clear authoritative stray episode
→ fauna-024 survival assist becomes inactive
→ clear temporary lead if still active
→ clear runtime home-return commitment/retry state
→ normal household livestock roaming resumes
```

Owner and `animalId` remain unchanged.

Run this check on the animal/local livestock update path. No settlement-wide or global per-frame search is needed.

## 10. Quest compatibility boundary

`fauna-024` is expected to expose the typed world lookup with states equivalent to:

```text
lost-alive
returned
corpse-uninspected
corpse-inspected
unavailable
```

`fauna-025` should not add quest state. A self-return only changes fauna state through the canonical return predicate; the existing `fauna-024` lookup must then naturally report `returned`.

Critical regression: any `fauna-024` materialization/start hook must remain idempotent. If an animal has already returned, restoring/re-materializing the quest must not call displacement again. Fix that at the `fauna-024` domain-operation/materialization guard if necessary, not by adding a `returnedBySelf` quest flag.

Natural stray episodes do not automatically create quests. `quests-progression-016` remains the owner of opportunity selection/materialization. This plan only makes natural stray state available for that layer to observe.

## 11. Persistence / streaming

Current livestock streaming snapshots the live `AnimalAgent` on settlement unload/save and reconstructs it from `LivestockSaveRecord`.

After `fauna-024`, verify that this path preserves:

- displaced position,
- `AnimalOwner`,
- active stray state,
- corpse/inspection state,
- returned/cleared state.

`fauna-025` should normally add no new authoritative persistence beyond any natural-classification grace that proves necessary. Home-return commitment, chosen retry point and retry cooldown should be reconstructible runtime state.

Important regression: deterministic household-slot spawning must hydrate the saved far-away position; stream-in must not snap an active stray back to its household spawn/home anchor.

## 12. Off-screen / adaptive-simulation boundary

Current detailed livestock simulation exists only while its settlement/animal is active; `LivestockRegistry` preserves snapshots across unload. Do not add a global background ticker just for stray return.

Represent the durable semantics so a later remote simulation can reason from simple data:

```text
stray active
current position
home/origin
owner
alive/dead
```

V1 detailed walking may remain active-agent-only. The return decision must not inspect player/camera distance as a semantic requirement.

## 13. Tests with highest architectural value

Prefer pure/helper tests plus a few integration regressions; avoid requiring full rendered `AnimalAgent` scenes where a resolver test is enough.

Most important cases:

1. classification grace resets when the animal comes back inside the home band,
2. sustained/far displacement calls the same authoritative `fauna-024` start operation once,
3. player-owned/unowned/wild/dead animals never natural-classify as household stray,
4. threat/scare defers return without clearing stray,
5. urgent hunger/thirst can defer return,
6. return commitment uses the existing single trip/locomotion seam,
7. periodic water-trip start cannot override an eligible committed home return,
8. interrupted/cancelled return can retry after its gate,
9. failed destination probing never teleports or clears stray,
10. canonical home-radius arrival invokes `fauna-024` clear/returned semantics,
11. active lost-livestock quest observes self-return as `returned`,
12. restore/materialization after self-return does not redisplace the animal,
13. save/load of an active stray reconstructs return intent from authoritative state,
14. no manager-level per-frame livestock scan is introduced.

## 14. Suggested implementation order

1. Confirm `fauna-024` is implemented and map its final stray/start/clear/lookup symbols.
2. Add pure natural-stray classification state/helper and local integration.
3. Add pure return eligibility/defer resolver matching the existing threat + ad-hoc needs pipeline.
4. Generalize/reuse the single `AnimalTrip`/committed destination seam for one-way home return.
5. Add valid home-area destination selection and bounded retry.
6. Ensure water-trip/displacement/return commitment arbitration is deterministic.
7. Wire canonical `fauna-024` return clear and quest lookup regressions.
8. Add persistence/streaming tests; persist only genuinely authoritative extra state.
9. Update `docs/state/fauna.md` and quest/persistence state docs only where the implemented contracts changed.

## 15. Guardrails for implementation agent

- `fauna-024` must be implemented first; do not invent its missing production API in parallel.
- Current code wins over plan wording.
- Do not create a generic fauna pressure framework in this plan.
- Do not create a second movement/trip field for return.
- Do not make return outrank threats or critical survival needs.
- Do not make storms directly set stray state.
- Do not make quest acceptance enable/disable autonomous return.
- Do not transfer household ownership to the player.
- Do not teleport on failed return navigation.
- Do not add global per-frame scans or camera/player-dependent semantics.
- Do not perform unrelated `AnimalAgent` refactors.
- Add JSDoc with `@domain fauna` to important new public classification/return operations.
- Do not run browser verification; user performs it manually.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
