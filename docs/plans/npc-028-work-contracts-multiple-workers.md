# Plan: Work Contracts — Multiple Workers

**Created:** 2026-09-08
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** ~~npc-018~~
**Domain:** `npc`
**Subdomains:** `work` `behavior`
**Tags:** `work-contracts` `multiple-workers` `construction`
**Roadmap:** -

## Goal

Extend one advertised Work Contract so it can hire **1+ NPCs** for the same authoritative world target.

Initial UX supports:

```text
1 worker
2 workers
3 workers
```

but runtime/data uses a general:

```ts
requestedWorkerCount: number
```

with domain validation `>= 1`, not a hard-coded maximum of three.

The target remains the sole owner of real progress. Multiple NPCs and the Player contribute through the existing actor-neutral target seam.

```text
                    WorkContract
                         │
                 multiple assignments
                  ↙      ↓      ↘
               NPC A   NPC B   NPC C
                  \      |      /
                   \     |     /
                    world target
                         ↑
                       Player
```

Do not create one contract/progress record per worker and do not create target-specific crew systems.

## Current state

`src/world/workContract.ts` currently assumes one worker:

- `workerNpcId` is the sole assignment authority,
- `acceptedAt` and `workStartedAt` are contract-level,
- `accepted → travelling → working → payment_due` mirrors one worker,
- acceptance closes the posting after one NPC,
- release affects that one worker,
- `npcWorkCompleted` is aggregate but currently receives work from one assignment.

`npc-018` correctly established:

```text
WorkContract
    ↓
ContractTarget
    ↓
world target owns progress
```

This plan changes worker participation, not target ownership.

## 1. Separate contract from worker assignment

Do not replace `workerNpcId` with only `workerNpcIds: string[]`.

Introduce an explicit assignment concept equivalent to:

```ts
type WorkContractAssignment = {
  npcId: string
  state: WorkContractAssignmentState
  acceptedAt: number
  workStartedAt: number | null
  workCompleted: number
}
```

Ownership:

```text
WorkContractRecord
    owns job / target / commitment / reward / posting

WorkContractAssignment
    owns one NPC's execution / contribution lifecycle
```

Do not duplicate assignment ownership on `NpcAgent`. NPCs continue resolving participation through Work Contracts authority.

## 2. Independent worker lifecycle

Each assignment progresses independently.

Conceptually:

```text
accepted
→ travelling
→ working
→ payment_due / released
```

`npc-016` later extends payment-side terminal outcomes such as `paid` / `unpaid`.

Mixed states are valid:

```text
NPC A = working
NPC B = travelling
NPC C = accepted
```

One worker sleeping, fighting, path-blocked, interrupted, released or dead must not pause or rewind others.

Do not add a synchronized crew FSM, foreman or coordinator.

## 3. Contract-level lifecycle becomes coarse

Worker execution state must no longer live on one shared contract state.

Use a coarse aggregate contract lifecycle conceptually equivalent to:

```text
available / advertised
→ active
→ settling
→ completed
```

while preserving existing `cancelled` / `invalidated` semantics.

Exact names may follow implementation recon, but invariants are required:

- `travelling`, `working`, `payment_due` are not authoritative group states,
- `active` means contractual work is still possible/required,
- `settling` means work has ended but payment claims may remain,
- contract settlement does not block independent assignment execution.

Do not encode impossible aggregate states such as requiring all workers to travel before any may work.

## 4. Requested worker count

Add:

```ts
requestedWorkerCount: number
```

Initial UI presets are `1 / 2 / 3`.

The value is frozen after contract creation/posting in this plan. Dynamic workforce resizing is a non-goal.

A work slot is occupied only by an assignment still participating in contractual work. An assignment waiting for payment does **not** occupy a work slot.

The posting remains discoverable while:

```text
activeWorkAssignments < requestedWorkerCount
AND groupRemaining > 0
AND target still accepts useful work
```

An NPC may not accept the same contract twice.

Authoritative acceptance must recheck slot availability to avoid double acceptance.

## 5. One contract per target

Preserve one non-terminal Work Contract **job** per concrete target.

