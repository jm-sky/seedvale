# Implementation Notes: settlements-012 — Regional specialist trade and settlement-scale quality

**Plan:** `docs/plans/settlements-012-regional-specialist-trade-and-settlement-scale-quality.md`  
**Reviewed:** 2026-09-14  
**Status:** `planned` 📋  
**Source of truth:** current `main` code + docs.

## Current code reality

### Trade foundation exists, but Merchant stock is not authoritative stock

`settlements-npcs-033` is already materially implemented despite its plan still being `verification needed`:

- `src/ai/npcTradeAvailability.ts` resolves live household-owned offers and protected reserves; today only `arrow` is trade-enabled.
- `src/app/inventoryWiring.ts` builds ordinary-NPC offers from live `Household.items`, revalidates before commit, transfers coins to `NpcStateRegistry.personalInventory`, and reuses social pricing.
- `src/items/trade.ts` / `tradeCatalog.ts` contain the shared transaction/pricing primitives.

Do not duplicate any of that.

The important mismatch with this plan is the Merchant path: `MERCHANT_STOCK` in `src/items/tradeCatalog.ts` is a global list and Merchant purchases are catalog-backed, not finite per-NPC/per-settlement owned inventory. Filtering that list by specialization/region would satisfy presentation but would violate this plan's persistence/ownership invariant: reopening could restore the same rare offer indefinitely.

**Decision:** keep `MERCHANT_STOCK` as the canonical set/order/price source, but introduce a deterministic, finite Merchant assortment ownership/state layer before applying regional/premium guarantees. Do not create a second pricing catalog. Prefer existing persistent inventory ownership (`personalInventory` if its item model is sufficient; otherwise a small settlement/NPC-owned persisted stock record using existing inventory primitives) over cached offer rows. The stock must be generated once from stable settlement/NPC identity and then depleted by real transactions.

Do not solve this by persisting UI rows or rerolling availability at trade-open time.

### Merchant recognition is currently home-only

`src/app/inventoryWiring.ts::isMerchantNpc()` currently requires both `npc.role === 'trader'` and `settlement.isHome === true`. A Trader in another settlement therefore does not receive `MERCHANT_STOCK`; it only trades if ordinary household surplus exists.

**Decision:** regional Merchant behaviour requires separating:

- "is this NPC a Merchant?" → role/capability, valid in every settlement;
- home-only Merchant extras (currently wagon/horse-specific behaviour) → explicit optional capability.

Do not propagate the current `isHome` restriction into the new assortment resolver.

## Staffing

`src/settlement/professionStaffing.ts` is the only generation-time profession resolver and already owns adult-capacity, terrain/resource signals, duplicate handling and an isolated RNG salt.

Current `trader.afterDuplicate` excludes every second Trader. Extend this policy in place; do not add a Merchant generator.

Keep the cap workforce-derived. A practical implementation seam is a size/adult-capacity-aware duplicate policy for `trader`, e.g. allowing subsequent copies only for LG/XL and sufficiently large adult capacity. Tests should assert both the upper bounds and that other profession baselines are not displaced pathologically in small populations.

Use a new dedicated salt for specialization/assortment selection rather than consuming the staffing RNG sequence.

## Merchant specialization ownership

Do not add specialization to `Role`. Keep a small union owned by a focused trade/settlement module, not Vue/dialogue.

Prefer deriving specialization deterministically from stable inputs (`settlement id/seed + npc id`) rather than persisting it separately. This gives save/load stability without a migration. Multiple Traders in one settlement should be assigned as a settlement-level ordered set so uniqueness preference is deterministic; independent per-NPC rolls can accidentally duplicate all profiles.

Recommended shape:

```text
resolveMerchantProfiles(settlement identity, ordered trader ids)
→ [{ npcId, specialization, stallIndex }]
```

The resolver should be pure and cheap enough to recompute at settlement construction/trade-open, but not per frame.

