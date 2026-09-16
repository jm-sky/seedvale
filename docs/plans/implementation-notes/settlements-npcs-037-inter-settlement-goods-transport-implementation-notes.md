# Implementation Notes: settlements-npcs-037 — Inter-settlement goods transport

**Plan:** `settlements-npcs-037-inter-settlement-goods-transport.md`  
**Status:** `verification needed` 🔍

## 1. Review result

The plan direction is correct: the first cross-settlement slice should remain **food-only**, reuse `TransportOrder`, keep real cargo in existing `Inventory` owners, derive opportunity from shortage/surplus, and use the existing Trader as the first carrier.

However, current code contains two same-settlement assumptions that become correctness bugs for `settlement A → settlement B`:

1. `src/ai/npcProfessionWork.ts::planTransportOrderExecution()` builds unload against the carrier's local `ctx.economy` and local `ctx.landmarks`. It cannot currently unload into another settlement.
2. `src/settlement/SettlementsManager.ts::resolveOffscreenHandoffTargetPosition()` treats every non-household destination as the currently unloading settlement's storage and ignores `destination.settlementId`. A cross-settlement order would therefore calculate the wrong ETA.

There is a third lifecycle issue: on settlement reconstruction `ensureLoaded()` currently clears `TransportOrder.execution` for a reconstructed carrier. That is safe for the existing settlement-local transport slice, but not for a carrier logically travelling from A to B: reloading A must not restart the carrier at A and cancel the long-distance commitment.

Because plan `028` has now implemented generic `NpcTravelContinuity`, use that mechanism for **cross-settlement carrier spatial continuity**. Keep `TransportOrder` as the economic/cargo lifecycle owner. Do not let both `TransportOrder.execution` and `NpcTravelContinuity.execution` independently own the same A→B travel clock.

## 2. Ownership contract to preserve

No new inventory or trade registry is needed.

```text
source SettlementEconomy.items
→ NpcAuthoritativeState.transportCargo
→ destination SettlementEconomy.items
```

`TransportOrder` remains commitment metadata:

- source/destination identity,
- concrete `ItemKind`,
- requested/claimed/delivered quantities,
- carrier identity,
- lifecycle.

For the cross-settlement leg, generic NPC travel owns spatial continuity:

```text
TransportOrder
  owns: economic commitment + cargo lifecycle

NpcAuthoritativeState.travel
  owns: carrier position / detailed↔off-screen continuity
```

Do not copy cargo into `NpcTravelContinuity`, and do not copy settlement inventories into transport state.

## 3. Current exact seams

### `src/world/transportOrder.ts`

No endpoint variant is required. The existing:

```ts
{ type: 'settlement-storage', settlementId: string }
```

works for both source and destination.

Do not add route, position, destination name, economy snapshot, price or profit to `TransportOrder`.

### `src/world/transportTransactions.ts`

Reuse unchanged where possible:

- `executeTransportPickup()` for `source economy.items → transportCargo`,
- `executeTransportUnload()` for `transportCargo → destination economy.items`,
- freshness-preserving `transferInventoryItems()`.

These functions already provide rollback and idempotent lifecycle checks. Inter-settlement logic should only resolve the correct inventories and live transferable quantity.

### `src/economy/foodTransportDemand.ts`

Incoming accounting is already generic enough for any settlement-storage destination:

- `committedIncomingFood(orders, settlementId)`,
- `uncoveredSettlementFoodShortage(economy, orders)`.

Add a sibling settlement-storage source calculation rather than overloading the household-specific helper semantically. Recommended shape:

```ts
committedOutgoingSettlementFood(
  orders,
  settlementId,
  excludeOrderId?,
  itemKind?,
)

uncommittedSettlementFoodSurplus(
  economy,
  orders,
  excludeOrderId?,
)
```

Rules must match the existing household pattern:

- only `pending` / `assigned` orders reserve source supply,
- after pickup the source inventory already lost the goods, so `in-transit` must not subtract again,
- `excludeOrderId` is required for the order's own pickup revalidation,
- optional `itemKind` prevents two commitments from promising the same concrete stack.

## 4. Concrete food selection

Current `selectTraderCollectionGoods()` is household-specific but its useful logic is generic:

- deterministic `FOOD_ITEM_KINDS` order,
- category surplus cap,
- concrete stack availability minus existing commitments,
- carrier capacity reduction loop.

Do not duplicate the food ordering table.

Preferred implementation:

1. Extract a small pure selector over `(Inventory, logicalSurplus, carrier, maxTransfer, committedOfKind)`.
2. Keep `selectTraderCollectionGoods()` as a household wrapper so existing local-food tests/callers stay stable.
3. Use the generic selector for settlement-storage export.