Multiple workers are assignments inside that one contract.

Do not create separate contracts per worker; that would duplicate posting, reward, commitment snapshots, cancellation/invalidation semantics and employer intent.

## 6. Group work commitment

Preserve the `npc-018` snapshot fields:

```text
requestedWorkShare
remainingWorkAtCreation
committedWork
npcWorkCompleted
```

`committedWork` is the **total work promised by the NPC group**, not a quota multiplied by worker count.

Example:

```text
remaining work at creation = 12h
requested NPC share = 75%
requested workers = 3

committedWork = 9h total
```

The workers collectively owe 9h, not 27h.

Do not recalculate commitment as workers join/leave or as the Player contributes.

## 7. Shared workload, no equal quotas

Do not split the group commitment into fixed thirds.

Use:

```text
groupRemaining = committedWork - npcWorkCompleted
```

Each assignment contributes while useful contracted work remains.

This supports different work speeds, late arrivals, interruptions, replacement workers and Player concurrency.

Track per-assignment `workCompleted` for payment/debug/history, but it is not a fixed personal quota.

## 8. Contribution accounting

Every NPC contribution uses the same authoritative target seam:

```text
NPC attempts work
→ target accepts/clamps useful work
→ assignment.workCompleted += acceptedWork
→ contract.npcWorkCompleted += acceptedWork
```

Only accepted useful work counts.

Do not infer contribution from target-progress deltas.

The target remains responsible for construction/material blocking and remaining-work clamping.

## 9. Player remains a concurrent contributor

An active multi-worker contract must not lock the target for the Player.

```text
Player + NPC A + NPC B + NPC C
→ same target progress
```

No frame-level lock manager is required in the current single-threaded simulation.

Keep the target seam actor-neutral enough for future multiplayer.

## 10. NPC discovery and acceptance

Reuse current Work Contract discovery and evaluation.

Acceptance requires:

- contract still open/discoverable,
- NPC has no assignment on that contract,
- NPC has no conflicting active work commitment under current rules,
- a work slot remains,
- target/contract remains valid,
- useful group work remains.

Acceptance adds an assignment; it does not replace a contract-level worker field.

Do not add Player-picked worker rosters in this plan.

## 11. Multi-worker opportunity scoring

The current evaluator charges every candidate for the entire `committedWork`; that becomes wrong after multi-worker support.

Estimate the candidate's expected share from current group state, conceptually:

```text
remainingGroupWork = max(0, committedWork - npcWorkCompleted)
expectedWorkers = bounded estimate from requested slots / active assignments
expectedCandidateWork = remainingGroupWork / expectedWorkers
```

Then evaluate using the existing formula shape:

```text
expectedReward
+ suitability
- travelCost
- expectedWorkDurationCost
- scheduleConflict
```

Expected reward derives from the frozen contract reward rate described below, not from the whole `rewardCoins` value.

Keep the estimator deterministic, bounded and simple. Do not build a workforce-market prediction model.

## 12. Reward semantics foundation

`rewardCoins` remains the **maximum total price for the original group `committedWork`**.

It is not a per-worker reward and is never multiplied by worker count.

Conceptually:

```text
rewardRate = rewardCoins / committedWork
```

A worker earns only for useful accepted work:

```text
assignment earned reward ∝ assignment.workCompleted × rewardRate
```

The exact integer coin claim allocation/payment lifecycle is implemented by `npc-016`, which depends on this plan.

This plan must preserve enough attributable contribution data for `npc-016` to freeze deterministic per-assignment claims.

Do not silently redefine `rewardCoins` in UI or persistence as "reward per worker".

## 13. Worker release and replacement

If one worker genuinely abandons, dies or otherwise cannot continue:

- end/release only that assignment's work participation,
- preserve its `workCompleted`,
- preserve aggregate `npcWorkCompleted`,
- keep all other assignments untouched,
- reopen one work slot if useful contracted work remains.

Example:

```text
requested = 3
A working
B working
C dies

→ A and B continue
→ one work slot reopens
→ D may later accept
```

Temporary hunger/sleep/combat/path interruptions do not release the slot automatically.

