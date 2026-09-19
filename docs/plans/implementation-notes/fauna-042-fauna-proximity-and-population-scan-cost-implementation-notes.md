# Implementation notes: fauna-042 fauna proximity and population scan cost

**Plan:** `docs/plans/fauna-042-fauna-proximity-and-population-scan-cost.md`  
**Recon baseline:** current `main` on 2026-09-19

## Current code reality

Dependency `fauna-041` is already implemented and marked `done`.

Current `createFauna()` therefore already passes managed-spawner occupancy as logical membership:

- alive ordinary managed animals;
- grouped by `spawnPointId`;
- persistent occupants excluded;
- respawn callback returns explicit success/failure.

Do not reintroduce positional population counting. The remaining optimization target is now mostly inter-animal discovery plus avoiding the per-frame `filter().map()` used to build the current managed-membership snapshot.

## Ownership boundary

Keep the optimization at the existing fauna composition boundary:

- `src/fauna/createFauna.ts` owns the live wild `agents` array and should own any derived proximity index / scratch buckets.
- `AnimalAgent` remains the simulation entity and owns current target commitment, behaviour and lifecycle.
- Do not add a second fauna manager or persistent spatial registry.
- The proximity structure is runtime-derived and must be rebuilt/updated from current agent positions only.

## Current hot-path shape

Each wild agent currently receives:

`others: agents`

from `createFauna()::update`.

Several agent paths then scan that full array:

- `AnimalAgent.nearest(...)` for predator/prey acquisition;
- `pickRabidTarget(...)` for rabid live-target search;
- `animalForaging.findCarcassTarget(...)` for corpse food;
- herd/leader and related nearest-animal scans;
- committed-target membership checks such as `others.includes(target)`.

The existing `agentCpuDiag.recordNearestScan()` already counts candidates checked and should remain useful after narrowing.

## Recommended spatial structure

Use one lightweight fauna-owned uniform grid / spatial hash in `createFauna.ts`.

Good properties:

- rebuilt once per fauna update from current `agents`, or incrementally maintained only if that is clearly simpler;
- O(N) population step;
- buckets keyed by integer cell coordinates;
- query returns candidates from all cells intersecting the requested radius;
- exact distance/range predicates remain in the existing consumer logic.

Prefer rebuilding once per fauna pass over complex incremental synchronization. Fauna positions change continuously, so a fresh derived index avoids stale-membership bugs and is still O(N).

A cell size in the same order as the largest common animal search radius is appropriate, but do not hard-code a value from guesswork. Choose it from current fauna search constants after inspecting all relevant radii.

## Preserve exact target semantics

The spatial index only narrows candidates. Existing selection rules remain authoritative.

### `AnimalAgent.nearest()`

Preserve:

- self exclusion;
- exact role match;
- dead exclusion;
- exact `range` cutoff;
- first-seen tie behavior for equal distances, because the current implementation only replaces on `d < bestD`.

Candidate ordering therefore matters.

If bucket iteration changes ordering, normalize candidate order back to the original stable `agents` order before nearest selection, or provide the query in stable agent-order form.

Do not introduce animal-id tie-breaking here unless the existing function already defines it.

### Cross-source prey selection

`pickNearerPreyCandidate()` has explicit stable `animalId` tie-breaking between wild prey and livestock.

Keep livestock separate:

- do not insert household/player livestock into the wild spatial index;
- continue using the explicit `huntableLivestock` encounter set;
- preserve the current cross-source final comparison.

### Rabid target search

`pickRabidTarget()` currently excludes self/dead and keeps first-seen candidate on equal distance.

Use the same narrowed wild candidate ordering contract.

### Carcass search

`findCarcassTarget()` does more than nearest-distance selection:

- prey-role only;
- corpse phase / edible-state validation;
- claim ownership;
- food-value gating;
- `carcassCandidateScore(value, distance)`;
- first-seen candidate wins exact score ties because replacement is only `score > bestScore`.

The proximity index must therefore only narrow to animals within the carcass search radius. Do not replace this with a generic nearest helper.

The selected corpse must still be claimed through `claimAsFood()` after scoring.

## Committed target membership

Current `resolvePreyTarget()` validates an existing cached target partly using:

`others.includes(target)`

With a local candidate slice, that check would become wrong: a still-live target just outside the current query slice may be interpreted as having left the fauna population.

Do not pass a narrowed array into code that uses array membership as global liveness/membership authority without adjusting that contract.

Recommended approach:

- keep global fauna membership separately available for committed-target validation;
- use local candidates only for new target discovery;
- or replace membership validation with an explicit fauna-owned live-membership predicate passed from the composition boundary.

Do not make proximity-query presence synonymous with existence.

This is the highest-risk correctness seam in the optimization.

