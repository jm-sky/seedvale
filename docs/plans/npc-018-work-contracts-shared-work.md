# Plan: Work Contracts — Shared Work

**Created:** 2026-09-05
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** npc-015
**Domain:** `npc`
**Subdomains:** `work`
**Tags:** `work-contracts` `shared-work` `construction` `terrain-preparation`
**Roadmap:** -

## Goal

Extend Work Contracts so the player and a hired NPC can contribute work to the **same existing world task**.

Support two core scenarios:

1. The player starts work personally and later hires an NPC to help.
2. The player creates a task and Work Contract from the beginning, choosing what percentage of the remaining work should be performed by the NPC.

Initial supported targets:

- player-built well construction,
- terrain preparation.

The world target remains the authoritative owner of actual progress.

The Work Contract owns only the NPC's commitment to contribute a defined amount of work.

```text
                 WorkContract
                      │
                      │ target
                      ↓
                world work target
                      │
             authoritative progress
                ↑             ↑
             Player          NPC
```

Do not create separate NPC construction or terrain progress.

## Current state

The existing Work Contract construction vertical slice targets a real `PlayerWellRecord`.

This is the correct ownership direction:

```text
WorkContract
    ↓
PlayerWellRecord
    ↓
existing construction progress
```

Player and NPC already ultimately contribute to the same well construction state.

However:

- a construction contract currently creates a new well together with the contract,
- the player cannot hire an NPC for an already-started well,
- a contract has no concept of partial NPC work commitment,
- construction completion currently drives `working → payment_due`,
- terrain preparation is not yet a Work Contract target.

Terrain preparation already has an authoritative incremental record with `requiredWork`, `completedWork`, `originalHeights` and `targetHeight`.

Reuse these mechanisms rather than introducing parallel work systems.

## 1. Shared work principle

Work belongs to the world target, not to the actor or contract.

```text
world target
    ↓
remaining useful work
    ↓
Player and/or NPC contribute
    ↓
same authoritative progress
```

Actor-specific systems remain separate.

Player owns controls, busy/time-skip behavior, vigor, XP, UI feedback and player capability checks.

NPC owns decisions, needs, navigation, interruptions, work bouts and animation.

The world target owns required work, completed work, stages where applicable and completion.

Do not create a dedicated co-op construction manager.

## 2. Contract for an existing target

Allow the player to create a Work Contract for an unfinished supported work target.

Example:

```text
player places well
    ↓
player works
    ↓
well partially complete
    ↓
Hire help
    ↓
WorkContract references same well
```

Creating the contract must not:

- create another target,
- reset progress,
- duplicate construction state,
- replace the existing target identity.

The same rule applies to an active terrain-preparation task.

## 3. Contract created together with a new target

Preserve the current flow where the player can create work specifically to be advertised.

For construction:

```text
place unfinished well
    ↓
create WorkContract referencing it
```

For terrain preparation:

```text
create TerrainPreparationRecord
    ↓
create WorkContract referencing it
```

The target must exist independently of the contract.

If no NPC accepts the contract, the player must still be able to perform the work personally.

Do not create contract-only placeholder work targets.

## 4. NPC work share

When creating a Work Contract, allow the player to choose what percentage of the target's remaining work the NPC should perform.

Initial presets:

```text
25%
50%
75%
100%
```

The percentage means:

> percentage of useful work remaining at the moment the contract is created.

Example:

```text
total work = 10h
already completed = 4h
remaining = 6h

NPC share = 50%

NPC commitment = 3h
```

For a fresh target, remaining work equals total work.

Use the same rule whether the NPC is hired immediately or after the player has already started working.

## 5. Work commitment snapshot

The contract must snapshot its work obligation when created.

Conceptually persist:

```text
requestedWorkShare
remainingWorkAtCreation
committedWork
npcWorkCompleted
```

Where:

```text
committedWork = remainingWorkAtCreation × requestedWorkShare
```

This snapshot must not later be recalculated because:

- the player contributes more work,
- the NPC contributes work,
- the target changes stage,
- the NPC accepts later,
- the game is saved and loaded.

The contract represents the work originally offered.

## 6. Target progress and NPC contribution are separate

Keep target progress and `npcWorkCompleted` distinct.

Only work actually accepted by the target counts toward `npcWorkCompleted`.

Do not infer NPC contribution from changes in total target progress.

## 7. NPC completes its agreed share

The NPC does not automatically become responsible for completing the whole target.

If:

```text
npcWorkCompleted >= committedWork
```

the NPC has fulfilled the work agreement.

Then:

```text
working
    ↓
payment_due
```

even if the world target remains unfinished.

The player may continue working or create another contract for remaining work after the previous contract becomes terminal.

Do not silently expand the NPC's commitment.

## 8. Target completes before NPC commitment

The player may finish the real target before the NPC fulfils the complete contractual quota.

No useful work remains, so the NPC must stop contractual work.

The contract should leave `working` through the existing payment flow rather than generating synthetic work to fill the quota.

