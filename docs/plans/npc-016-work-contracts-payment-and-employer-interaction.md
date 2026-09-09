# Plan: Work Contracts — Payment & Employer Interaction

**Created:** 2026-09-01
**Status:** `verification needed` 🔍
**Implemented at:** 2026-09-09 16:30
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~npc-015~~, ~~npc-018~~, ~~npc-028~~, ~~settlements-npcs-026~~
**Domain:** `npc`  
**Subdomains:** `work` `behavior` `dialogue`  
**Roadmap:** `workforce-for-hire.md`  

## Goal

Complete the first **Workforce for Hire** vertical slice by turning finished NPC Work Contract participation into a real employer-payment interaction.

Current Work Contracts are multi-worker. `WorkContractRecord` owns the job/group commitment/reward ceiling, while each `WorkContractAssignment` owns one worker's execution and attributable `workCompleted`. Payment must therefore be resolved per assignment, never through a restored contract-level `workerNpcId` or one shared wage state.

The player remains the only supported employer in this slice. Payment is physical and explicit:

```text
assignment stops contributing
→ freeze that assignment's earned coin claim
→ NPC continues normal life
→ locally encounters employer/player
→ approaches for payment through normal NPC arbitration/navigation
→ shared NPC dialogue surface
→ explicit Pay action
→ atomic coin transfer: player Inventory → NPC personalInventory
→ assignment claim terminal
→ contract settlement completes when every owed claim is terminal
```

Do not add a second wallet/economy, payment scheduler, payment AI manager, or payment-only interaction framework.

## 1. Current ownership to preserve

Implement on top of the current `npc-028` split in `src/world/workContract.ts`:

```text
WorkContractRecord
  owns: employer, target, requestedWorkerCount,
        rewardCoins, committedWork, npcWorkCompleted,
        coarse job lifecycle

WorkContractAssignment
  owns: npcId, worker lifecycle, acceptedAt,
        workStartedAt, workCompleted,
        later payment claim/outcome
```

`src/world/createWorkContracts.ts` remains the sole runtime mutation authority over contract records.

`NpcAgent` must resolve contract/assignment state from Work Contracts authority. Do not copy contract ids, claim amounts or payment state into `NpcAuthoritativeState`.

## 2. Persistent worker money ownership now exists

`settlements-npcs-026` changed the payment boundary materially.

Every NPC now owns an authoritative `NpcAuthoritativeState.personalInventory: Inventory` in `src/settlement/npcState.ts`. It survives:

- `NpcAgent` reconstruction,
- settlement stream-out/in,
- `WorldBundle` rebuild,
- save/load through `SaveData.npcStates`.

Therefore a successful wage payment must transfer real `coin` items into the worker's **personal inventory**.

Do not credit wages to:

- `NpcAgent.carried` — it is transient work/logistics payload,
- household stock,
- settlement economy stock,
- a new `wallet`/`balance` field,
- contract history alone.

The assignment's paid outcome records **why/that** the wage was paid; `personalInventory` owns the resulting coins.

## 3. Reward semantics

Preserve the existing frozen contract fields:

- `rewardCoins`,
- `committedWork`,
- `npcWorkCompleted`.

`rewardCoins` is the maximum total price for the original **group** `committedWork`.

It is never:

- per worker,
- multiplied by `requestedWorkerCount`,
- recalculated when workers join/leave,
- recalculated because the player also contributes.

Use the existing `contractRewardRate(record)` semantic:

```text
rewardRate = rewardCoins / committedWork
```

A worker is owed only for useful work accepted through `recordNpcWorkContribution()` and stored on that assignment's `workCompleted`.

If the player or another worker finishes the target before all promised NPC work is performed, unperformed work creates no wage.

## 4. Deterministic integer claim

Coins are integer inventory items. Freeze a positive assignment claim when that assignment permanently stops contributing.

Use one simple deterministic proportional rule based only on persisted contract/assignment state. The implementation must guarantee:

```text
0 <= rewardCoinsDue
sum(all frozen assignment claims) <= rewardCoins
same saved state → same claim
```

Do not round each work bout or mutate money during `recordNpcWorkContribution()`.

Prefer deriving/finalizing the claim once from the assignment's final `workCompleted` and the frozen contract rate. Any discarded fractional remainder is preferable to introducing a second contract currency ledger merely to distribute remainder coins.

`rewardCoinsDue` becomes immutable after it is frozen.

## 5. Assignment payment lifecycle

Keep the contract state coarse (`available / advertised / active / settling / completed`, plus existing cancellation/invalidation outcomes).

Payment outcome belongs to the assignment/history. Extend the current assignment lifecycle only as much as needed to represent:

```text
accepted
travelling
working
payment_due
paid
unpaid
released
uncollectable   # dead worker with an earned but uncollectable claim in this slice
```

Do not reintroduce worker execution states at contract level.

Mixed assignment states are valid:

```text
A = payment_due
B = working
C = travelling
```

A payment-due worker does not consume one of `requestedWorkerCount` work slots.

## 6. When a claim becomes due

Freeze a claim when an assignment permanently stops contractual work after positive accepted contribution, including:

- group commitment reached,
- target no longer accepts useful work because player/other work completed it,
- a living worker genuinely abandons/is released after partial contribution.

Temporary hunger, thirst, sleep, combat interruption, weather shelter or path retry must **not** finalize a claim.

If `workCompleted <= 0`, no positive claim is created.

Current `completeContractWork()` already ends all still-work-active assignments when the group work phase is over. Extend that authoritative transition rather than finalizing claims from `NpcAgent` ad hoc.

Current `releaseWorkContract()` already owns genuine abandonment/death. Extend its input/outcome narrowly enough to distinguish a living release from death where payment handling differs; do not add another release registry.

## 7. Released worker with earned work

A living worker who stops participating after useful work keeps the earned claim and frees the work slot.

Example:

```text
A performs useful work
A genuinely abandons
A no longer occupies a work slot
A's earned claim becomes payment_due
D may later accept the reopened slot
```

The contract may therefore still be `active`/`advertised` while an earlier assignment is already waiting for payment.

Future breach penalties or forfeiture are outside this plan.

## 8. Worker death before payment

Do not implement inheritance, estate collection or household wage transfer.

If the worker dies before collecting a positive earned claim:

- preserve `workCompleted` and the frozen monetary claim in contract history,
- stop all payment-request behaviour for that worker,
- mark the claim `uncollectable` for this slice,
- do not debit the player,
- do not transfer coins to another NPC/household,
- do not count it as deliberate player non-payment.

The historical claim should remain suitable for a later inheritance/estate plan.

## 9. Contract settlement lifecycle

The contract job lifecycle is separate from individual payment state.

When no further contractual work is required/possible:

```text
active/advertised → settling
```

`settling` means work is over, but one or more earned assignment claims are unresolved.

The contract becomes `completed` only when every positive earned claim is terminal:

```text
paid | unpaid | uncollectable
```

Assignments with zero earned claim need no payment resolution.

Do not add combinatorial contract states such as `completed_partially_unpaid`.

Historical assignment outcomes stay persisted after contract completion.

## 10. Payment opportunity is a normal NPC pressure

A payable claim is a bounded decision opportunity for that NPC, not a `NeedId` or permanent FSM mode.

The worker continues normal simulation while waiting, including:

- needs/sleep,
- household/schedule/profession work,
- combat/threat response,
- weather shelter,
- social behaviour.

Use the existing NPC arbitration architecture. Critical/higher-priority pressure may prevent or interrupt a payment attempt.

Do not add `findPlayer()`/global chase behaviour.

## 11. Local employer availability

`NpcAgent.update()` already receives the player's real position for local simulation/reaction.

Use that only as a local opportunity signal. A claimant must not:

- navigate toward the player from arbitrary world distance,
- teleport,
- request payment while streamed out,
- request payment through a remote UI.

The attempt ends if locality is lost; the claim remains due.

## 12. Reusable approach seam

There is no generic NPC-initiated approach-to-player interaction framework yet.

Add only the smallest reusable concept required here: **approach a nearby player for an interaction intent**.

Reuse existing `NpcAgent` navigation/path/watchdog behaviour. Payment supplies context/claim identity; movement remains generic enough for later NPC→Player interactions.

The transient approach must be interruptible by critical needs, threats/combat, death, path failure/watchdog and player departure.

Do not persist approach/path/dialog state.

## 13. Shared dialogue surface

Reuse the existing Vue NPC dialogue flow (`openNpcDialogueMenu()` / `configureNpcDialogueMenu()`), not a payment modal.

The interaction should identify the specific contract + claimant assignment, e.g.:

```text
NPC: "Za wykonaną pracę należy mi się 20 monet."

[Zapłać 20]
[Jeszcze nie]
```

UI state may keep stable ids, but on `Pay` the app layer must re-resolve:

- contract,
- assignment,
- employer,
- current claim state,
- frozen `rewardCoinsDue`,
- target NPC authoritative state.

A stale/repeated dialog must not pay another claim or debit twice.

## 14. Employer and inventory validation

This slice supports `employer === 'player'` only.

Before payment, verify:

1. contract still exists,
2. assignment belongs to the expected `npcId`,
3. claim is still `payment_due`,
4. employer is still `player`,
5. `rewardCoinsDue` matches authoritative state,
6. player's inventory owns enough `coin`,
7. destination NPC still has authoritative `personalInventory`,
8. destination inventory can accept the coins.

Do not add NPC-employer wage payment in this plan merely because `employer` is typed as `string`.

## 15. Atomic coin transfer

Reuse `src/items/inventoryTransfer.ts::transferInventoryCount()`.

Successful payment is one atomic ownership move:

```text
transferInventoryCount(
  playerInventory,
  npcState.personalInventory,
  'coin',
  rewardCoinsDue,
  nowDays,
)
```

Only after a successful transfer may the assignment transition to `paid`.

If transfer fails because the player is short or the NPC inventory cannot accept the coins:

- neither inventory changes,
- the claim stays due,
- contract state stays unchanged,
- existing dialogue/toast feedback reports the reason.

