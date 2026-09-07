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

1. replace scale-only quantity cues for wood/food with bounded visible-item / fill-level cues,
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

Existing reusable resource visuals include:

- wood: `/models/settlement/wood_pile.glb` plus existing procedural stockpile fallback,
- gold: `/models/nature/resource_gold_1.glb`,
- iron / coal / copper ore: `/models/nature/resource_rock_1.glb` with resource-specific tint,
- ore fallback: existing procedural `createRockCluster(...)`,
- food: existing `createItemMesh(kind)` / `ITEM_GLB_SPECS` pipeline,
- water: no verified quantity-storage representation; the well is a source/place, not stored-water quantity.

The ore GLBs are currently used by `src/terrain/resourceDeposits.ts` for deposits, not settlement stock. Reuse their visual language only if the storage result remains semantically distinct from a mineable world deposit.

## Scope

### 1. Asset-structure audit before implementation

Inspect the actual GLB scene structure for:

- `public/models/settlement/wood_pile.glb`
- `public/models/nature/resource_rock_1.glb`
- `public/models/nature/resource_gold_1.glb`
- the actual crate/barrel/storage GLB used by settlement food storage

For each candidate record in implementation notes:

- node count,
- mesh count,
- whether visually meaningful units are separate child objects/meshes,
- whether parts can be independently toggled through `Object3D.visible`,
- whether the model is effectively one merged mesh,
- whether object names/order are stable enough for deterministic reveal,
- whether a procedural fallback is better suited to progressive presentation.

Do not assume that one GLB means one mesh or one draw call.

If an authored pile contains independently useful child parts, prefer reusing and revealing those parts over adding multiple new asset variants.

### 2. Shared quantity-to-visual policy

Add a small reusable, pure presentation mapping in or next to `storageVisuals.ts` for bounded quantity visualization.

It should derive concepts such as:

- visible representative count,
- fill level / vertical level where relevant,
- optional pile stage/band.

Target mapping for discrete representatives:

| Stored quantity | Visible representatives |
|---:|---:|
| 0 | 0 |
| 1 | 1 |
| 2 | 2 |
| 3–4 | 3 |
| 5–7 | 4–5 |
| 8–12 | 5–6 |
| 13+ | bounded at roughly 6–8 |

Exact thresholds may be tuned after inspecting real asset/container geometry, but preserve these invariants:

- one stored unit must not read as a full pile/container,
- low quantities stay close to one visible representative per unit,
- visible count grows sub-linearly at higher quantities,
- render cost stays capped,
- object scale stays near physical/model scale and is not the primary quantity signal,
- mapping is deterministic and directly unit-testable.

### 3. Wood visualization

Keep the existing authoritative aggregate wood quantity calculation and existing sync integration.

Preferred implementation after GLB audit:

1. If `wood_pile.glb` exposes independently useful logs/pile components:
   - create/clone the authored pile once,
   - build/cache the revealable child list during initialization,
   - deterministically reveal more parts as quantity rises,
   - do not traverse/sort the hierarchy every settlement update.
2. If `wood_pile.glb` is effectively merged:
   - use it only once quantity visually justifies a full pile,
   - represent low quantities with existing suitable log/branch/beam/procedural assets,
   - create a bounded pool once rather than allocate/dispose geometry when quantity changes.

Desired progression:

`single/few logs → small stack → medium stack → full pile → bounded overflow piles`.

High-quantity overflow may retain the existing bounded extra-pile concept if it still reads naturally after low/mid-range correction.

### 4. Food visualization

Replace scale-only quantity cues with bounded discrete representatives.

For each displayed food kind:

- use `createItemMesh(kind)` so the existing GLB/procedural item pipeline remains authoritative,
- create a bounded representative pool once,
- toggle `visible` based on the shared quantity mapping,
- keep item scale near its normal model scale,
- use deterministic local positions/rotations,
- do not allocate/dispose item meshes on quantity changes.

#### Container fill behavior

If the active settlement storage prop is an open crate, barrel or comparable container:

- only render the visible top layer of stored items,
- encode increasing quantity both through visible representative count and the Y position of that top layer,
- do not render hidden lower layers,
- clamp the highest fill level below/inside the rim,
- derive min/max local Y from the real container geometry/bounds, not guessed world-space constants.

Use a bounded fill curve such as:

`low → quarter → half → three-quarter → near-full`.