The existing `HOUSEHOLD_EXCHANGE_MAX_TRANSFER.food` may be reused as the V1 per-order cap. Do not introduce wagon-scale capacity in this plan.

## 5. Known settlement candidates — add a bounded manager-owned projection

Current `EconomyRegistry` exposes `get()` and `serialize()`, but not authoritative enumeration with world position. `snapshotEconomies()` is serialized data and must not become a mutation source.

`SettlementsManager.entries` also cannot be used as the long-lived candidate set because `unload()` removes the entry entirely.

Add a small manager-lifetime read-only projection for settlements whose economy has actually been materialized during this world lifetime. The simplest place to populate it is `economyFor(def)` / settlement availability, where the code already has authoritative `SettlementDef.id/x/z` and the live `SettlementEconomy`.

Conceptual data only:

```ts
type KnownSettlementEconomyRef = {
  settlementId: string
  x: number
  z: number
}
```

The projection is not a second economy registry and does not own mutable stock. Resolve the live economy fresh through `EconomyRegistry.get(settlementId)` when evaluating a candidate.

Do not:

- scan arbitrary world cells,
- force `settlementDefFor()` across a large region,
- parse `settlementId` string coordinates as an ownership contract,
- persist a duplicate settlement catalog only for trade.

After save/load it is acceptable for V1 candidate discovery to rebuild from settlements encountered/materialized in the current runtime; active `TransportOrder`s still persist independently and must continue correctly.

## 6. Thread one narrow inter-settlement hook into Trader planning

`NpcWorkContext` currently knows only its own `economy`, local `landmarks`, transport registry, resource-site inventories and household exchange.

Do not give `NpcAgent` the full `SettlementsManager`.

Add a narrow injected hook, defined in a focused module or as a small type near the economy/logistics boundary. It should provide only what Trader planning/execution needs, for example:

```ts
type InterSettlementTransportHooks = {
  listKnownSettlements(): readonly { settlementId: string, x: number, z: number }[]
  getEconomy(settlementId: string): SettlementEconomy | undefined
  resolveStorageTarget(settlementId: string): { x: number, z: number } | null
}
```

`SettlementsManager` can build the closure over its existing `economies`, loaded `entries`, and known-settlement projection, then thread it through:

```text
SettlementsManager
→ CreateSettlementDeps
→ NpcAgentDeps
→ NpcWorkContext
```

Use the same hook for destination lookup during detailed execution. Do not capture a destination `SettlementEconomy` object when the order is created; resolve it fresh at pickup/unload time.

## 7. Deterministic opportunity matching

Create a small pure/bounded helper rather than embedding nested scans directly in `planTraderWork()`.

For the current Trader's source settlement:

1. compute source `uncommittedSettlementFoodSurplus`,
2. enumerate only known materialized settlement refs,
3. skip same settlement,
4. resolve each live economy,
5. compute `uncoveredSettlementFoodShortage`,
6. skip non-positive demand,
7. rank by world distance from source settlement center,
8. stable `settlementId` tie-break,
9. choose concrete food kind deterministically,
10. create one immediately assigned `TransportOrder` for this Trader.

Do not create one order per candidate and then rank orders. Rank opportunity first; persist only the accepted commitment.

Keep current Trader priority exactly as the plan intended:

```text
resume active order
→ local food shortage collection
→ remote ore
→ inter-settlement food export
→ wood fallback
```

This keeps local survival/economy needs above export.

## 8. Settlement-storage as a source

`planTransportPickup()` currently supports:

- `household`,
- `resource-site`.

Add `settlement-storage` without creating a second executor.

For V1, an inter-settlement order is created by the source settlement's own Trader, so enforce/revalidate:

```text
order.source.settlementId === ctx.economy.settlementId
```

Source inventory is `ctx.economy.items`.

Source physical pickup target is the current settlement's real storage target:

```ts
settlementStorageDestination(
  'food',
  ctx.landmarks.stockpile,
  ctx.landmarks.settlementStorage,
)
```

Live pickup quantity must be bounded by both:

```text
current concrete item stack
- other pre-pickup commitments for this source+kind
```

and:

```text
current source settlement food surplus
- other pre-pickup outgoing settlement-food commitments
```

excluding the current order from both calculations.

If source id no longer matches the carrier's source settlement, fail before pickup rather than reaching into another settlement remotely.

## 9. Detailed unload must resolve the order destination, not `ctx.economy`

This is the largest direct code correction in `npcProfessionWork.ts`.

Current code constructs `unload` using local landmarks and checks:

```ts
if (economy.settlementId !== current.destination.settlementId) return
```

That hard-codes same-settlement delivery.

