# Plan: Work Contracts — Payment & Employer Interaction

**Created:** 2026-09-01
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~npc-015~~, ~~npc-018~~
**Domain:** `npc`  
**Subdomains:** `work` `behavior` `dialogue`  
**Roadmap:** `workforce-for-hire.md`  

## Goal

Complete the first **Workforce for Hire** vertical slice by making a finished NPC work commitment create a real, physical employer-payment interaction.

The authoritative contract already reaches `payment_due` after the hired NPC fulfils its contractual commitment. Since `npc-018`, that commitment can be only a share of an existing target's remaining work, so `payment_due` means **the agreed NPC work is owed payment** — not necessarily that the underlying world object is fully completed.

Payment is never automatic. The NPC continues normal life and may request payment only when the player is locally available. The player must explicitly choose to pay.

If payment succeeds, the contract becomes `completed`. If the player does not pay for long enough, the contract becomes terminal `unpaid`; the obligation remains recorded for future consequences, but the NPC stops actively pursuing it.

## Architectural direction

Do not create a separate payment AI, scheduler, interaction framework, wallet system, or reputation model.

Extend the systems that already own the relevant state:

```text
WorkContractRecord.payment_due
    +
normal NPC arbitration / player-local reaction
    ↓
transient approach opportunity
    ↓
existing NPC dialogue surface
    ↓
explicit player Pay action
    ↓
player coin debit + authoritative contract transition
    ↓
completed
```

`payment_due` is a contract-backed problem/pressure affecting NPC decisions, not a permanent NPC mode or `NeedId`.

## 1. Existing contract authority

Reuse the implemented Work Contracts foundation:

- `src/world/workContract.ts` owns `WorkContractRecord` and lifecycle rules,
- `src/world/createWorkContracts.ts` owns the `WorldBundle` runtime and mutations,
- `workerNpcId` is the authoritative worker assignment,
- `employer` is already stored on the contract,
- `rewardCoins` is already frozen on the contract,
- `payment_due` is already persisted,
- `NpcAgent` resolves its current commitment from `WorkContracts.findByWorker()` rather than duplicating contract state.

Do not add payment state directly to `NpcAgent` when it belongs on the contract.

## 2. Payment semantics after shared work

`npc-018` changed the meaning of work completion.

A contract contains a frozen commitment snapshot:

- `requestedWorkShare`,
- `remainingWorkAtCreation`,
- `committedWork`,
- `npcWorkCompleted`.

The NPC may therefore satisfy its contract while the player or another actor still has work left on the world target.

Payment must be based on the existing contract reward and `payment_due` lifecycle state. Do not re-evaluate target completion, remaining work, work share, or reward when payment is requested.

## 3. Contract lifecycle extension

Extend the existing lifecycle with one explicit terminal outcome:

```text
payment_due → completed
payment_due → unpaid
```

`completed` means the agreed reward was successfully paid.

`unpaid` means the NPC fulfilled its commitment but the employer failed to pay before patience expired.

Do not overload:

- `cancelled` — player abandoned a still-active contract,
- `invalidated` — target ceased to be valid.

Those states describe different causes and must remain distinct.

Add lifecycle mutations through the existing `workContract.ts` / `WorkContracts` mutation seam. Do not let UI code mutate records directly.

## 4. Payment as an NPC pressure/opportunity

A `payment_due` contract should become a bounded NPC decision opportunity, not a new need or permanent phase.

The worker must continue normal simulation while waiting:

- hunger/thirst/sleep,
- household duties,
- schedule/profession work,
- combat/threat response,
- weather shelter,
- social behaviour.

Critical or higher-priority concerns can prevent or interrupt a payment attempt.

Do not implement a global `findPlayer()`/`chasePlayer()` path.

## 5. Local player availability

`NpcAgent.update()` already receives the player's real position for local simulation/reaction purposes. That position must not become unconditional omniscient knowledge.

Payment consideration must be gated by the same local/proximity/perception assumptions already used for NPC reaction to the player.

The NPC must not:

- teleport,
- navigate from arbitrary world distance toward a globally known player position,
- initiate an interaction while streamed out,
- request payment remotely.

Loss of local eligibility cancels only the current approach attempt, not the contract obligation.

## 6. Approach interaction

There is currently no generic NPC-initiated approach-to-player interaction framework.

Add only the smallest reusable extension needed to let an NPC with a selected local interaction opportunity approach the player through existing navigation/watchdog machinery.

The payment-specific layer should supply intent/context; movement itself should remain generic enough to be reused by future NPC→Player interactions.

The attempt must be transient and interruptible by:

- critical needs,
- combat/threats,
- death,
- path failure/watchdog,
- player leaving local eligibility.

Do not add a permanent payment FSM mode.

## 7. Physical dialogue surface

Reuse the existing Vue NPC dialogue surface opened through `openNpcDialogueMenu()` rather than creating a payment modal.

The payment request should identify the contract and reward, for example:

```text
NPC: "Za tę pracę należy mi się 20 monet."

[Zapłać 20]
[Jeszcze nie]
```

The UI must keep only a contract id/reference and resolve the authoritative contract again when the player presses `Pay`.

A stale dialog must not be able to pay an already resolved contract.

## 8. Player coin debit

Coins currently live in the player's normal inventory. There is no persistent NPC wallet or general actor-to-actor currency ledger.

For this plan, successful payment means:

1. re-resolve the contract,
2. verify `state === 'payment_due'`,
3. verify the expected worker/employer and frozen `rewardCoins`,
4. verify the player owns enough `coin`,
5. remove exactly `rewardCoins` from player inventory,
6. transition the contract to `completed` through one authoritative payment mutation.

