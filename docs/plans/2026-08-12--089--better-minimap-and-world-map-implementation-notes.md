# Implementation Notes — Better Minimap and World Map

**Plan:** [2026-08-12--089--better-minimap-and-world-map.md](./2026-08-12--089--better-minimap-and-world-map.md)
**Status:** `planned` — implementation notes ready for review
**Priority:** 🟡 `medium`
**Effort:** `XL`
**Dependencies:** existing minimap (`029`, `067`), Vue UI (`046`), settlement/world streaming/persistence systems

---

## 0. Review result

Plan 089 is directionally correct, but the original draft mixes three different problems:

1. **map projection/rendering** — how terrain and world features are represented visually;
2. **discovery state** — what area the player has actually explored;
3. **world knowledge** — information learned from NPCs, books and maps.

These should not be implemented as one `MapManager` containing all three responsibilities.

The implementation should start with a small shared **map-data/discovery layer** consumed by both minimap and world map. The richer knowledge system should remain a separate extension point and should not block the first playable map.

The current minimap is deliberately simple: `drawMinimap.ts` transforms world positions into a canvas around the player, while `MinimapScreen.vue` owns the canvas and collapse/toggle UI. It currently has no terrain/biome rendering and no discovery state. fileciteturn3file0L2-L6 fileciteturn4file0L2-L6

The current save format is already versioned and currently canonical at v10, so map discovery should be added through the existing migration chain rather than introducing another persistence mechanism. fileciteturn7file0L2-L2

The world already exposes chunked procedural terrain, biome sampling and worker-backed chunk generation through `ChunkManager` and the terrain sampling modules. fileciteturn9file0L2-L6

---

## 1. Product decisions

### D1 — Shared map model, separate renderers

Both minimap and world map use the same read-only map-data service. They must not maintain separate terrain/biome/discovery caches.

Suggested responsibility split:

```text
MapData / MapDiscovery
    ↓
Minimap renderer
World map renderer
```

`MapData` is not the owner of terrain, settlements or landmarks. It is a projection/query layer over existing world systems plus persisted discovery state.

### D2 — First version uses permanent discovery

For the first implementation:

- `unknown` = never discovered;
- `discovered` = permanently known after exploration;
- no `currentlyVisible` state;
- no realtime line-of-sight;
- no height-based visibility calculation.

This keeps the system deterministic, cheap and easy to persist. A future `seen/currentlyVisible` model can be added without changing the UI contract if discovery is represented as a separate state layer.

### D3 — Exploration reveals an area, not individual objects

Discovery is recorded spatially, preferably using map chunks/cells rather than one entry per world coordinate.

The player periodically reveals a radius around their current position. The update should be distance/boundary based rather than executed as a full-world operation every frame.

Initial default behaviour:

- reveal around the player while moving;
- batch updates during gameplay;
- reveal only cells intersecting the exploration radius;
- emit/queue a change only when a previously unknown cell becomes discovered.

The exact radius should be a named gameplay/config value, not embedded in the renderer.

### D4 — Map is based on deterministic world projection

The map should not depend on currently loaded render meshes.

If a map cell is needed for an area whose 3D chunk is currently unloaded, its terrain/biome classification must be obtainable from the existing deterministic terrain/biome sampling functions or from a dedicated map projection built on those functions.

Do **not** force `ChunkManager` to keep all map chunks loaded just because the world map is open.

### D5 — No full raster cache in v1

Use a compact data cache first:

- map cell/chunk key;
- terrain/biome classification needed for display;
- discovery state;
- known-location records.

Do not introduce persistent PNG/bitmap/Canvas caches in the first implementation.

The Canvas renderer may later maintain an in-memory rendered-tile cache if profiling shows that repeated drawing is expensive.

Reason: the world is procedural and streamable, while a raster cache introduces invalidation, memory and persistence complexity before the actual map workload is known.

### D6 — Known locations are separate from discovery

A settlement may be procedurally present in the world without being known to the player.