A worker who already performed useful work retains the basis for an earned payment claim even if later released. `npc-016` owns the actual claim/payment lifecycle.

## 14. Worker death

Death must not erase historical work contribution.

In this plan:

- dead worker stops active work participation,
- slot may reopen if useful work remains,
- contribution remains attributable,
- no household inheritance/estate transfer is implemented.

`npc-016` handles the temporary payment-side outcome for a dead claimant without treating it as deliberate employer non-payment.

A later dedicated household/inheritance plan may transfer such claims contextually.

## 15. Group commitment fulfilled

Work phase ends when:

```text
npcWorkCompleted >= committedWork
```

regardless of contribution distribution.

All still-active work assignments stop cleanly.

Do not generate synthetic work to equalize individual contributions.

The contract then enters its settlement/payment phase as defined by the coarse lifecycle.

## 16. Target completes first

The real target may finish before group `committedWork` because the Player also contributed.

When no useful target work remains:

- all active work assignments stop,
- no synthetic contribution is credited,
- no replacement work slots reopen,
- target remains complete,
- only actual accepted NPC work is eligible for payment.

Example:

```text
rewardCoins = 90
committedWork = 9h
NPC group actually contributes 6h
Player finishes the target

→ NPCs collectively earned only the reward corresponding to 6h
→ remaining reward never becomes owed
```

## 17. Payment handoff to `npc-016`

This plan lands **before** `npc-016-work-contracts-payment-and-employer-interaction.md`.

Required handoff:

- each assignment retains its own `workCompleted`,
- mixed work/payment states are structurally possible,
- payment never relies on one shared `workerNpcId`,
- waiting-for-payment assignments do not consume work slots,
- released workers retain earned contribution history,
- dead workers retain historical claim basis,
- contract can distinguish active work from post-work settlement.

`npc-016` then adds deterministic integer `rewardCoinsDue`, local claimant interaction, `paid`/`unpaid`, request throttling and patience per assignment.

## 18. Existing target compatibility

Remain generic across all Work Contract targets available at implementation time, including:

- well/construction,
- terrain preparation,
- palisade,
- standing torch.

Do not add target-specific worker-count logic.

Future residential-house construction should consume this generic capability rather than creating house crews.

## 19. Work positions / physical concurrency

Do not introduce a generic work-position/interaction-slot geometry system in this plan.

Multiple NPCs may currently contribute to the same target through existing work bouts even if they converge on the same logical target location.

A later shared target-interaction-slot system may improve physical spacing/animation for construction, repair, harvesting and similar activities.

Do not block this plan on that future presentation/interaction refinement.

## 20. Persistence and migration

Persist authoritative multi-worker state conceptually:

```text
requestedWorkerCount
assignments[]
  npcId
  lifecycle state
  acceptedAt
  workStartedAt
  workCompleted
existing group commitment snapshot
existing target/reward/posting state
```

Migrate old single-worker saves cleanly:

```text
requestedWorkerCount = 1

workerNpcId != null
→ one equivalent assignment
```

Map old contract execution state to that assignment state.

Preserve existing aggregate `npcWorkCompleted`; do not credit the migrated assignment a second time into the aggregate.

Follow the current save-version migration mechanism. `SaveData` remains serialization, not runtime authority.

## 21. NPC lookup APIs

Replace single-worker lookup semantics such as `findByWorker()` with assignment-aware authoritative lookup conceptually:

```text
find active work assignment for npcId
→ owning contract + assignment
```

Do not make `NpcAgent` own a copied contract id.

Keep one-active-work-commitment-per-NPC unless current code explicitly supports more.

Payment-side historical/claim lookup may later include non-work-active assignments through `npc-016`.

## 22. Cancellation and invalidation

Contract cancellation or target invalidation applies to the job as a whole.

It terminates/releases every active work assignment consistently and clears posting state through Work Contracts authority.

Worker-specific abandonment does **not** cancel the contract.

Keep causes distinct:

```text
worker unavailable → assignment release
employer cancels   → contract cancellation
invalid target     → contract invalidation
```

Already performed work remains attributable; exact payment consequences are handled by `npc-016`.

