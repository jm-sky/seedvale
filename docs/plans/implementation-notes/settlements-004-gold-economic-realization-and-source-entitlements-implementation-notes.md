# Implementation notes — settlements-004 — Gold economic realization and source entitlements

## Current-main findings that change the plan baseline

- `world-018` is implemented. Abandoned-mine gold is generated in `src/terrain/abandonedMineDeposits.ts` as ordinary `MineableDepositDefinition`s with stable deposit ids `${mineId}:gold:${slot}` and finite `initialReserve`; the definition currently carries **no economic-source identity**.
- Mining flow changed after `settlements-npcs-021`: `src/ai/npcProfessionWork.ts::planOreGathering()` mines into `ResourceSiteInventories` keyed by deposit/resource id. It does **not** credit `SettlementEconomy` directly.
- Ore becomes settlement-owned only after transport unload. The common conversion seam is `src/economy/oreTransportDemand.ts::creditDeliveredOreToStock()`, called by loaded Trader completion, `src/world/transportTravelArrival.ts`, and `src/world/transportOffscreen.ts`. Source attribution belongs here, after successful delivery, not at `ResourceDeposits.mine()` and not in the miner planner.
- Current ore logistics only creates demand for iron/coal (`ORE_TRANSPORT_KINDS`). Gold can accumulate at a resource-site inventory indefinitely. This plan therefore still needs a gold-realization trigger; do not assume `settlements-npcs-037` already exports arbitrary commodities.
- `SettlementEconomySnapshot` currently persists `stock`, concrete `food`, and optional `productionShortages`; `EconomyRegistry` reconstructs directly from this snapshot and `SaveData.settlementEconomies` already owns the persistence path.
- Pricing has changed since the plan was written: `tradeValue('gold')` is currently `20`; neutral `sellPrice('gold')` is derived from that and the sell factor. Do not copy the old planning value `10`.

## Source identity / provenance contract

Do not derive entitlement ownership by parsing a deposit id even though abandoned-mine ids currently contain `mineId`.

Add an optional stable source field at the canonical world-resource boundary, preferably on `MineableDepositDefinition` and propagated through `DepositTarget`, e.g. `economicSourceId?: EconomicSourceId`. `generateAbandonedMineGoldDeposits()` should assign one source id shared by every slot of the same mine, derived from the stable `mineId` (for example `mine:${mineId}` via a helper). Ordinary procedural deposits omit it.

The resource-site/transport chain must preserve this provenance until settlement delivery. Avoid duplicating source metadata inside item stacks. The smallest safe choices are:

- resolve `resourceId -> economicSourceId` from the canonical deposit definition when crediting delivery, or
- carry optional `economicSourceId` on the transport order/source endpoint when the order is created.

Prefer the first if current lookup hooks can resolve landmark-owned deposit definitions off-screen; otherwise carry the explicit field on the order. Do not parse ids in `oreTransportDemand.ts`.

## SettlementEconomy ownership

Keep accounting state inside `SettlementEconomy` and its snapshot. `EconomicStock` remains the aggregate quantity owner; source accounting is additional sparse metadata.

Suggested internal persisted shape:

```ts
sourceAccounting?: {
  unrealized: Record<EconomicSourceId, Partial<Record<EconomicKind, number>>>
  entitlements: readonly SourceEntitlementSnapshot[]
  realizations: readonly SourceRealizationSnapshot[]
}
```

Exact field names are flexible. Persist only non-zero unrealized rows. Restore missing `sourceAccounting` as empty in `createEconomyRegistry()`; no separate registry is justified.

`addAttributed(kind, amount, sourceId, simTime)` should update aggregate stock and source-unrealized quantity in one economy mutation. Existing `add()` remains unchanged.

## Delivery integration

Refactor `creditDeliveredOreToStock()` rather than touching the three unload callers independently. It already is the shared loaded/off-screen post-unload adapter.

After `executeTransportUnload` has placed ore in `economy.items`, the adapter currently removes the delivered item quantity and calls `economy.add(...)`. Extend it to accept optional source provenance and call `addAttributed(...)` when present. This preserves the important invariant that mining alone does not create settlement attribution: only successfully delivered goods do.

Be careful with partial unloads: attribute exactly `result.delivered`, never requested/claimed quantity.

## Realization semantics

Implement realization as one synchronous `SettlementEconomy` transaction:

1. validate positive amount/value and available attributed quantity;
2. validate aggregate stock;
3. remove the same quantity from aggregate stock and source-unrealized accounting;
4. calculate integer `grossValue`;
5. accrue matching entitlements using basis points + persisted remainder;
6. persist the realization/idempotency record before returning success.

