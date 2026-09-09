# Implementation Notes: Resource storage visualization

**Reviewed:** 2026-09-09  
**Plan:** `settlements-npcs-025-resource-storage-visualization.md`

## Review conclusion

The architecture remains sound: authoritative storage quantities stay in `Household` / `SettlementEconomy`; storage visuals remain derived presentation state. Do not add parallel stock ownership or persistence.

Current staged direction:

- **Stage 1** — progressive wood pile — implemented;
- **Stage 1 follow-up** — split settlement wood vs per-household wood destinations/visuals — **implemented**;
- **Stage 2** — pooled food representatives;
- **Stage 3A** — container-ready deterministic food layout;
- **Stage 3B** — open-container fill after asset verification;
- ores/minerals/water deferred until real storage semantics/assets exist.

## Stage 1 follow-up — implemented contract

### Physical model

```text
SettlementEconomy.wood
    → landmarks.stockpile
    → storageVisual.settlementWood

Household.stock.wood
    → landmarks.householdWoodStorages[i]
    → storageVisual.householdWood[i]
```

### Landmarks and placement

- `SettlementLandmarks.householdWoodStorages: THREE.Vector3[]` — same index space as `homes`, `houses`, `householdStorages`, `households`.
- Yard slot: `HOUSEHOLD_YARD_PROP_OFFSETS.wood = 1.55` (between trough and storage crate).
- Built in `props.ts` via existing `houseYardPlacements()`; household piles use `wood_pile_progressive.glb` + `createWoodPileVisual()` with **primary stage only** (no overflow clones in household yards).

### Storage visual controllers

```ts
type SettlementStorageVisuals = {
  settlementWood: WoodPileVisual
  householdWood: WoodPileVisual[]
  settlementFood: FoodStorageVisual
  householdFood: FoodStorageVisual[]
}
```

`createSettlement.ts::update()` drives:

```text
storageVisual.settlementWood.sync(economy.query('wood'))
storageVisual.householdWood[i].sync(households[i].stock.query('wood'))
```

### Destination resolver

- `settlementStorageDestination('wood', ...)` → `landmarks.stockpile` (unchanged).
- `householdStorageDestination(kind, foodDestination, woodDestination)` — explicit food and wood points; wood no longer aliases settlement stockpile.
- `resolveHouseholdWoodStorage(home, landmarks)` — index-aligned lookup used by `NpcAgent` chop/deposit and `npcProfessionWork` food deposit.

### Inspection/interactions

- Settlement `woodStorage` interactable reports `economy.query('wood')` only.
- Household `householdStorage` interactable already reports that household's own wood via live `Household` reference.
- No per-household wood-pile interactable added — household storage interaction is sufficient.

### Removed

- `physicalWoodStockpileQuantity()` — no aggregate single-pile helper remains.

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
| `wood` | `Household.stock.wood` / `SettlementEconomy.wood` | `householdWoodStorages[i]` / `landmarks.stockpile` | progressive `wood_pile_progressive.glb` | **Stage 1 + follow-up implemented** |
| `food` | `Household.items` / `SettlementEconomy.items` | household storage/home semantics / settlement storage crate | `createItemMesh(kind)` reps | **Stage 2 + 3A; 3B after asset verification** |
| `iron` | `SettlementEconomy` | no verified dedicated destination | none | **Defer** |
| `coal` | `SettlementEconomy` | no verified dedicated destination | none | **Defer** |
| `gold` | `SettlementEconomy` | no verified dedicated destination | terrain gold deposit unsuitable | **Defer** |
| `copper_ore` | `SettlementEconomy` | no verified dedicated destination | terrain deposit unsuitable | **Defer** |
| `water` | household/settlement owners | well is source, not storage | none | **Defer** |

## Main pitfalls

- Do not reintroduce one aggregate settlement wood pile.
- Do not duplicate progressive wood mapping for household piles.
- Do not recompute household wood offsets independently in delivery/interaction code — use `landmarks.householdWoodStorages`.
- Do not overlap household wood pile with the crate or other yard props.
- Do not change household vs settlement stock ownership.
- Do not broaden into food Stage 2 while working on wood.
- Do not create a new generic storage-place framework.
- Do not make food's 8-representative cap per kind.
- Do not use terrain deposits as stored-resource visuals.
- Do not map stored water to the well.
- No per-sync random layout, model loading or object churn.

## Files touched (Stage 1 follow-up)

- `src/settlement/householdYard.ts` — `HOUSEHOLD_YARD_PROP_OFFSETS.wood`
- `src/settlement/props.ts` — `householdWoodStorages`, household pile build, `SettlementStorageVisuals` shape
- `src/settlement/storageDestinations.ts` — explicit household wood destination + `resolveHouseholdWoodStorage()`
- `src/settlement/storageVisuals.ts` — removed aggregate helper
- `src/settlement/createSettlement.ts` — per-owner visual sync
- `src/ai/NpcAgent.ts` — household wood deposit destination
- `src/ai/npcProfessionWork.ts` — updated destination call signature
- `src/interaction/Interactable.ts`, `resolveInteraction.ts`, `src/app/interactables.ts` — settlement-only wood inspection
- focused tests in `storageVisuals.test.ts`, `storageDestinations.test.ts`, `householdYard.test.ts`, `places.test.ts`
