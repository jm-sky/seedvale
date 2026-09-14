# Implementation notes: settlements-npcs-031 — sustainable seed recovery

**Implemented:** 2026-09-14 · plan: [settlements-npcs-031](../settlements-npcs-031-sustainable-seed-recovery-and-replanting.md)

## Recon vs the plan text

- `settlements-npcs-030` is already on `main`. Aggregate catch-up lives in `src/settlement/settlementAgriculture.ts`; detailed Farmer work is still `planFarmWork()` + `SettlementFoodSourceHooks`.
- `world-023` landed on `main` during this implementation. Species base placement yield is `CropDefinition.yieldCount` (carrot 5, potato 8, cabbage 2). Recovery uses that field as `baseYield`.
- Player and NPC harvest already apply `cultivationYieldCount` only for player-garden plots. Settlement-garden / field crops keep full species yield; recovery then scales from that realized count.
- `isPlantedCropId` already existed for 023 presentation; 031 reuses it as cultivated/planted harvest context.

## Shared contract

- `healthySeedRecovery: 2` on every current `CROP_DEFS` entry.
- `resolveCultivatedSeedRecovery(def, realizedYield)` is the only math. Adapters call `recoveredSeedCountForHarvest(...)` so wild crops, spoiled-item yields, and failed produce stay at 0.
- Planted context is the existing planted-crop id namespace (`isPlantedCropId` / `planted-crop:`), not a new flag on `CropPlacement`.

## Wiring

- Player: `gatheringActions.harvestCrop` computes effective produce + recovered seeds, checks combined inventory room, then commits `harvestCrop` and adds both goods.
- NPC Farmer and hunger crop harvest: `createFoodSourceHooks().harvest()` returns optional `recoveredSeeds`; `planFarmWork` and `NpcAgent.beginRealFoodGathering` add them to `Household.items`. Produce still goes through `depositFood`.
- Aggregate: `completedAgricultureBatches` is O(1) in elapsed days. Healthy recovery (`>= 1` sowing unit back) lifts the seed-count cap so catch-up cannot grow with historical cycles. Net seed change is `batches * (recovered - 1)` against the live inventory — never `remove(batches)` then `add(batches * recovered)`, which would fail when `batches > available`.
- Reserve/surplus (`householdSeedReserveRequirement` / `householdSeedStockCount` / `householdSeedSurplusCount`) is derived from agricultural capacity + real `Household.items`. Not persisted, not a seed market, not wired into `npcTradeAvailability` (full seed trade remains out of scope).

## Persistence

No save-version bump. Authoritative seed stock was already `Household.items` / player `Inventory`. `HouseholdSnapshot.agriculture` is still only the 030 starter marker + catch-up anchor.

## Tests

Focused coverage is in `cropLifecycle.test.ts`, `plantedCrops.test.ts`, `settlementAgriculture.test.ts`, and `npcProfessionWork.test.ts`.
