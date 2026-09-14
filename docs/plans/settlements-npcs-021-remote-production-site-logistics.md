# Plan: Remote Production Site Logistics

**Created:** 2026-09-04
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** ~~settlements-npcs-018~~, ~~settlements-npcs-019~~, ~~settlements-npcs-020~~
**Domain:** `settlements-npcs`
**Subdomains:** `economy` `logistics`
**Tags:** `transport` `production` `remote-sites` `mining`
**Roadmap:** `physical-goods-transport.md`
**Model:** Sonnet, Composer
**Implemented at:** 2026-09-14

## Implementation summary

Vertical slice: Miner extracts ore into a world-owned resource-site `Inventory` keyed by `NaturalResource.id`; uncovered blacksmith iron/coal stock shortage + uncommitted site supply → Trader `TransportOrder` with `{ type: 'resource-site', resourceId }` source; pickup/unload reuse `executeTransportPickup` / `executeTransportUnload`; unload credits `SettlementEconomy` bulk stock (blacksmith reads stock, not `items`).

Store: `src/world/resourceSiteInventory.ts`, owned by `createApp.ts` like `resourceDepletion` (rebuild-survive, New Game reset). Persist as optional sparse `SaveData.resourceSiteInventories` (`InventoryContentsSnapshot`); no save-version bump. Depletion stays in `SaveData.resourceDeposits`.

Demand: `src/economy/oreTransportDemand.ts` (incoming/outgoing commitment accounting, iron then coal). No demand registry. Food transport still wins in `planTraderWork()`.

Position for pickup: `resourceById()` in `src/terrain/naturalResources.ts`. Off-screen lookup: `getResourceSiteInventory`. Extracted ore is not settlement-owned until transport completes.

## Recon Result — 2026-09-14

The draft-exit recon is complete enough to choose a concrete first slice.

Implemented transport foundation:

- `src/world/transportOrder.ts` owns authoritative `TransportOrder` commitments and endpoint identity,
- `src/world/createTransportOrders.ts` owns the world-level order registry,
- `src/world/transportTransactions.ts` owns transactional inventory pickup/unload,
- `NpcAuthoritativeState.transportCargo` owns cargo after pickup,
- `src/world/transportOffscreen.ts` owns off-screen completion for `in-transit` orders,
- `settlements-npcs-020` already implements economy-derived transport demand for local household food supply and is currently in verification.

Existing mining provides the smallest useful remote-production slice:

```text
ResourceDeposit
→ Miner extracts real ore
→ NpcAgent.carried
→ Miner walks to settlement stockpile
→ SettlementEconomy.add(...)
```

The current flow has two architectural problems relevant to this plan:

1. `NpcAgent.carried` is transient, so extracted ore can be lost across NPC reconstruction after the deposit has already been depleted.
2. Ore becomes settlement stock only through the miner's direct deposit flow, so there is no persistent remote ownership boundary and no transport delay between remote extraction and local economic availability.

021 replaces that final ownership path with one persistent remote-site inventory and the existing transport system.

## Goal

Make the first remote production flow physically and economically meaningful:

```text
ResourceDeposit
→ Miner extracts ore
→ persistent resource-site Inventory
→ derived settlement ore need
→ Trader/carrier TransportOrder
→ NpcAuthoritativeState.transportCargo
→ settlement storage
→ SettlementEconomy availability changes
```

Core invariant:

> Ore extracted at a remote resource site is not settlement-owned or economically available until transport completes.

The implementation must reuse the existing mining, inventory, economy and transport systems rather than introduce a parallel logistics subsystem.

## 1. First Vertical Slice

The supported first slice is:

```text
remote ore deposit
→ mined ore stored at that resource site
→ Trader carries ore to owning settlement storage
```

Supported ore kinds should follow the existing mining mapping in `terrain/depositMining.ts` rather than introduce a new resource taxonomy.

This plan does not require a new mine building, mine profession model, generic production-site framework or inter-settlement trade system.

## 2. Resource Site Identity

Reuse existing stable `NaturalResource.id` / deposit id as the remote-site identity.

Do not create a second persistent mine id when the resource deposit already has stable deterministic identity and depletion persistence.

The transport endpoint extension should be conceptually:

```ts
TransportEndpointRef
  | { type: 'household', householdId: HouseholdId }
  | { type: 'settlement-storage', settlementId: string }
  | { type: 'resource-site', resourceId: string }
```

Exact naming may differ if implementation notes identify a stronger existing convention, but identity must remain the existing resource id.

## 3. Persistent Resource-site Inventory

Add a world-owned inventory store keyed by resource id for goods that have already been physically extracted but have not yet been transported.

Conceptually:

```text
resourceId → Inventory
```

Requirements:

- one authoritative `Inventory` per site with stored goods,
- lifetime independent of the rendered/streamed `ResourceDeposit` instance,
- persistence across save/load and in-session `WorldBundle` rebuild,
- sparse storage: sites with no stored goods need no persisted record,
- use shared `InventoryContentsSnapshot` serialization rather than a new item-storage format.

This inventory owns only extracted goods waiting at the site. Deposit depletion remains owned by the existing `ResourceDepletionState`.

Do not merge resource depletion and extracted-item ownership into one state object.

## 4. Mining Ownership Transition

Change the Miner flow so successful extraction produces ore into the resource site's authoritative inventory instead of carrying it all the way to the settlement stockpile.

Target ownership:

```text
before extraction
ResourceDeposit / ResourceDepletionState owns remaining natural resource

successful extraction
resource-site Inventory owns produced ore

after transport pickup
NpcAuthoritativeState.transportCargo owns ore

after delivery
SettlementEconomy.items owns ore
```

The Miner may still physically travel to the deposit and perform the existing extraction action. The important change is the post-extraction ownership boundary.

Do not use `NpcAgent.carried` as persistent remote-site ownership.

## 5. Transport Endpoint Resolution

Extend the shared transport endpoint mechanism rather than create `MineDelivery`, `OreHaul` or a second transport transaction path.

`resource-site` must resolve through the same concepts used by existing endpoints:

- identity → authoritative inventory,
- identity → world position for detailed carrier travel.

`src/world/transportOffscreen.ts::resolveTransportEndpointInventory()` must be able to resolve resource-site inventory without requiring the rendered deposit to be loaded.

Detailed execution in `src/ai/npcProfessionWork.ts` must resolve the same site's stable position and inventory before pickup.

Do not encode mutable position inside `TransportOrder`; endpoint identity remains authoritative and position is derived.

## 6. Trader Is the First Carrier

Reuse the existing Trader profession as the first generic carrier.

Responsibilities remain separated:

```text
Miner
→ extracts resources

Trader/carrier
→ evaluates useful movement and executes TransportOrder
```

Do not make the Miner automatically carry every extracted batch home as part of mining completion.

Do not add a new carrier profession or remote-hauling NPC FSM.

## 7. Economic Reason for Ore Transport

Remote ore supply alone must not cause unconditional transport.

Transport opportunity should be derived from:

```text
available uncommitted ore at resource site
+
settlement economic need for that ore
-
active transport commitments already covering that movement
```

Reuse the accounting pattern established by `src/economy/foodTransportDemand.ts`:

- derive incoming commitment coverage from active `TransportOrder`s,
- derive outgoing reservation coverage from pre-pickup orders,
- do not persist a separate demand registry,
- after pickup the source inventory already reflects goods leaving the site.

The ore demand query should use existing `SettlementEconomy` / production-shortage mechanisms where they already expose a real need. Do not invent `needsOreDelivery` state.

If the current economy exposes only a narrower concrete ore need, implement that smallest real need rather than a speculative generic resource allocator.

## 8. Available Remote Supply

Available site supply is derived live:

```text
siteInventory.count(itemKind)
- pre-pickup committed quantity from this resource-site endpoint
```

This is not persistent reservation state.

Pickup must revalidate the current site inventory and other active commitments immediately before `executeTransportPickup()`.

## 9. Order Creation and Execution

Reuse the existing `TransportOrders` registry and `planTransportOrderExecution()` flow.

Expected Trader behavior:

```text
resume existing order first
→ otherwise evaluate existing food collection
→ evaluate remote ore opportunity
→ create assigned TransportOrder
→ travel to resource site
→ executeTransportPickup()
→ travel to settlement storage
→ executeTransportUnload()
```

The exact ordering between food and ore opportunities should preserve existing food-shortage behavior. Remote ore must not silently starve an urgent food transport commitment.

One active transport per carrier remains enforced by `TransportOrders.findByCarrier()`.

## 10. Destination Availability

Delivery into `SettlementEconomy.items` is the moment ore becomes settlement-local economic stock.

Before delivery:

```text
resource-site inventory contains ore
settlement economy does not
```

After delivery:

```text
resource-site inventory decreased at pickup
transportCargo owns goods during transit
settlement economy inventory increases at unload
```

Existing production should observe the delivered stock through its normal economy/inventory queries. Do not add a remote-ore read path to production.

## 11. Persistence and Off-screen Simulation

The flow must survive:

- resource deposit render streaming,
- settlement stream-out/in,
- carrier stream-out after pickup,
- save/load before pickup,
- save/load during transport,
- in-session `WorldBundle` rebuild.

