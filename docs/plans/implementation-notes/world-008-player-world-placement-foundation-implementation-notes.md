# Implementation Notes: Player World Placement Foundation

**Reviewed:** 2026-09-01  
**Plan:** `world-008-player-world-placement-foundation.md`  
**Codebase baseline:** `main`

## Review summary

The plan is compatible with the current architecture, but the repository is already further along than the plan's generic description suggests:

- Shared placement validation already exists in `src/items/tentPlacement.ts::evaluateGroundPlacement()`.
- Shared placement UX already exists in `src/app/actions/placementPreviewActions.ts` + `src/world/placementPreview.ts` from `ui-input-004`. Do **not** introduce another preview/placement-mode controller.
- `WorldBundle` is already the lifecycle owner for player-created world systems: `placedFires`, `placedTents`, `placedTraps`, `placedContainers`, `playerWells`, `playerGardens`, `terrainPreparations`.
- Persistence is currently an explicit typed `SaveData` schema. There is no generic persisted-object registry and introducing one would fight the existing ownership model.
- Consequently, the useful abstraction for this plan is a **small placement contract/adapter layer**, not a universal `PlayerWorldObject` interface or registry.

## 1. Existing placement seams to reuse

### Validation

`src/items/tentPlacement.ts` already owns:

- `GroundPlacementInput`;
- `GroundPlacementReason`;
- water margin;
- slope test;
- blocker clearance;
- same-family separation.

`src/app/actions/placementActions.ts::tentBlockers()` is the existing shared blocker query despite its legacy name. Reuse it rather than creating a second blocker service.

Object-specific rules already sit above this:

- tent → `evaluateTentPlacement()`;
- trap → `evaluateGroundPlacement()` + trap footprint/separation;
- well → `evaluateGroundPlacement()` + well footprint/separation;
- fire → `userActions.ts` currently has its own `evaluateFirePlacement()`;
- chest → `containerActions.ts::previewContainerPlacement()` / `placeContainerAtAim()`.

Do not flatten these into one validator. A common contract should accept object-specific validation rather than encode every object's rules.

### Preview

`PlacementPreviewActions` already owns:

- selected placement kind;
- active/cancel lifecycle;
- aim tracking;
- ghost lifetime;
- confirm/cancel;
- final dispatch.

It deliberately re-resolves the real placement action on confirm. Preserve this property.

The existing `PlacementPreviewResult` is already the common presentation result:

`{ x, z, yaw, footprintRadius, valid, reasonLabel }`.

If world-008 needs a richer placement contract, extend this seam only where required; do not create a second result type with overlapping responsibility.

## 2. Recommended placement contract

Do not make all world objects implement a common runtime interface.

The current objects have materially different state:

- tent: identity + transform;
- fire: kind + grate + runtime fire state;
- trap: kind + durability + activation/bait state;
- container: kind + Inventory contents + carried state;
- well: construction stage + work progress;
- garden: maintenance/hydration state.

A universal interface would either become optional-field-heavy or start owning gameplay.

Prefer a small data-oriented contract around the **placement operation**, conceptually:

- aimed transform;
- footprint/clearance;
- prerequisite check;
- placement validation;
- preview result;
- confirm callback.

Object-specific implementation remains in the existing action/domain module.

If a new type is required, keep it close to the existing placement domain rather than putting object-specific knowledge into `WorldBundle`.

## 3. Placement prerequisites must stay outside validation

Current actions correctly separate read-only placement checks from mutation:

- inventory/tool availability is checked before starting;
- materials/items are consumed only when the busy channel completes;
- confirm revalidates the authoritative placement action.

Preserve this boundary.

A placement validator must never:

- consume inventory/materials;
- create an object;
- start work;
- mutate terrain;
- create an NPC task.

This is especially important for future construction projects: placement can validate a site without implying construction has started.

## 4. World registration / ownership

There is already a clear registration model:

`WorldBundle` owns the collection/factory for each player-created object type, while the concrete `create*()` module owns runtime representation and object-specific state.

Examples:

- `createPlacedContainers()`;
- `createPlacedTents()`;
- `createPlacedTraps()`;
- `createPlayerWells()`;
- `createPlayerGardens()`;
- `createPlacedFires()`.

Keep this model.

Do **not** add:

- `PlayerConstructionManager`;
- `PlayerWorldObjectRegistry`;
- a global map of all placed objects;
- a generic manager responsible for dispatching every object type.

The world needs each concrete collection because other systems already consume typed APIs directly. For example, `interactables.ts` queries containers, traps, gardens and wells independently.

## 5. Persistence boundary

The existing persistence flow is explicit and should remain so:

`SaveData` schema → `createApp.ts` restores records → `createWorldBundle()` → concrete `create*()` factory.

`saveState.ts::buildSaveData()` already serializes all major player-created objects independently:

- `placedFires`;
- `placedTents`;
- `placedTraps`;
- `placedContainers`;
- `carriedContainer`;
- `playerWells`;
- `playerGardens`;
- terrain preparations;
- planted trees/crops.

Do not replace this with polymorphic serialization.

