# Plan: Travelling Merchant inter-settlement role

**Created:** 2026-09-15
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** L
**Depends on:** settlements-npcs-037, ~~settlements-npcs-028~~, ~~settlements-npcs-033~~
**Domain:** `settlements-npcs`
**Subdomains:** `economy` `logistics` `schedules`
**Tags:** `merchant` `travel` `inter-settlement` `transport` `trade`
**Roadmap:** `physical-goods-transport`
**Model:** Opus, Sonnet

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
- inter-settlement economic/transport matching and transport-purpose travel from `settlements-npcs-037`,
- persistent `NpcAuthoritativeState` including personal inventory and generic travel,
- `src/ai/npcTravel.ts` from plan 028:
  - `NpcTravelContinuity`,
  - detailed ↔ off-screen handoff,
  - deterministic ETA/interpolation,
  - survival checkpoints,
  - caller-owned `purpose`,
  - idempotent arrival observation,
- persistent settlement membership/home identity remains unchanged while NPC travels.

Important current gaps verified during review:

- `createSettlement()` materializes only the settlement's own generated family members; there is no generic foreign-NPC visitor materialization seam yet,
- `inventoryWiring.ts::isMerchantNpc()` currently grants full merchant specialization only to a Trader physically found in the home settlement.

`NpcTravelPurpose` is already semantic caller context for generic travel and should be extended rather than replaced with a merchant-specific travel engine.

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
9. At most one live `NpcAgent` exists for the travelling merchant's stable `NpcId`.

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

Reuse the final 037 contract exactly:

```text
TransportOrder
  owns economic commitment + cargo lifecycle

NpcAuthoritativeState.transportCargo
  owns committed goods after pickup

NpcAuthoritativeState.travel
  purpose = transport(orderId)
  owns A→B spatial continuity
```

During this leg:

- `TransportOrder` remains the authority for source/destination/item/quantities/carrier/lifecycle,
- generic `NpcTravelContinuity` is the authority for cross-settlement detailed↔off-screen position/timing,
- local Trader work is suspended by the active journey/order guards,
- do not also run an independent merchant travel clock,
- do not reintroduce `TransportOrder.execution` as a second A→B clock if 037 has moved cross-settlement spatial continuity onto generic travel.

Implementation must consume the actual public seams produced by 037 rather than recreate them.

## 3. Destination arrival and merchant visit

After successful cross-settlement delivery, the Trader becomes a visiting merchant at the destination for a bounded deterministic period.

This is NPC-owned lifecycle state, not transport state.

Use a compact sparse merchant-journey record on `NpcAuthoritativeState` (exact type/name in implementation notes), containing only stable semantic fields such as:

- home settlement id,
- destination settlement id,
- phase (`outbound` / `visiting` / `returning`),
- matching transport order id while outbound,
- visit start/end world time while visiting.

Do not persist derived economy scores or copied settlement inventories.

Do not store runtime `Settlement`, `NpcAgent`, scene object or inventory references.

## 4. Physical presence at destination

When destination is relevant/loaded, the visiting merchant should materialize as the same NPC at a safe position near the destination settlement's existing merchant/trade/public area.

Current code cannot do this automatically: `createSettlement()` only builds that settlement's own authored family members.

Add the smallest reusable **travelling-NPC visitor materialization seam**, owned by `SettlementsManager` or a focused helper it owns, so the same stable NPC identity may be presented in another loaded settlement without becoming a member of it.

Requirements:

- reuse the same `NpcStateRegistry` object,
- resolve immutable character/family identity from canonical deterministic home settlement data,
- never create a destination-local clone/proxy,
- never materialize the same `NpcId` both at home and destination,
- dispose only presentation on stream-out; keep authoritative state,
- reuse this seam later for Courier/other travelling NPCs where practical.

The merchant remains a member of its home settlement while visiting.

Do not:

- create a second NPC identity,
- change family/household membership,
- permanently restaff destination professions,
- force-load the source settlement merely to rebuild immutable identity.

If destination is unloaded, the visit may remain coarse/off-screen until reification or until the visit window expires.

## 5. Player-facing trade during visit

Reuse the existing player↔NPC trade system from `settlements-npcs-033`.

The travelling merchant should expose the same portable/catalog merchant interaction it already has when materialized at destination.

Current `inventoryWiring.ts::isMerchantNpc()` is home-location-gated and therefore must be replaced with a stable merchant-specialization predicate. Do **not** broaden it naively to every `role === 'trader'` unless that is explicitly intended by existing design.

Critical ownership separation:

```text
transportCargo = committed settlement delivery
merchant/player trade stock = existing merchant-facing trade path
personalInventory = NPC-owned belongings/coins
```

Do not make committed `transportCargo` purchasable by the player.

Do not copy destination settlement stock into a merchant inventory merely to make a shop UI work.

If current `MERCHANT_STOCK` remains catalog-driven rather than a fully physical persistent shop inventory, preserve that behavior.

Home-bound physical/special offers, especially the merchant horse, must not be duplicated or teleported to the destination merely because the merchant NPC is visiting there.

## 6. Visit duration and work behavior

Use one deterministic configured visit duration expressed in world days.

During the visit the merchant:

- does not perform home-settlement local Trader collection,
- does not execute destination settlement's normal Trader profession work,
- may be available for player trade/dialogue when live,
- does not automatically start another outbound delivery from the destination in V1,
- waits for visit expiry unless interrupted by existing critical NPC state.

