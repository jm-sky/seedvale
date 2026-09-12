# Implementation Notes: Work Contracts — Stale Target Discovery and Notice Cleanup

## Current authoritative ownership

- `src/world/workContract.ts` owns pure contract + assignment lifecycle state.
- `src/world/createWorkContracts.ts` is the only runtime mutation authority. Keep stale-target mutations here; do not let `NpcAgent` or UI directly edit records/assignments.
- `src/ai/NpcAgent.ts` owns NPC execution/navigation consequences.
- `src/app/actions/workContractActions.ts` owns player contract creation, notice-board posting and board UI.
- `SaveData.workContracts` / `src/app/saveState.ts` remain the persistence path.

Current save schema baseline at recon time: `CURRENT_SAVE_VERSION = 32`.

## Verified current stale behaviour

`NpcAgent` currently resolves the live target before/during pursuit and terminalizes remotely:

- construction: missing well → `invalidateTarget`; completed well → `completeWork`;
- terrain preparation: missing + `wasCompleted(id)` → `completeWork`; missing otherwise → `invalidateTarget`;
- palisade / standing torch / residential building follow the same direct pattern;
- therefore a travelling NPC can learn about stale work without physically reaching the site.

This is the behaviour npc-037 changes.

## Shared target resolver

Create one narrow read-only resolver near the Work Contract world domain rather than another manager.

Recommended contract:

```ts
type WorkContractTargetResolution =
  | { status: 'active'; x: number; z: number; remainingWork: number; blocked?: boolean }
  | { status: 'completed'; x?: number; z?: number }
  | { status: 'missing' }
```

Exact field shape can follow implementation needs, but the semantic split is mandatory.

Do not equate `remainingWork <= 0` with stale:

- `residentialBuildingRemainingWork()` reports `0` for a material-blocked current stage;
- use `isResidentialBuildingComplete()` for actual completion.

Target-owned authority to reuse:

- `PlayerWells` lookup + `isWellCompleted` / `wellRemainingWork`;
- `TerrainPreparations.find` + persisted `wasCompleted` + `terrainPreparationRemainingWork`;
- `Palisades` lookup + `isPalisadeConstructionComplete` / `palisadeRemainingWork`;
- `StandingTorches` lookup + `isStandingTorchConstructionComplete` / `standingTorchRemainingWork`;
- `ResidentialBuildings` lookup + `isResidentialBuildingComplete` / `residentialBuildingRemainingWork`.

The resolver should be callable by both `NpcAgent` and `workContractActions.ts`. Prefer a small function taking the required registries as explicit dependencies over injecting another stateful manager into `WorldBundle` unless current wiring makes a resolver object clearly smaller.

## Posting

`world/workContract.ts::canPostContract()` is currently a pure structural predicate and should stay that way.

Validate live target status at the player posting seam immediately before `WorkContracts.post(...)`:

- active unfinished → post;
- completed/missing → reject as stale;
- temporary residential material blocking must not be treated as target death.

Do not add a recurring scan in `WorkContracts.update()` or equivalent; no such polling is needed.

## NPC travel / discovery

Current contract records already persist `x/z`. Use that as the advertisement's last-known target location only when the live target cannot be resolved.

While assignment is `accepted` / `travelling`:

- live active target → navigate to live target position;
- completed/missing target → continue to persisted contract `x/z`;
- do not call `completeWork` / `invalidateTarget` until arrival.

At target arrival, call the shared resolver again. Only that arrival-time resolution may trigger the stale-discovery transition.

This intentionally supersedes npc-018's old assumption that travel can always use a live target record; a deleted target has no authoritative live position left.

## Stale lifecycle

Preferred minimal persisted shape:

- contract coarse state: `stale`;
- assignment execution state: `stale_target_detected`;
- stale reason `completed | missing` persisted if needed to finalize with the correct old lifecycle/payment semantics after save/load;
- deterministic cleanup owner persisted if multi-worker handling requires one.

`stale` must be:

- non-terminal until board cleanup;
- non-discoverable;
- non-acceptable;
- excluded by `contractHasActiveTarget()` so target flag is gone immediately;
- still `advertisement: 'posted'` / retains `postedBoardId` until physical cleanup.

