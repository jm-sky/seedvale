# Review: Plan 159 — Natural Food, Fishing, Preservation and Bait

**Reviewed:** 2026-08-19
**Decision:** `update`
**Reviewed against:** current repository snapshot (`c4fea03ec373dd8004b7d3b445c9275feae7765b`) and current planning map.

## 1. Executive summary

Plan 159 remains architecturally valid and should be kept as the feature boundary, but it needs an update before implementation.

The biggest change since the original implementation notes is that Plan 155 is now **done** and the inventory instance boundary is real. `Inventory` now has separate count-based stacks and `ItemInstance` storage, and `SaveData` is already **v19** with `inventoryInstances`. The implementation notes still describe 155 as planned and SaveData as v17, so those parts are stale.

The central architectural direction remains correct:

```text
Item definitions + Inventory
        ↓
stateful food stacks / freshness
        ↓
existing world sources + player needs + NPC logistics
        ↓
persistent world/process records
        ↓
existing interaction / rendering / persistence seams
```

Do **not** turn food into `ItemInstance`s. The completed 155 implementation explicitly keeps stackable items count-based and uses instances for individually stateful items such as traps.

## 2. Repository / plan-path discrepancy

The requested original file

`docs/plans/2026-08-19--159--natural-food-fishing-preservation-bait.md`

does not exist in the current repository snapshot. The current planning map indexes Plan 159 as:

`docs/plans/2026-08-18--159--natural-food-fishing-preservation-and-bait.md`

and the repository contains its implementation notes.

Therefore this review uses the current Plan 159 entry in `docs/plans/README.md`, the available Plan 159 implementation notes, dependency plans, and current source files as the source of truth. The requested updated-review file is created under the exact path requested by this review task.

## 3. Dependency review

### Plan 155 — inventory item instances and trap lifecycle

**Status: done. Dependency remains valid.**

This is the most important update.

`Inventory` now owns two explicit storage modes:

- `ItemKind → count` for stackable items;
- `ItemInstance` map for individually stateful items.

It exposes `addInstance`, `removeInstance`, `getInstance`, `getInstances` and `countInstances`, and persists trap instances through `instancesToJSON()` / `instancesFromJSON()`.

`SaveData` has advanced to v19 and now contains `inventoryInstances`.

Consequences for Plan 159:

- keep food stackable;
- add freshness as **stateful stack/bucket data**, not one instance per food unit;
- use the completed trap instance lifecycle directly for trap bait;
- do not design another generic inventory identity mechanism;
- freshness persistence should extend the existing inventory persistence model rather than introduce a second inventory representation.

The old implementation-note statement that 155 is still planned and that SaveData is v17 is obsolete.

### Plan 156 — NPC household and settlement storage logistics

**Status: done. Dependency remains valid.**

Plan 156 established the physical household/settlement storage presentation while reusing the existing NPC transport mechanisms from 069/122/131.

Plan 159 should therefore continue to use:

```text
source → existing NPC gather/carry/deposit → Household.stock / SettlementEconomy
```

Do not create `HouseholdFoodInventory`, food-specific transport, or a food logistics manager.

The only new requirement is that the existing stock representation can preserve freshness metadata for perishable food. That is an extension of the existing stock model, not a new logistics system.

### Plan 106 — player needs, food and cooking

**Status: implemented / established dependency.**

Plan 106 remains the ownership boundary for player hunger/thirst and food consumption/cooking.

Plan 159 should extend the existing consumable definitions and cooking table. It must not create another player food-consumption or needs system.

Plan 165 is a later planned refinement of Vigor/Hunger/Thirst. It changes tuning and adds duration-based starvation/dehydration consequences, but does **not** replace the ownership established by 106. Therefore 165 is not a new hard dependency for Plan 159.

### Plan 141 — animal traps

**Status: implemented. Architectural prerequisite for trap bait.**

The current Plan 159 implementation notes already identify the correct seam: bait belongs in `src/world/animalTraps.ts` and `PlacedTrapRecord`, with `createPlacedTraps.ts` remaining runtime/orchestration.

Because Plan 155 now depends on and has completed the trap instance lifecycle, Plan 159 can consume that seam without creating another trap system.

For clarity, the implementation plan should either:

- add `141` explicitly to `Depends on`, or
- state that trap bait depends transitively on the completed 155/141 lifecycle.

Adding `141` explicitly is clearer because trap bait directly extends that domain.

