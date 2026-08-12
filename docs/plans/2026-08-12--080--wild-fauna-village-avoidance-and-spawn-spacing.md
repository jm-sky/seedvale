# Wild Fauna: Village Avoidance & Spawn Spacing

**Status:** `verification needed` 🔍
**Priority:** 🟡 `medium`
**Effort:** `M`

> **Note (2026-08-12):** Implemented — shared `VillageInfo` type
> (`AnimalAgent.ts`) threaded through `gameLoop.ts` → `SettlementsManager` →
> `Settlement.update` → livestock, and `Fauna.update` → `AnimalAgent.update`;
> `radius` populated from `villageSizeConfig(size).footprintRadius`.
> `VILLAGE_AVOID_MARGIN`/`VILLAGE_FLEE_INFLUENCE_MARGIN` replace the old flat
> radii; both extracted as pure `isWithinVillageRadius`/`villageFleeBiasFalloff`
> helpers with unit tests (`villageAvoidance.test.ts`). `createFauna.ts`'s
> `SPAWN_RING_OFFSET`/`SPAWNER_RING_OFFSET` anchor spawn rings to
> `footprintRadius` instead of a flat guess; `MIN_SPAWN_SEPARATION` +
> `placedSpawnPoints` keep ring spawns and cave/thicket spawners apart.
> Also fixed a real bug found while implementing: `findWalkableNear`'s safety
> clamp compared `Math.abs(x)`/`Math.abs(z)` (world-origin-absolute) instead
> of `Math.abs(x - cx)`/`Math.abs(z - cz)` (settlement-relative, matching its
> own doc comment), and was widened to `Math.max(homeRadius - 4, maxDist)` so
> it can never be tighter than the ring it's asked to fill — otherwise `LG`/
> `XL` footprint-anchored rings would routinely fail to find a valid spawn
> point. `npx tsc --noEmit` / `npm run lint` / `npm run build` / `npm run test`
> all pass. Browser verification still required (see Acceptance criteria).

## Goal

Wild animals should not spawn inside, or wander into, a settlement's built
area — for every village size, not just the smallest. Wild fauna spawn points
(initial ring spawns and cave/thicket prey spawners) should also keep some
minimum distance from each other, so predator and prey spawn points don't
land next to each other by chance.

See [issue 024](../issues/2026-08-12--024--wild-fauna-enters-village-and-spawns-too-close.md)
for the confirmed root cause.

## Root cause (summary)

