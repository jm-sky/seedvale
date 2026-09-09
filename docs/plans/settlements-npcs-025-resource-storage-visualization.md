# Plan: Resource storage visualization

**Created:** 2026-09-07
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~settlements-npcs-009~~, ~~settlements-npcs-010~~
**Domain:** `settlements-npcs`
**Subdomains:** `economy` `logistics`
**Tags:** `storage` `visualization` `assets`

## Goal

Make settlement storage visuals communicate actual stored quantity more naturally while keeping the representation bounded, deterministic and cheap to update.

Keep the current ownership model intact: authoritative quantities stay in `Household` / `SettlementEconomy`; `src/settlement/storageVisuals.ts` remains presentation-only and derives visuals from those owners. Do not add parallel storage state or persist visual fill/reveal state.

The work is intentionally staged:

1. **Stage 1 — progressive wood stockpile**: replace scale-only wood with authored discrete pile variants;
2. **Stage 2 — pooled food representatives**: replace one-scaled-mesh-per-kind with bounded discrete representatives and stable cached pools;
3. **Stage 3A — container-ready food layout foundation**: make food placement explicitly local/deterministic and ready for a real open container without hard-coding current crate geometry;
4. **Stage 3B — actual container fill visualization**: only after an open storage container asset with usable interior/rim bounds is available and verified;
5. audit remaining `EconomicKind`s and defer those that still lack real storage semantics/assets.

## Current verified state

`src/economy/kinds.ts` defines settlement economic kinds:

- `food`
- `water`
- `wood`
- `iron`
- `coal`
- `gold`
- `copper_ore`

`SettlementEconomy` owns settlement bulk stock and concrete settlement food (`SettlementEconomy.items`). `Household` owns household wood/water and concrete food/items. `src/settlement/storageDestinations.ts` already resolves the physical destinations currently used for delivery:

- wood → shared settlement stockpile,
- household food → household home/pantry,
- settlement food → settlement storage crate.

Do not create another destination system in this plan.

`src/settlement/storageVisuals.ts` currently visualizes wood and food:

- wood uses `wood_pile.glb`, whole-pile scale bands and up to three overflow pile clones;
- the first positive wood quantity therefore shows the complete authored pile, only scaled down;
- food uses concrete `ItemKind`s through `createItemMesh(kind)`, with a bounded number of displayed food kinds;
- food quantity is currently communicated mainly by scaling one representative model per displayed kind;
- `createFoodStorageVisual()` currently removes/disposes and recreates meshes when the selected kind/scale signature changes, causing avoidable object churn.

A new authored progressive wood asset has been prepared for this plan:

- `wood_pile_progressive.glb`
- root: `wood_pile_progressive`
- children: `Pile_01`, `Pile_05`, `Pile_10`, `Pile_18`, `Pile_29`
- each child is a complete alternative pile variant; variants are not additive and exactly one should be visible at a time.

The original `wood_pile.glb` remains the runtime fallback/context until implementation migrates the visual controller.

Existing nature assets `resource_rock_1.glb` and `resource_gold_1.glb` are world-deposit visuals: rocks protruding from terrain, with the gold variant showing gold fragments in grey rock. They are semantically unsuitable as stored-resource piles and must not be reused directly for settlement storage.

Food continues to use the existing `createItemMesh(kind)` / `ITEM_GLB_SPECS` pipeline. `FOOD_ITEM_KINDS` is derived from `ITEM_DEFS` by the shared `food` category and should remain the authoritative deterministic kind ordering.

Water has no verified quantity-storage representation; the well is a source/place, not stored-water quantity.

## Scope

### 1. Stage 1 — progressive wood stockpile

Verify the checked-in progressive wood asset and use the contract:

```text
wood_pile_progressive
├── Pile_01
├── Pile_05
├── Pile_10
├── Pile_18
└── Pile_29
```

Requirements:

- names above are stable runtime identifiers,
- variants share the same placement/orientation and read as one pile growing in amount,
- each `Pile_*` is independently toggleable through `Object3D.visible`,
- all variants are loaded/cloned once with the settlement prop,
- sync must not traverse/sort arbitrary GLB hierarchy every update; resolve and cache references during initialization,
- exactly one pile variant is visible for positive normal-range quantities,
- zero quantity hides all variants.

Use this mapping:

| Stored wood | Visible variant |
|---:|---|
| 0 | none |
| 1 | `Pile_01` |
| 2–5 | `Pile_05` |
| 6–10 | `Pile_10` |
| 11–20 | `Pile_18` |
| 21+ | `Pile_29` |

