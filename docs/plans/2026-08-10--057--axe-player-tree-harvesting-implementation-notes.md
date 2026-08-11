# Implementation Notes: Axe / Player Tree Harvesting

**Plan:** `docs/plans/2026-08-10--057--axe-player-tree-harvesting.md`
**Reviewed:** 2026-08-11
**Review basis:** current `main` repository state, `CLAUDE.md`, `docs/STATE.md`, `docs/ROADMAP.md`, `docs/plans/README.md`, plan 057, plan 058 + its implementation notes, and the relevant item/interaction/tree/resource plans and code.

## 1. Scope and architectural intent

057 is now a relatively small integration task because 058 has already introduced the important world-side tree lifecycle seam.

The intended ownership is:

```text
player input / gaze
        ↓
existing Interactable + [E] flow
        ↓
axe capability / held-tool validation
        ↓
shared world harvest
        ↓
TreeLifecycle.harvest(TreeId, ...)
        ↓
resource result (`branch` in v1)
        ↓
existing Inventory + feedback
```

Plan 058 already implemented the shared harvesting operation in `src/world/treeHarvest.ts` and the authoritative lifecycle state in `src/world/treeLifecycle.ts`. 057 must consume those APIs rather than recreate tree damage, stump, regrowth, or persistence logic.

The original 057 plan is directionally correct, but it predates several concrete changes made by 058 and 061. In particular:

- there is already a shared `harvestWorldTree()`;
- there is already a `TreeLifecycle.harvest()` API;
- `branch`, not `wood`, is the current canonical inventory resource for tree harvest;
- `HeldTool` is now the project's active-tool UX seam;
- `[E]` interaction is already centralized in `src/app/gameLoop.ts`;
- `BusyAction` is the existing timed-action/channel mechanism;
- world-generated trees are **not currently exposed as `Interactable` candidates**, even though settlement trees are.

That last point is the main missing integration seam for 057.

Do not create `AxeManager`, `TreeHarvestManager`, `PlayerChopSystem`, a second interaction system, or a second resource system.

## 2. Verified current implementation

### Application / world lifetime

`src/app/createApp.ts` owns the long-lived application composition. The mutable `WorldBundle` contains streamed world systems and is rebuilt in place; see `src/app/worldBundle.ts` and plan 054.

Tree lifecycle is created in `createApp.ts`:

```ts
let treeLifecycle = createTreeLifecycle(
  config.seed,
  parseTreeOverrides(initialSave?.treeOverrides),
)
const getWorldDays = () => dayNight.elapsedDays
```

The same lifecycle instance is passed into `createWorldBundle()` and then into `ChunkManager`. Do not capture a replaceable `ChunkManager`/bundle field by value in a long-lived callback; follow the WorldBundle reference-safety convention.

### Tree lifecycle

`src/world/treeLifecycle.ts` is the domain owner.

Important types/functions:

- `TreeGrowthStage = 'sapling' | 'young' | 'mature' | 'harvested'`
- `TreeId`
- `TreeStateOverride`
- `TreeEnvSample`
- `TreePresence`
- `ResolvedTreeState`
- `createTreeLifecycle()`
- `makeTreeId()`
- `advanceStage()`
- `envGrowthFactor()`
- `canopyGrowthFactor()`
- `TreeLifecycle.harvest()`
- `TreeLifecycle.findHarvestableNear()`
- `TreeLifecycle.countMatureNear()`
- `TreeLifecycle.serializeOverrides()`

The authoritative harvest operation validates the registered tree, resolves its current lifecycle stage, rejects non-mature trees, then writes:

```text
TreeStateOverride = {
  stage: 'harvested',
  stageStartedAt: worldDays
}
```

and returns the existing resource result:

```ts
{ ok: true, yield: { kind: 'branch', count: 3 } }
```

The exact yield is currently `HARVEST_YIELD = { kind: 'branch', count: 3 }`. Do not introduce `wood` unless a separate project-wide item decision changes the canonical resource model.

### Shared harvest operation

`src/world/treeHarvest.ts` contains:

```ts
harvestWorldTree(
  lifecycle,
  treeId,
  worldDays,
  env,
  opts?,
)
```

This is explicitly documented as the shared world harvest for NPC and future player 057 use. It calls `lifecycle.harvest()` and then applies the appropriate visual update:

