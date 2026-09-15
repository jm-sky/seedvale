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
**Model:** `Opus`, `Sonnet`

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
  - detailed → off-screen handoff for existing transport flows,
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
  - generic long-distance NPC continuity exists in `src/ai/npcTravel.ts`, including deterministic off-screen travel/reification/survival semantics.

The new work is therefore not a new transport engine. The missing boundary is **inter-settlement economic matching, settlement-storage as a transport source, and correct carrier continuity across settlement streaming**.

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
7. The carrier must preserve spatial continuity across detailed/off-screen transitions; reloading its home settlement must not restart an A→B trip from home.

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
- `excludeOrderId` for live pickup revalidation.

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

Reuse the existing `FOOD_ITEM_KINDS` ordering / current Trader selector logic rather than introducing a second ordering table.

Selection must consider:

- current source item count,
- current category surplus,
- pre-pickup commitment for that concrete `ItemKind`,
- destination uncovered quantity,
- existing transfer/carry cap.

The planner must not remove goods. Mutation remains exclusively in `executeTransportPickup()`.

## 5. Candidate settlement discovery

Do not generate or scan arbitrary cold settlement definitions merely to search for trade.

The first slice should operate on settlements whose economy/state has already been materialized in the current world lifetime. `EconomyRegistry` owns the mutable economies; candidate discovery only needs a bounded read-only projection of stable settlement id + world position.

Current relevant seams:

- `SettlementsManager.getEconomy(settlementId)` gives the live authoritative economy,
- `SettlementsManager.snapshotEconomies()` is snapshot data, not a mutation owner,
- loaded/currently known `SettlementDef`s provide stable ids and world centers.

Add the smallest manager-lifetime projection needed to enumerate known materialized settlements. Do not expose registry internals, parse settlement ids as spatial authority or use serialized snapshots as mutable economy objects.

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

The evaluation belongs to the existing Trader work decision point, not the render loop.

## 7. Carrier and creation point

V1 reuses the existing source settlement **Trader** as the carrier because Trader already owns normal `TransportOrder` planning/execution.

`planTraderWork()` keeps its current first rule:

```text
resume active TransportOrder first
```

Only when the Trader has no active order may it evaluate a new inter-settlement opportunity.

Priority:

```text
resume active order
→ local settlement food collection
→ remote resource-site ore transport
→ inter-settlement food opportunity
→ existing lower-priority fallback work
```

Inter-settlement export must not starve an unresolved local shortage.

Do not introduce global carrier bidding, idle-NPC scans or a carrier marketplace.

## 8. Settlement-storage source execution

Destination `settlement-storage` already works as an inventory endpoint. The new pickup seam is using `settlement-storage` as **source**.

Extend the existing shared `planTransportOrderExecution()` / pickup resolver rather than adding a second inter-settlement executor.

For V1, the source settlement's own Trader creates and executes the order. Revalidate that `order.source.settlementId === ctx.economy.settlementId` before pickup.

Source inventory is `ctx.economy.items`; source physical target is the current settlement's real storage landmark. Live transferable quantity must subtract other pre-pickup commitments while excluding the current order.

Do not put positions onto `TransportOrder`.

## 9. Cross-settlement travel ownership

Review of current code shows that the legacy `TransportOrder.execution` handoff from plan `019` assumes the carrier is reconstructed with its owning settlement and is therefore safe for the existing same-settlement/resource-site→local flows, but not for A→B travel.

For the inter-settlement leg:

```text
TransportOrder
→ owns economic commitment + cargo lifecycle

NpcAuthoritativeState.travel / NpcTravelContinuity
→ owns carrier spatial continuity + detailed/off-screen timing
```

Extend the existing generic travel purpose/context with a transport variant keyed by `orderId`. Do not create an `InterSettlementJourney` registry.

The same A→B leg must not have both `TransportOrder.execution` and `NpcTravelContinuity.execution` acting as independent clocks.

Existing legacy transport flows may continue using `TransportOrder.execution`; migrating all transport to generic NPC travel is outside this plan.

## 10. Detailed destination execution

Current `planTransportOrderExecution()` assumes local `ctx.economy` and local landmarks for unload. Refactor it to resolve the destination from the order.

For an in-transit cross-settlement order:

```text
resolve destination settlement id
→ resolve live destination SettlementEconomy
→ resolve destination world target
→ travel there
→ executeTransportUnload(destinationEconomy.items)
```

For same-settlement orders preserve the current exact storage target.

For another known settlement, prefer its real loaded storage target when cheaply available; otherwise the stable settlement center is an acceptable lower-fidelity V1 target. Do not force-load presentation merely to obtain a stockpile coordinate.

