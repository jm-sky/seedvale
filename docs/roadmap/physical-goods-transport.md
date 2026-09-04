# Physical Goods Transport

## Goal

Add a coherent physical goods transport layer for Seedvale so distance becomes a real economic constraint without introducing a parallel logistics simulation.

Transport should emerge from existing world state:

```text
resources / production / household surplus
                  ↓
        shortage / economic demand
                  ↓
           transport commitment
                  ↓
       pickup → travel → unload
                  ↓
        destination inventory
                  ↓
      changed supply / pressures
```

The mechanism must preserve explicit ownership of real goods, integrate with existing NPC actions, continue coherently when carriers are off-screen and remain compatible with future carts, draft animals and inter-settlement trade.

This roadmap defines architectural direction. Concrete implementation details belong in implementation plans.

## Existing foundations

Current code already provides most of the primitives required for the first transport layer:

- `Household` owns concrete goods through `Inventory`.
- `SettlementEconomy` owns settlement stock and concrete item inventory.
- `NpcAgent` owns a temporary carried `Inventory` used during physical transfers.
- Existing local circulation already follows physical pickup and delivery rather than abstract teleportation.
- Existing exchange flows use decision-time source selection followed by live claim/revalidation at pickup.
- Concrete food transfer preserves freshness batches end-to-end.
- NPC movement already provides the reusable `goTo → execute → next` action lifecycle.
- `SettlementEconomy` already demonstrates explicit reservation lifecycles for bulk economic stock, although those reservations are not a generic transport reservation mechanism.
- Settlement streaming and time skip already establish the need for lower-fidelity simulation when individual actors are not actively simulated.

`settlements-npcs-014` established the important local ownership invariant:

```text
source inventory → NPC carried inventory → destination inventory
```

The transport layer should generalise this idea to economically meaningful longer-distance movement rather than replace it.

## Current gap

Local goods circulation works for bounded settlement-local transfers, but Seedvale does not yet have a persistent representation of a longer transport commitment.

Without one, the simulation cannot cleanly represent cases such as:

```text
mine → settlement
farm → settlement
remote resource site → workplace
settlement → settlement
merchant → settlement
```

The missing concepts are not another inventory or another market. The missing concept is the persistent commitment that connects a real source, real destination, real cargo requirement and a carrier across time and simulation fidelity changes.

## Core model

### Persistent `TransportOrder`

Long-distance transport should be represented by a persistent `TransportOrder`-style record owned by world simulation state.

It should describe the commitment, not duplicate the goods themselves.

Conceptually it needs to identify:

- source,
- destination,
- requested goods and quantity,
- assigned carrier or carrier strategy,
- lifecycle state,
- timing/progress information required for off-screen progression,
- failure/recovery information where necessary.

The record should remain small and deterministic. It is not a reason to introduce a global per-frame `LogisticsSystem`, `TradeManager` or `MarketSystem`.

### Stable source and destination references

Transport must not depend on captured runtime object references that disappear when settlements or actors unload.

Use persistent references that can be resolved against current world state, for example conceptually:

```text
{ type: household, id: ... }
{ type: settlement, id: ... }
{ type: resource-site, id: ... }
```

Exact types should be chosen during implementation planning based on current repository ownership patterns.

### Cargo ownership invariant

At every moment, real goods must have exactly one authoritative owner.

```text
before pickup    source owns goods
after pickup     carrier / in-transit owner owns goods
after unload     destination owns goods
```

A `TransportOrder` may store cargo metadata required to validate the transaction, but it must not become a second authoritative copy of inventory quantities.

This invariant is essential for preventing duplication or silent loss during interruption, unload, death, save/load, settlement streaming and time skip.

## Transport demand versus transport order

Transport demand is an economic reason for moving goods. A transport order is an accepted commitment to perform that movement.

Demand should emerge from existing systems such as:

- destination shortage,
- production input requirements,
- household or settlement demand,
- producer surplus,
- remote resource output,
- future inter-settlement imbalance.

Avoid a separate globally persisted demand graph unless the existing economy later proves it necessary. Prefer deriving candidate demand from authoritative economic state and persisting only accepted transport commitments.

## Claim, pickup and reservation semantics

Source selection should preserve the existing Seedvale pattern:

```text
find candidate source
      ↓
travel / prepare pickup
      ↓
revalidate live source state
      ↓
claim actual available quantity
      ↓
transfer ownership to carrier
```

This prevents stale planning from duplicating goods.

