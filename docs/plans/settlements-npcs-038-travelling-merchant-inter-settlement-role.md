# Plan: Travelling Merchant inter-settlement role

**Created:** 2026-09-15
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** M/L
**Depends on:** settlements-npcs-037, ~~settlements-npcs-028~~, ~~settlements-npcs-033~~
**Domain:** `settlements-npcs`
**Subdomains:** `economy` `logistics` `schedules`
**Tags:** `merchant` `travel` `inter-settlement` `transport` `trade`
**Roadmap:** `physical-goods-transport`

## Goal

Turn the existing settlement Trader into the first real **Travelling Merchant** without creating a new trade/logistics subsystem.

The merchant should remain the same persistent NPC identity, leave its home settlement because a real inter-settlement economic opportunity exists, physically/off-screen carry goods using the shared `TransportOrder` flow, visit the destination settlement, remain interactable there when materialized, and return home through the generic NPC travel continuity from plan 028.

Target lifecycle:

```text
home Trader
  ↓
real inter-settlement opportunity from 037
  ↓
TransportOrder assigned
  ↓
pickup at source settlement
  ↓
long-distance cargo transport
  ↓
delivery at destination settlement
  ↓
bounded merchant visit
  ↓
generic NPC return travel
  ↓
same Trader returns home
```

The role is a consumer of the transport/economy stack. It must not own a second market inventory, demand graph, travel engine or cargo model.

## Recon — current implemented foundations

Current code already provides the necessary pieces:

- existing `CharacterDef.role === 'trader'` and `planTraderWork()` in `src/ai/npcProfessionWork.ts`,
- player-facing merchant trade through the existing generalized trade UI/transactions (`settlements-npcs-033`),
- world-owned `TransportOrder` and carrier cargo ownership,
- remote/off-screen transport execution from 019/021,
- inter-settlement economic/transport matching introduced by `settlements-npcs-037`,
- persistent `NpcAuthoritativeState` including personal inventory and generic travel,
- `src/ai/npcTravel.ts` from plan 028:
  - `NpcTravelContinuity`,
  - detailed ↔ off-screen handoff,
  - deterministic ETA/interpolation,
  - survival checkpoints,
  - caller-owned `purpose`,
  - idempotent arrival observation,
- persistent settlement membership/home identity remains unchanged while NPC travels.

`NpcTravelPurpose` currently has an expedition variant and was explicitly designed as semantic caller context for later generic travel flows. Travelling Merchant should extend that shared union rather than create a `MerchantTravelEngine`.

## Architectural decision: no new profession enum in V1

Do **not** add a separate `travelling_merchant` profession/role for the first slice.

A Travelling Merchant is initially:

```text
existing role === 'trader'
+
active cross-settlement merchant journey
```

Reasons:

- Trader already owns local transport/economic work,
- player-facing merchant interaction already recognizes Trader behavior,
- inter-settlement transport should be an extension of the same world actor,
- adding a second role would immediately create staffing/generation/dialogue duplication.

A dedicated specialist role may be justified later if settlements need separate Local Trader and Travelling Merchant staffing simultaneously.

## Core invariants

1. The merchant is always the same NPC identity.
2. Leaving home does not transfer formal settlement/household membership.
3. Outbound committed cargo remains `transportCargo`; it is not merchant shop stock.
4. Player trade must never sell goods currently committed to a `TransportOrder`.
5. Merchant travel continues without player observation.
6. One merchant cannot execute local work, an outbound transport and a return journey simultaneously.
7. No replacement Trader is spawned while the real Trader is away.
8. A merchant journey is caused by real economic state, not by a scripted patrol route.

## 1. Journey trigger

A journey begins only from a valid inter-settlement opportunity created by plan 037.

The existing source-settlement Trader is the first supported actor.

Eligibility requires at least:

- role is `trader`,
- alive,
- no active incompatible generic travel,
- no active incompatible expedition/accompany commitment,
- no other active `TransportOrder`,
- physically/logically associated with its home settlement,
- 037 produced or can produce a valid source→destination transport commitment.

Do not add global merchant assignment auctions or search all NPCs for a carrier.

## 2. Outbound cargo leg

The outbound leg is **not** a new merchant journey transport implementation.

Reuse 037 exactly:

```text
TransportOrder
source settlement-storage
→ pickup
→ NpcAuthoritativeState.transportCargo
→ physical/off-screen transport
→ destination settlement-storage
→ completion
```

During this leg:

- `TransportOrder.execution` owns cargo-trip timing/progress,
- `transportCargo` owns the goods,
- local Trader work is suspended by the existing active-order guard,
- do not also run an independent `NpcTravelContinuity` clock for the same outbound cargo leg.

If shared survival/reification helpers from `npcTravel.ts` are reused, they must not create a second authoritative arrival time.

## 3. Destination arrival and merchant visit

