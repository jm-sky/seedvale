# Workforce for Hire

**Status:** concept / roadmap
**Domain:** `npc`, `quests-progression`, `economy`

## Overview

A world-level work contract system allowing the player to hire NPCs for temporary work. The player creates an offer, NPCs discover it through an in-world advertisement, evaluate it against their own situation, and may accept it. Accepted work becomes a real NPC commitment and uses the existing NPC decision/action systems.

The system should model employment as a world interaction, not as a player-only quest or a special companion mode.

One Work Contract represents one job against one authoritative world target. Individual hired NPC participation belongs to worker assignments under that contract, so multiple NPCs can work independently without creating parallel contracts for the same job.

## Core loop

```
player creates contract
        ↓
contract is advertised in the world
        ↓
one or more eligible NPCs evaluate the opportunity
        ↓
NPC assignments are created independently
        ↓
workers travel / perform useful work independently
        ↓
individual contributions are recorded
        ↓
individual payment claims become due
        ↓
player settles claims
```

The world target remains the sole owner of real work progress. Work Contracts own the job/commitment, while worker assignments own per-NPC participation, contribution and settlement state.

## Contract

A contract should contain, at minimum:

- issuer / employer: player
- work type
- target / object of work
- target location or entity
- requested worker count where multi-worker work is supported
- group work commitment / scope
- reward
  - coins
  - and/or items later
- lifecycle state
- advertisement state
- worker assignments
- aggregate accepted NPC contribution

The target should be a real world reference where practical, not an abstract quest-only identifier.

The contract reward should represent the frozen maximum price for the contracted group work commitment. It should not be multiplied by worker count. Individual worker claims should be derived from useful work actually accepted from that worker.

Examples:

- build a well at a flagged construction location
- protect the player
- accompany the player on an expedition
- hunt a specific animal
- later: gather, deliver, transport, repair, harvest, etc.

## Advertisement

A contract exists independently from its advertisement.

Possible advertisement surfaces:

- settlement notice board
- post / announcement board
- later other NPCs spreading information by conversation

The first implementation can use one simple settlement advertisement surface.

## NPC decision making

An NPC should not simply "accept a quest". It evaluates whether the work is worth doing.

Relevant factors include:

- current needs
- active problems and pressures
- goals
- profession / role
- personality / traits
- abilities / suitability
- current work commitments
- distance to the target
- estimated travel time
- estimated personal work share / duration
- opportunity cost
- expected reward
- safety / danger
- time of day
- household responsibilities
- existing relationship with the player
- player standing / reputation

The NPC should explicitly estimate the time commitment:

```
travel time + expected work time + return / follow-up time
```

For multi-worker contracts, a candidate should not assume it will personally perform the contract's full group commitment. Expected personal work and reward should reflect the shared remaining workload and available/fillable worker slots.

This estimate should influence the decision rather than being decorative information.

## AI integration

Do not introduce a separate NPC work AI.

The preferred direction is:

```
existing pressures
    +
work opportunity
    +
personality / role modifiers
    +
time / distance / reward
    ↓
existing NPC decision arbitration
    ↓
existing strategies / actions
```

A work contract should be an **opportunity / source of pressure**, not a new physiological need such as `NeedId = work`.

Existing `Needs.ts` pressure generation and `decisionModifiers.ts` provide a natural seam for this.

## Work execution

Accepted work should become a real NPC commitment.

Prefer reusing existing:

- navigation
- schedules / work
- action execution
- construction
- combat / hunting
- following / companion behaviour

Avoid separate implementations such as `ConstructionWorker`, `GuardWorker`, or `CompanionWorker`.

Different contract types should primarily provide different objectives and target requirements.

Multiple workers on the same contract should progress independently. One worker travelling, sleeping, fighting, abandoning the job or becoming unavailable must not pause the others. Worker-specific execution state belongs to assignments rather than one shared contract-level travelling/working state.

## Contract types

Potential types:

### Construction

NPCs build a specified structure at a specified location.

Example:

> Build a well here — 40 coins.

One contract may request several workers. They share one group work commitment and contribute to the same authoritative target progress alongside the Player.

### Guard

NPC protects the player, location, or another target for a defined period / task.

### Escort / Companion

NPC accompanies the player for an expedition or journey.

This should be a work contract rather than a separate permanent-companion system.

### Hunt

NPC hunts a specified animal or target.

The existing concept of binding objectives to a concrete animal instance is relevant here.

### Future

- gathering
- delivery
- transport
- harvesting
- repair
- resource collection
- temporary settlement work

## Payment

Payment should be a real transaction.

Payment belongs to the individual worker assignment/claim rather than one shared contract-level `PAYMENT_DUE` state.

Conceptually:

```
worker performs useful work
        ↓
assignment contribution recorded
        ↓
payment claim becomes due
        ↓
PAID / UNPAID
```

Different assignments on the same contract may therefore be in different work/payment states simultaneously.

A worker is owed only for useful work actually accepted from that worker. If the Player completes the target before NPCs fulfil the original group commitment, no synthetic contribution or payment obligation should be created for work that was never performed.

The player may not necessarily need to pay immediately.

An NPC waiting for payment is still part of the world and should retain the outstanding obligation across save/load.

## Delayed payment

NPC patience should depend on context.

Possible factors:

- sympathy / relationship with player
- player standing / reputation
- NPC needs
- urgency of the NPC's own financial situation
- personality
- size of the unpaid reward
- previous payment history

Example:

> A trusted NPC may wait several days for payment.

while:

> An NPC who urgently needs money may demand payment immediately.

This creates social behaviour rather than a binary quest timeout.

## Outstanding claims after worker death

Earned compensation is a persistent economic obligation and should not automatically disappear when the worker dies.

Future direction:

```
worker has earned unpaid compensation
        ↓
worker dies
        ↓
claim survives
        ↓
household may inherit the claim
        ↓
eligible household member may decide to pursue it
        ↓
payment / abandonment / other terminal outcome
```

Two concepts must remain distinct:

> **Ownership of a claim and the decision to pursue it are separate.**

A household inheriting an obligation should not imply that a family member automatically demands payment. Pursuing the claim should emerge from household/NPC context.

Relevant factors may include:

- size of the unpaid claim
- household shortages / economic need
- relationship with the deceased
- personality / traits of potential representatives
- effort, travel cost and practical chance of collection
- employer payment history / reputation
- time elapsed since the death

A spouse or close relative may often be a natural representative, but representation should not be a rigid fixed rule. Availability, relationships, household structure and character should matter.

If the current representative dies or becomes unavailable, the household may later choose another representative. If the household ceases to exist or no one is willing to pursue the claim, it may eventually become uncollectable/abandoned according to future rules.

A later implementation plan should determine whether transferable/inherited claims justify extracting payment obligations from `WorkContractAssignment` into a separate persistent economic claim concept. Do not create a parallel inheritance AI solely for Work Contracts; reuse household, relationship, death, pressure/decision and payment systems.

## Non-payment consequences

Failure to pay should have graduated consequences.

Possible progression:

```
payment due
    ↓
grace period
    ↓
overdue
    ↓
NPC / claimant reminder or complaint
    ↓
relationship penalty
    ↓
reputation / standing penalty
    ↓
refusal of future work
```

More severe or repeated non-payment can produce stronger reactions.

The consequence should not necessarily be an immediate global reputation penalty. Information should be able to spread socially later.

Several unpaid claims against the same employer may later combine into stronger household/social pressure while remaining distinct economic obligations.

## Reputation and sympathy

Use existing relationship / standing mechanisms where possible instead of creating parallel stores.

Relevant existing concepts include:

- per-NPC player relation / sympathy
- relation levels
- derived player standing

Work contracts can therefore become another source of positive or negative relationship changes.

Successful fair employment:

```
completion + payment
    → positive relationship / standing
```

Broken promise / non-payment:

```
unpaid claim
    → negative relationship
    → potentially lower player standing
```

