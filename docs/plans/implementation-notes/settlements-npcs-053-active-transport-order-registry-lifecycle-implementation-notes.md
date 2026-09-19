# Implementation notes: settlements-npcs-053 active TransportOrder registry lifecycle

**Plan:** `docs/plans/settlements-npcs-053-active-transport-order-registry-lifecycle.md`  
**Recon baseline:** current `main` on 2026-09-19

## Current ownership and invariants

- `src/world/createTransportOrders.ts` is the single runtime owner of active `TransportOrder` commitments.
- `TransportOrder` lifecycle transitions remain pure helpers in `src/world/transportOrder.ts`; do not move cargo or inventory semantics into the registry.
- Cargo ownership stays in `NpcAuthoritativeState.transportCargo` and inventory mutation stays in `src/world/transportTransactions.ts`.
- Detailed and off-screen delivery already converge on `executeTransportUnload()`; preserve that exact-once transaction seam.
- `WorldBundle` rebuild and save/load already reconstruct transport through `createTransportOrders(initial)`. There is no separate restore API to extend.

## Current implementation gap

`createTransportOrders()` currently stores every order in one `TransportOrder[]`.

Important consequences confirmed in current code:

- `find()` and internal `indexOf()` linearly scan the full session history.
- `findByCarrier()` linearly scans the same array and additionally checks `isTransportOrderActive()`.
- terminal transitions replace the record in-place, so completed/failed/cancelled history remains forever.
- demand helpers receive `orders.list()` and defensively filter inactive orders.
- a full save prunes inactive orders, but an in-session `WorldBundle` rebuild carries whatever `list()` returns, so terminal history survives rebuilds.

This is a registry-lifecycle problem only; do not alter transport transaction semantics.

## Implementation shape

Use exactly two active indexes inside `createTransportOrders()`:

- `Map<string, TransportOrder>` keyed by order id;
- `Map<string, string>` keyed by carrier NPC id → active order id.

The active-order map is the authoritative runtime collection. The carrier map is a derived index over the same active records.

### Initialization

When seeding from `initial`:

1. keep only records for which `isTransportOrderActive(order.state)` is true;
2. insert them into the id map;
3. populate the carrier map for active records with `carrierNpcId`;
4. reject or deterministically ignore malformed duplicate ids / duplicate active carrier assignments rather than allowing the indexes to disagree.

Do not retain terminal legacy rows in the active store.

### Mutation helper

Replace the current array-oriented `replace()` with one small registry mutation helper that:

- validates the old active record exists;
- receives a transition result;
- if transition returns `null`, mutates nothing;
- if result remains active, updates the id map and keeps carrier index consistent;
- if result becomes terminal, removes the order from both active indexes and returns the terminal record to the caller.

This keeps rejected transitions atomic.

For `assign()`, update the carrier index only after `assignTransportOrder()` succeeds.

For `completePickup()`, carrier does not change; only replace active record.

For `completeDelivery()`, `fail()`, and `cancel()`, successful terminal transition must remove both indexes.

`beginOffscreenExecution()` and `clearExecution()` remain active-state replacements and must not touch carrier ownership unless the transition helper actually changes it.

### ID generation

`nextId()` currently calls `indexOf()` to avoid collisions with restored records.

After switching to a map, collision check becomes `activeById.has(id)`. Since terminal history is intentionally discarded, generated ids only need to avoid collision with currently active restored/runtime orders.

Do not add persisted counters or a terminal-id history store.

### Public API contracts

- `list()` returns active orders only.
- `find(id)` becomes direct map lookup.
- `findByCarrier(npcId)` becomes carrier-map lookup followed by id-map lookup.
- `dispose()` clears both maps.

Returning `Array.from(activeById.values())` from `list()` is acceptable because existing callers expect a readonly array-like snapshot and active order counts are intentionally small. Do not add cache invalidation complexity for `list()` unless profiling later shows it matters.

## Caller impact

### Demand/accounting callers

These can remain unchanged initially:

- `src/economy/foodTransportDemand.ts`
- `src/economy/oreTransportDemand.ts`
- `src/economy/interSettlementFoodTransport.ts`

Their active-state filters become redundant but are harmless. Prefer the smallest change; remove defensive filters only if it clearly simplifies code/tests.

### Delivery/off-screen callers

Preserve current behavior in:

- `src/world/transportOffscreen.ts`
- `src/world/transportTravelArrival.ts`
- `src/world/transportTransactions.ts`

Important subtlety: after a successful `completeDelivery()`, a later `orders.find(orderId)` should return `undefined`. Current arrival cleanup already treats missing/terminal orders as stale completion and clears transport-purpose travel, so this is compatible.

### Save / WorldBundle rebuild

Current save code already writes active orders only. After this refactor, that filter becomes defensive rather than necessary.

Current rebuild path should pass `orders.list()`; because `list()` is active-only, no extra rebuild-specific pruning should be introduced.

## Tests worth adding/updating

Prioritize focused registry tests around `createTransportOrders()`:

- complete/fail/cancel returns the terminal result but `find/list/findByCarrier` no longer expose it;
- rejected terminal transition keeps both indexes unchanged;
- duplicate carrier assignment is rejected without corrupting either map;
- carrier becomes reusable immediately after terminal transition;
- 1,000 sequential create→terminal cycles leave active registry empty;
- initial terminal rows are ignored;
- initial duplicate carrier assignments do not create inconsistent lookup state;
- off-screen and travel-arrival tests still prove exactly-once unload semantics after terminal record removal.

Do not write tests against map internals; test public registry behavior.

## Pitfalls

- Do not remove cargo before the registry terminal transition; `executeTransportUnload()` already owns rollback if `completeDelivery()` fails.
- Do not make `TransportOrder` a cargo/history store.
- Do not retain terminal rows solely for debugging.
- Do not add a periodic cleanup tick; terminal removal should happen at the transition itself.
- Do not add per-caller caches over `list()`.
- Keep one-active-order-per-carrier invariant enforced by the registry, not by callers.

## Suggested implementation order

1. Add active maps + initialization validation in `createTransportOrders.ts`.
2. Replace lookup/index helpers.
3. Centralize active→active vs active→terminal transition handling.
4. Update `create/assign/dispose`.
5. Run focused transport registry/transaction/off-screen tests.
6. Only then simplify redundant caller filters if useful; otherwise leave them defensive.