## Market/stall layout

There is already more infrastructure than the plan text implies:

- `VillagePlan.landmarks` supports indexed `market` landmarks.
- `villagePlanner.ts` already loops over `VILLAGE_SIZE_CONFIG.infrastructure.markets` and emits `plot-infra-market-N` through the shared `pickPlot()` scorer/spacing path.
- today `LG` and `XL` have `markets: 1`; `SM`/`MD` have `0`.
- `props.ts` materializes only `landmarkOf(plan, 'market', 0)` into the singleton `SettlementLandmarks.market` and otherwise uses a fallback position.
- `places.ts::workplaceFor('trader')` always returns that singleton market, so multiple Traders would stack on one workplace.

**Decision:** extend this existing indexed market contract rather than inventing a new stall occupancy system. Raise planned market/stall count for the sizes that need multiple Traders, materialize all planned market anchors, and keep `market` as a compatibility alias to index 0 if useful. Add an indexed collection (`markets` / equivalent) to `SettlementLandmarks` and resolve each Trader's `Place` from its stable assignment.

Avoid assigning by runtime NPC array order if that order can change. Use stable trader identity or a deterministic sort of trader ids.

`settlements-011-plaza-layout-paving-and-core-protection.md` is planned and touches the same central-prop footprint/clearance contract. Its planner-owned plaza/reserved-footprint work should land before, or be implemented together with, the multi-stall layout part of this plan. Do not add temporary stall-specific clearance that 011 would immediately replace.

`src/settlement/merchantWagon.ts` is a home-Kupiec wagon placement helper around the first market stall. It is not the general multi-stall layout mechanism. Keep wagon/horse behaviour optional and home-specific unless another plan explicitly generalizes it.

## Assortment policy

Keep one declarative policy outside UI, operating on existing `ItemKind` metadata/catalog data.

Useful existing sources:

- `MERCHANT_STOCK` / `MERCHANT_PRICES` — catalog membership, order and base prices;
- `ITEM_DEFS` + `hasItemKindCategory()` — item categories;
- `VillageIdentity.size`, `.terrain`, `.dominantResource`, `.foodSourceType` — settlement context;
- real household/profession-owned output through `npcTradeAvailability.ts` and production systems.

Do not hardcode offer lists in `MerchantScreen.vue` or dialogue.

There is no general first-class `quality tier` metadata in current trade code. Therefore "premium/high-quality" must initially be an explicit small classification over existing ItemKinds (for example masterwork/damascus/high-end weapons/armor/books already present in the catalog), ideally colocated with assortment policy. Do not infer premium from price thresholds: prices are economy data and would couple balance changes to rarity semantics.

The plan says no new quality tiers, so do not expand `ItemKind` or equipment-instance quality just for this feature.

## Settlement-level premium roll

The ~80% XL target must be resolved once per settlement, not once per Merchant/item.

Recommended flow:

```text
settlement seed + dedicated salt
→ premium outcome / bounded premium budget
→ eligible premium candidates after region + specialization policy
→ assign at most the allowed initial finite stock to concrete Merchant owner(s)
```

Then Merchant count only affects distribution/coverage, not the probability itself.

For smaller sizes use lower calibrated probabilities but keep them non-zero. Tests should operate over many deterministic seeds and assert approximate distribution bands rather than exact counts for a single seed.

## Region mapping

Use existing `SettlementTerrain = 'ocean' | 'mountain' | 'swamp' | 'desert' | 'forest'`; do not create a geopolitical region model.

The plan's "coast" maps to current `terrain === 'ocean'` and existing dock presence. Keep swamp/desert with neutral/default biases unless there is a concrete current ItemKind set worth preferring; do not invent flavor goods.

`VillageIdentity.dominantResource` can strengthen a terrain bias where useful, but should remain an input to the same policy, not a second assortment system.

## Ordinary specialist NPCs

