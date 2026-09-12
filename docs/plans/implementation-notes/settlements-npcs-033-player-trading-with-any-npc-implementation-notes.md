# Implementation Notes: settlements-npcs-033 — Player Trading with Any NPC

**Plan:** `docs/plans/settlements-npcs-033-player-trading-with-any-npc.md`  
**Reviewed:** 2026-09-12  
**Status:** `planned` 📋  
**Source of truth:** current `main` code + docs.

## Current architecture to reuse

### Pricing

`src/items/tradeCatalog.ts`

Existing authoritative social pricing primitives:

- `SellPriceContext`
- `NEUTRAL_SELL_PRICE_CONTEXT`
- `relationshipEffect(context)`
- `reputationEffect(context)`
- `fullConditionSellFactor(context)`
- `merchantPrice(kind)`
- `tradeValue(kind)`
- `sellPrice(...)`
- `resolveInstanceSellPrice(...)`

Do not introduce a second NPC-specific relationship/reputation formula. The missing piece is the **player purchase price from a non-merchant NPC**. Extract/reuse a shared bounded social adjustment so the existing inputs drive both directions with correct sign semantics.

Current sell-side constants are `BASE_SELL_FACTOR = 0.90`, `MIN_SELL_FACTOR = 0.80`, `MAX_SELL_FACTOR = 1.05`; do not blindly invert these constants for player purchase. Define purchase bounds explicitly in the same pricing module and test monotonicity/no-arbitrage.

### Social context resolver

`src/app/inventoryWiring.ts`

Current local functions:

- `findSettlementForNpc(npc)`
- `buildSellPriceContext(npc)`
- `createMerchantPricing(npc)`
- `merchantSellContext()`

`buildSellPriceContext()` already resolves exactly the required inputs:

```text
questManager.getRelation(npc.id)
questManager.getRelationLevel(npc.id)
reputationManager.getReputation(settlementId)
reputationManager.getRenown(settlementId)
```

Promote/rename only as needed so it represents a general trade social context rather than merchant-only semantics. Do not add settlement id to `NpcAgent` solely for pricing.

### Transaction core

`src/items/trade.ts`

Existing reusable behavior:

- capacity preflight;
- stack + instance-backed handling;
- deterministic instance selection;
- offer validation;
- buyback resolution;
- `settleTransaction()` merchant transaction;
- `settlePricedPurchase()` world-entity purchase;
- preview arithmetic.

`settleTransaction()` currently assumes merchant catalog purchases rather than a real external item owner. Do **not** force ordinary NPC stock into `MERCHANT_STOCK`.

Add/reuse a transaction primitive whose inputs include explicit source/destination inventories and exact quantities/instance ids. Preflight every participant before mutation. The helper belongs with the shared trade transaction code, not in Vue or NPC AI.

For stack goods it must transfer exact quantities. For instance-backed goods it must transfer existing instances, not call `createAcquiredInstance()` and mint replacements.

### Merchant UI/session

Relevant files:

- `src/ui-vue/screens/MerchantScreen.vue`
- `src/ui-vue/store.ts`
- `src/ui-vue/mount.ts`
- `src/app/inventoryWiring.ts`

Current merchant state supports:

- player bag view;
- merchant purchase rows from catalog stock;
- offer/barter basket;
- `MerchantPricing` callbacks;
- special merchant horse offer;
- `openMerchantFromDialogue()` / refresh flow.

Prefer generalizing the screen/state to receive an explicit counterparty stock/session model. Preserve merchant-only extras as optional capabilities. Do not fork a near-copy of `MerchantScreen.vue` unless implementation proves generalization would create more coupling than duplication; current structure strongly favors generalization.

Rename types/functions only where necessary; avoid broad UI refactors unrelated to the new session model.

### NPC dialogue

`src/ui-vue/NpcDialogueMenu.vue`

Current trade gate is:

```ts
const isHomeTrader = computed(() => state.npc?.role === 'trader' && state.settlement?.isHome === true)
```

and the `Handel` button is rendered only for `isHomeTrader`.

`src/app/inventoryWiring.ts` already wires `configureNpcDialogueMenu({ onOpenTrade })`.

Replace the role gate with a live/cached dialogue capability such as `canTrade`, resolved when opening the NPC dialogue from actual trade availability. Keep merchant detection only for merchant special offers/catalog behavior.

Do not let the Vue component inspect household inventory or production state directly.

## Goods ownership

### Household goods

`Household.items` is the authoritative persistent concrete-item inventory for household products. It is already used by Hunter arrows, hunted outputs and textile/medicine production.

Important: there is no generic `Household.items` surplus API for arbitrary `ItemKind`. Existing `Household.surplus(...)` is resource-category/domain-specific. Therefore do not implement ordinary NPC trade as `for every item count > 0`.

Add one bounded trade-availability resolver/policy that can answer:

```ts
availableToTrade(counterparty, kind, nowDays) -> quantity / concrete instances
```

It should operate from explicit owner inventory + protected reserve policy.

Initial policy should be intentionally narrow. `arrow` is mandatory. Other kinds may be added only when ownership/reserve semantics are clear.

### Hunter arrows

Relevant files/symbols to recon immediately before implementation:

- `src/ai/npcProfessionWork.ts` — Hunter work and arrow-production eligibility;
- `src/economy/production.ts` — `HUNTER_ARROW_PRODUCTIONS`;
- `src/economy/npcWork.ts` — `commitHunterArrowProduction()`;
- search current location of `HUNTER_ARROW_STOCK_CAP` before editing.

Reuse the existing Hunter stock threshold/configuration as the protected trade reserve. Do not duplicate the number in trade code.

If multiple Hunters share one household, reserve must account for the actual household's Hunter demand rather than assuming one hard-coded actor. Prefer a deterministic resolver based on household members/active Hunter roles if current household model exposes that cheaply. If current generated households guarantee one Hunter for the initial case, encode only the verified invariant and leave a clear extension seam rather than speculative global scans.

### NPC money recipient

`NpcStateRegistry.personalInventory` is already persistent and used for work-contract wage payment.

For V1, money from household-goods sales should go to the interacting NPC's `personalInventory`.

Reuse the same capacity semantics as `payWorkContractAssignment()` where practical. A full NPC destination blocks the transaction before source/player mutation.

Do not create:

- household wallet;
- settlement treasury;
- invisible merchant account.

### Player barter caution

Existing merchant barter is safe because merchant-side offered goods do not currently need to become a persistent ordinary-NPC inventory owner.

For ordinary NPCs, every item offered by the player must have a real destination preserving stack freshness / instance identity. If that cannot be done cleanly within this plan, restrict ordinary NPC purchases to **coin-only payment** for V1 while preserving the shared UI shape for future barter.

Do not silently delete player barter goods.

## Recommended implementation order

1. Add pure purchase-pricing helper(s) in `tradeCatalog.ts`, reusing `relationshipEffect()` / `reputationEffect()` and adding tests for direction/bounds.
2. Add explicit-owner atomic item purchase/transfer primitive in `trade.ts`; cover stack and instance-backed semantics before UI wiring.
3. Add trade availability/reserve resolver, initially `arrow` + Hunter household reserve.
4. Generalize merchant session/store/UI to accept explicit counterparty stock and optional merchant-only extras.
5. Generalize `buildSellPriceContext()` naming/usage to the current NPC trade session.
6. Replace `NpcDialogueMenu.vue`'s `isHomeTrader` trade-button gate with app-provided trade capability.
7. Wire ordinary NPC open/refresh/commit through `inventoryWiring.ts`.
8. Add Hunter end-to-end integration tests and merchant regressions.

## Live revalidation contract

Opening trade may build a quote/snapshot for display, but commit must re-resolve:

- interacting NPC still valid/alive;
- source owner still exists;
- current source quantity/instances;
- current protected reserve;
- player funds;
- player capacity;
- NPC coin destination capacity;
- current social price context if relation/reputation can change while session is open.

If any precondition fails, return a typed trade failure and mutate nothing.

Do not reserve household goods merely because the screen is open.

## UI state guidance

A generalized trade session should carry plain data/callbacks only. Vue should not receive `Household`, `QuestManager`, `ReputationManager` or `NpcStateRegistry` objects.

Useful session shape conceptually:

```text
counterparty label/id
stock rows (kind, available, unit price, optional instance metadata)
player inventory view
pricing preview callbacks
settle callback
optional merchant specials
```

The exact type names should match existing `store.ts` conventions after recon.

Refresh after successful commit must rebuild counterparty rows from live owner state, so buying the last surplus arrows removes/disables that row immediately.

## Files likely to change

Primary:

- `src/items/tradeCatalog.ts`
- `src/items/trade.ts`
- `src/app/inventoryWiring.ts`
- `src/ui-vue/store.ts`
- `src/ui-vue/mount.ts`
- `src/ui-vue/NpcDialogueMenu.vue`
- `src/ui-vue/screens/MerchantScreen.vue` (or renamed/generalized equivalent)

Likely new focused module:

- `src/economy/npcTradeAvailability.ts` or equivalent existing-domain location after final naming recon.

Tests near the corresponding modules.

Potential read-only/reuse:

- `src/settlement/household.ts`
- `src/ai/npcProfessionWork.ts`
- `src/economy/production.ts`
- `src/economy/npcWork.ts`
- NPC state registry/persistence files containing `personalInventory`.

Avoid changes to production recipes, Hunter combat logic, save schema, local-goods circulation scheduler or NPC decision architecture unless current code proves a small required seam is missing.

## Regression risks

1. **Merchant stock semantics:** current merchant purchases can create acquired instances from catalog stock; ordinary NPC trade must transfer existing owned items instead.
2. **Arbitrage:** social buy price and existing merchant buyback price must not create a deterministic infinite buy→sell loop for the same standing/context.
3. **Ammo starvation:** household arrow sale must preserve Hunter reserve.
4. **Ownership loss:** player barter goods cannot disappear without a destination.
5. **Instance identity:** ordinary NPC-owned weapon/armor/container instances must not be recreated on transfer.
6. **Freshness:** if perishable household goods are enabled later, transfer must preserve food batches rather than reset freshness.
7. **Merchant specials:** horse/maps remain merchant-only and must not appear for generic NPCs.
8. **Session staleness:** offer rows are preview only; commit always validates live source.

## Verification focus

Automated implementation should prove the architecture with Hunter arrows first. Manual browser verification remains the user's responsibility per project rules.

Do not run browser verification as AI.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
