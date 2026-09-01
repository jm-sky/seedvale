# Plan: Work Contracts — Payment & Employer Interaction

**Created:** 2026-09-01
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** npc-015
**Domain:** `npc`
**Roadmap:** `workforce-for-hire.md`

## Goal

Complete the first **Workforce for Hire** vertical slice by adding physical NPC → Player payment interaction.

After work is completed, the NPC enters `payment_due`. Payment is never automatic. The NPC continues living normally and, when it actually sees the employer/player, may decide to approach and request payment.

The NPC must not become a dedicated payment-seeking agent or block normal needs and routines while waiting.

If the player pays, the contract becomes `completed`. If the player does not pay, the NPC may retry approximately once per world hour when seeing the player, but eventually stops actively pursuing the payment. The unpaid obligation remains recorded for future consequences.

## Architectural principles

Do not create a separate payment AI, scheduler, interaction framework, or reputation system.

Use:

```
payment_due
    +
existing NPC needs / pressures / perception
    ↓
existing decision system
    ↓
approach opportunity
    ↓
existing NPC ↔ Player interaction
    ↓
existing economy transaction
```

`payment_due` is a problem/pressure affecting NPC decisions, not a permanent NPC activity mode.

The NPC must continue normal life while waiting for payment.

## 1. Recon existing mechanisms

Before implementation, inspect and reuse:

- NPC ↔ Player interaction,
- NPC player detection/perception,
- navigation,
- interaction initiation,
- dialogue/action presentation,
- economy transaction,
- player coins/wallet,
- relationship/sympathy,
- reputation/standing,
- world time,
- NPC needs/pressures,
- persistence,
- existing failure/cancellation patterns.

Do not introduce parallel mechanisms where existing systems can express the behaviour.

## 2. Payment due state

Use the `payment_due` state produced by `npc-015`.

It means:

- work was completed,
- reward is owed,
- worker is known,
- employer is known,
- payment has not happened,
- contract is not completed.

No automatic transfer of coins occurs when entering `payment_due`.

## 3. Payment as an NPC problem/pressure

The unpaid reward should be represented through the existing NPC decision/pressure system.

Do not implement:

```
if paymentDue:
    findPlayer()
    chasePlayer()
```

Instead:

```
payment_due
    ↓
normal NPC simulation
    ↓
player becomes visible / available
    ↓
payment opportunity
    ↓
existing decision system
    ↓
approach player
```

The NPC can therefore work, eat, drink, sleep, fulfil household duties, respond to other pressures, encounter the player, ask for payment, and return to normal activities.

## 4. Player detection

The NPC may initiate a payment request only when the player is actually detectable through existing perception/detection mechanisms.

The NPC must not:

- teleport to the player,
- know the player's position globally,
- initiate interaction from arbitrary distance.

If the player is unavailable, the NPC continues normal simulation and may try again later.

## 5. Approach the player

When the NPC decides to request payment, it should use existing navigation and interaction approach behaviour.

Flow:

```
payment opportunity
    ↓
approach player
    ↓
interaction range
    ↓
payment interaction
```

If the player moves away, the path fails, or a higher-priority need appears, the attempt can be interrupted.

Do not create payment-specific movement.

## 6. Physical NPC ↔ Player interaction

Payment must be a real NPC ↔ Player interaction.

Minimal interaction is sufficient:

```
NPC
"Payment due: 20 coins."

Player
[Pay 20]
```

Use the existing interaction/dialogue system where possible.

The important requirement is that **the player explicitly performs the payment action**.

No remote or automatic payment.

## 7. Economy transaction

When the player selects `Pay`:

1. verify the contract is still `payment_due`,
2. verify the player has sufficient coins,
3. execute the existing economy transaction,
4. only after successful transaction mark the contract completed.

Flow:

```
payment_due
    ↓
player chooses Pay
    ↓
validate contract
    ↓
validate funds
    ↓
economy transaction
    ↓
success
    ↓
completed
```

Do not mark the contract completed before successful payment.

## 8. Insufficient funds

If the player cannot afford the reward:

- no coins are transferred,
- contract remains `payment_due`,
- NPC remains unpaid,
- interaction communicates the failure,
- NPC may try again later.

Do not implement partial payment, barter, loans, instalments, or negotiation.

## 9. Request throttling

The NPC must not repeatedly ask for payment every time it sees the player.

Use world time.

Minimum persistent timing information:

```
lastPaymentRequestAt
```

A new request should normally be possible approximately **once per world hour**, provided the NPC sees the player and the existing decision system chooses the opportunity.

The throttle limits payment requests, not player detection.

## 10. Patience and unpaid outcome

The NPC must not wait indefinitely.

After `payment_due`, allow a bounded period during which payment remains an active concern.

Patience should be influenced by the NPC's existing relationship with the player where possible.

When patience is exhausted:

```
payment_due
    ↓
active payment attempts
    ↓
patience exhausted
    ↓
unpaid
```

`unpaid` means work was completed but the employer did not pay.

It must not be treated as `completed`.

The NPC stops actively pursuing the payment and returns fully to normal life.

The unpaid obligation remains persistent for future systems.

