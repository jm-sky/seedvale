# Plan: Persistent economic work cargo and local-transfer conservation

**Created:** 2026-09-19  
**Status:** `planned` 📋  
**Priority:** high · **Effort:** M  
**Depends on:** ~~settlements-npcs-019~~, ~~settlements-npcs-034~~  
**Domain:** `settlements-npcs`  
**Type:** `fix`  
**Roadmap:** -  

## Problem

Several NPC economy flows mutate an authoritative source at pickup, but the value then exists only in `NpcPlannedAction` closure state or `NpcAgent.carried` until a later deposit.

Confirmed examples on current `main`:

- `planEconomyWithdraw('wood')`: `SettlementEconomy` is decremented by `claimEconomySurplus()`, while the claim is only a closure number.
- `planHouseholdExchange('wood')`: source household wood items are removed into a closure `claimedBatch`.
- food exchange moves claimed food into `NpcAgent.carried`, which is not part of `NpcAuthoritativeState` / `SaveData`.
- profession work uses the same transient carried inventory for real outputs before their later deposit.

A save/reload, NPC reconstruction or WorldBundle rebuild after source mutation can therefore preserve the reduced source while dropping the in-transit value.

## Goal

Every irreversible economic pickup must end synchronously in one of two states:

```text
source still owns goods
OR
an authoritative NPC-owned cargo inventory owns goods
```

No source mutation may leave the only recoverable value in an action closure.

Do not merge personal belongings, `TransportOrder` cargo and work/local-economic cargo into one inventory.

## Architecture decision

Extend the existing `NpcAuthoritativeState` owner with one explicit inventory for **non-TransportOrder economic work/local-transfer payloads**, e.g. `workCargo`.

Target ownership:

```text
personalInventory = belongings
transportCargo    = goods bound to TransportOrder
workCargo         = irreversible profession/local-economy payload awaiting deposit
NpcPlannedAction  = execution only, never authoritative item ownership
```

The live `NpcAgent` may keep a compatibility alias named `carried` during migration, but economic cargo must reference the state-owned Inventory object rather than construct a private replacement.

Do not add a global cargo manager or another settlement registry.

## Scope

### 1. Inventory every source-mutating `NpcAgent.carried` writer

Inspect current call sites in:

- `src/ai/NpcAgent.ts`
- `src/ai/npcLogistics.ts`
- `src/ai/npcProfessionWork.ts`
- related hunting/fishing/gathering helpers.

Classify only flows where world/household/economy state is irreversibly changed before a later deposit. Migrate those payloads to `workCargo`.

Do not move personal equipment/belongings into `workCargo` and do not touch `transportCargo` ownership.

### 2. Remove closure-only wood ownership

`planEconomyWithdraw(..., 'wood')`:

1. compute requested amount;
2. preflight `workCargo` room for the concrete branch representation;
3. claim live economy surplus;
4. materialize exactly the claimed amount into `workCargo` in the same synchronous pickup commit;
5. if the cargo write unexpectedly fails after source mutation, immediately roll the source mutation back;
6. deposit later from `workCargo`, not from a closure quantity.

`planHouseholdExchange(..., 'wood')`:

1. select the concrete `branch`/`beam` batch using existing household rules;
2. preflight cargo room for the entire batch;
3. move exact items source→`workCargo` transactionally;
4. later deposit from `workCargo` into destination household through existing `depositWood` semantics.

The `NpcPlannedAction` closure may contain routing/action data, never the only copy of claimed goods.

### 3. Make food/local item transfer reconstructable

Existing food pickup already uses a real Inventory. Point it at authoritative `workCargo`.

Remove any deposit dependency on closure-only claim metadata that cannot be reconstructed. Freshness/provenance needed for delivery must come from persisted `Inventory` food batches, using existing `removeWithFreshness` / `addWithFreshness` / food-claim helpers.

### 4. Resume owned cargo before acquiring more

At NPC work/logistics planning time, if `workCargo` contains a payload whose normal destination is derivable from the NPC's current household/economy/assignment, plan the deposit leg before a new source claim.

For flows whose destination is not derivable from existing persisted state, do not silently persist anonymous cargo. Either:

- reuse an existing persisted commitment that identifies the destination, or
- keep that flow outside `workCargo` until it has an explicit recoverable destination contract.

Do not invent a generic task/order system in this plan.

### 5. Persistence and rebuild

Add `workCargo` to `NpcStateSnapshot` using `InventoryContentsSnapshot`, following `personalInventory` and `transportCargo`.

- old snapshots with no field restore an empty work cargo;
- in-session `NpcStateRegistry` snapshot/restore carries it;
- SaveData round-trip carries it through existing `npcStates`;
- do not duplicate it at top-level SaveData;
- do not reconstruct amount from pending action state.

Use the project's current additive optional-field/versioning convention after checking the current save schema at implementation time.

### 6. Death / cancellation disposition

Cancellation/interruption must not destroy `workCargo`.

For NPC death, define one explicit disposition for economic work cargo using existing item handoff primitives. Prefer moving it into the same physical post-death/drop path that already handles real NPC-owned items, while keeping `personalInventory` and `workCargo` logically distinct before death.

No silent delete and no minting back at the original source after ownership has moved.

## Files likely affected

- `src/settlement/npcState.ts`
- `src/ai/NpcAgent.ts`
- `src/ai/npcLogistics.ts`
- `src/ai/npcProfessionWork.ts`
- `src/items/Inventory.ts` only if a small reusable transactional batch helper is missing
- `src/persistence/saveData.ts` only as required by the current optional snapshot schema/version policy
- focused tests beside those modules
- relevant state/architecture docs after implementation.

## Guardrails

- no second inventory implementation;
- no generic logistics manager;
- no parallel transport-order system;
- `transportCargo` remains the only cargo owner for `TransportOrder`;
- `personalInventory` remains belongings;
- all source→cargo writes preflight capacity before source mutation;
- rollback only guards impossible/unexpected post-preflight failures; normal retries must not duplicate goods;
- save/load and WorldBundle rebuild must preserve the same owner/object semantics;
- no feature expansion into new professions, commodities or routes.

## Automated verification

Add focused tests for:

1. settlement wood pickup → interrupt before deposit → goods remain owned by NPC work cargo;
2. household wood pickup → interrupt → exact branch/beam batch remains owned;
3. food pickup → NpcAgent dispose/recreate → freshness/counts survive and deposit once;
4. save/load after pickup before deposit → source remains reduced and cargo remains present; deposit completes once;
5. WorldBundle/NpcState snapshot round-trip gives the same result;
6. retry after reconstruction does not repeat pickup while cargo is already owned;
7. work output that mutates a persistent source (at least one item-producing profession path) survives reconstruction before deposit;
8. destination capacity/source revalidation failure leaves source unchanged;
9. death/cancellation follows the explicit cargo disposition with conservation;
10. `personalInventory` and `transportCargo` regressions stay unchanged.

## Manual verification

User-owned browser verification only:

- observe a local resource delivery;
- save/load after pickup but before deposit;
- confirm destination receives the same amount once and source is not restored or charged twice.

AI agent does not run browser verification.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