Refactor unload resolution so it is based on `current.destination`:

```text
current destination endpoint
→ resolve destination economy fresh
→ resolve destination world target
→ move there
→ executeTransportUnload(destinationEconomy.items)
```

For same-settlement existing orders, preserve current exact storage landmark behaviour.

For another known settlement:

- if the destination is currently loaded, use its real storage landmark if the manager hook can resolve it cheaply,
- otherwise use the settlement's stable world center as the lower-fidelity physical target for V1.

Do not force-load destination meshes just to get a stockpile coordinate.

`creditDeliveredOreToStock()` must continue only for ore kinds. Food delivery should simply land in `destinationEconomy.items`; `tryAdvanceDevelopment(destinationEconomy)` may remain after successful delivery if current semantics expect it.

## 10. Cross-settlement spatial continuity must use `NpcTravelContinuity`

The plan's original preference that `TransportOrder.execution` own the whole A→B trip is not safe with current streaming.

Current `SettlementsManager.ensureLoaded()` reconstructs source NPCs and clears `TransportOrder.execution`. A carrier en route from A to B would therefore be reset/restarted when A loads again.

Plan `028` already solved generic NPC reconstruction continuity through `NpcAuthoritativeState.travel` and `reifyNpcTravel()`.

Extend `NpcTravelPurpose` from the current single expedition case into a discriminated union, e.g.:

```ts
type NpcTravelPurpose =
  | { kind: 'expedition', assignmentId: string }
  | { kind: 'transport', orderId: string }
```

Update clone/validation/tests accordingly. Do not make transport-specific fields mandatory for expedition travel.

For an inter-settlement order after successful pickup:

```text
TransportOrder → in-transit
+
carrier transportCargo owns real goods
+
carrier NpcTravelContinuity purpose = transport(orderId)
  destination = destination settlement target
```

While detailed, the existing action movement remains authoritative. At stream-out, existing `NpcAgent.beginOffscreenTravelHandoff()` should convert the same travel commitment to off-screen timing. Reconstruction reifies from that same record instead of home spawn.

## 11. Do not run two travel clocks for the same inter-settlement leg

Keep existing `TransportOrder.execution` for the older same-settlement / resource-site→local transport flows introduced by `019/021`.

For a cross-settlement order whose carrier has `travel.purpose.kind === 'transport'`:

- do **not** call `TransportOrders.beginOffscreenExecution()` for that same leg,
- do not let `TransportOrder.execution.arrivesAtDays` race `NpcTravelContinuity.execution.arrivesAtDays`,
- delivery occurs when the transport-purpose NPC travel reaches destination.

This is a fidelity/execution distinction, not a second economic transport system: there is still one `TransportOrder`, one cargo owner and one destination mutation.

A future cleanup may migrate older transport paths onto generic NPC travel too, but that unrelated refactor is not required for 037.

## 12. Arrival handoff

`resolveNpcTravelCheckpoint()` already advances generic off-screen travel/survival. Add one bounded arrival observer for transport-purpose travel.

At checkpoint:

```text
travel purpose transport(orderId)
+ arrival === reached
→ find TransportOrder
→ verify same carrier + in-transit
→ resolve destination inventory/economy
→ executeTransportUnload()
→ only on successful delivery clear/observe travel arrival
```

If destination cannot currently resolve or rejects the transfer:

- keep order `in-transit`,
- keep cargo on carrier,
- keep travel at `arrival: reached`,
- retry at a later bounded checkpoint.

Do not clear travel before the cargo transaction succeeds.

If order is already terminal, clean stale transport-purpose travel idempotently rather than minting/re-delivering cargo.

This arrival resolver belongs near existing transport/travel checkpoint orchestration, not in a per-frame NPC loop.

## 13. Adjust `SettlementsManager` legacy transport handoff carefully

`beginOffscreenTransportHandoff()` currently calculates a target and writes `TransportOrder.execution` for every in-transit carrier before `NpcAgent.beginOffscreenTravelHandoff()` runs.

For transport-purpose inter-settlement travel, skip the legacy transport execution handoff and let generic NPC travel own timing.

Also fix the existing target resolver while touching it:

- `settlement-storage` must check the referenced `settlementId`, not blindly use the currently unloading settlement,
- an unresolved target must **not** become `travelDays = 0` / immediate arrival,
- for legacy flows where target cannot be resolved, leave the order safely in-transit with cargo preserved rather than completing magically.

Keep same-settlement behaviour unchanged.

## 14. Persistence changes are narrow but validation must be updated

No new top-level `SaveData` field is needed.

Existing persistence already stores:

- active `transportOrders`,
- `npcStates[*].transportCargo`,
- `npcStates[*].travel`.