After successful cross-settlement delivery, the Trader becomes a visiting merchant at the destination for a bounded deterministic period.

This is role lifecycle, not transport state.

Implementation notes must identify the smallest persistent representation needed to distinguish:

```text
outbound transport
→ visiting destination
→ returning home
```

Prefer a compact NPC-owned merchant journey/visit record or semantic generic-travel context over a world-global merchant registry.

Do not persist derived economy scores or copied settlement inventories.

The visit record, if needed, should contain only stable semantic data such as:

- home settlement id,
- current visit settlement id,
- visit start/end world time,
- phase required for idempotent continuation.

Do not store runtime `Settlement`, `NpcAgent`, scene object or inventory references.

## 4. Physical presence at destination

When destination is relevant/loaded, the visiting merchant should materialize as the same NPC at a safe position near the destination settlement's existing merchant/trade/public area.

Reuse the generic 028 reification/position semantics rather than spawning a destination-local clone.

The merchant remains a member of its home settlement while visiting.

Do not:

- create a second NPC in the destination population,
- change stable NPC id,
- change family/household membership,
- permanently restaff destination professions.

If destination is unloaded, the visit may remain coarse/off-screen until reification or until the visit window expires.

## 5. Player-facing trade during visit

Reuse the existing player↔NPC trade system from `settlements-npcs-033`.

The travelling merchant may expose the same merchant interaction it already has when the NPC is materialized at the destination.

Critical ownership separation:

```text
transportCargo = committed settlement delivery
merchant/player trade stock = existing merchant-facing trade path
personalInventory = NPC-owned belongings/coins
```

Do not make committed `transportCargo` purchasable by the player.

Do not copy destination settlement stock into a merchant inventory merely to make a shop UI work.

If current `MERCHANT_STOCK` remains catalog-driven rather than a fully physical persistent shop inventory, preserve that existing behavior in this plan; converting merchant merchandise to a fully world-owned physical inventory is separate work.

## 6. Visit duration and work behavior

Use one deterministic configured visit duration, expressed in world time.

During the visit the merchant:

- does not perform home-settlement local Trader collection,
- may be available for normal player trade/dialogue when live,
- does not automatically start another outbound delivery from the destination in V1,
- waits for visit expiry unless interrupted by existing critical NPC state.

Do not implement a multi-stop route scheduler yet.

The duration constant and exact destination idle target should be chosen during implementation notes from current schedule/action conventions rather than invented in parallel.

## 7. Return-home travel

After the visit expires, return travel uses generic `NpcTravelContinuity` from plan 028.

Extend `NpcTravelPurpose` with the smallest semantic merchant-return context required for idempotent arrival handling. Do not create a merchant-specific off-screen travel engine.

Conceptually:

```text
visit expires
→ generic travel destination = home settlement position
→ detailed XOR off-screen travel
→ survival continuity
→ arrival observed exactly once
→ merchant journey cleared
→ normal home Trader work resumes
```

The return leg carries no settlement transport cargo in V1.

If `personalInventory` contains the NPC's own belongings/coins, they remain attached to the same NPC throughout travel.

## 8. Home settlement consequences

The world should feel the merchant's absence.

While the Trader is away:

- the same NPC cannot collect local surplus at home,
- local Trader economic work may temporarily be unavailable,
- no replacement Trader should be created automatically,
- settlement economy continues through its other systems.

This is an intended systemic consequence, not a bug to hide with a proxy worker.

Do not create an abstract `merchant available` flag disconnected from the real NPC.

## 9. Repeat journeys

After returning home and clearing the journey state, the Trader may later accept another 037 opportunity through normal work evaluation.

V1 does not need a permanent route.

Repeated behavior emerges from:

```text
current inter-settlement shortage/surplus
+
Trader available at home
→ new accepted transport commitment
```

This keeps route choice responsive to the simulated economy.

## 10. Candidate destination selection

Destination selection remains owned by the 037 economic matching mechanism.

038 must not add separate merchant heuristics that disagree with transport demand.

Later merchant-specific strategy may include:

- profit,
- reputation,
- safety,
- route familiarity,
- road quality,
- market prices.

None belong in the first slice.

## 11. Interruption and failure

### Death during outbound transport

Reuse transport/NPC death ownership semantics. Do not complete delivery or spawn a replacement merchant automatically.

### Delivery failure

Merchant remains governed by the existing transport recovery state; do not advance to visit phase until the cross-settlement order is genuinely completed.

### Death/blocked state during visit or return

Generic NPC authoritative health/travel state wins. Do not mark home arrival.

### Destination unload/reload

Visit state must remain persistent/coherent; same NPC reifies if needed.

### Save/load

Restore the same phase without:

- restarting visit timer,
- repeating delivery,
- creating duplicate return travel,
- duplicating NPC,
- resetting home membership.

