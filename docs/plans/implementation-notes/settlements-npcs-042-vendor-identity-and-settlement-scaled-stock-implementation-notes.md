# Implementation Notes: settlements-npcs-042 — Vendor Identity and Settlement-Scaled Stock

**Plan:** `docs/plans/settlements-npcs-042-vendor-identity-and-settlement-scaled-stock.md`  
**Reviewed:** 2026-09-16  
**Source of truth:** current `main` code + docs.  
**Recon baseline:** `main` at/after `9a28fbc8`.

These notes record only implementation-relevant findings that are not obvious from the plan. Current code wins if it changes before implementation.

## 1. Important current-code delta: merchant assortment cleanup from 040 already landed

Do not reimplement the old `MERCHANT_STOCK` iteration problem described by pre-040 planning.

`src/settlement/merchantTrade.ts::generateMerchantAssortment()` now already:

- computes `specializationAffinity()` per eligible kind;
- combines it with `regionalClass()` / `regionWeight()`;
- sorts by score;
- deterministically shuffles equal-score groups using the merchant-specific seeded RNG;
- fills only after that ranking;
- excludes premium goods from normal fill and assigns premium through the existing settlement-level premium path.

This means 042 should treat the merchant selection algorithm as an implemented foundation and add only missing availability/bias rules demonstrated by tests.

In particular, `specializationAffinity(kind, 'general')` currently returns `2` for every non-premium good. Therefore `short_sword`, basic tools and ordinary armor are **already eligible** for a `general` Merchant. The 042 requirement is primarily a regression/coverage contract, not a reason to create a second general-merchant catalog.

If focused tests show a practical coverage problem, adjust the existing scoring/guarantee rules. Do not restore ordered catalog iteration and do not create specialization-specific stock arrays.

## 2. Merchant ownership, persistence and materialization are already complete

Relevant code:

- `src/settlement/npcState.ts`
  - `merchantStock`
  - `merchantStockInitialized`
- `src/settlement/merchantTrade.ts`
  - `generateMerchantAssortment()`
  - `seedMerchantStockIfNeeded()`
  - `merchantStockQuantity()`
  - `resolveMerchantArmorQuality()`
- `src/settlement/createSettlement.ts`
  - resolves `MerchantProfile`s and the assortment, then seeds the persistent NPC state.

`seedMerchantStockIfNeeded()` is the one-time materialization seam. The persisted `merchantStockInitialized` latch is what prevents sold stock from returning after reconstruction/save-load.

Do not add another Merchant bootstrap flag or derive refill from an empty inventory.

`generateMerchantAssortment()` should remain `ItemKind -> quantity`. Instance quality belongs to stock materialization, not assortment selection.

## 3. Home SM guarantee: extend the existing overlay, do not add another starter system

`HOME_STARTER_MERCHANT_KINDS` already guarantees on the first home Merchant:

- `backpack`
- `tent`
- `firestarter`
- `blanket`
- `waterskin_small`
- `knife`
- `axe`
- `pickaxe`
- `bandage`

`generateMerchantAssortment()` applies this overlay **after** normal finite assortment selection, so these guarantees are not consumed by `skuBudget` and do not replace regional stock.

The only required home item from plan §5 missing from this existing overlay is `leather_pauldron`.

Prefer making the home guarantee explicit in this same mechanism rather than depending on whether the generated home settlement happens to contain a Hunter/Blacksmith household. The reserved home Trader already makes Merchant stock the robust settlement-level guarantee point.

### Guaranteed low-quality leather pauldron

Simply adding `leather_pauldron` to `HOME_STARTER_MERCHANT_KINDS` guarantees the kind but **does not guarantee `poor` quality**.

Current Merchant armor materialization uses:

```text
seedMerchantStockIfNeeded()
→ resolveMerchantArmorQuality()
→ MERCHANT_ARMOR_QUALITY_WEIGHTS[size]
```

For `SM`, the current weights still allow `common`, `good` and `masterwork`.

Therefore add the narrowest quality-override signal to the existing Merchant materialization contract for guaranteed starter armor. Recommended shape is a per-kind deterministic override supplied only for the home starter guarantee, e.g. conceptually:

```ts
forcedArmorQuality?: Partial<Record<ArmorKind, ArmorQuality>>
```

or an equivalent explicit `homeStarterKinds` context checked during materialization.

Do **not** special-case the item inside `createArmorInstance()`, do not change the global SM quality weights, and do not create a vendor-specific quality system. Only the guaranteed home starter specimen needs forced `poor`; ordinary SM armor should keep using `resolveMerchantArmorQuality()`.

## 4. Specialist stock is now isolated in `householdProfessionStock.ts`

Plan 040 moved the profession bootstrap out of generic household logic.

Relevant code:

- `src/settlement/householdProfessionStock.ts`
  - `householdStartingContextFromFamily()`
  - `applyProfessionTradeStock()`
  - current Hunter / Woodcutter / Farmer / Blacksmith starter arrays
  - `addStarterGrant()`
- `src/settlement/household.ts`
  - `HouseholdStartingContext`
  - `createHousehold()` calls `applyProfessionTradeStock()` only when `!initial`
  - `HouseholdSnapshot.items` persists the resulting inventory
