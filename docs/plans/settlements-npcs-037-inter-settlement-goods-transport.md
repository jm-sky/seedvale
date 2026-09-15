# Plan: Inter-settlement goods transport

**Created:** 2026-09-15
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** ~~settlements-npcs-021~~, ~~settlements-npcs-028~~
**Domain:** `settlements-npcs`
**Subdomains:** `economy` `logistics`
**Tags:** `transport` `inter-settlement` `food` `shortage` `surplus`
**Roadmap:** `physical-goods-transport`

## Goal

Extend the implemented physical-goods transport stack from local/remote-source delivery to the first real settlement-to-settlement flow:

```text
settlement A food surplus
        ↓
derived uncovered demand in settlement B
        ↓
TransportOrder
  settlement-storage A
        ↓
real carrier + transportCargo
        ↓
physical / off-screen travel
        ↓
settlement-storage B
        ↓
settlement B shortage decreases
```

This plan proves Stage 5 of `docs/roadmap/physical-goods-transport.md` without introducing a market simulation, route system, caravan system or travelling-merchant profession.

The first vertical slice is intentionally **food-only**. Both source and destination already own concrete food in `SettlementEconomy.items`, and the existing `TransportOrder`/transaction path moves concrete `ItemKind`s. Bulk `EconomicStock` transport is a separate future extension and must not be mixed into this slice.

## Recon — current implemented foundations

The current code already provides the transport primitives needed for this plan:

- `src/world/transportOrder.ts`
  - world-owned `TransportOrder`,
  - lifecycle `pending → assigned → in-transit → completed`,
  - endpoint union already contains `{ type: 'settlement-storage', settlementId }`,
  - order is commitment metadata, never cargo ownership.
- `src/world/createTransportOrders.ts`
  - persistent registry,
  - one active order per carrier through the existing carrier lookup/assignment guards,
  - save/load and WorldBundle carry are already established.
- `src/world/transportTransactions.ts`
  - transactional inventory pickup/unload,
  - live source revalidation,
  - freshness-preserving `Inventory` transfer,
  - rollback when lifecycle commit fails.
- `NpcAuthoritativeState.transportCargo`
  - authoritative owner of goods after pickup.
- `src/world/transportOffscreen.ts`
  - detailed → off-screen handoff for in-transit cargo,
  - deterministic arrival timing,
  - settlement-storage endpoint lookup already resolves through `getEconomy(settlementId)`.
- `src/economy/foodTransportDemand.ts`
  - incoming food commitment accounting by destination settlement,
  - household-source pre-pickup commitment accounting,
  - uncovered settlement food shortage.
- `settlements-npcs-021`
  - remote source ownership and transport execution are implemented,
  - `planTransportOrderExecution()` was generalized beyond household-only source handling,
  - Trader work already resumes an active `TransportOrder` before looking for new work.
- `settlements-npcs-028`
  - generic long-distance NPC continuity exists in `src/ai/npcTravel.ts`, including deterministic off-screen travel/reification/survival semantics for non-transport journeys.

The new work is therefore not a new transport engine. The missing boundary is **inter-settlement economic matching and settlement-storage as a transport source**.

## Core invariants

1. Goods always have one authoritative owner:

```text
before pickup  → source SettlementEconomy.items
after pickup   → carrier NpcAuthoritativeState.transportCargo
after unload   → destination SettlementEconomy.items
```

2. Inter-settlement demand is derived from live economy state plus active transport commitments. Do not persist a second demand graph.
3. A settlement's surplus cannot be promised to multiple pre-pickup orders.
4. A destination shortage already covered by incoming active orders must not create duplicate transport.
5. Settlement A and settlement B remain independent economies; goods are unavailable in B until delivery completes.
6. No player/camera presence is required for the economic consequence to occur.

## 1. First supported goods: concrete food only

Use the existing food economy because it already satisfies all required ownership contracts:

- `SettlementEconomy.shortage('food')`,
- `SettlementEconomy.surplus('food')`,
- `SettlementEconomy.items`,
- concrete `ItemKind` food stacks,
- freshness-aware inventory transfer.

Do not extend `TransportOrder` to carry `EconomicKind` or bulk `EconomicStock` in this plan.

Future ore/wood/processed-goods inter-settlement transport may reuse the matching layer after their authoritative storage representation is compatible with the transport transaction seam.

## 2. Inter-settlement opportunity

A candidate movement exists only when:

```text
source settlement != destination settlement
+
source has uncommitted food surplus
+
destination has uncovered food shortage
+
there is a usable carrier in the source settlement
```

Conceptually:

```text
uncoveredDestinationDemand =
  destination.shortage('food')
  - active incoming food commitments

availableSourceSupply =
  source.surplus('food')
  - active pre-pickup outgoing commitments from source settlement storage
```

Do not create persistent `TradeRoute`, `SettlementImportRequest`, `ExportOffer` or `InterSettlementDemand` records.