If the current food prop is not suitable for this illusion, keep bounded top-surface representatives and document whether an existing crate/barrel asset is a better replacement.

### 5. Audit all settlement resources

Implementation notes must include one table covering every `EconomicKind` with:

- authoritative owner,
- current physical storage/delivery destination if any,
- current visualization status,
- existing candidate GLB(s),
- procedural fallback if any,
- GLB structure suitability,
- proposed representation type,
- implementation/defer status and blocker if deferred.

Expected representation classes:

- `wood`: staged loose pile,
- `food`: bounded discrete representatives + fill level where container supports it,
- `iron`: candidate loose ore pile,
- `coal`: candidate loose ore pile,
- `gold`: candidate loose ore pile,
- `copper_ore`: candidate loose ore pile,
- `water`: requires a semantically correct stored-water representation; do not treat the existing well as stored quantity.

For ores, prefer one shared pile/reveal mechanism parameterized by template/tint over four independent implementations.

Do not force every missing resource visual into this implementation if the audit shows that no real physical storage destination/container exists yet. In that case, record the precise blocker and defer only that resource rather than inventing storage semantics.

### 6. Performance constraints

Required constraints:

- hard cap visible representatives per resource/kind,
- initialize/cache child lists and representative transforms once,
- update only `visible` and bounded transforms during sync,
- no per-tick GLB loading,
- no per-tick geometry/material cloning,
- no per-tick random layout generation,
- no visual-only persistence,
- reuse existing GLB template/clone pipelines,
- no worker: this is small presentation bookkeeping and worker communication would be unjustified.

Separate GLB child meshes may still produce separate draw calls. If an audited model contains too many child meshes, reveal only a bounded useful subset or choose a more appropriate representation instead of mechanically exposing the whole hierarchy.

### 7. Determinism

Representative ordering, offsets and rotations must be stable for the same storage visual.

Prefer predefined local slots or one-time seeded placement from stable settlement/resource identity. Never use frame/tick-time randomness.

### 8. Tests

Extend the current storage-visual tests, expected at `src/settlement/storageVisuals.test.ts`, with pure behavior coverage for:

- `0` quantity → no representatives,
- `1` → one representative,
- `2` → two where capacity allows,
- all threshold transitions,
- high quantities remain capped,
- fill level is monotonic and clamped,
- deterministic output for equal input,
- wood overflow remains bounded,
- existing aggregate wood quantity semantics remain unchanged,
- food kind selection remains bounded and deterministic.

Avoid brittle tests against incidental Three.js child indices unless the asset audit establishes stable authored names that intentionally become part of the visual contract.

## Implementation notes required before coding

Create:

`docs/plans/implementation-notes/settlements-npcs-025-resource-storage-visualization-implementation-notes.md`

The notes should remove asset/code recon from the implementation pass and include:

1. exact symbols and call sites in `storageVisuals.ts`, `props.ts`, settlement construction/update wiring and item-model pipeline,
2. the full `EconomicKind` audit table,
3. exact GLB node/mesh audit for candidate assets,
4. which child objects are safe to reveal independently, if any,
5. exact settlement food container prop and local bounds relevant to fill height,
6. chosen quantity thresholds and caps,
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
- `src/settlement/propSpecs.ts` only if an already-present asset needs exposure through the current prop-spec mechanism
- `src/items/itemModels.ts` only if an existing food asset must be exposed through the current item GLB pipeline
- `docs/plans/implementation-notes/settlements-npcs-025-resource-storage-visualization-implementation-notes.md`

Do not refactor unrelated settlement economy, inventory, resource-deposit or persistence systems.

Add/update JSDoc for important architectural/public functions introduced or materially changed by the implementation, using the existing `@domain` conventions where appropriate so preflight discovery remains useful.

## Verification

Automated verification:

- relevant storage-visual tests,
- current repository TypeScript/test/build checks.

Manual browser verification is performed by the User, not the AI agent. Verify visually:

- 1–2 wood no longer appears as a complete large pile,
- wood progresses naturally through small/medium/full stages,
- 1–2 food items display as 1–2 representatives,
- higher food quantities increase density without giant item scaling,
- open-container food rises as the notional fill level increases,
- representatives remain inside/on the intended storage prop,
- quantity changes do not cause flicker or reshuffling,
- high quantities do not create unbounded objects,
- multiple settlements show no obvious storage-visual performance regression.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