`npcTradeAvailability.ts` is intentionally whitelist-based. Extend it only for goods whose ownership and reserve semantics are already real. Do not make all `Household.items` sellable merely because this plan mentions Blacksmith/Textile/Herbalist fit.

When later production chains create concrete owned goods, adding a reserve resolver there should automatically make them available through the existing generic NPC trade path. This plan should not fabricate specialist inventory to make every profession look stocked.

## Persistence / initial stock

If Merchant finite stock needs a new persisted record, keep it authoritative and minimal: item inventory + stable owner identity. Do not persist specialization, region bias, premium roll result or rendered offer rows when those can be deterministically derived from stable inputs plus the remaining owned stock.

Generation-time seeding must be idempotent across streaming/rebuild/save-load. A "stock missing" check is unsafe if sold-out stock is represented by absence; it would reseed after the last item is bought. Use an explicit initialized marker or existing persistent owner state whose creation itself is stable and saved.

This is the highest-risk part of the plan.

## Pricing / UI boundaries

Keep `tradeCatalog.ts` social pricing authoritative. Region, size, specialization and premium classification decide *what can exist in stock*, never a second price multiplier.

Generalize current Merchant session input so the BUY rows come from the resolved finite Merchant stock instead of `MerchantScreen.vue` reading the global `MERCHANT_STOCK` directly. The screen may still use catalog metadata for labels/categories/filtering.

Commit must revalidate current stock exactly like ordinary NPC trade does; opening the screen never reserves items.

## Coastal landmark

Current dock is already `VillagePlan`/runtime landmark state with `dockRoute` consumed by Fisher pathing. If the visual small-port extension is implemented, keep the same `dock` identity/routing and change only planned/materialized presentation/footprint. Do not add a port simulation or use the dock as Merchant-stock ownership.

This visual subsection can be staged after the trade/state work; it is not required for correct regional assortment.

## Recommended implementation order

1. Add pure merchant profile + assortment policy module and deterministic tests.
2. Extend `professionStaffing.ts` Trader duplicate policy and tests.
3. Introduce finite authoritative Merchant stock/seeding semantics and persistence-safe initialization; update transaction path to consume it.
4. Remove home-only Merchant classification in `inventoryWiring.ts`; keep home-only extras optional.
5. Feed Merchant UI from live resolved stock, preserving existing social pricing and filters.
6. After/with settlements-011 central-layout work, extend indexed market landmarks/materialization and stable Trader→stall workplace assignment.
7. Optional coastal dock visual extension last.

## Primary files to recon/edit

- `src/settlement/professionStaffing.ts` + tests
- `src/settlement/families.ts`
- `src/settlement/villagePlan.ts`
- `src/settlement/villagePlanner.ts` + tests
- `src/settlement/props.ts`
- `src/settlement/places.ts` + tests
- `src/items/tradeCatalog.ts`
- `src/items/trade.ts`
- `src/ai/npcTradeAvailability.ts`
- `src/app/inventoryWiring.ts`
- `src/ui-vue/screens/MerchantScreen.vue` / trade store session types
- persistence owner/state files only if finite Merchant stock cannot reuse an existing persisted inventory cleanly

## Main pitfalls

- Filtering global `MERCHANT_STOCK` without finite ownership creates infinite rare goods.
- Seeding "when empty" respawns sold-out stock after load/streaming.
- Independent premium rolls per Merchant overshoot the settlement-level probability.
- Independent specialization rolls lose intended diversity.
- Multiple planned markets are insufficient unless runtime landmarks and `workplaceFor()` stop collapsing them to index 0.
- Reusing the current home-only Merchant predicate silently disables regional Merchants.
- Using item price as quality metadata makes rarity change when economy balancing changes.
- Implementing stalls before settlements-011 with a separate clearance mechanism creates immediate architectural duplication.

Do not run browser verification; manual browser verification remains the user's responsibility.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
