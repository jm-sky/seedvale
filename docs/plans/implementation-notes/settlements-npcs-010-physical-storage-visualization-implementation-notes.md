# Implementation Notes: Physical Storage Visualization

**Reviewed:** 2026-08-30  
**Plan:** settlements-npcs-010-physical-storage-visualization.md

## Review conclusion

Plan 010 is valid, but the current code is further along than the plan assumes:

- Plan 008 is implemented: household and settlement food is concrete ItemKind inventory.
- Plan 009 is implemented: src/settlement/storageDestinations.ts is the authoritative resource → physical destination resolver.
- Physical storage props already exist: household crates, one settlement crate, and one/two static wood piles.
- There is no inventory/economy change-event mechanism. Use bounded low-frequency synchronization rather than adding an event bus just for rendering.
- buildSettlementProps() currently creates the static stockpile mesh before authoritative household/economy state is available. Plan 010 must not leave that mesh alongside a dynamic wood representation.

The implementation should be a presentation layer over existing storage ownership, not a new storage system.

## Current authoritative ownership and destinations

Use these existing owners directly:

- household food → Household.items / household.foodCount();
- household wood → Household.stock.query('wood');
- settlement food → SettlementEconomy.items / economy.query('food');
- settlement wood → SettlementEconomy.query('wood').

Do not read quantities from Three.js props.

Reuse src/settlement/storageDestinations.ts for destination semantics:

- household food → household home;
- household wood → shared village stockpile;
- settlement food → landmarks.settlementStorage;
- settlement wood → landmarks.stockpile.

Important: the household storage crate at landmarks.householdStorages is currently a presentation/interactable anchor from plan 156; Plan 009 still resolves household food to the home position. Do not silently change logistics/destination behaviour in Plan 010 just to make the visuals line up.

## Recommended architecture

Create one shared module, preferably src/settlement/storageVisuals.ts.

It should own only runtime presentation:

authoritative Household / SettlementEconomy
→ derived visual state
→ Three.js objects

Suggested public surface:

- one factory for a settlement storage-visual controller;
- update() or equivalent low-frequency synchronization;
- dispose().

Keep representation configuration in this module (or a small adjacent data-only module). Do not create resource-specific renderers.

### Avoid duplicate stockpile visuals

buildSettlementProps() already creates the primary and, for LG/XL, secondary wood-pile meshes.

The dynamic system must replace/own the stockpile mesh instead of rendering another pile on top of it. Keep landmarks.stockpile and stockpileSecondary unchanged because NPC logistics and settlementPropColliders.ts consume those positions.

A clean option is to move stockpile mesh creation into the storage-visual layer while buildSettlementProps() continues to establish the positions. Do not remove the landmark/collider contract.

Household and settlement crates should remain as the physical presentation containers; dynamic food contents can be rendered around/inside them.

## Assets / visual primitives

No new asset is currently required.

Existing reusable assets/fallbacks:

- /models/settlement/wood_pile.glb via WOOD_PILE_URL;
- /models/settlement/crate.glb;
- procedural createStockpile() fallback;
- procedural createCrate() fallback;
- createItemMesh(kind) for concrete item visuals.

src/items/items.ts::createItemMesh() already has procedural visuals for carrot, potato, cabbage, tomato, fish, bread, meats, cheese, dried food and other current food kinds. Reuse it rather than creating another food-mesh catalog.

Use FOOD_ITEM_KINDS from src/items/foodItems.ts. It is derived from the existing ItemKind food category, so newly classified food items automatically participate.

Do not update docs/assets/MODELS.md unless a genuinely new runtime asset is introduced.

## Wood representation

The current createStockpile() is a fixed five-log mesh. Replace that quantity-independent representation with the plan's bands:

- 0 → no pile;
- 1–3 → small;
- 4–7 → medium;
- 8–12 → large;
- 13–20 → full;
- >20 → additional deterministic pile(s).

Keep thresholds in one configuration.

Prefer the existing wood-pile GLB/fallback as the visual unit and derive the quantity state by selecting/cloning a bounded number of prepared templates or variants.

Do not create one log mesh per resource unit.

For LG/XL there are two physical stockpile positions. Preserve both. If settlement wood is distributed across both, define one deterministic distribution rule; never display the full settlement quantity at both locations.

## Food representation

Use ItemKind, not a generic food-count mesh.

Pipeline:

FOOD_ITEM_KINDS
→ authoritative Inventory.count(kind)
→ bounded visual count/state per kind
→ createItemMesh(kind) / existing asset

Do not hard-code carrot/cabbage/potato/tomato/fish in the renderer.

Different kinds must remain visually distinguishable. Large quantities should be aggregated to a bounded number of visible units.

A deterministic local offset pattern indexed by kind and visual-unit index is preferable. Do not use Math.random(); reloads must reproduce the same layout.