If an existing contract lifecycle already has an appropriate terminal failure state, reuse it rather than creating a redundant one.

## 11. Needs always have priority

Payment seeking must not suspend normal NPC needs.

For example:

```
payment_due
    ↓
player seen
    ↓
NPC considers approaching
    ↓
critical hunger
    ↓
eat first
    ↓
payment opportunity later
```

Likewise, while travelling toward an interaction, a higher-priority need may interrupt the attempt.

Do not create `PaymentPriorityManager` or another payment-specific priority system.

## 12. Sympathy and reputation

Do not create a new reputation or relationship system.

Use existing sympathy/reputation/standing mechanisms.

At minimum, where the current APIs support it:

```
higher sympathy / reputation
    ↓
longer patience

lower sympathy / reputation
    ↓
shorter patience
```

This should be an extension of the existing relationship model, not a new `ContractTrustScore`.

If an existing system is not yet capable of providing a meaningful signal, keep the integration small and document the limitation rather than implementing a parallel reputation model.

Future consequences such as gossip, refusal of future work, or settlement-wide reputation are outside this plan.

## 13. Completion

Only after successful payment:

```
payment_due
    ↓
completed
```

After completion:

- worker no longer has a payment obligation,
- NPC returns to normal decision flow,
- contract cannot be paid again,
- relevant contract-world representations can be cleaned up using mechanisms from `npc-014`.

Do not create a separate permanent `paid` contract state unless existing architecture requires it.

## 14. Persistence

Persist enough information to restore:

- payment_due state,
- worker/employer references,
- last payment request time,
- patience/deadline state,
- unpaid state,
- completed state.

Verify payment_due, insufficient funds, unpaid, and completed states survive save/load.

After reload:

- payment cannot be duplicated,
- throttling remains valid,
- unpaid contracts remain unpaid,
- completed contracts remain completed.

## 15. Transaction safety / idempotency

Payment must be performed exactly once.

Before payment:

```
contract.state == payment_due
```

After successful payment:

```
contract.state == completed
```

A repeated interaction must not transfer the reward twice.

Use existing transaction/idempotency mechanisms where available.

## 16. Debuggability

Extend existing debug tooling to expose, where practical:

- payment_due,
- worker,
- employer,
- reward,
- last request time,
- next eligible request time,
- patience/deadline,
- current payment-seeking decision,
- interruption reason,
- insufficient funds,
- unpaid outcome,
- completed payment.

Do not create a dedicated debug UI if existing diagnostics can be extended.

## Non-goals

Do not implement:

- Guard contracts,
- Hunt contracts,
- Companion/Escort contracts,
- item rewards,
- barter,
- salary negotiation,
- partial payments,
- loans/installments,
- new reputation system,
- gossip,
- refusal-of-future-work behaviour,
- settlement-wide reputation propagation,
- NPC competition,
- advanced workforce marketplace.

## Verification

### Happy path

1. NPC completes construction.
2. Contract becomes `payment_due`.
3. No coins are transferred automatically.
4. NPC continues normal simulation.
5. NPC sees the player.
6. Existing decision flow selects the payment opportunity.
7. NPC approaches the player.
8. Player receives the payment interaction.
9. Player chooses `Pay`.
10. Economy transaction succeeds.
11. Contract becomes `completed`.
12. NPC no longer has the payment obligation.

### Physical interaction

Verify:

- NPC cannot interact from arbitrary distance,
- NPC does not teleport,
- NPC cannot pay remotely,
- player action is required.

### Insufficient funds

Verify:

- insufficient coins do not complete the contract,
- no coins are transferred,
- NPC remains unpaid,
- player can try again later.

### Request throttling

Verify:

- NPC can make an initial request,
- seeing the player again before one world hour does not create another request,
- after approximately one world hour the NPC can request again if the decision system selects it.

### Normal life

Verify that `payment_due` does not prevent hunger handling, thirst handling, sleep/rest, household duties, or higher-priority decisions.

### Patience

Verify:

- NPC does not wait forever,
- NPC can stop actively pursuing payment,
- NPC returns to normal simulation,
- unpaid obligation remains persistent.

### Sympathy / reputation

Where existing systems support it, verify that different relationship/standing levels can influence patience without introducing a new reputation mechanism.

### Persistence

Verify payment_due, unpaid, paid, and completed states survive save/load.

### Double payment

Verify that the same contract cannot transfer its reward twice.

## Completion criteria

The first complete Workforce for Hire vertical slice works:

```
create contract
      ↓
physically post announcement
      ↓
NPC discovers
      ↓
NPC evaluates
      ↓
NPC accepts
      ↓
NPC travels
      ↓
NPC works
      ↓
NPC handles needs
      ↓
payment_due
      ↓
NPC lives normally
      ↓
NPC sees employer
      ↓
NPC approaches
      ↓
player chooses Pay
      ↓
economy transaction
      ↓
completed
```

If the player does not pay:

```
payment_due
      ↓
NPC continues normal life
      ↓
sees player
      ↓
request payment
      ↓
~1 world hour throttle
      ↓
eventual patience exhaustion
      ↓
unpaid
```

The result is a real physical NPC ↔ Player economic interaction and a complete first Work Contracts vertical slice.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
