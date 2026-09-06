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