Therefore:

```text
world location exists
        ≠
player knows location
```

The map renderer receives only locations that the player is allowed to know about.

For v1, exploration can automatically turn a location into `discovered` when the player enters its discovery radius. NPC/book knowledge remains future work.

### D7 — Knowledge system is deferred, but the data seam is ready

Do not implement the full NPC/book/map knowledge model in plan 089 v1.

However, known-location records should have a source/state shape that can later support:

- `exploration`
- `npc`
- `book`
- `map`

and confidence such as:

- `estimated`
- `discovered`
- `confirmed`

The first implementation may use only `exploration + confirmed`.

This prevents the map from having to be rewritten when dialogue/books begin supplying world information.

### D8 — Large map is a UI overlay, not a new application route

The repository currently uses a single-page Vite application and Vue screens/overlays rather than a route-based application. The world map should therefore be another Vue screen/overlay integrated with the existing UI store/screen lifecycle.

No Vue Router dependency should be introduced for this feature.

### D9 — Minimap remains heading-up

The current minimap already implements heading-up behaviour and a true north marker. Plan 089 must preserve this contract.

The world map should be **north-up** by default. A future rotation option may be added independently.

This gives the two views distinct purposes:

- minimap = immediate orientation;
- world map = stable geographic planning.

### D10 — First version map scope is bounded

The procedural world can stream indefinitely, so a world map cannot imply an infinite high-resolution canvas.

The map view should use a configurable finite world-map extent centred on the world origin/configured world bounds.

If the current world has no explicit hard boundary, v1 should use a named map extent larger than normal gameplay exploration and render outside it as unavailable rather than silently generating an unbounded map.

The extent must be configurable and should not be tied to the current `ChunkManager.loadRadius`.

---

## 2. Recommended architecture

### 2.1 New map domain

