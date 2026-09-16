# Implementation notes: Armor quality pricing and world availability

Plan: `items-player-040-armor-quality-pricing-and-world-availability.md`

Recon baseline: `main` at/after `8afc74e9` (2026-09-16).

Current code wins if it changes before implementation. These notes focus on non-obvious seams and constraints the implementing agent would otherwise have to rediscover.

## 1. Armor quality is already instance-owned

### `src/items/itemInstances.ts`

The representation is already correct for this plan:

- `ArmorQuality = 'common' | 'good' | 'masterwork'`;
- `ArmorItemInstance { id, kind, quality }`;
- `ARMOR_QUALITIES` / `ARMOR_QUALITY_LABELS`;
- `isArmorQuality()` / `normalizeArmorQuality()`;
- `cloneItemInstance()` preserves armor quality;
- armor is already included in `INSTANCE_BACKED_KINDS`.

Add `poor` here and propagate through the existing validation/label arrays. Do not add a second quality type in trade or settlement code.

Important compatibility rule: `normalizeArmorQuality()` currently falls back to `common`; keep that fallback for missing/invalid legacy data. Adding `poor` must not change old-save normalization semantics.

## 2. Gameplay tuning belongs in the existing armor resolver

### `src/items/armorItemInstances.ts`

`resolveEffectiveArmorPiece()` is already the single source of truth for quality-adjusted protection, weight and direct armor penalties. Extend this rather than branching on `poor` in equipment/combat/UI.

Current `QUALITY_TUNING` uses:

```ts
{ protectionScale, weightScale, penaltyEase }
```

and `penaltyEase` only moves a base multiplier toward neutral `1`. That shape cannot express intentionally worse-than-common restriction cleanly.

Recommended change: replace the one-way `penaltyEase` concept with a symmetric, explicitly documented transform around the base multiplier. Keep `common` exactly identity. The important invariant is:

- base penalty multiplier `> 1`: poor moves farther above `1`; good/masterwork move toward `1`;
- base movement multiplier `< 1`: poor moves farther below `1`; good/masterwork move toward `1`.

Do not encode `poor` via an unexplained negative ease constant. Keep the transform in this module and test both `>1` and `<1` multiplier directions.

`effectiveInstanceWeight()` already routes armor mass through `resolveEffectiveArmorPiece()`, so once poor tuning exists, player inventory/encumbrance automatically sees the heavier effective weight. Preserve that central path.

## 3. Persistence is already quality-aware; only the accepted enum expands

### `src/items/Inventory.ts`

`SaveItemInstance` already carries optional `quality`; `toSaveItemInstance()` and `instancesFromJSON()` are the centralized round-trip boundaries. Armor reconstruction already normalizes quality.

### `src/persistence/saveData.ts`

The structural save validator already knows armor quality and legacy armor migration explicitly creates `quality: 'common'` rows.

For this plan:

- accept `poor` in structural validation;
- keep legacy migration output `common`;
- do not add a save-version migration solely because the enum gains another valid value;
- merchant stock is already persisted through `npcStates[id].merchantStock`, so no new merchant-quality save field is needed.

## 4. Pricing needs one instance nominal-value seam

### `src/items/tradeCatalog.ts`

Current boundaries are:

- `MERCHANT_PRICES[kind]` — catalog/base buy price;
- `tradeValue(kind)` — catalog/base nominal value;
- `sellPrice(kind, context)` — stack/kind player sell price;
- `npcSalePrice(kind, context)` — ordinary NPC → player price;
- `resolveInstanceSellPrice(instance, context)` — concrete instance player sell price.

Do not bake quality multipliers into `MERCHANT_PRICES`. Treat those values as the `common` baseline.

Add one pure armor-quality economic resolver in the item/trade layer, then use one concrete-instance nominal-value helper as the shared basis for instance pricing, conceptually:

```text
tradeValue(instance.kind)
× armorQualityValueMultiplier(instance.quality)
→ instance nominal value
```

Use the existing integer rounding policy after applying social factors. Avoid separate merchant-vs-NPC quality multiplier tables.

`resolveInstanceSellPrice()` is the correct existing sell seam: add the armor branch there.

For player purchases, introduce an instance-aware counterpart instead of overloading `merchantPrice(kind)` with optional quality. This helper should support both Merchant and ordinary-NPC purchase paths while keeping their existing social factor rules distinct.

## 5. Critical gap: Merchant UI and transaction flatten instances back to kind/count

The finite stock from `settlements-012` already stores real armor instances correctly, but the player-facing path loses their identity before purchase.

### `src/app/inventoryWiring.ts`

`buildMerchantTradeStock()` currently emits one `NpcTradeStockRow` per `ItemKind`:

```text
kind + quantity + merchantPrice(kind)
```

For instance-backed armor it uses only `countInstances(kind)`. Different qualities of the same armor kind are therefore collapsed into one row and one price.

### `src/items/trade.ts`

`settleMerchantStockTransaction()` receives:

```ts
Partial<Record<ItemKind, number>>
```

