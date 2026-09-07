# Plan: Resource storage visualization

**Created:** 2026-09-07
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** settlements-npcs-009, settlements-npcs-010
**Domain:** `settlements-npcs`  
**Type:** `feature`  
**Roadmap:** -  

## Goal

Make settlement storage visuals communicate actual stored quantity more naturally while keeping the representation bounded, deterministic and cheap to update.

The current storage visualization already has the correct ownership boundary: authoritative quantities stay in household/settlement storage and `src/settlement/storageVisuals.ts` is presentation-only. This plan should extend that mechanism rather than introduce parallel storage state.

The primary changes are:

1. replace scale-only wood/food quantity cues with bounded visible-item / fill-level cues,
2. audit all `EconomicKind` resources for a suitable storage representation,
3. reuse existing GLBs and procedural fallbacks where practical,
4. keep per-settlement render cost bounded independently of stored quantity.

## Current verified state

### Authoritative resources

`src/economy/kinds.ts` defines:

- `food`
- `water`
- `wood`
- `iron`
- `coal`
- `gold`
- `copper_ore`

Settlement bulk quantities are owned by `SettlementEconomy`; concrete settlement food is owned by `SettlementEconomy.items`. Household wood/food remain household-owned. Storage visuals must derive from these existing owners and must not persist presentation state.

### Storage destinations

`src/settlement/storageDestinations.ts` already resolves physical destinations for the resources currently handled by NPC delivery:

- wood → shared settlement stockpile,
- household food → household home/pantry,
- settlement food → settlement storage crate.

Do not add another destination system as part of this plan.

### Existing storage visualization

`src/settlement/storageVisuals.ts` currently provides bounded presentation for wood and food.

Wood:

- one existing `wood_pile.glb` main pile,
- quantity bands primarily change whole-pile scale,
- overflow creates up to three additional complete pile clones,
- first positive quantity therefore shows the complete authored pile, only reduced in scale.

Food:

- concrete food `ItemKind`s are represented through `createItemMesh(kind)`,
- up to four food kinds are presented around settlement storage,
- quantity is currently communicated mainly by scaling one representative model per displayed kind,
- GLB-backed item models are reused where `ITEM_GLB_SPECS` contains the kind; other item visuals fall back to the existing procedural item mesh.

### Existing resource assets

Existing code already provides a useful resource visual vocabulary:

- wood: `/models/settlement/wood_pile.glb` plus the existing procedural stockpile fallback,
- gold: `/models/nature/resource_gold_1.glb`,
- iron / coal / copper ore: `/models/nature/resource_rock_1.glb` with resource-specific tint,
- ore fallbacks: existing procedural `createRockCluster(...)`,
- food: existing `createItemMesh(kind)` / `ITEM_GLB_SPECS` pipeline,
- water: no verified quantity-storage representation; the well is a source/place, not a stored-water amount.

The ore GLBs are currently used by `src/terrain/resourceDeposits.ts` for deposits, not settlement stock. Reuse their visual language only where it remains semantically clear that a settlement pile is stored material rather than a mineable deposit.

## Scope

### 1. Asset-structure audit

Before changing visual behavior, inspect the actual GLB scene structure for the storage/resource candidates:

- `public/models/settlement/wood_pile.glb`
- `public/models/nature/resource_rock_1.glb`
- `public/models/nature/resource_gold_1.glb`
- any container GLBs actually used for settlement food storage (crate/barrel/storage prop)

Record for each asset:

- node count,
- mesh count,
- whether visually meaningful units are separate child objects/meshes,
- whether parts can be independently toggled through `Object3D.visible`,
- whether the model is effectively one merged mesh,
- whether traversal order/names are stable enough to define deterministic reveal order,
- whether an existing procedural fallback is more suitable for progressive presentation.

Do not assume that "one GLB" means "one mesh" or one draw call.

If an authored pile contains independently useful child parts, prefer reusing those parts over introducing additional asset variants.

### 2. Shared quantity-to-visual policy