Do not encode the return only in transient `NpcAgent.phase`; save/load must resume it.

## Return-to-board behaviour

NPC acceptance is settlement-local today:

```ts
contracts.discoverableAt(noticeBoardId(this.household.settlementId))
```

`SettlementLandmarks.noticeBoard` already exposes the physical return destination.

For `stale_target_detected`:

1. navigate to `landmarks.noticeBoard`;
2. on arrival call one authoritative WorkContracts finalization mutation;
3. then return to ordinary decision/schedule arbitration.

If the board destination is temporarily unavailable, use home/settlement as movement fallback but keep stale cleanup pending rather than remotely finalizing.

## Completion vs invalidation semantics

Do not collapse stale reasons into one terminal outcome.

- `completed`: reuse current successful work-ending/payment-claim semantics;
- `missing`: reuse current invalidation semantics;
- discovery/reporting itself adds no work credit.

The stale lifecycle is a delay between learning the world fact and removing the physical advertisement, not a new payment model.

## Multi-worker guardrail

npc-028 made contracts assignment-authoritative and multi-worker.

First confirmed stale detection must immediately make the job contract-wide non-discoverable. Prevent every remaining work-active assignment from resuming normal target work.

Keep cleanup idempotent:

- one deterministic reporter/cleanup owner if needed;
- duplicate stale detection is a no-op;
- duplicate board finalization is a no-op;
- no assignment may freeze a payment claim twice;
- no worker may become orphaned in `travelling`/`working` after contract enters stale state.

Do not solve this with a second NPC-local contract id/state copy.

## Player cleanup action

Add `Usuń wszystkie nieaktualne` in `openNoticeBoard(settlementId)`.

Scope to:

```ts
bundle.workContracts.postedAt(noticeBoardId(settlementId))
```

For each record use the shared target resolver, not a switch in UI code.

Cleanup `completed` and `missing`; preserve `active`, including temporarily blocked residential construction.

Use the same stale/finalization mutation path as NPC cleanup so state/payment/flag/advertisement rules cannot diverge.

## Existing duplicate resolver to remove/reuse

`src/app/actions/workContractActions.ts::resolveLiveHireTarget()` currently repeats target-kind lookup/completion logic. Rebase it onto the shared resolver where practical.

Do not force hire-help semantics to equal stale semantics: an `active` but temporarily blocked target may still need existing UI-specific availability handling after resolution.

## Persistence

Work Contract lifecycle additions are persisted representation changes.

If implementation adds state/reason/cleanup-owner fields:

- bump `CURRENT_SAVE_VERSION` through the normal migration pipeline;
- old contracts migrate without inferred stale state;
- stale-before-board-cleanup survives save/load;
- target flag does not respawn for stale contracts;
- `advertisement`/`postedBoardId` survive until final cleanup;
- completed cleanup remains terminal after load.

Terrain-preparation completion is already safe across load because `TerrainPreparations.wasCompleted(id)` is reconstructed from persisted completed-area facts.

## Focused tests

Likely files:

- `src/world/workContract.test.ts` / existing pure lifecycle tests;
- `src/world/createWorkContracts.test.ts`;
- new resolver tests beside the resolver;
- focused `NpcAgent` tests only where current harness permits deterministic contract pursuit assertions;
- `src/persistence/saveData.test.ts` for migration/round-trip;
- action tests around `workContractActions` if an existing harness exists.

Important regressions:

- residential material block must not be stale;
- terrain completed tombstone must be `completed`, not `missing`;
- stale contract remains posted but is not discoverable;
- stale target flag stays absent after reload;
- repeated player/NPC cleanup does not duplicate terminal transitions/claims.

## Documentation cleanup after implementation

- remove the 2026-09-05 Work Contracts stale-posting entry from `docs/plans/LOOSE-ENDS.md`;
- update current-state Work Contracts behaviour in `docs/state/player-systems.md` and NPC behaviour in `docs/state/npc.md`;
- regenerate generated docs through normal workflow; do not manually edit generated code maps.