- `src/settlement/createSettlement.ts`
  - family → `householdStartingContextFromFamily(family)` → household registry construction.

The genuine-first-construction gate already exists:

```ts
if (!initial && starting) applyProfessionTradeStock(items, starting)
```

Preserve it. No new persisted bootstrap marker is required for 042 unless current construction paths change during implementation.

## 5. Missing seam for settlement-scaled specialist stock

The important 042 gap is that `HouseholdStartingContext` currently contains only profession coverage:

- `hasHunter`
- `hasWoodcutter`
- `hasBlacksmith`
- `adultFarmerCount`

It does **not** contain:

- `VillageSize`
- `SettlementTerrain`
- dominant resource
- `isHome`
- a stock-generation seed.

Consequently `applyProfessionTradeStock()` currently gives the same specialist starter goods in every settlement. For example, every Hunter household gets `short_bow`, `hunting_bow`, `waterskin_small`, `backpack`, `leather_pauldron`, `leather_armor` and `saddlebags` regardless of settlement size.

Do not persist immutable settlement context into `HouseholdSnapshot`. It is needed only to deterministically generate first-construction stock.

Recommended boundary:

```text
createSettlement(def)
→ derive compact HouseholdTradeStockContext from existing SettlementDef/VillagePlan data
→ householdStartingContextFromFamily(family, tradeContext)
→ createHousehold(... starting)
→ applyProfessionTradeStock(items, starting)
```

It is fine to split profession coverage from settlement stock context if that keeps `HouseholdStartingContext` understandable, e.g. a nested `tradeStock` context. Avoid passing a whole `SettlementDef` into `household.ts`.

Use stable existing settlement/family inputs for determinism. Do not call `Math.random()` and do not derive rarity from runtime NPC instances.

## 6. Specialist quality needs to reuse armor instance contracts, not Merchant-specific semantics blindly

`householdProfessionStock.ts::addStarterGrant()` currently handles every instance-backed item using `createAcquiredInstance(kind)`. That is adequate for identity-backed goods but does not express settlement-size armor quality policy.

Armor now has a dedicated quality contract (`createArmorInstance`, `ArmorQuality`, `isArmorKind`) used by Merchant seeding.

For 042, introduce one shared/small quality-selection seam usable while materializing specialist starter armor. Do not route a Blacksmith/Hunter through `resolveMerchantArmorQuality()` with a fake `MerchantSpecialization`; that would couple profession stock to Merchant presentation semantics.

Acceptable implementation direction:

```text
settlement size + deterministic seed + specialist context
→ ArmorQuality
→ createArmorInstance(kind, quality)
```

Reuse the same `ArmorQuality` model and, where practical, the same size-primary weight data/helper rather than copying the probability table. If a small extraction from `merchantTrade.ts` to a neutral item/settlement-quality helper is needed, keep it focused.

The special home `leather_pauldron=poor` guarantee remains an explicit override, not a probability roll.

## 7. Regional specialist bias should reuse existing classifications where ownership allows

`merchantTrade.ts` already owns concrete regional classification sets:

- `METAL_KINDS`
- `HUNTING_KINDS`
- `IMPORT_FLAVOR_KINDS`
- `regionalClass()`

These are currently private and Merchant-oriented.

Before duplicating `mountain/iron → metal` and `forest → hunting` tables inside `householdProfessionStock.ts`, decide whether the classification itself is truly generic. If yes, extract only the reusable classification/predicate into a focused neutral helper and keep Merchant scoring in `merchantTrade.ts`.

Do not export private Merchant internals wholesale just to call them from specialist bootstrap. Conversely, do not introduce a second large biome→goods map that will drift from Merchant regional logic.

The specialist stock policy may remain simpler than Merchant stock; the key is one coherent source for shared regional facts.

## 8. Vendor identity can be a pure Role resolver in V1

Current `Role` is defined in `src/ai/characters.ts` and contains all three V1 vendor identities directly:

```text
trader
blacksmith
hunter
```

No Merchant profile lookup is needed merely to decide whether to show the vendor marker. `MerchantSpecialization` describes what a Trader sells; it is not needed to establish that the Trader is a vendor.

Prefer a tiny UI-independent semantic module, e.g. `src/ai/npcVendor.ts` or another existing settlements-NPC semantic location:

```ts
export type NpcVendorKind = 'merchant' | 'blacksmith' | 'hunter'
export function resolveNpcVendorKind(role: Role): NpcVendorKind | null
```

Give the public resolver JSDoc with `@domain settlements-npcs`.

Do not place this resolver in `agentStatusLabel.ts`; the UI should receive resolved semantic presentation data.

Do not consult `resolveNpcTradeOffers()`. Vendor identity must remain stable when stock is empty.

## 9. Label integration must preserve the shared NPC/fauna controller

`src/ui/agentStatusLabel.ts` is shared by `NpcAgent` and `AnimalAgent`.

Current first row is:

```text
nameEl + quest markerEl
```

and `AgentStatusLabelController` currently exposes `setName()` and `setQuestMarker()` but no generic secondary marker API.

