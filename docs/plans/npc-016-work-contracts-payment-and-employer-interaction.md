# Plan: Work Contracts — Payment & Employer Interaction

**Created:** 2026-09-01
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~npc-015~~, ~~npc-018~~, npc-028
**Domain:** `npc`  
**Subdomains:** `work` `behavior` `dialogue`  
**Roadmap:** `workforce-for-hire.md`  

## Goal

Complete the first **Workforce for Hire** vertical slice by making finished NPC Work Contract assignments create real, physical employer-payment interactions.

After `npc-028`, one Work Contract may contain multiple worker assignments. Payment therefore belongs to the **individual assignment/claim**, not to one contract-level `workerNpcId` or one shared `payment_due` state.

Each worker is paid only for useful work actually accepted from that worker. The contract reward remains the frozen maximum price for the group's original `committedWork`; it is not multiplied by worker count.

Payment is never automatic. A worker with an unpaid claim continues normal life and may request payment only when the player is locally available. The player must explicitly choose to pay that specific claim.

If payment succeeds, that assignment's claim becomes paid. If the player does not pay for long enough, that claim becomes terminal unpaid. The contract can finish settlement once every owed assignment claim is terminal.

## Architectural direction

Do not create a separate payment AI, scheduler, interaction framework, wallet system, reputation model, or pooled crew wage.

Extend the systems that already own the relevant state:

```text
WorkContract
    owns target / group commitment / reward ceiling
        ↓
WorkContractAssignment
    owns worker lifecycle / contribution / payment claim
        ↓
assignment payment_due
    + normal NPC arbitration / player-local reaction
        ↓
transient approach opportunity
        ↓
existing NPC dialogue surface
        ↓
explicit player Pay action
        ↓
player coin debit + authoritative assignment transition
        ↓
paid
```

A payment claim is a contract-backed problem/pressure affecting the specific NPC's decisions, not a permanent NPC mode or `NeedId`.

## 1. Multi-worker contract authority

This plan implements on top of `npc-028-work-contracts-multiple-workers.md`.

Reuse its ownership split:

```text
WorkContractRecord
    owns job / target / group commitment / reward / posting

WorkContractAssignment
    owns one NPC's execution / contribution / payment state
```

Do not restore single-worker authority through a replacement `workerNpcId` field or payment-only lookup copied onto `NpcAgent`.

NPCs resolve their active work assignment and outstanding payment claim through Work Contracts authority.

## 2. Reward semantics

Preserve the contract's frozen:

- `rewardCoins`,
- `committedWork`,
- `npcWorkCompleted`.

`rewardCoins` means the **maximum total price offered for the original group `committedWork`**.

It is not:

- a per-worker reward,
- multiplied by `requestedWorkerCount`,
- recalculated when workers join/leave,
- recalculated when the Player contributes.

Conceptually the frozen rate is:

```text
rewardRate = rewardCoins / committedWork
```

A worker's monetary claim derives from that worker's useful accepted contribution:

```text
assignment claim ∝ assignment.workCompleted × rewardRate
```

If the Player completes the target before NPCs perform all `committedWork`, NPCs are owed only for actual accepted NPC work. Unperformed promised work does not generate synthetic wages.

Example:

```text
rewardCoins = 90
committedWork = 9h
NPC group performs 6h useful work
Player completes the remaining target work

→ total NPC claims correspond to 60 coins
→ the unused 30 coins never become owed
```

## 3. Integer coin allocation

Coins are integer inventory items, so proportional claims need deterministic rounding.

Do not independently round every assignment in a way that can make total claims exceed the contract reward.

Use one authoritative deterministic allocation rule with these invariants:

```text
sum(all assignment claim coins) <= rewardCoins
sum(all assignment claim coins) corresponds to actual accepted NPC work
same saved state → same claim amounts
```

Prefer freezing each assignment's `rewardCoinsDue` when its contractual participation ends, while keeping enough contract-level accounting to allocate remainder coins deterministically.

The final implementation may use a cumulative credited-reward calculation, e.g. derive the newly owed integer coins from the difference between aggregate earned reward before/after a contribution or assignment finalization. Avoid floating-point drift becoming economic state.