Only accepted movement becomes a persistent `TransportOrder`.

## 3. Extend commitment accounting, not state ownership

`src/economy/foodTransportDemand.ts` already owns food-specific commitment accounting and should remain the pattern/boundary.

Add the smallest settlement-storage source accounting needed for this plan:

- pre-pickup outgoing food commitments whose source is `settlement-storage`,
- optional `itemKind` narrowing when selecting a concrete stack,
- `excludeOrderId` for live pickup revalidation if required by the shared executor.

Rules remain:

```text
incoming:
  pending / assigned → requestedQuantity
  in-transit        → claimedQuantity
  terminal          → 0

outgoing source reservation:
  pending / assigned only
```

Once pickup succeeds, source inventory already lost the goods; do not subtract `in-transit` again.

## 4. Concrete food-kind selection

`SettlementEconomy.surplus('food')` is category-level, while `TransportOrder.itemKind` is concrete.

Select a concrete food kind deterministically from the source settlement's real `SettlementEconomy.items`.

Reuse the existing deterministic food ordering used by `claimFoodItems()` / food-item helpers. If that order is currently private, factor the minimum pure shared selector rather than introducing a second ordering table.

Selection must consider:

- current source item count,
- current category surplus,
- pre-pickup commitment for that concrete `ItemKind`,
- destination uncovered quantity,
- existing transfer/carry cap.

The planner must not remove goods. Mutation remains exclusively in `executeTransportPickup()`.

## 5. Candidate settlement discovery

Do not generate or scan arbitrary cold settlement definitions merely to search for trade.

The first slice should operate on settlements whose economy/state already exists in the current world lifetime, including previously streamed-out settlements retained by `SettlementsManager`/`EconomyRegistry`.

Current relevant seams:

- `SettlementsManager.getEconomy(settlementId)` gives the live authoritative economy,
- `SettlementsManager.snapshotEconomies()` can enumerate economies created so far but is snapshot data, not a mutation owner,
- loaded settlements expose stable ids and world centers.

During implementation recon, add the smallest read-only projection needed to enumerate eligible known settlements with stable identity and world position. Do not expose registry internals or use serialized snapshots as authoritative mutable economy objects.

If a candidate settlement has no resolvable stable world position without forcing cold worldgen, skip it in V1.

## 6. Deterministic matching

For one source Trader evaluation, matching should be bounded and deterministic.

Suggested order:

1. destination has positive uncovered food shortage,
2. source has positive uncommitted food surplus,
3. exclude source settlement itself,
4. prefer smaller world distance,
5. stable settlement id tie-break,
6. deterministic concrete food-kind selection.

Do not use `Math.random()`.

Do not search `all settlements × all goods × all carriers` every frame.

The evaluation belongs to an existing low-frequency work/economy decision point, not the render loop.

## 7. Carrier and creation point

V1 reuses the existing source settlement **Trader** as the carrier because Trader already owns normal `TransportOrder` planning/execution.

`planTraderWork()` keeps its current first rule:

```text
resume active TransportOrder first
```

Only when the Trader has no active order may it evaluate a new inter-settlement opportunity.

Recommended priority remains conservative:

```text
resume active order
→ urgent/local settlement food collection
→ remote resource-site ore transport
→ inter-settlement food opportunity
→ existing lower-priority fallback work
```

The exact insertion point must be checked against current `npcProfessionWork.ts` during implementation notes, but inter-settlement export must not starve an unresolved local shortage.

Do not introduce global carrier bidding, idle-NPC scans or a carrier marketplace.

## 8. Settlement-storage source execution

Destination `settlement-storage` already works. The new execution seam is using `settlement-storage` as **source**.

Extend the existing shared `planTransportOrderExecution()` source resolver rather than adding a second inter-settlement executor.

For an assigned order with source settlement storage:

```text
resolve source SettlementEconomy
→ resolve physical source position / stockpile target
→ resolve source economy.items
→ compute current live transferable food
→ executeTransportPickup()
→ same in-transit lifecycle
→ same destination resolution
→ executeTransportUnload()
```

Do not put positions onto `TransportOrder`.

Use existing settlement landmarks/stockpile resolution for detailed pickup and destination movement. Stable endpoint identity remains settlement id only.

## 9. Long-distance execution ownership

Do not create a second long-distance timing system.

For cargo already picked up, `TransportOrder.execution` / `transportOffscreen.ts` remains authoritative for transport progress and cargo arrival.

`NpcTravelContinuity` from plan 028 is a reusable NPC-travel foundation, but the same carrier must not simultaneously have two authoritative clocks describing the same cargo trip.

Implementation notes must verify the exact current handoff seam and choose one owner for the inter-settlement cargo leg. Preferred rule:

```text
active cargo TransportOrder
→ TransportOrder execution owns trip progress
```

Generic `NpcTravelContinuity` may be reused only for shared survival/reification helpers where it does not duplicate transport timing/lifecycle.

