# Codebase Domain Audit 11 — Economy, trade & logistics

**Date:** 2026-09-19  
**Master:** `docs/plans/tools-018-codebase-domain-and-flow-audit-master.md`  
**Area:** 11 — Economy, trade & logistics  
**Result:** ⚠️ reviewed with unresolved high finding  
**Scope:** code correctness, architecture, lifecycle/persistence, performance only

## Scope

Reviewed current `main` across:

```text
resources
→ production / work
→ inventories / storage
→ consumption
→ surplus / shortage
→ pricing / trade
→ transport / logistics
→ destination inventory / state
```

The audit intentionally does **not** treat missing features, roadmap gaps or Vision mismatches as findings.

Primary code paths inspected:

- `src/economy/settlementEconomy.ts`
- `src/economy/productionExecutor.ts` / `production.ts` / `npcWork.ts`
- `src/economy/localExchange.ts` / `foodTransportDemand.ts` / `oreTransportDemand.ts` / `interSettlementFoodTransport.ts`
- `src/items/Inventory.ts` / `tradeCatalog.ts` / `trade.ts`
- `src/settlement/household.ts` / `householdExchange.ts` / `merchantTrade.ts` / `npcState.ts`
- `src/ai/npcLogistics.ts` / `npcProfessionWork.ts`
- `src/world/transportOrder.ts` / `createTransportOrders.ts` / `transportTransactions.ts` / `transportOffscreen.ts` / `transportTravelArrival.ts`
- `src/app/inventoryWiring.ts` / `saveState.ts` / `worldBundle.ts`
- persistence and architecture documentation relevant to those owners.

## Entry points and state owners

### Economic/resource owners

- `SettlementEconomy.stock` owns settlement bulk `EconomicKind` state.
- `SettlementEconomy.items` owns concrete settlement food/items; ore delivery briefly lands here before the existing ore→bulk conversion.
- `Household.items` owns concrete household goods, including post-034 wood items.
- resource-site `Inventory` owns extracted ore before transport.
- `NpcAuthoritativeState.personalInventory` owns NPC belongings.
- `NpcAuthoritativeState.transportCargo` owns cargo of active `TransportOrder` after pickup.
- `NpcAuthoritativeState.merchantStock` owns finite Trader stock and persists with `merchantStockInitialized`.
- `NpcAgent.carried` still owns several short-lived profession/local-logistics payloads, but is explicitly runtime-only and is not part of `NpcAuthoritativeState` or `SaveData`.

### Commitment owners

- `TransportOrder` is the world-owned commitment for physical source→carrier→destination transport.
- live goods remain in source, carrier `transportCargo`, or destination; the order never duplicates cargo quantity as ownership.
- active orders persist through `SaveData.transportOrders`; terminal orders are deliberately excluded from saves.

## Flows traced

### 1. Resource acquisition → production/work

Remote mining uses world-owned resource-site inventory. Profession production uses the shared production executor and real inventory/stock inputs. Recipe preflight and synchronous commit keep current mixed item/stock recipes consistent under the single-threaded runtime.

The important exception is the later **delivery leg** of several NPC work/local-transfer flows: some irreversible source mutations hand value to `NpcAgent.carried` or only to an action closure before a later deposit.

### 2. Inventories/storage → consumption → surplus/shortage

Settlement food is concrete items; other settlement economic kinds use bulk stock. Household wood is concrete `branch`/`beam` after settlements-npcs-034. Shortage/surplus is derived from those owners rather than stored as a second mutable demand state.

Food/ore transport-demand helpers subtract active commitments from live supply/demand. No second persisted demand registry was found.

### 3. Pricing and trade

`src/items/tradeCatalog.ts` is the common valuation authority:

- merchant list price: `MERCHANT_PRICES` / `merchantPrice()`,
- nominal/barter fallback: `tradeValue()`,
- player→merchant buyback: `sellPrice()` / `resolveInstanceSellPrice()`,
- ordinary NPC→player price: `npcSalePrice()` / instance variant.

Current ruby values are explicit (`ruby = 70`, sized rubies have their own explicit values); the generic weight-derived fallback is not used for them. The earlier “ruby for 1 coin” symptom is therefore not reproducible from the current valuation source.

Merchant and ordinary-NPC purchase paths preflight live stock, price, buyer funds and capacity before synchronous mutation. Finite Trader stock is the persisted `merchantStock` owner rather than a recreated catalog quantity.

No confirmed current finding was found for inconsistent item valuation, duplicated merchant stock authority or a second buy/sell price table.

### 4. Transport/logistics → destination

`executeTransportPickup()` and `executeTransportUnload()` use the same transactional inventory-transfer seam for detailed and off-screen flow:

- pickup revalidates live transferable quantity,
- carrier capacity is checked before source mutation,
- failed order-state commit attempts rollback the inventory move,
- unload leaves cargo with carrier when destination rejects capacity,
- in-transit retry cannot repeat pickup because state/`claimedQuantity` gate it,
- cancellation/failure is restricted to pre-pickup states,
- off-screen arrival reuses the same unload function.

`transportCargo` and active orders both survive save/load. Cross-settlement travel and same-settlement off-screen execution do not create a second cargo owner.

## Findings

### F1 — HIGH — Economic goods can be removed from an authoritative source and then live only in transient action/NPC state

**Category:** correctness · architecture · lifecycle/persistence  
**Affected:** local household/economy exchange and NPC work payload delivery

Current `src/ai/npcLogistics.ts` has two concrete closure-only wood paths:

1. `planEconomyWithdraw(..., 'wood')` calls `claimEconomySurplus()` at pickup, mutating `SettlementEconomy`, then stores only `claimed: number` in the `NpcPlannedAction` closure until deposit.
2. `planHouseholdExchange(..., 'wood')` calls `sourceHousehold.claimWoodSurplusBatch()`, mutating the source household, then stores only `claimedBatch` in the action closure until deposit.