But `NpcTravelPurpose` validation/round-trip currently knows the expedition shape. Extend the save validator/tests for the transport-purpose variant.

Required save/load invariant:

```text
order in-transit
+ carrier cargo
+ carrier transport travel purpose/orderId
→ restore exactly once
→ same progress / same cargo / same order
```

Do not reconstruct travel from the order after load; both authoritative records already persist their own distinct responsibilities.

## 15. Death / blocked travel

Plan `028` can block travel on dead/cannot-progress NPCs. Do not treat blocked transport travel as arrival.

If carrier dies while owning `transportCargo`:

- do not complete delivery,
- do not return goods magically,
- do not create a replacement carrier in 037,
- preserve cargo on authoritative NPC state and leave order non-terminal/recovery-required through existing semantics.

Full dead-carrier cargo recovery can remain future work, but goods must never disappear.

## 16. Tests to add/change

### `src/economy/foodTransportDemand.test.ts`

Add:

- outgoing settlement-storage commitments count only pending/assigned,
- item-kind filtering,
- current-order exclusion,
- uncommitted settlement surplus does not double-subtract in-transit cargo,
- incoming commitments already cover destination demand.

### `src/ai/npcProfessionWork.test.ts`

Add:

- deterministic settlement food selector,
- no A→A opportunity,
- nearest destination then stable-id tie-break,
- local food and remote ore still outrank export,
- settlement-storage source pickup uses exact source economy inventory,
- pickup revalidation excludes competing commitments,
- detailed unload mutates destination economy B, not source economy A,
- existing household/resource-site transport regression cases remain unchanged.

### `src/ai/npcTravel.test.ts`

Add:

- transport-purpose clone/round-trip semantics,
- reify preserves `orderId`,
- arrival remains observable/idempotent,
- expedition purpose tests remain unchanged.

### `src/world/transportOffscreen.test.ts` / settlement handoff tests

Add coverage that:

- cross-settlement transport-purpose travel does not also receive `TransportOrder.execution`,
- same-settlement legacy handoff still does,
- referenced destination settlement id is honored,
- unresolved destination does not create zero-duration delivery.

### persistence

Extend `saveData.test.ts` with `purpose: { kind: 'transport', orderId }` and an in-transit order + cargo + travel round trip.

## 17. Recommended implementation order

1. Add settlement-storage outgoing commitment helpers + tests.
2. Extract/generalize deterministic concrete-food selector.
3. Add bounded known-settlement projection + narrow hooks in `SettlementsManager`.
4. Thread hooks through `CreateSettlementDeps` → `NpcAgentDeps` → `NpcWorkContext`.
5. Add pure inter-settlement opportunity resolver and Trader priority branch.
6. Add settlement-storage source support to `planTransportPickup()`.
7. Refactor detailed unload to resolve destination economy/target from the order.
8. Extend `NpcTravelPurpose` with `transport(orderId)` + persistence tests.
9. Bind successful cross-settlement pickup to generic NPC travel.
10. Add transport-purpose arrival resolver and skip legacy `TransportOrder.execution` for this leg.
11. Fix `SettlementsManager` handoff destination-id / unresolved-target assumptions.
12. Run focused transport/economy/travel/persistence tests, then typecheck/lint/build.

This order establishes accounting and endpoint resolution before changing streaming continuity.

## 18. Guardrails

Do not:

- introduce `TradeManager`, `TradeRoute`, `ImportRequest`, `ExportOffer` or a persistent demand graph,
- add another inventory for in-transit goods,
- use `snapshotEconomies()` as mutable state,
- scan cold settlement worldgen globally,
- parse settlement ids as the primary spatial resolver,
- duplicate `FOOD_ITEM_KINDS`,
- create a second inter-settlement executor,
- run long-distance trade matching per frame,
- keep both `TransportOrder.execution` and `NpcTravelContinuity.execution` authoritative for one A→B leg,
- force-load destination settlement presentation,
- add prices/profit/coins/caravans/carts in this plan,
- implement the Travelling Merchant visit/return lifecycle here — that belongs to `settlements-npcs-038`.

## 19. Documentation after implementation

Update implemented-state docs only after code lands:

- `docs/state/npc.md` — Trader cross-settlement transport and transport-purpose generic travel,
- `docs/state/settlements.md` — settlement-storage export/import flow if the current economy section warrants it,
- `docs/state/persistence.md` only if the documented `NpcTravelPurpose` examples need the new variant,
- `docs/CODE_INDEX.md` / generated code maps through the normal docs workflow as appropriate.

Important new public helpers/hooks should have concise JSDoc and `@domain settlements-npcs` (or `@domain npc` for generic travel primitives).

Manual browser verification remains User-owned.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
