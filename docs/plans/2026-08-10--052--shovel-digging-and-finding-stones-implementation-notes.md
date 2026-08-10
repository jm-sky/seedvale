# Plan 052 — Implementation Notes

**Plan:** `2026-08-10--052--shovel-digging-and-finding-stones.md`
**Purpose:** implementation brief for Claude Code. Prefer extending existing item, interaction, inventory and terrain seams; do not create a standalone `ShovelSystem`.

## 1. Repository reality / important existing seams

### Items + inventory

- `src/items/items.ts`
  - `ItemKind` is the canonical item union.
  - `ITEM_DEFS` contains label/category/weight/color.
  - `createItemMesh(kind)` is the canonical cheap procedural pickup mesh.
  - `stone` already exists as a `resource` (`weight: 1`). **Do not add a second stone/resource type.**
  - Tools already include `knife` and `firestarter`.
- `src/items/Inventory.ts`
  - `has(kind, n)`, `canAdd(kind, n)`, `add(kind, n)`, `remove(kind, n)` are the intended API.
  - Inventory is already persisted through `toJSON()`/`SaveData` and instantiated in `createApp.ts`.
  - Therefore plan 052 no longer needs a temporary resource state: the real inventory exists.

### Existing item pickup / interaction

- `src/interaction/Interactable.ts` defines the per-frame `Interactable` union and `WorldItemRef`.
- `src/app/interactables.ts` builds item candidates from:
  - procedural chunk items (`source: 'world'`),
  - renewable settlement spawners (`source: 'spawner'`),
  - dropped items (`source: 'dropped'`).
- `src/app/gameLoop.ts` owns `[E]` interaction routing. Item pickup already checks `inventory.canAdd()`, calls `collectItem()`, then updates HUD/touch state.
- `INTERACT_RANGE = 2.5`, `INTERACT_MIN_DOT = 0.5`.
- Use the same `[E]` interaction/gaze machinery for picking up the shovel. Do not introduce another input handler.

### Item spawning / world drops

- `src/items/createItemSpawners.ts` has a renewable settlement pool. `SPAWN_SPECS` currently includes `stone` and `shell`; it is a good place for a guaranteed village shovel point if the implementation wants a deterministic pickup near the settlement.
- `src/items/createDroppedItems.ts` handles player-dropped inventory items and places them using the terrain height sampler.
- `createItemMesh()` currently has no shovel branch. A simple procedural shovel mesh is sufficient for v1; avoid introducing a GLB pipeline solely for this feature.

### Player actions

- `src/app/userActions.ts` is the existing home for non-gaze player actions (`buildSimpleFire`, `buildFirePit`, `lightTorch`).
- `src/ui/createQuickActions.ts` is the facade for the Vue quick-actions UI.
- A digging action is conceptually a player action, so put the reusable `dig` operation behind the existing action layer rather than embedding all game rules directly in UI code.
- The action must be available only when `inventory.has('shovel', 1)`.

### Terrain

- `src/terrain/chunkManager.ts` exposes runtime samplers (`sampleHeight`, `sampleFloor`, biome/region samplers) and owns loaded chunk meshes.
- Terrain is generated per chunk in workers (`requestChunkTile`), then rendered by `buildChunkGeometry()`.
- `ChunkTileData.heights` is the generated height field. `buildChunkGeometry()` converts it to a Three.js mesh.
- `src/terrain/chunkHeightmap.ts` has analytic procedural samplers (`sampleHeightAt`, `sampleFloorAt`, etc.). These are the **base/procedural** terrain, not the right place to permanently mutate noise output.
- Existing terrain shaping (roads/clearings) is already layered on top of raw procedural height before rendering. Plan 052 should follow the same architectural idea: a runtime modification layer on top of generated terrain.
- `biomeRegions.ts` provides soft desert/swamp/forest weights, but there is currently no explicit `soil/clay/sand/rock` enum. Do not invent a large terrain-type system for v1.

## 2. Recommended architecture

### Runtime terrain modification layer

Add a small generic runtime layer owned by `ChunkManager`, conceptually:

```ts
type TerrainModification = {
  x: number
  z: number
  radius: number
  depth: number
}
```

Use a **smooth radial falloff** (not a flat disk):

```ts
falloff = 1 - smoothstep(0, radius, distance)
deltaY = -depth * falloff
```

Multiple modifications are additive. This naturally means nearby digs can merge into a larger depression.

Recommended ChunkManager API shape (names are illustrative, keep local conventions):

```ts
modifyTerrain(modification: TerrainModification): boolean
sampleHeight(x: number, z: number): number
```

Important: `sampleHeight()` must return **base height + runtime modifications**. Do not change `sampleHeightAt()` itself, because that function is the seed-derived procedural source used by terrain generation.

### Applying the modification to rendered chunks

When a dig is accepted:

1. Store the modification in the runtime layer.
2. If its area overlaps a loaded chunk, update that chunk's height data / mesh.
3. Rebuild normals for the affected terrain mesh using the existing `buildChunkGeometry()` path if practical; avoid maintaining a second terrain-rendering implementation.
4. If a future chunk is generated/reloaded, re-apply all runtime modifications intersecting that chunk before building its final mesh.

