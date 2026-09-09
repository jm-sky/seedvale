# Implementation Notes: Work Contracts — Payment & Employer Interaction

**Reviewed:** 2026-09-09
**Plan:** `npc-016-work-contracts-payment-and-employer-interaction.md`

## Recon result

The previous notes are materially stale in two places:

1. `npc-028` is now implemented: Work Contracts are multi-worker and assignment-authoritative.
2. `settlements-npcs-026` is now implemented: every NPC has a persistent authoritative `personalInventory`, so wages must become real NPC-owned `coin` items instead of disappearing from the player inventory with only a contract-history marker.

The implementation should remain a focused extension of the existing systems below. No parallel payment registry, wallet or NPC wealth model is required.

## 1. Current Work Contract authority

### `src/world/workContract.ts`

Current authoritative shapes:

- `WorkContractState = available | advertised | active | settling | completed | cancelled | invalidated`
- `WorkContractAssignmentState = accepted | travelling | working | payment_due | released`
- `WorkContractRecord.assignments: WorkContractAssignment[]`
- assignment fields: `npcId`, `state`, `acceptedAt`, `workStartedAt`, `workCompleted`
- group fields: `rewardCoins`, `requestedWorkerCount`, `requestedWorkShare`, `remainingWorkAtCreation`, `committedWork`, `npcWorkCompleted`

Important helpers/mutations already exist and should be extended, not replaced:

- `findAssignment()`
- `isAssignmentWorkActive()`
- `activeWorkAssignmentCount()`
- `groupRemainingWork()`
- `contractRewardRate()`
- `acceptWorkContract()`
- `beginContractTravel()`
- `beginContractWork()`
- `recordNpcWorkContribution()`
- `completeContractWork()`
- `releaseWorkContract()`

`recordNpcWorkContribution()` is already the only mutation that increments both `assignment.workCompleted` and aggregate `npcWorkCompleted`. Payment must derive from those persisted counters; never infer wages from target progress.

`completeContractWork()` currently calls `settleWorkPhase()`, changes the contract to `settling`, and moves all work-active assignments to `payment_due`. This is the main normal-work handoff for npc-016.

`releaseWorkContract()` currently represents genuine abandonment/death and preserves contribution while freeing the slot. npc-016 must extend this seam so a living released worker with positive contribution gets a payable claim, while a dead worker can become the plan's terminal uncollectable outcome. Do not create a second release path outside Work Contracts.

### `src/world/createWorkContracts.ts`

This remains the sole runtime mutation authority over contract records.

Current API includes:

- `find()`
- `findActiveWorkByNpc()`
- `findByTarget()`
- `accept()`
- `beginTravel()`
- `beginWork()`
- `completeWork()`
- `creditNpcWork()`
- `release()`
- cancellation/invalidation/posting/discovery operations

`findActiveWorkByNpc()` intentionally returns only work-active assignments; its comment already says payment lookup belongs to npc-016. Add a dedicated claim lookup/query here if needed rather than overloading `findActiveWorkByNpc()` or restoring the removed single-worker `findByWorker()` semantics.

Add assignment-aware payment mutations here after implementing pure transitions in `workContract.ts`.

## 2. Reward semantics after npc-018/npc-028

The previous single-worker assumption is gone.

Current meaning is fixed:

```text
rewardCoins = group reward ceiling
committedWork = total NPC group commitment
npcWorkCompleted = accepted useful NPC work in aggregate
assignment.workCompleted = accepted useful work attributable to one NPC
```

`contractRewardRate(record)` already returns:

```text
rewardCoins / committedWork
```

Use it when freezing the assignment claim.

Do not:

- multiply reward by `requestedWorkerCount`,
- pay every worker the whole contract reward,
- recalculate reward because player/other workers also worked,
- require the target itself to be fully completed before a claim can exist.

A worker can be payable after the group's requested share is satisfied while the shared world target still has useful work remaining.

## 3. Claim shape and lifecycle

Extend `WorkContractAssignment` with payment-owned fields. Keep them on the assignment because npc-028 already established assignment-owned contribution/history.

Concrete fields should include the equivalent of:

```ts
rewardCoinsDue: number
lastPaymentRequestAt: number | null
paymentDeadline: number | null
```

Extend assignment lifecycle with terminal `paid`, `unpaid` and the plan's temporary dead-worker `uncollectable` outcome.

Do not add contract-level `workerNpcId`, `rewardCoinsDue`, payment deadline or payment request timestamp.

### Claim freezing