Do not route wages through merchant `settleTransaction()` unless the implementation intentionally turns this into a normal trade basket.

Do not add a transient coin balance to `NpcAgent.carried`: carried inventory is runtime/transient and is not an authoritative persistent wealth model.

Persistent worker/household money ownership is outside this slice. Until such an economy exists, the contract's `completed` outcome is the durable record that payment happened.

## 9. Transaction safety / idempotency

Payment must be exactly-once from the player's perspective.

The payment mutation must own the full validation-and-transition operation; UI code must not independently remove coins and then separately mark the contract complete.

Required invariant:

```text
payment_due + enough coins
    → debit once
    → completed
```

Repeated clicks, stale dialogs, reloads, or duplicate callbacks must not debit the reward twice.

If a single existing seam cannot safely own both inventory debit and contract mutation, add one narrow app-level orchestration function that performs both synchronously and exposes one result to the UI.

## 10. Insufficient funds / defer payment

If the player cannot afford the reward:

- remove no coins,
- keep the contract `payment_due`,
- report the failure through existing dialogue/toast feedback,
- let the NPC try again later.

Choosing `Jeszcze nie` has the same lifecycle result: the contract remains `payment_due`.

Do not implement partial payment, barter, loans, instalments, or negotiation.

## 11. Request throttling

NPC payment requests must be throttled in simulation world time, not render time.

Persist an absolute timing anchor such as:

```text
lastPaymentRequestAt
```

A new active request should normally be eligible about once per world hour, provided the player is locally available and normal NPC arbitration selects the opportunity.

The throttle limits requests, not player detection/reaction generally.

## 12. Patience and `unpaid`

Store a deterministic absolute patience deadline/expiry on the authoritative contract rather than decrementing a timer every frame.

Relationship/standing may influence the initial deadline using the existing `PlayerSocialLookup` signal. Do not create `ContractTrustScore` or another relationship model.

When current world time passes the deadline while the contract is still `payment_due`:

```text
payment_due → unpaid
```

After `unpaid`:

- no further automatic payment requests are initiated,
- no Pay action is offered for this contract,
- the worker returns fully to normal life,
- the record remains persistent for future reputation/dialogue/work-refusal systems.

Time skips should resolve expiry from absolute world time without replaying missed hourly requests.

## 13. Persistence

`SaveData.workContracts` already exists and Work Contracts already round-trip through save/load.

Extend that existing contract serialization with only the new authoritative payment fields required by this plan, for example:

- `lastPaymentRequestAt`,
- patience deadline/expiry,
- new `unpaid` lifecycle state.

Use the repository's current save-version migration mechanism. Do not add a second persistence section or store payment runtime state on `NpcAgent`.

After reload:

- `payment_due` remains payable,
- throttle/deadline remain deterministic,
- `completed` cannot be paid again,
- `unpaid` remains terminal,
- shared-work commitment fields remain unchanged.

## 14. Debuggability

Extend existing Work Contract / NPC diagnostics rather than creating a payment inspector.

Expose where practical:

- contract id/state,
- worker/employer,
- reward,
- `committedWork` / `npcWorkCompleted`,
- last request / next eligible request,
- patience deadline,
- current payment approach intent,
- interruption reason,
- insufficient-funds result,
- `completed` / `unpaid` transition.

Use existing NPC trace/debug seams for important transitions.

## Non-goals

Do not implement:

- Guard/Hunt/Companion/Escort contract families,
- worker-owned persistent wallet/wealth,
- household currency economy,
- escrow,
- item rewards,
- barter,
- salary negotiation,
- partial payments,
- loans/installments,
- new reputation system,
- gossip,
- refusal of future work,
- settlement-wide reputation propagation,
- advanced workforce marketplace.

## Verification

Player performs browser verification; AI should not run browser verification.

### Shared-work happy path

1. Create a contract for less than 100% of an unfinished target's remaining work.
2. NPC accepts and performs its frozen commitment.
3. Contract reaches `payment_due` even if the target itself still has remaining work.
4. No coins move automatically.
5. NPC continues normal simulation.
6. NPC locally encounters the player and selects a payment opportunity.
7. NPC approaches using normal movement.
8. Payment interaction opens only in physical/local context.
9. Player chooses `Pay`.
10. Exactly `rewardCoins` are removed once.
11. Contract becomes `completed`.
12. Target progress and shared-work snapshot are unchanged by payment.

### Interruption / locality

Verify that the NPC does not teleport or globally chase the player, and that critical need, combat, path failure or leaving local range can abort the current request without losing `payment_due`.

### Insufficient funds / defer

Verify that insufficient coins and `Jeszcze nie` leave the contract `payment_due` with no debit.

### Throttle / patience

Verify one-world-hour request throttling, deterministic save/load/time-skip behaviour, relationship-influenced patience where supported, and eventual `payment_due → unpaid`.

### Persistence / idempotency

Verify `payment_due`, `completed`, `unpaid`, request timing and patience survive save/load, and repeated/stale Pay callbacks cannot debit twice.

## Completion criteria

The implemented slice is:

```text
post contract
    ↓
NPC accepts
    ↓
NPC performs committedWork
    ↓
payment_due
    ↓
NPC keeps living normally
    ↓
local encounter + bounded approach
    ↓
explicit Pay
    ↓
player coin debit exactly once
    ↓
completed
```

or, when unpaid:

```text
payment_due
    ↓
normal life + occasional local requests
    ↓
patience deadline
    ↓
unpaid
```

This completes the first physical employer/payment loop without inventing parallel AI, interaction, persistence, reputation, or economy systems.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