## Instancing / Three.js

src/render/instancedProps.ts::buildInstancedProps() is the existing batching mechanism and is suitable for repeated food/wood visual primitives.

createItemMesh() creates procedural geometry/materials per template. Create one template per visual kind, then reuse/instance that template. Do not call createItemMesh() once for every visible quantity during every update.

Ordinary clones are acceptable for very small bounded counts; use instancing when draw calls become meaningful.

Keep shared geometry/materials shared and follow existing disposeObject3D()/prop lifecycle rules.

## Synchronization

There is currently no general inventory/economy observer mechanism.

Do not introduce a global event system solely for this plan.

Use a bounded low-frequency synchronization pass from the settlement lifecycle:

- build a compact fingerprint of relevant quantities;
- compare it with the previous fingerprint;
- rebuild only changed visual groups;
- do not rebuild every frame.

Relevant state is small: household wood/food counts plus settlement wood/food counts. Avoid JSON serialization as the recurring fingerprint if a small deterministic numeric/string fingerprint can be built directly.

## Household vs settlement storage

Use the same visual mechanism for both scopes.

Conceptually each visual entry needs only:

scope: household | settlement
owner: Household | SettlementEconomy
anchor: Vector3

Preserve the existing createSettlement.ts index mapping between households and householdStorages.

For household visuals, the storage crate is a presentation anchor. Do not turn it into an owner or modify the Plan 009 destination resolver.

## Placement and determinism

Reuse existing storage positions and household-yard placement.

For dynamic contents:

- anchor to existing storage positions;
- use a fixed deterministic local pattern;
- keep contents within the container/pile footprint;
- avoid paths, doors and navigation-critical areas;
- use placeOnGround() / existing terrain sampling when needed.

Do not add colliders for individual food/log visuals. Existing settlement prop collision is for the storage/pile area.

Plan 011 already introduced householdYardRadius() and consolidated household-yard placement. Do not duplicate its clearance calculations.

## Lifecycle / streaming

Storage visuals are runtime projections.

On materialization, build them from the current Household / SettlementEconomy state.

On disposal, remove/dispose all generated visual objects without touching authoritative inventories.

On stream-out/in, authoritative quantities come from existing state; visual meshes are recreated. Never persist visual counts.

## Tests

Prioritize pure derivation tests plus a small lifecycle seam:

1. every current FOOD_ITEM_KINDS entry gets a representation;
2. non-food items never enter food visuals;
3. food visual count is bounded;
4. different food kinds use distinguishable templates;
5. wood transitions at 3/4, 7/8, 12/13 and 20/21 are correct;
6. >20 creates additional deterministic pile representation;
7. identical input state produces identical placement;
8. inventory/economy changes alter derived visuals;
9. visual derivation never mutates authoritative state;
10. household and settlement storage use the same mechanism;
11. disposal cleans generated objects.

Extend existing test infrastructure; do not add a new framework.

## Main pitfalls

- Duplicate wood piles: existing buildSettlementProps() already renders a fixed pile.
- Wrong owner: never infer quantities from Object3D, Interactable or landmark state.
- Wrong destination: preserve the Plan 009 resolver and its fixed settlement-food withdrawal path.
- Hard-coded food list: use FOOD_ITEM_KINDS / existing category metadata.
- Per-unit meshes: keep visible counts bounded.
- Nondeterministic placement: avoid cloneProp(), because it uses Math.random(). Use deterministic offsets/yaw or clonePropWithYaw().
- New event bus: no current change-event mechanism exists; bounded polling is less invasive.
- Extra colliders: decorative contents must not obstruct NPC navigation.
- Persistence: never save derived visual state.
- Plan 011 leakage: reuse its yard contract instead of redesigning settlement spacing.

## Focused files

- src/settlement/storageDestinations.ts
- src/settlement/props.ts
- src/settlement/createSettlement.ts
- src/settlement/household.ts
- src/economy/settlementEconomy.ts
- src/items/foodItems.ts
- src/items/items.ts
- src/render/instancedProps.ts
- src/settlement/propUtils.ts
- src/settlement/settlementPropColliders.ts
- src/settlement/householdYard.ts

Also inspect src/app/interactables.ts and src/interaction/Interactable.ts for the existing read-only storage presentation contract.

## Verification emphasis

Technical checks can prove derivation/lifecycle, not visual readability.

Browser verification should cover:

- empty → non-empty;
- all wood threshold transitions;
- >20 wood;
- both LG/XL stockpile positions;
- multiple food kinds simultaneously;
- household and settlement storage;
- exchange/economy-withdrawal delivery;
- stream-out/in without duplicated visuals;
- NPC navigation around storage;
- draw-call/FPS impact.

Only mark the feature browser/manual verified after observing the running game.
