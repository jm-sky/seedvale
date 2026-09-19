# Plan: Active TransportOrder registry lifecycle

**Created:** 2026-09-19  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** S  
**Depends on:** ~~settlements-npcs-018~~, ~~settlements-npcs-019~~, ~~settlements-npcs-020~~  
**Domain:** `settlements-npcs`  
**Type:** feature
**Roadmap:** -  
**Model:** Composer, Grok  

## Problem

`createTransportOrders.ts` currently stores active and terminal `TransportOrder` records in one ever-growing array.

Terminal transitions (`completed` / `failed` / `cancelled`) replace the record but never remove it. As a result:

- `list()` returns historical terminal records together with active commitments;
- `find()` / `indexOf()` / `findByCarrier()` are linear in session history;
- food/ore demand helpers repeatedly scan that history and filter terminal records;
- inter-settlement matching can rescan it for multiple destinations/kinds;
- `rebuildWorldBundle()` carries the entire list, including dead history.

Full save/load prunes terminal records because `saveState.ts` writes only active orders, so the cost is specifically unbounded long-session runtime state.

Implemented plan 020 explicitly assumes scans are acceptable while **active** order count is small. The registry should uphold that contract.

## Goal

Make `TransportOrders` an active-commitment registry whose memory and query cost scale with current active transport, not all transport ever completed in the session.

Terminal records may be returned from the transition that creates them, but must not remain in the authoritative active store.

## Architecture decision

Use bounded active indexes inside `createTransportOrders.ts`:

- `Map<orderId, TransportOrder>` for active order lookup;
- `Map<carrierNpcId, orderId>` for the one-active-order-per-carrier invariant.

`list()` should enumerate active records only.

Do not add a logistics tick, global matcher, database or persisted history.

If existing debug tooling genuinely requires recent terminal transitions, use an explicitly bounded diagnostics buffer separate from the authoritative registry. Do not keep an unbounded terminal list for observability.

## Scope

### 1. Active-only lifecycle

On:

- `completeDelivery`,
- `fail`,
- `cancel`,

validate the transition against the active record, construct/return the terminal result, then remove that order from active indexes atomically.

Pre-pickup cancellation clears the carrier index. Successful delivery clears it only after the terminal transition is accepted.

`pending` / `assigned` / `in-transit` remain in the registry.

### 2. O(1) identity/carrier lookup

Replace array `findIndex` / full `findByCarrier` scans with the two maps.

Maintain the existing invariant: one active order per carrier.

Assignment, pickup, delivery, failure and cancellation must update both indexes consistently. A rejected transition changes neither.

### 3. Active list contract

`list()` returns only active orders.

Update callers that defensively filter terminal states if simplification improves clarity, but retaining harmless state guards is acceptable. Do not create per-caller caches.

Key consumers to verify:

- `src/economy/foodTransportDemand.ts`
- `src/economy/oreTransportDemand.ts`
- `src/economy/interSettlementFoodTransport.ts`
- `src/ai/npcProfessionWork.ts`
- `src/world/transportOffscreen.ts`
- `src/world/transportTravelArrival.ts`.

### 4. Rebuild/save

`rebuildWorldBundle()` must carry only active orders by construction.

`saveState.ts` may keep its active filter defensively, but persistence semantics must remain unchanged: only active commitments are written.

Restored initial orders must be validated/indexed as active. Do not retain terminal rows from malformed/legacy input as active state.

### 5. No extra matching work

Keep derived shortage/surplus accounting. Once `list()` is active-only, small scans over active commitments remain acceptable as established by 020.

Do not add memoization invalidation complexity unless profiling after this fix shows a separate hotspot.

## Files likely affected

- `src/world/createTransportOrders.ts`
- `src/world/transportOrder.ts` only if a tiny active/terminal helper contract needs adjustment
- `src/app/worldBundle.ts`
- `src/app/saveState.ts` only if cleanup becomes possible
- `src/economy/foodTransportDemand.ts`
- `src/economy/oreTransportDemand.ts`
- `src/economy/interSettlementFoodTransport.ts`
- relevant transport tests/debug tooling.

## Guardrails

- `TransportOrder` remains commitment metadata, never cargo ownership;
- no change to `NpcAuthoritativeState.transportCargo`;
- no change to pickup/unload transaction semantics;
- no terminal transition may leave a carrier index behind;
- missing terminal history must not cause cargo replay;
- no per-frame transport processing;
- no unbounded diagnostics history.

## Automated verification

Add tests for:

1. completing an order returns the terminal record but removes it from `list/find/findByCarrier`;
2. failed/cancelled pre-pickup orders are removed and carrier can receive a new order;
3. rejected transition leaves both indexes unchanged;
4. 1,000 sequential completed orders leave active registry size at zero rather than 1,000;
5. active incoming/outgoing demand calculations stay identical;
6. restore with active orders rebuilds both indexes;
7. WorldBundle rebuild carries only active orders;
8. save/load semantics remain active-only;
9. off-screen and travel-arrival completion still deliver exactly once;
10. duplicate carrier assignment remains rejected.

## Manual verification

User-owned browser verification only:

- run normal Trader pickup/delivery and inter-settlement transport;
- confirm completed delivery disappears from active debug output and a later delivery can reuse the same carrier.

AI agent does not run browser verification.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