- settlement tree: `applyHarvestedTreeVisual()` directly on its landmark mesh;
- streamed chunk tree: `refreshChunkVisual(treeId)` callback.

057 should call this function, not `treeLifecycle.harvest()` directly, unless there is a concrete reason to separate the visual update. The existing abstraction was specifically introduced to be shared by NPC and player harvesting.

### Chunk tree representation

`src/terrain/chunkVegetation.ts` is still the deterministic worker-side placement source.

`VegetationPlacement` contains:

- `x`, `z`
- `kind`
- `speciesIndex`
- mature `scale`
- `rotationY`
- explicit `growthStage` for trees

Tree placement is generated in `computeChunkVegetation()` in the terrain worker. It already has deterministic tree stages (`sapling`, `young`, `mature`) and uses the existing terrain/environment fields.

`src/terrain/chunkManager.ts` instantiates those placements on the main thread. Its `ChunkRecord` stores `treeIds` registered into the lifecycle and the streamed vegetation group.

`ChunkManager` exposes the tree-specific lifecycle seams already required by 057:

```ts
sampleTreeEnv(x, z): TreeEnvSample
refreshTreeVisual(treeId): boolean
```

It also owns tree presence registration/unregistration as chunks load/unload.

This means 057 does **not** need to understand worker-generated `VegetationPlacement` internals or Three.js mesh ownership.

### Settlement trees

`src/settlement/props.ts` defines `SettlementTreeLandmark`:

```ts
{
  id,
  position,
  mesh,
  speciesIndex,
  baseScale,
  initialStage
}
```

Settlement trees already have stable `TreeId`s and are lifecycle-aware. They are included in `SettlementLandmarks.trees`.

`src/app/interactables.ts` currently adds these settlement trees to the per-frame `Interactable[]` as:

```ts
{ kind: 'tree', position, promptLabel: 'Obejrzyj drzewo', id }
```

This is important: the generic interaction union already supports `kind: 'tree'`, but **that currently covers settlement landmark trees only**.

### World-generated trees

Regular streamed chunk vegetation trees are not currently added by `buildInteractables()`.

`src/app/interactables.ts` builds candidates from:

- settlement NPCs/animals/landmarks;
- fauna;
- spawners;
- nearby items;
- dropped items;
- synthetic shovel terrain target.

There is no `ChunkManager.getNearbyTrees()`/equivalent in the current public API.

Therefore, the original 057 assumption that existing interaction can immediately select any mature world tree is not fully true. The interaction architecture exists, but a small adapter is required to expose **nearby registered `TreePresence` entries** to the existing gaze picker.

The preferred correction is to extend the existing tree lifecycle/chunk seam, not to create a separate raycast system.

## 3. Relevant files and entry points