Do **not** modify worker-generated procedural values permanently or mutate the global noise functions.

The modification layer should be able to cross chunk boundaries. A dig near an edge must affect both loaded chunks, otherwise the seam will visibly break.

### Collision / player grounding

`PlayerController` receives `bundle.chunkManager.sampleHeight` and `sampleFloor`. Since the player is already wired to the ChunkManager sampler, the runtime-modified height should automatically become the collision/ground height once the sampler is layered correctly. Do not add shovel-specific collision code.

`sampleFloor` can remain unchanged unless the implementation discovers that the current player collision semantics require it to follow the visual depression. Prefer the smallest change consistent with existing terrain semantics.

## 3. Ground classification for dig validation

There is no existing canonical `TerrainType` enum. Keep classification derived and local to the dig operation.

Recommended priority:

1. **Rock / mountain:** reject digging when `sampleMountainRidge(x, z)` or altitude indicates mountain rock.
2. **Sand:** detect the existing shoreline/sand condition used by terrain rendering (reuse the existing `SAND_BAND`/height relation rather than adding a new terrain database).
3. **Soil/grass:** default land surface.
4. **Dirt/clay:** if the repo already exposes a reliable dirt/clearing/path signal, reuse it; otherwise treat ordinary dry land as soil and skip a fake clay system.

The plan's exact soil table is gameplay guidance, not a requirement to create a new terrain taxonomy.

A practical v1 result can therefore be:

- ordinary dry land → dig, medium stone chance;
- sand → dig, low stone chance and shallower hole;
- obvious mountain/rock surface → reject;
- water/ocean → reject.

Keep the classification in one helper, e.g. `getDigSurfaceAt(...)`, so the probabilities and terrain rules do not leak through the game loop.

## 4. Suggested gameplay constants

Use named constants so tuning is trivial. Initial values can be approximately:

```ts
const DIG_RADIUS = 0.75
const DIG_DEPTH = 0.12
const DIG_SAND_DEPTH = 0.06
const STONE_CHANCE_SOIL = 0.45
const STONE_CHANCE_SAND = 0.15
const STONE_CHANCE_DIRT = 0.70
const DIG_COOLDOWN_SEC = 0.5
```

These are **starting values**, not API contracts. The important part is that they are centralized and easy to tune.

If inventory is full, do not perform a successful resource-producing dig and then silently lose the stone. Prefer checking `inventory.canAdd('stone')` before the resource roll / modification, or otherwise make the outcome explicit. A failed inventory capacity check should not consume the player's action unexpectedly.

## 5. Shovel item

Add `shovel` to the existing `ItemKind` and `ITEM_DEFS` as a `tool`.

Suggested definition:

```ts
shovel: {
  label: 'łopata',
  category: 'tool',
  weight: 2,
  color: 0x6b4a32,
}
```

Weight is a tuning value; preserve the existing inventory weight model.

Add a small procedural shovel to `createItemMesh('shovel')` (handle + blade/group). It only needs to be readable at pickup range.

### Village placement

The plan says the shovel is in the village. Prefer a deterministic, explicit settlement placement rather than a random world item. If the current item-spawner architecture is the cleanest seam, add a dedicated shovel spawn point there with `respawnTime` effectively disabled / otherwise ensure it behaves as a one-time pickup. Do not make the shovel a generic random world resource.

If the existing item spawner contract cannot express a non-renewable item cleanly, add the smallest explicit settlement pickup representation rather than abusing respawn semantics.

## 6. Dig interaction UX

Recommended v1 flow:

```text
player looks at valid ground
        ↓
[E] / existing interaction action
        ↓
has shovel?
        ├─ no → no dig action
        └─ yes
             ↓
      validate surface
             ↓
      check stone capacity
             ↓
       apply depression
             ↓
       roll stone chance
             ↓
       inventory.add('stone')
```

The interaction target should be represented by the existing `Interactable` system, but avoid creating an interactable for every terrain vertex. A **single synthetic ground interaction target** based on the player's current aimed point is preferable.

If the current gaze picker only works on finite world objects, extend it minimally so the terrain can expose an interaction candidate at the aimed/forward ground position. Do not add a second terrain-specific input path.

The prompt should only appear when the player has the shovel and the aimed location is diggable, e.g. `Wykop dołek`.

## 7. Resource result

`stone` already is the canonical resource. Use:

```ts
inventory.add('stone')
```

and the existing HUD weight update / touch drop state update, exactly like current tree/campfire/item interactions.

If the visual feedback includes a physical stone at the hole, use the existing `createItemMesh('stone')` and/or `DroppedItems.drop('stone', x, z)` only if that matches intended persistence. A simpler v1 is toast + inventory only; the plan's visible stone is optional feedback, not a new resource system.

## 8. Feedback

Reuse existing infrastructure:

- `createToast()` for `+1 Kamień`, invalid terrain, full inventory, etc.
- `worldAudio.playOnce` / existing world audio for a shovel hit if an appropriate sound path exists.
- A tiny temporary particle/dust effect can be local to the action; avoid a general particle framework unless one already exists.
- The actual depression is the primary persistent visual feedback.

Do not add a second notification system.

## 9. Persistence decision

**Do not add terrain-modification persistence in plan 052 unless it falls out almost for free.**

Current saves already persist inventory and world-generated collected item ids, but terrain modifications are not part of `SaveData`. Adding them would require save schema/version work and careful restoration ordering.

Runtime-only is acceptable for this plan. On reload, procedural terrain returns to its base state while inventory remains persisted. Document this explicitly in implementation if needed; do not accidentally imply that holes survive save/load.

## 10. Tests / verification matrix

At minimum, cover pure/runtime logic without needing WebGL where possible.

### Terrain modification

1. One dig at `(0, 0)` lowers the center by approximately `depth`.
2. At `distance >= radius`, height is unchanged.
3. At the edge, height transitions smoothly (no hard step).
4. Two nearby digs are additive.
5. A dig crossing a chunk boundary modifies both sides consistently.
6. Procedural/base height is unchanged when no runtime modification exists.
7. Rebuilding/reloading a chunk reapplies runtime modifications.

### Dig rules

8. No shovel → action unavailable.
9. Shovel + normal soil → dig succeeds.
10. Shovel + sand → shallow dig + lower stone chance.
11. Rock/mountain → dig rejected and terrain unchanged.
12. Water → dig rejected and terrain unchanged.
13. Full inventory → no successful stone-producing dig (choose and test one explicit policy).
14. Successful roll adds exactly one `stone` and updates inventory weight.
15. Multiple successful digs accumulate stones normally.

### Item pickup

16. Shovel pickup uses existing `[E]` item interaction.
17. After pickup, `inventory.has('shovel', 1)` is true.
18. Shovel pickup respects inventory weight limit.
19. Shovel is not duplicated by rebuilds / unrelated terrain regeneration.

## 11. Files likely involved

Start investigation here; don't scan the whole repository unnecessarily:

- `src/items/items.ts` — `ItemKind`, `ITEM_DEFS`, shovel mesh.
- `src/items/Inventory.ts` — already sufficient for shovel/stone ownership.
- `src/items/createItemSpawners.ts` — possible settlement pickup seam.
- `src/items/createDroppedItems.ts` — only if a physical stone feedback/drop is desired.
- `src/interaction/Interactable.ts` — terrain interaction candidate if needed.
- `src/app/interactables.ts` — candidate assembly.
- `src/app/gameLoop.ts` — existing `[E]` routing and inventory/HUD patterns.
- `src/app/userActions.ts` — reusable player-action logic.
- `src/terrain/chunkManager.ts` — runtime terrain modification ownership and chunk reapplication.
- `src/terrain/chunkHeightmap.ts` — base analytic terrain only; don't contaminate procedural samplers.
- `src/terrain/buildChunkGeometry.ts` — existing terrain mesh construction/normals.
- `src/persistence/saveData.ts` / `src/app/createApp.ts` — inspect only if persistence is touched.

## 12. Architectural guardrails

- **No `ShovelSystem`.** Build a generic terrain modification/action seam.
- **No second inventory/resource model.** `stone` and `shovel` are `ItemKind`s.
- **No new terrain-type framework** just to implement grass/dirt/sand/rock.
- **No direct mutation of procedural noise/base samplers.** Runtime modifications are a separate overlay.
- **No per-vertex/per-frame dig interaction objects.** One aimed ground target is enough.
- **No duplicate `[E]`/keyboard handling.** Extend existing interaction/action flow.
- Keep the implementation small enough that later tools can reuse it: e.g. axe/chisel/farming should be able to call the same terrain/world-action primitives.

## 13. Suggested implementation order

1. Add `shovel` item definition + procedural mesh.
2. Add deterministic village shovel pickup through existing interaction infrastructure.
3. Add generic runtime `TerrainModification` storage/sampling to `ChunkManager`.
4. Apply modifications to loaded/generated chunk terrain and normals.
5. Make player ground sampling see modified height.
6. Add a small dig-surface classifier using existing terrain signals.
7. Add reusable `dig` action with shovel/capacity checks and stone roll.
8. Wire the action into existing `[E]` terrain interaction / quick action path.
9. Add minimal toast/audio/dust feedback.
10. Add focused unit tests for modification math + dig rules, then manual verification in a village scene.

## 14. Key conclusion for Claude

The repository already has the important foundation that the original plan assumed was future work: **Inventory exists and `stone` is already a first-class resource.** The main new foundation needed by plan 052 is therefore not inventory — it is a **small runtime terrain-modification layer** that composes with the existing chunk-generated height field and samplers.

Implement that layer generically and keep shovel-specific code limited to: item definition/pickup, dig eligibility/tuning, and calling the generic terrain modification + existing `stone` inventory path.