Introduce a small reusable presentation policy in or next to `storageVisuals.ts` for bounded quantity visualization.

The policy must derive presentation from authoritative quantity and should expose concepts such as:

- visible representative count,
- fill level / vertical level where relevant,
- optional stage/band for pile-type resources.

Target behavior for discrete visible representatives should be approximately:

| Stored quantity | Visible representatives |
|---:|---:|
| 0 | 0 |
| 1 | 1 |
| 2 | 2 |
| 3–4 | 3 |
| 5–7 | 4–5 |
| 8–12 | 5–6 |
| 13+ | bounded at roughly 6–8 |

Exact thresholds may be adjusted during implementation if the audited asset/container geometry gives a visibly better mapping, but the invariants are:

- 1 stored unit must not look like a full large pile,
- low quantities should be close to one visible object per stored unit,
- visible object count grows sub-linearly at higher quantities,
- render cost stays capped,
- scale remains close to physical/model scale and is not the primary quantity signal.

The mapping must be deterministic and testable as a pure function.

### 3. Wood visualization

Keep the existing authoritative quantity calculation and sync path.

Preferred implementation order after GLB audit:

1. If `wood_pile.glb` contains independently useful logs / pile components:
   - create the pile once,
   - compute/cache the revealable child list during initialization,
   - deterministically reveal parts as quantity rises,
   - do not traverse/re-sort the hierarchy every settlement tick.
2. If the GLB is effectively merged:
   - use the existing model only from a quantity where a full pile is visually justified,
   - use a bounded low-quantity representation from existing log/branch/beam assets or the existing procedural mechanism,
   - avoid creating/removing geometry on every quantity change.

For high quantities, additional complete pile groups may remain as bounded overflow if they still read well after the low/mid-range representation is improved.

The result should visually progress along the lines of:

`single/few logs → small stack → medium stack → full pile → bounded overflow piles`.

Do not create one mesh for every stored wood unit without a hard cap.

### 4. Food visualization

Replace quantity-by-scale as the primary food cue.

For each displayed food kind:

- create a bounded pool of representative item visuals once,
- reuse `createItemMesh(kind)` so existing GLB/procedural item ownership stays intact,
- toggle `visible` according to the shared quantity policy,
- keep item scale near its normal presentation scale,
- use deterministic local offsets/rotations rather than random values during every sync.

Do not allocate or dispose item meshes when food count changes. Create the bounded representative pool when the storage visual is built and only update transforms/visibility afterward.

#### Container behavior

Where food is visually stored inside a crate, barrel or comparable open container:

- only the top visible layer needs representative item models,
- quantity should also raise the visible layer vertically as the notional container fills,
- hidden lower layers do not need to be rendered,
- the highest fill level must remain below/inside the container rim so items do not visibly float above it.

Use a bounded fill curve, e.g. low / quarter / half / three-quarter / near-full rather than a literal item-per-layer stack.

Container geometry must determine the actual min/max Y values; do not hard-code world-space heights before inspecting the current prop hierarchy/bounds.

If the current settlement food prop is not an open container that supports this illusion, keep the bounded top-surface representation for that prop and document whether a different existing crate/barrel asset is a better fit.

### 5. Audit all settlement economic resources

Produce an implementation-note table for every `EconomicKind` with at least:

- authoritative state owner,
- current physical destination if any,
- current storage visualization status,
- existing candidate GLB(s),
- procedural fallback if any,
- asset structure suitability,
- proposed representation type,
- implementation status / blocker.

Expected categories:

- `wood`: loose pile / staged reveal,
- `food`: bounded discrete representatives + container fill level where applicable,
- `iron`: candidate loose ore pile,
- `coal`: candidate loose ore pile,
- `gold`: candidate loose ore pile,
- `copper_ore`: candidate loose ore pile,
- `water`: requires a semantically appropriate stored-water representation; a well must not be treated as quantity storage merely because it already exists.

For ore resources, prefer a shared pile mechanism with different template/tint inputs over four parallel implementations.

