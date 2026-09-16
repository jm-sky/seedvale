# Plan: Travelling Merchant inter-settlement role

**Created:** 2026-09-15
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** L
**Depends on:** ~~settlements-npcs-037~~, ~~settlements-npcs-028~~, ~~settlements-npcs-033~~
**Domain:** `settlements-npcs`
**Subdomains:** `economy` `logistics` `schedules`
**Tags:** `merchant` `travel` `inter-settlement` `transport` `trade`
**Roadmap:** `physical-goods-transport`
**Model:** Opus, Sonnet

## Goal

Turn the existing settlement Trader into the first real **Travelling Merchant** without creating a second trade, logistics, cargo or travel subsystem.

The same persistent NPC should leave its home settlement because a real inter-settlement economic opportunity exists, carry concrete goods through the implemented `TransportOrder` flow, visit the destination settlement as the same `NpcId`, remain interactable there when materialized, and return home through generic NPC travel continuity.

Target lifecycle:

```text
home Trader
  ↓
037 inter-settlement opportunity
  ↓
TransportOrder + pickup into transportCargo
  ↓
NpcTravelContinuity purpose=transport(orderId)
  ↓
resolveTransportTravelArrivals()
  ↓
successful unload
  ↓
merchantJourney.visiting
  ↓
foreign visitor materialization
  ↓
visit expiry
  ↓
NpcTravelContinuity purpose=merchant-return
  ↓
home arrival
  ↓
merchantJourney cleared
  ↓
normal Trader work resumes
```

## Recon — implemented foundations

Current code already provides:

- existing Trader role/work in `src/ai/npcProfessionWork.ts`,
- generalized player↔NPC trade from `settlements-npcs-033`,
- world-owned `TransportOrder`,
- authoritative `NpcAuthoritativeState.transportCargo`,
- generic `NpcAuthoritativeState.travel` / `NpcTravelContinuity`,
- `NpcTravelPurpose` with `expedition` and `transport`,
- implemented `settlements-npcs-037` inter-settlement food matching and transport-purpose travel,
- `src/world/transportTravelArrival.ts::resolveTransportTravelArrivals()` as the bounded final delivery seam,
- persistent `NpcStateRegistry` owned by `SettlementsManager`,
- deterministic identity helpers in `src/settlement/npcIdentity.ts`: `settlementNpcId()`, `flattenedSettlementMembers()`, `settlementNpcDescriptors()`.

Verified gaps:

- `createSettlement()` only materializes authored members of that settlement; there is no generic foreign/travelling NPC visitor seam,
- home reconstruction does not suppress an authored NPC that is logically away,
- `NpcAuthoritativeState` has no merchant journey lifecycle field,
- `NpcTravelPurpose` has no merchant-return variant,
- `src/app/inventoryWiring.ts::isMerchantNpc()` still requires the Trader to be physically in the home settlement.

## Architectural decisions

### No new profession in V1

A Travelling Merchant is:

```text
role === 'trader'
+
active MerchantJourneyState
```

Do not add a parallel `travelling_merchant` profession/staffing/dialogue path.

### Ownership split

```text
TransportOrder
  = economic delivery commitment/lifecycle

NpcAuthoritativeState.transportCargo
  = concrete committed goods after pickup

NpcAuthoritativeState.travel
  = spatial continuity and arrival checkpoint

MerchantJourneyState
  = merchant-specific lifecycle phase and semantic context
```

No owner may duplicate another owner's clock, inventory or lifecycle.

### Reuse NPC identity infrastructure

Extend/reuse `src/settlement/npcIdentity.ts` and canonical deterministic `SettlementDef` data. Do not create a parallel travelling-NPC identity model or persist immutable character copies.

### One live identity

At most one live `NpcAgent` may exist for a travelling merchant's stable `NpcId`, regardless of which settlements are loaded.

## Core invariants

1. The merchant remains the same persistent `NpcId` throughout the journey.
2. Formal family, household and home-settlement membership do not move.
3. `transportCargo` is never merchant shop stock.
4. Journey/visit progress without player observation.
5. A merchant cannot simultaneously perform home work, outbound transport, destination Trader work and return travel.
6. No replacement Trader is created while the real Trader is away.
7. Destination choice remains owned by implemented 037 matching.
8. Spatial arrival alone is not delivery; visiting starts only after successful unload.
9. Visitor presentation is runtime-only; authoritative NPC state remains in the existing registry.
10. Home-bound physical offers do not teleport with the NPC.

## 1. Journey trigger and outbound leg

A journey begins only for an available home Trader when normal 037 matching produces a valid cross-settlement opportunity.

