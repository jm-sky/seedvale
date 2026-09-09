# Implementation Notes: Resource storage visualization

**Reviewed:** 2026-09-09  
**Plan:** `settlements-npcs-025-resource-storage-visualization.md`

## Review conclusion

The architecture remains sound: authoritative storage quantities stay in `Household` / `SettlementEconomy`; storage visuals remain derived presentation state. Do not add parallel stock ownership or persistence.

Current staged direction:

- **Stage 1** — progressive wood pile — implemented;
- **Stage 1 follow-up** — split settlement wood vs per-household wood destinations/visuals — next correction;
- **Stage 2** — pooled food representatives;
- **Stage 3A** — container-ready deterministic food layout;
- **Stage 3B** — open-container fill after asset verification;
- ores/minerals/water deferred until real storage semantics/assets exist.

## Focused recon — Stage 1 follow-up

Current `main` after Stage 1 confirms the progressive visual itself is good, but it is still wired to an older shared-stockpile assumption.

### Current wood visual seam

`src/settlement/storageVisuals.ts` now contains:

- `WOOD_PILE_STAGES = ['Pile_01', 'Pile_05', 'Pile_10', 'Pile_18', 'Pile_29']`;
- `woodPileStage(quantity)`;
- bounded `woodPileOverflowCount(quantity)`;
- `findWoodPileStageNodes(root)` resolving named nodes once;
- `createWoodPileVisual(mainPile, extraPiles)` toggling cached visibility without quantity scaling.

Keep this mechanism. Do not rewrite the progressive renderer.

### Current incorrect physical assumption

`physicalWoodStockpileQuantity(households, economy)` currently returns:

`Σ household.stock.query('wood') + economy.query('wood')`

and `createSettlement.ts::update()` feeds that total to one `storageVisual.wood.sync(...)`.

This matches old plan assumptions but no longer matches the desired physical world model.

### Current destination semantics

`src/settlement/storageDestinations.ts` currently resolves:

- `householdStorageDestination('wood', home, stockpile)` → shared settlement `stockpile`;
- `settlementStorageDestination('wood', stockpile, settlementStorage)` → settlement `stockpile`.

`NpcAgent.ts` chop → deposit uses `householdStorageDestination('wood', this.home, this.landmarks.stockpile)`, so NPCs really walk household-owned wood to the settlement pile.

Therefore changing visuals alone would be incorrect. The delivery destination must change in the same follow-up.

### Existing household placement seam

No new general landmark/place system is needed.

Existing code already provides:

- `HOUSEHOLD_YARD_PROP_OFFSETS` in `src/settlement/householdYard.ts`;
- `houseYardPlacements(...)` in `props.ts`;
- `landmarks.householdStorages`, deterministic and index-aligned with homes/houses;
- `createSettlement.ts` already zips households with household storage positions using the same family/home indexing.

The new household wood position should extend this existing yard mechanism.

Do **not** put the wood pile directly on the existing household crate point. Add a separate deterministic yard slot/offset and expose its world position explicitly so visual, delivery and interaction use the same point.

### Yard-space guardrail

Current `HOUSEHOLD_YARD_PROP_OFFSETS.storage = 1.9` is the outermost common yard prop and therefore drives `householdYardRadius()`.

If the new household wood slot sits farther out, update the yard-clearance contract and tests. It must remain clear of:

- house footprint;
- household crate;
- barrel;
- trough;
- blacksmith anvil/workbench for blacksmith households;
- immediate access paths.

Reuse existing yard geometry and deterministic jitter/angle conventions rather than introducing an independent placement algorithm.

## Stage 1 follow-up — implementation contract

### Desired physical model

```text
SettlementEconomy.wood
    → landmarks.stockpile
    → settlement progressive wood pile

Household.stock.wood
    → household-owned yard wood position
    → household progressive wood pile
```

### Ownership

Do not change stock owners:

- household wood remains `Household.stock.wood`;
- settlement wood remains `SettlementEconomy.wood`.

This follow-up changes physical destination/presentation only.

### Landmarks

Add a dedicated per-household wood-storage landmark array, conceptually:

```ts
householdWoodStorages: THREE.Vector3[]
```

Exact naming may follow current conventions, but requirements are fixed:

- deterministic;
- same index space/order as `homes`, `houses`, `householdStorages`, `households`;
- computed once during prop build from existing yard-placement helpers;
- used by delivery, visuals and interactions rather than recomputing offsets elsewhere.

