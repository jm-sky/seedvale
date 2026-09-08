# Plan: Work Contracts — Multiple Workers

**Created:** 2026-09-08
**Status:** `draft` 📝
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** ~~npc-018~~
**Domain:** `npc`
**Subdomains:** `work` `behavior`
**Tags:** `work-contracts` `multiple-workers` `construction`
**Roadmap:** -

## Goal

Extend one advertised Work Contract so it can hire **1+ NPCs** for the same authoritative world target.

Initial UX should support small worker counts such as:

```text
1 worker
2 workers
3 workers
```

but the runtime/data model must use a general `requestedWorkerCount: number` rather than hard-code a maximum of three.

The target remains the sole owner of real work progress. Multiple NPCs and the Player contribute to the same target through the existing actor-neutral work seam.

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

Do not create one construction-progress record per worker and do not create house/buildable-specific crew systems.

## Current state

`src/world/workContract.ts` currently assumes exactly one worker:

- `WorkContractRecord.workerNpcId` is the sole assignment authority,
- `acceptedAt` and `workStartedAt` are contract-level,
- `accepted → travelling → working → payment_due` is a single contract-level worker lifecycle,
- `canAcceptContract()` closes the contract after one NPC accepts,
- `releaseWorkContract()` releases that one worker,
- `npcWorkCompleted` tracks aggregate NPC contribution, but today that aggregate can only come from one worker.

`npc-018` also deliberately enforces one non-terminal Work Contract per target and lists multiple workers/crews as future work.

The existing target ownership is correct and must remain unchanged:

```text
WorkContract
    ↓
ContractTarget
    ↓
world target owns progress
```

This plan extends worker participation, not target ownership.

## 1. Separate contract from worker assignment

Do not replace:

```ts
workerNpcId: string | null
```

with only:

```ts
workerNpcIds: string[]
```

because workers can be in different lifecycle states at the same time.

Introduce a per-NPC assignment/participation concept equivalent to:

```ts
type WorkContractAssignment = {
  npcId: string
  state: WorkContractAssignmentState
  acceptedAt: number
  workStartedAt: number | null
  workCompleted: number
}
```

Exact naming/types should follow implementation recon, but the architectural ownership is required:

```text
WorkContractRecord
    owns job/target/commitment/reward/posting

WorkContractAssignment
    owns one hired NPC's participation lifecycle/contribution
```

Do not duplicate the assignment on `NpcAgent`; NPCs should continue resolving their active Work Contract participation from the Work Contracts authority.

## 2. Independent worker lifecycle

Each hired NPC must progress independently.

Conceptually:

```text
accepted
→ travelling
→ working
→ fulfilled / released
```

At the same moment:

```text
NPC A = working
NPC B = travelling
NPC C = accepted
```

must be valid.

One worker becoming hungry, sleeping, fighting, path-blocked, interrupted, released or dead must not pause or rewind the other assignments.

Do not create a synchronized crew FSM or foreman/coordinator.

## 3. Contract-level lifecycle becomes aggregate/coarse

The current contract-level lifecycle mirrors one worker and therefore cannot remain the sole execution state for multiple workers.

Refactor it only as far as needed so the contract represents the aggregate job/posting lifecycle while assignments represent individual execution.

The implementation should preserve existing terminal concepts such as cancellation/invalidation and keep posting state authoritative on the contract.

Avoid encoding impossible aggregate states such as requiring all workers to be `travelling` before any may work.

The exact aggregate-state vocabulary should be resolved during implementation against `npc-016` if that payment plan has landed, but the invariant is:

> worker-specific execution state belongs to assignments, not to one shared contract field.

## 4. Requested worker count

Add contract data equivalent to:

```ts
requestedWorkerCount: number
```

Initial UI presets may be 1/2/3.

The advertised job remains open while:

```text
activeAssignments < requestedWorkerCount
```

and the target still has useful contracted work available.

An NPC evaluating the job must not accept it twice.

Once all requested slots are filled, the posting is no longer available to additional NPCs unless a worker slot later reopens.

## 5. One contract, not one contract per worker

Keep one Work Contract for the advertised job.

Do not create three independent Work Contracts pointing at the same target merely to hire three workers. That would duplicate:

- posting/reward/job identity,
- commitment snapshots,
- cancellation/invalidation semantics,
- employer intent,
- target-level concurrency rules.

Worker-specific state belongs under the contract as assignments.

## 6. Group work commitment

Preserve `npc-018` snapshot semantics:

```text
requestedWorkShare
remainingWorkAtCreation
committedWork
npcWorkCompleted
```

`committedWork` remains the **total work promised by the hired NPC group**, not a per-worker quota multiplied by worker count.

Example:

```text
remaining work at creation = 12h
requested NPC share = 75%
requested workers = 3

committedWork = 9h total
```

The three workers collectively owe 9h, **not 27h**.

Do not recalculate the commitment as workers accept, arrive, leave, or as the Player contributes.

## 7. Shared workload, not rigid equal quotas

Do not split the group commitment into fixed thirds such as 3h/3h/3h unless later gameplay explicitly requires individual quotas.

