# Implementation Notes: Resource storage visualization

**Reviewed:** 2026-09-15  
**Plan:** `settlements-npcs-025-resource-storage-visualization.md`

## Review conclusion

The architecture remains sound: authoritative storage quantities stay in `Household` / `SettlementEconomy`; storage visuals remain derived presentation state. Do not add parallel stock ownership or persistence.

Current staged direction:

- **Stage 1** — progressive wood pile — implemented;
- **Stage 1 follow-up** — split settlement wood vs per-household wood destinations/visuals — implemented;
- **Stage 2 + Stage 3A** — **next implementation pass**: pooled discrete food representatives + neutral deterministic local layout;
- **Stage 3B** — separate later pass after an open-container asset is checked in and verified;
- ores/minerals/water deferred until real storage semantics/assets exist.

The next pass is intentionally asset-independent. Dedicated food GLBs are not required because `createItemMesh(kind)` already owns visual creation/fallback.

## Current code contract relevant to the next pass

Primary implementation file:

- `src/settlement/storageVisuals.ts`

Current food mechanism:

- `FOOD_ITEM_KINDS` provides stable catalog order;
- `createItemMesh(kind)` creates the representative mesh/fallback;
- `FOOD_STORAGE_MAX_SLOTS = 4` currently means up to four represented food kinds;
- `selectFoodStorageSlots(items)` currently returns one `{ kind, count, scale }` slot per represented kind;
- `foodUnitScale(count)` currently turns quantity into mesh scale;
- `FOOD_SLOT_OFFSETS` provides four fixed world-anchor offsets;
- `createFoodStorageVisual(group, center, sampleHeight)` owns one food visualization location;
- current `sync()` disposes and recreates selected meshes whenever its kind/scale signature changes.

That quantity-scaling + recreate/dispose behaviour is what Stage 2 replaces. Keep the surrounding ownership and shared household/settlement controller mechanism.

## Resolved design for Stage 2

### Limits

Use two distinct concepts:

```ts
FOOD_STORAGE_MAX_KINDS = 4
FOOD_STORAGE_MAX_REPRESENTATIVES = 8
```

Renaming current `FOOD_STORAGE_MAX_SLOTS` is preferred because after this change a "slot" means a physical representative position, not a selected kind.

### Pure representative budget

Implement a pure helper equivalent to:

```ts
foodRepresentativeCount(totalQuantity: number): number
```

Mapping:

| Total quantity | Representatives |
|---:|---:|
| 0 | 0 |
| 1 | 1 |
| 2 | 2 |
| 3–4 | 3 |
| 5–7 | 4 |
| 8–12 | 5 |
| 13–20 | 6 |
| 21+ | 8 |

Clamp negative/zero totals to 0. The result is always `0..8`.

### Kind selection

Determine positive-count food kinds by iterating `FOOD_ITEM_KINDS` in its existing stable order. Select at most the first four positive kinds.

Do not introduce sorting by quantity, randomness or a second food catalog.

### Deterministic representative allocation

Implement pure allocation equivalent to:

```ts
allocateFoodRepresentatives(
  items: Inventory,
): Array<{ kind: ItemKind; count: number }>
```

`count` here means **visible representatives for the kind**, not stored quantity.

Exact allocation algorithm:

1. calculate total stored quantity across all `FOOD_ITEM_KINDS` for the global representative budget;
2. select at most the first four positive kinds in `FOOD_ITEM_KINDS` order;
3. allocate one representative to each selected kind while budget remains;
4. then iterate selected kinds repeatedly in the same order, adding one representative to a kind when its current visible count is still below its real stored count;
5. stop when the global budget is exhausted or every selected kind is saturated at its stored quantity.

Consequences are deliberate:

- diversity is preserved before duplicates are added;
- low quantities stay close to one representative per unit;
- ties/order are deterministic;
- total visible meshes never exceeds 8;
- no kind visually claims more units than actually exist;
- unselected fifth+ food kinds still contribute to total quantity/budget but do not gain their own visual kind, preserving the existing bounded-kind policy.