High-quantity overflow may retain the existing bounded extra-pile mechanism if it still reads naturally, but the primary pile must remain `Pile_29` rather than scale beyond authored size.

Keep `physicalWoodStockpileQuantity()` and current delivery/ownership semantics unchanged.

### 2. Stage 2 — pooled food representatives

Replace scale-only quantity cues with bounded discrete representatives while preserving the current shared household/settlement mechanism.

Keep:

- `FOOD_ITEM_KINDS` as the deterministic source ordering,
- `createItemMesh(kind)` as the authoritative item visual factory/fallback path,
- one shared `createFoodStorageVisual()` mechanism for household and settlement storage.

Use a pure representative-count mapping as the starting policy:

| Stored quantity | Visible representatives |
|---:|---:|
| 0 | 0 |
| 1 | 1 |
| 2 | 2 |
| 3–4 | 3 |
| 5–7 | 4 |
| 8–12 | 5 |
| 13–20 | 6 |
| 21+ | 8 max |

Critical clarification from recon: **8 is the global visible-mesh cap per storage location, not per food kind**. The visible budget must be apportioned deterministically among selected kinds according to stored counts while still keeping kind diversity bounded by the current food-kind selection policy.

Requirements:

- low quantities stay close to one visible representative per stored unit,
- visible count grows sub-linearly at higher quantities,
- object scale stays near physical/model scale and is not the primary quantity signal,
- allocate/cache representatives instead of remove/dispose/recreate on every quantity/signature change,
- prefer lazy per-`ItemKind` pools over eagerly prebuilding all possible food meshes,
- repeated syncs only update visibility/bounded transforms,
- stable object identity across quantity changes,
- no new per-scope renderer for household vs settlement storage.

### 3. Stage 3A — container-ready food layout foundation

Stage 2 should leave the placement seam ready for a real open container without coupling the representative policy to current crate dimensions.

Add/retain a clear separation between:

`Inventory → selected kinds/counts → bounded visual representatives → deterministic local slot layout → Object3D visibility/transforms`

The layout should be expressible as deterministic local slots such as `{ x, y, z, yaw }` relative to the storage anchor/container presentation, rather than baking world positions or guessed crate interior dimensions into quantity logic.

Do not implement a fake fill level in Stage 3A.

### 4. Stage 3B — actual container fill visualization

The currently audited `public/models/settlement/crate.glb` is closed/merged and is not suitable for truthful internal fill visualization.

A candidate replacement/open storage prop has been identified:

- **Fruit Crate** by BlenderVoyage on Poly Pizza
- source: `https://poly.pizza/m/aXulVWHOeV`
- low-poly, GLTF/FBX, CC0/public-domain listing
- semantically intended as a crate for carrying apples/produce.

Treat this only as a **candidate asset** until it is added to the repository and its actual GLB hierarchy, dimensions, orientation, openness and usable interior/rim bounds are verified.

When a suitable open container is available, Stage 3B may implement actual content placement/fill semantics such as:

`low → quarter → half → three-quarter → near-full`

but the visual should be built from bounded representative placement within verified interior bounds, not a generic fake volume scale.

If the candidate crate proves unsuitable, keep Stage 3B deferred rather than forcing a poor fit.

### 5. Audit all settlement resources

Implementation notes must include one table covering every `EconomicKind` with:

- authoritative owner,
- current physical storage/delivery destination if any,
- current visualization status,
- existing candidate asset/procedural visual if semantically suitable,
- proposed representation type,
- implementation/defer status and blocker if deferred.

Expected decisions:

- `wood`: **Stage 1 implement** using `wood_pile_progressive.glb`,
- `food`: **Stage 2 implement** using bounded pooled discrete representatives; **Stage 3A** prepare container-ready layout; **Stage 3B** only after open-container verification,
- `iron`, `coal`, `gold`, `copper_ore`: **defer physical storage visualization** until a real storage destination and semantically correct stored-material visual exist,
- `water`: **defer** until a stored-water container/destination exists.

`resource_rock_1.glb` and `resource_gold_1.glb` are terrain deposit visuals and are explicitly **not** candidates for stored ore/gold presentation.

Do not force every missing resource visual into this implementation. Do not invent storage anchors, reuse mineable deposits as stockpiles, or map water stock onto the well.

If a future plan defines one shared settlement bulk-goods storage destination for ores/minerals, prefer one shared bounded storage-visual mechanism parameterized by resource kind over four independent implementations.

