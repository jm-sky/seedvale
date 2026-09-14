# Implementation notes: fauna-029 animal water route preference and corpse world-time

**Plan:** `docs/plans/fauna-029-animal-water-route-preference-and-corpse-world-time.md`  
**Baseline:** current `main` after fauna-015 (ability-only water) and fauna-028 (update cadence).

`fauna-028` is already the AnimalAgent cadence plan. This work is **fauna-029**.

## Water preference

Owner of classification: [`src/fauna/waterTraversal.ts`](../../../src/fauna/waterTraversal.ts). Extend it; do not add a second policy module.

- `isWalkable()` in [`AnimalAgent.ts`](../../../src/fauna/AnimalAgent.ts) stays physical (`classifyWaterTraversal === null` blocks). Shared by mounted + autonomous.
- `wander()` currently calls `steerToward` directly (not `stepNavRescue`). That is why a sheep walks into a river: swimming cells are progress, so the stuck watchdog never fires.
- Existing `NavRescue` instances: `chaseNav`, `fleeNav`. Add `moveNav` for wander / trip / needs / attraction. Do not share with flee/chase.
- [`navigation.ts`](../../../src/navigation/navigation.ts) A* cost is geometric only. Optional `NavigationQuery.cellCost`. NPC `findPath` callers omit it.
- LOS at `segmentWalkable(start, goal)` must refuse `cellCost > 1` along the segment, otherwise A* never runs.
- `simplifyPath` must use the same cheap-segment rule.
- Destination filter: `pickPointNear` + `autonomousDestinationAccepts`. Also reject dest whose current-position LOS crosses dispreferred swimming. Water trips already pick shores (`findWaterTripDestination`).
- Duck: `ANIMAL_DEFS.duck.water.waterAdapted === true`. No `kind === 'duck'`.
- Bounded A* `DEFAULT_BOUNDS_PADDING = 6`. Wide rivers cannot be fully detoured; destination filtering is the wander guarantee; swimming remains last-resort inside bounds.

`WaterRouteIntent`:

- `preferDry` — wander, continueTrip, pursueSourceTarget, pursueAttraction
- `allowSwim` — fleeFrom, chase prey/human/NPC, dog guard, pest, rabid, lead/follow, frenzy beeline, mounted

Immediate repath when `preferDry` and the dest LOS has swimming. Pass `cellCost` only for `preferDry` (waterAdapted still returns 1).

## Remains transform

[`collapse()`](../../../src/fauna/AnimalAgent.ts) tip (`rotation.z = ±π/2`) is the death pose for species without a `Death` clip. Do not clear it during fresh/rotting.

[`spawnNaturalRemains`](../../../src/fauna/animalCorpse.ts) parents onto `host.mesh`. Harvest already uprights in `harvestMeat()`. Natural bones have no equivalent.

Add `settleRootForRemains()` on `CorpseHost`. AnimalAgent implementation: `rotation.z = 0` then Y from `groundHeightAt` / `sampleHeight` (terrain/cave floor / water **bed**), not live `snapY()` which lifts swimming to the surface. Call from bones transition and `harvestCorpseMeat` before attach.

Death mixer currently compares `timeSinceDeath < deathAnimDurationSec`. After removing `timeSinceDeath`, keep a dedicated `deathAnimElapsedSec` on the agent (real-time presentation, not world-time).

## Corpse world-time

Mirror [`npcPostDeath.ts`](../../../src/settlement/npcPostDeath.ts) `deathAtDays`. Clock: `nowDays` already on `AnimalUpdateContext` (`dayNight.elapsedDays`). Set `this.tickNowDays = nowDays` **before** the dead early-return in `update()`.

State on `AnimalCorpseState`:

- `deathAtDays: number | null` (null until collapse / first dead tick)
- `harvestedAtDays: number | null`
- drop `timeSinceDeath` as the phase source

Constants via `gameHoursToGameDays` in [`timeConversion.ts`](../../../src/world/timeConversion.ts):

```text
rot onset    4 h
bones onset  40 h
remove       112 h
harvested    2 h from harvest
```

`advanceAnimalCorpse(..., nowDays)` — `dt` only for rot stamina/FX. `corpseReadyToRemove(state, dead, nowDays)`. Buried → ready (unless `held`). `resolveTimeSkip` must not bump corpse age.

Death clip duration is real-time; do not drive it from world days.

### Persistence

`AnimalSaveState.corpse`: `{ deathAtDays: number, meatHarvested: boolean, harvestedAtDays?: number } | null`.

Bump `CURRENT_SAVE_VERSION` 41 → 42. Migrate `livestock[]`, `rats[]`, `persistentHabitatOccupants[].state.corpse`:

`deathAtDays = max(0, elapsedDays - realSecondsToGameDays(timeSinceDeath, 480))`.

Validator `isLivestockCorpse`. Tests in `saveData.test.ts` / `AnimalAgent.test.ts` / `persistentOccupants.test.ts`.

### Stray

[`shouldRetainStrayedCorpse`](../../../src/fauna/animalStray.ts) extra 960 s cap is shorter than the new natural linger. Stop using it to extend TTL. Inspect stays a quest flag.

### Cadence

fauna-028 already keeps corpse/decay full-rate. World-time phase does not need the throttled behaviour section.

## Tests

Pure: `waterTraversal.test.ts`, `navigation.test.ts`, `animalCorpse.test.ts`. Snapshot/hydrate/time-skip on `AnimalAgent.test.ts`. Do not instantiate a full world for wander pathing if the pure helpers cover the contract.

## Pitfalls

- Do not fold preference into `isWalkable` — mounted/flee would become a hard wall.
- Hydrate of a bones-phase corpse still tips first if there is no death clip; settle at bones attach, not in `collapse()`.
- `readyToRemove()` is called without `nowDays`; use `tickNowDays` after setting it at the top of `update()`.
- Ordinary wild corpses still vanish on stream-out (persistence class). Livestock/rats/habitat occupants benefit from `deathAtDays` across unload.
