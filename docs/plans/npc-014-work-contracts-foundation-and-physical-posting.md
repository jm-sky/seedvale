# Plan: Work Contracts — Foundation & Physical Posting

**Created:** 2026-09-01
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** none
**Domain:** `npc`
**Roadmap:** `workforce-for-hire.md`

## Goal

Build the persistent foundation for the **Workforce for Hire** system.

The player can create a work contract for a concrete world location, then physically take its announcement to a settlement and post it on a physical notice board.

This phase does not implement NPC discovery, work acceptance, construction execution, or payment. It establishes the real world-state and physical publication flow those later phases will consume.

## Scope

### 1. Recon existing mechanisms

Before implementation, inspect and reuse existing mechanisms for player construction/targets, world objects/interactables, flags/markers, settlement objects, item pickup/carrying, interaction, persistence/SaveData, world entity IDs/references, and cancellation/invalidation.

Do not create parallel marker, interaction, entity-reference, or persistence mechanisms.

### 2. WorkContract authoritative state

Introduce `WorkContract` as persistent world state.

Minimum data:
- contract ID
- issuer/employer
- work type
- target reference
- target location
- reward in coins
- lifecycle state
- advertisement state
- relevant timestamps

First work type: `construction`.

Design the lifecycle so later phases can extend it:

```
available
    ↓
advertised
    ↓
accepted
    ↓
travelling
    ↓
working
    ↓
payment_due
    ↓
completed
```

Only `available` and `advertised` are activated in this phase. Cancellation/invalidation must be representable as terminal states.

### 3. Target reference

A contract must reference a concrete world target. Do not represent it only as a string such as "build a well".

The reference must be recoverable after save/load and reusable by later NPC construction execution.

Reuse existing world/entity reference mechanisms where possible.

### 4. Contract creation

Add the minimum player flow for creating a construction contract.

The player specifies:
- construction target/location
- reward in coins

Creating the contract:
- creates authoritative `WorkContract` state
- creates the contract flag at the target
- prepares an announcement for physical posting
- does not automatically advertise the contract
- does not assign an NPC

Initial state:

```
contract = available
advertisement = not_posted
```

### 5. Contract flag

Create a physical flag/marker at the contract target.

The flag:
- exists in the world
- references the `WorkContract`
- identifies the target location
- is visible to the player
- does not own authoritative contract state

When the contract is cancelled or invalidated, the flag must be removed or deactivated.

The mechanism should be reusable later for other target-based contract types.

### 6. Settlement notice board

Add a physical notice-board object associated with a settlement.

Example:

```
Briarwood
Notice Board
```

It must be a real world object with:
- world location
- settlement ownership/reference
- player interaction
- support for posted announcements

The first phase only needs Work Contract announcements.

### 7. Physical announcement

Creating a contract must **not** automatically publish it.

The player must:
1. create the contract
2. obtain/take its announcement
3. travel to a settlement
4. interact with the notice board
5. physically post the announcement

Only then does the contract become advertised.

Use existing item/carry/interaction mechanisms where practical. Do not create a parallel inventory system merely for announcements.

### 8. Advertisement state

Keep the contract and advertisement as separate concepts.

The contract is authoritative work state. The advertisement represents publication of that contract at a particular notice board.

Minimum advertisement state:
- `not_posted`
- `posted`

A posted advertisement should reference the contract rather than duplicate authoritative contract data.

Store the board identity/location needed to know where the contract is advertised.

### 9. Notice board interaction

The notice board interaction must allow the player to post an available contract.

After successful posting:
- advertisement references the contract
- advertisement records the board
- contract becomes `advertised`

Do not implement NPC reading/discovery yet.

### 10. Cancellation and invalid targets

When the player cancels a contract:
- mark it cancelled
- remove/deactivate its target flag
- remove/deactivate its advertisement
- prevent later posting

If the target no longer exists or becomes invalid:
- prevent the contract from remaining active
- remove/deactivate the target flag
- remove/deactivate any advertisement

Avoid orphaned flags or advertisements.

### 11. Persistence

Persist the contract as world state.

At minimum:
- contract ID
- issuer
- work type
- target reference
- target location
- reward
- lifecycle state
- advertisement state
- posted board reference
- relevant timestamps

After loading, restore the contract, target reference, contract flag, advertisement state, and notice-board relationship.

Required scenarios:
- create → save → load
- create → post → save → load

### 12. Ownership and separation of concerns

Keep responsibilities separated:

```
WorkContract
    authoritative contract data

Advertisement
    physical publication state

Contract Flag
    world representation of the target

Notice Board
    physical publication point
```

Avoid:
- a Workforce God Object
- duplicated target state
- a parallel quest system
- a parallel interaction framework
- contract state hidden inside visual objects

Add JSDoc with `@domain npc` to important new architectural/public classes and functions where useful for preflight discovery.

## Non-goals

Do not implement:
- NPC contract discovery/evaluation/acceptance
- NPC navigation or construction execution
- NPC needs during work
- food/water preparation
- payment or payment requests
- sympathy/reputation consequences
- Guard/Hunt/Escort contracts
- item rewards
- deadlines

The model must remain extensible for later phases.

## Verification

### Contract creation
1. Create a construction contract.
2. Verify stable ID, valid target, and target flag.
3. Verify state is `available`.
4. Verify it is not advertised.

### Physical posting
1. Obtain the announcement.
2. Travel to a settlement.
3. Find its physical notice board.
4. Interact with it.
5. Post the announcement.
6. Verify the board references the contract.
7. Verify the contract becomes `advertised`.

### Persistence
Verify save/load before and after posting, with the flag and target reference intact.

### Cancellation
Verify cancellation before and after posting. No active flag or advertisement should remain.

### Invalid target
Verify target invalidation cannot leave an active orphaned contract, flag, or advertisement.

## Completion criteria

The player can:

```
create contract
      ↓
contract flag appears at target
      ↓
take physical announcement
      ↓
travel to settlement
      ↓
physically post announcement
      ↓
contract becomes advertised
      ↓
save/load preserves the state
```

without NPC AI or automatic publication.

The foundation is ready for **Plan 2 — NPC Work Contracts & Construction**.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
