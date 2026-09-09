# npc-028 — Work Contracts: Multiple Workers — Implementation Notes

## Current implementation to change

- `src/world/workContract.ts` is still single-worker authoritative: `WorkContractRecord.workerNpcId`, `acceptedAt`, `workStartedAt` and execution states `accepted/travelling/working/payment_due` all describe one NPC. Keep this module as the pure domain/lifecycle owner, but move worker execution into an explicit persisted assignment record owned by the contract.
- `src/world/createWorkContracts.ts` is the only runtime mutation authority. Extend its API rather than mutating `assignments[]` from `NpcAgent` or UI. Existing `accept`, `beginTravel`, `beginWork`, `completeWork`, `creditNpcWork`, `release` should become assignment-aware operations that identify both contract and NPC.
- `NpcAgent` currently resolves its commitment through `workContracts.findByWorker(this.id)` and drives contract transitions from there. Preserve this ownership rule: return an assignment-aware result such as `{ contract, assignment }`; do not copy contract/assignment ids into `NpcAuthoritativeState`.
- `src/ai/npcWorkContract.ts::scoreWorkContractOpportunity()` currently charges every candidate the full `contract.committedWork` and credits the full `rewardCoins`. This must change together with multi-worker acceptance or later workers will systematically misprice the same contract.

## Recommended data/lifecycle shape

- Add `requestedWorkerCount` to `WorkContractRecord` and `CreateWorkContractParams`; validate to an integer `>= 1` at the domain boundary, not only in UI.
- Add `WorkContractAssignment[]` with at least `npcId`, assignment lifecycle state, `acceptedAt`, `workStartedAt`, `workCompleted`. Preserve historical assignments after release/payment handoff; do not delete them when a slot reopens.
- Contract state should become coarse job state. Do not try to derive one exact worker state for the contract. `advertised/active/settling/completed` (plus current `available/cancelled/invalidated`) is sufficient; exact naming can follow current conventions.
- Define small pure helpers in `workContract.ts` for invariants used in several places, especially active-work-assignment count, group remaining work, discoverability/acceptability, assignment lookup and whether target/group work is finished. Avoid reimplementing these predicates independently in `createWorkContracts.ts`, `NpcAgent` and UI.

## Acceptance and lookup

- `discoverableAt()` currently filters only `state === 'advertised'`. After first acceptance the same posting must remain discoverable while a slot and useful work remain, so discoverability must use a predicate based on posting + aggregate work state + active assignment count, not one state literal.
- Acceptance must re-resolve the current record and recheck: contract valid, target still useful, group remaining `> 0`, free slot, no existing assignment for this NPC, and current one-active-work-commitment-per-NPC rule. Do not rely on the candidate list produced earlier in the decision cycle.
- `findByWorker()` currently linearly scans records. Multiple assignments make the semantic change mandatory. A linear scan over contracts + tiny assignment arrays is acceptable initially; only add a runtime `npcId -> {contractId, assignment}` index if profiling/current hot-path use justifies it. Never persist the index.

## Work accounting

- Keep `remainingWorkAtCreation`, `requestedWorkShare`, `committedWork` and aggregate `npcWorkCompleted` unchanged in meaning. `committedWork` remains one group total.
- `creditNpcWork()` should update assignment `workCompleted` and contract `npcWorkCompleted` in one authoritative mutation after the target returns the actually accepted/clamped amount. Do not let callers update the two counters separately.
- When group commitment is fulfilled or the target stops accepting useful work, terminate all still-work-active assignments consistently, but preserve each assignment's contribution. This is the handoff required by `npc-016`.
- Releasing one worker must only end that assignment's work participation. Do not clear/rewrite other assignments and do not reset posting timestamps or aggregate progress.

## NpcAgent integration

- Existing work execution already resolves target-specific remaining work / contribution for wells, terrain preparation, palisades and standing torches. Reuse those target seams; npc-028 should only change contract participation/accounting around them.
- Replace checks such as `fresh.state === 'travelling' && fresh.workerNpcId === this.id` with assignment-state checks from a freshly resolved `{ contract, assignment }`. This matters because another NPC can mutate the same contract between decision/execution steps while remaining valid for this NPC.
- Temporary sleep/hunger/combat/path interruption should leave the assignment active exactly as today; only genuine abandonment/death should call assignment release.

## Evaluator

- In `src/ai/npcWorkContract.ts`, estimate only the candidate's expected share of current `groupRemaining`, not full `committedWork`.
- Derive expected reward from the frozen rate `rewardCoins / committedWork` and the same expected candidate work. Guard `committedWork <= 0` explicitly to avoid division-by-zero/NaN.
- Keep the estimator deterministic and simple; active assignment count plus remaining requested slots is enough. Do not make acceptance order or random market prediction part of scoring.

## UI creation flow

- `src/app/actions/workContractActions.ts::beginContractCreation()` is the shared creation path for new and existing targets. Add the `1 / 2 / 3` worker-count picker here and pass the value through `bundle.workContracts.create()`; do not duplicate the picker per target kind.
- `rewardCoins` remains the total reward ceiling for the group. Labels should not imply "per worker".

## Persistence / migration

- Current schema is `CURRENT_SAVE_VERSION = 13`; changing `SaveWorkContract` semantics requires the normal next migration in `src/persistence/saveData.ts` and corresponding validation/tests.
- Migrate old contracts with `requestedWorkerCount = 1`. If `workerNpcId !== null`, create exactly one assignment and map old `accepted/travelling/working/payment_due` into its assignment state. Preserve existing `npcWorkCompleted` as the contract aggregate; initialize migrated assignment `workCompleted` from that value, but do **not** add it again to the aggregate.
- `src/app/saveState.ts` currently has an existing Work Contract serialization bug: it serializes `construction` correctly but coerces every other target to `terrain_preparation`. That breaks `palisade` and `standing_torch` target kinds. Fix this while touching Work Contract serialization, preferably by serializing the discriminated `target` without a two-branch fallback.
- Same-session `WorldBundle` rebuild already carries `bundle.workContracts.nodes()` into `createWorkContracts(...)`; keep assignments as ordinary record-owned state so no extra rebuild mechanism is needed.

## Tests worth extending

- `src/world/createWorkContracts.test.ts`: simultaneous assignments, slot reopening, duplicate-NPC rejection, independent state transitions, cancellation/invalidation releasing all active work assignments, aggregate/per-assignment credit invariants.
- `src/ai/npcWorkContract.test.ts` (or current evaluator tests): second/third worker scores only expected remaining share/reward.
- `src/persistence/saveData.test.ts`: v13 -> new-version migration for unassigned and each old worker lifecycle state; preserve aggregate work; round-trip all four target kinds.
- Save-state serialization test should cover `palisade` and `standing_torch` so the existing target-kind regression cannot return.

## Dependency handoff

`npc-016-work-contracts-payment-and-employer-interaction.md` already depends on npc-028 and expects assignment-owned contribution/payment history. Do not implement payment here, but leave historical released/dead assignments intact and structurally capable of later `payment_due/paid/unpaid` extension without restoring contract-level worker/payment authority.
