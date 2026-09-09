# Merchant sell pricing — condition and social standing — Implementation Notes

**Reviewed:** 2026-09-09

## Current-state findings

- `src/items/tradeCatalog.ts` is the current pricing source of truth. `merchantPrice(kind)` is the merchant's fixed BUY price; `tradeValue(kind)` is the nominal/barter value; `sellPrice(kind)` still applies the old `Math.floor(tradeValue * 0.5)` rule. `resolveInstanceSellPrice()` is the existing instance-aware seam and already accepts an empty `SellPriceContext` parameter specifically suitable for this plan.
- Trap pricing is currently a parallel special case inside `resolveInstanceSellPrice()`: non-broken traps receive a 10–25% usage discount and are then multiplied by the old `0.5`; broken traps return `5%` of `tradeValue`. Rework the non-broken path onto the new common condition formula, but preserve the explicit broken-trap salvage rule unless implementation evidence requires a narrower adjustment.
- `src/items/trade.ts` has two player→merchant value paths that must be changed together. `sellInstancesForCoins()` calls `resolveInstanceSellPrice()`, but mixed BUY+OFFER transactions do **not**: `computeNetCoins()` values offered items at full `tradeValue` while they cover purchase cost, and only credits leftover sellable value at `0.5`. Updating only `sellPrice()` would therefore leave barter/mixed transactions on the old semantics.
- `MerchantScreen.vue` also reads `tradeValue(kind)` directly for OFFER rows and transaction-line totals, and `previewTransactionNetCoins()` currently has no pricing context. UI display, preview arithmetic and authoritative settlement will drift unless all three receive the same resolved merchant pricing.
- `inventoryView.ts` currently derives instance sell prices without a merchant context. Do not turn that generic inventory representation into the authority for a concrete merchant's offer. A merchant-specific value belongs at the merchant/application boundary; neutral inventory display may remain neutral if still useful.

## Existing social ownership to reuse

- `QuestManager` owns numeric player↔NPC relation. Existing semantic tiers are `stranger >= 0`, `acquainted >= 1`, `friendly >= 3`, `trusted >= 6` in `src/quests/quests.ts`. Use these existing thresholds for positive merchant relation pricing; do not add merchant-only tiers.
- `ReputationManager` owns per-settlement reputation and renown. `getReputation(settlementId)` returns all five dimensions and `getRenown(settlementId)` returns `0..100`; absent settlements read as neutral without materializing state.
- `src/ai/reactionChance.ts` already establishes the architecture that per-NPC relation and per-settlement reputation/renown are separate concepts. `PlayerSocialLookup` is settlement-aware, while `NpcAgent` deliberately does not own or resolve settlement identity. Preserve that boundary.
- `NpcRelationships` is unrelated NPC↔NPC state and must not participate in merchant pricing.

## Merchant identity / settlement resolution

- The merchant screen already retains the concrete `NpcAgent` in `ui.merchant.npc`; `openMerchantFromDialogue()` captures it before closing the dialogue. The trade callbacks themselves are configured once in `inventoryWiring.ts` and currently receive only basket data.
- `InventoryWiring` is the correct application boundary for constructing a merchant-specific pricing context: it already owns merchant execution and already receives `questManager`. Add `ReputationManager` as a dependency rather than importing either manager into `tradeCatalog.ts` or Vue.
- `NpcAgent` intentionally has no settlement id. For the currently loaded merchant, resolve the owning settlement through `bundle.settlementsManager.getLoaded()` and the settlement's `npcs` collection (the same identity-membership pattern is already used elsewhere, e.g. debug NPC lookup). Keep this lookup at the application boundary; do not add `settlementId` state to `NpcAgent` just for pricing.
- Prefer resolving the context when the merchant session opens and storing/passing the resulting plain pricing data through the merchant facade. Do not repeatedly scan loaded settlements from every row/computed price calculation.
- If no merchant NPC or owning settlement can be resolved (isolated tests/fallback opening), use a neutral `SellPriceContext`; pricing must remain deterministic and usable without social managers.

## Pricing context and pure helpers

Keep `src/items/tradeCatalog.ts` manager-agnostic. A suitable concrete contract is a plain-data context containing only what the formula needs, for example:

```ts
type SellPriceContext = {
  relation: number
  relationLevel: RelationLevel
  reputation: Readonly<Reputation>
  renown: number
}
```

Defaults should represent neutral social state. Avoid optional fields scattered through the pricing math if one neutral-context constant/helper can centralize the fallback.

Useful decomposition inside the pricing domain:

- one helper for `relationshipEffect(context)`;
- one helper for the weighted reputation + renown effect;
- one helper for the clamped full-condition sell factor;
- one rounding/minimum helper shared by stack and instance pricing where practical.

The plan's positive relationship mapping is tier-based (`0 / +1 / +3 / +5 pp`). For negative numeric relation, use a bounded continuous mapping to `-5..0 pp`; do not derive a negative tier because none exists in the relation model.

Reputation weights are `trust 0.40 + integrity 0.40 + competence 0.20`. `benevolence` and `courage` stay unused. Renown multiplies the signed reputation effect; it is never an independent positive bonus.

## Mixed transaction semantics — important discrepancy

The current basket has barter-parity semantics: offered goods count at full `tradeValue` until BUY cost is covered. That directly conflicts with this plan's goal that the merchant's valuation of player goods be the condition/social-adjusted sell value.

For this plan, treat **merchant buyback value as the single value of player-offered sellable goods inside the merchant transaction**, regardless of whether the basket also contains purchases. In other words, do not preserve the current "full barter value until purchase cost, reduced cash value only for change" split for ordinary sellable items.