## 4. Assignment payment lifecycle

Payment state belongs to each assignment.

The exact assignment vocabulary should remain aligned with `npc-028`, but must support at least the equivalent of:

```text
accepted
travelling
working
payment_due
paid
unpaid
released
```

Mixed states are valid and expected:

```text
NPC A = payment_due
NPC B = working
NPC C = travelling
```

One worker's claim must not block another worker from travelling or working.

A worker who stops doing contractual work no longer occupies a work slot merely because payment is still outstanding.

## 5. When a claim becomes due

A worker gets a payment claim when that assignment permanently stops contributing after having performed useful accepted work, including when:

- the group commitment is fulfilled,
- the target completes first because of concurrent Player/other work,
- the worker is genuinely released/abandons after partial useful contribution,
- another terminal work-side event ends that assignment while preserving already performed work.

Temporary sleep, hunger, combat interruption or path retry does not finalize the assignment or create a premature payment claim.

If an assignment contributed zero useful work, it creates no positive payment claim.

## 6. Released workers keep earned claims

A worker does not forfeit already earned wages merely because they later become unable to continue.

Example:

```text
A performs 2h useful work
A genuinely abandons / becomes unavailable
slot reopens
D later joins

→ A's 2h contribution remains credited
→ A's earned claim remains payable
→ D can use the reopened work slot
```

Future breach-of-contract, discipline or penalty mechanics may alter this, but are outside this plan.

## 7. Worker death before payment

Death must not erase the historical earned claim or rewrite contribution accounting.

For this plan, do **not** implement inheritance, household collection or estate logic.

If the worker dies while a positive claim remains unpaid:

- preserve the claim in authoritative contract history,
- stop NPC-initiated payment requests from the dead worker,
- resolve it through a simple terminal/uncollectable handling that does not punish the player as deliberate non-payment,
- keep the data suitable for a later household/inheritance plan to replace this temporary policy.

Do not silently transfer the money to another NPC in this plan.

## 8. Contract-level lifecycle after multi-worker work

The contract lifecycle is coarse job/settlement state; worker execution/payment state belongs to assignments.

`npc-028` should have removed single-worker `accepted/travelling/working/payment_due` as authoritative group execution semantics.

This plan should use the aggregate contract vocabulary established there, conceptually:

```text
available / advertised
→ active
→ settling
→ completed
```

with existing cancellation/invalidation outcomes preserved.

`settling` means no further contracted work is required/possible, but one or more worker claims are still unresolved.

Do not add a combinatorial contract state such as `completed_partially_unpaid`.

The contract may become `completed` once every owed assignment claim has reached a terminal payment outcome such as `paid`, `unpaid`, or the temporary death/uncollectable outcome defined above.

Historical per-assignment outcomes remain inspectable after contract completion.

## 9. Payment as an NPC pressure/opportunity

An assignment with a payable claim should become a bounded NPC decision opportunity, not a new need or permanent phase.

The worker must continue normal simulation while waiting:

- hunger/thirst/sleep,
- household duties,
- schedule/profession work,
- combat/threat response,
- weather shelter,
- social behaviour.

Critical or higher-priority concerns can prevent or interrupt a payment attempt.

Do not implement a global `findPlayer()`/`chasePlayer()` path.

## 10. Local player availability

`NpcAgent.update()` already receives the player's real position for local simulation/reaction purposes. That position must not become unconditional omniscient knowledge.

Payment consideration must be gated by the same local/proximity/perception assumptions already used for NPC reaction to the player.

The NPC must not:

- teleport,
- navigate from arbitrary world distance toward a globally known player position,
- initiate an interaction while streamed out,
- request payment remotely.

Loss of local eligibility cancels only the current approach attempt, not the payment claim.

## 11. Approach interaction

There is currently no generic NPC-initiated approach-to-player interaction framework.

Add only the smallest reusable extension needed to let an NPC with a selected local interaction opportunity approach the player through existing navigation/watchdog machinery.

The payment-specific layer supplies intent/context; movement itself should remain generic enough to be reused by future NPC→Player interactions.

The attempt must be transient and interruptible by:

- critical needs,
- combat/threats,
- death,
- path failure/watchdog,
- player leaving local eligibility.