Eligibility includes at least: alive, logically at home, no incompatible accompany/expedition/travel commitment, no other active transport order and a valid 037 opportunity.

038 consumes the final 037 flow:

```text
matchInterSettlementFoodOpportunity()
→ TransportOrder
→ pickup
→ bindTransportTravel(orderId, destination)
→ NpcTravelPurpose { kind: 'transport', orderId }
→ resolveTransportTravelArrivals()
```

Do not restore `TransportOrder.execution` as a second A→B travel clock.

## 2. Merchant journey state

Add one sparse optional `MerchantJourneyState` on `NpcAuthoritativeState` with semantic fields only:

- home settlement id,
- destination settlement id,
- phase: `outbound | visiting | returning`,
- matching transport order id while outbound,
- absolute visit start/end world-day timestamps while visiting.

Absent = no active merchant journey.

Do not persist runtime `Settlement`/`NpcAgent` refs, route geometry, mesh position, inventory copies, economy scores or player observation state.

## 3. Successful delivery → visiting

The authoritative integration point is `resolveTransportTravelArrivals()`.

Add the narrowest reusable hook/callback needed so that only after a matching inter-settlement order successfully unloads the carrier can transition idempotently:

```text
outbound
→ visiting
→ visitStartedAtDays = now
→ visitEndsAtDays = now + configured duration
```

Do not poll historical completed orders globally. Failed unload, missing destination, blocked travel or dead carrier must not enter `visiting`.

## 4. Home materialization suppression

When authoritative state says an authored home NPC is away, rebuilding its home settlement must skip only that live `NpcAgent` presentation.

Do not alter family membership, household membership, population/history, profession identity or social identity.

This must exist before foreign visitor materialization to prevent duplicate agents when home and destination are loaded together.

## 5. Generic travelling-NPC visitor materialization

Add the smallest reusable visitor seam owned by `SettlementsManager` or a focused helper it owns.

It must:

- determine which persistent NPC is logically present at a loaded foreign settlement,
- materialize exactly one live `NpcAgent` for the existing `NpcId`,
- reuse the same `NpcStateRegistry` object,
- resolve immutable authored identity from canonical home settlement definition data,
- dispose only presentation on stream-out,
- never create a destination-local clone/proxy,
- never force-load home merely to recover identity,
- be reusable later for Couriers/other travelling NPCs.

A runtime map/set keyed by existing `NpcId` is acceptable for presentation ownership, but must not become a second persistent registry.

## 6. Home identity vs current-location context

Home/identity-owned:

- stable id/name/role/authored character data,
- family/household/social identity,
- authoritative NPC state,
- merchant journey.

Current-location-owned:

- terrain/height/collision/water context,
- destination visit anchor,
- interaction visibility,
- current settlement context where pricing/reputation is location-sensitive.

A visitor Trader in B is **not** employed by B and must not execute B's normal Trader profession work.

## 7. Visit behavior

Use one deterministic configured visit duration in world days.

During `visiting` the merchant:

- does not perform home Trader logistics,
- does not execute destination-local Trader work,
- may trade/dialogue when materialized,
- does not begin another destination→C delivery in V1,
- remains logically at B while B is unloaded,
- leaves when the absolute visit timestamp expires without player presence.

Use an existing safe public/trade-adjacent destination anchor; do not create a new merchant stall solely for this plan.

## 8. Return-home travel

On visit expiry transition exactly once:

```text
visiting
→ returning
→ generic NpcTravelContinuity to home target
→ purpose = merchant-return
```

Extend `NpcTravelPurpose` with the smallest semantic merchant-return context needed for idempotent arrival handling. Do not put visit timers in travel purpose and do not create a merchant-specific off-screen engine.

On genuine home arrival: observe arrival once, verify `returning`, clear merchant journey and allow normal Trader work to resume. Dead/blocked travel never counts as successful return.

## 9. Player-facing trade during visit

Reuse the generalized trade system.

Replace the home-location-only merchant specialization rule with a stable semantic predicate that recognizes the designated normal merchant at home or the active travelling merchant. Do not naively grant `MERCHANT_STOCK` to every `role === 'trader'` unless existing product behavior explicitly intends that.

Preserve ownership separation:

```text
transportCargo = committed delivery goods, never purchasable
merchant/catalog stock = existing portable merchant-facing stock path
personalInventory = NPC belongings/coins
```

Home-bound world-entity offers, especially the merchant horse, remain at home and must not be duplicated or teleported to the destination.

## 10. Persistence and failure

Persist merchant journey through the existing NPC-state snapshot/save path.

Restore invariants:

```text
outbound  → same matching order + cargo + transport travel + journey
visiting  → same absolute visitEndsAtDays
returning → same generic return travel + journey
```