Fauna's village-avoidance and spawn placement use **fixed world-unit
distances from the settlement center** (`AnimalAgent.ts`'s
`VILLAGE_AVOID_RADIUS = 20`, `VILLAGE_FLEE_INFLUENCE_RADIUS = 45`,
`createFauna.ts`'s `SPAWN_RING` bands of 22–45, `SPAWNER_SPECS`' 45–65 band).
These were sized for the original village generator. Plan 047
(2026-08-09, "village generation overhaul") introduced much larger,
size-dependent footprints (`VILLAGE_SIZE_CONFIG.footprintRadius`: `SM` 40,
`MD` 48, `LG` 56, `XL` 72 — vs. the fauna constants' ~20–45) and later polish
(plans 076/077) scaled houses/gardens further within that footprint. Fauna
was never updated to match, and the `villages` list threaded into
`AnimalAgent` only ever carried `{x, z}` — no per-settlement radius existed
to avoid against.

## Existing systems to reuse

- `VILLAGE_SIZE_CONFIG` / `villageSizeConfig()` (`src/settlement/families.ts`)
  — already the single source of truth for a settlement's real footprint
  radius; `villagePlanner.ts` confirms `boundary.radius === sizeCfg.footprintRadius`,
  so `villageSizeConfig(settlement.size).footprintRadius` is exactly the
  village's boundary circle. Do not recompute or duplicate this number.
- `Settlement.size` (`src/settlement/createSettlement.ts`) — already exposed
  for every loaded settlement (home and streamed).
- The existing wild/domestic avoidance mechanism in `AnimalAgent.ts`
  (`isNearVillage`, `nearestVillage`, `fleeFrom`'s village bias,
  `updatePredator`'s chase give-up) — this plan rescales it, it does not
  replace it with a new system.
- `createFauna.ts`'s `findWalkableNear` — already the shared placement-attempt
  helper for both ring spawns and prey spawners; extend it rather than adding
  a parallel placement path.
- `SPAWNER_ROAD_CLEARANCE` / `spawnerSiteOk` pattern in `createFauna.ts` —
  same "reject a candidate, retry" shape the new footprint/separation checks
  should follow.

## Core behavior

Replace "distance from settlement center vs. a flat constant" with "distance
from settlement center vs. that settlement's real footprint radius plus a
margin", everywhere fauna currently reasons about villages:

```text
today:      is_near_village = distance(pos, village.center) < 20
after:      is_near_village = distance(pos, village.center) < village.footprintRadius + AVOID_MARGIN
```

The `villages` list passed into the fauna update chain needs to carry that
radius — today it's `{x, z}[]`; it becomes `{x, z, radius}[]`.

Spawn placement (ring spawns + cave/thicket spawners) shifts from
absolute `[minDist, maxDist]` bands to `[footprintRadius + relMin,
footprintRadius + relMax]` bands per profile, using the settlement's actual
`footprintRadius` (already available via `Settlement.size` at every
`createFauna` call site).

Add a minimum separation between any two wild-fauna spawn points placed
during world/settlement build (ring spawns and cave/thicket spawners share
one running list of already-placed points; a new candidate is rejected and
retried if it lands within `MIN_SPAWN_SEPARATION` of any of them) — this is
what keeps e.g. a cave spawner from landing next to a thicket spawner, or a
wolf's initial spawn from landing next to a deer's.

## Integration boundaries

### `src/settlement/families.ts`

No changes — `villageSizeConfig()`/`VILLAGE_SIZE_CONFIG` stay the single
source of truth for `footprintRadius`.

### `src/app/gameLoop.ts`

`villages` is currently built at the per-frame call site
(`bundle.settlementsManager.getLoaded().map((s) => ({ x: s.center.x, z: s.center.z }))`).
Add `radius: villageSizeConfig(s.size).footprintRadius`. This is a cheap
object/record lookup, not a per-frame computation — fine to keep inline
rather than caching on `Settlement`.

### `src/settlement/SettlementsManager.ts` / `src/settlement/createSettlement.ts`

Both currently declare `villages: readonly { x: number, z: number }[]` purely
to forward it (`SettlementsManager.update` → each `Settlement.update` → its
livestock's `AnimalAgent.update`). Update the type through this chain. Define
one shared type instead of repeating the object-literal type in five places
(`AnimalAgent.ts`, `createFauna.ts`, `createSettlement.ts`,
`SettlementsManager.ts`) — e.g. export it once from `AnimalAgent.ts` (already
the type's real owner/consumer) and import it at the other sites.

Livestock (`AnimalSociability: 'domestic'`) already leans *toward* the
nearest village via the same `fleeFrom` bias — that direction/sign is
unaffected by this plan; only the magnitude of the influence radius changes
along with everything else that reads `radius`.

### `src/fauna/createFauna.ts`

- `SPAWN_RING: Record<SpawnProfile, [number, number]>` (absolute) becomes a
  per-profile `[relMin, relMax]` offset applied on top of the settlement's
  `footprintRadius`, which the function already effectively knows via its
  `settlementCenter` caller (`worldBundle.ts`'s `buildFauna` already has the
  full `Settlement`, including `.size`) — thread `footprintRadius` in as an
  explicit parameter rather than re-deriving it from `settlementCenter`.
- `SPAWNER_SPECS`' hardcoded `45, 65` ring in the `findWalkableNear(...)` call
  becomes `footprintRadius + relMin` / `footprintRadius + relMax` the same
  way.
- Add a small shared `placedSpawnPoints` list local to `createFauna()`, a
  `MIN_SPAWN_SEPARATION` constant, and a candidate rejection check reusing the
  existing `findWalkableNear` attempt/retry loop — apply to both the `SPAWNS`
  ring loop and the `SPAWNER_SPECS` loop. Do **not** apply it to
  `updateSpawners`'s runtime respawn-near-spawner call (`findWalkableNear(spawner.x, spawner.z, 0, 4)`)
  — that's intentionally placing a replacement prey animal close to its own
  spawner, not a new independent spawn point.
- `worldBundle.ts`'s `buildFauna` gains one more argument (`footprintRadius`,
  from `villageSizeConfig(settlement.size).footprintRadius`) passed to
  `createFauna(...)`.

### `src/fauna/AnimalAgent.ts`

- `currentVillages` field and the `update()` parameter type change from
  `{x, z}[]` to the shared `{x, z, radius}` type.
- `isNearVillage(pos)` compares against `v.radius + VILLAGE_AVOID_MARGIN`
  instead of the flat `VILLAGE_AVOID_RADIUS`.
- `fleeFrom`'s village-bias falloff uses `v.radius + VILLAGE_FLEE_INFLUENCE_MARGIN`
  instead of the flat `VILLAGE_FLEE_INFLUENCE_RADIUS`.
- Extract the "is this point within `radius + margin` of a village"
  arithmetic into a small pure exported function (e.g. next to the existing
  constants) so it's unit-testable without instantiating `AnimalAgent`/Three.js
  — mirrors how `predatorHumanDecision.ts` was pulled out as a pure decision
  module in plan 056. Do not restructure the surrounding FSM to do this.
- No changes to `updatePredator`'s existing "give up chase if prey is near
  village" behavior beyond it now using the corrected radius — the mechanism
  itself already does the right thing.

### Not touched

- `settlement/livestock.ts` — house-anchored, per-settlement livestock
  spawning is a different, already-correct system (spawns relative to a
  specific house, not the settlement ring) and isn't part of this bug.
- Road/coastal spawner rejection (`onRoad`, `isCoastalPlacement`) — orthogonal
  filters, keep as-is.
- The "no hard wall" design for village avoidance (soft candidate rejection,
  not a physical exclusion zone/collision) — this is an intentional plan-044
  choice, not something this plan revisits. A cornered fleeing animal can
  still clip the village edge briefly; only spawn placement and normal
  wander/chase target selection are guaranteed to respect the real footprint.

## Avoid overreach

Do **not** add in this plan:

- a dedicated "predator lair/den" concept — wolves/foxes still spawn via the
  same ring mechanism as today, just correctly placed; only cave/thicket
  (both currently prey spawners) are literal fixed "spawn point" props;
- a hard collision/exclusion wall around villages;
- pathfinding/navmesh for fauna;
- per-village custom fauna rosters or counts;
- changes to predator/prey combat, chase-vs-flee decision logic
  (`predatorHumanDecision.ts`), or `AnimalLife`;
- caching/storing `footprintRadius` on `Settlement` or `VillagePlan` — it's
  already one cheap lookup away via `villageSizeConfig(size)`;
- touching livestock/farmstead spawning (`settlement/livestock.ts`).

## Implementation phases

### Phase 1 — thread the real footprint radius through

Add the shared `{x, z, radius}` village type (owned by `AnimalAgent.ts`),
update every signature in the chain (`gameLoop.ts` →
`SettlementsManager.update` → `Settlement.update` → livestock `AnimalAgent.update`,
and `Fauna.update` → `AnimalAgent.update`), and populate `radius` from
`villageSizeConfig(size).footprintRadius` at the two construction sites
(`gameLoop.ts`'s `villages` array, `worldBundle.ts`'s `buildFauna`). No
behavior change yet — `AnimalAgent`/`createFauna` still use the old flat
constants at this point, just receiving (and ignoring) the new field.

### Phase 2 — rescale `AnimalAgent`'s village avoidance

Replace `VILLAGE_AVOID_RADIUS`/`VILLAGE_FLEE_INFLUENCE_RADIUS` flat constants
with `radius + margin` using the now-available per-village `radius`. Extract
the threshold check into a small pure function and add unit tests for it
(see Tests).

### Phase 3 — rescale `createFauna`'s spawn rings

Convert `SPAWN_RING` and `SPAWNER_SPECS`' ring bounds to
`footprintRadius + relative offset`, threading `footprintRadius` into
`createFauna()`/`buildFauna()`. Tune the relative offsets so total spawn
distance from center stays in a similar range to today's for `OUTPOST`/`SM`
(where the current numbers already looked reasonable) while scaling up
correctly for `MD`/`LG`/`XL`.

### Phase 4 — minimum spacing between spawn points

Add `MIN_SPAWN_SEPARATION` + the shared `placedSpawnPoints` rejection check
in `createFauna()`, applied to both the initial `SPAWNS` ring loop and the
`SPAWNER_SPECS` loop.

### Phase 5 — verification

Technical checks + manual browser verification across a small (`SM`) and a
large (`XL`) village — confirm no wild fauna is visible inside the built
area at world start, and that cave/thicket spawners/initial predator-prey
spawns are visibly spread apart rather than clustered.

## Tests

Add/extend pure unit tests (no Three.js/DOM) for the new pure helpers:

- village-avoidance threshold function: a point just inside
  `radius + margin` is "near village", just outside is not, across a few
  representative `footprintRadius` values (`OUTPOST` 22 through `XL` 72).
- spawn-ring band computation: resulting `[min, max]` grows with
  `footprintRadius` and stays ordered (`min < max`) for every `VillageSize`.
- minimum-separation rejection: a candidate within `MIN_SPAWN_SEPARATION` of
  an already-placed point is rejected; one far enough away is accepted.

Keep existing fauna/settlement tests (`AnimalLife.test.ts`,
`faunaCombat.test.ts`, `playerAwareness.test.ts`,
`predatorHumanDecision.test.ts`, `settlementGenerator.test.ts`,
`villagePlanner.test.ts`) green — this plan does not change village
generation itself, only where fauna reads the result.

## Performance

- `villageSizeConfig(size)` is a `Record` lookup — negligible, fine to call
  once per settlement per frame in `gameLoop.ts` (matches the existing
  per-frame `.map()` there) or once at settlement build time in
  `worldBundle.ts`.
- Spawn-point separation checks only run during world/settlement build
  (finite, small `SPAWNS`/`SPAWNER_SPECS` counts) and on prey respawn — no
  new per-frame cost.
- No new allocations in `AnimalAgent.update`'s hot path beyond what already
  exists (the village list is still passed by reference, just with one extra
  field per entry).

## Acceptance criteria

- No wild fauna (ring-spawned or spawner-based) spawns inside a village's
  real footprint (`footprintRadius`) for any `VillageSize`, verified visually
  for at least one small and one large village.
- Wild animals no longer pick wander targets or chase prey into a village's
  real footprint, for every village size (previously only roughly correct for
  `OUTPOST`).
- Cave/thicket spawners, and initial per-species ring spawns, keep at least
  `MIN_SPAWN_SEPARATION` from each other.
- Livestock (domestic) toward-village bias behavior is unchanged apart from
  now scaling correctly with village size.
- No new abstractions beyond the shared village-info type and the small pure
  helper functions described above; existing fauna FSM, spawner mechanism,
  and village generation are reused as-is.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test` pass.
- Manual browser verification (dev server) confirms the above for at least
  one small and one large streamed/home village — this is a visual/gameplay
  change and must not be marked verified on technical checks alone.

## Related plans

- [047 — village generation overhaul](./2026-08-09--047--village-generation-overhaul.md) — introduced the larger `SM`–`XL` `footprintRadius` values this plan reads.
- [076 — village generator polish](./2026-08-12--076--village-generator-polish.md), [077 — village gardens scale](./2026-08-12--077--village-gardens-scale.md) — most recent village-size-scaling work that prompted this issue.
- [044 — world life details](./2026-08-08--044--world-life-details.md) — original village-avoidance/spawn-ring fauna behavior this plan rescales.
- [064 — cave spawner road avoidance and visual](./2026-08-11--064--cave-spawner-road-avoidance-and-visual.md) — existing spawner-placement rejection pattern this plan extends (separation check) rather than replaces.
- [056 — hungry predator human aggression](./2026-08-10--056--hungry-predator-human-aggression.md) — precedent for extracting a small pure decision/threshold function out of `AnimalAgent` for testability.
- [issue 024](../issues/2026-08-12--024--wild-fauna-enters-village-and-spawns-too-close.md) — the bug report / root cause this plan fixes.
