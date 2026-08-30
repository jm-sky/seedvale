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

## Implementation (what was actually built)

### Asset recon

No new assets were needed or added — confirms the review's "no new asset currently required" conclusion. Wood pile (`settlement/wood_pile.glb`, M33), storage crate (`settlement/crate.glb`) and `createItemMesh(kind)`'s existing per-food-kind pickup meshes (procedural fallback for carrot/cabbage/potato/tomato/fish — GLBs still `needed` per `docs/assets/MODELS.md` M36) were reused as-is. No `docs/assets/MODELS.md`/`LOCAL_ASSETS.md` changes.

### Mechanism

One new module, `src/settlement/storageVisuals.ts`, matches the recommended architecture:

- `woodPileVisualState(quantity)` — pure function, quantity → `{ visible, scale, extraPiles }`. `WOOD_PILE_BANDS` is the single source of truth for the 0/1-3/4-7/8-12/13-20 thresholds; `WOOD_PILE_OVERFLOW_STEP`/`WOOD_PILE_MAX_EXTRA` (3) control the 21+ "additional pile" behaviour.
- `createWoodPileVisual(mainPile, extraPiles)` — wraps the settlement's existing `stockpile` prop plus a handful of pre-placed, pre-hidden extra-pile clones into one `sync(quantity)` controller. Toggles `.visible`/`.scale` only; the primary pile mesh is reused in place (per "avoid duplicate stockpile visuals" above), never duplicated. A signature-string check makes a `sync()` call with an unchanged resulting state a cheap no-op — the low-frequency/bounded-fingerprint synchronization this review asked for.
- `selectFoodStorageSlots(items)` — pure function, an `Inventory` → up to `FOOD_STORAGE_MAX_SLOTS` (4) `{ kind, count, scale }` entries, iterated in `FOOD_ITEM_KINDS`' existing deterministic catalog order — no hard-coded food list.
- `createFoodStorageVisual(group, center, sampleHeight)` — one food-storage visual location; `sync(items)` reuses `createItemMesh(kind)` for each selected slot, swapping meshes only when the selected kinds/scale actually change (same signature-check pattern). Used identically for a household's pantry crate and the settlement's storage crate.

Wood and food keep separate `sync()` signatures (`number` vs `Inventory`) rather than one shared shape — they have different authoritative owners (`EconomicStock` vs a concrete-item `Inventory`, plan settlements-npcs-009 §3) — but share the module and its read-only/change-driven/bounded/deterministic-offset plumbing, and the household/settlement duplication this review flags is eliminated (one `createFoodStorageVisual` factory, not per-scope or per-kind renderers).

### Wood pile quantity — what it actually represents

Verified against `settlement/storageDestinations.ts`: every household's wood deposit **and** the settlement's own bulk wood both physically land at the same single `landmarks.stockpile` position (`householdStorageDestination`/`settlementStorageDestination` both resolve `'wood'` to `stockpile` unconditionally) — there is one shared pile per settlement, not one per household. So the pile's visual quantity is `Σ household.stock.query('wood') + economy.query('wood')`, computed once per settlement `update()` tick in `createSettlement.ts` (a handful of households — cheap) and fed to `storageVisual.wood.sync(totalWood)`. This matches this review's "household wood → Household.stock.query('wood')" / "settlement wood → SettlementEconomy.query('wood')" ownership list, summed because they share one physical destination.

### `stockpileSecondary` (LG/XL) — deliberately left static

The review flags "For LG/XL there are two physical stockpile positions. Preserve both... never display the full settlement quantity at both locations." Verified against current code: `landmarks.stockpileSecondary` (built only when `infra.stockpiles > 1`) is referenced **only** by `settlementPropColliders.ts` for its collision disk — `storageDestinations.ts` and every NPC wood chop/deposit/withdraw path in `NpcAgent.ts` resolve *exclusively* to `landmarks.stockpile`. No wood is ever authoritatively associated with the secondary position; it is decorative "this is a large settlement" set-dressing, not a second storage destination. Making it quantity-driven would mean inventing a split of the single tracked wood total across two visual points with no basis in the data model — out of scope for "visualize existing storage destinations." It is left as the existing static `createStockpile()`/GLB prop, unchanged. `landmarks.stockpile`/`stockpileSecondary` positions and the collider contract are both untouched.

