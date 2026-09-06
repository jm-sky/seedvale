# Implementation notes: fauna-016 animal habitats, roaming, water trips and settlement rats

## Current codebase facts

- `src/fauna/createFauna.ts` is still the owner of wild-fauna initial placement. `SPAWNS` uses `SpawnProfile = 'open' | 'meadow' | 'forest' | 'water'`; `deer`/`stag` are currently `open`. `habitatFilterFor()` already consumes the injected `sampleForestFactor`.
- `createFauna.ts` already receives `RoadCorridorSegment[]` from `worldBundle.ts` and has one canonical local `onRoad()` test using `distanceToSegment(..., seg.halfWidth + SPAWNER_ROAD_CLEARANCE)`. Today it is applied only through `spawnerSiteOk()` for cave/thicket/wolfDen placement; ordinary ring spawns do **not** use it. Extend the existing ring-spawn candidate filter instead of adding road state/indexes.
- Herd species use one habitat-filtered anchor and then place members around it (`HERD_CLUSTER_RADIUS`). Road/habitat validation therefore must at least cover the anchor; avoid turning every herd member into an expensive independent global search. Local cluster positions should still remain physically walkable.
- `AnimalAgent` owns `home`, `target`, `wanderTimer` and `wanderRadius`; wild/local movement already goes through its movement/walkability path. `fauna-015` changed that path to use `sampleLocalWater()` + `waterTraversal.ts`, so a trip must reuse `steerToward()`/`isWalkable()`/shared navigation rescue rather than introducing a trip controller.
- `fauna-015` is implemented (plan status `verification needed`). `src/fauna/waterTraversal.ts` is now the fauna-side authority for wading/swimming capability; `terrain/waterSample.ts`/`ChunkManager.sampleLocalWater` are the physical-water authority.
- `src/fauna/faunaDecision.ts` is the top-level behaviour arbitration. Do not hide a new persistent trip state inside an unrelated wander branch if it needs to survive repeated decisions. Trips should either be a small explicit behaviour candidate/state or be resolved inside the normal low-priority branch with a clearly defined precedence below threats/combat/fire/guarding and above ordinary wander.

## Suggested shape

### Habitat / roaming config

Extend `AnimalDef` with the smallest declarative config that is genuinely species-specific, e.g. local roaming range and optional trip policy. Keep spawn habitat selection in `createFauna.ts`; do not move terrain sampling into `AnimalDef`.

For deer/stag, prefer an edge/transition score based on the existing `sampleForestFactor` rather than another binary profile threshold. A small pure helper taking the sampled factor is useful for tests. Reuse the existing bounded `findWalkableNear()` attempt loop and seeded RNG.

`wanderRadius` is currently instance state. Derive it from `AnimalDef` in the constructor (with a default preserving current behaviour) rather than branching on `kind` in `pickPointNear()` or equivalent runtime movement code.

### Trip state

Keep one small committed state on `AnimalAgent`, for example `{ kind, destination, phase, startedAt/... }`, not a second FSM. The destination must be chosen once and retained until completion/cancellation.

Required cancellation/precedence rules should be explicit:

- death/mounted/rabid and high-priority threat/combat behaviour can interrupt a trip;
- interruption should not silently reroll a destination every tick;
- after successful completion/cancellation, normal local behaviour resumes around `home`;
- changing `home` is not required for this plan.

Avoid adding trip selection to the per-frame global scan. Gate opportunity with an existing low-frequency timer or a deterministic world-time bucket/cooldown derived from stable animal id + world time. `AnimalAgent.update()` already receives `worldDays`.

### Water destination

Do not reuse the existing thirst `findWaterTarget()` blindly as the whole trip feature. That method is need-driven and currently searches local candidate points; the new trip may intentionally exceed `wanderRadius` and has different triggering semantics.

However, reuse its physical/source validation conventions and `sampleLocalWater()`. The water-trip selector should be a bounded candidate/probe search performed only when starting a trip. It should return a reachable shoreline/water destination compatible with `AnimalDef.water`; once chosen, movement is normal `AnimalAgent` movement.

Do not scan all rivers/lakes/features. Prefer bounded radial probes around `home`/current position or expose a small bounded terrain query only if the existing sampler cannot find a useful destination cheaply.

## Settlement rats

### Ownership / population

Do not put rats into `settlement/livestock.ts`: that file means household-owned domestic animals and assigns `ownerHouseId`. Rats are wild fauna whose habitat pressure is settlement-derived.

