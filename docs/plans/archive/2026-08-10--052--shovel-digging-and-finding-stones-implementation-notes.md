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

## 15. Actual implementation (2026-08-10)

Followed section 13's suggested order closely. Deviations from these notes, and what actually shipped:

**Terrain modification layer** (`src/terrain/chunkManager.ts`) — simpler than §2 sketched, because it mutates the loaded chunk's cached `tile.heights` (a `Float32Array`) **in place** rather than keeping deltas separate and summing them on every `sampleHeight()` call:
- `applyModificationToTile(tile, coord, chunkSize, resolution, mod)` (exported, pure — no scene/closure dependency) writes one modification's smooth radial falloff (`1 - THREE.MathUtils.smoothstep(dist, 0, radius)`) directly into the apron-inclusive heights grid, only over the modification's world-space bounding box.
- Because every loaded chunk's apron grid overlaps its neighbors by one texel, and the function computes the *same* world-space delta at the *same* world position regardless of which chunk's grid it's writing into, applying it once per loaded chunk keeps shared boundary texels identical — no separate cross-chunk reconciliation needed. Verified in `chunkManager.test.ts`.
- `sampleHeight()`/`readField('heights', ...)` needed **no changes** — they already read straight from a loaded chunk's `tile.heights`, so a mutated tile is automatically what every sampler (player grounding, fauna, item placement, etc.) and the rendered mesh see. `sampleHeightAt()` (the seed-derived analytic function) is untouched, exactly as the notes required.
- `ChunkManager` keeps a `modifications: TerrainModification[]` list (module-private `TerrainModification` type, exported for the test) purely so a chunk that unloads and later regenerates can have every intersecting modification re-applied to its fresh tile *before* its first `buildChunkGeometry()` call (`ensureLoaded`'s `.then()`), rather than to reconstruct anything from the mesh. This covers the "walk away and back" case (test matrix item 7) without needing a mesh-diffing approach.
- New `ChunkManager.modifyTerrain(x, z, radius, depth): boolean` pushes the modification, applies it to every currently-loaded chunk whose grid overlaps it, and rebuilds just those chunks' meshes via a small extracted `buildAndAttachMesh(rec, tile)` helper (also now used by the original chunk-load path, so there's one `buildChunkGeometry(...)` call site instead of two).
- **Water is not rebuilt** after a dig (only the terrain mesh is). Deliberate simplification: digging is only legal on dry land/soil (rock/water rejected up front), so a shallow 0.06-0.12 depth depression on legal ground shouldn't newly intersect `waterLevel` in practice. Flagged here in case a future, deeper terrain tool needs to revisit this.

**Ground classification** (`src/terrain/dig.ts`, new) — `getDigProfileAt(x, z, env: DigEnv): DigProfile | null`, `DigEnv` a narrow structural type (`sampleHeight`/`sampleMountainRidge`/`waterLevel`) `ChunkManager` satisfies by duck typing, same pattern as `naturalResources.ts`'s `ResourceEnv` — lets `dig.test.ts` use plain object literals instead of a real chunk manager. Implements exactly §3's "practical v1 result": water/shoreline margin and `mountainRidge > 0.3` (a threshold chosen to sit well before `biomeColors.ts`'s `applyMountainRock` visually reads as rock, not tuned to any single pixel) reject the dig; otherwise sand (height within `SAND_BAND` of `waterLevel`, reusing `biomeColors.ts`'s existing constant rather than re-deriving the threshold) gets a shallower hole and lower stone chance than ordinary soil. No dirt/clay tier — the repo has no reliable signal for it, as §3 anticipated, and the notes explicitly sanction skipping it.

**Interaction** — followed the "single synthetic ground target, not a per-vertex interactable" guidance (§6), but resolved the priority question the notes raised implicitly: the dig target is only synthesized as a **fallback**, after `pickInGaze` over the real `Interactable` list already returned nothing. Placing the aim point directly ahead of the player (needed so its position is deterministic without its own gaze picking) would otherwise make it register a ~1.0 dot-product and *always* win over every real, off-center interactable while the player held a shovel — an unintended regression this fallback ordering avoids entirely. `buildDigTarget()` lives in `app/interactables.ts` next to the other interaction constants; `Interactable` gained a `dig` variant carrying the already-resolved `DigProfile` (computed once, when the target is built, not re-derived in the `[E]` handler). `resolveInteraction()`'s `Exclude<...>` param type grew `'dig'` alongside the pre-existing `'campfire' | 'item' | 'npc'` exclusions, for the same reason (`Inventory` access `gameLoop.ts` has and that module doesn't).

**No `DIG_COOLDOWN_SEC`.** The notes suggested one, but digging goes through the *existing* `[E]` edge-triggered interact key (`keyboard.consumeInteract()`), same as tree/campfire/item — one dig per keypress is already structurally guaranteed without an extra timer, unlike a quick-actions-button flow a cooldown would actually need.

**Shovel item** (`src/items/items.ts`) — added to `ItemKind`/`ITEM_DEFS` exactly as suggested (`tool`, weight 2). Procedural mesh: cylinder handle + flattened cone blade, matching the existing `knife` two-mesh-group pattern.

**Village placement** (`src/items/createItemSpawners.ts`) — originally added to the `SPAWN_SPECS` table (same mechanism as `stone`/`shell`) with `respawnTime: Infinity`, anchored 20-42m from the settlement center like the other two. `ItemSpawner.ts`'s `updateItemSpawnPoints` only flips a collected point back to available once `timeSinceCollected >= respawnTime`, which can never happen for `Infinity` — a one-time pickup expressed through the existing contract, per §5's explicit instruction not to invent a second one.