## 23. Performance

Do not add a crew manager or per-contract update loop.

NPC behaviour remains driven by existing simulation/arbitration. Work Contracts remain authoritative records queried/mutated through the current world-owned runtime.

Worker counts are expected to be small, but assignment lookup should avoid unnecessary every-contract scans in hot NPC paths when a cheap runtime index is justified.

No Web Worker is justified.

## 24. Implementation guidance

Before implementation, create implementation notes according to `docs/plans/PLANNING.md` and inspect current versions of:

- `src/world/workContract.ts`,
- `src/world/createWorkContracts.ts`,
- Work Contract persistence/migrations,
- `NpcAgent` discovery/accept/travel/work execution,
- `src/ai/npcWorkContract.ts` evaluator/scoring,
- contract creation/posting/action UI,
- all target contribution seams available after `items-player-017`,
- updated `npc-016` as the direct payment consumer of this architecture.

Add JSDoc to important assignment lifecycle/query/mutation APIs where useful; use `@domain npc`.

## Verification

Browser verification is performed manually by the User, not by the implementation agent.

### Three workers accept one job

1. Player creates a contract with `requestedWorkerCount = 3`.
2. Contract is posted once.
3. NPC A accepts → one assignment.
4. Posting remains open with two work slots.
5. NPC B accepts → second assignment.
6. NPC C accepts → third assignment.
7. Further acceptance is rejected while slots are filled.
8. Only one Work Contract exists for the target.

### Independent lifecycle

Verify simultaneously:

```text
A = working
B = travelling
C = accepted/interrupted
```

A progresses the target without waiting for B/C.

### Shared work

1. Player + A + B + C work on the same target.
2. Every contribution advances only the authoritative target.
3. `assignment.workCompleted` credits only that NPC's accepted work.
4. `contract.npcWorkCompleted` equals aggregate accepted NPC work.
5. No duplicate progress occurs.

### Group commitment

For:

```text
remaining = 12h
share = 75%
workers = 3
```

verify group commitment is 9h total, not 27h.

Different distributions such as 5h + 3h + 1h fulfill the same 9h commitment.

### Replacement

1. Three workers are active.
2. One contributes partial useful work and becomes genuinely unavailable.
3. Its contribution remains recorded.
4. Other workers continue unchanged.
5. One work slot reopens.
6. Another NPC can accept.
7. Replacement does not reset group commitment or prior contribution.

### Player completes target first

Verify:

- active work stops,
- no synthetic work is credited,
- no replacement slot reopens,
- target remains complete,
- only actual NPC contribution is passed toward payment accounting.

### Evaluator

Verify candidates do not each price the full remaining group commitment as their personal workload/reward once multiple workers can participate.

### Save/load

Verify save/load with:

- advertised contract with partially filled slots,
- workers in different lifecycle states,
- partial contribution from multiple workers,
- released/reopened slot,
- fulfilled group commitment.

After load there must be no duplicated assignments or duplicated contribution.

## Non-goals

Do not implement:

- permanent work crews,
- foremen / crew hierarchy,
- synchronized worker movement/animations,
- generic target work-position/interaction-slot geometry,
- Player-selected named recruitment roster,
- NPC-created work contracts,
- autonomous settlement workforce planning,
- material hauling/procurement,
- specialist roles inside one contract,
- individual fixed work quotas,
- multiple independent Work Contracts on one target,
- negotiation or dynamic workforce resizing after posting,
- reward per worker,
- pooled crew wage,
- actual payment interaction (`npc-016`),
- inheritance/household transfer of dead workers' claims,
- house-specific crew systems.

## Completion criteria

The implemented model supports:

```text
one Work Contract / target
    ↓
requestedWorkerCount 1+
    ↓
independent assignments
    ↓
shared group commitment
    ↓
per-assignment attributable contribution
    ↓
Player + multiple NPCs mutate the same authoritative target
    ↓
clean work completion/replacement
    ↓
assignment-aware handoff to npc-016 payment claims
```

The implementation must preserve target-owned progress, one contract per target, independent NPC simulation and future compatibility with residential/settlement construction.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
