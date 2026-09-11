# Implementation notes: fauna-019 real cave habitats and animal home navigation

Reviewed against `main` on 2026-09-11 after the production heightfield cutover.

## Current truth

### `src/world/createCaves.ts`

`world-terrain-019` is now `done`. Production no longer has the transitional SDF runtime described by the old notes.

Each accepted cave has a retained `CaveRuntime` containing:

- `archetype: CaveArchetype`,
- `topology: CaveTopology`,
- legacy/catalog `definition: CaveDefinition`,
- retained `heightfield: CaveHeightfieldRepresentation`,
- `walkSurfaceAt: SurfaceSampler`,
- content/interior-rock metadata.

`createCaves()` constructs topology + heightfield up front. Presentation is streamed separately and may be absent while gameplay queries remain valid.

Current public `Caves` spatial API:

- `queryGround(x,y,z)` — Y-aware heightfield ground, but **player-stateful** because `createCaves()` applies underground-miss hysteresis. Do not share this function between autonomous animals.
- `occupancyAt(x,y,z)` — strict, stateless heightfield occupancy.
- `resolveHorizontal(x,z,y,radius,entityHeight)` — entity-neutral horizontal containment over production heightfields.
- `queryInterior(...)` — hysteretic player/camera interior signal; not an animal habitat-state API.
- `contains(...)` — shorthand over stateless occupancy.
- `sampleFloor(x,z)` / `sampleCeiling(x,z)` — Y-blind global convenience selecting a cave sample; not suitable as the authoritative cave-resident movement seam.
- `archetypeOf(caveId)` / `contentAnchorsOf(caveId)` — examples that stable cave-scoped lookup already fits the `Caves` ownership boundary.

The missing piece for fauna-019 is therefore **not another spatial representation**. It is a narrow cave-scoped semantic/traversal API over retained `CaveRuntime`.

### `src/world/caves/caveHeightfieldQuery.ts`

Useful existing pure/stateless primitives:

- `heightfieldGroundColumn(field, surfaceHeightAt, x, z)`,
- `queryHeightfieldGround(field, surfaceHeightAt, x, y, z)`,
- `heightfieldOccupancyAt(...)`,
- `heightfieldStandingClearance(entityHeight)`,
- `resolveHeightfieldHorizontal(field, x, z, y, radius, minGap)`.

These should remain the one spatial implementation. A new public cave-scoped API should delegate to them for the known `CaveRuntime`, not reimplement floor/containment logic in fauna.

Production heightfield is deliberately 2.5D: one walkable interval per `(x,z)`. The important Y-aware distinction for fauna-019 is surface-vs-cave entity context (including a surface entity above a tunnel), not hypothetical multi-level cave support.

### `src/world/caves/caveTopology.ts`

`CaveTopology` already provides the semantic route graph:

```text
entrance
nodes[]      { id, kind, position, targetWidth, targetHeight }
segments[]   { from, to, centerline[] }
features[]
```

`productionTopology.ts` natural caves contain `entrance → transition → passage → widening-bend → chamber`, plus optional branch. Adventure caves use the same topology model.

This is the route source for fauna. Do not infer paths from heightfield pixels, presentation geometry or collider traces.

## Recommended world contract

Keep this under world/world-terrain ownership, exposed through `Caves` or a narrow type returned from it.

Conceptual shape:

```ts
export type CaveTraversalPoint = {
  x: number
  y: number
  z: number
}

export type CaveTraversalDescriptor = {
  caveId: string
  entrance: CaveTraversalPoint & { yaw: number }
  home: CaveTraversalPoint
  routeToEntrance: readonly CaveTraversalPoint[]
}
```

Suggested operations:

```ts
resolveTraversal(caveId: string): CaveTraversalDescriptor | null
queryGroundIn(caveId: string, x: number, y: number, z: number): CaveGroundHit | null
resolveHorizontalIn(
  caveId: string,
  x: number,
  z: number,
  y: number,
  radius: number,
  entityHeight: number,
): { x: number; z: number }
```

Names are flexible. Contracts are not:

- resolve runtime with existing `v2ByCaveId.get(caveId)`,
- remain stateless per entity,
- work without presentation activation,
- do not expose/mutate raw `CaveRuntime` or raw heightfield from fauna,
- avoid scanning all caves once habitat identity is known.

`Caves.resolveHorizontal(...)` may remain the global player-facing convenience; cave residents should prefer the scoped variant during their interior route because they already know the habitat cave.

## Resolving the interior home

Use topology semantics first, production heightfield second.

Recommended algorithm:

1. Resolve `CaveRuntime` by `caveId`.
2. Pick deterministic semantic chamber candidate:
   - prefer node `id === 'chamber'` where present;
   - otherwise choose a deterministic entrance-connected `kind === 'chamber'` candidate from the topology graph.
3. Use the node X/Z as semantic intent.
4. Resolve the actual floor from that runtime's retained heightfield.
5. Verify enough standing clearance for the intended fauna movement contract.
6. If the preferred chamber point is not standable, deterministically inspect topology-adjacent/other chamber candidates rather than raycasting or random-searching the mesh.