Freeze `rewardCoinsDue` once when contractual participation permanently ends after positive useful contribution.

Use a deterministic integer calculation from persisted values. Prefer a simple per-assignment proportional floor:

```text
floor(workCompleted * rewardCoins / committedWork)
```

with normal clamping for zero/invalid commitment.

That naturally guarantees each frozen claim is stable and avoids inventing a second remainder/escrow ledger. The plan explicitly accepts fractional remainder coins remaining unowed rather than adding another accounting system.

Once frozen, `rewardCoinsDue` must never be recomputed from later contract progress.

## 4. Contract lifecycle aggregation

Contract state is coarse job state, not one worker's payment state.

Important mixed state:

```text
contract = active
assignment A = payment_due
assignment B = working
assignment C = travelling
```

This is valid when A leaves after partial work and a replacement can still join/work.

When no further contractual work is required/possible, the contract becomes `settling` while positive claims remain unresolved.

Add one pure aggregate helper in `workContract.ts` if useful, e.g. checking whether all positive claims are terminal. Let `createWorkContracts.ts` use the same helper after payment/unpaid/uncollectable transitions rather than duplicating completion logic.

Only then move the contract to `completed`.

Cancellation/invalidation semantics should remain the existing terminal job outcomes; do not use them as substitutes for unpaid wages.

## 5. Persistent NPC money ownership after settlements-npcs-026

### `src/settlement/npcState.ts`

`NpcAuthoritativeState` now owns:

```ts
readonly personalInventory: Inventory
```

This is the authoritative belongings container, shared directly with `NpcAgent` and persisted through `NpcStateRegistry.serialize()`.

`NpcStateSnapshot.personalInventory` uses `InventoryContentsSnapshot` and restores through `inventoryFromContents()`.

`NpcAgent.carried` is explicitly documented as transient work/logistics payload. Do not credit wages there.

### `src/settlement/SettlementsManager.ts`

Current public manager API exposes:

- `getHousehold()`
- `getEconomy()`
- `snapshotNpcStates()`

but no live mutable `getNpcState()` wrapper.

Payment must mutate the authoritative live `personalInventory`, not a snapshot. Add a narrow manager method:

```ts
getNpcState(id: NpcId): NpcAuthoritativeState | undefined
```

implemented as a direct wrapper over the existing `NpcStateRegistry.get()`.

This mirrors `getHousehold()` / `getEconomy()` and avoids leaking the registry or depending on a transient loaded `NpcAgent` object.

Do **not** mutate `snapshotNpcStates()` output.

## 6. Coin transfer: existing generic transaction helper

### `src/items/inventoryTransfer.ts`

`transferInventoryCount(source, destination, kind, n, nowDays)` already implements the exact all-or-nothing generic transfer needed here:

- source count check,
- destination `canAdd()` capacity check before mutation,
- source removal,
- destination add,
- rollback on unexpected add failure.

Use:

```ts
transferInventoryCount(
  playerInventory,
  npcState.personalInventory,
  'coin',
  assignment.rewardCoinsDue,
  nowDays,
)
```

Do not hand-roll `player.remove()` + `npc.add()`.

This also resolves an important post-026 case the old notes missed: payment can fail because the worker's personal inventory cannot accept the coin load. On failure, neither inventory changes and the assignment remains payable.

### `src/items/Inventory.ts`

Relevant existing primitives:

- `count()` / `has()`
- `canAdd()`
- `add()`
- `remove()`
- generic snapshot helpers already used by NPC persistence

No wallet or special coin store is needed. `coin` is already a normal `ItemKind` used by player inventory/trade.

## 7. Exactly-once payment orchestration

Keep `world/workContract.ts` pure; it must not import inventories or settlement managers.

Add one narrow app/action function, preferably in or next to `src/app/actions/workContractActions.ts`, owning the whole synchronous employer payment operation.

Required order:

```text
1. re-resolve contract by id
2. re-resolve assignment by npcId
3. validate employer === 'player'
4. validate assignment is still payment_due
5. read authoritative rewardCoinsDue
6. resolve SettlementsManager.getNpcState(npcId)
7. transferInventoryCount(playerInventory, personalInventory, 'coin', due, nowDays)
8. only on transfer success: WorkContracts marks this assignment paid
9. aggregate contract settlement may move to completed
10. return typed result to dialogue/UI
```

The same function must handle stale/repeated callbacks safely.

Suggested typed outcomes are narrow, e.g. paid / stale-or-not-payable / insufficient-player-coins / worker-inventory-full / worker-state-missing. Exact naming can follow app action conventions.