| File | Important symbols | 057 role |
|---|---|---|
| `src/items/items.ts` | `ItemKind`, `ITEM_DEFS`, `createItemMesh()` | Add `axe` as the next existing tool kind/definition; add a simple pickup mesh if the axe is physically discoverable. |
| `src/items/HeldTool.ts` | `ToolKind`, `isToolKind()`, `createHeldTool()` | Extend the existing one-slot held-tool union with `axe`. Do not create another equipment system. |
| `src/items/Inventory.ts` | `has`, `canAdd`, `add`, `remove`, `toJSON` | Canonical axe ownership and harvest yield destination. |
| `src/ui-vue/screens/InventoryScreen.vue` | tool `Weź` / `Odłóż` controls | No axe-specific UI should be needed; generic `category === 'tool'` handling already covers it once `ITEM_DEFS.axe` exists. |
| `src/ui/createHud.ts` / Vue HUD store | held-tool display | Existing held-tool feedback should automatically show `siekiera` after `HeldTool` is extended. |
| `src/interaction/Interactable.ts` | `Interactable` union | Existing `kind: 'tree'` can carry a `TreeId`; extend only if a stronger distinction between settlement/chunk trees is actually needed. |
| `src/app/interactables.ts` | `buildInteractables()`, constants | Add nearby streamed tree candidates through the existing candidate assembly path. Preserve current settlement-tree candidates. |
| `src/app/gameLoop.ts` | `[E]` routing / `pickInGaze()` | Gate tree harvest by axe/held-tool state and route to shared harvest + inventory/feedback. Avoid a second keyboard handler. |
| `src/app/busyAction.ts` | `createBusyAction()` | Preferred existing channel for a short chopping action if 057 uses a visible duration rather than instant execution. |
| `src/world/treeHarvest.ts` | `harvestWorldTree()` | **Authoritative shared player/NPC harvest seam.** |
| `src/world/treeLifecycle.ts` | `TreeLifecycle.harvest()`, `TreePresence`, `TreeEnvSample` | Owns tree state validation and harvested transition; do not duplicate. |
| `src/world/treeVisuals.ts` | `applyHarvestedTreeVisual()`, `tagTreeMesh()` | Existing stump/visual lifecycle seam; 057 should normally reach this through `harvestWorldTree()`. |
| `src/terrain/chunkManager.ts` | `sampleTreeEnv`, `refreshTreeVisual`, registered `treeIds` | World-tree runtime ownership and visual refresh. Likely needs the smallest nearby-tree query adapter. |
| `src/settlement/props.ts` | `SettlementTreeLandmark`, `TREE_SPECS` | Settlement-tree representation and stump visuals. Avoid changing generation solely for 057. |
| `src/persistence/saveData.ts` | `SaveData`, `SaveTreeOverride`, `heldTool` | No new persistence architecture. Axe ownership/held state already fits existing inventory/held-tool persistence. Tree overrides are already owned by 058. |
| `src/app/createApp.ts` | inventory, `HeldTool`, save/build wiring | Add axe only through existing item/held-tool setup and wire any new handler without capturing stale WorldBundle members. |
| `src/audio/createWorldAudio.ts` | `playOnce()` | Existing one-shot audio infrastructure for axe-hit feedback. |
| `src/audio/inventorySounds.ts` | existing pickup/drop SFX | Use existing pickup SFX for receiving/dropping inventory resources; no new resource audio system. |

## 4. Current player interaction flow

The actual current flow is:

```text
keyboard / touch
      ↓
createKeyboard()
      ↓
gameLoop.tick()
      ↓
buildInteractables(...)
      ↓
pickInGaze(
  interactables,
  player position,
  yaw,
  INTERACT_RANGE = 2.5,
  INTERACT_MIN_DOT = 0.5,
)
      ↓
keyboard.consumeInteract()
      ↓
switch target.kind
```

The existing `Interactable` union already contains `tree` and carries `id`.

`gameLoop.ts` currently handles a tree by calling `resolveInteraction()` and optionally awarding a branch using the old tree-inspection mechanic. This is the key behavior that 057 must replace/branch from for an axe-equipped tree target.

Current tree interaction without an axe is **not chopping**. It is an inspection/dialogue interaction and may give a branch with:

```ts
TREE_BRANCH_CHANCE = 0.25
KNIFE_BRANCH_BONUS = 0.15
```

The knife bonus comes from plan 043. 057 must decide how the old inspection interaction coexists with the new axe action. The smallest coherent choice is:

- no axe: preserve existing tree inspection/branch interaction;
- axe equipped/held and target is harvestable mature tree: `[E]` performs harvest instead of inspection;
- non-mature tree with axe: do not harvest; either retain normal inspection or show a concise invalid-action feedback, but do not mutate lifecycle state.

Do not silently remove the existing non-axe tree interaction unless the feature owner explicitly wants tree inspection replaced.

## 5. Axe/tool architecture

There is no generic `Tool` class and no durability/equipment-slot architecture.

The current tool abstraction is intentionally small:

```ts
type ToolKind = 'knife' | 'firestarter' | 'shovel'
```

and `HeldTool` stores one currently held tool. Inventory remains the source of truth for item ownership.

057 should therefore extend:

```ts
ToolKind = 'knife' | 'firestarter' | 'shovel' | 'axe'
```

and let the existing `isToolKind()` / `createHeldTool()` machinery handle axe ownership/equipping.

Do **not** introduce `Axe`, `Tool`, `EquipmentSlot`, `Durability`, or capability classes in 057. The plan's conceptual `Axe.canHarvest(Tree)` is useful as a future abstraction, but the current codebase does not have that generic capability layer and creating it only for one tool would be premature.

The minimum v1 capability check can be represented by the existing held-tool value:

```ts
heldTool.held() === 'axe'
```

plus the lifecycle stage validation performed by `TreeLifecycle.harvest()`.

### Held vs merely owned

Plan 057 says `has axe?` while the current UX architecture introduced by plan 061 distinguishes **owned** from **held**:

- quick actions may be exposed from ownership;
- direct HUD/tool interaction is exposed while the tool is held.

For consistency, the recommended 057 behavior is:

```text
axe owned → can equip through Inventory
axe held  → direct tree-chop prompt/action is active
```

Do not invent a new "active axe" flag. If the implementation deliberately chooses ownership-only interaction, document that decision because it would differ from the shovel convention.

## 6. Tree target selection: main implementation gap

The existing gaze picker is already appropriate. It uses position + player forward vector + range/dot checks and should remain the only target-selection mechanism.

The missing piece is exposing streamed chunk trees to `buildInteractables()`.

### Preferred smallest seam

Use the tree lifecycle's existing registered `TreePresence` data, because `ChunkManager` already registers every loaded tree and unregisters it on chunk unload.

A suitable API should be small and read-only, for example a nearby-tree query returning the already registered tree data needed by the interaction adapter:

```ts
getNearbyTrees(pos, radius): readonly {
  id: TreeId
  x: number
  z: number
  speciesIndex: number
  initialStage: TreeGrowthStage
  baseScale: number
}[]
```

The exact name/signature should follow local conventions. The important constraints are:

- query only loaded/registered trees;
- use the lifecycle's spatial buckets rather than scanning every world tree;
- do not raycast every mesh independently;
- do not create a new global tree registry;
- do not expose Three.js objects as the interaction domain state.

Because `TreeLifecycle` already maintains `byCell` spatial buckets internally, the preferred implementation is to add the smallest query method to that existing domain seam or expose a nearby-presence adapter from `ChunkManager`. Do not duplicate the `byCell` map elsewhere.

Settlement trees are already represented in `SettlementLandmarks.trees`. Avoid double-presenting them if the new query also includes settlement registrations. Decide one ownership path and filter duplicates by `TreeId` if necessary.

### Interaction range

Reuse:

```ts
INTERACT_RANGE = 2.5
INTERACT_MIN_DOT = 0.5
```

Do not add a special axe reach unless manual testing proves the existing range is inadequate. The axe action is a normal local interaction, not a combat attack.

## 7. Harvest action and world effect

The authoritative sequence should be:

```text
[E] on mature tree + axe held
        ↓
validate target / distance / tool
        ↓
optional short BusyAction channel
        ↓
harvestWorldTree(
    treeLifecycle,
    treeId,
    dayNight.elapsedDays,
    chunkManager.sampleTreeEnv(x, z),
    visual-refresh callback
)
        ↓
result.yield = branch × 3
        ↓
Inventory.canAdd('branch', 3)
        ↓
Inventory.add('branch', 3)
        ↓
HUD/touch inventory state + existing feedback
```

The lifecycle operation itself is the guard against repeated harvest:

```text
mature → harvested
```

A second call should receive `not-mature` and must not produce another yield.

### Inventory capacity policy

`TreeLifecycle.harvest()` currently changes tree state and returns the yield without knowing Inventory capacity. Therefore 057 must decide what happens when the player cannot carry all three branches.

The safest v1 policy is to check `inventory.canAdd('branch', HARVEST_YIELD.count)` **before starting the irreversible harvest**, so a full/overweight inventory does not cut down a tree and then silently lose resources.

Do not modify `TreeLifecycle` to depend on `Inventory`; keep the domain layer independent.

If the desired gameplay is instead "tree is harvested and excess branches drop to ground", that must explicitly reuse `DroppedItems` and be documented as the chosen result. Do not silently invent partial loss.

## 8. Action duration / BusyAction

There is no generic player action-duration system beyond `BusyAction`.

`src/app/busyAction.ts` provides a short blocking channel with:

```ts
start(durationSec, label, onComplete)
tick(dt)
isActive()
cancel()
```

Plan 061 uses this for digging (`DIG_DURATION_SEC = 2`) and blocks player input through modal state while the world clock itself does not advance.

057's original plan says "perform chop" and asks for an axe-hit effect, but does not define a duration. Do not invent multi-hit combat/chopping mechanics.

Recommended v1:

- use a short `BusyAction` channel if the UX wants the tree to require a visible action duration;
- one channel completion = one harvest;
- no repeated damage ticks;
- no stamina cost;
- no durability;
- no player combat state.

If the feature owner wants instant chopping, the same world harvest operation can be called directly from the existing `[E]` branch; the domain boundary does not change.