## 10. Off-screen and unloaded settlements

Inter-settlement transport must remain valid when:

- source streams out after pickup,
- destination is not loaded,
- carrier is not materialized,
- time skip crosses arrival,
- save/load occurs while cargo is in transit.

Reuse the 019 endpoint lookup and persistent carrier cargo.

Delivery to an unloaded destination must mutate that destination's authoritative `SettlementEconomy.items` through the retained economy registry; it must not require a rendered settlement object.

## 11. Failure semantics

Reuse existing transport failure rules.

Before pickup:

- source stock may change,
- source surplus may disappear,
- another order may consume the uncommitted quantity,
- carrier may become unavailable.

Live pickup revalidation decides the real claim. Zero claim may fail the order according to the existing transaction contract.

After pickup:

- cargo remains with the carrier even if destination shortage disappears,
- destination rejection/capacity failure keeps cargo in `transportCargo`,
- do not silently retarget or delete cargo.

No automatic economic rerouting in V1.

## 12. Persistence

No new persistent demand state is required.

Existing persisted/carry state should be sufficient:

- settlement economies,
- active `TransportOrder`s,
- `NpcAuthoritativeState.transportCargo`,
- transport execution metadata.

After reload, inter-settlement opportunities are recomputed from live economy + active orders.

## 13. Observability

Reuse existing transport/economy debug surfaces where possible.

For one inter-settlement movement it should be possible to inspect:

- source settlement id,
- destination settlement id,
- source current food surplus,
- source pre-pickup committed quantity,
- destination current shortage,
- destination incoming committed quantity,
- chosen concrete food kind,
- requested / claimed / delivered quantity,
- carrier id,
- order state/execution mode.

Do not create a separate trade-history subsystem in this plan.

## 14. Focused tests

At minimum cover:

### Basic matching

```text
A food surplus > 0
B food shortage > 0
→ one TransportOrder A storage → B storage
```

### No self-trade

```text
A surplus + A shortage bookkeeping edge case
→ no A → A order
```

### Incoming commitment coverage

```text
B shortage = 5
existing incoming = 5
→ no new order
```

### Source commitment coverage

```text
A surplus = 5
existing pre-pickup outgoing = 4
→ new order can commit at most 1
```

### Concrete kind conservation

```text
A owns actual food item stack
→ pickup removes exact quantity/freshness
→ transportCargo owns it
→ delivery adds exact surviving quantity/freshness to B
```

### Deterministic destination choice

Two eligible destination settlements at equal economic priority resolve by distance then stable id.

### Stream-out / save-load

Cross-settlement in-transit order survives stream-out and save/load and completes exactly once.

### Destination demand changes after pickup

Cargo is still preserved and delivered/recovered through existing transport semantics; no deletion or duplicate replanning.

## 15. Explicit non-goals

- Travelling Merchant lifecycle/itinerary,
- dedicated Courier profession,
- caravan formation,
- carts/wagons/pack animals,
- dynamic prices,
- merchant profit/wages,
- currency settlement between villages,
- global commodity market,
- trade treaties/factions,
- route persistence,
- road-quality travel economics,
- terrain/weather pricing,
- bulk `EconomicStock` transport,
- arbitrary cold-world settlement generation/scanning,
- player-created shipping contracts.

## 16. Extension path

After this plan, Seedvale has the physical foundation for:

```text
settlement surplus
→ cross-settlement TransportOrder
→ real long-distance carrier
→ other settlement inventory
→ shortage changes
```

The next plan should add a **Travelling Merchant** as a world actor that repeatedly consumes this shared mechanism, rather than embedding merchant lifecycle into 037.

Later plans may add:

- additional concrete goods categories,
- Courier/carrier specialization,
- pack animals and carts,
- caravans/escort,
- economic profit/pricing,
- route preferences and road costs.

## Implementation guidance

Before implementation, create implementation notes from the then-current codebase. In particular verify:

- current `planTraderWork()` priority order,
- current source resolver inside `planTransportOrderExecution()`,
- how settlement stockpile world positions are resolved without storing them in endpoint refs,
- bounded known-settlement enumeration without cold world generation,
- exact interaction between transport off-screen execution and generic `NpcTravelContinuity` from 028.

Add concise JSDoc to important new public/architectural helpers and use `@domain settlements-npcs` where useful for preflight discovery.

## Verification

### Automated

- focused economy/transport matching tests,
- transport transaction regressions,
- persistence/off-screen regressions,
- typecheck,
- lint,
- build.

### Manual browser verification

User-owned browser verification:

1. create two settlements with a visible food imbalance,
2. verify one source Trader accepts an inter-settlement delivery,
3. observe physical pickup from source storage,
4. move away / allow stream-out,
5. confirm transport continues off-screen,
6. visit destination and confirm delivered stock + reduced shortage,
7. confirm no duplicate incoming order when active commitment already covers demand.

> **Zrób git commit i push do main, rebase jeżeli trzeba**