# Implementation Notes: Player-Built Palisade and Building Removal

**Plan:** items-player-010-player-built-palisade-and-building-removal.md
**Last reviewed:** 2026-09-01

## 1. Current architecture / important discrepancy

The plan is downstream of world-008, and its placement foundation is already real code, not a future abstraction:

- src/app/actions/placementActions.ts: GroundPlacementDefinition, evaluatePlacementSite(), previewGroundPlacement().
- src/items/tentPlacement.ts: evaluateGroundPlacement() is the canonical ground suitability check.
- src/app/actions/containerActions.ts: concrete example of a player-built object using the shared placement contract.
- src/ui-vue/screens/PlacementPreviewOverlay.vue + src/app/actions/placementPreviewActions.ts: existing preview controller.
- WorldBundle owns separate systems (placedTents, placedContainers, playerWells, playerGardens, etc.). There is no generic player-built-object registry and no reason to introduce one for this plan.

Do not retrofit all existing objects into a new hierarchy merely to make palisade look uniform.

## 2. Palisade should follow the existing placed-object split

Use the same pattern as PlacedTents / PlayerWells:

- world/palisade.ts (or equivalent) owns pure record/definition data and placement-specific constants.
- world/createPalisades.ts owns runtime entries, creation/removal, Three.js representation and cleanup.
- WorldBundle gets one palisades field; this is the authoritative runtime owner.
- save data stores plain palisade segment records, never Object3D, connection objects or neighbour references.

A segment remains independently addressable by stable id. Connection is derived from transforms/geometry, not persisted as a graph.

## 3. Material model already exists

beam is already a canonical ItemKind in src/items/items.ts; do not add another wood/material abstraction.

The generic construction-material seam is src/items/constructionMaterials.ts:

- MaterialRequirement
- hasMaterial()
- consumeMaterial()
- CONSTRUCTION_MATERIAL_RADIUS (currently 3 world units)

It supports inventory first, then nearby dropped items, with deterministic nearest/id ordering and all-or-nothing validation.

For palisade cost, inspect current ITEM_DEFS and construction-related definitions and choose the smallest sensible existing material recipe. The plan intentionally leaves the exact cost open. Do not invent a recipe framework or duplicate hasMaterial/consumeMaterial.

## 4. Placement / snapping

The shared placement contract is intentionally small. Palisade should provide its own aim/evaluation definition and use evaluatePlacementSite() for confirmation and previewGroundPlacement() for preview.

For snapping, keep connection geometry pure and local to palisade placement logic:

- segment definition exposes length/half-length and endpoint offsets;
- given an existing segment, derive its two endpoint connection transforms;
- choose the nearest valid endpoint to the current aimed site;
- place the new segment at the derived endpoint and orient it along the chosen connection direction;
- then run normal ground/object validation again before consuming materials.

Do not persist connectedTo or neighbour ids. Do not scan every segment every frame. During placement, a bounded local search over existing palisade records is sufficient; deterministic tie-breaking should be explicit.

The final placement action must re-resolve the snapped transform and revalidate at confirmation time. Preview is never authoritative.

## 5. Corner behaviour

No corner entity is needed. The segment yaw is enough.

When the player rotates the next segment relative to the connection endpoint, its endpoint transform creates the turn. Avoid maintaining a global palisade topology.

The visual geometry should make endpoint alignment exact enough that two segments do not visibly float apart or overlap excessively. Base the connection rule on segment dimensions, not per-corner magic cases.

## 6. Ground collision / existing blockers

tentBlockers() is currently a convenience name in placementActions.ts, not a dedicated palisade API. It collects nearby trees and loaded settlement wells/houses.

Do not assume it is semantically complete for palisades. Palisade evaluation should use the shared ground rules but explicitly decide whether neighbouring palisade segments are valid peers and what their footprint/clearance is.

If a shared blocker helper needs a rename/generalisation, keep it small and preserve existing behaviour.

## 7. Runtime representation and cleanup

Follow PlacedTents.pack() / createPlayerWells.transitionTo() conventions:

- authoritative record lives in the owner collection;
- runtime mesh is disposable;
- removal removes it from the owner collection;
- call disposeObject3D() for owned geometry/material resources;
- remove any collider registration owned by that segment before/with disposal.

If palisades participate in NPC collision/pathfinding, use ChunkManager.registerColliders()/clearColliders(). Do not add palisade-specific navigation avoidance.

A removed segment must not require rebuilding the remaining segments.

## 8. Interaction

src/interaction/Interactable.ts is the per-frame adapter. Existing player-built examples are tent, trap, container, playerWell and gardenPlot.

A palisade segment should become another lightweight interactable carrying only stable data needed by the dispatcher, normally id and position.

Removal should be handled in the existing action/game-loop dispatch path, not inside Interactable or resolveInteraction() as a second gameplay mechanism.

Be careful with key conflicts: R is already used by many world objects. Choose the action based on existing interaction conventions and current UI/input routing rather than hard-coding a new global key path.