Do not automatically implement every missing resource visual in this plan if the audit shows that storage destination/semantics are not yet established. The plan must leave a concrete audited status rather than inventing storage locations.

### 6. Performance constraints

Storage visuals are presentation state and should remain cheap enough to exist for multiple streamed settlements.

Required constraints:

- hard cap visible representatives per resource/kind,
- initialize/cache child lists and local transforms once,
- sync through `visible`, transform and bounded group changes,
- no per-tick GLB loading,
- no per-tick geometry/material cloning,
- no per-tick random layout generation,
- no persistent/save state for visual-only fill/reveal state,
- reuse loaded GLB templates/material-safe clone mechanisms already used by the asset/item pipelines,
- avoid introducing a worker; this work is small presentation bookkeeping and does not justify worker communication overhead.

Separate GLB child meshes can still cause separate draw calls. The goal here is bounded, semantically good representation, not a claim that one GLB is automatically one draw call. If the audited assets contain an excessive number of child meshes, cap or group the subset used for storage presentation rather than revealing the whole hierarchy mechanically.

### 7. Determinism

Any representative slot ordering, offsets and rotations must be deterministic for the same storage visual.

Prefer:

- predefined local slots, or
- one-time seeded placement derived from stable settlement/resource identifiers.

Do not use frame/tick-time randomness.

### 8. Tests

Extend `src/settlement/storageVisuals.test.ts` (or the actual colocated/current tests if structure changed) with pure-behavior coverage for:

- zero quantity → zero visible representatives,
- 1 → one visible representative,
- 2 → two where capacity allows,
- threshold transitions,
- high quantities remain capped,
- fill level is monotonic and clamped,
- deterministic mapping for equal inputs,
- wood overflow cap remains bounded,
- existing aggregate wood quantity semantics remain unchanged,
- food kind selection remains bounded and deterministic.

Avoid brittle tests against incidental Three.js child indices unless the audited authored asset exposes stable names that intentionally become part of the presentation contract.

## Implementation notes required before coding

Create:

`docs/plans/implementation-notes/settlements-npcs-017-resource-storage-visualization-implementation-notes.md`

The notes should eliminate asset/code recon from the implementation pass and include:

1. exact current symbols/call sites in `storageVisuals.ts`, `props.ts`, settlement creation/update wiring and item-model pipeline,
2. the full `EconomicKind` resource audit table,
3. exact GLB node/mesh audit for the candidate assets,
4. which child meshes/objects are safe to reveal independently, if any,
5. exact container prop used for settlement food and its local bounds relevant to fill height,
6. chosen quantity thresholds / representative caps,
7. chosen deterministic slot layouts or generation rule,
8. exact files/symbols to change,
9. any resource explicitly deferred because a real storage destination/container is missing,
10. documentation discrepancies found during the audit.

Where current code provides enough certainty, implementation notes should make the decision rather than leaving it to later recon.

## Likely files

Verify before editing; current expected touch points are:

- `src/settlement/storageVisuals.ts`
- `src/settlement/storageVisuals.test.ts`
- `src/settlement/props.ts`
- `src/settlement/propSpecs.ts` only if an already-present asset needs to be exposed through the existing prop-spec mechanism
- `src/items/itemModels.ts` only if a missing existing food model must be made available through the current item GLB pipeline
- implementation notes under `docs/plans/implementation-notes/`

Do not refactor unrelated settlement economy, inventory, resource-deposit or persistence systems.

## Verification

Automated verification:

- relevant storage-visual tests,
- full TypeScript/test/build checks required by the repository's current workflow.

Manual browser verification is performed by the User, not the AI agent. Verify visually in browser:

- 1–2 wood no longer appears as a complete large pile,
- wood grows naturally through small/medium/full stages,
- 1–2 food items display as 1–2 representatives,
- higher food quantities increase visible density without giant item scaling,
- open-container food appears progressively higher as quantity increases,
- representatives stay inside/on the intended storage prop,
- transitions do not flicker or reshuffle,
- high quantities do not produce unbounded objects,
- multiple settlements do not show obvious storage-visual performance regressions.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