Keep this logic independent from Three.js placement and pooling so it can be covered with focused pure tests.

## Resolved design for Stage 3A

Replace four world-anchor offsets with exactly eight deterministic local slots.

Use a small local-slot type equivalent to:

```ts
type FoodStorageLocalSlot = {
  x: number
  y: number
  z: number
  yaw: number
}
```

Important contract:

- exactly `FOOD_STORAGE_MAX_REPRESENTATIVES` slots;
- stable array order = stable representative identity/position order;
- no randomness;
- values describe local offsets/orientation relative to the food-storage anchor;
- do not encode guessed interior dimensions of current `crate.glb`;
- current rendering may still ground/place the anchor through the existing `center` + `sampleHeight` mechanism, then apply slot offsets around/above that anchor;
- Stage 3B should only need to replace/adapt slot geometry/anchor transforms, not allocation or pooling.

Do not add a generic container framework for this.

## FoodStorageVisual pool ownership/lifecycle

Keep one `FoodStorageVisual` instance per physical storage location. Household and settlement storage continue to use the same factory/controller.

Recommended internal ownership:

```text
FoodStorageVisual
  owns per-kind lazy representative arrays
  owns every Object3D it created via createItemMesh(kind)
  assigns visible representatives to stable local slot indices
```

A per-controller structure such as `Map<ItemKind, Object3D[]>` is appropriate. Do not share actual `Object3D` instances between storage locations.

### Materialization

- create representatives lazily only when allocation first needs them;
- use `createItemMesh(kind)` for every materialized object;
- never create more than eight total representatives for one controller;
- one-time bounded creation during a stock increase is acceptable.

### Normal sync

After required pool members exist, `sync(items)` should only need to:

- derive pure allocation;
- determine which cached representatives are visible;
- assign deterministic slot transforms;
- toggle visibility / update transforms when effective representation changed.

Do not dispose/recreate representatives merely because quantity moves between visual bands or decreases.

Preserve a cheap signature/no-op path if useful, but the signature must represent the effective allocation/slot assignment rather than scale.

### Dispose

`dispose()` must remove and `disposeObject3D()` every materialized representative owned by that controller, including currently hidden ones.

## Existing integration to preserve

`SettlementStorageVisuals` remains conceptually:

```ts
type SettlementStorageVisuals = {
  settlementWood: WoodPileVisual
  householdWood: WoodPileVisual[]
  settlementFood: FoodStorageVisual
  householdFood: FoodStorageVisual[]
}
```

`createSettlement.ts` already drives settlement and household food through the same `FoodStorageVisual` mechanism. Do not split household vs settlement renderers.

Wood is out of scope for this pass except preserving tests/behaviour.

## Asset boundary

### Not required for Stage 2/3A

Do not wait for or add dedicated carrot/cabbage/potato/tomato/fish GLBs in this pass. Existing `createItemMesh(kind)` fallback makes them non-blocking.

Do not modify `docs/assets/MODELS.md` merely because those decorative models are still desired.

### Required before Stage 3B

Current `crate.glb` is closed/merged and is not a truthful internal-fill container.

Candidate already identified:

- Fruit Crate — BlenderVoyage / Poly Pizza
- `https://poly.pizza/m/aXulVWHOeV`

Stage 3B remains blocked until a chosen asset is checked into the repository and recon records:

- runtime path;
- hierarchy/root naming where relevant;
- openness;
- origin/orientation;
- bounding box/world scale;
- interior/rim bounds;
- clipping/readability with up to eight representatives.

Do not implement Stage 3B speculatively against guessed dimensions.

## Stage 1 follow-up — implemented contract to preserve

```text
SettlementEconomy.wood
    → landmarks.stockpile
    → storageVisual.settlementWood

Household.stock.wood
    → landmarks.householdWoodStorages[i]
    → storageVisual.householdWood[i]
```