Do not add a permanent payment FSM mode.

## 12. Physical dialogue surface

Reuse the existing Vue NPC dialogue surface opened through `openNpcDialogueMenu()` rather than creating a payment modal.

The payment request must identify the specific contract **and assignment/claim**, for example:

```text
NPC: "Za wykonaną pracę należy mi się 20 monet."

[Zapłać 20]
[Jeszcze nie]
```

The UI keeps only stable ids/references and resolves the authoritative contract + assignment again when the player presses `Pay`.

A stale dialog must not be able to pay an already resolved claim or another worker's claim.

## 13. Player coin debit

Coins currently live in the player's normal inventory. There is no persistent NPC wallet or general actor-to-actor currency ledger.

For this plan, successful payment means:

1. re-resolve the contract and assignment,
2. verify that assignment's claim is still payable,
3. verify the expected worker/employer and frozen `rewardCoinsDue`,
4. verify the player owns enough `coin`,
5. remove exactly that assignment's due coins from player inventory,
6. transition that assignment claim to `paid` through one authoritative payment mutation,
7. update aggregate contract settlement state if this was the final unresolved claim.

Do not route wages through merchant `settleTransaction()` unless the implementation intentionally turns this into a normal trade basket.

Do not add a transient coin balance to `NpcAgent.carried`: carried inventory is runtime/transient and is not an authoritative persistent wealth model.

Persistent worker/household money ownership is outside this slice. Until such an economy exists, the assignment's `paid` outcome is the durable record that payment happened.

## 14. Transaction safety / idempotency

Payment must be exactly-once from the player's perspective.

The authoritative payment mutation/orchestration must own the full validation-and-transition operation; UI code must not independently remove coins and then separately mark the assignment paid.

Required invariant:

```text
payable assignment claim + enough coins
    → debit once
    → assignment paid
```

Repeated clicks, stale dialogs, reloads, or duplicate callbacks must not debit the same claim twice.

If a single existing seam cannot safely own both inventory debit and contract mutation, add one narrow app-level orchestration function that performs both synchronously and exposes one result to the UI.

## 15. Insufficient funds / defer payment

If the player cannot afford the specific claim:

- remove no coins,
- keep that assignment claim payable,
- report the failure through existing dialogue/toast feedback,
- let that NPC try again later.

Choosing `Jeszcze nie` has the same lifecycle result.

Other workers' claims and work assignments remain unaffected.

Do not implement partial payment, barter, loans, instalments, pooled payments or negotiation.

## 16. Request throttling

Payment requests are per claimant NPC/assignment and must be throttled in simulation world time, not render time.

Persist an absolute timing anchor on the assignment/claim, such as:

```text
lastPaymentRequestAt
```

A new active request should normally be eligible about once per world hour, provided the player is locally available and normal NPC arbitration selects the opportunity.

The throttle limits requests, not player detection/reaction generally.

Multiple owed workers must not share one throttle that prevents each other from requesting payment.

## 17. Patience and unpaid claims

Store a deterministic absolute patience deadline/expiry per payable assignment rather than decrementing a timer every frame.

Relationship/standing may influence the initial deadline using the existing `PlayerSocialLookup` signal. Do not create `ContractTrustScore` or another relationship model.

When current world time passes a claim's deadline while it is still payable:

```text
payment_due → unpaid
```

After `unpaid`:

- that NPC no longer initiates automatic requests for this claim,
- no Pay action is offered for this claim,
- the worker returns fully to normal life,
- the record remains persistent for future reputation/dialogue/work-refusal systems,
- other workers' claims remain independent.

Time skips resolve expiry from absolute world time without replaying missed hourly requests.

## 18. Persistence

`SaveData.workContracts` already exists and Work Contracts already round-trip through save/load.

Extend the multi-worker serialization established by `npc-028` with authoritative per-assignment payment fields, conceptually:

```text
assignments[]
  npcId
  workCompleted
  rewardCoinsDue
  payment state
  lastPaymentRequestAt
  paymentDeadline
```

Use the repository's current save-version migration mechanism. Do not add a second persistence section or store payment runtime state on `NpcAgent`.

After reload:

- each payable claim remains independently payable,
- paid claims cannot be paid again,
- unpaid claims remain terminal,
- request throttle/deadline remain deterministic,
- aggregate work commitment fields remain unchanged,
- total frozen claims cannot exceed the reward earned by actual accepted NPC contribution.

## 19. Debuggability

Extend existing Work Contract / NPC diagnostics rather than creating a payment inspector.

Expose where practical:

- contract id / aggregate state,
- worker assignment id/NPC id/state,
- contract reward ceiling and committed work,
- assignment `workCompleted` / `rewardCoinsDue`,
- contract `npcWorkCompleted`,
- last request / next eligible request,
- patience deadline,
- current payment approach intent,
- interruption reason,
- insufficient-funds result,
- paid / unpaid / temporary death-uncollectable transition.

Use existing NPC trace/debug seams for important transitions.

## Non-goals

Do not implement:

- Guard/Hunt/Companion/Escort contract families,
- worker-owned persistent wallet/wealth,
- household currency economy,
- inheritance/estate transfer of dead workers' claims,
- escrow,
- item rewards,
- barter,
- salary negotiation,
- partial payments,
- loans/installments,
- pooled crew wage,
- new reputation system,
- gossip,
- refusal of future work,
- settlement-wide reputation propagation,
- advanced workforce marketplace.

## Verification

Player performs browser verification; AI should not run browser verification.

### Multi-worker happy path

1. Create one contract with several worker slots.
2. Multiple NPCs accept and contribute different useful work amounts.
3. Group work ends with attributable per-assignment contributions.
4. Each positive contributor receives its own frozen payable claim.
5. Total claims do not exceed the reward earned for actual NPC contribution.
6. No coins move automatically.
7. Workers continue normal simulation while waiting.
8. One claimant locally encounters the player and selects a payment opportunity.
9. Payment interaction opens only in physical/local context for that claim.
10. Player chooses `Pay`.
11. Exactly that assignment's `rewardCoinsDue` is removed once.
12. Only that assignment becomes paid.
13. Other claims/workers remain unchanged.
14. Contract becomes completed only after all owed claims are terminal.

### Partial contribution / replacement

1. Worker A contributes useful work and is genuinely released.
2. A keeps an earned claim and stops occupying a work slot.
3. Worker D later fills the reopened slot.
4. D's contribution and claim are independent.
5. Aggregate claims remain bounded by actual NPC work and contract reward.

### Player completes target first

Verify that if Player contribution completes the target before group `committedWork`:

- all contractual work stops,
- no synthetic work is credited,
- claims are based only on actual accepted contribution,
- unused contract reward does not become owed.

### Mixed lifecycle

Verify states such as:

```text
A = payment_due
B = working
C = travelling
```

A requesting/payment resolution must not block B/C execution.

### Interruption / locality

Verify that a claimant does not teleport or globally chase the player, and that critical need, combat, path failure or leaving local range can abort the current request without losing the claim.

### Insufficient funds / defer

Verify that insufficient coins and `Jeszcze nie` leave only that claim unresolved with no debit.

### Throttle / patience

Verify per-claim one-world-hour request throttling, deterministic save/load/time-skip behaviour, relationship-influenced patience where supported, and eventual claim-level `payment_due → unpaid`.

### Worker death

Verify a dead claimant cannot approach/request payment, the earned claim/history is preserved, and the temporary death handling does not count as deliberate player non-payment. Household inheritance is explicitly deferred.

### Persistence / idempotency

Verify mixed assignment payment states survive save/load and repeated/stale Pay callbacks cannot debit any claim twice.

## Completion criteria

The implemented slice supports independently settling every worker assignment:

```text
one Work Contract
    ↓
multiple NPC assignments
    ↓
useful contribution tracked per assignment
    ↓
work ends
    ↓
per-assignment proportional payment claims
    ↓
NPCs keep living normally
    ↓
local encounter + bounded approach
    ↓
explicit Pay per claim
    ↓
exactly-once coin debit
    ↓
paid / unpaid outcome per assignment
    ↓
contract settlement completes when all claims are terminal
```

This closes the first physical employer/payment loop without inventing parallel AI, interaction, persistence, reputation, inheritance, or economy systems.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