The correct outcome of world-008 is a **clear convention**, not necessarily one new persistence container. New object types should have an explicit `SaveX` record and a corresponding restore path.

Keep runtime-only state out of the record when it can be derived. Existing examples:

- well completion derives from stage/work progress;
- container capacity derives from `CONTAINER_DEFS`;
- garden mesh/collider derives from its record;
- fire runtime burn state is intentionally not persisted.

## 6. WorldBundle rebuild is already the second lifecycle boundary

`rebuildWorldBundle()` already snapshots and restores player-created records across same-seed rebuilds:

- dropped items;
- fires;
- tents;
- traps;
- containers + carried container;
- wells;
- gardens;
- terrain preparations;
- drying racks/hives.

The important implementation rule is: **snapshot before dispose**, because several `nodes()` APIs expose live arrays.

For a new player-created object, wire the same three paths:

1. `WorldSystemsSeed` input;
2. `buildWorldSystems()` construction;
3. `rebuildWorldBundle()` carry/dispose/restore.

Also add its explicit save/load path if it is persistent.

Do not make `rebuildWorldBundle()` discover objects dynamically through a registry.

## 7. Runtime object lifecycle

Existing factories establish the useful pattern:

`record → spawn runtime representation → expose typed API → dispose runtime representation`.

Important examples:

- `createPlayerGardens()` also registers/clears colliders;
- `createPlayerWells()` swaps stage meshes and re-registers its collider;
- `createPlacedContainers()` owns the authoritative Inventory contents;
- `createPlacedTraps()` owns runtime cooldown/attempt maps that are deliberately not persisted;
- `createPlacedFires()` owns lights/visuals/runtime fire state.

The common foundation should not absorb these responsibilities.

For a new object, the factory should remain the owner of its runtime resources and implement `dispose()`.

## 8. Interaction boundary

`src/app/interactables.ts` is already the central interaction discovery layer. It queries concrete world systems and creates typed `Interactable` candidates.

World-008 should only guarantee that a newly placed object can be discovered through the existing mechanism.

Do not add interaction behaviour to the placement contract.

A future torch should therefore be:

`placement → registered torch record/runtime object → interactables can discover it → torch-specific action changes lit state`.

The ignite/state transition belongs to the torch system, not the placement foundation.

## 9. Cross-object placement rules

There is already an intentional distinction between:

- blockers: nearby world geometry;
- peers: same-family placement separation.

Do not accidentally make every placed object mutually exclusive.

For example, traps currently include tents as peers, while the common blocker query handles settlement geometry. If the foundation introduces a generic "all player objects" collision list, it could silently change existing gameplay.

If cross-type clearance becomes necessary, add it explicitly to the object's placement definition/query rather than making all objects block all other objects.

## 10. Migration recommendation

The strongest candidates for reuse of a common placement seam are:

1. chest;
2. tent;
3. fire;
4. trap;
5. well;
6. garden.

However, migrate only where the extraction removes real duplication.

Do **not** migrate a system merely because it has `x/z/yaw`.

In particular:

- keep well's construction lifecycle separate;
- keep container carried/put-down as a distinct operation;
- keep trap item-instance ownership and activation separate;
- keep garden maintenance/hydration separate;
- keep fire runtime state separate.

The proof cases requested by the plan are well chosen: use a simple object such as tent/chest and a stateful object such as well/container.

## 11. Important current-code discrepancy

The plan says the common placement UX was established for chest/tent/fire. That is correct now, but the actual shared layer is **already implemented** by `placementPreviewActions.ts`.

Therefore the implementation task should focus on the lower-level contract/ownership/persistence boundaries. Rebuilding preview UX would be duplicate work and risks breaking the existing `ui-input-004` flow.

Likewise, `PlacementPreviewResult` currently only expresses valid/invalid. Do not introduce a yellow state unless the domain can actually produce a meaningful warning distinct from invalid placement.

## 12. Performance / lifecycle pitfalls

- Placement preview runs from the game loop; avoid allocating new Three.js geometry/materials per frame.
- `placementPreview.ts` already reuses one ghost object; preserve this.
- Keep blocker queries bounded/local.
- Do not make persistence or registration a world-wide scan.
- Do not add per-frame reconciliation between a generic registry and concrete systems.
- Keep runtime state in the owning factory so `dispose()` can release meshes, colliders, lights and internal maps deterministically.

## 13. Suggested implementation order

1. Recon all current placement factories/actions and document the minimum common seam actually shared by at least two implementations.
2. Extract only the genuinely common placement data/validation adapter; reuse `evaluateGroundPlacement()` and `PlacementPreviewResult`.
3. Adapt chest/tent (simple cases) without changing gameplay behaviour.
4. Validate the seam against one stateful object, preferably well or container.
5. Wire any necessary SaveData/rebuild lifecycle changes.
6. Only then migrate additional objects where duplication is demonstrably removed.
7. Verify that `placementPreviewActions.ts` remains the only placement-preview controller.

Do not start by designing a generic hierarchy for all future construction types.

## 14. Key files