### Storage visual controller shape

Evolve `SettlementStorageVisuals` from:

```ts
wood: WoodPileVisual
settlementFood: FoodStorageVisual
householdFood: FoodStorageVisual[]
```

toward:

```ts
settlementWood: WoodPileVisual
householdWood: WoodPileVisual[]
settlementFood: FoodStorageVisual
householdFood: FoodStorageVisual[]
```

Reuse `createWoodPileVisual()` for every pile. Do not duplicate stage mapping or GLB traversal logic.

### Update wiring

Replace aggregate visual driving with separate sources:

```text
storageVisual.settlementWood.sync(economy.query('wood'))

for each household i:
    storageVisual.householdWood[i].sync(
        households[i].stock.query('wood')
    )
```

Changing one household's wood must not change another household's pile or the settlement pile.

### Destination resolver

Keep `settlementStorageDestination('wood', ...)` pointing at `landmarks.stockpile`.

Change household-scope wood resolution to the dedicated household wood point. The current helper signature may need to evolve from `(kind, home, stockpile)` so the real household storage points are explicit rather than abusing `home` or settlement `stockpile` parameters.

Prefer a signature that makes misuse difficult. Do not hide the new destination behind implicit recomputation.

### NPC delivery

Update household wood chop/deposit call sites, especially `NpcAgent.ts`, to use the owning household's wood landmark.

The destination change must remain aligned with the stock mutation: successful household deposit still credits that household's `stock.wood`.

Do not broaden this into NPC strategy/needs refactoring.

### Inspection/interactions

Current settlement wood-storage inspection is based on `physicalWoodStockpileQuantity(...)` and therefore reports the aggregate household + economy total.

After the split:

- settlement pile interaction must report `SettlementEconomy.wood` only;
- household storage interaction already has a live `Household` reference and can report that household's own wood;
- add a dedicated household wood-pile interactable only if needed for discoverability, reusing the same `Household` reference and quantity owner.

`physicalWoodStockpileQuantity()` no longer represents a single physical pile. Remove it if no aggregate caller remains. If a true total helper is still useful elsewhere, rename/re-scope it so it cannot be mistaken for settlement-pile quantity.

### Overflow

The existing bounded overflow policy may be reused for settlement and household piles, but do not let per-household high-stock presentation explode object count.

Keep:

- maximum 3 extras;
- cached objects;
- no per-sync creation/disposal;
- `Pile_29` as the primary stage for 21+.

If household-yard space makes overflow visually unsafe, it is acceptable for the follow-up to use the primary progressive stage only for household piles and keep overflow only for the settlement pile. Prefer spatial correctness over forcing identical overflow presentation everywhere.

## Stage 1 follow-up tests

Update focused tests to cover:

### Destinations

- settlement wood resolves to settlement `landmarks.stockpile`;
- household wood resolves to household-specific wood storage position;
- household food behavior stays unchanged;
- settlement food behavior stays unchanged.

### Visual isolation

- settlement pile reads only `SettlementEconomy.wood`;
- household pile A reads only household A wood;
- household pile B reads only household B wood;
- changing A does not change B;
- changing A does not change settlement pile;
- changing settlement economy wood does not change household piles.

### Placement

- household wood landmarks are deterministic;
- count/order matches household/home ordering;
- new slot respects yard clearance;
- blacksmith-yard collision/spacing tests remain valid or are updated for the extra slot.

### Controller behavior

Existing Stage 1 mapping remains covered:

- boundaries `0,1,2,5,6,10,11,20,21`;
- positive quantity selects exactly one primary `Pile_*`;
- stable object identity across sync;
- overflow bounded where enabled.

Remove/replace tests asserting one aggregate physical wood pile.

## Focused files for Stage 1 follow-up

Expected implementation surface:

- `src/settlement/storageDestinations.ts`
- `src/settlement/storageDestinations.test.ts`
- `src/settlement/storageVisuals.ts`
- `src/settlement/storageVisuals.test.ts`
- `src/settlement/props.ts`
- `src/settlement/householdYard.ts`
- `src/settlement/householdYard.test.ts`
- `src/settlement/createSettlement.ts`
- `src/ai/NpcAgent.ts`
- focused NPC delivery tests/callers
- `src/interaction/Interactable.ts`, `src/interaction/resolveInteraction.ts`, `src/app/interactables.ts` only as required to remove the old aggregate settlement-pile inspection semantics.

