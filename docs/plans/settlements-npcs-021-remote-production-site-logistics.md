# Plan: Remote Production Site Logistics

**Created:** 2026-09-04
**Status:** `draft` 📝
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** settlements-npcs-018, settlements-npcs-019, settlements-npcs-020
**Domain:** `settlements-npcs`
**Subdomains:** `economy` `logistics`
**Tags:** `transport` `production` `remote-sites`
**Roadmap:** `physical-goods-transport.md`

## Status Note

This plan remains `draft` until `settlements-npcs-018`, `settlements-npcs-019` and `settlements-npcs-020` are implemented and their actual transport contracts are known.

Before promotion to `planned`, perform focused recon of the implemented transport architecture and the remote authoritative goods sources available in the current world/economy model. Then choose the smallest viable vertical slice and determine whether production plans such as `settlements-npcs-015`, `settlements-npcs-016` or `settlements-npcs-017` are actual dependencies for that slice.

Do not treat planned API shapes from 018–020 as implementation truth.

## Goal

Extend physical goods transport from settlement-local circulation to the first economically meaningful flow from a **remote authoritative goods source** to a destination that can use those goods.

The first slice does not require a new production-site framework. A production site, resource site, existing storage/output point or another existing world-owned source is sufficient if it owns real goods outside the destination's local inventory.

Target loop:

```text
remote authoritative goods source
        ↓
real goods remain at source
        ↓
economic need at destination
        ↓
transport opportunity
        ↓
TransportOrder
        ↓
physical / off-screen transport
        ↓
authoritative destination inventory
        ↓
goods become economically available
```

The key invariant is:

> Goods produced or stored remotely are not available to the destination until transport completes.

This makes location and travel time economically meaningful without adding a parallel logistics economy.

## Core Principle

Production/resource ownership, economic demand and transport remain separate responsibilities:

```text
source mechanism
→ creates or owns real goods at a remote location

economy
→ determines whether moving those goods is useful

transport
→ moves ownership through the world
```

Remote ownership must not magically increase settlement stock merely because the source belongs to or is associated with that settlement.

## 1. Pre-implementation Recon

After 018–020 are implemented, verify the actual code for:

### Transport

- persistent transport-order model and ownership,
- stable source/destination references,
- source resolution and pickup semantics,
- cargo ownership after pickup,
- destination delivery semantics,
- active commitment queries,
- carrier assignment/availability,
- persistence and off-screen progression,
- economic-demand integration introduced by 020.

### Remote goods sources

Identify existing world-owned sources that can support the first slice. Verify:

- authoritative owner of the goods,
- stable identity across streaming/save-load,
- location in world space,
- source availability/query semantics,
- whether the source already participates in settlement/economic relationships,
- whether goods are concrete `Inventory` items, bulk stock or another existing authoritative representation.

### Production, if relevant

Only if the chosen vertical slice uses production/input demand, inspect the implemented results of 015–017 and determine their actual dependency relationship with 021.

Do not introduce a new `RemoteSite` abstraction if current world/resource/place mechanisms already represent the required source.

## 2. First Vertical Slice

Choose the smallest existing remote goods flow that proves:

```text
remote goods exist
        ↓
they are not locally available
        ↓
existing economic demand makes movement useful
        ↓
existing TransportOrder moves them
        ↓
destination gains authoritative ownership
```

A preferred candidate, if it already exists naturally after the production plans, is:

```text
mine / remote production source
→ raw material
→ settlement storage
→ downstream production consumer
```

For example, `mine → raw material → settlement → Blacksmith` is valuable if the implemented economy already supports it cheaply.

It is not mandatory. Do not build a mine, Blacksmith chain or large production subsystem merely to satisfy this example.

A simpler flow such as:

```text
remote resource/output source
→ settlement shortage
→ settlement storage
```

fully satisfies the first 021 slice if it reuses the actual architecture cleanly.

## 3. Remote Source Ownership

Goods at the remote source must have one authoritative owner.

```text
before pickup    remote source owns goods
after pickup     carrier / in-transit owner owns goods
after delivery   destination owns goods
```

The remote source must not simultaneously contribute those goods to destination inventory or economic availability before delivery.

Reuse the ownership rules established by 018–019 rather than introducing remote-production-specific cargo state.

## 4. Reuse Transport Source and Destination Abstractions

021 must use the source/destination model actually implemented by 018.

If that model needs a minimal extension to resolve the chosen remote source, extend the shared abstraction rather than introducing a second transport path such as `RemoteDelivery` or `ProductionHaul`.