Primary implementation/recon targets:

- `src/items/tentPlacement.ts` — shared ground-placement domain rules.
- `src/app/actions/placementActions.ts` — tent/trap/well placement and shared blockers.
- `src/app/actions/containerActions.ts` — authoritative chest placement.
- `src/app/actions/placementPreviewActions.ts` — existing shared placement UX/lifecycle.
- `src/world/placementPreview.ts` — preview rendering.
- `src/app/userActions.ts` — current fire placement/validation.
- `src/app/worldBundle.ts` — runtime ownership, rebuild and disposal boundary.
- `src/app/saveState.ts` — save assembly.
- `src/persistence/saveData.ts` — explicit persistent schema.
- `src/app/createApp.ts` — restore/wiring boundary.
- `src/app/interactables.ts` — interaction discovery.
- `src/world/createPlacedContainers.ts`, `createPlacedTents.ts`, `createPlacedTraps.ts`, `createPlayerWells.ts`, `createPlayerGardens.ts` — concrete runtime factories.

## Architectural conclusion

The codebase already has most of the mechanics the plan wants to unify, but they are intentionally **typed and owner-specific**. The safe foundation is therefore a small shared placement contract layered under the existing actions, while `WorldBundle`, `SaveData`, interaction discovery and concrete factories remain the ownership boundaries.

## Implementation (what was actually built)

Confirmed against current code before implementing: `WorldBundle` ownership/rebuild, `SaveData`/`saveState.ts`, and `interactables.ts` discovery already satisfy the plan's registration/persistence/interaction-boundary requirements for every existing player-created object (tent, chest, trap, well, garden) — no code there needed to change. The only real duplication left to remove was at the *validation* layer: `preview*Placement()` and its matching `place*AtAim()`/`putDown*AtAim()` each independently rebuilt the aimed transform and called `evaluateGroundPlacement()`/`evaluateTentPlacement()` with the same arguments, so a future edit to one could silently diverge from the other.

Added the minimal placement contract to `src/app/actions/placementActions.ts` (already the module owning `PlacementPreviewResult`/`PlacementBlocker`, so no new file/module):

- `GroundPlacementSite` — `{ x, z, yaw }`, the aimed transform.
- `GroundPlacementDefinition<Reason extends string>` — `{ aim, evaluate, footprintRadius, reasonLabel }`. `evaluate` stays a plain function the object supplies, so it can call `evaluateGroundPlacement()`, `evaluateTentPlacement()`, or any other object-specific wrapper with its own peers/blockers/footprint — nothing is flattened into one shared rule set.
- `evaluatePlacementSite(def)` — resolves `{ site, reason }` once.
- `previewGroundPlacement(def)` — builds the existing `PlacementPreviewResult` shape from a definition.

This is the "small data-oriented contract around the placement operation" the review recommended — aimed transform, footprint, object-specific validation and preview result — with confirm/mutation deliberately left in the caller (never in the contract), per §3/§7 of the review.

Migrated the two seams that actually had duplication to remove:

- **Tent** (`placementActions.ts`) — `previewTentPlacement`/`placeTentAtAim` now both build one `tentPlacementDefinition()` and call `previewGroundPlacement`/`evaluatePlacementSite` on it, instead of each independently calling `evaluateTentPlacement()`.
- **Container/chest** (`containerActions.ts`) — `previewContainerPlacement`/`placeContainerAtAim`/`putDownContainerAtAim` (three call sites, the most duplicated of all existing placements) now share one `containerPlacementDefinition(kind)`. Chest doubles as both proof cases the plan asks for: a simple placed object, and an object with its own interaction/state lifecycle (`Inventory` contents, carried state, open/pick-up/put-down via `interactables.ts`).

Deliberately **not** migrated: trap, well (initial placement), garden, tree planting, crop planting. Each of these has exactly one call site for its `evaluateGroundPlacement()` check (no separate preview — they aren't part of the `ui-input-004` shared preview UX), so wrapping them in the contract would remove no real duplication, only add a layer of indirection for uniformity — which the plan explicitly says not to do ("Nie migrować obiektu tylko po to, aby zwiększyć pozorną jednolitość kodu"). `workOnWell`'s multi-stage construction lifecycle and the garden's maintenance/hydration state were left untouched, as the plan requires.

`placementPreviewActions.ts` was not changed — it remains the only placement-preview controller, still calling `previewTentPlacement()`/`previewContainerPlacement()` as before; only what those two functions do internally changed.

No `SaveData`, `WorldBundle`, or interaction changes were needed — this plan's foundation was already load-bearing in the existing code, confirmed by inspection rather than by adding a new layer.

Verification: `npx tsc --noEmit`, `pnpm run lint:fix`, `pnpm run build` and the full test suite (2252 tests, including `src/items/tentPlacement.test.ts`) all pass. Browser/manual verification (placing/cancelling a tent and a chest, confirming preview validity matches actual placement, opening/carrying/picking-up/putting-down a chest, save/load) is still needed — see the plan's `Status:` header.

**Zrób git commit i push do main, rebase jeżeli trzeba**