Avoid unrelated economy, persistence, AI-decision, settlement-generation or rendering refactors.

## Stage 2 — pooled food representatives

Stage 2 remains implementation-ready after its earlier recon.

Keep:

- `FOOD_ITEM_KINDS` derived from shared item categories;
- `createItemMesh(kind)` as item visual factory/fallback;
- one shared `createFoodStorageVisual()` mechanism;
- `FOOD_STORAGE_MAX_SLOTS = 4` as bounded visible kind selection unless renaming improves clarity.

Starting representative-count policy:

| Quantity | Visible representatives |
|---:|---:|
| 0 | 0 |
| 1 | 1 |
| 2 | 2 |
| 3–4 | 3 |
| 5–7 | 4 |
| 8–12 | 5 |
| 13–20 | 6 |
| 21+ | 8 max |

**8 is a global visible cap per storage location, not per food kind.**

Use deterministic allocation among selected kinds, preserve kind diversity when budget allows, and use stable catalog order for ties.

Prefer lazy cached pools. Normal `sync()` should not dispose/recreate already-materialized representatives. One-time bounded lazy materialization for a newly seen kind is acceptable.

## Stage 3A — container-ready food layout

Keep quantity allocation separate from placement:

`selected reps → deterministic local slots`

Slots should be local/container-relative, e.g. `{ x, y, z, yaw }`, with no guessed closed-crate interior baked into quantity logic.

## Stage 3B — open-container fill

Current `crate.glb` is closed/merged and unsuitable for truthful internal fill.

Candidate:

- Fruit Crate — BlenderVoyage / Poly Pizza
- `https://poly.pizza/m/aXulVWHOeV`
- low-poly, GLTF/FBX, CC0/public-domain listing

Before implementation verify checked-in runtime file path, actual openness, origin/orientation, bounding box, intended world scale, usable interior/rim bounds and content clipping.

If unsuitable, keep Stage 3B deferred.

## EconomicKind audit

| Kind | Authoritative owner | Intended physical destination | Visual | Status |
|---|---|---|---|---|
| `wood` | `Household.stock.wood` / `SettlementEconomy.wood` | separate per-household yard wood point / settlement `landmarks.stockpile` | progressive `wood_pile_progressive.glb` | **Stage 1 implemented; split follow-up next** |
| `food` | `Household.items` / `SettlementEconomy.items` | household storage/home semantics / settlement storage crate | `createItemMesh(kind)` reps | **Stage 2 + 3A; 3B after asset verification** |
| `iron` | `SettlementEconomy` | no verified dedicated destination | none | **Defer** |
| `coal` | `SettlementEconomy` | no verified dedicated destination | none | **Defer** |
| `gold` | `SettlementEconomy` | no verified dedicated destination | terrain gold deposit unsuitable | **Defer** |
| `copper_ore` | `SettlementEconomy` | no verified dedicated destination | terrain deposit unsuitable | **Defer** |
| `water` | household/settlement owners | well is source, not storage | none | **Defer** |

## Main pitfalls

- Do not keep one aggregate settlement wood pile after this follow-up.
- Do not change only visuals while NPCs still deliver household wood to settlement stockpile.
- Do not duplicate progressive wood mapping for household piles.
- Do not recompute household wood offsets independently in delivery/interaction code; expose one landmark.
- Do not overlap household wood pile with the crate or other yard props.
- Do not forget yard-clearance tests if the new slot extends radius.
- Do not change household vs settlement stock ownership.
- Do not broaden the wood correction into food Stage 2.
- Do not create a new generic storage-place framework.
- Do not make food's 8-representative cap per kind.
- Do not use terrain deposits as stored-resource visuals.
- Do not map stored water to the well.
- No per-sync random layout, model loading or object churn.

## Documentation discrepancy / clarification

The earlier docs stated that all household and settlement wood physically belongs at one shared village stockpile and that `physicalWoodStockpileQuantity()` should remain unchanged. That statement reflected the then-current implementation, but is now intentionally superseded.

The desired physical model is separate ownership **and** separate physical representation:

- settlement wood → settlement pile;
- household wood → that household's pile.

The current code must therefore be corrected across destination, visual, update and inspection seams together.

> **Zrób git commit i push do main, rebase jeżeli trzeba**