## 4. Current item / consumable architecture

The Plan 159 direction to extend the central item catalog remains correct.

Existing food/item concepts that should be reused include:

- `mushroom`
- `tomato`
- species-specific meat (`deer_meat`, `wolf_meat`, `boar_meat`, `rabbit_meat`, `beef`)
- `raw_meat`
- `roasted_meat`
- `cheese`
- `dried_meat`

In particular:

- do not recreate `dried_meat`;
- do not normalize all meat to `raw_meat` when the existing species mapping already exists;
- fish should become a normal stackable item;
- bait should be metadata on eligible food definitions, not new `bait_*` item kinds;
- freshness should be state, not `fresh_*` / `spoiled_*` item kinds.

The existing `ItemCatalogEntry` / item-definition mechanism remains the correct place for food metadata. Do not introduce a parallel food registry or `FreshnessManager`.

## 5. Natural food and resource systems

The existing world already has reusable resource/item placement mechanisms, including renewable item spawners and chunk/world natural resources. Tomato already demonstrates the garden-anchor pattern.

Plan 159 should therefore:

- extend existing item spawners for simple renewable pickups;
- reuse existing mushroom/chunk item lifecycle;
- reuse existing garden anchors for crops;
- reuse tree lifecycle/resource ownership where a fruit source can be derived from existing tree data;
- avoid `AppleSystem`, `BerrySystem`, `CropManager` or another resource manager.

The later vegetation/tree work does not justify a parallel food-resource system.

## 6. Fauna and meat

The fauna implementation now includes species, herds/young, deterministic perception, habitat/carcass lifecycle and day-scale respawn.

This strengthens the original Plan 159 decision to reuse the existing fauna harvest path:

```text
AnimalAgent death
→ existing corpse/remains lifecycle
→ existing knife harvest
→ species ItemKind
→ existing Inventory
```

Do not add automatic meat loot to trap capture. Trap capture already routes through the existing animal damage/death lifecycle, after which the normal harvest path can produce meat.

Plan 159 also correctly excludes fish population/migration/ecology. Fishing should initially produce ordinary fish items without introducing persistent fish agents.

## 7. Freshness model — required update

This remains the largest new shared state introduced by Plan 159.

Recommended model:

```ts
ItemStackState {
  kind: ItemKind
  count: number
  acquiredAtDays: number
  // or equivalent authoritative spoilage deadline
}
```

Freshness stage should be derived:

```text
timestamp + ItemCatalog food definition + current world time
→ fresh / medium / spoiled
```

Do not store independently drifting freshness stage if it can be derived.

Important implementation constraint:

```text
same kind + compatible freshness state/deadline → may merge
same kind + incompatible age → separate stack
```

Do not split every food unit into `ItemInstance`.

The player and NPC must call the same freshness resolver. Storage must preserve the authoritative timestamp/deadline rather than refreshing food merely because it moved into a crate or household stock.

## 8. Cooking

Reuse `src/items/campfireCooking.ts`.

Existing meat recipes remain the base. Fish can be added to the same recipe mechanism.

Cooking should consume the source stack and create a new food stack with its own production/acquisition timestamp. It must not inherit the raw food's old spoilage deadline.

Plan 159's generic timed process should remain reserved for background/non-blocking processes such as drying. It must not replace the existing busy-channel cooking interaction.

## 9. Timed processes / preservation

There is still no justification for a global `TimedProcessManager`.

Use a small persistent process value owned by the world object/domain that actually has the process, for example:

```ts
TimedProcess {
  id: string
  kind: TimedProcessKind
  startedAtDays: number
  durationDays: number
  input: ItemStackInput[]
  output: ItemStackOutput[]
}
```

Completion should be derived from start + duration.

A drying rack should follow the existing persisted-world-object pattern used by traps/storage/tents:

```text
persistent record
→ interaction/runtime
→ presentation Object3D
```

The Object3D must not be the owner of process or item state.

Reuse `dried_meat`; add only the missing dried-fish output.

## 10. Fishing

Fishing remains a genuinely new domain feature, but it does not require a new simulation subsystem.

Recommended architecture:

```text
existing water/lake detection
        ↓
 deterministic FishingSpot key
        ↓
 fishing action
        ↓
 seeded catch roll
        ↓
 normal fish ItemKind / stack
```

The rod is a normal inventory item. Fishing bait is persistent world state keyed by the fishing spot, not by a Three.js object.