Prefer settlement-local rat population ownership close to the existing loaded settlement/fauna composition point (`createSettlement.ts` / settlement runtime), but instantiate each visible rat as a normal `AnimalAgent`. No `RatManager`.

Pressure evaluation should be low-frequency and bounded per loaded settlement. Inputs already exist:

- `Household.items` with `Household.foodCount()` (`src/settlement/household.ts`),
- settlement food inventory in `SettlementEconomy`,
- household-owned dogs from `settlement/livestock.ts`.

Derive a small target/cap (0–5) from current food availability minus local dog pressure. Spawn/despawn toward that target gradually; do not enforce it every frame.

### Real food loss

Food is concrete `Inventory` state. Reuse `src/items/foodItems.ts` (`FOOD_ITEM_KINDS`, `claimFoodItems()`/existing single-item helpers) and the authoritative owner inventory:

- household food → `Household.items`,
- settlement food → `SettlementEconomy.items`/its food API.

A rat consumption event should atomically remove a small real amount from one selected source. Do not maintain duplicate `ratFoodDamage`, cached food totals or a shadow storage model. Prefer deterministic source selection/tie-breaking so iteration order does not change outcomes.

Do not route rat eating through NPC carry logistics: there is no pickup/deposit leg and no need for `NpcAgent.carried` semantics. Reuse only the inventory claim primitives.

### Combat integration

Adding `rat` to `AnimalKind` should keep it in the normal `AnimalAgent` health/death path. Review exhaustive `Record<AnimalKind, ...>` tables and `src/persistence/saveData.ts`'s `ANIMAL_KINDS` validator when adding the kind; TypeScript will catch some but not all runtime validators/assets/tables.

Dogs currently guard via `dogGuard.ts`/the `dog-guard` candidate in `faunaDecision.ts`, aimed at wolves threatening NPCs. Do not distort that wolf-defense contract. Add a narrowly-scoped pest target seam (or generalize the target resolver cleanly) so a dog may pursue a nearby rat while idle, at lower priority than real household defense/threats. Keep it home-bounded.

NPC rat killing should reuse existing NPC→animal combat only if a nearby rat naturally satisfies current local threat/opportunity rules. Do not add a settlement-wide scan/job merely to satisfy the manual check.

## Persistence / lifecycle warning

Wild ring-spawn animals are not currently a general persistent population model; habitat spawners persist their own lifecycle separately, while household livestock has its own persistence path. Do not accidentally make rat population persistence depend on livestock ownership. For this plan, deterministic settlement pressure + stable low-frequency reconciliation is preferable to introducing a new per-rat save subsystem unless current save architecture already requires `AnimalSaveState` for the chosen integration point.

## Tests worth adding

Keep most tests pure and close to the new helpers:

- deer/stag edge-habitat score/acceptance;
- ring-spawn road rejection using existing corridor geometry;
- `AnimalDef` roaming range → local wander bounds;
- trip opportunity/cooldown determinism and destination commitment;
- trip completion/cancellation restores local behaviour;
- rat pressure clamps to a small target and decreases under dog pressure;
- rat food consumption removes concrete inventory items;
- dog pest targeting remains below existing wolf-guard/threat priorities.

Also extend existing `AnimalKind`/save-data tests for `rat` if the kind enters persisted snapshots.

## Implementation order

1. Add pure habitat/road helpers and species config; change deer/stag + roaming without touching trips.
2. Add minimal committed trip state and deterministic opportunity logic.
3. Add water-trip destination selection on top of fauna-015 traversal.
4. Add `rat` kind/visual fallback and settlement-local pressure/reconciliation.
5. Wire real food consumption, then dog/NPC combat integration.

Keep `createFauna.ts` responsible for wild placement, `AnimalAgent` for per-animal behaviour/movement, terrain for physical water/forest/roads, and settlement/economy objects for their own food state. The implementation should connect these owners rather than move state between them.

## What was actually implemented

Followed the "Implementation order" above closely; no deviation from the ownership boundaries or non-goals.

### 1. Habitat + road avoidance (`createFauna.ts`)

Deer/stag moved from `profile: 'open'` to a new `'edge'` `SpawnProfile`. `habitatFilterFor('edge')` doesn't add a second edge-scoring function — it reuses `AnimalAgent.ts`'s existing `forageEdgeScore` (already peaking at ~0.45 forest-edge density for forage-target suitability) through a new pure `isDeerEdgeHabitat(forestFactor) = forageEdgeScore(forestFactor) > 0.5`, exported for direct unit testing. Spawn habitat and forage suitability now read the same forest-edge signal by construction.

