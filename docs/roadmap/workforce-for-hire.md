# Workforce for Hire

**Status:** concept / roadmap
**Domain:** `npc`, `quests-progression`, `economy`

## Overview

A world-level work contract system allowing the player to hire NPCs for temporary work. The player creates an offer, NPCs discover it through an in-world advertisement, evaluate it against their own situation, and may accept it. Accepted work becomes a real NPC commitment and uses the existing NPC decision/action systems.

The system should model employment as a world interaction, not as a player-only quest or a special companion mode.

## Core loop

```
player creates contract
        ↓
contract is advertised in the world
        ↓
eligible NPC evaluates the opportunity
        ↓
NPC accepts or rejects
        ↓
NPC travels / performs the work
        ↓
contract becomes completed
        ↓
payment becomes due
        ↓
player pays
```

## Contract

A contract should contain, at minimum:

- issuer / employer: player
- work type
- target / object of work
- target location or entity
- reward
  - coins
  - and/or items
- expected effort / duration
- lifecycle state
- payment state

The target should be a real world reference where practical, not an abstract quest-only identifier.

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
- estimated work duration
- opportunity cost
- reward value
- safety / danger
- time of day
- household responsibilities
- existing relationship with the player
- player standing / reputation

The NPC should explicitly estimate the time commitment:

```
travel time + work time + return / follow-up time
```

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

## Contract types

Potential types:

### Construction

NPC builds a specified structure at a specified location.

Example:

> Build a well here — 40 coins.

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

After work completion:

```
COMPLETED
    ↓
PAYMENT_DUE
    ↓
PAID
```

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
NPC reminder / complaint
    ↓
relationship penalty
    ↓
reputation / standing penalty
    ↓
refusal of future work
```

More severe or repeated non-payment can produce stronger reactions.

The consequence should not necessarily be an immediate global reputation penalty. Information should be able to spread socially later.

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
unpaid contract
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

This can connect contracts with:

- memory
- relationships
- dialogue
- reputation
- local social networks

## Player-independent world behaviour

The contract system must not require the player or camera to be present for the world to continue.

Once accepted, an NPC should continue the commitment according to the simulation model, including while the player is elsewhere.

Hybrid/off-screen simulation may later reduce detail for remote contracts while preserving:

- contract state
- estimated progress
- completion
- payment obligation
- meaningful failure

## Persistence

Contracts are world state, not temporary UI state.

Persistence will eventually need to cover at least:

- contract identity
- issuer
- work type
- target reference
- reward
- state
- accepted NPC
- progress / completion
- payment status
- relevant timestamps / deadlines if introduced
- outstanding obligations

A save/load during an unpaid contract must not lose the obligation.

## MVP direction

Keep the first implementation deliberately small.

Suggested first vertical slice:

1. player creates one construction work contract
2. contract has a target construction location
3. contract has a coin reward
4. contract is advertised at a settlement
5. eligible NPC discovers it
6. NPC evaluates reward + distance + estimated time + basic needs/personality/role factors
7. NPC accepts or rejects
8. accepted NPC travels to the target
9. NPC uses the existing construction mechanism
10. contract becomes payment due
11. player pays the NPC
12. payment completes the contract

Do not include all contract types, complex social propagation, deadlines, item rewards, or a full employment UI in the first vertical slice unless required by the existing architecture.

## Architectural constraints

- Reuse existing NPC pressure/decision/action mechanisms.
- Do not create a parallel quest system.
- Do not create a parallel scheduler.
- Do not create a separate companion AI.
- Reuse existing target/object references where possible.
- Keep contract state authoritative and explicit.
- Treat payment as a real economy transaction.
- Keep employment compatible with off-screen simulation.
- Make consequences persistent and socially meaningful.
- Prefer deterministic evaluation with inspectable scores/modifiers.

## Open questions for implementation planning

- Where should authoritative `WorkContract` state live?
- Should contracts be owned globally by the world or by a settlement/economy subsystem?
- How should advertisements reference contracts?
- How should an NPC discover eligible advertisements without scanning every contract?
- What existing construction API can execute the first contract?
- How should NPC time estimation be represented?
- How should reward valuation interact with existing economy values?
- What existing player relation/standing API should be used for payment patience?
- Which state must be persisted in the first stage?
- How should accepted contracts interact with an NPC's existing scheduled work?
- What happens when the target disappears, becomes invalid, or the player cancels the contract?
- What happens if the NPC dies or becomes unable to finish the contract?

## Related systems

This concept should be evaluated against the existing:

- NPC needs and pressures
- NPC personality / decision modifiers
- NPC work and schedules
- NPC actions and navigation
- player construction
- quests and objective target references
- economy / coins
- player-NPC relations / standing
- persistence
- companion / following behaviour
- settlement advertisements / notice boards