Prefer a shared remaining group workload:

```text
groupRemaining = committedWork - npcWorkCompleted
```

Each worker contributes useful work while group commitment remains.

This naturally handles:

- different NPC work speeds,
- late arrivals,
- interruptions,
- one worker leaving,
- Player contributions reducing target work,
- target completion before all assignments contribute equally.

Per-assignment `workCompleted` should still be tracked for payment/debugging/history, but it does not define an equal quota.

## 8. Contribution accounting

All NPC workers contribute through the same target seam used today.

For each work bout:

```text
assignment NPC performs attempted work
→ target accepts/clamps useful work
→ assignment.workCompleted += acceptedWork
→ contract.npcWorkCompleted += acceptedWork
```

Only work actually accepted by the target counts.

The target remains responsible for clamping against remaining useful work and construction/material blocking.

Do not infer individual contribution from target-progress deltas.

## 9. Player remains a concurrent contributor

An active multi-worker contract must not lock the target for the Player.

```text
Player + NPC A + NPC B + NPC C
→ same target progress
```

No frame-level lock manager is required in the current single-threaded simulation. Each contribution is a small authoritative mutation that clamps to remaining useful work.

Keep this actor-neutral enough that future multiplayer does not require replacing Player-only construction progress.

## 10. Assignment acceptance

Each NPC evaluates the same advertised contract independently.

Acceptance succeeds only when:

- the contract is still advertised/open,
- the NPC does not already have an assignment on it,
- a requested worker slot remains,
- target/contract remains valid,
- normal NPC commitment rules allow acceptance.

Acceptance adds one assignment rather than replacing a contract-level `workerNpcId`.

Race-like double acceptance must be resolved by the authoritative Work Contracts mutation rechecking slot availability.

## 11. NPC discovery and evaluation

Reuse the current Work Contract discovery/evaluation system.

Do not add crew recruitment UI or Player-picked NPC rosters in this plan.

NPC evaluation must account for the fact that several workers may share the work. Do not score expected duration as if every candidate personally performs the entire `committedWork`.

Use a bounded estimate based on remaining group commitment and currently filled/requested worker slots. Exact scoring should reuse the existing evaluator rather than create separate multi-worker desirability logic.

## 12. Worker release and replacement

If one worker genuinely abandons the job, dies or otherwise cannot continue:

- remove/mark only that assignment,
- preserve work already contributed by that worker,
- keep all other assignments untouched,
- reopen that worker slot if useful contracted work remains.

Example:

```text
requested = 3
A working
B working
C dies

→ A and B continue
→ one slot reopens
→ D may later accept
```

Do not reset `npcWorkCompleted`, `committedWork` or other workers' lifecycle.

Temporary needs/sleep/combat interruptions should continue using normal NPC interruption/resumption behaviour and should not automatically release the slot.

## 13. Group commitment fulfilled

The work phase is fulfilled when:

```text
npcWorkCompleted >= committedWork
```

regardless of how the contribution was distributed between workers.

All still-active worker assignments must then stop contractual work cleanly.

No synthetic work is generated to make every assignment reach an equal amount.

## 14. Target completes first

As in `npc-018`, the real target may complete before the group reaches the full original commitment because the Player also worked.

When no useful target work remains:

- all worker assignments stop contractual work,
- no synthetic contribution is added,
- target remains complete,
- the contract proceeds through the appropriate existing payment/completion semantics.

Do not reopen worker slots for a completed target.

## 15. Payment semantics and `npc-016`

`npc-016-work-contracts-payment-and-employer-interaction.md` currently assumes one `workerNpcId` and one contract-level `payment_due` lifecycle.

This plan is intentionally `draft` because multi-worker payment must be reconciled before either plan is implemented on top of the other.

Required direction:

- each worker's contributed work must remain attributable through its assignment,
- payment cannot rely on one shared `workerNpcId`,
- mixed states must be possible (e.g. NPC A finished/awaiting payment while NPC B is still working),
- payment UI/interaction must resolve the specific worker assignment being paid.

Do **not** implement a shared pooled wage that is paid to an arbitrary one worker.

Preferred initial economic model is a **per-worker reward/claim**, with the exact reward representation resolved together with `npc-016` before implementation. Avoid silently redefining the existing `rewardCoins` field without migration/UX consideration.

Before implementing `npc-016`, update/review that plan against this draft if `npc-028` is intended to land first.

## 16. Target concurrency rule

Preserve one non-terminal **Work Contract job** per concrete target.

`npc-018`'s one-contract-per-target invariant should become:

> one job/contract per target, with multiple assignments inside that contract.

Do not allow overlapping independent contracts for the same target in this phase.

This keeps commitment accounting and cancellation/invalidation unambiguous while still allowing several NPC workers.

## 17. Existing target compatibility

The feature must remain generic across all currently supported Work Contract targets available at implementation time, including the existing families such as:

- well/construction,
- terrain preparation,
- palisade,
- standing torch.

Do not add target-specific worker-count logic.

Future residential-house construction (`settlements-005`) should consume this generic capability as another Work Contract target rather than introducing house crews.

## 18. Persistence