Road avoidance: the existing `onRoad()`/`SPAWNER_ROAD_CLEARANCE` corridor check (previously only reachable through `spawnerSiteOk()` for cave/thicket/wolfDen) was pulled into a pure exported `isNearRoadCorridor(x, z, roadSegments, clearance)`, and the ordinary ring-spawn candidate `filter` in the `SPAWNS` loop now also calls it. No new road representation; a live animal can still cross a road later — only spawn placement is affected.

### 2. Species-specific roaming (`AnimalAgent.ts`)

`AnimalDef` gained an optional `roaming?: readonly [number, number]` — two tiers, `SMALL_ROAMING_RANGE` ([4,9], rabbit/duck) and `LARGE_ROAMING_RANGE` ([10,24], deer/stag/wolf/boar); every other kind keeps the historic `DEFAULT_WANDER_RADIUS` ([6,16]) by omitting the field. The constructor's `wanderRadius` parameter lost its own default value and is now optional; the actual wander band is resolved once, in the constructor body, as `wanderRadius ?? def.roaming ?? DEFAULT_WANDER_RADIUS` — an explicit override (livestock's `LIVESTOCK_WANDER_RADIUS`) still wins, `undefined` (every wild ring-spawn caller) falls through to species config. No `kind === ...` branch anywhere in movement code.

### 3–4. Trip state + water trips (`AnimalAgent.ts`)

