# Plan: Work Contracts — NPC Work & Construction

**Created:** 2026-09-01
**Status:** `planned` 📋
**Priority:** medium · **Effort:** L
**Depends on:** npc-014
**Domain:** `npc`
**Roadmap:** `workforce-for-hire.md`

## Goal

Connect `WorkContract` to the existing NPC simulation.

An NPC can discover an advertised construction contract through a settlement notice board, evaluate it against its own situation, accept it as a commitment, travel to the target, and perform the existing construction workflow.

During the contract, the NPC remains a normal inhabitant of the world. Needs, pressures, routines, and higher-priority decisions continue to operate.

After construction completes, the contract becomes `payment_due`. Payment itself belongs to `npc-016`.

## Architectural principles

Do not create a separate Workforce AI, scheduler, construction pipeline, or needs system.

Use:

```
contract opportunity
    +
existing NPC state / pressures
    ↓
existing decision system
    ↓
commitment
    ↓
existing navigation + actions
    ↓
existing construction system
```

The contract is an **NPC commitment**, not a replacement for the NPC activity/decision system.

A commitment to complete work must not prevent urgent needs or higher-priority world reactions.

## 1. Recon existing NPC mechanisms

Before implementation, inspect and reuse the existing mechanisms for:

- needs and pressures,
- goals and strategies,
- decision arbitration,
- work/routines,
- commitments,
- navigation,
- construction,
- interruption/resumption,
- NPC inventory/equipment,
- food/water consumption,
- world-item discovery/pickup,
- persistence.

Do not add new mechanisms where existing systems can express the behaviour.

## 2. Contract discovery

NPCs should be able to discover contracts that have been physically posted on a settlement notice board.

The important rule is:

```
not posted → not discoverable
posted     → potentially discoverable
```

Do not require a specific implementation such as a special “read board” AI action if existing perception/routine mechanisms provide a better fit.

Reuse existing world-object discovery, routines, or perception mechanisms.

An NPC must not globally receive every contract in the world.

## 3. Candidate evaluation

A discovered contract becomes a decision opportunity, not an automatic assignment.

Evaluate at least:

- reward,
- estimated travel time,
- estimated work duration,
- distance/cost,
- current needs,
- active pressures,
- suitability/ability,
- existing commitments,
- relevant household responsibilities where supported.

Conceptually:

```
reward
+ suitability
+ relevant current pressure
- travel cost
- work duration
- conflicting commitments
        ↓
existing NPC decision
```

Do not introduce a fixed threshold such as “reward > X”.

Candidate status does not need to become a persistent contract state. It may simply be the result of NPC evaluation.

The evaluation should be deterministic and sufficiently inspectable for debugging.

## 4. Time estimation

The NPC must consider the time cost before accepting the contract.

Minimum:

```
estimated travel time
+
estimated construction duration
```

Reuse existing travel and construction duration estimates.

If an estimate is missing, add the smallest reusable mechanism necessary rather than creating a contract-specific estimator.

Time must materially influence the NPC decision.

Future factors such as deadlines, return travel, danger, equipment, and household duties remain outside this phase unless already supported by existing systems.

## 5. Acceptance and commitment

After the NPC chooses the opportunity:

```
advertised
    ↓
accepted
```

The contract is assigned to that NPC.

The NPC receives a persistent commitment to the contract, while its normal decision/activity system remains responsible for deciding what it is doing at any moment.

Prevent conflicting simultaneous work commitments.

Do not create a second scheduler.

## 6. Travel to the work target

The NPC travels to the contract target using existing navigation.

The destination must derive from the authoritative contract target / flag rather than a duplicated location stored in another subsystem.

Conceptually:

```
accepted
   ↓
travelling
   ↓
contract target / flag
```

The NPC may temporarily leave the route or work activity to satisfy a higher-priority need, using existing interruption behaviour.

## 7. Construction execution

At the target, use the existing construction pipeline.

The contract defines:

- what should be built,
- where it should be built,
- who is responsible.

The existing construction system remains responsible for the actual construction.

Flow:

```
travelling
   ↓
target reached
   ↓
existing construction action
   ↓
construction completed
```

On completion:

```
working → payment_due
```

No payment is performed in this phase.

## 8. Needs during the contract

A work contract must not suspend normal NPC needs.

During travel and work, the NPC continues to respond to existing:

- hunger,
- thirst,
- fatigue,
- other needs/problems.

Existing pressure/decision arbitration should determine when a need temporarily outranks the work commitment.

Example:

```
working
   ↓
critical hunger
   ↓
higher-priority need
   ↓
pause work
   ↓
satisfy need
   ↓
resume contract
```

The contract is therefore a commitment, not an unconditional activity lock.

## 9. Food and water logistics

Do not create a special worker provisioning system in this phase.

First reuse whatever the current NPC/item systems already provide.

Before adding anything, verify:

- whether NPCs already carry water,
- whether a flask/waterskin exists,
- whether NPCs can consume carried water,
- whether food can be discovered in the world,
- whether NPCs can pick up food items,
- whether NPCs can consume food found on the ground.

For example, if the existing generic systems support it:

```
apple on ground
    ↓
hungry NPC
    ↓
existing food discovery
    ↓
pickup
    ↓
consume
```

Do not create `ContractFoodSupply`, `WorkerNeedsManager`, or equivalent parallel systems.

If the current simulation cannot support a useful water/food scenario, document the gap rather than expanding this plan into a general food-logistics feature.

## 10. Re-evaluation after acceptance

Acceptance must not guarantee completion.

The NPC's situation can change while travelling or before work starts.

For example:

```
accept
   ↓
long travel
   ↓
needs / commitments / world state change
   ↓
re-evaluate
   ↓
continue OR abandon
```

Use the existing decision/pressure mechanisms where possible.

A temporary interruption caused by a need is not contract abandonment.

If the NPC can no longer reasonably fulfil the commitment, the contract must enter an explicit failure/cancellation path rather than remaining indefinitely in `travelling` or `working`.

Do not implement advanced employer penalties in this phase.

## 11. Work completion

When the existing construction pipeline confirms completion:

```
working
   ↓
payment_due
```

Record the NPC as the worker awaiting payment.

Do not transfer coins automatically.

Do not mark the contract `completed`.

`payment_due` is the integration point for `npc-016`.

## 12. Failure safety

Handle basic failure cases:

- target disappears,
- target becomes invalid,
- construction cannot start,
- construction becomes impossible,
- NPC becomes unavailable,
- NPC dies.

The system must not leave an impossible contract permanently stuck in:

```
travelling
working
```

Reuse existing failure/cancellation patterns.

## 13. Persistence

Extend the persistence introduced by `npc-014` with NPC-side contract state.

Persist enough information to restore:

- accepted NPC,
- contract commitment,
- current contract stage,
- relevant timestamps,
- failure/abandonment state where applicable.

Verify:

```
accepted → save/load
travelling → save/load
working → save/load
payment_due → save/load
```

After reload, the NPC must still understand that it has an outstanding work commitment.

## 14. Debuggability

Use existing debug tooling where possible to expose enough information to understand:

- discovered contract,
- evaluation result,
- main evaluation factors,
- estimated travel/work time,
- acceptance/rejection,
- current contract stage,
- interruption reason,
- re-evaluation/abandonment reason,
- construction completion.

Do not create a dedicated debug UI if existing diagnostics can be extended.

## Non-goals

Do not implement:

- payment interaction,
- NPC asking the player for payment,
- payment throttling,
- payment timeout/patience,
- insufficient funds,
- sympathy/reputation consequences,
- item rewards,
- Guard contracts,
- Hunt contracts,
- Companion/Escort contracts,
- negotiation,
- NPC competition,
- advanced worker provisioning.

## Verification

### Discovery

1. Create and physically post a contract using `npc-014`.
2. Verify an NPC can discover the posted contract.
3. Verify an unposted contract is not discoverable.
4. Verify NPCs do not receive every contract globally.

### Decision

Verify that:

- attractive rewards can affect acceptance,
- low rewards can lead to rejection,
- distance affects attractiveness,
- long work duration affects attractiveness,
- current needs affect the decision,
- existing commitments affect the decision,
- suitability affects the decision.

### Acceptance and travel

1. NPC accepts a contract.
2. Contract records the NPC.
3. NPC travels toward the target.
4. Destination comes from the contract target/flag.
5. Conflicting work commitments are prevented.

### Construction

1. NPC reaches the target.
2. NPC uses the existing construction pipeline.
3. Construction completes.
4. Contract becomes `payment_due`.
5. No automatic payment occurs.

### Needs

During a sufficiently long contract verify:

- hunger continues to change,
- thirst continues to change,
- fatigue continues to change,
- urgent needs can interrupt work,
- NPC resumes the commitment afterward where appropriate,
- available world food is handled through existing generic mechanisms,
- the work commitment cannot cause the NPC to ignore critical needs.

### Re-evaluation

Verify that a major change in NPC circumstances can cause the NPC to continue or abandon the commitment rather than blindly completing it.

Verify that temporary need interruption does not unnecessarily abandon the contract.

### Failure

Verify invalid targets and unavailable/dead workers do not leave permanently stuck contracts.

### Persistence

Verify accepted, travelling, working, and payment_due states survive save/load with the NPC commitment intact.

## Completion criteria

The system supports:

```
advertised contract
        ↓
NPC discovers
        ↓
NPC evaluates
        ↓
NPC accepts
        ↓
NPC commits
        ↓
NPC travels to target
        ↓
NPC handles normal needs
        ↓
NPC performs construction
        ↓
construction completed
        ↓
payment_due
```

The NPC remains an autonomous inhabitant rather than becoming a special-purpose worker agent.

The implementation is ready for **npc-016 — Work Contracts: Payment & Employer Interaction**, which will close the economic loop.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