## 9. Generic removal/recovery

There is currently no generic player-built removal system. Existing removal-like operations are object-specific: PlacedTents.pack(), trap collection, container pickup.

The useful abstraction here is a small transaction/domain seam, not a PlayerConstructionManager.

It should conceptually:

1. resolve the live object by id;
2. resolve its material cost/recovery policy;
3. calculate deterministic recovered quantities;
4. verify the player's inventory has room for all recovered materials;
5. only then mutate authoritative world state and inventory;
6. clean the runtime representation.

Do not implement remove-first-then-add. Inventory.add() can fail because of both weight and size limits. Preflight every recovered material with canAdd() before removing anything.

Prefer complete preflight followed by synchronous mutation. Do not introduce a general transaction framework.

## 10. Recovery policy

Recovery must be configuration attached to the concrete player-built object type, not a hard-coded palisade branch.

The cost must be the same canonical construction cost used for placement. Avoid maintaining a second removal-cost table that can drift.

Recommended pure policy shape: requirements: MaterialRequirement[] plus recoveryRate.

Use deterministic rounding, preferably Math.floor(cost * recoveryRate), consistently for every material. Never use random rolls.

Clamp defensively so recovery cannot exceed the original cost. A one-unit material recovering to zero is preferable to violating the count contract.

## 11. Inventory fallback

The plan explicitly says removal is blocked when inventory cannot accept the recovery and there is no existing overflow mechanism.

There is no need to create a new drop/overflow system. Existing dropped items are a separate world-item owner and should not become implicit overflow for this feature.

The removal action should fail cleanly before any mutation and use the existing inventory-capacity error convention where practical.

## 12. Persistence and rebuild wiring

Persistence uses explicit fields in SaveData and explicit construction in saveState.ts. Add a SavePalisadeSegment plain-data type and a palisades field rather than serializing runtime entries.

Follow the existing flow:

SaveData → createApp restore values → createWorldBundle → WorldBundle.palisades

and the same-seed rebuild flow in rebuildWorldBundle(): nodes() → dispose() → createPalisades(initial).

The rebuild code already carries tents, traps, containers, wells, gardens and terrain preparations explicitly. Palisades must be added to that same carry-across-rebuild path.

Do not derive connections from save data beyond the persisted transform. Reload should simply spawn every segment from its saved transform.

## 13. ID generation

Existing placed-object owners use Date.now() plus a module counter. Follow the local convention unless there is a concrete reason not to.

The important property is uniqueness during the runtime/save lifecycle, not deterministic ids derived from position.

## 14. Collider and navigation caution

If each segment gets a collider, make the collider geometry match the actual segment footprint closely enough for NPC movement.

Registration happens on spawn; removal clears only that segment's owner key. No per-frame collider rebuilding or global palisade update loop.

## 15. Construction state

The plan calls the segment data a construction/material state but explicitly excludes construction progress/work time. Do not invent a multi-stage state machine.

For v1, the authoritative segment can simply be a completed placed object with its construction recipe known by type. Future damaged/unfinished states should be a separate extension.

## 16. Tests worth adding

Keep tests pure and cheap:

- palisade endpoint transform / snap math;
- nearest endpoint selection with deterministic tie-break;
- straight continuation;
- direction change / corner;
- invalid ground/slope/water result after snapping;
- recovery rounding and upper-bound clamp;
- removal blocked when inventory lacks capacity;
- successful removal mutates exactly one segment;
- remaining segments are untouched.

Existing evaluateGroundPlacement tests and placement tests should remain the regression baseline.

## 17. Likely pitfalls

- Consuming materials before the placement action actually completes.
- Trusting preview transform/validity instead of re-resolving on confirm.
- Snapping to an arbitrary segment rather than the nearest valid connection endpoint.
- Persisting neighbour/connection state and creating stale topology after removal.
- Introducing a PalisadeManager or a global per-frame palisade update.
- Removing the mesh but leaving authoritative state/collider behind.
- Removing authoritative state before proving all recovery materials fit.
- Using Inventory.add() as the capacity check after deletion instead of canAdd() beforehand.
- Creating a new overflow/drop mechanism.
- Duplicating beam/wood definitions or construction-material consumption.
- Treating tentBlockers() as a universal collision API without checking its actual semantics.

## 18. Suggested implementation order

1. Pure palisade segment definition, dimensions, recipe/recovery policy and snap math.
2. Runtime owner + segment visual + collider lifecycle.
3. SaveData + save/load + WorldBundle/rebuild wiring.
4. Shared placement-preview integration and placement action using existing material helpers.
5. Interactable + removal action.
6. Generic transactional removal/recovery seam and palisade adapter.
7. Unit tests + technical verification.
8. Browser verification of placement, snapping, save/load, single-segment removal and full-inventory refusal.

**Zrób git commit i push do main, rebase jeżeli trzeba**