One small committed state, `AnimalTrip = { kind: 'water', destination, phase: 'traveling'|'staying'|'returning', stayRemainingSec }`, plus `trip: AnimalTrip | null` and `lastWaterTripBucket` fields. `wander()` gained a single new first line, `if (this.tickTrip(dt)) return` — since `wander()` is already the one low-priority tail every predator/prey/dog branch falls back to (`updatePredator`/`updatePrey`'s final `this.wander(dt)`, and the `player-ignore`/`npc-ignore` branches in `update()`), a trip is transparently below any real threat/combat/fire/guarding response without introducing a new priority tier in `faunaDecision.ts`.

`tickTrip()` either continues an already-committed trip (`continueTrip()` — travel/stay-timer/return, `destination` never recomputed mid-trip) or, for a species with `def.trips.water`, checks a deterministic day-bucket opportunity (`tripDayBucket(animalId, worldDays, cooldownDays)` — a pure FNV-1a-hash-phase-offset function, exported and unit-tested) and, only on a bucket change, probes for a destination once (`findWaterTripDestination`, a bounded radial shoreline probe centered on `home`, explicitly allowed past `wanderRadius`/`ROAM_RADIUS`, same `shoreProbeHits` technique as the existing thirst-driven `findWaterTarget()`). `DEER_WATER_TRIP = { cooldownDays: 2, stayDurationSec: 25, searchRadius: 45 }` is wired onto `deer`/`stag` only; no other species has a water-trip policy in this pass (wolf/fox/rabbit/boar/duck are unaffected — duck is already water-anchored via `AnimalWaterCapability`, a separate fauna-015 mechanism).

Interruption is structural, not a special case: any higher-priority branch (flee/chase/attack/guard/fire) simply doesn't call `wander()` for that tick, so a trip's `destination`/`phase` sit untouched until `wander()` is reached again — no reroll, no cancellation bookkeeping needed.

### 5. Rat kind + settlement population (`AnimalAgent.ts`, `proceduralAnimals.ts`, `faunaCombat.ts`, `animalDialogue.ts`, new `settlement/rats.ts`)

`rat` added to `AnimalKind` (+ `ANIMAL_LABELS`, `MAX_HP: 6`, dialogue lines, `createRatModel()` procedural fallback — no GLB). `ANIMAL_DEFS.rat`: `role: 'prey'`, `sociability: 'domestic'` — deliberate, not a species-flavor accident: `'domestic'` is what lets a rat wander/forage *inside* the settlement instead of the wild village-avoidance every `'wild'` kind gets in `pickPointNear`/`findWaterTarget`/`findForageTarget`. It's still a plain `AnimalAgent`, never `ownerHouseId`-tagged.

New `src/settlement/rats.ts` (not a `RatManager` — a small module of pure/imperative functions, mirroring `livestock.ts`'s shape without any of its household-ownership semantics): pure exported `ratPopulationTarget({ householdFoodCount, settlementFoodCount, dogCount })` (food pressure minus dog suppression, clamped to `[0,5]`), and `createSettlementRats(deps)` returning `{ update, getAgents, dispose }`. Reconciliation (spawn/despawn one rat at a time toward the target, food-drain roll) runs at most once per `RAT_RECONCILE_INTERVAL_DAYS` (0.5 in-game days) — never per frame. A shrinking population despawns the live rat furthest from the observer (reads as "wandered off", not a visible pop-out).

`createSettlement.ts` wires it: `householdSites` reuses the same `household + home-position` pairing already built for `householdExchangeCandidates` (both spawn anchors and the nearest-household food-drain target); `rats.update()` runs just before `tickSettlementLivestock` each frame, with `dogCount` recomputed from the settlement's own live `livestock`; `rats.dispose()` added to `Settlement.dispose()`.

### 6. Real food loss (`settlement/rats.ts`)

No `ratFoodDamage` counter. On a reconciliation tick, each live rat gets one deterministic hashed roll (`hash01(hashString(animalId), dayBucket, salt) < RAT_EAT_CHANCE` — same local FNV-1a idiom as `world/fishing.ts`, not `Math.random()`, so outcomes don't depend on frame timing); on a hit, it drains exactly one real food unit from its nearest household (`Household.takeFood()`) or, if that household has none, from the settlement store (`SettlementEconomy.withdrawFood(1)`) — both pre-existing atomic "remove one concrete food item" primitives, no new inventory/economy code.

### 7. Dog vs. rat (`dogGuard.ts`, `AnimalAgent.ts`, `livestock.ts`, `createSettlement.ts`)

New `resolveDogPestTarget(home, nearbyRats, radius)` in `dogGuard.ts` — deliberately separate from `resolveDogGuardTarget`'s wolf-defense contract (different candidate shape, no priority tiers, home-bounded via `DOG_PEST_RADIUS = 10`). `AnimalAgent.pursuePest()` is only consulted for `kind === 'dog'`, inside `updatePrey()`, *after* `pursueNeeds`/`pursueLure` have already found nothing — i.e. strictly below both real household defense (`dog-guard`, scored well above `prey-normal` in `faunaDecision.ts`) and the dog's own needs. `nearbyRats` threads through as a new optional trailing parameter on `AnimalAgent.update()`/`updatePrey()` and `tickSettlementLivestock`'s ctx (same "small caller-bounded population" pattern as the existing `nearbyPredators`/`nearbySettlementNpcs`), sourced from `rats.getAgents()`.

### 8. NPC vs. rat — no new integration

Not specially wired, per the plan's explicit "no settlement-wide scan/job" instruction: a rat is a normal `AnimalKind` with the normal health/death path, so the player's existing melee-vs-animal interaction and the dog pest-chase above already satisfy "killable by existing mechanisms". No generic NPC→animal combat/threat system reads `AnimalKind` today in a way that would pick up a `'prey'`-role rat as a target on its own, and adding one was explicitly out of scope.

### 9. Persistence — deliberately none

`rat` was **not** added to `persistence/saveData.ts`'s `ANIMAL_KINDS` set. Rats are reconciled fresh from live settlement state (`ratPopulationTarget`) every time a settlement loads/rebuilds, the same "not a general persistent population model" territory wild ring-spawn animals already occupy — adding per-rat save state was explicitly discouraged by the plan unless something already required it, and nothing does.

### Tests

New: `fauna/animalRoamingTrips.test.ts` (`AnimalDef.roaming`/`trips.water` species-config sanity, `tripDayBucket` determinism/cooldown-advance/phase-offset/non-positive-cooldown), `settlement/rats.test.ts` (`ratPopulationTarget` zero/growth/clamp/dog-suppression/never-negative/combined-sources). Extended: `createFauna.test.ts` (`isNearRoadCorridor` on/near/clear/no-segments, `isDeerEdgeHabitat` meadow/edge/forest), `dogGuard.test.ts` (`resolveDogPestTarget` nearest/dead/out-of-radius/none), `faunaCombat.test.ts` (`MAX_HP` now includes `rat`). No test instantiates a full `AnimalAgent`/`AnimalTrip` runtime — consistent with the pre-existing convention in this directory (every fauna test targets extracted pure functions), the trip/rat *runtime* wiring is exercised structurally (shared `wander()`/`update()` call paths) rather than via a dedicated integration test.

### Verification

`npx tsc --noEmit`, `npx eslint .`, and full `npx vitest run` (3317 tests) all pass. Browser/manual verification (the plan's 12-item checklist) is the user's own next step, not performed here.