### Wiring

- `src/settlement/props.ts`'s `buildSettlementProps()`: builds the wood-pile extras (`loadPropTemplates`, same loader/fallback path as the main pile) and the settlement/household `FoodStorageVisual`s at the point the underlying `stockpile`/`settlementStorage`/`householdStorages` props are already placed. Returns them as a new `storageVisual: SettlementStorageVisuals` field alongside the existing `group`/`landmarks`/etc. — reuses `landmarks.stockpile`/`landmarks.settlementStorage`/`landmarks.householdStorages` positions exactly, no new placement system.
- `src/settlement/createSettlement.ts`: destructures `storageVisual` and calls `sync()` on it once per settlement `update()` tick, next to the existing `placeWoodshedIfComplete()` live-state→prop sync call (same established low-frequency pattern). Household food visuals are indexed through the already-existing `householdStorages` (household ↔ position) list built earlier in the same function, reusing its existing modulo-safe indexing rather than adding a second one — "preserve the existing createSettlement.ts index mapping between households and householdStorages," as recommended.
- Disposal: extra wood piles and food-item meshes are ordinary children of the settlement's own `group`; the existing `disposeSettlementGroup(group)` teardown already recursively disposes them via `disposeObject3D`'s `sharedGpu` guard, same as every other prop in `group`. `WoodPileVisual`/`FoodStorageVisual` also expose their own `dispose()` (used internally on every content-driven mesh swap; covered by unit tests) but nothing extra was wired into `Settlement.dispose()` — no double-disposal.

### Food visual anchor — one deliberate deviation

Household food visuals anchor the household's storage crate (`landmarks.householdStorages[i]`, the plan-156 presentation crate in each house's yard) rather than `this.home`/`landmarks.homes[i]` itself (the actual `storageDestinations.ts` delivery target for household food, per this review's own ownership list). The two points are a small fixed offset apart in the same yard (`HOUSEHOLD_YARD_PROP_OFFSETS.storage`); the crate is the existing dedicated "physical representation of a household's stored goods" prop (this review: "the household storage crate... is currently a presentation/interactable anchor from plan 156"), reused as the visual anchor rather than adding a second physical marker at the house itself. The Plan 009 destination resolver itself was not touched.

### Tests

`src/settlement/storageVisuals.test.ts` (20 tests, no new test infrastructure — plain `vitest` + real `THREE.Object3D`/`Inventory`, same style as other settlement tests) covers all 11 points from this review's test list: every `FOOD_ITEM_KINDS` entry individually representable; non-food kinds (`arrow`/`stone`) never selected; bounded slot count; distinguishable simultaneous kinds; wood band transitions at 3/4, 7/8, 12/13, 20/21; extra-pile count above 20 bounded at `WOOD_PILE_MAX_EXTRA`; determinism for repeated identical input; visuals change when contents change; `selectFoodStorageSlots`/`sync()` never mutate the `Inventory`/`Household`/`SettlementEconomy` they read; household and settlement `FoodStorageVisual`s (same factory) produce equivalent output for equivalent contents; `dispose()` removes every created object from its parent.

Missing-asset safety (plan §6 "a missing visual asset must never remove or alter the underlying stored item") wasn't re-tested directly — it already holds structurally, because `createItemMesh()` (existing, untouched) always returns a mesh (GLB or procedural fallback) and `selectFoodStorageSlots`/`sync()` never call any `Inventory` mutator.

Full suite: `npx tsc --noEmit`, `pnpm lint:fix`, `npx vitest run` (2161 tests, all settlement tests included) and `pnpm run build` all pass.

### Still needed

Browser/manual verification only (plan §11 / this review's "Verification emphasis") — wood pile band transitions during real NPC deposit/withdraw, food item visuals for carrot/potato/cabbage/tomato/fish at both household and settlement storage, multiple simultaneous food kinds, an LG/XL settlement's static secondary pile reading correctly alongside the dynamic primary, settlement creation/removal lifecycle (no duplicated/leaked visuals), and no visible NPC navigation obstruction or FPS/draw-call regression from the extra piles/food meshes.