Never let UI perform the debit/credit directly.

## 8. Employer scope

`WorkContractRecord.employer` is a `string` and current creation uses the player employer. That future-proof type is **not** an invitation to implement NPC employers here.

npc-016 should explicitly gate payment orchestration to:

```text
employer === 'player'
```

No employer wallet lookup, household employer, settlement treasury or NPC-issued contract support belongs in this slice.

## 9. NPC arbitration and payment opportunity

### `src/ai/NpcAgent.ts`

Current work lookup uses `workContracts.findActiveWorkByNpc(this.id)` and assignment-aware snapshots. Preserve that split.

Payment-due assignments are intentionally not work-active and therefore should not be forced back into `pursueAcceptedContract()`/construction execution.

Add a separate bounded opportunity in the normal decision/arbitration flow that:

- queries an outstanding payable assignment for `this.id`,
- checks local player eligibility,
- respects higher-priority needs/threats,
- creates only transient approach intent.

Do not add payment state to `NpcAuthoritativeState`; the contract assignment remains the obligation owner.

Do not persist path/approach/dialog state.

### Local player knowledge

`NpcAgent.update()` already receives the player position. Use it as local reaction data only, not an omniscient navigation target.

No streamed-out NPC should run a payment approach.

## 10. NPC → Player approach seam

There is still no generic NPC-initiated interaction framework.

Add only a small reusable seam for:

```text
approach nearby player for interaction intent
```

Reuse current NpcAgent navigation/go-to/watchdog logic and current interaction-distance conventions. Payment should provide stable context (`contractId`, `npcId`) rather than own movement code.

The approach should cancel on:

- critical need/preemption,
- threat/combat,
- death,
- path/watchdog failure,
- player leaving local eligibility.

Cancelling the approach must never cancel the claim.

## 11. Dialogue integration

### `src/ui-vue/store.ts`

Current shared surface:

- `openNpcDialogueMenu()`
- `configureNpcDialogueMenu()`

### `src/app/inventoryWiring.ts`

This currently wires `configureNpcDialogueMenu()` callbacks for NPC actions such as trade/food/water/etc.

Extend the same dialogue configuration/state for the payment context rather than creating a payment modal.

Store only stable context ids in transient UI state. When `Pay` is pressed, call the orchestration function above and re-resolve everything.

The visible due amount may be rendered from current authoritative claim data, but the callback must not trust a captured amount as payment authority.

## 12. Request throttle and patience

Store request timing on each payable assignment, not on NpcAgent/runtime UI.

Use `dayNight.elapsedDays` units already used by Work Contracts.

Recommended persisted fields:

```text
lastPaymentRequestAt: number | null
paymentDeadline: number | null
```

One world hour = `1 / 24` elapsed day unless an existing time helper already expresses it.

`PlayerSocialLookup` from `src/ai/reactionChance.ts` can influence the deadline once when the claim is created. Freeze the absolute deadline; do not re-evaluate relationship every frame.

Expiry is lazy/absolute:

```text
nowDays >= paymentDeadline && state === payment_due
→ unpaid
```

Time skip/reload should compare the absolute time; no replay of missed requests.

## 13. Death / uncollectable claim

Current `releaseWorkContract()` comment explicitly covers genuine abandonment/death, but it does not carry a release reason.

npc-016 needs a narrow distinction at that seam because:

- living release + positive work → payable claim,
- death + positive work → preserved but `uncollectable` claim for this slice,
- zero-work release/death → no positive wage.

Prefer extending the existing release mutation/runtime call with a small reason/outcome argument rather than adding parallel death-payment code elsewhere.

Do not transfer the dead worker's claim to household/corpse inventory in this plan.

## 14. Persistence

### Current schema

`src/persistence/saveData.ts` is currently:

```text
CURRENT_SAVE_VERSION = 18
```

Current `SaveWorkContractAssignment` mirrors only:

```text
npcId
state
acceptedAt
workStartedAt
workCompleted
```

Current saved assignment states end at `payment_due | released`; there are no claim/timing/terminal payment fields yet.

Implement npc-016 by bumping the save version normally and adding the next migration. Do not hardcode version 18 into new documentation/state comments; this note records the recon baseline only.

Extend `SaveWorkContractAssignment` with the new payment fields/outcomes.

Preserve all npc-018/npc-028 fields exactly:

- `requestedWorkerCount`
- `assignments[]`
- `requestedWorkShare`
- `remainingWorkAtCreation`
- `committedWork`
- `npcWorkCompleted`