This plan does **not** define proportional rewards, reduced wages or new payment calculations. Those semantics belong to a separate payment plan.

The rule here is only:

```text
completed world target
→ no more contractual work
```

## 9. One active contract per target

For this phase, enforce at most one non-terminal Work Contract per work target.

This avoids overlapping commitments from multiple workers while the player may also contribute.

Multiple workers and work crews remain future work.

Once the current contract becomes terminal, another contract may be created for remaining work if the target is still unfinished.

## 10. Extend Work Contract target types

Extend the existing target union rather than creating a separate contract subsystem.

Support:

```text
construction
terrain_preparation
```

Initial construction target remains `PlayerWellRecord`.

Do not generalize construction to additional buildables in this plan. That belongs to a follow-up plan for incremental construction of additional player-built objects.

## 11. Target-specific work resolution

Keep target-specific logic in the domains that already own it.

Work Contracts need only narrow reusable operations conceptually equivalent to:

```text
resolve target
get target position
get remaining work
contribute useful work
check completion
```

Do not put well stages or terrain deformation rules directly inside `NpcAgent` or generic Work Contract state.

Prefer small functions/resolvers over a general-purpose `WorkTargetManager`.

## 12. Well remaining-work calculation

A well is multi-stage. Remaining-work calculation must represent **all useful construction work still required**, not only the unfinished work of the current stage.

Use the existing well construction rules as the authority for stage requirements.

Do not duplicate work-duration constants in Work Contracts.

## 13. Shared well construction

Preserve the current actor-neutral well construction direction.

Player and NPC must modify the same `PlayerWellRecord` and reuse the existing shared construction rules for active stage, stage transition, material requirements and completion.

Actor-specific work timing may remain different.

Do not introduce contract-specific well progress.

## 14. Terrain preparation target

Allow an active `TerrainPreparationRecord` to be referenced by a Work Contract.

Example:

```text
create terrain preparation
    ↓
player performs 30%
    ↓
Hire help
    ↓
choose NPC 50% of remaining work
    ↓
NPC contributes to same record
```

The existing `requiredWork` and `completedWork` remain authoritative.

Do not create `ContractTerrainProgress`, `NpcTerrainPreparation` or equivalent duplicated state.

## 15. Actor-neutral terrain contribution

The current terrain preparation progression is primarily owned by the player action flow.

Extract the smallest reusable world/domain mutation needed so an NPC can contribute represented work to the same preparation.

Conceptually:

```text
contributeTerrainPreparationWork(preparationId, workAmount)
```

The shared seam should handle world-state concerns such as:

- clamping accepted work,
- updating `completedWork`,
- deriving progressive heights,
- applying terrain changes,
- reporting actual accepted work,
- reporting completion.

Player-specific time skip, vigor, XP, UI and controls remain outside.

NPC-specific decisions, travel, needs and animation remain outside.

## 16. Terrain completion lifecycle

A completed terrain preparation currently disappears from the active preparation registry.

Target resolution must therefore distinguish successful completion from missing/invalidation.

The final work contribution should report completion explicitly before or while the active preparation is removed.

Do not treat `terrainPreparations.find(id) === undefined` as sufficient evidence that the task completed.

Avoid introducing permanent completed-preparation records solely for Work Contracts unless required by the existing architecture.

## 17. NPC contract execution

Reuse the existing lifecycle:

```text
advertised
    ↓
accepted
    ↓
travelling
    ↓
working
```

When working:

```text
perform NPC work bout
    ↓
target accepts useful work
    ↓
target progress changes
    ↓
npcWorkCompleted += actual accepted work
```

Do not credit contract contribution when work is blocked, target already completed, target is invalid, or zero useful work was accepted.

After every contribution evaluate whether the commitment is fulfilled or the target is complete. Either condition ends the contractual work phase.

## 18. Player remains free to work

An accepted contract must not lock the target for the player.

Player and NPC may contribute sequentially to the same authoritative state.

No frame-level concurrency mechanism is required.

Avoid assumptions that construction progress can only come from the local player; this keeps the seam usable for possible future multiplayer.

## 19. Work target position

NPC travel must resolve destination from the authoritative target, for example the well coordinates or terrain-preparation center.

Do not use the contract flag as the permanent authority for where work takes place.

The physical contract marker remains presentation/interaction state.

## 20. Contract creation UI

For supported unfinished targets, provide a way to create a help contract.

Conceptually:

```text
unfinished target
    ↓
Hire help
    ↓
choose work share
    ↓
choose reward
    ↓
create contract
    ↓
post at notice board
```

Reuse existing interaction, dialog and Work Contract posting surfaces where practical.

Do not create a workforce-management screen.

## 21. Existing new-contract flow

Update the current Work Contract creation flow so it uses the same work-share model.

For a new well contract, place a real unfinished well, choose NPC share and reward, and then post the contract.

The player may begin working on the well before an NPC accepts.

The target must not become NPC-exclusive because it originated from a contract.

## 22. NPC evaluation

Contract evaluation should use `committedWork`, not automatically the full target remaining work.