Do not persist the resolved coordinates. `caveId` + deterministic topology/heightfield are authoritative.

## Building `routeToEntrance`

Treat `CaveTopology` as a small graph.

- Find a deterministic path from the selected home node to the `entrance` node.
- Flatten the participating `segment.centerline` arrays in the correct direction.
- Deduplicate touching endpoints.
- For each waypoint X/Z, resolve/snap Y to that cave's production floor.
- Store the route in one canonical direction (`home → entrance` is convenient); reverse it for return.

The route is tiny and can be cached in the habitat descriptor. No A* grid/navmesh is needed for current L1 topology.

If future topology creates alternate connected routes, path selection must remain deterministic (stable segment/node ordering or explicit deterministic cost/tie-break), not depend on JS object iteration accidents.

## Composition root: `src/app/worldBundle.ts`

Important current startup fact: caves are world-owned critical-path state; fauna is deferred into the `backgroundReady` build. That makes `Caves` available before the real `Fauna` replaces its stub.

Update `buildFauna(...)` to accept the narrow cave contract (or `Caves` if keeping the adapter there), then forward only the functions/types fauna actually needs into `createFauna()`.

Preferred pattern matches existing adapters:

```text
WorldBundle / Caves
→ buildFauna adapter
→ createFauna narrow habitat/spatial hooks
→ AnimalAgent/modules
```

Do not import `createCaves.ts`, `ChunkManager` or Three.js cave presentation into `AnimalAgent`, `animalRoaming` or `animalForaging`.

## Fauna habitat binding

Add a small fauna-owned stable reference, separate from population spawners:

```ts
type AnimalHabitatBinding = {
  habitatId: string
  source: { kind: 'cave'; caveId: string }
}
```

A resolved runtime companion may cache:

```ts
{
  binding,
  home,
  entrance,
  routeToEntrance,
}
```

Do not make resolved coordinates authoritative or persistent.

Keep `PreySpawner` as population/respawn ownership. A persistent cave resident from fauna-018 can use the same habitat binding without requiring a `PreySpawner` to represent the physical cave.

## Current fauna movement constraints

### `src/fauna/AnimalAgent.ts`

`ROAM_RADIUS = 50` is still the flat movement-domain/home bound. The agent forwards this into need target selection and uses home-relative limits to prevent runaway movement.

Do not increase `ROAM_RADIUS` globally for caves.

Introduce an explicit journey distinction:

- local roaming / opportunistic search: home-bounded as today,
- committed need/trip movement: may leave the local band,
- committed return-home movement: may traverse the cave route to the actual interior home.

Threat/combat priority remains above ordinary journey movement. Interrupted journeys can be recomputed/resumed from stable habitat identity and destination intent.

### `src/fauna/animalForaging.ts`

Current foraging context receives `roamRadius` and `isWalkable`. That contract assumes surface-local search.

Avoid making this module understand cave topology. Prefer:

- target selection remains about resources/destinations,
- journey/routing layer decides how a cave resident reaches a valid surface target,
- committed target validation can use explicit journey allowance instead of pretending the target lies inside `ROAM_RADIUS`.

If a minimal signature change is needed, name it in journey terms rather than adding `isCaveBear`/`ignoreRoamRadius` booleans.

### `src/fauna/animalRoaming.ts`

fauna-016 already has committed `AnimalTrip` state (`traveling` / `staying` / `returning`) and destination search intentionally allowed beyond `ROAM_RADIUS`.

Reuse that state machine. The new integration is routing around the surface leg:

```text
traveling from cave home
  cave route home→entrance
  then existing surface travel to destination

returning
  existing surface travel to entrance
  then reverse cave route entrance→home
```

Do not create `CaveTrip` as a second parallel lifecycle unless a generic route/journey abstraction truly cannot express this.

## Ground and horizontal movement seam

Current wild fauna receives surface `chunkManager.sampleHeight` from `buildFauna()`.

Add one reusable movement-ground abstraction so every autonomous mode resolves the same physical ground. Conceptually:

```ts
type AnimalMovementContext = {
  surfaceHeight: HeightSampler
  cave?: {
    caveId: string
    queryGround: ...
    resolveHorizontal: ...
  }
}
```

Exact ownership can be a helper module rather than a type stored verbatim on the agent.

Rules:

- while traversing known cave route, use scoped heightfield floor and cave containment;
- around/open-sky mouth transition, allow handoff to surface sampler according to the production cave portal semantics;
- on surface, retain current terrain/collider/water behavior;
- all cave-resident movement modes must share this seam — wander/needs/trips/return must not snap against different grounds.

Do not route animal movement through player `queryGround()` because its hysteresis storage is shared/player-specific.

## Animal dimensions

`Caves.resolveHorizontal` requires `radius` and `entityHeight`. fauna-019 therefore needs one authoritative way to derive movement dimensions per animal kind/model.

Before adding new constants, inspect existing collision/interaction radii in `AnimalAgent`/fauna combat/interaction code and reuse a shared value where semantics match. If no suitable physical body dimensions exist, add a small declarative species movement/collision dimension field rather than scattered bear-specific numbers.