### Existing NPC inventory persistence

Do not add wages to `SaveWorkContract` as an NPC balance.

The actual paid coins already round-trip through:

```text
NpcAuthoritativeState.personalInventory
→ NpcStateRegistry.serialize()
→ SettlementsManager.snapshotNpcStates()
→ SaveData.npcStates
```

`src/app/saveState.ts` already serializes both Work Contracts and `npcStates`; it should not gain a second worker-wallet section.

### Migration rule

Legacy assignment payment metadata needs deterministic defaults.

Do not synthesize coins into NPC inventories during migration. Old saves did not previously transfer wages to NPC ownership, so migration should only normalize contract claim metadata/state. Any actual coin transfer must occur through a post-migration explicit payment action.

## 15. Save/load and reconstruction invariants

High-value invariants after implementation:

```text
paid claim
→ cannot be paid again
→ worker personalInventory contains transferred coins
→ coins survive NpcAgent reconstruction
→ coins survive WorldBundle rebuild
→ coins survive save/load
```

and:

```text
payment_due claim
→ survives worker stream-out
→ survives save/load
→ approach state does not survive
→ request/deadline timing does survive
```

No payment lookup/index needs persistence; derive it from `WorkContractRecord.assignments`.

## 16. Debugging

Extend existing contract/NPC diagnostics.

Useful additions:

- assignment state + `rewardCoinsDue`,
- `lastPaymentRequestAt` / next eligibility,
- `paymentDeadline`,
- current approach intent/interruption reason,
- payment action result,
- worker `personalInventory.count('coin')` after success.

`src/ui/createNpcInspector.ts` already displays assignment-aware Work Contract data after npc-028 and is a natural inspection surface.

`src/debug/npcDebugApi.ts::npcState(id)` currently exposes serialized NPC state, which already includes `personalInventory`; this can verify persistent coin ownership without a new payment debugger.

## 17. Focused tests

Prefer extending the existing files:

- `src/world/workContract.test.ts`
  - claim freeze from `workCompleted`,
  - mixed assignment lifecycle,
  - release with partial contribution,
  - all-claims-terminal → contract complete,
  - unpaid/uncollectable guards,
  - claim sum bounded by reward.

- `src/world/createWorkContracts.test.ts`
  - assignment-aware payment transitions,
  - payment-due worker does not occupy a work slot,
  - replacement worker remains independent.

- app/action payment test near `workContractActions.ts`
  - player coin → NPC personal inventory success,
  - insufficient player coins is no-op,
  - destination full is no-op,
  - stale/repeated Pay is idempotent,
  - wrong employer rejected.

- `src/persistence/saveData.test.ts`
  - current-version migration to new assignment shape,
  - round-trip payment fields/states,
  - preserve all target kinds and npc-028 group accounting.

- NPC state/rebuild persistence tests
  - paid coins remain in `personalInventory` across registry serialize/restore; existing settlements-npcs-026 coverage can be extended rather than duplicated.

Manual browser verification belongs to the user.

## 18. Suggested implementation order

1. Extend `WorkContractAssignment` payment fields/states and add pure claim/terminal aggregation helpers in `workContract.ts`.
2. Make normal work completion + genuine release/death freeze the correct per-assignment claim.
3. Extend `WorkContracts` runtime with payment lookup/mutations and aggregate settlement completion.
4. Add `SettlementsManager.getNpcState()` as the narrow live authoritative belongings lookup.
5. Add one app/action payment transaction using `transferInventoryCount()`.
6. Extend save schema/migration/validation/round-trip.
7. Add payment opportunity selection to normal NPC arbitration.
8. Add the minimal reusable nearby-player approach intent.
9. Reuse the existing NPC dialogue surface for Pay/defer/failure feedback.
10. Add request throttling/patience expiry and diagnostics/tests.

## Recon conclusion

The correct current architecture is now:

```text
contract record
  owns job/group reward ceiling

assignment
  owns worker contribution + wage claim/history

player Inventory
  owns coins before payment

NpcAuthoritativeState.personalInventory
  owns coins after payment

inventoryTransfer.transferInventoryCount()
  owns the atomic item transfer
```

The main correction versus the 2026-09-06 notes is that **persistent NPC wealth no longer needs to be deferred**. `settlements-npcs-026` already provides the exact authoritative belongings owner and a generic transactional inventory-transfer helper. npc-016 should use those mechanisms directly and keep the Work Contract layer responsible only for claim/lifecycle semantics.

> **Zrób git commit i push do main, rebase jeżeli trzeba**