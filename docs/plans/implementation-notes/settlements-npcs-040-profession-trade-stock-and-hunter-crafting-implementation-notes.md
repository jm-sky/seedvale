# Implementation Notes: settlements-npcs-040 — Profession Trade Stock and Hunter Crafting

**Plan:** `docs/plans/settlements-npcs-040-profession-trade-stock-and-hunter-crafting.md`  
**Reviewed:** 2026-09-16  
**Status:** `planned` 📋  
**Source of truth:** current `main` code + docs.

## Key implementation seams

### Household bootstrap ownership

Use the existing first-construction household bootstrap, not a new shop-stock registry.

Relevant code:

- `src/settlement/household.ts`
  - `HouseholdStartingContext`
  - `createHousehold(...)`
  - `HouseholdSnapshot.items`
- `src/settlement/settlementAgriculture.ts`
  - `householdStartingContextFromFamily()`

Current behavior already seeds profession-derived goods (`Hunter` bandages, Farmer seeds). Extend that seam to carry deterministic profession coverage needed by this plan.

Starter specialist goods must be inserted into `Household.items` only on genuine first construction. Snapshot restore, stream-in, `WorldBundle` rebuild and save/load must reuse persisted inventory and never infer/reseed stock from the current profession again.

If extending `HouseholdStartingContext` makes `householdStartingContextFromFamily()` too narrowly named, rename only that helper and its direct call sites; avoid broader agriculture refactors.

## Starter specialist stock policy

Keep the policy declarative and bounded. A small dedicated resolver/module beside household bootstrap is preferable to scattering `if (hasHunter)` / `if (hasWoodcutter)` additions through `createHousehold()`.

Recommended inputs are profession counts/coverage from the existing family definition, not NPC runtime instances.

V1 stock to support:

- Hunter household:
  - `arrow`
  - `short_bow` and/or `hunting_bow`
  - `dried_meat`
  - `herb`
  - temporary leather-goods bootstrap: `waterskin_small`, `backpack`, `leather_pauldron`, `leather_armor`; optionally `saddlebags` if acquisition semantics remain compatible
- Woodcutter household:
  - maximum 2 trade `axe` instances
- Farmer household:
  - `pitchfork`
  - `sickle`
- Blacksmith household:
  - one deterministic baseline sword (`short_sword` or `long_sword`)
  - small bounded metal-pauldron stock (`knight_pauldron_round` / `knight_pauldron_spike`)

Do not create a `leatherworker` role in this plan. Leather goods are a temporary household bootstrap until a real profession/production chain exists.

## Personal loadout is separate from trade stock

`src/ai/npcLoadout.ts` is already the authoritative protection boundary:

- Woodcutter default weapon: `axe`
- Hunter default weapon: `hunting_bow`
- Guard: `long_sword`
- Farmer falls back to `knife`
- `isNpcLoadoutBelonging(kind, role)` protects personal equipment

Do not seed trade stock into `personalInventory`. The Woodcutter's personal axe and Hunter's personal bow remain independent from same-kind trade stock in `Household.items`.

Do not change `defaultWeaponForRole()` to implement merchant availability.

## Instance-backed goods

This plan introduces household-owned weapons/armor as ordinary NPC trade goods, so instance handling is important.

Relevant code:

- `src/items/itemInstances.ts`
  - `isInstanceBackedKind()`
- `src/items/trade.ts`
  - `settleOwnedGoodsPurchase()` already transfers real instances from the source inventory rather than minting replacements
- `src/ai/npcTradeAvailability.ts`
  - household availability currently uses stack `count()` semantics while personal availability already checks instance-backed kinds

Extend household availability to count instances for instance-backed kinds. Keep offer ownership as `household`; do not introduce a second stock representation.

Starter bootstrap must create concrete instances exactly once using the existing appropriate factories. At purchase time, never call `createAcquiredInstance()` for an already-owned household item.

Regression to pin: instance id/state survives household → player transfer and the sold instance does not reappear after reopen or reload.

## Trade eligibility policy

`src/ai/npcTradeAvailability.ts` deliberately uses a positive allowlist. Preserve this property.

Current household allowlist includes only:

- `arrow`
- `wool_material`
- `linen_material`
- `bandage`
- `dressing`
- `iron_rod`

Extend this policy for the exact specialist goods from the plan. Do not replace it with category-wide rules such as "all weapons in Household.items are sellable" or "all food is sellable".

`dried_meat` and `herb` are explicit specialist exceptions, not a general food/material rule.

The Hunter arrow reserve continues to reuse `HUNT_RESUPPLY_ARROW_TARGET` and must remain intact.

## Ordinary NPC trade commit

Relevant code:

- `src/app/inventoryWiring.ts`
  - builds NPC offers from `resolveNpcTradeOffers()`
  - before commit re-resolves live offer, owner, quantity and price
- `src/items/trade.ts`
  - `settleOwnedGoodsPurchase()` is the transaction engine
- `src/items/tradeCatalog.ts`
  - `npcSalePrice()` / `tradeValue()` remain shared valuation

Do not create a profession-specific transaction path. If instance-backed rows need additional metadata at UI preview level, keep the authoritative source resolution in `npcTradeAvailability` / commit, not Vue state.

Coins continue to settle to the interacting NPC's `personalInventory` under the current ordinary-NPC trade contract.

