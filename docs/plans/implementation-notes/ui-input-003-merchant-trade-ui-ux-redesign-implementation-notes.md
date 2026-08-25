# Merchant Trade UI/UX Redesign — Implementation Notes

**Reviewed:** 2026-08-25

## Current-state findings

- `MerchantScreen.vue` is already Vue and owns substantial presentation state, but it is **not** the C1 model from the plan: it currently has one shared `categoryFilter` / `priceFilter` / `sortMode`, a seller/merchant column plus player offer column, and a single `barterKind`. Opening the screen resets selection, filters and offer state. The BUY/OFFER independence and persistent transaction state therefore need real state separation, not just CSS changes.
- Trade execution already belongs in `src/items/trade.ts`; keep `buyWithCoins`, `buyWithBarter`, `sellForCoins` and instance-selling as the domain source of truth. `inventoryWiring.ts` is the application/UI boundary and already refreshes the merchant view after successful trades and sends success toasts.
- `trade.ts` currently has **no mixed transaction/basket execution primitive**. Its operations are individually atomic. A C1 `TRANSACTION` containing both purchases and offers cannot safely be implemented by blindly executing several existing callbacks on `TRADE`: a later failure could leave an earlier operation committed. If the final UX requires one atomic mixed transaction, add the smallest domain-level orchestration in `trade.ts` rather than implementing transaction semantics in Vue. Do not silently accept partial trades.
- Current merchant stock is a static `MERCHANT_STOCK`/`MERCHANT_PRICES` catalog. There is no merchant-owned runtime stock quantity in the audited trade path. Do not invent stock depletion/restocking merely to satisfy the plan's "merchant stock changed" case. Current consistency checks can validate catalog availability, price and player inventory; real stock-change handling requires an actual merchant-stock system first.

## State ownership

- Keep UI-only selection/filter/sort state in `MerchantScreen.vue` (or a small merchant composable if the component becomes unwieldy). Use separate state objects for BUY and OFFER, e.g. `{ search, category, capability, price, sort }` per context.
- Keep transaction selections separate from list filtering. Filtering/sorting must never mutate the selected transaction entries.
- Do not copy item definitions, prices, capabilities or instance condition into a second merchant model. `ITEM_DEFS`, `ITEM_CATALOG`, `InventoryGroupView`, `tradeCatalog.ts` and instance data remain the sources of truth.
- `ui.merchant` is already the facade/state boundary exposed by `store.ts`; `inventoryWiring.ts` owns domain callbacks. Extend these contracts only where the new UI genuinely needs a new application boundary. Do not move trade rules into Vue.

## Item data / details

- `ITEM_DEFS` provides label, categories, description, weight and size. `ITEM_CATALOG` provides capabilities and gameplay-facing item metadata/configs. `InventoryGroupView` already exposes instance condition and instance sell price.
- Item Details should derive from these existing structures. Capabilities must come from `ITEM_CATALOG.capabilities`; do not add UI-only capability flags. Damage/weapon data should come from the existing catalog configs where present.
- Condition is instance-specific. A grouped weapon/trap row cannot truthfully show one condition unless `InventoryGroupView.condition === 'uniform'`; use the existing instance rows for mixed-condition details.

## Filtering / sorting

- Existing categories are `resource | tool | utility | food | weapon`; there is no category tree. Do not introduce a hierarchical taxonomy merely for the UI. A flat category filter is the current canonical data model; hierarchy would need a separate design decision.
- Existing sorting is only Name / Price ascending / Price descending. Add Weight/Damage/Condition only where the corresponding data and semantics are already available and the result is useful; avoid creating derived pseudo-stats just for sorting.
- Capability filtering is feasible through `ITEM_CATALOG`, but the current capability set is operation-oriented (`wood_chopping`, `meat_harvesting`, `soil_digging`, etc.). Do not invent `Can equip` / `Can use` / `Can build` capabilities unless an existing gameplay concept actually supports them.
- Search is not currently present in `MerchantScreen.vue`; treat it as new presentation state, not a domain query.

## Selection / quantity

- Current purchase quantity already goes through `buyWithCoins` / `buyWithBarter`, which validate affordability and both inventory weight and size. Keep the picker bounded in UI for usability, but treat domain validation as authoritative.
- Instance-backed kinds must continue to resolve through the existing instance-aware trade paths. Do not collapse concrete instances into a fake stack merely for the new row UI.
- A selected item should remain rendered in the filtered list. Selection must be keyed by stable `ItemKind` (and by instance id where the UI exposes concrete instances), not by array index.

## Transaction architecture

