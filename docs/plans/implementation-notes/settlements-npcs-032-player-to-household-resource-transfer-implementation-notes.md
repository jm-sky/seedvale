# Implementation notes: settlements-npcs-032 — Player → household resource transfer

## 1. Verified ownership and mutation seams

`src/settlement/household.ts` is already the authoritative household owner. Keep the new operation as a thin transaction around the existing mutations; do not expose `Household.items` / `Household.stock` to UI code.

- food authority: `Household.items: Inventory`; aggregate state is `foodCount()` / `shortage('food')`;
- wood authority: `Household.stock: EconomicStock`; aggregate state is `stock.query('wood')` / `shortage('wood')`;
- accepted mutations: `depositFood(itemKind, amount, economy, simTime, batches)` and `deposit('wood', amount, economy, simTime)`;
- both methods already own capacity, overflow and household history, including `shortage.resolved` transitions.

The new `src/settlement/householdResourceTransfer.ts` should own the player/NPC-neutral source-inventory → household transaction. It must depend on `Inventory`, `Household`, `SettlementEconomy`, item classification/conversion helpers and time only — no `PlayerController`, Vue, quests, Three.js or app globals.

## 2. Food classification and freshness

Do not introduce a food-kind list. `src/items/foodItems.ts` already exports `FOOD_ITEM_KINDS`, derived from `ItemCategory = 'food'`, and the existing freshness path is `Inventory.removeWithFreshness()` / `addWithFreshness()`.

For a requested concrete food kind:

1. validate `itemKind` against the canonical food classification (`FOOD_ITEM_KINDS` or the underlying `hasItemKindCategory(kind, 'food')`);
2. validate a positive integer amount and `source.has(itemKind, amount)` before mutation;
3. remove with `source.removeWithFreshness(itemKind, amount, nowDays)`;
4. pass the exact returned `FoodBatch[]` to `household.depositFood(itemKind, amount, economy, nowDays, batches)`.

Do not use `claimFoodItems()` for this UI operation: that helper deliberately spans several food kinds, while the transfer row identifies one concrete `ItemKind`. Do not use `transferInventoryCount()` as the destination is not a generic Inventory transaction: `depositFood()` must remain the capacity/overflow/history owner.

`depositFood()` already splits transferred batches for household vs settlement overflow with the shared batch helpers. Preserve the source batch metadata rather than reconstructing batches in the transfer operation.

## 3. Wood policy: reuse the existing fuel utility, but narrow accepted kinds

Current code already has a canonical branch-equivalent conversion in `src/items/itemFuel.ts` / `ITEM_CATALOG[kind].utility.fuel.value`:

- `branch` → `fuelValue('branch') === 1`;
- `beam` → `fuelValue('beam') === 2`.

`cone` is also fuel, but it is kindling rather than the established wood-material model. Therefore V1 household wood accepts **exactly `branch` and `beam`**, and uses their existing `fuelValue()` as household wood contribution. Do not accept every future `isFuel()` item automatically and do not duplicate numeric conversion constants.

Recommended shared declarations beside the transfer operation:

```ts
export const HOUSEHOLD_WOOD_ITEM_KINDS = ['branch', 'beam'] as const

export function householdWoodValue(kind: ItemKind): number | null {
  if (kind !== 'branch' && kind !== 'beam') return null
  return fuelValue(kind)
}
```

This deliberately makes eligibility explicit while conversion remains catalog-driven. A later fuel item cannot silently become household wood.

Wood transaction order: validate request/source first → compute `contribution = householdWoodValue(itemKind) * amount` → remove exactly `amount` source items → `household.deposit('wood', contribution, economy, nowDays)`.

## 4. Deposit return contract required for lossless semantic results

Today `Household.deposit()` and `depositFood()` return `void`, although they already calculate the amount kept vs overflowed for history/economy routing. Extend both to return the same small value object rather than re-deriving capacity in `householdResourceTransfer.ts`:

```ts
export type HouseholdDepositResult = {
  storedInHousehold: number
  overflowedToSettlement: number
}
```

Existing callers may ignore it. The result units are household resource units: food units for `depositFood`, scalar wood units for `deposit('wood')`.

Important existing behavior: when no `SettlementEconomy` is supplied, overflow is currently dropped. The player-facing transfer must always resolve and pass the household's matching settlement economy, so a successful player transfer cannot destroy overflow. Keep the generic `Household` API's existing nullable-economy behavior for old callers; enforce the stronger invariant in the new transfer operation/app adapter.

## 5. Final domain operation contract

Use a discriminated request and semantic result. Keep `itemKind` on wood requests because source ownership is concrete inventory items.

```ts
export type HouseholdTransferRequest =
  | { resource: 'food'; itemKind: ItemKind; amount: number }
  | { resource: 'wood'; itemKind: ItemKind; amount: number }

export type HouseholdTransferResult =
  | {
      status: 'transferred'
      resource: 'food' | 'wood'
      itemKind: ItemKind
      sourceAmount: number
      resourceAmount: number
      storedInHousehold: number
      overflowedToSettlement: number
    }
  | { status: 'invalid_resource_item' }
  | { status: 'invalid_amount' }
  | { status: 'source_shortage' }

export function transferResourceToHousehold(input: {
  source: Inventory
  household: Household
  economy: SettlementEconomy
  request: HouseholdTransferRequest
  nowDays: number
}): HouseholdTransferResult
```

`sourceAmount` is the count removed from the source inventory; `resourceAmount` differs only for wood conversion (e.g. one beam consumes 1 inventory item and contributes 2 wood units). This prevents UI from guessing conversion or capacity results.

Add JSDoc with `@domain settlements-npcs` to this public operation.

