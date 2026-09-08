# Implementation notes: fauna-019 real cave habitats and animal home navigation

Reviewed against `main` on 2026-09-08.

## Current-code constraints

- `world-terrain-008` is still **in progress**. On current `main`, `src/world/createCaves.ts` still builds `v2ByCaveId` from `buildSpikeTestTopology()` and derives a transitional `CaveDefinition` through `topologyToCaveDefinition()`. Gameplay queries still run through `CaveVolume`.
- The current `Caves` API is not sufficient for fauna-019: `contains(x,y,z)` is 3D, but `sampleFloor(x,z)` / `sampleCeiling(x,z)` are 2.5D and choose across all cave volumes. B2's production Y-aware spatial contract is therefore a real blocker for the final cave-navigation seam. Do **not** add a fauna-local compatibility layer around `CaveVolume` or active cave meshes; finish/consume the world-owned B2 contract instead.
- Cave presentation is streamed around the observer, while definitions/volumes are precomputed independently of presentation. Preserve that separation: animal simulation must never call `Caves.update()`, inspect `scene`, or force cave mesh activation.

## Recommended integration shape

### World-owned cave query

Extend the production Cave V2 API with a small render-independent, cave-scoped lookup usable by arbitrary entities. It should resolve by stable `caveId` and expose only what fauna needs, conceptually:

- stable cave identity;
- entrance transition / mouth anchor;
- deterministic interior habitat-safe anchor (prefer the semantic main chamber, derived from `CaveTopology`);
- local Y-aware containment / walkable-floor query for a known cave;
- enough topology/route semantics to move between interior anchor and entrance without scanning all caves.

Do not expose `CaveTopology` internals directly to `AnimalAgent` if a narrower world query can own the interpretation. Coordinates may be cached by fauna after resolving the stable cave reference, but `caveId` remains authoritative.

### Composition root

`src/app/worldBundle.ts::buildFauna()` is the correct wiring boundary. It already adapts `ChunkManager` into narrow sampler/query functions before calling `createFauna()`. Pass the cave-spatial contract here in the same style; do not import `createCaves.ts`, `ChunkManager`, or Three.js cave presentation from `AnimalAgent`.

Check build ordering while implementing: the cave query must exist before cave-backed habitats are resolved, but fauna should retain the current startup property of not waiting for cave presentation geometry.

### Fauna habitat identity

Keep habitat binding separate from `PreySpawner`. `PreySpawner` currently owns population/respawn lifecycle, not physical-place identity. A cave-backed binding should be a small fauna-owned record/reference resolving a stable world cave into an interior home anchor and entrance route.

`fauna-018` is still only `planned`. fauna-019 should not depend on persistent-individual storage to define the binding. Conversely, define the binding so fauna-018 can later derive a persistent occupant id from stable habitat identity without persisting cave coordinates/topology.

## AnimalAgent changes to reuse existing behaviour

- Reuse the existing `home`, species `roaming`, hunger/thirst seeking and `AnimalTrip`/`AnimalDef.trips.water` lifecycle from fauna-016. Do not add a cave-specific behaviour FSM.
- Current `ROAM_RADIUS = 50` is a separate hard home-relative filter used by ordinary food/water/forage target search. An interior cave home will make valid surface targets fail this check. Replace the implicit "distance from home means allowed journey" rule with explicit journey semantics: local roaming remains home-bounded, while committed need/trip/home-return movement may legally leave that band.
- Keep the existing runaway/chase guards; only exempt intentional committed journeys. Avoid simply increasing `ROAM_RADIUS`, which would change all wild-fauna search behaviour globally.
- Movement currently receives a surface `HeightSampler` from `buildFauna()` (`chunkManager.sampleHeight`). Introduce one shared movement-ground seam that can select surface or the known cave's Y-aware floor according to route/location context. All autonomous modes that ultimately snap/check movement must use the same seam so wander, food/water seeking, trip movement and return-home cannot disagree.
- `waterTraversal.ts` / `AnimalAgent.isWalkable()` already centralize physical water traversability. Preserve that ownership; cave navigation should compose with it after the animal reaches surface, not duplicate water checks.

## Route semantics

For the first L1 cave, prefer a small route abstraction over general navmesh/pathfinding. The minimum useful route is:

`interior home -> topology-derived interior route -> entrance -> surface target`

and the reverse for return-home.

The route should be derived from Cave V2 topology/spatial semantics, not hard-coded quest/bear waypoints. If B2 exposes only floor queries but no reliable semantic path from main chamber to mouth, extend the world cave contract there rather than making fauna infer a route from render geometry.

Threat/combat interruption should continue to use the existing AnimalAgent priority system. After an interrupted journey becomes valid again, recompute/continue from stable habitat + destination intent; transient path nodes do not need persistence.

## Decorative den rename

`src/fauna/createFauna.ts::SPAWNER_SPECS` still contains `{ type: 'cave', kind: 'bear', ... }`, implemented with the decorative `createCaveMouth()` prop. Rename this lightweight habitat type to `den`/`rockDen` (choose one consistently across `PreySpawner['type']`, marker APIs, persistence snapshots/tests and UI labels) before introducing real cave-backed semantics.

This is a naming/identity migration only: do not change thicket/wolf-den placement or spawner lifecycle as collateral work. Verify saved spawner-state compatibility because the spawner type participates in stable spawner ids; changing the string blindly can orphan existing persisted lifecycle state.

## Bear water trips

`AnimalDef.trips.water` is already declarative and currently used by deer/stag. Add bear configuration there; do not branch on `kind === 'bear'` inside trip logic. Choose `searchRadius` large enough to reach useful surface water from a cave entrance, but do not use it as a substitute for cave-route semantics.

## Determinism and persistence

- Cave topology, entrance, interior anchor and route skeleton should reconstruct from world seed + stable cave identity; do not add them to `SaveData`.
- Ordinary wild animals remain unpersisted under fauna-019.
- fauna-018 can later persist a selected cave resident through existing `AnimalAgent.snapshot()/hydrate()` plus stable habitat identity. Do not persist transient route/path state.
- Note the existing fauna limitation from `docs/state/fauna.md`: ordinary movement target selection uses unseeded randomness. fauna-019 does not need to solve this for ephemeral wildlife, but do not make stable cave/habitat identity depend on those random choices.

## Tests worth adding

Prefer pure tests around new contracts rather than constructing a Three.js-heavy `AnimalAgent` where avoidable:

- stable `caveId` resolves the same interior habitat anchor without presentation activation;
- Y-aware cave-floor selection is scoped to the intended cave/route and does not use global `Math.min`-style floor selection;
- local roaming remains bounded while an explicit need/trip journey can cross the old `ROAM_RADIUS` boundary;
- route crosses interior -> entrance -> surface and reverse, ending at the actual interior home anchor;
- decorative den rename preserves restored spawner lifecycle identity or includes an explicit migration;
- bear receives water-trip behaviour through `AnimalDef` configuration only.

## Implementation order

1. Finish/verify the required `world-terrain-008` B2 production cave spatial + route/anchor seam.
2. Rename the decorative fauna `cave` spawner safely.
3. Add cave-backed fauna habitat binding and wire the world query through `buildFauna()` / `createFauna()`.
4. Generalize AnimalAgent ground/journey bounds, then add cave enter/leave/return routing.
5. Add bear `trips.water` configuration and focused tests.
6. Leave persistent concrete cave residents to fauna-018; only ensure the habitat identity contract composes with it.