Preserve the special non-cashable rule for `canSell() === false` items such as `shell`: they may retain their existing barter-only `tradeValue` semantics if still accepted in the basket, but they must never become coin proceeds.

Recommended shape:

- pricing helpers resolve per-unit merchant buyback value for sellable stack items;
- instance-backed offers resolve concrete instance values when the actual instances are known;
- `computeNetCoins()` / preview and settlement use the same valuation primitive rather than hard-coded `tradeValue`/`0.5` arithmetic;
- remove or rewrite `splitOfferValue()` once its old full-value/half-value split is no longer the actual economic rule.

Do not modify `tradeValue()` itself: other barter/reference-value consumers may rely on nominal value, and the plan explicitly keeps it as the nominal source of truth.

## Instance-backed offers in the mixed basket

A current OFFER basket is keyed only by `ItemKind` count. `removeOffer()` selects worst-condition instances first, but `computeNetCoins()` values those counts without inspecting the selected instances. This becomes incorrect once durability determines price.

Reuse `selectInstancesToSell()` as the deterministic selection rule and make valuation inspect the **same concrete instances that settlement will remove**. Do not average group condition in Vue and do not price one set of instances while removing another.

A small domain helper can resolve an offer into selected instance ids + value before mutation, then the authoritative transaction can validate capacity/payment and remove exactly that resolved selection. Keep the operation atomic.

This is also why `MerchantScreen.vue`'s current average `conditionForOffer()` is display-only and cannot be an input to settlement pricing.

## UI/application contract

- `MerchantScreen.vue` must stop using raw `tradeValue(kind)` as the displayed OFFER price for sellable goods. Feed it merchant-resolved per-unit pricing (or a pure pricing context + helper) from the existing facade; prefer plain data over manager access in Vue.
- `previewTransactionNetCoins()` must accept/use the same context/resolved valuation as `settleTransaction()`. Preserve the current design where preview and commit share one arithmetic path.
- The row price is only exact for stack goods or uniform-value units. For an instance-backed group with mixed condition, the final basket value depends on the deterministic selected instances. The transaction summary should use the resolved basket value, not `rowPrice * count` if those differ.
- `MerchantItemDetailsModal.vue` currently reads nominal merchant/trade values. Only change it if it labels a value as the merchant's OFFER; do not globally relabel `tradeValue` as a sell price.
- `inventoryWiring.ts` remains responsible for post-trade HUD/inventory/merchant refresh and toast flow. Pricing work should not move those lifecycle responsibilities into `trade.ts` or Vue.

## Rounding and low-value items

Current pricing uses integer coins and `Math.floor` with minimum `1`, which strongly quantizes cheap goods (`tradeValue` 1–3). Keep one deterministic rounding rule across preview and commit. Do not introduce fractional coins.

When writing tests, assert exact behavior for low-value resources separately from percentage expectations; `80–105%` is the pre-rounding factor, not a guarantee that a 1-coin item visibly changes price with social standing.

## Buy/sell arbitrage guard

`merchantPrice(kind)` equals `tradeValue(kind)` for stocked goods. The plan intentionally allows a maximum sell factor of `1.05`, so a trusted/high-reputation player could otherwise buy a stocked item for 100% and immediately sell it back for 105%.

Do not silently ignore this. The smallest guard consistent with current architecture is to cap the final buyback of merchant-stocked goods at that kind's current `merchantPrice(kind)` unless/until a separate demand/price-spread system exists. Non-stocked goods may still reach the plan's 105% nominal-value ceiling.

If implementation chooses instead to allow the 105% premium for stocked goods, that is an explicit economy-behavior change and should be documented in the implementation summary because it creates deterministic coin arbitrage in the current static-stock model.

## Tests with highest value

Extend the existing trade tests rather than creating a parallel pricing test harness only in UI code. Highest-value cases:

- stack sell price: neutral 90%, social min/max and rounding;
- relationship tier boundaries `0/1/3/6` plus negative relation clamp;
- weighted reputation with renown `0` and `100`, including negative reputation amplification;
- trap condition monotonicity and broken-trap salvage preservation;
- mixed BUY+OFFER uses merchant buyback value, not full `tradeValue`;
- preview and commit return identical coin deltas for the same basket/context;
- mixed-condition instance group values and removes the same worst-condition instances;
- barter-only `shell` still cannot produce coins;
- stocked-item maximum cannot create buy→immediate-sell profit if the arbitrage guard above is adopted;
- neutral/fallback merchant context works in isolated tests.

## Recommended implementation order

1. Add pure social/full-condition pricing helpers and a neutral `SellPriceContext` in `tradeCatalog.ts`; migrate `sellPrice()` and `resolveInstanceSellPrice()` first.
2. Extend `InventoryWiringDeps` with `ReputationManager` and add one merchant-context resolver at the application boundary; resolve owning settlement from the loaded settlement containing the merchant NPC.
3. Thread the resolved context through the merchant facade/session without exposing managers to Vue.
4. Refactor `trade.ts` so mixed-offer valuation and direct instance selling share the new buyback pricing, including deterministic instance selection before mutation.
5. Make preview and authoritative settlement share the same context-aware arithmetic.
6. Replace raw OFFER `tradeValue` displays/totals in `MerchantScreen.vue` with the merchant-resolved values.
7. Update/add unit tests, then run the repository's normal TypeScript/lint/test/build verification. Browser verification remains the user's task.

## Related plan interaction

`items-player-019-player-camp-repair-and-sewing-kit` intends to make tent instance-backed and hook its condition into `resolveInstanceSellPrice()`. Keep the pricing helper generic enough for that future item instance, but do not implement tent condition or a generic durability framework in this plan.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