## 12. Persistence

Prefer reusing existing persistent owners:

- `TransportOrder` for outbound delivery,
- `NpcAuthoritativeState.travel` for return travel,
- existing NPC state persistence for merchant-owned lifecycle metadata if one small field is required.

Do not create a global `TravellingMerchants` registry unless implementation recon proves the lifecycle cannot be represented coherently on the authoritative NPC state.

Any new merchant journey metadata must be plain-data, sparse and save-compatible with absent = no active journey.

## 13. Simulation fidelity and performance

No per-frame world merchant manager.

Use:

- existing Trader work cadence to accept a journey,
- existing TransportOrder off-screen execution for outbound cargo,
- timestamp-based visit expiry,
- generic NPC travel checkpoints for return,
- normal settlement/NPC streaming for materialization.

Cost should scale with active travelling merchants, not total historical settlements/routes.

## 14. Observability

Existing NPC/transport debug surfaces should make it possible to identify:

- merchant NPC id,
- home settlement,
- active outbound order if any,
- destination settlement,
- current phase (`outbound` / `visiting` / `returning` or equivalent),
- visit expiry,
- generic return-travel state,
- whether NPC is currently materialized.

Do not add an unrelated merchant analytics subsystem.

## 15. Focused tests

### Starts from real opportunity

```text
valid 037 inter-settlement food demand
+ available home Trader
→ same Trader accepts outbound order
```

### No opportunity

```text
no cross-settlement uncovered demand
→ Trader remains local
```

### No duplicate identity

Destination materialization contains the travelling Trader identity, not a spawned copy; home settlement does not create a replacement.

### Delivery gates visit

Visit phase begins only after real `TransportOrder` completion.

### Cargo isolation

Committed `transportCargo` is not exposed to player merchant purchase flow.

### Visit expiry

Visit duration expires deterministically from world time and creates exactly one return commitment.

### Return continuity

Return survives stream-out, save/load and time skip using generic `NpcTravelContinuity`.

### Arrival idempotency

Home arrival is observed exactly once, journey clears, normal Trader work resumes.

### Death/blocking

Dead/blocked merchant does not magically complete the journey or respawn at home.

## 16. Explicit non-goals

- new `travelling_merchant` profession enum,
- multiple travelling merchants per settlement policy,
- caravans/formations/escort,
- dedicated Courier profession,
- pack animals/carts/wagons,
- dynamic commodity pricing,
- profit calculation,
- wages/tolls/taxes,
- persistent route graph,
- multi-stop itineraries,
- random road encounters,
- merchant faction/reputation system,
- converting `MERCHANT_STOCK` into a fully physical shop inventory,
- selling committed transport cargo to the player,
- settlement membership migration,
- spawning destination-local merchant proxies.

## 17. Extension path

After this plan the same architecture can grow without replacement:

```text
single Trader + one delivery + return
→ specialist travelling merchant staffing
→ Courier/carrier role using same travel/transport contracts
→ pack animal/cart capacity
→ merchant + guard escort
→ caravan group travel
→ price/profit-aware trade strategy
→ multi-stop regional routes
```

Courier should reuse the same generic travel and commitment mechanisms; it should not introduce another delivery engine.

## Implementation guidance

Before implementation create implementation notes against the then-current codebase. Verify especially:

- exact `planTraderWork()` and 037 creation seam,
- how transport completion exposes carrier destination/position,
- whether the carrier's authoritative position is sufficient to start destination visit/return after off-screen delivery,
- current `NpcTravelPurpose` persistence/clone/arrival call sites before extending its union,
- destination merchant interaction targeting for an NPC whose formal membership remains in another settlement,
- how schedule/work dispatch behaves for a home-settlement NPC physically visiting another settlement,
- existing `MERCHANT_STOCK` ownership so transport cargo cannot leak into player trade.

If current code shows that one small reusable generic visitor/travel-purpose seam is better than merchant-specific metadata, prefer that shared mechanism.

Add concise JSDoc to important new public/architectural helpers and use `@domain settlements-npcs` / `@domain npc` where appropriate.

## Verification

### Automated

- merchant lifecycle state tests,
- transport completion integration tests,
- generic travel purpose/arrival persistence tests,
- player-trade cargo isolation regression,
- save/load/time-skip tests,
- typecheck,
- lint,
- build.

### Manual browser verification

User-owned browser verification:

1. create a real inter-settlement food imbalance,
2. observe the home Trader accept the delivery and leave,
3. visit destination and confirm the same named NPC appears there,
4. confirm delivered cargo changed destination stock,
5. trade/talk with the visiting merchant without consuming committed cargo,
6. let the visit expire,
7. observe or later confirm return to the home settlement,
8. repeat after save/load and after leaving both settlements off-screen.

> **Zrób git commit i push do main, rebase jeżeli trzeba**