## 9. Resource/inventory flow

`src/items/items.ts` is the canonical item model. Current `ItemKind` includes `branch` but no `wood`.

`ITEM_DEFS.branch` is:

```text
category: resource
weight: 0.5 kg
```

`Inventory` is the canonical carried-resource store.

Do not create:

- `WoodResource`;
- a separate wood counter;
- a tree-specific storage buffer;
- a new inventory type;
- a new drop registry.

The existing tree lifecycle yield already intentionally uses `branch` (`HARVEST_YIELD`). This is a concrete correction to the wording "wood" in the original 057 plan.

If inventory cannot accept the yield, apply the capacity policy from section 7 before changing tree state.

If physical resource drops are chosen instead, use `src/items/createDroppedItems.ts` and the existing `DroppedItems` persistence path. Do not create a special `TreeDrops` system.

## 10. UX / animation / audio integration

### Prompt

Use the existing `npcDialog.setPrompt()` / HUD interaction prompt path through `gameLoop.ts` rather than creating a new axe HUD widget.

The existing interaction UX is gaze-based and uses `[E]`.

Recommended prompt while axe is held and a mature tree is targeted:

```text
Ścinaj drzewo
```

The exact copy is secondary; keep it short and consistent with existing prompts.

### Inventory/equip UI

No new axe-specific screen is needed. `InventoryScreen.vue` already renders a `Weź` button for every `ITEM_DEFS` entry with `category === 'tool'` and `Odłóż` for the held item.

Adding `axe` to `ITEM_DEFS` + `ToolKind` should therefore automatically make the axe equipable through the existing UI.

### Player animation

`src/player/PlayerController.ts` currently supports only idle/walk/run animation selection. There is no generic player action animation API.

Do not create a full player animation/action framework for 057.

For v1, use:

- existing movement blocking through `BusyAction` if a channel is used;
- a simple world/tree visual change;
- optionally a lightweight hit effect if an existing effect mechanism is available.

A bespoke high-quality axe swing animation belongs to future polish, matching 057's explicit scope exclusion.

### Audio

`src/audio/createWorldAudio.ts::playOnce()` is the existing one-shot audio seam.

There is currently no verified axe/chopping sound asset in the repository. The plan therefore cannot simply reference an existing axe clip.

If 057 keeps the plan's axe sound requirement, add/use one concrete sound asset and call `worldAudio.playOnce()` at the action point. Do not create an axe-specific audio manager.

Existing inventory pickup/drop feedback can be reused for the resource result. `src/audio/inventorySounds.ts` already contains the pickup feedback used by current inventory interactions.

## 11. Tree lifecycle boundary with 058

This boundary is now concrete, not hypothetical.

### 057 owns

- axe item definition;
- axe pickup/acquisition if required;
- axe equip/held state via `HeldTool`;
- target selection through existing interaction/gaze;
- player-side validation that the axe is available/held;
- action duration/channel if used;
- inventory-capacity policy before harvest;
- player-facing feedback;
- calling the shared harvest operation.

### 058 owns

- deterministic `TreeId`;
- procedural initial stage;
- tree registration during chunk load;
- lifecycle resolution;
- mature/non-mature validation;
- `mature → harvested` transition;
- stump representation;
- lazy regrowth;
- canopy competition;
- sparse lifecycle overrides;
- save/load tree lifecycle state.

### Explicitly do not do this in 057

```text
axe action
  ↓
remove Object3D
  ↓
start own regeneration timer
```

The correct operation is:

```text
axe action
  ↓
harvestWorldTree()
  ↓
TreeLifecycle.harvest()
  ↓
058 owns all subsequent lifecycle behaviour
```

The same operation is already used by NPC woodcutting, so 057 should converge on the exact same world effect.

## 12. NPC relationship

058 implementation notes establish the existing NPC path:

```text
NPC need / scheduled work
    ↓
find mature tree
    ↓
TreeId
    ↓
goTo → execute
    ↓
shared harvest
    ↓
TreeLifecycle
    ↓
branch yield
```

`NpcAgent` imports `harvestWorldTree()` and uses the existing `PlannedAction`/`goTo → execute` architecture.

057 must not change this flow merely to make the player work. If a shared helper is needed for resolving tree environment/targets, extend the current tree lifecycle/chunk seam instead of modifying NPC-specific action architecture.