Persist enough authoritative state to restore multi-worker contracts deterministically.

Conceptually:

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

Old single-worker saves must migrate/default cleanly.

When migrating a contract with `workerNpcId`:

```text
requestedWorkerCount = 1
workerNpcId != null
→ one equivalent assignment
```

Do not duplicate already credited `npcWorkCompleted` during migration.

Follow the repository's current save-version migration mechanism; `SaveData` remains serialization, not runtime authority.

## 19. NPC lookup APIs

Current NPC execution resolves contracts through single-worker lookup semantics such as `findByWorker()`.

Adapt this to assignment-based lookup without making each `NpcAgent` own a copied contract id.

The authoritative query should remain conceptually:

```text
find active assignment for npcId
→ owning contract + assignment
```

Keep one-active-work-commitment-per-NPC rules unless current code explicitly supports multiple simultaneous commitments.

## 20. Cancellation and invalidation

Contract cancellation or target invalidation applies to the job as a whole.

It must terminate/release every active assignment consistently and clear posting state through the existing Work Contracts authority.

Worker-specific abandonment must **not** cancel the whole contract.

Keep these causes distinct:

```text
worker unavailable → assignment release
employer cancels   → contract cancellation
invalid target     → contract invalidation
```

## 21. Performance

Do not add a crew manager or per-contract update loop.

Worker behaviour remains driven by the existing NPC simulation/arbitration. Work Contracts are queried/mutated as authoritative records.

Expected worker counts are small, but data structures and queries should avoid scanning every contract for every NPC when the existing manager can maintain/index assignment lookup cheaply.

No Web Worker is justified for this feature.

## 22. Implementation guidance

Before implementation, create implementation notes according to `docs/plans/PLANNING.md` and inspect the current versions of:

- `src/world/workContract.ts`,
- `src/world/createWorkContracts.ts`,
- Work Contract persistence/migrations,
- `NpcAgent` Work Contract discovery/accept/travel/work execution,
- Work Contract evaluator/scoring,
- contract posting/action UI,
- `npc-016` if implemented or still planned,
- all target resolvers/contribution seams available after `items-player-017`.

Resolve the payment representation before coding if `npc-016` has not already been adapted.

Add JSDoc to important assignment lifecycle/query/mutation APIs where it improves preflight discovery; use `@domain npc`.

## Verification

Browser verification is performed manually by the User, not by the implementation agent.

### Three workers accept one job

1. Player creates a contract with `requestedWorkerCount = 3`.
2. Contract is posted once.
3. NPC A accepts → one assignment.
4. Posting remains open with two slots.
5. NPC B accepts → second assignment.
6. NPC C accepts → third assignment.
7. Further NPC acceptance is rejected while all slots are filled.
8. Only one Work Contract exists for the target.

### Independent lifecycle

Verify simultaneously:

```text
A = working
B = travelling
C = accepted/interrupted
```

A must continue progressing the target without waiting for B/C.

### Shared work

1. Player + A + B + C work on the same target.
2. Every contribution advances only the authoritative target.
3. `assignment.workCompleted` credits only that NPC's accepted work.
4. `contract.npcWorkCompleted` equals the aggregate accepted NPC work.
5. No duplicate progress is created.

### Group commitment

For:

```text
remaining = 12h
share = 75%
workers = 3
```

verify the group commitment is 9h total, not 27h.

Different contribution distributions such as 5h + 3h + 1h must all fulfill the same 9h group commitment.

### Worker replacement

1. Three workers are assigned.
2. One worker genuinely becomes unavailable.
3. Other two continue unchanged.
4. One slot reopens.
5. Another NPC can accept.
6. Previously contributed work is preserved.

### Player completes target first

Verify that if Player contribution completes the target while several assignments remain:

- all contractual work stops,
- no synthetic work is credited,
- no replacement slots reopen,
- target remains completed,
- payment/completion path receives correct per-assignment contribution data.

### Save/load

Verify save/load with:

- advertised contract with partially filled slots,
- workers in different lifecycle states,
- partial contribution from multiple workers,
- a released/reopened slot,
- fulfilled group commitment.

After load there must be no duplicated assignments or duplicated work contribution.

## Non-goals

Do not implement in this plan:

- permanent work crews,
- foremen or crew hierarchy,
- synchronized worker movement/animations,
- Player-selected named recruitment roster,
- NPC-created work contracts,
- autonomous settlement workforce planning,
- material hauling/procurement,
- specialist job roles within one contract,
- individual fixed work quotas,
- multiple independent Work Contracts on one target,
- negotiation or dynamic workforce resizing after posting,
- house-specific crew logic,
- multiplayer networking/locking.

## Completion criteria

The system supports:

```text
one posted Work Contract
    ↓
requested workers = N
    ↓
NPCs accept independently until N slots filled
    ↓
assignments travel/work independently
    ↓
Player + all workers contribute to same target
    ↓
aggregate NPC commitment fulfilled
OR
target completes
    ↓
worker-specific completion/payment flow
```

The implementation must preserve target-owned progress, one contract per target, independent NPC simulation and future compatibility with residential/settlement construction.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