The bait effect may persist while the spot is streamed out. Visual water particles/effects are presentation-only and must not be persisted.

Do not create a fishing manager, fish agents, fish population simulation, migration or ecology in this plan.

## 11. Bees / honey

The bee/hive feature remains new and should stay minimal.

Use existing fire/torch/damage/item mechanisms. Persist only authoritative hive state required for deterministic production and one-time burning/reward behaviour.

Bee visuals may be transient agents/effects, but production must not depend on their render objects.

Do not create a bee manager or parallel combat/damage path.

## 12. Trap bait

Keep the current Plan 159 implementation-note model:

```ts
baitKind: ItemKind | null
```

with bait classification in the central item definition.

Loading bait should be atomic:

```text
validate food
→ remove one stack item
→ attach ItemKind to PlacedTrapRecord
→ modify existing detection/capture rule
```

Use the existing `animalTraps.ts` resolver and runtime. Prefer returning bait when a trap is collected/disarmed before capture, and consume it when the trap successfully captures, unless implementation evidence requires another lifecycle.

Do not add a bait manager.

## 13. Persistence update

The old Plan 159 notes refer to SaveData v17. This is now stale.

Current SaveData is v19 because Plan 155 added `inventoryInstances` after v18.

Plan 159 will therefore require the next save schema version for its new persistent state, likely including some combination of:

- stateful food stacks / freshness timestamps;
- active drying processes / drying racks;
- fishing bait state;
- persistent fishing spot state if required by the chosen design;
- hive production/burn state;
- trap bait state if not already included in the trap persistence shape.

Do not persist derived freshness stages, Three.js objects, particle effects, or ordinary live fauna instances.

Migration must preserve old count-based inventory and existing v19 `inventoryInstances`.

## 14. Later plans — dependency impact

### 164 — player storage / containers

No new hard dependency. Player containers are a separate ownership boundary from household/settlement storage. Do not make Plan 159 depend on 164 merely because both deal with storage.

### 165 — Vigor/Hunger/Thirst/Rest

No new hard dependency. It refines the existing Plan 106 needs system. Plan 159 should integrate with the existing consumption API and remain compatible with the refined need consequences.

### 167 — NPC helper resource delivery

No new hard dependency. It depends on player storage and concerns delivery to the player, while Plan 159's NPC food flow remains household/settlement logistics.

### 168 / 169 — settlement lodging and house interiors

No dependency impact on Plan 159. They do not replace food storage, player needs ownership, item definitions or NPC logistics.

### 170 — NPC simulation inspector/trace

No dependency impact. It may later observe food gathering/consumption actions, but Plan 159 must not wait for the inspector.

## 15. Scope guard

Keep the original scope guard:

- no fish population/migration/ecology;
- no advanced bee breeding;
- no refrigerators;
- no fermentation;
- no disease/poison framework;
- no dynamic food pricing;
- no food/logistics manager;
- no fishing manager;
- no preservation/drying manager;
- no trap-bait manager.

Also do not expand Plan 159 into player storage (164), lodging (168/169), or the later Hunger/Thirst redesign (165).

## 16. Required plan changes before implementation

1. Change Plan 159's dependency/status context to reflect that **155, 156 and 106 are already implemented/available** rather than treating 155 as planned.
2. Update all references from **SaveData v17** to the current **v19** baseline.
3. Make the post-155 model explicit: **food remains stackable; freshness is stack state, not `ItemInstance`**.
4. Explicitly reference the completed 155 inventory instance API instead of proposing a new instance mechanism.
5. Clarify trap bait's direct relationship to Plan 141 / `animalTraps.ts` and `PlacedTrapRecord`.
6. Keep 156 as the storage/logistics extension point; do not introduce food-specific transport.
7. Keep 106 as the player needs/consumption owner; mention 165 as a later compatible refinement, not a prerequisite.
8. Reuse species-specific meat and existing `dried_meat` rather than introducing duplicate item kinds.
9. Define persistence migration from v19 before implementation starts.
10. Verify the exact original Plan 159 filename/date discrepancy and align the canonical plan filename if necessary.

## 17. Decision

**`update`**

The architecture is sound and the scope is still appropriate. The plan does not need to be rethought. It needs a factual update for the completed 155/156 state, SaveData v19, the real ItemInstance API, and the current downstream plan chain.

After those corrections, Plan 159 can proceed without introducing parallel item, food, needs, storage, fauna or trap systems.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