## 6. Interaction/UI seam

Verified current path:

- `src/app/interactables.ts` builds `householdStorage` candidates with the exact live `Household`;
- `Interactable` stores that live household reference;
- `interactionView.ts` already keys it by stable `household.id`;
- `resolveInteraction.ts` currently handles `[E]` as a read-only generic flavor dialog via `formatHouseholdStorage()`;
- `gameLoop.ts` sends ordinary targets to `resolveInteraction()`; targets requiring player inventory are already handled directly in the app/game-loop layer.

Follow the established inventory-access pattern: intercept `target.kind === 'householdStorage'` in `gameLoop.ts` and call an app action such as `openHouseholdResourceTransfer(target.household)`. Do not make `resolveInteraction.ts` depend on player inventory. The action must use the live `Household` from the target, then resolve `bundle.settlementsManager.getEconomy(household.settlementId)`; do not bind by NPC name, home display label or array index.

`ContainerScreen` is not a suitable domain model for the destination: its stock side is an `Inventory` (`containerCounts` / `containerGroups`), while household wood is scalar `EconomicStock`. Reusing it by fabricating a `wood` ItemKind or mirroring household stock into an Inventory would create a second representation. Prefer a small `HouseholdResourceTransferScreen`/store state that presents:

- live household summary: food count/capacity-relevant state and wood quantity;
- only transferable player rows: `FOOD_ITEM_KINDS` currently held plus held `branch`/`beam`;
- quantity control per row using the existing quantity-dialog/stepper presentation conventions;
- one deposit callback `(kind, amount)`; no withdraw/instance/take-all actions.

The Vue layer receives presentation rows/result callbacks only. It must not call `Household` or compute wood conversion/capacity itself. The app action invokes `transferResourceToHousehold`, refreshes the screen from live state, calls `ctx.onInventoryChanged()` / HUD inventory-weight refresh through the same app conventions as container actions, and shows success/error feedback from the semantic result.

The existing `formatHouseholdStorage()` can remain for non-transfer/debug reuse, but `[E]` on `householdStorage` should now open the transfer UI; include the same current food/wood/water values in the new screen so inspection capability is not lost. Water remains display-only in this plan.

## 7. App composition points

Recommended files/symbols:

- new `src/settlement/householdResourceTransfer.ts` — domain transaction + explicit wood eligibility/conversion;
- `src/settlement/household.ts` — `HouseholdDepositResult`, return values from `deposit` / `depositFood`, and stale `HouseholdSnapshot` comment correction;
- new `src/app/actions/householdResourceTransferActions.ts` — live target/economy resolution, UI refresh, inventory/HUD notification;
- `src/app/createApp.ts` — construct/configure the action with existing `PlayerActionContext`/`VueUi`;
- `src/app/gameLoop.ts` — direct `householdStorage` interaction branch, same architectural reason as other inventory-backed interactions;
- `src/ui-vue/store.ts`, `src/ui-vue/mount.ts`, `src/ui-vue/App.vue`, new screen component — presentation-only transfer state;
- `src/interaction/resolveInteraction.ts` — only adjust comments/dead path if the direct game-loop branch makes its `householdStorage` case unreachable in normal play.

Do not put this operation into `containerActions.ts`; that module owns Inventory ↔ Inventory container/corpse sessions and already has assumptions irrelevant to scalar household wood.

## 8. Persistence is already wired; no schema/version change

The plan's persistence representation already exists:

- `Household.snapshot()` contains scalar stock plus `items.counts`, instances and food batches;
- `src/app/saveState.ts` writes `households: bundle.settlementsManager.snapshotHouseholds()`;
- `src/app/worldBundle.ts` also carries `snapshotHouseholds()` through an in-session rebuild.

No new transfer state is required and `CURRENT_SAVE_VERSION` must not change for this plan.

`src/settlement/household.ts` still contains a stale `HouseholdSnapshot` comment saying it is "Not part of SaveData". Correct that comment while touching the type: it is now both the in-session carry representation and the persisted `SaveData.households` payload.

## 9. Tests to extend/add

Prefer focused tests rather than app-wide fixtures:

- new `src/settlement/householdResourceTransfer.test.ts`: food/wood success, exact target household only, invalid amount/item, source shortage atomicity, `branch=1`, `beam=2`, `cone` rejected despite being fuel, food freshness/provenance preservation, food/wood capacity + settlement overflow conservation, shortage resolution/history;
- extend `src/settlement/household.test.ts`: assert the new deposit return contract for stored/overflow values while retaining existing capacity/history tests;
- app-action test beside `householdResourceTransferActions.ts`: live household target → matching settlement economy → domain operation, refresh/inventory notification; missing/mismatched economy fails without source mutation;
- UI component/store test only for presentation rules: no withdraw controls, water non-transferable, only supplied transferable rows rendered.

Persistence does not need a new migration test. Existing household snapshot/save tests should remain green; add a targeted round-trip only if current tests do not cover food batches plus wood together after mutation.

## 10. Implementation order / guardrails

1. Change `Household.deposit*` to return `HouseholdDepositResult` and lock it with tests.
2. Add/test `householdResourceTransfer.ts`, including explicit `branch`/`beam` eligibility and catalog-driven conversion.
3. Add the thin app action and tests.
4. Add the presentation-only Vue screen/store wiring.
5. Route `householdStorage` interaction to the action and update stale comments/docs encountered in these files.
6. Run targeted Vitest suites and `npx tsc --noEmit`; browser verification remains for the user.

Do not add quest IDs/objectives, delivery counters, a household inventory mirror, a generic storage manager, withdrawal/stealing, water transfer, trade/payment, or a second shortage state.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
