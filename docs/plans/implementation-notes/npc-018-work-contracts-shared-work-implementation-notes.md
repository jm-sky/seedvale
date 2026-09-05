# Implementation Notes: Work Contracts — Shared Work

## Current code ownership

- `src/world/workContract.ts` owns the authoritative Work Contract record and lifecycle mutations. Current construction targets are effectively well-only, and `completeContractWork()` moves `working → payment_due` once work is considered complete.
- `src/world/createWorkContracts.ts` owns the runtime contract registry, target flag visuals, posting/acceptance/travel/work transitions and worker lookup. Its `create()` API currently accepts `targetId` plus `x/z` and creates a construction contract.
- `src/app/actions/workContractActions.ts` is the current player creation flow. It places a new `PlayerWellRecord` and then creates the Work Contract against that well. This is the main seam that prevents attaching a contract to an already-existing partially completed target.
- `src/ai/npcWorkContract.ts` is the pure/deterministic contract evaluation seam. Extend its duration/work estimate from full-target assumptions to the contract's immutable `committedWork`; do not move target-specific world mutations into this module.
- `src/ai/NpcAgent.ts` already executes construction work bouts against the real well target. Keep NPC needs, travel and work-bout policy here while pushing shared world mutation into target-owned seams.

## Well construction

- `src/world/playerWell.ts` already has actor-neutral construction state and transition rules. `PlayerWellRecord.workProgress` is the authoritative per-stage work progress.
- `advanceWellConstruction(...)` is the shared stage/material/transition seam. Actual work credit remains caller policy; player and NPC callers ultimately use `PlayerWells.addWork` against the same record.
- `wellStageWorkHours(...)` is the source of truth for stage work requirements. Shared-work remaining-work calculation must cover all remaining stages, not just the current stage's unfinished progress.
- Do not create a generic replacement for `PlayerWellRecord`. Add only the narrow target resolver/helper needed by Work Contracts.

## Terrain preparation

- `src/terrain/terrainPreparation.ts` owns the persistent work model: `requiredWork`, `completedWork`, immutable `originalHeights`, `targetHeight`, deterministic `progressiveHeights(...)`, validation and work estimation.
- `src/world/createTerrainPreparations.ts` owns active preparation records plus their marker/runtime representation and exact-height overlay application. `setCompletedWork()` is currently bookkeeping; callers also push derived heights into `ChunkManager`.
- `src/app/actions/terrainPreparationActions.ts` currently embeds player-specific work progression in `applyWorkProgress(...)`: it calculates represented work, applies player vigor, updates `completedWork`, derives progressive heights and applies them through `chunkManager.applyExactHeights(...)`.
- Extract the smallest actor-neutral terrain contribution seam from that flow. Player vigor, XP, time skip, tool checks and UI must remain player policy outside the shared mutation.
- `onWorkSkipFinished()` currently applies final progress and immediately removes the active preparation record. A contract must observe successful completion before/while this removal happens; `find(id) === undefined` cannot distinguish successful completion from invalidation.

## Target model

- Extend the current Work Contract target union only as far as needed for this plan: well construction + terrain preparation.
- Avoid a broad `WorkTargetManager`. Prefer narrow helpers/resolvers for stable target lookup, position, remaining useful work, contribution and completion.
- Resolve NPC travel destination from the authoritative target (`PlayerWellRecord` coordinates / terrain preparation center), not from the contract flag.
- Enforce at most one non-terminal contract per target in the contract registry or creation mutation seam. This is a domain invariant for npc-018 and prevents overlapping quotas while work crews remain out of scope.

## Commitment accounting

- Add authoritative contract fields equivalent to `requestedWorkShare`, `remainingWorkAtCreation`, `committedWork` and `npcWorkCompleted`.
- `committedWork` is calculated exactly once when the contract is created: remaining useful work × requested share. It must survive save/load unchanged and must not be recomputed at acceptance time.
- `npcWorkCompleted` records only useful work actually accepted by the target from the assigned NPC. It is not another copy of total target progress.
- After every NPC work contribution, evaluate two independent stop conditions: NPC commitment fulfilled, or real target completed. Either ends the work phase; never generate synthetic work after target completion.
- This plan deliberately does not change reward/payment calculation. Reuse the existing `payment_due` lifecycle and leave any proportional-settlement policy to a separate plan.

## Contract creation/UI

- Refactor the current `workContractActions.ts` flow so contract creation can reference an existing unfinished target instead of always placing a new well.
- Preserve the current new-contract path: a fresh well may still be placed first and then referenced by the contract.
- Add the smallest interaction/Quick Action seam for `Hire help` on supported unfinished targets. Reuse existing contract posting/reward dialogs rather than introducing a workforce management screen.
- Work-share presets are 25/50/75/100% of remaining work at contract creation.

## Persistence

- Work Contracts already have authoritative world-owned persistence seams from the npc-014/015 work. Extend the saved contract shape with target variant and commitment accounting rather than adding parallel save sections.
- `TerrainPreparationRecord` already persists its own progress and terrain overlay state; Work Contracts should persist only the target reference and contractual contribution data.
- Old saves must default missing npc-018 fields safely according to existing `saveData.ts` validation/defaulting conventions.

## Important lifecycle cases

- Existing target becomes complete before posting/acceptance: contract creation/posting/acceptance must reject or resolve it deterministically.
- Player completes target while NPC travels or is interrupted: NPC must not resume fake work later.
- NPC fulfils `committedWork` before target completion: contract enters `payment_due`; target remains available to the player.
- Terrain preparation completion removes the active preparation record, so successful completion must be signalled explicitly rather than inferred from absence.
- Target removal/invalidation remains distinct from successful completion and should reuse existing cancellation/invalidation/release behavior where semantics match.

## Suggested implementation order

1. Extend Work Contract target/commitment schema and persistence.
2. Add one-active-contract-per-target validation and existing-target contract creation.
3. Add well remaining-work resolver covering all stages and switch NPC completion from target-only to commitment-or-target completion.
4. Update contract evaluation to use `committedWork`.
5. Extract actor-neutral terrain contribution and explicit completion result.
6. Add terrain preparation as a target variant for travel/work execution.
7. Add `Hire help` / work-share UI while preserving the existing new-well contract flow.
8. Extend diagnostics/tests for save/load, commitment accounting, concurrent player work and completion/invalidation cases.

## Pitfalls

- Do not infer NPC contribution from target progress delta unless the delta came directly from that NPC's accepted work call; the player may work between NPC bouts.
- Do not snapshot only the current well stage when calculating remaining work.
- Do not let a Work Contract own target progress or terrain deformation state.
- Do not treat missing terrain-preparation record as automatically completed.
- Do not expand this plan into additional buildables, multiple NPC workers or payment redesign.