Repeated behaviour can eventually affect whether NPCs are willing to work for the player.

## Social consequences

Future expansion can allow NPCs to remember and communicate employment experiences.

For example:

- "He pays on time."
- "Don't work for him."
- "He paid me extra."
- "He left me waiting for my money."
- "He still owes my family for the work my husband did."

This can connect contracts with:

- memory
- relationships
- dialogue
- reputation
- households
- local social networks

## Player-independent world behaviour

The contract system must not require the player or camera to be present for the world to continue.

Once accepted, NPCs should continue their commitments according to the simulation model, including while the player is elsewhere.

Hybrid/off-screen simulation may later reduce detail for remote contracts while preserving:

- contract state
- assignment state
- useful work contribution
- completion
- payment obligations
- claimant/beneficiary state where applicable
- meaningful failure

## Persistence

Contracts are world state, not temporary UI state.

Persistence will eventually need to cover at least:

- contract identity
- issuer
- work type
- target reference
- group work commitment
- reward
- contract state
- worker assignments
- per-worker contribution
- assignment/payment state
- relevant timestamps / deadlines if introduced
- outstanding payment claims
- claimant / beneficiary where applicable

A save/load during an unpaid claim must not lose the obligation.

## MVP direction

Keep the first implementation deliberately small, but preserve the architecture required by later multi-worker/payment behaviour.

The initial vertical slice is centered on construction Work Contracts:

1. player creates one construction work contract
2. contract references a real construction target
3. contract has a coin reward and frozen work commitment
4. contract is advertised at a settlement
5. eligible NPC discovers and evaluates it
6. NPC accepts and becomes an assignment
7. NPC travels to the target
8. NPC contributes through the existing construction mechanism
9. useful NPC contribution is recorded
10. payment becomes due for the worker's actual contribution
11. player pays the worker
12. claim becomes paid and the contract eventually settles

The architecture may then extend one contract to multiple independent worker assignments sharing the same target and group commitment.

Do not include all contract types, complex social propagation, item rewards, household inheritance/claim transfer, or a full employment UI in the first vertical slice unless required by the existing architecture.

## Architectural constraints

- Reuse existing NPC pressure/decision/action mechanisms.
- Do not create a parallel quest system.
- Do not create a parallel scheduler.
- Do not create a separate companion AI.
- Reuse existing target/object references where possible.
- Keep target progress authoritative on the world target.
- Keep the Work Contract authoritative for the job/group commitment.
- Keep worker-specific participation and contribution on assignments.
- Treat payment as a real economy transaction and individual claim.
- Keep employment compatible with off-screen simulation.
- Make consequences persistent and socially meaningful.
- Prefer deterministic evaluation with inspectable scores/modifiers.
- Preserve one Work Contract job per concrete target while allowing multiple worker assignments inside it.

## Open questions for future planning

Most foundational ownership questions are resolved by the current Work Contract plans. Remaining roadmap-level questions include:

- When should an earned payment obligation become independent from the originating worker assignment?
- Should transferable/inherited payment obligations become a separate persistent `PaymentClaim`-like concept?
- Under what conditions does a household inherit an unpaid worker claim?
- Which household member becomes the active representative/claimant?
- How should household needs, relationship to the deceased and personality affect the decision to pursue payment?
- What happens if the representative dies, leaves or becomes unavailable?
- What happens if the household dissolves or no eligible claimant remains?
- How should repeated unpaid claims against one employer affect future work acceptance and social reputation?
- How should reward valuation integrate with broader economy values as production/currency systems mature?
- How should future contract types estimate personal workload, risk and expected reward?

## Related systems

This concept should be evaluated against the existing:

- NPC needs and pressures
- NPC personality / decision modifiers
- NPC work and schedules
- NPC actions and navigation
- NPC death / corpse lifecycle
- households and family relationships
- player construction
- quests and objective target references
- economy / coins
- player-NPC relations / standing
- persistence
- companion / following behaviour
- settlement advertisements / notice boards