- `SettlementLandmarks.householdWoodStorages` stays index-aligned with homes/households;
- household piles reuse `wood_pile_progressive.glb` + `createWoodPileVisual()`;
- settlement `woodStorage` interaction reads settlement economy wood only;
- household storage interaction reads that household's own stock;
- do not reintroduce `physicalWoodStockpileQuantity()` or one aggregate physical pile.

## EconomicKind audit

| Kind | Authoritative owner | Intended physical destination | Visual | Status |
|---|---|---|---|---|
| `wood` | `Household.stock.wood` / `SettlementEconomy.wood` | `householdWoodStorages[i]` / `landmarks.stockpile` | progressive `wood_pile_progressive.glb` | implemented |
| `food` | `Household.items` / `SettlementEconomy.items` | household storage / settlement storage crate | `createItemMesh(kind)` reps | Stage 2 + 3A next; 3B after asset verification |
| `iron` | `SettlementEconomy` | no verified dedicated destination | none | defer |
| `coal` | `SettlementEconomy` | no verified dedicated destination | none | defer |
| `gold` | `SettlementEconomy` | no verified dedicated destination | terrain gold deposit unsuitable | defer |
| `copper_ore` | `SettlementEconomy` | no verified dedicated destination | terrain deposit unsuitable | defer |
| `water` | household/settlement owners | well is source, not storage | none | defer |

## Expected implementation order

1. Replace ambiguous food constants/types and add `foodRepresentativeCount()` pure helper.
2. Add pure deterministic `allocateFoodRepresentatives()` and focused tests.
3. Define eight neutral local slots and test stable slot count/order/transforms where practical.
4. Refactor `createFoodStorageVisual()` from fixed recreate/dispose slots to per-controller lazy cached pools.
5. Preserve existing household/settlement call sites unless a minimal compatible API adjustment is necessary.
6. Add identity/lifecycle tests proving already-materialized meshes survive ordinary quantity changes.
7. Run focused tests, TypeScript check and relevant repository checks from `CLAUDE.md`.

This order lets failures distinguish pure allocation errors from Three.js lifecycle errors.

## Focused files

Primary expected changes:

- `src/settlement/storageVisuals.ts`
- `src/settlement/storageVisuals.test.ts`

Inspect/touch callers only if required by a small `createFoodStorageVisual()` placement API change. Do not broaden the pass into economy, NPC, persistence or settlement layout refactors.

## Tests worth making explicit

Pure allocation:

- all count-band lower/upper boundaries;
- empty/negative quantity → 0;
- 1 and 2 total units → 1 and 2 reps;
- >20 → exactly 8 max;
- ≤4 selected kinds in `FOOD_ITEM_KINDS` order;
- first pass gives diversity;
- second+ passes are stable round-robin in catalog order;
- a kind never receives more reps than stored units;
- fifth+ positive kind does not become a represented kind;
- fifth+ kind still contributes to the total representative budget.

Controller lifecycle:

- same effective allocation preserves object identity;
- increasing quantity lazily creates only the additional needed reps;
- decreasing quantity hides/reuses rather than disposes;
- increasing again reuses previously hidden objects;
- ≤8 total materialized reps per controller;
- deterministic slot assignment;
- `dispose()` disposes visible and hidden cached objects;
- settlement and household instances remain independent and use the same mechanism.

## Main pitfalls

- Do not make the 8-representative cap per kind.
- Do not interpret the existing four-kind limit as four total representatives.
- Do not retain quantity-driven mesh scaling as the primary quantity signal.
- Do not recreate/dispose all food meshes on ordinary sync.
- Do not randomize layout.
- Do not share mesh instances across storage controllers.
- Do not add new food/container assets during Stage 2/3A.
- Do not implement open-crate fill before the asset is verified.
- Do not use terrain deposits as stored-resource visuals.
- Do not map stored water to the well.
- Do not alter authoritative stock ownership.
- No worker.

## JSDoc/preflight

Add or update concise JSDoc on the important pure allocation helper(s) and `FoodStorageVisual` lifecycle/ownership contract when needed. Use `@domain settlements-npcs` on important architectural/public symbols where appropriate so preflight can find the mechanism without broad recon.