For cheap local transport, live claim at pickup may be sufficient even if another actor consumes the stock first.

For expensive long-distance trips, a source-side reservation may eventually be justified. Such reservations should belong to the authoritative source or shared inventory/stock mechanisms rather than a global transport manager.

The first implementation should introduce reservation only when the selected vertical slice genuinely requires it.

## Destination semantics

Unload must be transactional with respect to ownership.

If the destination cannot accept the entire cargo, the system must not remove goods from the carrier first and then fail to add them. Any remainder must remain owned by the carrier or another explicit in-transit owner until a valid recovery action is chosen.

Possible recovery outcomes include:

- retry destination,
- choose another valid destination,
- return cargo to source,
- keep cargo with carrier,
- mark the order as stranded/recovery-required.

The concrete behavior should depend on the goods and destination type rather than a magical global fallback.

## Execution fidelity

Physical transport should use one economic model with multiple execution fidelities.

### Nearby / observed transport

Use existing NPC simulation:

```text
assign order
  ↓
goTo source
  ↓
pickup / claim
  ↓
NpcAgent.carried
  ↓
goTo destination
  ↓
unload
  ↓
complete order
```

Do not add a separate transport movement FSM if the current NPC action lifecycle can express the work.

### Distant / off-screen transport

Do not keep every carrier pathfinding or ticking every frame.

The same persistent order should be able to advance using elapsed simulation time and deterministic travel estimates when detailed simulation is unnecessary.

Conceptually:

```text
departure → in transit → arrival → unload resolution
```

This is not magical teleportation if cargo ownership and transport state remain explicit and the same economic consequences occur.

When an order becomes important, observed or otherwise requires higher fidelity, the simulation should be able to return to physical actor execution without changing the economic model.

### Time skip

Time skip should advance eligible transport through the same elapsed-time semantics used for off-screen simulation instead of requiring normal per-frame NPC updates.

The result after a skip must preserve conservation of cargo and order lifecycle deterministically.

## Carrier evolution

The transport model should not be tied permanently to one carrier implementation.

Expected progression:

1. NPC carrying goods in existing `NpcAgent.carried` inventory.
2. NPC with larger or specialised carrying capacity where justified.
3. NPC leading a pack animal.
4. NPC + harnessed animal + cart/wagon.
5. Inter-settlement merchant or caravan using the same transport commitment model.

The first transport implementation should use only the simplest carrier that proves the architecture.

`items-player-014-rope-pullable-resource-transport.md` and `fauna-007-animal-leading-and-cart-harness.md` are future integration points, not mandatory dependencies for the first persistent transport order.

## Failure and interruption

Transport must remain coherent when execution is interrupted.

Important cases include:

- source stock changed before pickup,
- another actor claims some or all goods,
- carrier cannot take the requested quantity,
- path or destination becomes unavailable,
- destination lacks capacity,
- NPC abandons or interrupts the action,
- NPC dies,
- settlement unloads,
- save/load occurs while goods are in transit,
- time skip crosses departure or arrival.

The core invariant is always:

> no cargo may be duplicated, silently deleted or represented as authoritative in two places at once.

Recovery behavior can be simple initially, but ownership must remain explicit.

## Persistence and streaming

A transport commitment must survive runtime representation changes.

The persistent order therefore belongs to world simulation state rather than only to an `NpcAgent` action queue.

However, cargo persistence requires special care: if a physical carrier is unloaded while owning real goods, those goods still need an authoritative persistent owner.

The implementation plan must verify current NPC persistence/streaming behavior and choose one coherent approach, for example:

- persist carried inventory with authoritative NPC state, or
- atomically hand cargo to a persistent in-transit owner when lowering simulation fidelity, then restore physical ownership when detailed simulation resumes.

Whichever approach is chosen, there must never be simultaneous authoritative copies in both `NpcAgent.carried` and transport state.

## Roadmap stages

### Stage 1 — Persistent transport foundation

Introduce the smallest persistent transport commitment and prove physical execution using existing inventories and NPC movement.

Goals:

- persistent `TransportOrder`-style record,
- stable source/destination references,
- deterministic assignment,
- live source revalidation,
- explicit cargo ownership transitions,
- pickup / travel / unload / complete lifecycle,
- interruption-safe failure semantics,
- no parallel logistics manager.

The exact first vertical slice should be selected during implementation planning based on current code. It should prove something that local circulation from `settlements-npcs-014` does not already prove.

### Stage 2 — Remote production logistics

Connect transport to real remote production/resource flows.

Candidate examples:

```text
mine → settlement storage → Blacksmith
remote gathering site → settlement
farm output → processing/storage destination
```

Transport should be created because economic demand and source availability require movement, not because a fixed route exists.

### Stage 3 — Off-screen and time-skip transport

Make active transport survive settlement streaming and advance coherently at lower simulation fidelity.

Goals:

- elapsed-time progression,
- deterministic arrival resolution,
- save/load-safe cargo ownership,
- fidelity transitions without duplication,
- no global per-frame carrier simulation.

Some of these capabilities may need to land in Stage 1 if the selected vertical slice cannot be correct without them.

### Stage 4 — Pack animals, carts and wagons

Extend carrier capacity through the existing fauna/player transport concepts rather than creating a separate cart economy.

Potential integration points:

- animal leading,
- harness state,
- cart attachment,
- cargo capacity,
- travel speed and terrain constraints.

Transport orders should remain unchanged at the economic level; only carrier execution/capacity should evolve.

### Stage 5 — Inter-settlement transport

Allow the same model to move goods across settlement boundaries.

```text
settlement surplus
      ↓
transport order
      ↓
carrier / merchant / caravan
      ↓
other settlement shortage
```

This becomes the physical foundation for future inter-settlement trade, travelling merchants and caravans without requiring a separate trade simulation.

## Relationship with economy roadmaps

`docs/roadmap/economy-production.md` defines the broad economic progression from resources through production, exchange, transport and later professions.

`docs/roadmap/economy-goods-flow.md` defines how goods circulate through households, settlement storage, production demand and local trade.

This roadmap expands their physical transport stage:

```text
economy-production
       ↓
economy-goods-flow
       ↓
physical-goods-transport
       ↓
implementation plans
```

The three documents should remain complementary rather than duplicating implementation detail.

## Dependencies and overlaps

### Direct foundations

- `settlements-npcs-014` — implemented local goods circulation and physical carried-goods flow.
- `Household` and `SettlementEconomy` ownership.
- `Inventory` and concrete goods.
- `NpcAgent` movement/action lifecycle.
- settlement streaming and time-skip infrastructure.

### Economic producers of future transport demand

- `settlements-npcs-015` — economic production/input integration.
- `settlements-npcs-016` — first processing chain and Blacksmith production.
- `settlements-npcs-017` — production demand and economic pressures.

These plans are important consumers/producers of transport demand, but the transport model should not be architecturally coupled to one specific profession or recipe.

### Future carrier integrations

- `items-player-014-rope-pullable-resource-transport.md`
- `fauna-007-animal-leading-and-cart-harness.md`

They should extend transport capacity and physical representation later, not define the base economic ownership model.

## Explicit non-goals

The transport foundation should not introduce:

- a global `LogisticsSystem` with per-frame scanning,
- a parallel `TradeManager` or market inventory,
- fixed scripted resource routes as the primary model,
- magical transfer between source and destination,
- a duplicate authoritative cargo inventory without a persistence reason,
- full caravan simulation in the first implementation,
- dynamic commodity pricing,
- a road-network simulation,
- a dedicated courier profession before the shared transport mechanism exists,
- cart/horse/donkey requirements for the first vertical slice.

## Architectural constraints

1. Transport must emerge from real source availability and economic need.
2. Real goods must always have one authoritative owner.
3. `TransportOrder` describes commitment; it does not duplicate inventory.
4. Reuse existing `Inventory`, `Household`, `SettlementEconomy` and NPC action mechanisms.
5. Revalidate source state when pickup occurs.
6. Keep source/destination identity stable across streaming.
7. Prefer deterministic carrier/source selection and tie-breaking.
8. Nearby transport should use physical NPC execution where meaningful.
9. Remote/off-screen transport should reduce simulation fidelity without changing economic truth.
10. Avoid global per-frame scans and carrier ticks where event/elapsed-time progression is sufficient.
11. Carts, animals and caravans should extend carrier execution rather than create parallel transport semantics.
12. Save/load, interruption and failure must never duplicate or silently delete cargo.

## Success criterion

Physical transport is successful when a real economic chain can cross meaningful distance while preserving causal ownership:

```text
remote source produces goods
        ↓
economic demand identifies a useful destination
        ↓
persistent transport commitment is created
        ↓
carrier claims real cargo
        ↓
goods remain explicitly in transit
        ↓
destination receives the exact surviving cargo
        ↓
supply / shortage / production pressures change
```

The player does not need to observe the trip for the world consequence to remain valid.