- The plan's "common basket" is the largest implementation gap. Current barter semantics are target-oriented (`barterKind + offer`), while coin buying and selling are immediate operations. Decide explicitly whether C1's basket is a presentation of the existing operations or a new atomic transaction contract.
- Preferred architecture if the UX requires one `[TRADE]`: create a small `TradeTransaction`/execution contract in the item/trade domain that validates the complete proposed transaction first, then applies all mutations. Reuse existing pricing, instance selection, `wouldFitAfter`-style capacity rules and item-instance creation instead of duplicating them.
- Do not implement a sequence of `onSellCoins()` / `onBuyCoins()` / `onBuyBarter()` calls behind one button unless the sequence is proven atomic and all failure cases are prevalidated. Existing callbacks are intentionally single-operation boundaries.
- Keep the transaction summary derived from the pending transaction state. For coin mode, `To pay = purchases - coin proceeds`; for positive net proceeds show `You receive`. Do not allow negative `To pay` presentation.

## Feedback / consistency

- Continue using `showToast()` / the existing `ToastStack`; no merchant-specific notification mechanism.
- Existing `TradeResult` is deliberately compact: `ok | cannot_afford | full | not_sold | invalid_offer`. UI can translate these into clear messages, but domain result values should not be duplicated or expanded solely for wording.
- `full` covers the existing inventory weight **and size** constraints. Do not describe it only as "too heavy" in new UI.
- Current trade handlers re-sync the merchant inventory after success. Preserve that flow. Any new transaction path must perform the same HUD/inventory/merchant synchronization through `inventoryWiring.ts`.
- The plan mentions price/offer/stock changes while the UI is open. Since the current merchant catalog is static and simulation/modal flow does not provide a live merchant-stock stream, first validate the actual mutable sources at trade execution. Do not add polling or fake live state.

## Responsive / overlay integration

- `MerchantScreen.vue` already uses `useOverlayScreen('merchant', ...)`, touch scrolling and the shared `closeTopOverlay`/Escape stack. Preserve this architecture. Do not add a second Escape listener or local overlay stack.
- `App.vue` already mounts `MerchantScreen` with the other Vue overlays. Keep normal merchant UI within the existing modal layer; verify any new Item Details modal/drawer stacking against the global overlay order before adding z-indexes.
- The current mobile implementation is a compact two-column-to-one-column layout with collapsible filters. The plan's M1 drawer is therefore a structural redesign, not merely responsive sizing. Use `isTouchDevice()` plus viewport height/orientation constraints rather than assuming `max-md` alone means mobile landscape.
- Keep the transaction summary/action area outside the transaction list scroll container. Avoid nested full-height scroll regions on short landscape viewports unless browser testing proves they are usable.

## Important pitfalls

- Do not reset filters, selections or transaction state when switching BUY/OFFER contexts; the current `watch(ui.merchant.open)` reset behaviour must be deliberately replaced, not accidentally retained.
- Do not make the filtered BUY list drive the OFFER list. They currently share filtering helpers/state; this is exactly the coupling the plan wants removed.
- Do not remove selected entries from the source list after selection. Selection styling and quantity controls should be overlays on stable rows.
- Do not duplicate merchant prices. `MERCHANT_PRICES` / `merchantPrice()` and `sellPrice()` remain authoritative.
- Do not duplicate condition pricing. `resolveInstanceSellPrice()` is authoritative for concrete instances.
- Do not assume every `ItemKind` can be bought: `MERCHANT_STOCK`/`merchantPrice()` define current buy availability; `canSell()`/`sellPrice()` define coin selling availability.
- The current UI's `barterKind` subtitle and immediate `barter()` path are tied to the old model. Refactoring this into a basket must preserve the distinction between the item being acquired and the offered items.

## Recommended implementation order

1. Audit the exact current `MerchantScreen.vue` template and `ui.merchant`/`inventoryWiring.ts` contract before editing.
2. Resolve the mixed-transaction atomicity decision before building the C1 `[TRADE]` button semantics.
3. Extract small reusable row/filter/quantity presentation pieces only where they reduce the existing component's complexity; avoid a broad UI framework abstraction.
4. Introduce independent BUY/OFFER filter/search/sort state and persistent selection state.
5. Implement A2 selection and transaction summary using the existing item/trade data.
6. Add the Item Details modal from `ITEM_DEFS`/`ITEM_CATALOG`/`InventoryGroupView`.
7. Implement M1 as a real context switch + transaction drawer, reusing the same transaction state rather than maintaining a second mobile state model.
8. Route all execution and post-trade synchronization through the existing application/domain boundaries.
9. Only then remove obsolete MerchantScreen state/helpers confirmed to be unused.

## Verification focus

Browser verification is especially important for: independent BUY/OFFER state, selection surviving filtering/context changes, mixed transaction failure/atomicity, instance-backed item details, long transaction lists with fixed summary/action area, short landscape viewport, drawer/modal stacking, Escape/back behaviour, and inventory weight+size rejection. Technical checks from the plan remain appropriate.

**Zrób git commit i push do main, rebase jeżeli trzeba**