for purchases. When transferring an instance-backed kind it calls `selectInstancesToSell(merchantStock.getInstances(kind), count)`.

Armor has no condition ratio branch, so all armor instances tie at condition `1` and are selected by stable id. The player cannot choose the displayed quality even if UI were to show it.

This must change for armor quality to be real gameplay/economy rather than presentation-only.

Preferred architecture:

- keep stackable Merchant purchases kind/count based;
- add a concrete-instance purchase representation for instance-backed stock where identity affects price/state;
- Merchant trade rows for armor expose `instanceId`, `quality` and concrete unit price;
- commit revalidates that exact instance still exists in `merchantStock` before mutation;
- transfer the exact instance object to player inventory.

Do not solve this by sorting armor so `poor` is always silently sold first. That still prevents explicit player choice and makes UI price/commit mismatch possible.

## 6. Weight preflight must use the exact purchased armor instance

This is easy to miss.

`trade.ts`'s current `wouldFitAfterTransaction()` computes incoming purchase weight from `ITEM_DEFS[kind].weight`. That was acceptable for kind/count Merchant rows, but armor quality already changes effective physical weight.

Once a specific `poor/good/masterwork` armor instance is purchased, transaction preflight must use the same effective-instance-weight resolver that `Inventory.totalWeight()` / instance admission use.

Otherwise a trade can:

- reject a light good/masterwork piece that actually fits, or
- accept a heavier poor piece and then disagree with inventory capacity/encumbrance.

Prefer a transaction preflight that receives resolved concrete instances and computes their effective weight, rather than adding an armor-only correction after the generic kind calculation.

Size/gabarite remains kind-level unless current code has an instance-specific size mechanism; do not invent one for quality.

## 7. `settlements-012` assortment must stay kind-level

### `src/settlement/merchantTrade.ts`

Current responsibilities are clean:

- `generateMerchantAssortment()` chooses `ItemKind -> quantity` using settlement size, region and specialization;
- `settlementHasPremiumOffer()` performs one settlement-level premium roll;
- `seedMerchantStockIfNeeded()` materializes finite owned stock once;
- `merchantStockInitialized` prevents reseeding after sale/reload.

Keep `generateMerchantAssortment()` kind-level. Quality should be assigned only when an armor quantity is materialized into `ArmorItemInstance`s.

Add a dedicated merchant armor-quality resolver here (or a small adjacent pure module if needed), with inputs already available at stock initialization:

- `VillageSize`;
- Merchant specialization/profile;
- world/settlement seed context;
- armor kind;
- per-unit index.

Use a new RNG salt. Do not consume from `MERCHANT_ASSORTMENT_SALT`, `MERCHANT_PREMIUM_SALT` or profile streams; changing call counts on an existing stream would reshuffle existing worlds.

`seedMerchantStockIfNeeded()` currently receives only `quantities` plus the stock/latch. It does **not** have enough context to resolve quality. Extend the initialization call contract explicitly rather than hiding global lookup inside the helper.

## 8. Premium integration: current information is partially lost after assortment generation

`generateMerchantAssortment()` internally knows `assignedPremium`, but returns only `Map<NpcId, Record<ItemKind, number>>`. The fact that a row was the settlement-level premium assignment is not returned separately.

Today this is mostly inferable for `chainmail`: it is in `PREMIUM_MERCHANT_KINDS`, and premium kinds are skipped by the ordinary assortment loop, so presence means it came through premium assignment. Do not encode that incidental inference as the long-term contract.

If plan 040 needs a stronger quality bias specifically for the premium-assigned armor, preserve a small piece of generation metadata in the assortment result or pass an explicit `premiumAssignedKind/npcId` initialization hint. Avoid a second premium roll.

Do not reinterpret every premium `ItemKind` as `masterwork` quality. Item rarity/material and instance craftsmanship remain separate axes.

## 9. Quality distribution should be deterministic tables, not scattered probabilities

Keep one compact probability table keyed primarily by `VillageSize`, then apply a bounded specialization adjustment for `weapons-tools`.

Recommended implementation properties:

- each row sums to 1;
- `OUTPOST` has an explicit fallback rather than falling through accidentally;
- no quality is hard-locked by size unless the plan is later changed;
- `weapons-tools` bias shifts probability mass toward higher quality, not a second roll;
- region does not affect quality;
- unit index is part of the deterministic seed so quantity >1 can contain mixed qualities without repeated identical rolls.

Prefer tests over a fixed seed corpus plus aggregate many-seed assertions. Do not make probabilistic tests depend on `Math.random()`.

## 10. Generic NPC trade has the same identity/pricing issue if armor becomes sellable there

### `src/app/inventoryWiring.ts`

`buildNpcTradeStock()` currently receives `resolveNpcTradeOffers()` rows and computes `npcSalePrice(offer.kind, context)` — kind-level.

### `src/items/trade.ts`

`OwnedGoodsPurchaseLine` is also kind/count/unitPrice based, and `settleOwnedGoodsPurchase()` selects an instance itself for instance-backed kinds.

At present ordinary NPC trade availability is an explicit allowlist of production goods, so armor may not yet actually appear there. Do not expand that allowlist just for this plan.