Add a small domain under `src/world/map/` (or the repository's equivalent world-domain location after checking existing conventions):

```text
src/world/map/
  mapTypes.ts
  mapProjection.ts
  mapDiscovery.ts
  mapData.ts
```

Responsibilities:

#### `mapTypes.ts`

Shared types only:

```ts
MapCellKey
MapCellData
MapDiscoveryState
MapKnownLocation
MapLayer
MapSource
MapConfidence
```

Avoid Three.js/UI imports here.

#### `mapProjection.ts`

Pure/deterministic world → map queries:

- world position → map cell;
- map cell → world bounds/centre;
- terrain/biome classification;
- water classification;
- optional aggregation for low zoom.

It should reuse existing terrain/biome sampling instead of duplicating noise logic.

#### `mapDiscovery.ts`

Owns the player's discovery state:

- discover radius/cells;
- query whether a cell is discovered;
- batch discovery changes;
- serialize/restore compact discovery data.

It should not draw anything.

#### `mapData.ts`

Read-side facade used by UI:

- visible map cells for a viewport;
- known locations;
- discovery state;
- layer data.

It coordinates projection + discovery + existing world location sources without becoming a second world simulation.

### 2.2 UI

Suggested additions:

```text
src/ui-vue/lib/drawMap.ts
src/ui-vue/screens/WorldMapScreen.vue
```

`drawMinimap.ts` should remain the minimap-specific renderer, but its terrain/layer data should come from the shared map domain.

`WorldMapScreen.vue` owns:

- pan;
- zoom;
- layer toggles;
- close/open interaction;
- canvas sizing/DPR;
- touch gestures.

`drawMap.ts` owns Canvas rendering and must remain free of Vue reactivity.

### 2.3 Game integration

The simulation/game loop should own discovery updates because discovery is gameplay state, not UI state.

Conceptually:

```text
PlayerController position
        ↓
MapDiscovery.update(position)
        ↓
changed discovery cells
        ↓
MapData invalidation / UI repaint
```

Opening the map must never be responsible for discovering the world.

---

## 3. Map representation

### 3.1 Cell size

Use a coarse logical map cell rather than one entry per terrain vertex.

Recommended starting size: **8 world units per map cell**.

This is intentionally independent from the terrain chunk resolution.

Reasons:

- small enough for readable local terrain;
- large enough to keep discovery compact;
- avoids storing millions of tiny cells unnecessarily;
- easy to aggregate later.

The constant should be configurable so it can be tuned after browser testing.

### 3.2 Cell data

A first-pass cell can contain:

```ts
export type MapCellData = {
  key: string
  terrain: MapTerrainKind
  biome: MapBiomeKind
  water: boolean
}
```

Do not store raw Three.js objects, meshes, materials or textures.

Terrain/biome enums should map to existing world classification concepts rather than introducing a second biome taxonomy.

### 3.3 Discovery storage

Use a sparse set of discovered cell keys:

```ts
Set<MapCellKey>
```

For persistence, serialize as an array or another compact representation selected after measuring typical explored-area sizes.

Do not persist the rendered image.

If explored worlds become large enough for `string[]` to become expensive, the representation can later change to compressed row/range encoding without changing the gameplay API.

---

## 4. Rendering strategy

### 4.1 Minimap

The existing minimap should evolve incrementally.

Keep:

- canvas rendering;
- imperative drawer registration;
- heading-up transform;
- north marker;
- current collapse/toggle behaviour;
- current touch/desktop placement.

Add:

1. terrain/biome background cells;
2. discovery masking;
3. limited zoom;
4. optional terrain/biome layers;
5. settlement/location markers from known map data;
6. player marker on top.

The player/NPC/settlement rendering must remain lightweight. NPC dots should not be expanded into a general-purpose entity map layer in v1.

### 4.2 World map

Use a canvas-based renderer initially, not thousands of Vue DOM elements.

Rendering pipeline:

```text
viewport
  ↓
map cell range
  ↓
MapData queries/cache
  ↓
terrain/biome cells
  ↓
Fog of War mask
  ↓
known locations / roads
  ↓
player marker
```

Pan and zoom change only the viewport transform. They should not mutate discovery state.

### 4.3 Zoom levels

Start with continuous Canvas zoom but use discrete data aggregation internally if needed.

Initial limits:

- minimap: small bounded range, e.g. `1x–3x` current scale;
- world map: enough range to see the full configured map extent;
- no arbitrary infinite zoom-out.

Exact values should be tuned in browser testing.

---

## 5. Fog of War

### 5.1 Rendering rule

For a discovered cell:

- render terrain/biome normally;
- known locations may be shown according to their knowledge state.

For an undiscovered cell:

- do not expose terrain/biome;
- render the unknown/fog representation.

Do not generate terrain underneath the fog merely to draw it. The renderer should query only what it needs for visible discovered cells where possible.

### 5.2 Discovery update

Use a spatial radius around the player, converted to affected map cells.

The update should be batched and cheap:

```text
player movement
  ↓
cell changed?
  ↓ yes
calculate affected cells
  ↓
insert newly discovered keys
```

There is no need to run this every frame if the player remains inside the same discovery cell.

### 5.3 Future visibility

Do not implement:

- LOS raycasts;
- mountain occlusion;
- `currentlyVisible`;
- observer elevation;
- day/night-dependent map visibility.

The type boundary should leave room for them later.

---

## 6. Known locations and layers

### V1 layers

Implement only:

- terrain/biome base;
- water;
- Fog of War;
- settlements;
- player position.

### V1.1 / later

- roads/paths;
- landmarks;
- other important locations;
- NPC-supplied locations;
- book/map knowledge;
- resources.

Resources should **not** be shown in v1. Revealing every iron/coal/gold deposit would turn the map into a resource scanner and contradict the game's exploration/simulation direction.

### Location record

Suggested shape:

```ts
export type MapKnownLocation = {
  id: string
  kind: MapLocationKind
  x: number
  z: number
  state: 'estimated' | 'discovered' | 'confirmed'
  source: MapSource
  label?: string
  description?: string
}
```

For v1, only `confirmed + exploration` is produced.

The record should support an estimated location later without requiring a second marker system.

---

## 7. Settlement integration

The settlement systems are the authoritative source for settlement identity and position. The map must query them rather than duplicate settlement definitions.

Important distinction:

- generated settlement = exists in world;
- discovered settlement = player has explored it;
- known/estimated settlement = future knowledge source may reveal it.

The current minimap already receives settlement positions/names and NPC lists from runtime code. fileciteturn3file0L2-L6

The new map layer should replace the ad-hoc settlement rendering input with a shared map-location projection over time, but the first change can be incremental to reduce regression risk.

---

## 8. Roads and paths

Do not attempt to reconstruct roads by inspecting rendered meshes.

The existing settlement/road systems already contain path/road definitions and generated corridors. The map projection should consume those authoritative definitions when roads are added as a map layer.

Road rendering is deferred from the initial implementation unless it is already cheap to expose from the existing road network.

---

## 9. Persistence

Add discovery to the canonical `SaveData` using the existing version/migration pattern.

Because the current canonical save is v10, the implementation should introduce v11 only when code changes begin.

Suggested field:

```ts
map: {
  discoveredCells: string[]
}
```

Do not persist derived terrain/biome data.

Do not persist Canvas/raster caches.

Do not persist currently visible state because v1 has no such state.

Backward compatibility:

- v10 and older saves load with an empty discovery set;
- loading an older save must not expose the whole world;
- the player's starting area should be discovered after the world is initialized through the normal discovery update path.

The migration should be tested as pure logic in the existing Vitest/node setup.

---

## 10. Cache and invalidation

### V1 cache

Use an in-memory `Map<MapCellKey, MapCellData>` for generated projection data.

Discovery is a separate `Set<MapCellKey>`.

This distinction is important:

```text
projection cache = derived from world seed/config
knowledge/discovery = player state
```

A cache eviction does not forget explored terrain.

### Invalidation

Most terrain/biome map cells are deterministic and immutable for the current world seed, so they do not need frequent invalidation.

If a future mutable world feature affects map appearance, it should explicitly invalidate the affected map cells.

The map must not rebuild every cell because an unrelated world object changed.

### Rendering cache

Do not implement a bitmap cache until profiling demonstrates a need.

If needed later, use a per-tile raster cache keyed by:

```text
cell/tile coordinate + zoom bucket + layer state
```

and invalidate only affected tiles.

---

## 11. Performance constraints

The implementation must preserve the existing simulation/rendering architecture.

Rules:

- no full-world scan every frame;
- no Three.js mesh traversal to render the map;
- no Vue reactive state updated per frame with player position;
- no generation of all procedural chunks just because the world map opens;
- discovery updates are event/boundary driven or batched;
- world-map drawing occurs only when visible or when its data changes;
- minimap should continue using an imperative canvas drawer rather than Vue reactive per-frame state.

The current minimap explicitly uses a registered imperative drawer to avoid putting per-frame positions into Vue reactive state; retain that pattern. fileciteturn3file0L2-L6

Web Workers are **not required for v1**. Map projection uses existing deterministic samplers and should first be measured on the main thread. A worker becomes justified only if profiling shows large viewport generation or rasterization causes frame stalls.

---

## 12. Input / UX

### Desktop

World map:

- mouse drag = pan;
- wheel = zoom;
- close button / Escape = close;
- click known marker = optional small info panel in later phase.

### Touch

World map:

- one-finger drag = pan;
- pinch = zoom;
- dedicated close button;
- no hover-only interactions.

Minimap keeps the current collapse/toggle UX.

Do not add a large amount of HUD chrome around the minimap.

### Opening the map

Use an existing key/input action if one exists for screens; otherwise introduce one named action such as `openWorldMap` in the input layer rather than hard-coding a key inside the Vue component.

---

## 13. Implementation phases

### Phase 1 — Map domain + projection

- [ ] Add shared map types.
- [ ] Add world→map cell conversion.
- [ ] Reuse existing terrain/biome samplers.
- [ ] Add compact map-cell cache.
- [ ] Add unit tests for coordinate conversion and deterministic projection.
- [ ] Keep the feature disconnected from UI initially.

### Phase 2 — Discovery + persistence

- [ ] Add `MapDiscovery` with permanent discovered state.
- [ ] Add batched radius discovery around player.
- [ ] Add SaveData v11 migration.
- [ ] Load older saves with empty discovery.
- [ ] Add persistence tests.
- [ ] Discover starting area through the normal runtime update path.

### Phase 3 — Minimap terrain + Fog of War

- [ ] Extend `drawMinimap.ts` to render shared map cells.
- [ ] Preserve heading-up and north marker.
- [ ] Add bounded zoom.
- [ ] Add Fog of War.
- [ ] Add terrain/biome base layer.
- [ ] Render known settlements through shared location data.
- [ ] Preserve collapse/touch behaviour.

### Phase 4 — World map MVP

- [ ] Add `WorldMapScreen.vue`.
- [ ] Add canvas map renderer.
- [ ] Add pan.
- [ ] Add zoom.
- [ ] Add terrain/biome/water/Fog of War layers.
- [ ] Add known settlement markers.
- [ ] Add player position.
- [ ] Add desktop + touch input.
- [ ] Add Escape/close handling.

### Phase 5 — World map polish

- [ ] Add roads/paths if the existing road network exposes a clean projection API.
- [ ] Add landmarks through the same known-location abstraction.
- [ ] Add layer toggles.
- [ ] Tune map extent and zoom limits.
- [ ] Tune visual hierarchy and marker readability.
- [ ] Profile large explored areas.

### Phase 6 — Knowledge integration

Separate follow-up work; not required to ship the map MVP.

- [ ] Introduce shared knowledge/discovery source metadata.
- [ ] NPCs can provide estimated locations.
- [ ] Books/maps can provide known locations or areas.
- [ ] Add confidence states.
- [ ] Exploration confirms estimated locations.
- [ ] Support intentionally incorrect information where gameplay requires it.

This phase should probably become a separate plan once the dialogue/book knowledge systems are mature enough to provide real sources.

### Phase 7 — Optional advanced map systems

Future only:

- [ ] `seen/currentlyVisible` distinction.
- [ ] observation/height-based discovery.
- [ ] resource layer.
- [ ] player-authored markers.
- [ ] raster tile cache.
- [ ] worker-backed map rendering/projection if profiling justifies it.

---

## 14. Files likely to change

### Existing

- `src/ui-vue/lib/drawMinimap.ts`
- `src/ui-vue/screens/MinimapScreen.vue`
- `src/ui/createMinimap.ts`
- `src/persistence/saveData.ts`
- runtime/game-loop integration where player movement/discovery is owned
- relevant UI store/input files
- `docs/plans/README.md` only when plan status changes

### New

Exact names should follow existing repository conventions, but likely:

- `src/world/map/mapTypes.ts`
- `src/world/map/mapProjection.ts`
- `src/world/map/mapDiscovery.ts`
- `src/world/map/mapData.ts`
- `src/ui-vue/lib/drawMap.ts`
- `src/ui-vue/screens/WorldMapScreen.vue`

Tests should sit beside the pure map modules using the existing Vitest conventions.

Do not create a `MapManager` that owns settlements, roads, terrain generation, discovery, persistence and UI. That would become a parallel world system and violate the project's ownership boundaries.

---

## 15. Testing strategy

### Pure unit tests

Test at minimum:

- world ↔ map-cell conversion;
- cell bounds/centre;
- deterministic terrain/biome projection;
- discovery radius → affected cells;
- duplicate discovery does not create duplicate state;
- discovery serialization/deserialization;
- SaveData v10 → v11 migration;
- known-location filtering/state.

### Browser/manual tests

1. Start a new world.
2. Confirm only the initial discovery area is visible.
3. Walk in a straight line and confirm new map cells appear without revealing the whole world.
4. Return to an already explored area and confirm it remains known.
5. Open the large map and pan/zoom far away from the player.
6. Confirm the large map does not force all distant world chunks to load.
7. Confirm heading-up minimap still rotates with the player.
8. Confirm north remains correct on the minimap.
9. Confirm world map remains north-up.
10. Save, reload and confirm Fog of War/discovery persists.
11. Test desktop and touch layouts.
12. Test a large explored area and watch for frame stalls/memory growth.

---

## 16. Review questions before implementation

The original plan contains ten open questions. Most can now be resolved as follows:

| Question | Decision |
|---|---|
| 1. Separate knowledge/discovery system? | **Yes, eventually.** Discovery is part of the first map domain; rich world knowledge is a separate later layer. |
| 2. Permanent vs current visibility? | **Permanent discovered only for v1.** |
| 3. NPC/book info reveals marker or area? | **Deferred.** The data model supports both, but no NPC/book integration in v1. |
| 4. How wrong can NPC information be? | **Deferred to knowledge-system design.** Do not encode false-information mechanics in the map renderer. |
| 5. Player markers in v1? | **No.** Follow-up. |
| 6. Resources layer? | **No.** Follow-up. |
| 7. Cache data/raster/hybrid? | **Data cache first.** Raster cache only after profiling. |
| 8. Persistence from first implementation? | **Yes.** Discovery is gameplay state and must persist from v1. |
| 9. Maximum map extent? | **Configurable finite extent.** Do not bind it to streamed chunk radius or pretend the canvas is infinite. |
| 10. Same cache/model for minimap/world map? | **Yes.** One shared map data/discovery source, two renderers. |

One remaining product choice is worth confirming before coding: **the initial discovery radius**. The implementation can use a named config value and tune it later, but the intended gameplay scale should ideally be agreed before Phase 2.

Recommended starting value: **48 world units around the player**, which is large enough to make the minimap useful while still making exploration visibly expand the world map.

---

## 17. Acceptance criteria

- [ ] Minimap remains heading-up and retains its true-north indicator.
- [ ] Minimap renders terrain/biome information from the shared map projection.
- [ ] Unknown terrain is hidden.
- [ ] Discovery is permanent in v1.
- [ ] Discovery is persisted in SaveData.
- [ ] World map supports pan and bounded zoom.
- [ ] World map is north-up.
- [ ] Minimap and world map use the same map-data/discovery source.
- [ ] Settlement markers come from authoritative settlement data and are filtered by player knowledge.
- [ ] No full-world scan happens every frame.
- [ ] Opening the world map does not force all procedural chunks to load.
- [ ] No second terrain/biome generation algorithm is introduced.
- [ ] No persistent raster cache is introduced before profiling justifies it.
- [ ] Existing minimap collapse/touch behaviour remains intact.
- [ ] Save migration remains backward compatible.
- [ ] Unit and browser/manual tests pass.

---

## 18. Important implementation cautions

1. **Do not derive the map from Three.js meshes.** Render meshes are a presentation/streaming concern.
2. **Do not make the world map own world knowledge.** It should consume knowledge.
3. **Do not discover the world while rendering the map.** Discovery belongs to simulation/gameplay state.
4. **Do not equate generated locations with known locations.** This is essential for future NPC/book information.
5. **Do not persist derived map pixels.** Persist compact discovery/knowledge state.
6. **Do not use Vue reactivity for per-frame minimap positions.** The existing imperative drawer pattern is intentional. fileciteturn3file0L2-L6
7. **Do not introduce workers without profiling.** The first map implementation should be simple and measurable.
8. **Do not implement all original plan layers at once.** The resource layer, player markers, uncertain NPC reports and advanced visibility belong to later phases.

The result should be a small shared map system that both UI views project, not a new monolithic world manager.