Food delivery lands only in the destination's authoritative `items` inventory.

## 11. Off-screen and streaming continuity

Inter-settlement transport must remain valid when:

- source streams out after pickup,
- source later streams back in before arrival,
- destination is not loaded,
- carrier is not materialized,
- time skip crosses arrival,
- save/load occurs while cargo is in transit.

At stream-out, a transport-purpose `NpcTravelContinuity` must hand off using the current live carrier position and destination target. On reconstruction, existing `reifyNpcTravel()` semantics must place the carrier at the journey's current position instead of home spawn.

`SettlementsManager.beginOffscreenTransportHandoff()` must skip legacy `TransportOrder.execution` for an inter-settlement leg already owned by transport-purpose NPC travel.

Also correct the current endpoint-position assumption: a `settlement-storage` target must honor `ref.settlementId`. An unresolved target must not become zero-duration/immediate arrival.

## 12. Arrival and unload

Generic travel checkpoint resolution may mark a transport-purpose journey as reached, but cargo completion still belongs to the `TransportOrder` transaction.

At bounded checkpoint/arrival:

```text
transport-purpose travel reached
→ resolve order by orderId
→ verify same carrier + in-transit
→ resolve destination inventory/economy
→ executeTransportUnload()
→ on success complete order and clear/observe travel arrival
```

If destination cannot resolve or rejects delivery, preserve cargo and order and keep the reached travel state for retry. Do not clear travel before a successful cargo handoff.

No per-frame global traveller scan.

## 13. Failure semantics

Before pickup:

- source stock may change,
- source surplus may disappear,
- another order may consume the uncommitted quantity,
- carrier may become unavailable.

Live pickup revalidation decides the real claim. Zero claim may fail the order according to the existing transaction contract.

After pickup:

- cargo remains with the carrier even if destination shortage disappears,
- destination rejection/capacity failure keeps cargo in `transportCargo`,
- dead/blocked carrier travel is not arrival,
- do not silently retarget, replace carrier or delete cargo.

No automatic economic rerouting in V1.

## 14. Persistence

No new top-level persistent demand state is required.

Existing persisted/carry state is sufficient:

- settlement economies,
- active `TransportOrder`s,
- `NpcAuthoritativeState.transportCargo`,
- `NpcAuthoritativeState.travel`.

Extend `NpcTravelPurpose` persistence/validation for the transport `orderId` variant. Do not reconstruct travel from the order after load.

After reload, new inter-settlement opportunities are recomputed from live economy + active orders.

## 15. Observability

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
- order state,
- carrier travel execution/reached/blocked state.

Do not create a separate trade-history subsystem in this plan.

## 16. Focused tests

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

### Streaming / save-load

Cross-settlement in-transit order and transport-purpose NPC travel survive stream-out, source stream-in and save/load without restarting from A and complete exactly once.

### Destination demand changes after pickup

Cargo is still preserved and delivered/recovered through existing transport semantics; no deletion or duplicate replanning.

## 17. Explicit non-goals

- Travelling Merchant visit/linger/return lifecycle,
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

## 18. Extension path

After this plan, Seedvale has the physical foundation for:

```text
settlement surplus
→ cross-settlement TransportOrder
→ real long-distance carrier continuity
→ other settlement inventory
→ shortage changes
```

The next plan, `settlements-npcs-038`, adds a **Travelling Merchant** as a world actor that consumes this shared mechanism, remains meaningful at the destination and returns home, rather than embedding merchant lifecycle into 037.

Later plans may add:

- additional concrete goods categories,
- Courier/carrier specialization,
- pack animals and carts,
- caravans/escort,
- economic profit/pricing,
- route preferences and road costs.

## Implementation guidance

Detailed verified recon is in:

`docs/plans/implementation-notes/settlements-npcs-037-inter-settlement-goods-transport-implementation-notes.md`.

Use it before implementation. In particular preserve the reviewed split between `TransportOrder` economic ownership and generic `NpcTravelContinuity` spatial ownership for the cross-settlement leg.

Add concise JSDoc to important new public/architectural helpers and use `@domain settlements-npcs` / `@domain npc` where appropriate.

## Verification

### Automated

- focused economy/transport matching tests,
- generic travel regressions,
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
6. reload/revisit source before arrival and confirm carrier does not restart from home,
7. visit destination and confirm delivered stock + reduced shortage,
8. confirm no duplicate incoming order when active commitment already covers demand.

> **Zrób git commit i push do main, rebase jeżeli trzeba**