However, if an existing/future row can expose armor, the concrete-instance purchase contract introduced for Merchant stock should be reusable rather than leaving NPC trade silently quality-blind. Keep the lower-level transaction primitive actor-neutral where practical.

## 11. UI seam to update

### `src/ui-vue/store.ts` and Merchant screen components

`NpcTradeStockRow` is the current buy-row DTO consumed by Merchant UI. Extend the DTO minimally so a concrete armor row can carry identity/quality without turning every stackable row into an instance object.

The UI should not calculate price or effective stats itself. Supply:

- concrete `unitPrice`;
- `instanceId` when the row represents one physical instance;
- quality label/data sufficient for presentation.

If multiple armor instances of the same kind have the same quality and exact same price, grouping is optional, but only if commit can deterministically bind the selected quantity to those exact-quality instances. The safest V1 is one row per armor instance; merchant armor counts are low, so row count is negligible.

Reuse `ARMOR_QUALITY_LABELS` and existing armor/inventory view helpers. Do not add another UI-only translation table.

## 12. Selling selection policy needs an explicit decision

Player → Merchant offer baskets remain kind/count based. `resolveOfferLineBuyback()` selects concrete instances using `selectInstancesToSell()` and sums `resolveInstanceSellPrice()`.

Once armor qualities have different prices, the current armor tie-break by id means offering `1 × chainmail` may sell an arbitrary quality.

This is dangerous even if the displayed total matches the eventual selected ids, because the player may unintentionally sell masterwork armor while also carrying poor armor.

Recommended scope-compatible fix: extend `conditionRatio()` / selection policy for armor so lower-quality armor is selected first for kind/count offer baskets, with stable id as final tie-break. Better long term would be explicit instance selection in the Merchant offer UI, but do not force a large sell-UI redesign if existing instance rows already provide a direct `sellInstancesForCoins()` path.

Whichever route is chosen, test that displayed offer value and removed instance ids are derived from the same selection.

## 13. Tests to extend first

High-value existing suites:

- `src/items/equipment.test.ts` / armor instance tests — poor gameplay ordering;
- `src/items/trade.test.ts` — instance nominal value, Merchant concrete purchase, exact transfer, capacity preflight;
- `src/items/trapInstanceTrade.test.ts` — useful precedent for instance-aware price testing, but do not copy trap condition semantics into armor;
- `src/settlement/merchantTrade.test.ts` — deterministic quality generation, stock seeding and persistence semantics;
- `src/items/Inventory.test.ts` + persistence/save tests — `poor` round-trip and legacy fallback;
- Merchant UI/store tests if present — separate rows/prices for two qualities of the same armor kind.

Add one regression test with a Merchant holding two `chainmail` instances of different qualities. It should prove all of these at once:

1. two distinguishable buy rows/prices are produced;
2. buying the selected row transfers that exact `instanceId`/quality;
3. the other instance remains in Merchant stock;
4. price charged matches the selected quality;
5. reopen does not reroll either item.

## 14. Suggested implementation order

1. Add `poor` enum/label/validation and generalized gameplay tuning.
2. Add the shared armor quality economic multiplier + concrete instance nominal price; extend sell pricing.
3. Extend Merchant stock initialization context and deterministic armor-quality generation, preserving existing assortment RNG streams.
4. Change Merchant buy rows/transaction contract to concrete armor instance identity and concrete price.
5. Fix exact-instance weight preflight.
6. Wire Merchant UI presentation and commit payload.
7. Audit player sell selection for mixed-quality armor and make its policy explicit.
8. Verify persistence/merchant reload behavior and generic NPC lower-level compatibility.
9. Update current-state/item catalog docs if their quality/trade descriptions become stale; generated indexes follow normal workflow, do not hand-edit them.

## 15. Guardrails / pitfalls

- Do not create `poor_chainmail` / `masterwork_chainmail` kinds.
- Do not mutate `MERCHANT_PRICES` per quality.
- Do not make `createAcquiredInstance(kind)` randomly choose quality; its ordinary default stays `common`.
- Do not reroll quality when trade UI opens or Merchant streams in.
- Do not replace finite `merchantStock` with generated offer rows.
- Do not consume an existing merchant RNG stream for quality.
- Do not let UI recompute quality price or armor gameplay stats.
- Do not keep purchase payload kind-only once two qualities of the same armor kind can coexist in Merchant stock.
- Do not use base `ITEM_DEFS` weight for a concrete armor purchase preflight.
- Do not expand ordinary NPC sellable-goods policy merely to demonstrate armor quality.
- Weapon instances/quality remain entirely out of scope.

## 16. Model recommendation

**Model:** Opus, Sonnet

The change is medium-sized but cross-cuts instance identity, deterministic merchant generation, transaction atomicity, capacity preflight, pricing and UI DTOs. Opus is preferred because the highest-risk part is preserving exact physical instance identity through preview → commit without breaking the existing stack-based trade paths. Sonnet is a reasonable fallback with these notes.

> **Zrób git commit i push do main, rebase jeżeli trzeba**