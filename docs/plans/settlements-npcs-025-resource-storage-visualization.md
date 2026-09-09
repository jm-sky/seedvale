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

The work has four parts:

1. replace scale-only quantity cues for wood/food with bounded discrete visual states,
2. audit every `EconomicKind` for an appropriate settlement storage representation,
3. reuse existing GLBs / procedural fallbacks where practical,
4. keep render/update cost bounded independently of stored quantity.

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
- food quantity is currently communicated mainly by scaling one representative model per displayed kind.

A new authored progressive wood asset has been prepared for this plan:

- `wood_pile_progressive.glb`
- root: `wood_pile_progressive`
- children: `Pile_01`, `Pile_05`, `Pile_10`, `Pile_18`, `Pile_29`
- each child is a complete alternative pile variant; variants are not additive and exactly one should be visible at a time.

The original `wood_pile.glb` remains the current runtime asset until implementation migrates the visual controller.

Existing nature assets `resource_rock_1.glb` and `resource_gold_1.glb` are world-deposit visuals: rocks protruding from terrain, with the gold variant showing gold fragments in grey rock. They are semantically unsuitable as stored-resource piles and must not be reused directly for settlement storage.

Food continues to use the existing `createItemMesh(kind)` / `ITEM_GLB_SPECS` pipeline.

Water has no verified quantity-storage representation; the well is a source/place, not stored-water quantity.

## Scope

### 1. Asset contract before implementation

Verify the checked-in progressive wood asset and record its final repository path in implementation notes. The intended contract is:

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

Also keep the existing crate audit for food storage. Do not introduce fill-height behavior unless the active container geometry actually supports it.

### 2. Shared quantity-to-visual policy

Add small pure presentation mappings in or next to `storageVisuals.ts`. Wood uses its authored five-stage contract; food uses bounded representative counts.

#### Wood stage mapping

Use these authored variants:

| Stored wood | Visible variant |
|---:|---|
| 0 | none |
| 1 | `Pile_01` |
| 2–5 | `Pile_05` |
| 6–10 | `Pile_10` |
| 11–20 | `Pile_18` |
| 21+ | `Pile_29` |

These thresholds intentionally follow the prepared visual variants rather than trying to represent every unit literally.

High-quantity overflow may retain the existing bounded extra-pile mechanism if it still reads naturally, but the primary pile must remain `Pile_29` rather than scale beyond authored size.

#### Food representative mapping

Target mapping for discrete representatives:

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

Preserve these invariants:

- one stored unit must not read as a full pile/container,
- low quantities stay close to one visible representative per unit,
- visible count grows sub-linearly at higher quantities,
- render cost stays capped,
- object scale stays near physical/model scale and is not the primary quantity signal,
- mapping is deterministic and directly unit-testable.

### 3. Wood visualization

Keep the existing authoritative aggregate wood quantity calculation and existing sync integration.

Replace the current scale-band primary pile with `wood_pile_progressive.glb`:

1. load/clone the progressive asset once;
2. resolve `Pile_01`, `Pile_05`, `Pile_10`, `Pile_18`, `Pile_29` once during initialization;
3. validate/fail safely if expected nodes are missing;
4. `sync(quantity)` selects the pure wood stage and toggles only cached `.visible` values;
5. do not scale the selected pile according to quantity;
6. zero hides all stages;
7. optional high-stock overflow stays strictly bounded and may reuse the full `Pile_29` representation if appropriate.

Desired progression:

`1 log → small pile → medium pile → large pile → full 29-log pile → bounded overflow`.

Do not generate procedural loose logs for low/mid quantities now that the authored progressive asset exists. Keep procedural stockpile geometry only as fallback if the asset cannot be loaded.

### 4. Food visualization

Replace scale-only quantity cues with bounded discrete representatives.

For each displayed food kind:

- use `createItemMesh(kind)` so the existing GLB/procedural item pipeline remains authoritative,
- create/cache a bounded representative pool,
- toggle `visible` based on the quantity mapping,
- keep item scale near its normal model scale,
- use deterministic local positions/rotations,
- do not allocate/dispose item meshes on quantity changes.

#### Container fill behavior

The currently audited settlement `crate.glb` is closed/merged. Therefore v1 should keep bounded visible representatives placed deterministically on/adjacent to the storage prop and **not** fake an internal rising fill level.

A true `low → quarter → half → three-quarter → near-full` fill-height presentation is deferred until an intentionally open container exists with real usable interior/rim bounds.