**Placement fix (2026-08-10, post-verification):** manual testing found the shovel too easy to lose track of at 20-42m from center — later tightened to 2-10m (still `settlementCenter`-anchored), then replaced entirely with landmark anchoring per user request. The shovel is no longer in `SPAWN_SPECS`: it now spawns 50% of the time within 1m of the settlement's campfire (`SettlementLandmarks.campfire`, MD/LG settlements only) and 50% of the time 1-3m from the `garden` landmark (built unconditionally for every settlement, and — per `buildSettlementProps` — where the wheat patch sits when `foodSourceType === 'field'`, so it reads as "the field" for that case too). SM settlements have no campfire, so the shovel always uses the garden anchor there. `createItemSpawners()` takes a new `shovelLandmarks: { campfire?: Vector3, garden: Vector3 }` param, wired from `settlement.landmarks` in `worldBundle.ts`'s `buildItemSpawners`.

**Known limitation (pre-existing, not introduced by this plan):** `ItemSpawners`' collected/not-collected state was never persisted for *any* spawn point (stone/shell included) — only `Inventory` and `collectedItemIds` (the separate world-generated-item mechanism) survive a save/reload. This means reloading a save after picking up the shovel will show it back at its spawn point in the world even though it's already in the player's inventory. This is an existing gap in the spawner system this plan inherits, not a regression — flagged here rather than silently fixed, since fixing it is a separate, spawner-system-wide persistence change outside this plan's scope.

**Feedback** — toast only (`+1 Kamień` / `Wykopano dołek.` / capacity and invalid-terrain errors), matching §7/§8's explicitly-sanctioned "simpler v1." No dust particle (no existing one-shot particle system to reuse cheaply — `shared/getFireParticles.ts`'s `Sparks` is built for a persistent, per-frame-updated emitter like a campfire, not a fire-and-forget burst) and no sound effect (no shovel/dig-appropriate asset in `public/sounds/`, and item pickup itself has no sound today either — not a regression). The terrain depression itself is the primary, persistent visual feedback, as the notes anticipated.

**Persistence** — none added, per §9. Terrain modifications and (per the limitation above) spawner-collection state both reset on reload; `stone`/`shovel` counts in `Inventory` persist normally since inventory persistence was already generic.

**Tests** — `terrain/dig.test.ts` (6 cases: soil/sand/water/mountain-rock/shoreline-margin/gentle-foothill) and `terrain/chunkManager.test.ts` (7 cases covering test-matrix items 1-6: center depth, radius cutoff, smooth falloff, additive digs, untouched-by-default, out-of-bounds no-op, and cross-chunk-boundary seam consistency). Item-pickup matrix items (16-19) and the reload-reapplies-modifications case (item 7) aren't covered by automated tests — they need either a real `ChunkManager`/worker pool or a running game, consistent with this project's existing pattern of not unit-testing THREE/DOM integration (see `CLAUDE.md`). Covered instead by the manual verification steps below.

**Verified technically:** `npx tsc --noEmit`, `npx vue-tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test` (111/111) — all clean.

**Post-ship UX feedback (2026-08-11):** addressed in plan `2026-08-11--061--dig-ux-held-tool-and-level.md` (larger hole, 2s channel + overlay, stone notice/ground drop, held-tool slot, Wyrównaj). See that plan for what shipped.

**Not verified in browser** (per `CLAUDE.md` — requires the user on the running dev server). Concrete steps:

1. Start a new game, walk to the settlement, find the shovel (procedural cylinder+cone mesh, near the stone/shell spawn points) and pick it up with `[E]`. Confirm `inventory.has('shovel', 1)` via the inventory screen (`[I]`).
2. Without the shovel gone, look at ordinary grassy ground (not near any NPC/tree/item/campfire) and confirm the `[E]` prompt now reads "Wykop dołek".
3. Press `[E]` — confirm: a visible shallow depression appears at your feet-ish (slightly ahead, `DIG_REACH = 1.5`), a toast fires (`+1 Kamień` sometimes, `Wykopano dołek.` otherwise — try a handful of times to see both), and the depression's edge fades smoothly into the surrounding terrain rather than a hard cliff.
4. Dig a few times in a cluster near the same spot — confirm the depressions visibly merge into one shallower shared pit (not layered craters).
5. Walk toward a chunk boundary (roughly `chunkSize` world units — check `worldConfig.ts`'s default — from the origin) and dig right on it — confirm no visible seam/crack in the terrain mesh at the boundary.
6. Try digging on a steep mountain ridge and directly at the shoreline/underwater — confirm both are rejected (no depression, an "invalid terrain" toast or simply no dig outcome — whichever the UI shows should not silently consume the action).
7. Fill the inventory near its weight limit, then dig until a stone roll would succeed — confirm the "ekwipunek za ciężki" toast appears and no stone is silently lost.
8. Walk far enough that the dug chunk unloads, then walk back — confirm the depression is still there (modification re-applied on regeneration).
9. Reload the page mid-session (or Continue from a save made after digging) — confirm `stone`/`shovel` counts in inventory persisted correctly, and note (expected, not a bug to report) that any dug depressions are gone and the shovel pickup may show back at its spawn point despite already being in inventory (see "Known limitation" above).
10. No errors in the browser console throughout.