Plan 055 is still `in progress`; do not wait for a future generic simulation rewrite. The existing `PlannedAction` model is the current architecture.

## 13. Relationship with 062 and 063

There is **no implementation dependency** from 057 to 062 or 063 in `docs/plans/README.md`.

The current dependency chain is:

```text
058 → 057
043 → 057
030 → 057
```

All three foundations are implemented, although 058 is currently `verification needed`, so the plan index does not consider 057 fully ready yet.

### 062

062 changes terrain generation in `src/terrain/chunkHeightmap.ts` while preserving the existing terrain data/sampler contracts.

057 should not depend on any particular terrain-generation algorithm. Tree interaction should use the runtime tree position/identity and `ChunkManager.sampleTreeEnv()` for lifecycle environment inputs.

Do not copy terrain noise calculations into 057.

### 063

063 strengthens the existing macro forest/environment signal and tree placement density in `src/terrain/chunkVegetation.ts` / `biomeRegions.ts`.

057 should not care whether a tree exists because of the current density formula or a future 063 formula. It consumes the runtime tree representation produced by the existing generation/lifecycle pipeline.

063 also must not become a dependency for axe mechanics. Its output changes where trees are found, not how harvesting works.

### Important sequencing implication

Because 063 may change the number and spatial distribution of streamed trees, the new 057 nearby-tree query must operate over the lifecycle registrations rather than cache a static list created by the old vegetation generator.

## 14. Chunk streaming and persistence

058 already solved the core persistence model:

```text
procedural placement
    = seed + world position + species

runtime override
    = sparse TreeStateOverride by TreeId
```

`ChunkManager` registers tree presence when a chunk loads and unregisters it when the chunk unloads. `TreeLifecycle` keeps the sparse overrides independently.

Therefore:

```text
player chops tree
      ↓
TreeLifecycle override written
      ↓
chunk unloads
      ↓
Three.js objects disappear
      ↓
chunk reloads
      ↓
same TreeId
      ↓
058 resolves harvested state
      ↓
stump visual returns
```

057 must not add any chunk persistence or tree-state save mechanism.

Save schema is already v8 and includes:

```ts
treeOverrides: Record<string, SaveTreeOverride>
```

`createApp.ts::buildSaveData()` serializes `treeLifecycle.serializeOverrides()`.

Axe ownership is persisted through the normal `Inventory` save. Held-tool state is already persisted through `SaveData.heldTool`.

No new save schema is required just for 057 unless an axe acquisition mechanism introduces a genuinely new persistent world object. Prefer using existing item pickup semantics so that no new persistence is needed.

## 15. Axe acquisition

The original 057 plan says the player can "find / obtain" an axe but does not specify where/how.

Current code has a concrete precedent from the shovel implementation:

- shovel is a `tool` item;
- it is placed deterministically in the settlement through an explicit pickup path;
- pickup uses the existing `[E]` item interaction;
- ownership lives in `Inventory`;
- holding uses `HeldTool`.

There is currently no axe item, axe spawn point, or axe asset in the verified code.

This is therefore a genuine pre-implementation decision rather than something to infer from existing code.

**Smallest coherent recommendation:** use the same deterministic settlement pickup pattern as the shovel, unless the product requirement explicitly wants an axe elsewhere in the world. Do not make the axe a random `SPAWN_SPECS` resource.

If a deterministic settlement pickup is chosen, keep it as a one-time/explicit tool pickup rather than adding random axe generation to `chunkItems.ts`.

## 16. Required code changes

### A. Add axe as an existing item/tool

**Files:**

- `src/items/items.ts`
- `src/items/HeldTool.ts`

**Changes:**

- add `'axe'` to `ItemKind`;
- add `ITEM_DEFS.axe` with `category: 'tool'`, a tuned weight/color/label;
- extend `ToolKind` so `axe` is accepted by `isToolKind()` automatically;
- add a simple procedural axe mesh in `createItemMesh()` if the item is represented physically.

**Keep intact:** generic inventory, tool equip UI, save validation.

### B. Add acquisition through an existing pickup seam

**Likely files:**

- `src/items/createItemSpawners.ts` and/or the existing settlement pickup code in `src/settlement/props.ts` / `src/settlement/createSettlement.ts`.

**Changes:**

- deterministic axe placement if the product decision is "settlement axe";
- route pickup through existing `Interactable.kind === 'item'` and `collectItem()` if possible.