Add vendor presentation in a way that leaves AnimalAgent callers valid. Prefer an optional controller input/method rather than adding profession-specific DOM access in `NpcAgent`.

A practical shape is:

- create a separate `.npc-label__vendor-marker` element in the existing name row;
- expose `setVendorMarker(...)` or an optional presentation field;
- default to hidden/null, so fauna behavior remains unchanged;
- add CSS next to existing `.npc-label__marker` styles in `index.html` rather than inline style mutations spread across callers.

### Observation gating

`AgentStatusLabelController.sync()` already receives `AgentLabelObservationPresentation` and resolves `none/basic/assessed/detailed` centrally.

Do not make the vendor marker permanently visible just because the constructor knows the role. Gate its display from the same resolved observation level. The safest V1 contract is to show vendor identity only at `detailed` (and debug/full-label bypass), because this is the level that already authorizes the known personal label + quest marker.

Keep the marker DOM present but hidden for lower levels rather than re-resolving professions in the renderer.

Update `src/ui/agentStatusLabel.test.ts` around observation transitions; do not rely only on an `NpcAgent` integration test.

## 10. Generic NPC trade should be left architecturally untouched

Current `docs/STATE.md` and code reflect the 033 behavior: ordinary dialogue can open `Handel` for any NPC; it is not gated on `role === 'trader'` and an empty `resolveNpcTradeOffers()` still opens the shared screen in `npcGoods` mode.

`src/ai/npcTradeAvailability.ts` remains the source of sellable owned goods. `src/app/inventoryWiring.ts` re-resolves live offers/ownership before commit.

042 should not change this to "only vendors can trade" and should not hide `Handel` merely because a Woodcutter has no vendor marker.

The required test is semantic separation:

```text
woodcutter + eligible owned axe
→ no vendor marker
→ trade path still works
```

## 11. Suggested specialist policy implementation shape

Keep the stock policy declarative and bounded. Avoid a long nested `if (size === ...)` mutation sequence.

A useful internal shape is a resolver that returns grants before mutation:

```ts
resolveProfessionStarterGrants(startingContext): readonly StarterGrant[]
```

Then keep `applyProfessionTradeStock()` as the mutation boundary.

Benefits:

- deterministic policy can be unit-tested without Inventory;
- size/region/home differences are easy to compare;
- `addStarterGrant()` remains the only materialization path;
- no stock is inferred from current inventory state.

Do not turn this into a generic economy planner or reusable shop catalog framework.

## 12. Tests to extend rather than duplicate

Primary existing test homes:

- `src/settlement/merchantTrade.test.ts`
  - deterministic profile/assortment/premium behavior;
  - home overlay;
  - one-time stock seeding;
  - armor quality resolver.
- `src/settlement/householdProfessionStock.test.ts` if present on current implementation; otherwise keep specialist policy tests next to the new helper/module rather than in broad settlement integration tests.
- `src/ai/npcTradeAvailability.test.ts`
  - explicit sellability and exact owned stock semantics.
- `src/ui/agentStatusLabel.test.ts`
  - DOM/observation behavior.
- `src/ui-vue/npcDialogueTrade.test.ts`
  - only if semantic separation needs dialogue-level regression coverage.

High-value focused assertions beyond the plan:

1. `general` specialization keeps `short_sword` eligible without a dedicated catalog.
2. home overlay includes `leather_pauldron` even when no specialist household exists.
3. the guaranteed home pauldron materializes exactly once with `poor` quality.
4. a normal SM Merchant armor piece still uses normal SM quality distribution/seeded resolver — the home override does not contaminate all SM armor.
5. specialist grant resolution differs by size for the same profession and deterministic seed.
6. restoring a household snapshot bypasses the scaled bootstrap exactly as current `!initial` behavior requires.
7. vendor marker survives empty stock because it is role-derived, but disappears at lower observation levels.
8. AnimalAgent label construction/sync remains unchanged when no vendor marker is supplied.

## 13. Recommended implementation order

1. Add pure vendor semantic resolver + tests.
2. Extend shared label/controller + observation gating + CSS/tests; wire `NpcAgent` with resolved vendor kind.
3. Add home `leather_pauldron` availability and narrow `poor` quality override through existing Merchant seeding; test one-time persistence semantics.
4. Extend first-construction specialist context with settlement size/terrain/resource/home/seed without persisting it.
5. Refactor profession stock to pure grant resolution + existing apply/materialization boundary; add settlement scaling and regional bias.
6. Extract/reuse neutral armor-quality/regional helpers only where duplication is otherwise real.
7. Run existing merchant/trade/household/label focused suites and update STATE/docs only if public contracts changed.

Do not combine this with Blacksmith orders, replenishment, travelling merchants or production-chain expansion.

## 14. Model choice

Recommended plan metadata: `Sonnet, Grok`.

The implementation is medium-sized and crosses settlement generation, deterministic stock policy, instance-backed quality and shared UI presentation. Sonnet is the safer primary choice for ownership/persistence and cross-module integration; Grok is a reasonable lower-cost fallback because the required architecture and call sites are now bounded by these notes.