Do not reproduce `remove()` + `add()` transaction logic in payment code.

## 16. Payment orchestration owner

Pure `src/world/workContract.ts` must stay inventory-agnostic.

Add one narrow app/action orchestration seam, preferably alongside existing Work Contract actions, that owns the full synchronous operation:

```text
resolve contract + assignment
resolve authoritative NPC state
validate employer/claim
transferInventoryCount(...)
mark assignment paid through WorkContracts mutation authority
refresh aggregate contract settlement
return typed result
```

UI must call this one operation, never debit inventory itself.

If `SettlementsManager` does not yet expose a live authoritative NPC-state lookup, add a narrow `getNpcState(id)` wrapper over the existing `NpcStateRegistry.get()`, analogous to `getHousehold()` / `getEconomy()`. Do not use `snapshotNpcStates()` for mutation and do not retain a transient `NpcAgent` as the wealth owner.

## 17. Request throttling

Throttle requests per assignment in simulation world time.

Persist an absolute request anchor on the claim, e.g.:

```text
lastPaymentRequestAt
```

Normal retry eligibility: approximately once per world hour, provided the NPC is locally eligible and arbitration selects the opportunity.

Multiple claimants never share one throttle.

The throttle limits requests, not ordinary player perception/reaction.

## 18. Patience and unpaid outcome

Persist a deterministic absolute payment deadline per payable assignment.

Existing `PlayerSocialLookup` may influence the deadline **when the claim is created**. Freeze the result; do not recompute it every frame as relationships change.

When current world time passes the deadline and the claim remains due:

```text
payment_due → unpaid
```

After `unpaid`:

- no automatic request,
- no Pay option for that claim,
- NPC continues normal life,
- no coin transfer occurs,
- history remains available for future reputation/refusal mechanics.

Time skips/reloads compare absolute world time; do not replay missed hourly attempts.

## 19. Persistence

Work Contracts already persist through `SaveData.workContracts`; NPC belongings already persist through `SaveData.npcStates`.

Keep those ownership boundaries:

```text
SaveData.workContracts
  → claim amount/state/request timing/deadline/history

SaveData.npcStates[npcId].personalInventory
  → coins actually owned by worker after payment
```

Do not duplicate NPC coin balance onto the contract.

Extend `SaveWorkContractAssignment` with the payment fields/outcomes and use the repository's current `CURRENT_SAVE_VERSION` + migration chain. Preserve all `npc-018`/`npc-028` group-work fields unchanged.

Legacy assignments must migrate deterministically without creating synthetic wages or double-paying.

After save/load:

- due claims remain due,
- paid claims cannot be paid again,
- worker coins remain in `personalInventory`,
- unpaid/uncollectable claims remain terminal,
- request timing/deadline remain deterministic,
- total claims remain bounded by `rewardCoins`.

## 20. Debuggability

Extend existing Work Contract/NPC diagnostics rather than creating a payment inspector.

Expose where practical:

- contract id/state/employer,
- assignment NPC/state,
- `workCompleted`, `rewardCoinsDue`,
- aggregate `npcWorkCompleted` / `committedWork` / reward ceiling,
- last request / next eligibility / deadline,
- current payment approach intent/interruption reason,
- payment result (`paid`, insufficient player funds, destination full, stale claim),
- NPC personal coin count after successful transfer.

## Non-goals

Do not implement:

- NPC employers,
- Guard/Hunt/Companion/Escort contract families,
- a wallet/bank/currency ledger parallel to `Inventory`,
- household pooled currency,
- inheritance/estate collection,
- escrow,
- item rewards/barter,
- negotiation,
- partial payments,
- loans/installments,
- pooled crew wages,
- new reputation/gossip/refusal systems,
- advanced workforce marketplace.

## Verification

Player performs browser verification; AI should not run browser verification.

Automated tests should cover at least:

- per-assignment claim freezing from accepted useful contribution,
- claim sum never exceeding contract reward,
- partial-contribution release reopening a work slot while preserving the claim,
- simultaneous `payment_due` + `working/travelling` assignments,
- group work ending all active assignments without synthetic work,
- successful `player Inventory → npc personalInventory` coin transfer,
- insufficient player coins leaves both inventories/claim unchanged,
- destination-capacity failure leaves both inventories/claim unchanged,
- repeated/stale Pay is idempotent,
- paid NPC coins survive `NpcAgent` reconstruction and save/load,
- patience expiry to `unpaid`,
- worker death to `uncollectable` without debiting player,
- save migration/round-trip for assignment payment fields,
- contract reaches `completed` only after every positive claim is terminal.

## Implementation guardrails

- Extend current Work Contract records/mutations; no parallel payment registry.
- Keep actual target progress actor-neutral and owned by the target system.
- Use `personalInventory` for worker-owned money; keep `carried` transient.
- Use `transferInventoryCount()` for the coin ownership move.
- Resolve live state by stable ids immediately before payment.
- Keep payment approach/dialog transient and local.
- Add JSDoc to new public/architectural seams where useful for preflight discovery, using the existing domain tags.

> **Zrób git commit i push do main, rebase jeżeli trzeba**