Do not implement a multi-stop route scheduler yet.

The visit duration must advance without player presence and must not restart after save/load.

## 7. Return-home travel

After the visit expires, return travel uses generic `NpcTravelContinuity` from plan 028.

Extend `NpcTravelPurpose` with the smallest semantic merchant-return context required for idempotent arrival handling. Do not create a merchant-specific off-screen travel engine.

Conceptually:

```text
visit expires
→ journey phase = returning
→ generic travel destination = home settlement target
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

Current authored-NPC materialization must therefore gain an "away" predicate: rebuilding home settlement A while the Trader is outbound/visiting/returning must **not** instantiate a home copy.

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

Visit state remains persistent/coherent; same NPC reifies through the visitor materialization seam when needed.

### Home settlement loads while merchant is away

Do not instantiate a home clone. Formal family/population membership remains, but presentation is suppressed while authoritative journey state says the NPC is away.

### Save/load

Restore the same phase without:

- restarting visit timer,
- repeating delivery,
- creating duplicate return travel,
- duplicating NPC,
- resetting home membership.

## 12. Persistence

Reuse existing persistent owners:

- `TransportOrder` for outbound delivery commitment,
- `NpcAuthoritativeState.transportCargo` for committed goods,
- `NpcAuthoritativeState.travel` for spatial continuity,
- one small `NpcAuthoritativeState` merchant-journey field for lifecycle phase/timestamps.

Do not create a global `TravellingMerchants` registry.

Any new merchant journey metadata must be plain-data, sparse and save-compatible with absent = no active journey.

## 13. Simulation fidelity and performance

No per-frame world merchant manager.

Use:

- existing Trader work cadence to accept a journey,
- 037 transport completion seam for outbound→visit transition,
- timestamp-based visit expiry,
- generic NPC travel checkpoints for return,
- normal settlement/NPC streaming plus the narrow visitor materialization seam.

Cost should scale with active travelling merchants, not total historical settlements/routes.

## 14. Observability

Existing NPC/transport debug surfaces should make it possible to identify:

- merchant NPC id,
- home settlement,
- active outbound order if any,
- destination settlement,
- current phase (`outbound` / `visiting` / `returning`),
- visit expiry,
- generic return-travel state,
- whether NPC is currently materialized and in which settlement context.

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

- home settlement loads while Trader is away → no home clone,
- destination materialization contains the original stable `NpcId`,
- stream-out/reload never creates two live agents.

### Delivery gates visit

Visit phase begins only after real `TransportOrder` completion, not merely spatial arrival.

### Cargo isolation

Committed `transportCargo` is not exposed to player merchant purchase flow.

### Merchant specialization

Visiting merchant retains normal portable/catalog merchant UI; ordinary unrelated Trader behavior is not broadened accidentally; home-bound world-entity offers are not duplicated.

### Visit expiry

Visit duration expires deterministically from world time and creates exactly one return commitment, including while destination is off-screen.

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
- spawning destination-local merchant proxies,
- teleporting the merchant's home horse with the NPC.

## 17. Extension path

After this plan the same architecture can grow without replacement:

```text
single Trader + one delivery + visit + return
→ specialist travelling merchant staffing
→ Courier/carrier role using same visitor/travel/transport contracts
→ pack animal/cart capacity
→ merchant + guard escort
→ caravan group travel
→ price/profit-aware trade strategy
→ multi-stop regional routes
```

Courier should reuse the same generic visitor, travel and commitment mechanisms; it should not introduce another delivery engine.

## Implementation guidance

Read the implementation notes before coding. Re-read the actual final implementation of 037 because this plan consumes its transport-arrival and transport-purpose travel contracts.

Verify especially:

- final 037 creation/delivery/arrival seam,
- exact `NpcAuthoritativeState` snapshot/save validation path,
- authored local NPC creation in `createSettlement.ts` so away-NPC suppression does not alter family/population state,
- generic foreign visitor materialization ownership in `SettlementsManager`,
- immutable NPC identity reconstruction from canonical settlement definition data,
- `NpcTravelPurpose` clone/persistence/arrival call sites,
- `inventoryWiring.ts::isMerchantNpc()` and home-only special offers,
- schedule/work dispatch so a visitor never executes destination-local Trader work.

Prefer a reusable visitor/materialization mechanism over merchant-specific clone logic.

Add concise JSDoc to important new public/architectural helpers and use `@domain settlements-npcs` / `@domain npc` where appropriate.

## Verification

### Automated

- merchant lifecycle state tests,
- single-live-identity/materialization tests,
- transport completion integration tests,
- generic travel purpose/arrival persistence tests,
- player-trade cargo isolation/specialization regressions,
- save/load/time-skip tests,
- typecheck,
- lint,
- build.

### Manual browser verification

User-owned browser verification:

1. create a real inter-settlement food imbalance,
2. observe the home Trader accept the delivery and leave,
3. revisit the home settlement while the Trader is away and confirm no duplicate NPC appears,
4. visit destination and confirm the same named/stable NPC appears there,
5. confirm delivered cargo changed destination stock,
6. trade/talk with the visiting merchant without consuming committed cargo or duplicating home-only horse offers,
7. let the visit expire,
8. observe or later confirm return to the home settlement,
9. repeat after save/load and after leaving both settlements off-screen.

> **Zrób git commit i push do main, rebase jeżeli trzeba**