Do not use `SettlementEconomy.history()` for correctness; it is bounded diagnostics.

The plan's "bounded exact-once marker" is unsafe unless there is a proven monotonic compaction scheme. With arbitrary stable `eventId`s, eviction re-enables double processing. For V1, keep the realization record/idempotency marker persistent for the life of the save. If a later implementation introduces a monotonic per-source sequence, it may compact to a high-water mark then.

On duplicate `eventId`, return the previously committed result/no-op without mutating stock or entitlement accrual.

## Pricing decision

Do not use player social context for settlement-side commodity realization.

Resolve the gold unit value through one current catalog helper at realization time. `tradeValue('gold')` is the cleanest present precedent for neutral coin-equivalent commodity value; `sellPrice()` models player→merchant buyback and varies through sell-price context. If implementation deliberately chooses `sellPrice`, pass the explicit neutral context and document why. In either case, import the helper and never persist a price on the entitlement definition.

Persist the actual unit/gross value on the realization record so old accrual is never recomputed after catalog balance changes.

## Entitlements and claim boundary

Use integer basis points and persisted remainder exactly as planned. Entitlement identity must be deterministic for agreement identity; creation is idempotent.

Keep payout outside economy. Existing quest rewards ultimately use the app `grantItem()` path, including overflow handling for `coin`; the future quest consumer should use that same path rather than calling player `Inventory` from economy code.

Because `claimEntitlement()` would zero accrual before the external grant, prefer a two-phase API unless the caller can guarantee delivery:

```text
claimable(entitlementId)
commitClaim(entitlementId, operationId, amount)
```

The quest/app layer grants coins first through the existing reward path, then commits the claim with a stable operation id. If implementation finds an existing atomic reward transaction that can wrap both sides, reuse it instead of inventing another payout ledger.

## Realization trigger

There is currently no generic settlement sale/export consumer for gold. Keep the trigger small and economy-owned; do not create a fake caravan or player-proximity dependency just for this plan.

A deterministic off-screen-capable policy may periodically realize only **attributed gold surplus**, but it should be a thin caller of `realizeAttributed()` and share the same path for loaded/unloaded settlements. If a generic commodity export mechanism lands before implementation, plug into that instead and delete the local policy idea.

Do not scan `ResourceSiteInventories` or `ResourceDeposits` to infer revenue. Realization starts from already-delivered `SettlementEconomy` attributed stock.

## Persistence / lifecycle details

- Extend `SettlementEconomySnapshot`; let `EconomyRegistry.serialize()` and `SaveData.settlementEconomies` carry the new state through existing save and `WorldBundle` rebuild paths.
- Update current save validation/defaulting in `src/persistence/saveData.ts`. Missing nested fields must restore as empty for legacy saves; do not add a new top-level save owner.
- Rebuild tests should cover both `EconomyRegistry.serialize()` reconstruction and full save/load because write-time validation is enforced.
- Do not reconstruct source accounting from resource depletion, site inventories, transport orders, economy history, or aggregate stock.

## Tests that matter most

- all abandoned-mine slots expose the same source id while deposit ids remain distinct;
- mined-but-not-delivered gold creates no settlement attribution;
- loaded and off-screen transport delivery attribute exactly the delivered amount;
- multiple deposit slots aggregate under one mine source;
- ordinary/unattributed ore still uses `add()` semantics unchanged;
- duplicate realization `eventId` cannot remove stock or accrue twice after save/load;
- partial realization keeps `sum(source unrealized) <= aggregate stock`;
- basis-point remainder across many small realizations equals aggregate arithmetic;
- legacy economy snapshot restores empty accounting;
- claim retry cannot lose or duplicate accrued coins.

## Suggested implementation order

1. Add `EconomicSourceId` and propagate optional source identity from abandoned-mine deposit definitions through the resource-site transport delivery seam.
2. Extend `SettlementEconomy` + snapshot with attributed stock and persistence, then switch `creditDeliveredOreToStock()` to the attributed mutation when provenance exists.
3. Add realization + persistent idempotency and entitlement accrual.
4. Add claim boundary.
5. Add the smallest deterministic realization trigger only after the accounting core is covered by tests.

## Main pitfalls

- implementing against the old miner→economy direct-deposit flow;
- parsing `mineId` back out of a deposit id;
- losing provenance when ore sits in a resource-site inventory or moves off-screen;
- attributing requested transport quantity instead of actually delivered quantity;
- using bounded diagnostic history as an accounting ledger/idempotency store;
- using player relation/reputation-dependent pricing for settlement realization;
- clearing claimable coins before the existing player reward/grant path has accepted the payout;
- adding a second treasury, mining ledger, or gold-specific manager.