### 6. Performance constraints

Required constraints:

- global hard cap of 8 visible food representative meshes per storage location,
- bounded selected food-kind count,
- lazy cached per-kind pools instead of per-sync recreate/dispose,
- wood variants cached once by stable name,
- update only `visible` and bounded transforms during sync,
- no per-tick GLB loading,
- no per-tick geometry/material cloning,
- no per-tick random layout generation,
- no visual-only persistence,
- reuse existing GLB template/clone pipelines,
- no worker: this is small presentation bookkeeping and worker communication would be unjustified.

Only one primary `Pile_*` variant should be visible at a time, so hidden variants must not create render draw calls. Keep any overflow count bounded.

### 7. Determinism

Wood-stage choice is a pure function of quantity. Food representative selection, visible-budget allocation, offsets and rotations must be stable for the same storage contents.

Prefer predefined local slots. No frame/tick-time randomness.

### 8. Tests

Extend `src/settlement/storageVisuals.test.ts` in the relevant stage with pure behavior coverage for:

#### Stage 1

- wood `0` → no pile variant,
- exact wood boundaries `1`, `2`, `5`, `6`, `10`, `11`, `20`, `21`,
- wood high quantities remain on `Pile_29` plus only bounded overflow if retained,
- exactly one primary `Pile_*` is visible for positive quantities,
- existing aggregate wood quantity semantics remain unchanged,
- repeated sync preserves wood object identities.

#### Stage 2 / 3A

- food representative thresholds at all boundaries,
- global cap never exceeds 8 visible food meshes per storage location,
- multiple food kinds share the same global budget deterministically,
- food kind selection remains food-only, bounded and deterministic,
- equal contents → equal representative allocation/layout,
- low quantities remain close to one rep per unit,
- repeated sync/quantity changes preserve pooled object identities,
- no mesh removal/disposal/recreation on normal quantity changes,
- household and settlement food storage continue to use the same controller mechanism,
- empty state hides all representatives.

For the progressive wood asset, stable authored names intentionally become part of the visual contract and may be tested at the controller boundary. Avoid incidental child-index assertions.

## Implementation notes required before coding

Keep updated:

`docs/plans/implementation-notes/settlements-npcs-025-resource-storage-visualization-implementation-notes.md`

The notes should remove unnecessary implementation-time recon and include:

1. exact symbols and call sites in `storageVisuals.ts`, `props.ts`, settlement construction/update wiring and item-model pipeline,
2. the full `EconomicKind` audit table,
3. the final progressive wood asset path and exact node-name contract,
4. chosen wood thresholds and any overflow rule,
5. exact current food container props and candidate open-container status,
6. chosen food representative thresholds and **global per-storage cap**,
7. deterministic budget-allocation/layout rule,
8. lazy-pool lifecycle/disposal ownership,
9. exact files/symbols to modify per stage,
10. explicitly deferred resources and concrete blockers,
11. documentation discrepancies found during the audit.

Where current code gives enough certainty, make the implementation decision in the notes rather than leaving later Claude Code recon.

## Likely files

Verify against current code before editing:

- `src/settlement/storageVisuals.ts`
- `src/settlement/storageVisuals.test.ts`
- `src/settlement/props.ts`
- `src/items/foodItems.ts` only if a type/helper import is required; do not move ownership there
- settlement prop/template loading helper if needed for the new progressive/open-container asset
- `docs/plans/implementation-notes/settlements-npcs-025-resource-storage-visualization-implementation-notes.md`

Do not refactor unrelated settlement economy, inventory, resource-deposit or persistence systems.

Add/update JSDoc for important architectural/public functions introduced or materially changed by the implementation, using the existing `@domain` conventions where appropriate so preflight discovery remains useful.

## Verification

Automated verification:

- relevant storage-visual tests,
- current repository TypeScript/test/build checks.

Manual browser verification is performed by the User, not the AI agent.

Stage-specific visual verification:

- Stage 1: wood transitions naturally through `Pile_01`, `Pile_05`, `Pile_10`, `Pile_18`, `Pile_29` without scale flicker/repositioning;
- Stage 2: food density increases without giant item scaling, flicker or reshuffling, and total visible meshes stay bounded;
- Stage 3A: layout stays deterministic and container-relative;
- Stage 3B: only after an open container is verified, representatives visibly sit inside the real container rather than clipping through walls or floating above guessed bounds.

> **Zrób git commit i push do main, rebase jeżeli trzeba**