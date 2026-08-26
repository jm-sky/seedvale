# Implementation notes — settlements-npcs-003: Hunter Arrow Production

**Plan:** [settlements-npcs-003-hunter-arrow-production.md](../settlements-npcs-003-hunter-arrow-production.md)
**Implemented:** 2026-08-26

## 1. What changed

Plan 178's `beginArrowCrafting()` consumed the household's abstract `wood` `EconomicKind` and minted a fixed 4 arrows. That never matched plan 187, which split `branch`/`beam` out as real `ItemKind`s. This plan replaces that ad-hoc consumption with a real recipe, reusing the existing `ProductionDef` shape instead of adding a Hunter-only mechanism.

- `economy/production.ts` — `ProductionDef` gained optional `itemInputs?: readonly ItemAmount[]` / `itemOutputs?: readonly ItemAmount[]`, for recipes whose materials/products are plain `Inventory` items rather than settlement `EconomicKind` stock (`branch`/`beam`/`arrow` are not, and must not become, `EconomicKind`s — see plan §5). Added two recipes, `ARROWS_FROM_BRANCH_PRODUCTION` (`1 branch → 1 arrow`) and `ARROWS_FROM_BEAM_PRODUCTION` (`1 beam → 8 arrows`), plus `HUNTER_ARROW_PRODUCTIONS` (branch-first priority order) and a generic `produceFirstAvailableItemRecipe(inventory, defs)` that applies the first recipe whose item inputs are available — not hunter-specific, so a future item with more than one viable material can reuse it directly.
- `items/Inventory.ts` — added `ItemAmount` (the `Inventory` counterpart of `economy/stock.ts`'s `StockAmount`) and `Inventory.applyRecipe(inputs, outputs)`, mirroring `EconomicStock.applyRecipe`'s all-or-nothing shape: false and unchanged when any input is short, otherwise every input removed and every output added atomically.
- `economy/npcWork.ts` — added `commitHunterArrowProduction(household)`, a thin adapter (same shape as `commitRoleWork`) from `NpcAgent`'s work completion to the recipe mechanism above.
- `ai/NpcAgent.ts` — `beginArrowCrafting()` now only gates on `HUNTER_ARROW_STOCK_CAP` (start threshold, unchanged constant/value) and material presence (`branch` or `beam`), then calls `commitHunterArrowProduction` from the `work` action's `onComplete`. It holds no recipe details anymore. Removed the now-unused `ARROW_CRAFT_WOOD_COST` / `ARROW_CRAFT_YIELD` constants.
- Hunter is **not** added to `production.ts`'s `BY_ROLE`/`productionForRole` map — it needs branch-before-beam alternative recipes, not one fixed recipe, so it keeps the existing special-cased dispatch in `beginIdle` (`this.role === 'hunter' && this.beginArrowCrafting()`), the same pattern already used for `miner`/`beginOreGathering`.

## 2. Design decisions

- **Cap stays a start threshold, not a hard output cap** (plan §7): `beginArrowCrafting` only checks the cap before starting the work action; the recipe itself can push the stock above it in one shot (`9/24` + beam → `17/24`). Nothing clamps the recipe's output.
- **No `arrow` in `EconomicKind`** (plan §5): recipes run entirely against `Household.items` (an `Inventory`), never `SettlementEconomy`/`EconomicStock`.
- **Deterministic priority, no randomness** (plan §9): `HUNTER_ARROW_PRODUCTIONS` is a fixed array tried in order; `produceFirstAvailableItemRecipe` has no random selection.
- **No new abstraction for "item capability"**: plan 184's `ItemCapability` model (`hasItemCapability`/`CAPABILITY_KINDS`) is for *can this item perform operation X* (holdable tools), not for production recipes — it has no existing concept of consuming/producing item quantities, so extending `ProductionDef` with `itemInputs`/`itemOutputs` (mirroring `EconomicStock.applyRecipe`, already the established recipe shape) was the smaller, more consistent change than bending plan 184's capability model to a job it wasn't designed for.
- **Supplying `branch`/`beam` to a household is out of scope.** No NPC role currently deposits `branch`/`beam` into `Household.items` (woodcutter's chop→deposit only ever fed the abstract `wood` `EconomicKind`, unchanged by this plan) — the plan's DoD and browser-verification steps assume the tester supplies the household's `branch`/`beam` directly (e.g. via debug tooling), same as the plan text implies ("Zapewnić gospodarstwu gałęzie"/"belkę"). Wiring an automatic branch/beam supply chain into a household was not requested by this plan and is not part of its Definition of Done.

## 3. Verification

- **Implemented:** all of the above.
- **Technically verified:** `npx tsc --noEmit` ✅ · `pnpm run lint:fix` ✅ · `pnpm run build` (vue-tsc + vite) ✅ · `pnpm run test` ✅ (204 files / 1916 tests, including new `economy/production.test.ts` and additions to `economy/npcWork.test.ts` / `items/Inventory.test.ts`).
- **Browser/manual verified:** ❌ not done — the user will verify manually per the plan's §14 scenario (branch priority, beam fallback, cap-exceeding recipe, ranged-combat consumption/resupply).