Resource-site inventory must be manager/world-owned state, not state attached only to a rendered deposit instance.

Off-screen transport after pickup continues through the existing 019 mechanism. This plan should only extend endpoint inventory resolution where needed.

Pre-pickup orders may remain assigned while detailed execution is unavailable, matching the existing transport contract.

## 12. Failure and Revalidation

Before pickup:

- resource id must still resolve to the expected site,
- source inventory must still contain transferable goods,
- active-order accounting must be recomputed,
- zero transferable quantity follows existing transport failure semantics.

After pickup:

- physical cargo remains authoritative on `transportCargo`,
- source depletion or later demand changes must not duplicate or delete cargo,
- destination rejection keeps cargo in transit according to existing transaction semantics.

The invariant remains:

> Extracted ore has exactly one authoritative owner.

## 13. Determinism and Performance

Do not introduce a global per-frame scan across all deposits × settlements × item kinds.

Prefer bounded discovery around the Trader's own settlement and known/resource-related candidate sites.

Reuse deterministic ordering/tie-breaking. If multiple sites can satisfy the same need, candidate selection must have a stable tie-break based on existing identity after distance/priority comparison.

No new global logistics tick.

## 14. Observability

Existing transport diagnostics should remain useful for the new endpoint.

For the first slice it should be possible to inspect:

- resource id,
- resource-site inventory quantity,
- active outgoing commitment quantity,
- derived settlement need,
- created `TransportOrder`,
- carrier and cargo after pickup,
- completed delivery and resulting settlement stock.

Do not add a separate logistics history subsystem.

## 15. Focused Tests

Required coverage:

### Extraction creates remote ownership

```text
Miner extracts ore
→ resource depletion changes
→ resource-site inventory gains ore
→ settlement inventory does not change
```

### Reconstruction does not lose extracted ore

```text
ore extracted to resource-site inventory
→ NPC reconstruction / stream transition
→ site still owns the same ore
```

### Commitment accounting prevents double promise

Two active pre-pickup orders cannot commit more ore than the site's current inventory.

### Pickup transfers ownership

```text
resource-site inventory
→ executeTransportPickup()
→ transportCargo
```

with no duplication.

### Delivery changes local availability

```text
transportCargo
→ executeTransportUnload()
→ SettlementEconomy.items
```

and the ore becomes visible through existing economy/production queries only after delivery.

### Persistence

Resource-site inventory and active resource-site `TransportOrder` endpoints round-trip through save/load.

### Existing transport regression

Household-food transport from settlements-npcs-020 continues to work unchanged.

## 16. Explicit Non-goals

Outside 021 scope:

- mine buildings,
- full mine lifecycle simulation,
- generic `RemoteSite` framework,
- arbitrary production-site recipes,
- delivery from settlement to remote workplaces,
- inter-settlement trade,
- merchants/caravans,
- carts/wagons/pack animals,
- transport prices/wages,
- road-quality economics,
- route optimization,
- logistics hubs,
- generic supply-chain solver,
- global resource allocation AI,
- replacement of existing `ResourceDeposits` depletion logic.

## 17. Implementation Guidance

Prefer extending these existing seams:

- `terrain/resourceDeposits.ts` / `terrain/depositMining.ts` — extraction identity/depletion,
- shared `Inventory` / `InventoryContentsSnapshot` — extracted goods ownership,
- `world/transportOrder.ts` — endpoint identity,
- `world/transportOffscreen.ts` — endpoint inventory resolution,
- `world/transportTransactions.ts` — pickup/unload ownership transfer,
- `economy/foodTransportDemand.ts` pattern — derived commitment accounting,
- `ai/npcProfessionWork.ts` — Miner extraction and Trader order execution.

Do not make `TransportOrder` own cargo and do not make `ResourceDeposits` own transport decisions.

Add useful JSDoc for new public/architectural symbols, with `@domain settlements-npcs` where appropriate.

## Verification

### Automated

- focused resource-site inventory tests,
- mining ownership-transition tests,
- transport endpoint/resolver tests,
- commitment-accounting tests,
- persistence tests,
- existing 018–020 transport/economy tests,
- typecheck,
- lint,
- build.

### Manual browser verification

The player performs final browser verification.

Verify:

1. Miner extracts ore at a remote deposit.
2. Settlement stock does not immediately increase.
3. Extracted ore remains available at the site even if the Miner leaves/reconstructs.
4. Trader accepts the useful transport opportunity.
5. Pickup removes ore from site inventory and puts it into authoritative transport cargo.
6. Carrier can continue through detailed/off-screen transport.
7. Settlement stock increases only at unload.
8. Existing downstream production sees the ore only after arrival.
9. Existing food transport remains functional.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