Do not create a new axe pickup manager.

### C. Expose streamed trees to gaze interaction

**Files:**

- `src/world/treeLifecycle.ts` and/or `src/terrain/chunkManager.ts`
- `src/app/interactables.ts`
- possibly `src/interaction/Interactable.ts`

**Changes:**

- add a small nearby registered-tree query based on the lifecycle spatial buckets;
- include those trees in `buildInteractables()`;
- preserve stable `TreeId`;
- avoid duplicate settlement-tree candidates if the query includes them.

**Keep intact:** `INTERACT_RANGE`, `INTERACT_MIN_DOT`, `pickInGaze()` and current interaction architecture.

### D. Replace/branch the tree `[E]` handler

**File:** `src/app/gameLoop.ts`

**Changes:**

- detect `target.kind === 'tree'`;
- if axe is held and target is a harvestable mature tree, run the 057 action;
- otherwise preserve current tree inspection behavior or provide the agreed invalid-target feedback;
- use `bundle` indirection for world systems as required by plan 054;
- call `harvestWorldTree()` with current `bundle` lifecycle/chunk manager and `dayNight.elapsedDays`.

**Do not:** directly mutate tree meshes, remove tree objects, or add a second key handler.

### E. Resource result / feedback

**Files:** `src/app/gameLoop.ts`, possibly a small player-action helper if needed, plus existing audio modules.

**Changes:**

- check `inventory.canAdd('branch', 3)` before irreversible harvest;
- call `inventory.add('branch', 3)` on success;
- update inventory weight/touch drop state;
- reuse existing pickup feedback/toast conventions;
- use `worldAudio.playOnce()` for axe hit if a concrete sound asset is added.

Do not add a wood counter or special tree-drop system.

## 17. Implementation order

1. Decide axe acquisition location and whether direct chop requires **held** axe; default recommendation: deterministic settlement pickup + held axe for direct `[E]` action.
2. Add `axe` to `ItemKind`/`ITEM_DEFS` and extend `HeldTool`.
3. Add the simplest deterministic axe pickup using the existing item/settlement interaction seam.
4. Add/read the nearby registered-tree query from the existing `TreeLifecycle` spatial index; do not duplicate tree indexing.
5. Extend `buildInteractables()` so streamed mature/young/sapling trees can be targeted through the existing gaze system. The action itself will reject non-mature trees.
6. Replace/branch the current tree `[E]` behavior in `gameLoop.ts` for an axe-held target.
7. Check inventory capacity before starting the irreversible harvest.
8. Use `BusyAction` only if a visible chopping duration is desired; keep it one action → one harvest.
9. Call `harvestWorldTree()` with `bundle`/`treeLifecycle`, `dayNight.elapsedDays`, `bundle.chunkManager.sampleTreeEnv(...)`, and the existing visual-refresh callback.
10. Add branch yield to Inventory using the existing item/resource flow.
11. Add minimal stump/hit/audio feedback through existing visual/audio seams.
12. Add focused unit tests for item/tool state and pure tree-harvest result/target logic.
13. Run technical checks, then manually verify streamed trees, settlement trees, chunk unload/reload and Continue.

## 18. UX / animation / audio integration

### Minimum v1 UX

```text
axe not held
    ↓
existing tree interaction remains available

axe held + mature tree in gaze
    ↓
short chop prompt
    ↓
[E]
    ↓
optional short BusyAction
    ↓
stump + branch yield + feedback
```

The stump is already the correct visual result through 058's `treeVisuals.ts` / `harvestWorldTree()` path.

Do not require a realistic falling-tree animation. The original plan explicitly excludes it.

### Important existing tree interaction behavior

The current `gameLoop.ts` tree branch is an inspection interaction and may award a branch. 057 should not accidentally make every `[E]` tree interaction destructive merely because the `tree` union already exists.

The axe is the capability that changes the meaning of the interaction.

## 19. Tests and verification

Follow the repository convention: Vitest unit tests (`*.test.ts`) focus on pure logic; visual Three.js behaviour still requires manual browser verification.

### Item/tool

- `axe` exists in `ItemKind` and `ITEM_DEFS` with `category: 'tool'`;
- Inventory can hold the axe;
- existing Inventory UI can equip/unequip it through generic tool handling;
- `HeldTool` accepts/persists axe;
- invalid/missing axe cannot activate chopping.