Transport execution should not need to know why a source owns its goods.

Exact union shapes, reference names and resolver APIs must be determined from the implemented code during draft exit recon.

## 5. Economic Reason for Transport

Remote supply alone must not automatically create transport.

The first slice should reuse the economic → transport mechanism from 020:

```text
remote source has available goods
+
destination has uncovered economic need
+
existing active commitments do not already cover it
        ↓
transport opportunity exists
```

The destination need may be a settlement shortage or, if already supported naturally, a production-input need.

Do not create parallel state such as:

- `RemoteProductionDeliverySystem`,
- `MineDeliveryManager`,
- `ResourceHaulingScheduler`,
- `needsOreDelivery`.

Demand should remain derived from authoritative economic state.

## 6. Available Remote Supply

Remote supply should likewise be derived from authoritative source state and active transport commitments.

Conceptually:

```text
availableRemoteSupply =
    current source availability
    - goods already committed for pre-pickup transport
```

This is a derived query, not persistent economic state.

After pickup, goods no longer count as remote source supply because ownership has already moved to the carrier/in-transit owner.

Reuse commitment accounting from 020 and any source reservation semantics actually introduced by 018–019.

## 7. No Fixed Delivery Route

Do not model the first flow as a special permanent route such as:

```text
mine always delivers to Blacksmith
```

The useful movement should emerge from source availability, destination demand and existing world relationships/accessibility.

The first vertical slice may have only one practical source/destination pair, but generic transport execution must not encode a specific profession or resource chain.

## 8. Carrier Execution

Reuse carrier execution from 018–019.

Detailed execution may look conceptually like:

```text
carrier
→ travel to remote source
→ pickup
→ travel to destination
→ unload
```

Off-screen execution must advance the same accepted transport commitment through the fidelity mechanism from 019.

021 must not add a remote-hauling NPC FSM or force the carrier/source to remain in detailed simulation.

## 9. Remote Availability Delay

021 introduces one essential economic consequence of distance:

```text
remote goods exist at T0
≠
goods available at destination at T0
```

The goods become available to the destination only after valid delivery.

This first slice does not require transport pricing, wages, fuel, animal feed, road-quality costs or other logistics economics. Travel/transport delay is sufficient to make location meaningful.

## 10. Downstream Production Integration — Optional Slice Extension

If the chosen remote goods are an input to an already implemented production chain, verify the stronger consequence:

```text
required input exists remotely
but has not arrived
        ↓
destination production still lacks the input

transport delivery
        ↓
destination inventory changes
        ↓
existing production logic can use the input
```

This is a preferred integration when it falls naturally out of the implemented 015–017 systems, but it is not required to complete the base 021 remote-logistics slice.

Do not make production read remote goods as local merely because source and destination belong to the same settlement.

## 11. Source and Destination Revalidation

Use the live revalidation semantics from the transport foundation.

Before pickup, resolve the remote source and verify actual available goods. If source state changed, follow the partial/failure/reservation semantics implemented by 018–019.

Before unload, resolve the destination and apply the shared destination acceptance/recovery rules.

If economic demand changes after pickup, do not destroy or duplicate physical cargo. Once the carrier owns the goods, transport must preserve coherent ownership and recovery semantics even if the original derived opportunity is no longer current.

## 12. Streaming and Simulation Fidelity

Remote logistics must remain independent of the player and camera.

The selected flow must remain coherent when:

- the source is outside detailed simulation,
- the carrier transitions off-screen,
- the destination is unloaded,
- the player is elsewhere,
- save/load or time skip crosses an active transport.

These mechanics belong primarily to 019. 021 should verify that its new remote source participates correctly rather than reimplementing them.

Remote source production/output must not require player observation unless the existing source system itself intentionally requires detailed simulation.

## 13. Determinism and Performance

Reuse deterministic selection/tie-breaking and bounded evaluation from 018–020.

Do not introduce global per-frame scanning across:

```text
all remote sources
× all settlements
× all goods
× all carriers
```

Prefer existing settlement/source relationships, bounded candidate discovery, normal work/economic evaluation cadence and indexed active-order queries.

021 adds no global logistics tick.

## 14. Failure and Ownership

Remote-specific failures may include:

- source disappears or becomes invalid before pickup,
- goods are consumed or claimed before pickup,
- source ownership/availability changes,
- destination need changes,
- carrier cannot reach the source,
- streaming occurs during the trip.

Reuse generic failure/recovery behavior from 018–019 wherever possible.

The invariant remains:

> Goods have exactly one authoritative owner and may never be duplicated or silently deleted.

## 15. Observability

Reuse transport/economy diagnostics and history mechanisms available after 018–020.

For the selected vertical slice it should be possible to determine at least:

- remote source availability,
- destination economic need,
- active commitment coverage,
- created transport order,
- pickup/ownership transition,
- delivery,
- resulting destination availability.

Do not introduce a separate permanent logistics-history subsystem solely for 021.

## 16. Focused Tests

021 tests should focus on the new remote-source boundary rather than duplicate the complete 018–020 transport test suite.

Required coverage:

### Remote goods do not teleport

```text
remote source owns goods
→ destination inventory remains unchanged before delivery
```

### Remote source can satisfy transport demand

```text
remote source availability
+
destination uncovered economic need
→ existing transport mechanism can create/accept an order
```

### Delivery changes destination availability

```text
remote source
→ pickup
→ transport
→ delivery
→ authoritative destination inventory increases
```

### Remote goods remain unavailable locally before delivery

If the destination or downstream system queries local availability before arrival, the remote goods must not satisfy it.

### Existing transport invariants remain valid

Use focused integration coverage to confirm the selected remote source works with the ownership, active-commitment and off-screen mechanisms already tested by 018–020. Do not duplicate their full test matrices unless 021 changes those mechanisms.

If downstream production is included in the selected slice, add one integration test showing that production cannot consume the remote input before delivery and can observe it after delivery.

## 17. Explicit Non-goals

Outside 021 base scope:

- building a new remote production framework solely for transport,
- full mine simulation,
- mandatory Blacksmith integration,
- generic production-input logistics,
- multiple competing settlements,
- inter-settlement trade,
- merchants and caravans,
- carts and wagons,
- pack animals,
- transport pricing or wages,
- fuel/feed costs,
- road-quality economics,
- route optimization,
- logistics hubs,
- new warehouse subsystem,
- global resource allocation,
- production planning AI,
- generic supply-chain solver.

## 18. Extension Path

After 021, Seedvale should have one coherent chain:

```text
remote authoritative source
        ↓
economic demand
        ↓
TransportOrder
        ↓
physical/off-screen movement
        ↓
destination inventory
        ↓
economic availability changes
```

The same mechanism can later expand to multiple remote sites, delivery from settlements to remote workplaces and finally inter-settlement movement without replacing the transport model.

Only after this slice is proven should separate plans be evaluated for pack animals/carts/wagons, inter-settlement goods transport and merchant/caravan economics.

## Implementation Guidance

This plan describes behavior and ownership boundaries, not a required class layout.

After 018–020, prefer their implemented abstractions over special APIs for remote production. Extend shared mechanisms only where the selected remote source proves a real missing capability.

Add useful JSDoc to important new public/architectural functions or classes introduced by the implementation. For important discovery points, consider `@domain settlements-npcs`.

## Verification

### Automated

- focused tests for the selected remote-source integration,
- relevant existing transport/economy tests,
- typecheck,
- lint,
- build.

### Manual browser verification

The player performs final browser verification.

For the selected vertical slice verify:

1. a remote authoritative source owns real goods,
2. the destination has a real economic need,
3. those goods are not available at the destination before transport,
4. an existing transport commitment is created/accepted,
5. pickup transfers ownership from source to carrier/in-transit owner,
6. the trip proceeds using detailed or off-screen execution as appropriate,
7. delivery transfers ownership into the authoritative destination inventory,
8. destination economic availability changes only after delivery,
9. the flow remains coherent when the player does not observe the full trip.

If downstream production is part of the chosen slice, additionally verify that it reacts only after the input physically arrives.

## Draft Exit Criteria

Move this plan from `draft` to `planned` only after:

```text
018–020 implemented
        ↓
recon actual transport architecture
+
recon available remote authoritative sources
        ↓
choose smallest viable vertical slice
        ↓
determine whether 015–017 are actual dependencies
        ↓
rewrite 021 to concrete implemented types and boundaries
```

Specifically:

- `settlements-npcs-018` is implemented,
- `settlements-npcs-019` is implemented,
- `settlements-npcs-020` is implemented,
- the actual transport source/destination and ownership contracts are confirmed,
- at least one real remote authoritative goods source is identified,
- its stable identity and ownership semantics are confirmed,
- the smallest viable vertical slice is selected,
- production-plan dependencies are added only if the selected slice genuinely requires them,
- the plan is updated to actual implemented APIs and integration boundaries,
- the selected slice does not require an unrelated large production subsystem.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