Do not reuse attack range or interaction distance as wall-collision radius just because the number is nearby.

## Decorative `cave` spawner rename

Current `src/fauna/createFauna.ts::SPAWNER_SPECS` still uses `type: 'cave'` and renders it with `createCaveMouth()`.

Rename the lightweight concept to `rockDen`.

Touch points to inspect before changing:

- `PreySpawner['type']` in `AnimalSpawner.ts`,
- `SPAWNER_SPECS`,
- prop/label creation branches in `createFauna.ts`,
- `destroySpawner` comments/UI text,
- tests and any stable-id builder using `type`,
- `SavedSpawnPointState` restoration.

Critical compatibility rule: if the type string participates in the stable spawner id, either keep the legacy id derivation for migrated `rockDen` entries or explicitly translate old snapshot ids. A cosmetic rename must not reset/orphan depletion/recovery/disabled state.

Do not change `wolfDen`, `thicket` or placement policy as collateral work.

## fauna-018 integration is now real

Old notes said fauna-018 was only planned. That is stale.

Current `main` already has:

- `src/fauna/persistentOccupants.ts`,
- `PersistentOccupantDecl`,
- `PersistentOccupantSnapshot`,
- registry creation in `createFauna()`,
- snapshot/hydrate/rebuild plumbing in `worldBundle.ts`,
- `Fauna.snapshotPersistentOccupants()`.

No real-cave occupant declaration exists yet.

fauna-019 should provide the stable cave habitat identity/home resolution consumed by this existing registry; do not invent another persistent-animal registry.

## Bear water trip

`AnimalDef.trips.water` remains the correct declarative seam. Add bear there after cave journey routing works.

Do not branch on `kind === 'bear'` in `AnimalTrip` execution.

`searchRadius` controls target discovery only. It must not be used as a replacement for explicit cave entrance routing or as an excuse to expand ordinary roaming.

## Persistence

Persisted:

- existing persistent occupant/AnimalAgent state,
- stable habitat/cave identity where required by the declaration/snapshot contract.

Reconstructed:

- topology,
- heightfield,
- home anchor,
- route waypoints,
- floor Y,
- current route cursor.

Do not save cave geometry or route arrays.

On hydration/rebuild, resolve the cave descriptor before placing/reconstructing an interior resident. If the cave id no longer resolves because generation rules changed incompatibly, fail safely/diagnostically rather than silently spawning the resident at `(0,0)` or a stale saved coordinate.

## Performance

Good path:

```text
spawn/hydrate once
→ v2ByCaveId.get(caveId)
→ resolve + cache small descriptor
→ route tick queries only known cave runtime
```

Avoid:

- global cave scan per animal tick,
- `scene.traverse`, mesh lookup or raycast,
- calling presentation `update()` to make simulation work,
- rebuilding route graph per frame,
- allocating waypoint arrays every tick.

Existing production `resolveHorizontal` loops across cave fields as a generic world resolver. For a cave resident with known identity, a scoped resolver is preferable and avoids multiplying that generic path by many off-screen animals.

## Focused tests

### World tests

Prefer extending/adding tests near `src/world/createCaves*.test.ts` plus pure topology helper tests:

- descriptor resolves by stable `caveId`,
- descriptor exists with zero active presentation meshes,
- selected home is a semantic chamber and has a valid production floor,
- route connects home and entrance in deterministic order,
- reversed segment centerlines are handled correctly,
- scoped `queryGroundIn` is stateless and rejects surface-above-tunnel Y,
- scoped containment delegates to the retained heightfield.

### Fauna tests

- cave habitat binding resolves once and is reused,
- local roam remains bounded,
- committed need/water trip may cross the old `ROAM_RADIUS`,
- outbound route reaches entrance before surface destination movement,
- return reaches entrance then interior home,
- combat interruption does not discard habitat identity,
- bear trip config is declarative,
- ordinary surface animals retain existing movement,
- `rockDen` legacy snapshot restores the same lifecycle state,
- persistent occupant tombstone prevents replacement.

Prefer pure route/journey tests over Three.js-heavy full-agent tests where possible.

## Implementation order

1. Add/test cave-scoped semantic/traversal API over current retained `CaveRuntime`.
2. Add safe `cave` → `rockDen` naming migration for decorative spawners.
3. Add fauna cave habitat binding and resolve it during `createFauna()` construction/hydration.
4. Introduce shared animal ground/horizontal seam and species/body dimensions needed by containment.
5. Add topology-route traversal plus explicit committed journey semantics.
6. Compose existing needs/water-trip lifecycle with cave exit/return.
7. Add bear `AnimalDef.trips.water`.
8. Wire a cave-backed `PersistentOccupantDecl` only when the first consumer (`quests-progression-008`) is ready; fauna-019 itself should prove the reusable contract independently.

## Verification

Run appropriate automated checks:

```text
npx tsc --noEmit
npm run lint
npm run build
npm run test
```

Do not run browser verification; the User performs it.

Do not run `pnpm docs:sync` manually; GitHub workflow owns derived-doc synchronization.