### 5. Audit all settlement resources

Implementation notes must include one table covering every `EconomicKind` with:

- authoritative owner,
- current physical storage/delivery destination if any,
- current visualization status,
- existing candidate asset/procedural visual if semantically suitable,
- proposed representation type,
- implementation/defer status and blocker if deferred.

Expected decisions:

- `wood`: **implement** using `wood_pile_progressive.glb`,
- `food`: **implement** using bounded discrete representatives,
- `iron`, `coal`, `gold`, `copper_ore`: **defer physical storage visualization** until a real storage destination and semantically correct stored-material visual exist,
- `water`: **defer** until a stored-water container/destination exists.

`resource_rock_1.glb` and `resource_gold_1.glb` are terrain deposit visuals and are explicitly **not** candidates for stored ore/gold presentation.

Do not force every missing resource visual into this implementation. Do not invent storage anchors, reuse mineable deposits as stockpiles, or map water stock onto the well.

If a future plan defines one shared settlement bulk-goods storage destination for ores/minerals, prefer one shared bounded storage-visual mechanism parameterized by resource kind over four independent implementations.

### 6. Performance constraints

Required constraints:

- hard cap visible food representatives per resource/kind,
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

Wood-stage choice is a pure function of quantity. Food representative ordering, offsets and rotations must be stable for the same storage visual.

Prefer predefined local slots. No frame/tick-time randomness.

### 8. Tests

Extend `src/settlement/storageVisuals.test.ts` with pure behavior coverage for:

- wood `0` → no pile variant,
- exact wood boundaries `1`, `2`, `5`, `6`, `10`, `11`, `20`, `21`,
- wood high quantities remain on `Pile_29` plus only bounded overflow if retained,
- exactly one primary `Pile_*` is visible for positive quantities,
- existing aggregate wood quantity semantics remain unchanged,
- food `0` → no representatives,
- food `1` → one representative,
- food `2` → two where capacity allows,
- all food threshold transitions,
- high food quantities remain capped,
- deterministic output for equal input,
- food kind selection remains bounded and deterministic,
- repeated sync/quantity changes preserve pooled object identities.

For the progressive wood asset, stable authored names intentionally become part of the visual contract and may be tested at the controller boundary. Avoid incidental child-index assertions.

## Implementation notes required before coding

Update:

`docs/plans/implementation-notes/settlements-npcs-025-resource-storage-visualization-implementation-notes.md`

The notes should remove asset/code recon from the implementation pass and include:

1. exact symbols and call sites in `storageVisuals.ts`, `props.ts`, settlement construction/update wiring and item-model pipeline,
2. the full `EconomicKind` audit table,
3. the final progressive wood asset path and exact node-name contract,
4. chosen wood thresholds and any overflow rule,
5. exact settlement food container prop and why internal fill is deferred,
6. chosen food representative thresholds/caps,
7. chosen deterministic slot layouts or generation rule,
8. exact files/symbols to modify,
9. explicitly deferred resources and concrete blockers,
10. documentation discrepancies found during the audit.

Where current code gives enough certainty, make the implementation decision in the notes rather than leaving later Claude Code recon.

## Likely files

Verify against current code before editing:

- `src/settlement/storageVisuals.ts`
- `src/settlement/storageVisuals.test.ts`
- `src/settlement/props.ts`
- settlement prop/template loading helper if needed for the new progressive asset
- `docs/plans/implementation-notes/settlements-npcs-025-resource-storage-visualization-implementation-notes.md`

Do not refactor unrelated settlement economy, inventory, resource-deposit or persistence systems.

Add/update JSDoc for important architectural/public functions introduced or materially changed by the implementation, using the existing `@domain` conventions where appropriate so preflight discovery remains useful.

## Verification

Automated verification:

- relevant storage-visual tests,
- current repository TypeScript/test/build checks.

Manual browser verification is performed by the User, not the AI agent. Verify visually:

- `1` wood shows only `Pile_01`,
- wood transitions naturally through `Pile_05`, `Pile_10`, `Pile_18`, `Pile_29`,
- changing wood quantity does not scale, flicker or reposition the primary pile,
- high wood quantities remain bounded,
- 1–2 food items display as 1–2 representatives,
- higher food quantities increase density without giant item scaling,
- food representatives remain on/adjacent to the intended storage prop,
- quantity changes do not cause flicker or reshuffling,
- multiple settlements show no obvious storage-visual performance regression.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