If the action is discarded after pickup, there is no authoritative owner from which the claim can be resumed or refunded. The source has already changed.

Food improved one level: pickup moves the claim into `ctx.carried`. However `NpcAgent.carried` is explicitly excluded from `NpcAuthoritativeState` and resets on NPC reconstruction. The same runtime-only inventory is also used by several profession work payloads before household/economy deposit.

Consequences:

- ordinary cancellation/interruption can lose closure-only wood claims;
- settlement stream-out / NPC reconstruction can lose transient economic cargo;
- a save taken after source mutation but before deposit persists the reduced source but not the closure/`carried` payload; load cannot recover it;
- an in-session `WorldBundle` rebuild has the same ownership mismatch for transient cargo.

This violates conservation: `source -= N` can become permanent without `carrier/destination += N`.

The code already contains the correct architectural precedent: `TransportOrder + NpcAuthoritativeState.transportCargo` keeps commitment and cargo independently authoritative. The fix should reuse the existing NPC-state lifetime rather than add another manager.

**Existing-plan check:** settlements-npcs-034 fixed household wood representation and explicitly did **not** solve general transient-cargo lifetime. settlements-npcs-018/019 solve this for `TransportOrder` cargo only. No existing plan covers the remaining local/work cargo ownership gap.

**New plan:** `settlements-npcs-052-persistent-economic-work-cargo-and-local-transfer-conservation.md`.

### F2 — MEDIUM — Terminal TransportOrders accumulate in the active registry and inflate repeated logistics scans

**Category:** architecture · performance · lifecycle

`createTransportOrders.ts` stores all records in one array. `completeDelivery`, `fail` and `cancel` replace a record with a terminal version but never remove it.

At runtime:

- `list()` returns active + terminal history;
- `find()` / `indexOf()` / `findByCarrier()` are linear in that growing array;
- food and ore commitment accounting repeatedly scans `orders.list()`;
- inter-settlement food matching can rescan the same list for multiple candidate settlements and concrete food kinds;
- `rebuildWorldBundle()` carries `[...transportOrders.list()]`, so terminal history survives in-session rebuilds.

Full save/load happens to prune the history because `saveState.ts` explicitly writes only active orders. That means performance depends on how long the session runs without a reload.

This conflicts with the assumptions documented by the implemented transport plans: 018 asks for direct/bounded active lookup and 020 permits small scans while the **active** order count is small. The implementation currently scans historical terminal records too.

No current correctness error was found because demand helpers filter terminal states, but the data structure mixes two lifecycles and creates unbounded avoidable work.

**Existing-plan check:** 018 Stage 5 removes redundant legacy commitment state but does not define terminal-order pruning/indexing; it is already implemented/verification-needed. 019/020/021/037 do not cover registry compaction.

**New plan:** `settlements-npcs-053-active-transport-order-registry-lifecycle.md`.

## Architecture observations

### Healthy seams to preserve

- Pricing has one catalog authority; merchant/NPC/social modifiers are layered on top rather than copied into callers.
- Finite merchant stock is real persisted inventory, not an infinite UI catalog.
- `TransportOrder` is a commitment, not a second cargo inventory.
- `executeTransportPickup` / `executeTransportUnload` are shared between detailed/off-screen execution and are retry-safe under current state transitions.
- resource-site inventory, NPC transport cargo, household inventory and settlement economy have explicit owners and persistence boundaries.
- transport-demand state is derived from live owners + active commitments rather than persisted separately.

### Architecture pressure

The remaining weak seam is not the transport foundation itself. It is older two-leg `NpcPlannedAction` flows that mutate a source before the payload has moved into an owner with the same lifetime as that source mutation.

The order registry has the opposite issue: its semantic owner is “active commitments”, but its storage currently doubles as an unbounded terminal history.

## Cross-domain dependencies / follow-ups

- Area 13 (NPC movement, schedules & work) should verify interruption/resume behaviour against the new authoritative economic work-cargo owner after plan 052.
- Persistence audit should verify the new cargo snapshot uses the same `NpcStateRegistry` save/rebuild path and does not duplicate `personalInventory` or `transportCargo`.
- No feature/roadmap follow-up was created from this audit.

## Existing plans already covering adjacent mechanisms

- `settlements-npcs-018` — physical-goods transport foundation.
- `settlements-npcs-019` — persistent/off-screen transport cargo.
- `settlements-npcs-020` — economy-driven food transport demand.
- `settlements-npcs-021` — remote production-site logistics.
- `settlements-npcs-034` — household wood authority and exact material flow.
- `settlements-npcs-037` — inter-settlement goods transport.
- `settlements-npcs-047` / `048` — merchant carrying capacity / pack-animal journey continuity.
- `settlements-006` — merchant sell pricing, condition and social standing.
- `settlements-012` / `settlements-npcs-042` — finite merchant stock and vendor identity.
- `settlements-npcs-033` / `036` — ordinary NPC-owned goods trading.

None of those currently closes F1 or F2.

## New plans required

1. `settlements-npcs-052-persistent-economic-work-cargo-and-local-transfer-conservation.md` — HIGH.
2. `settlements-npcs-053-active-transport-order-registry-lifecycle.md` — MEDIUM.

## Verification limits

This was a source/code-path audit against current `main`. No browser verification was run, per project rules. No gameplay findings were inferred from missing features. No profiler trace was needed to establish F2's unbounded growth; the finding is structural from registry lifetime and call-site scans.

No findings were implemented.

## Master status update

Area 11 → **⚠️ reviewed with unresolved high/critical findings** because F1 remains unresolved.