### Targeting

- nearby loaded settlement tree can still be targeted;
- nearby streamed chunk tree can be targeted through the new adapter;
- target respects `INTERACT_RANGE = 2.5`;
- target respects `INTERACT_MIN_DOT = 0.5`;
- unloaded trees are not offered as interactables;
- no duplicate target is produced for the same `TreeId`.

### Tree lifecycle

- mature tree can be harvested through the shared `harvestWorldTree()` path;
- sapling/young/harvested tree cannot be harvested;
- successful harvest produces exactly the configured lifecycle yield;
- repeated harvest does not produce another yield;
- the resulting state is `harvested` and visual becomes stump;
- 057 does not start its own regrowth timer;
- chunk unload/reload preserves the harvested state through 058.

### Resources

- `branch` is used, not a new `wood` resource;
- inventory capacity is checked before irreversible harvest;
- successful harvest adds exactly the configured count;
- inventory weight/UI updates correctly;
- no duplicate resource is produced if `[E]` is pressed repeatedly during/after the action.

### Integration

- existing non-axe tree inspection remains intact according to the chosen UX decision;
- player movement remains intact;
- BusyAction blocks movement/input only while active if used;
- NPC harvesting continues to use the same `harvestWorldTree()` path;
- chunk streaming remains intact;
- save/Continue preserves tree lifecycle through existing v8 tree overrides;
- no changes are required to 062/063 generation logic.

### Technical checks

Run the project's standard checks:

```text
npx tsc --noEmit
npm run lint
npm run build
npm run test
```

For visual/gameplay work, manual browser verification is still required; passing TypeScript/build/tests does not prove the Three.js tree interaction is visually correct.

## 20. Guardrails / things NOT to implement

Do not implement any of the following in 057:

- tree growth/regrowth timers;
- tree canopy simulation;
- new `TreeState` or tree persistence model;
- a second tree lifecycle implementation;
- full combat or weapon damage architecture;
- axe durability;
- multiple axe types;
- stamina costs;
- multi-hit tree health/damage;
- realistic falling-tree physics;
- stump digging/removal;
- crafting the axe;
- a new inventory/equipment architecture;
- a new resource/wood counter;
- terrain-generation changes;
- forest-region generation changes;
- a global list of every world tree;
- per-frame raycasts over every tree mesh;
- a new worker just for player chopping;
- a new persistence system;
- a high-quality player action animation framework;
- unrelated UI migration/refactors.

## 21. Dependencies and blockers

### Plan dependencies

`docs/plans/README.md` currently lists 057 as:

```text
Depends on: ~~058~~, ~~043~~, ~~030~~
```

043 and 030 are done. 058 is currently `verification needed`, not `done`, so according to the repository's dependency semantics 057 is **not formally ready** until 058's verification is closed.

This is not a code blocker for understanding the implementation seam: the required 058 APIs already exist. It is a project-status dependency that should remain visible in the plan index.

### Decisions before implementation

One product/UX decision is genuinely required:

1. **Where is the axe acquired?** Recommended: deterministic settlement pickup using the same pattern as the shovel.
2. **Must the axe be held for direct chopping?** Recommended: yes, consistent with the post-061 held-tool UX. Ownership can still expose the tool in Inventory/quick actions; direct `[E]` chopping requires it in hand.
3. **Is chopping instant or a short channel?** Recommended: a short `BusyAction` channel if the desired UX should visibly communicate work; otherwise instant shared harvest is architecturally valid.
4. **What happens when three branches do not fit?** Recommended: reject before starting the harvest. Do not silently destroy a tree and lose resources.

No architectural decision is needed about lifecycle/regrowth: 058 already owns it.

## 22. Key conclusion

The original 057 plan is structurally sound but now under-specifies the most important current-code detail: **world trees already have a lifecycle and stable IDs, but only settlement trees are currently exposed through the player `Interactable` list.**

The smallest coherent implementation is therefore:

```text
existing HeldTool
      +
existing Interactable/gaze
      +
small nearby registered-tree query
      +
existing BusyAction (optional)
      +
existing harvestWorldTree()
      +
existing Inventory/branch resource
```

The player-side code should remain thin. 058 remains the sole owner of tree state, stump/regrowth and persistence; 062/063 remain independent producers of the world in which those trees exist.