## Hunter production extension

Relevant code:

- `src/economy/production.ts`
  - `ProductionDef`
  - `ARROWS_FROM_BRANCH_PRODUCTION`
  - `ARROWS_FROM_BEAM_PRODUCTION`
  - `HUNTER_ARROW_PRODUCTIONS`
  - `produceFirstAvailableItemRecipe()`
- `src/economy/npcWork.ts`
  - `commitHunterArrowProduction()`
- `src/ai/npcProfessionWork.ts`
  - current Hunter work selection/execution

Add bow production by extending the existing profession-work/`ProductionDef` path, not with a crafting timer/manager.

The production output must become a real item/instance in `Household.items`; it must not replace or repair the Hunter's personal equipped bow.

Use existing wood inputs (`branch` / `beam`) if a minimal recipe is needed. Do not invent string/leather or another new material solely for this plan.

Add a small household bow target/cap checked by Hunter work planning before attempting production. The cap should describe desired unsold trade stock, not lifetime production. Selling a bow should naturally make later Hunter work eligible to produce another.

Keep existing arrow priority and reserve semantics unchanged.

## Merchant assortment issue

Relevant code:

- `src/settlement/merchantTrade.ts`
  - `generateMerchantAssortment()`
  - `specializationAffinity()`
  - `regionalClass()`
  - `skuBudget()`
  - deterministic salts
- `src/items/tradeCatalog.ts`
  - `MERCHANT_STOCK`

Current generator walks `MERCHANT_STOCK` in fixed order and can hit `skuBudget` before later bows/arrows. Raising `skuBudget` alone is insufficient.

Refactor selection so eligible goods are first ranked/bucketed using existing specialization affinity + regional class, then deterministically selected up to budget. Preserve:

- existing seeded determinism / isolated salts
- one settlement-level premium roll
- finite persisted merchant stock
- current pricing

Avoid making every merchant a near-complete catalog. The goal is better specialization coverage, not maximal SKU count.

Add tests that prove results are not dependent on bows/arrows being late in `MERCHANT_STOCK`.

## Pricing / catalog checks

`src/items/tradeCatalog.ts` already prices bows, arrows, tools, armor and pauldrons. Prefer no pricing changes unless a newly enabled specialist good lacks a valid `merchantPrice()` / `tradeValue()`.

Do not introduce profession-specific prices.

## Persistence

No new save schema should be necessary if starter stock is genuinely seeded only when `initial` household state is absent and all goods live in `Household.items`.

Be careful with any compatibility path that reconstructs a household from an older snapshot: never interpret "current stock is zero" as "bootstrap missing". If code inspection reveals an actual migration ambiguity, add a single household bootstrap marker rather than stock inference.

Merchant stock remains separate in existing NPC merchant state and must not be merged into household specialist stock.

## Tests to prioritize

### Household/bootstrap

- profession coverage resolves correctly from `FamilyDef`
- unrelated household receives none of the specialist stock
- first construction seeds once
- snapshot restore with zero remaining stock does not reseed
- Woodcutter receives exactly the configured max 2 trade axes in household while personal axe remains separate
- Farmer trade tools do not alter Farmer personal loadout

### Trade policy

- every newly allowed kind is explicit
- random same-category item remains hidden
- household instance-backed quantity uses instance count
- personal loadout remains hidden even when same `ItemKind` exists in household stock

### Transaction

- household stack transfer removes exact count
- household weapon/armor transfer preserves exact instance identity/state
- reopen/reload does not regenerate sold stock

### Hunter work

- arrow production behavior unchanged
- bow production requires input and free stock-cap room
- bow goes to household, never personal inventory
- cap blocks repeated overproduction
- selling a bow allows later replenishment

### Merchant assortment

- `weapons-tools` receives meaningful weapon/tool coverage
- forest bias can include bow/arrow/hunting goods
- selection is stable for same seed/context
- premium settlement-level behavior stays unchanged
- increasing/reordering `MERCHANT_STOCK` does not silently starve thematic later entries

## Likely file set

Primary:

- `src/settlement/household.ts`
- `src/settlement/settlementAgriculture.ts` or a renamed/generalized family→household-starting-context helper
- `src/ai/npcTradeAvailability.ts`
- `src/economy/production.ts`
- `src/economy/npcWork.ts`
- `src/ai/npcProfessionWork.ts`
- `src/settlement/merchantTrade.ts`

Possible supporting changes/tests:

- `src/app/inventoryWiring.ts`
- `src/items/trade.ts`
- `src/items/tradeCatalog.ts`
- item instance factory modules already used by player/merchant acquisition
- corresponding `*.test.ts` files around household, NPC trade, production and merchant assortment

Avoid unrelated UI refactors. The existing shared `MerchantScreen` / `npcGoods` path should remain the player-facing surface.

## Implementation order

1. Generalize family → `HouseholdStartingContext` profession coverage and add one-time specialist bootstrap.
2. Extend household trade eligibility + instance counting; add transaction regressions.
3. Add Hunter bow production and cap through current profession-work path.
4. Refactor merchant assortment selection and calibrate `skuBudget`.
5. Run focused tests for household/trade/production/merchant, then normal repository-required checks.
6. Leave browser/gameplay verification to the User.

Important new/generalized public architectural helpers should have JSDoc and `@domain settlements-npcs` where useful for preflight discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