Continue to reuse existing evaluation factors such as reward, travel time, work duration, current needs, pressures, suitability and existing commitments.

Do not create separate evaluation logic for shared work.

## 23. Persistence

Persist enough state to restore the contract deterministically:

```text
target kind/id
requestedWorkShare
remainingWorkAtCreation
committedWork
npcWorkCompleted
worker
contract lifecycle
```

The underlying targets remain persisted by their existing systems.

After save/load:

- contract still references the same target,
- target progress remains authoritative,
- NPC commitment stays unchanged,
- player progress does not recalculate the commitment,
- NPC contribution is not duplicated,
- completed targets do not regain useful work.

Follow existing persistence compatibility conventions for old saves.

## 24. Failure and invalidation

Handle at minimum:

- target removed or completed before posting,
- target removed or completed before acceptance,
- target removed or completed while NPC travels,
- target completed while NPC is interrupted,
- target invalidated during work,
- NPC becomes unavailable or dies.

Do not leave impossible contracts indefinitely in `travelling` or `working`.

Reuse existing contract invalidation/release mechanisms where their semantics fit.

## 25. Debuggability

Extend existing diagnostics where practical to expose:

```text
target kind/id
target remaining work
requestedWorkShare
remainingWorkAtCreation
committedWork
npcWorkCompleted
target progress
worker
contract state
```

Add useful JSDoc to new architectural/public functions, especially remaining-work resolvers, shared work-contribution seams and target resolution. Use appropriate `@domain` tags.

Do not add a dedicated Work Contracts debug UI.

## Non-goals

Do not implement:

- new payment semantics,
- proportional reward calculation,
- partial payment rules,
- multiple NPC workers on one target,
- work crews,
- multiple simultaneous contracts for one target,
- new construction types beyond the existing well,
- incremental palisade construction,
- incremental standing-torch construction,
- settlement building construction,
- house construction,
- road construction,
- hauling contracts,
- gathering contracts,
- farming contracts,
- repair contracts,
- negotiation,
- dynamic renegotiation of work share.

Additional player-buildable construction targets belong to the follow-up construction plan.

## Verification

### Existing well — hire help later

1. Player places a well.
2. Player performs part of the work.
3. Player selects Hire help.
4. Contract references the existing well.
5. No second well is created.
6. Player chooses e.g. 50% of remaining work.
7. Contract snapshots remaining work and NPC commitment.
8. Contract is posted and accepted.
9. NPC reaches the same well.
10. NPC contributes work.
11. Player can continue contributing work.
12. Both modify the same `PlayerWellRecord`.

### Contract from the beginning

1. Player creates a new well contract.
2. A real unfinished well target is created.
3. Player chooses the NPC work share.
4. Contract is posted.
5. Before acceptance, player can already work on the well.
6. NPC later accepts.
7. NPC's committed amount does not change because the player worked meanwhile.
8. Both continue using the same target.

### NPC completes its share first

For remaining work of 6h and NPC share 50%, verify that after the NPC contributes 3h the contract reaches `payment_due` even if the well remains unfinished.

The player can finish the remainder later.

### Player completes target first

If the NPC has not fulfilled the whole commitment but the player finishes the target, verify that:

- NPC stops working,
- no synthetic work is generated,
- target stays completed,
- contract exits the working phase,
- payment calculation is not changed by this plan.

### Terrain preparation — hire help later

1. Player creates terrain preparation.
2. Player partially progresses it.
3. Player creates a help contract for that preparation.
4. NPC share is calculated from current remaining work.
5. NPC accepts and reaches the same area.
6. NPC contributes to the same `completedWork`.
7. Player may continue contributing.
8. Terrain deformation reflects combined total progress.
9. Final completion is observed correctly before active preparation removal.

### One contract per target

Verify that an unfinished target with an existing non-terminal contract cannot receive another contract.

After the first contract becomes terminal, creating another contract for still-unfinished work is allowed.

### Persistence

Verify save/load during:

- partially completed well before hiring,
- active terrain preparation before hiring,
- advertised shared-work contract,
- accepted/travelling contract,
- partially completed NPC commitment,
- player and NPC both having contributed.

After load, target identity, target progress, committed work and NPC contribution remain unchanged and no duplicate progress is applied.

## Completion criteria

The system supports:

```text
PLAYER STARTS FIRST

real work target
    ↓
Player works
    ↓
Hire help
    ↓
choose NPC share
    ↓
post contract
    ↓
NPC accepts
    ↓
Player + NPC contribute
    ↓
NPC commitment fulfilled
OR
target completed
    ↓
existing payment flow
```

and:

```text
HIRE FROM START

create real target + contract
    ↓
choose NPC share
    ↓
post contract
    ↓
Player may already work
    ↓
NPC accepts
    ↓
Player + NPC contribute
```

for well construction and terrain preparation.

The result establishes a reusable shared-work pattern where **the task belongs to the world and actors contribute to it**, without introducing a parallel NPC construction or terrain system.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