Old saves without the field restore as no journey. Every transition must be phase-checked and idempotent.

Failure rules:

- outbound death/failure follows existing 037 semantics; no visit,
- failed unload does not enter visit,
- death while visiting does not start a successful return,
- blocked/dead return does not clear journey,
- destination unload/reload preserves identity/state,
- home loading while away never creates a home clone.

## 11. Simulation fidelity and performance

No world-global per-frame merchant manager.

Use existing bounded mechanisms: Trader work cadence, 037 delivery completion seam, world-day visit timestamps, generic NPC travel resolution and settlement streaming.

Cost should scale with active travelling NPCs, not historical settlements/routes.

## 12. Implementation stages

Keep this as one plan, implemented in three independently testable stages.

### Stage 1 — authoritative lifecycle and away suppression

Scope:

- `MerchantJourneyState` + persistence,
- merchant-return travel purpose,
- lifecycle guards/helpers,
- home authored-NPC suppression while away.

Definition of done:

- all phases round-trip through persistence,
- legacy saves default safely,
- home reconstruction never creates a live copy while merchant is away.

### Stage 2 — generic travelling NPC presentation

Scope:

- extend existing `npcIdentity.ts` as needed,
- generic foreign visitor materialization,
- exactly-one-live-agent enforcement,
- destination environmental/presentation context without destination profession ownership,
- stream-out/reification lifecycle.

Definition of done:

- same stable NPC from A can materialize in B,
- it remains formally owned by A,
- A+B loaded never create two agents,
- unload/reload preserves authoritative state,
- visitor cannot execute B's Trader work.

### Stage 3 — merchant integration

Scope:

- successful 037 delivery → `visiting`,
- visit expiry → `returning`,
- home arrival → journey clear,
- merchant specialization during visit,
- home-bound special-offer gating,
- observability and end-to-end regression tests.

Definition of done:

```text
real A surplus + B shortage
→ same Trader leaves A
→ carries real goods
→ unloads at B
→ can be visited/traded with in B
→ visit expires on- or off-screen
→ same Trader returns to A
→ normal Trader work resumes
```

Each stage should be committed and testable separately where practical; do not split 038 into parallel feature plans.

## 13. Focused verification

### Stage 1

- merchant journey snapshot round-trip for all phases,
- old snapshot restores no journey,
- absolute visit timestamp survives restore,
- home rebuild while away produces no home agent without changing family/household identity.

### Stage 2

- destination visitor uses original `NpcId`,
- A+B loaded never produce two live agents,
- destination unload/reload does not duplicate state,
- visitor reuses authoritative health/needs/inventories/travel,
- visitor does not execute destination profession work.

### Stage 3

- only successful matching 037 unload enters `visiting`,
- spatial arrival/failed unload does not,
- visit expiry creates one return,
- return arrival clears journey once,
- visiting merchant retains portable/catalog merchant interaction,
- `transportCargo` never appears in player buy rows,
- unrelated Traders are not accidentally upgraded,
- home horse/world-entity offers remain unavailable at destination,
- death/blocked/save-load cases never teleport or respawn the merchant.

## 14. Observability

Existing NPC/transport debug surfaces should expose enough to diagnose merchant `NpcId`, home/destination, journey phase, outbound order id, visit expiry, generic travel state and current live materialization context.

Do not add a separate merchant analytics subsystem.

## 15. Explicit non-goals

- new `travelling_merchant` profession,
- multiple travelling-merchant staffing policy,
- Courier profession,
- caravans/formations/escort,
- pack animals/carts/wagons,
- multi-stop/permanent routes,
- random road encounters,
- dynamic pricing/profit strategy,
- wages/tolls/taxes,
- merchant faction/reputation system,
- fully physical persistent `MERCHANT_STOCK`,
- selling transport cargo to the player,
- settlement membership migration,
- destination-local merchant proxy identities,
- teleporting the merchant's home horse.

## Implementation guidance

Read the implementation notes before coding. Treat final code as source of truth, especially:

- `src/ai/npcProfessionWork.ts`,
- `src/economy/interSettlementFoodTransport.ts`,
- `src/world/transportTravelArrival.ts`,
- `src/ai/npcTravel.ts`,
- `src/settlement/npcState.ts`,
- `src/settlement/npcIdentity.ts`,
- `src/settlement/createSettlement.ts`,
- `src/settlement/SettlementsManager.ts`,
- `src/app/inventoryWiring.ts`.

Prefer extending existing architectural/public seams and add JSDoc with `@domain settlements-npcs` for important new lifecycle/materialization functions.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