## Candidate-view API shape

Avoid threading a second manager through every method.

A bounded approach is to extend the per-update context with a read-only query seam, for example conceptually:

- query wild candidates near `x,z,radius`;
- optionally global live-membership check for an already committed target.

Keep the concrete grid type private to `createFauna.ts`.

`AnimalAgent` should depend on the query contract, not on hash buckets/maps.

If changing `AnimalUpdateContext` would cause excessive churn, computing one local candidate array per agent in `createFauna()` and passing it alongside global membership is acceptable, provided that:
- the candidate list is bounded;
- ordering is stable;
- no new per-agent garbage-heavy chains are introduced.

Prefer reusable scratch arrays/buffers where practical.

## Population/spawner allocation cleanup

After `fauna-041`, `createFauna()` still currently builds managed membership with:

- `agents.filter(...).map(...)`

each frame before `updateSpawners()`.

Replace this with one reusable pass/scratch structure owned by `createFauna()`.

Simplest safe shape:

- reusable array cleared with `length = 0`;
- iterate `agents` once;
- push only alive, ordinary, managed entries;
- pass that buffer to `updateSpawners()`.

If `updateSpawners()` can cheaply consume a `Map<spawnPointId,count>` without duplicating work, that is also valid, but do not redesign the spawner API solely for this optimization unless it materially simplifies the path.

Spawner work itself only matters when `dayDelta > 0`; avoid rebuilding spawner occupancy data on frames where `updateSpawners()` would immediately return if that can be gated cleanly from `createFauna()`.

## Cadence / off-screen invariants

Do not change update cadence from this plan.

- Distant animals still simulate.
- Camera visibility must not decide membership in the proximity index.
- Reduced-cadence behaviour from existing fauna cadence remains untouched.
- Combat/flee/high-priority branches retain their current timing.

The optimization should change candidate set size, not whether an animal is updated.

## Diagnostics to reuse

Existing diagnostics already expose:

- fauna sensing ms;
- fauna targeting ms;
- nearest scan calls;
- nearest candidates checked;
- herd-leader scan counts;
- overall fauna agent update ms.

Preserve `recordNearestScan(candidatesChecked)` semantics: after the change, it should count candidates actually inspected by the narrowed query.

Avoid adding heavy profiling structures.

A useful success signal is a substantial drop in `nearestCandidatesPerFrame` / related candidate counters at the same fauna population.

## Likely files

Primary:

- `src/fauna/createFauna.ts`
- `src/fauna/AnimalAgent.ts`

Likely:

- `src/fauna/animalForaging.ts`
- focused fauna tests around prey/rabid/carcass selection.

Potentially no change needed:

- `src/fauna/AnimalSpawner.ts` after fauna-041, except tiny API cleanup if necessary;
- persistence/save schema;
- livestock simulation.

## Tests that matter most

Prioritize semantic equivalence, not grid internals.

1. nearest prey across a cell boundary remains selectable;
2. nearest predator/prey result matches full-array baseline;
3. equal-distance tie preserves existing first-seen behavior;
4. rabid target selection matches baseline;
5. carcass scoring/claim selection matches baseline;
6. committed prey target remains valid even if not in the current local candidate slice but is still part of live fauna;
7. dead/removed target invalidates correctly;
8. livestock remains outside wild candidate buckets and still participates through `huntableLivestock`;
9. distant/off-screen animal still receives updates;
10. spawner membership scratch path produces the same logical counts as fauna-041.

A useful test strategy is to run both:
- baseline full-array selector;
- narrowed candidate selector;
against the same deterministic agent fixtures and compare outcomes.

## Pitfalls

- Do not equate "not in nearby query" with "no longer exists".
- Do not change target tie-breaking through bucket iteration order.
- Do not merge livestock into wild buckets.
- Do not turn carcass search into nearest-only logic.
- Do not persist the spatial index.
- Do not build one index per species/consumer unless profiling proves the single derived index insufficient.
- Do not allocate `filter/map` chains per animal or per query.
- Do not move fauna to a worker in this plan.
- Do not alter fauna cadence or camera-based simulation fidelity.

## Suggested implementation order

1. Inventory all current wild inter-animal search radii and selection semantics.
2. Add one private fauna-owned spatial query structure at `createFauna()`.
3. Build it once per fauna update from current agents.
4. Thread bounded candidate queries into new-target discovery first.
5. Keep/fix separate global membership validation for committed targets.
6. Move carcass and rabid searches onto narrowed candidates while preserving ordering/score semantics.
7. Remove spawner `filter().map()` allocation using fauna-041's membership contract.
8. Add equivalence tests before performance cleanup.
9. Verify existing agent CPU diagnostics still report meaningful candidate counts.
