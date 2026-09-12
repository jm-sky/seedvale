# Plan: Work Contracts — Stale Target Discovery and Notice Cleanup

**Created:** 2026-09-12
**Status:** `planned` 📋
**Type:** fix
**Priority:** high · **Effort:** M
**Depends on:** ~~npc-018~~, ~~npc-028~~
**Domain:** `npc`
**Subdomains:** `work` `behavior`
**Tags:** `work-contracts` `notice-board` `stale-targets` `persistence`
**Roadmap:** -

## Goal

Make stale Work Contracts behave like physical information in the world instead of being cleaned up remotely as soon as the simulation notices a missing/completed target.

Primary NPC flow:

```text
NPC sees advertised contract
→ accepts assignment
→ travels to the advertised target location
→ at arrival resolves the live target
→ discovers that the work no longer exists / is already complete
→ marks the contract as stale and stops work execution
→ returns to its settlement / notice board
→ removes the stale advertisement
→ resumes normal settlement behaviour
```

Player flow at a notice board:

```text
open notice board
→ "Usuń wszystkie nieaktualne"
→ resolve advertised targets through the same target validator
→ remove advertisements whose targets are missing or complete
```

Do not add global polling that proactively deletes every stale contract when world state changes. A stale advertisement may persist until an NPC physically discovers the problem or the player cleans the board.

## Current verified state

### Contract ownership and lifecycle

- `src/world/workContract.ts` owns authoritative contract/assignment state.
- Contract state is currently coarse: `available | advertised | active | settling | completed | cancelled | invalidated`.
- Assignment state is currently: `accepted | travelling | working | payment_due | paid | unpaid | uncollectable | released`.
- `src/world/createWorkContracts.ts` is the only runtime mutation authority for posting, acceptance, travel/work transitions, completion, release and target invalidation.
- `WorkContracts.post()` only applies structural `canPostContract(...)`; target validity is not consulted.
- `invalidateTarget()` immediately calls `invalidateWorkContract(...)` and removes the target flag.

### Current stale-target behaviour

`src/ai/NpcAgent.ts` re-resolves targets inside the contract pursuit branches:

- well construction: missing record → immediate `invalidateTarget()`; completed well → immediate `completeWork()`;
- terrain preparation: missing active record + `wasCompleted(id)` → immediate `completeWork()`; otherwise immediate `invalidateTarget()`;
- palisade / standing torch / residential building follow the same direct resolve-and-finish/invalidate direction;
- these checks happen before the NPC necessarily reaches the destination.

Therefore an NPC may currently learn remotely that a target disappeared/completed and terminalize the contract without visiting the site or returning to the board.

### Existing target-specific truth

Current target kinds:

```text
construction
terrain_preparation
palisade
standing_torch
residential_building
```

Their authoritative completion/existence rules already exist in target-owned modules and must remain authoritative.

Important distinction:

- a missing well/palisade/torch/residential record means the target was removed/invalidated;
- terrain preparation has explicit persisted completion facts through `TerrainPreparations.wasCompleted(id)`, so missing active record can still mean successful completion;
- `residentialBuildingRemainingWork(record) === 0` may mean a material-blocked current stage, not completion. Stale validation must use `isResidentialBuildingComplete(...)`, not `remainingWork <= 0`.

### Duplicate target resolution today

Target lookup/completion logic is currently repeated in at least:

- `NpcAgent` contract pursuit,
- `src/app/actions/workContractActions.ts::resolveLiveHireTarget()` / hire-help candidate construction,
- removal flows which locate a contract by target and call `invalidateTarget()`.

This is the natural seam for one shared read-only target resolver.

### Notice board

- `noticeBoardId(settlementId)` gives stable board identity.
- NPC contract discovery is local: an NPC only queries `discoverableAt(noticeBoardId(itsSettlementId))`.
- `SettlementLandmarks.noticeBoard` already supplies the physical board position.
- `openNoticeBoard(settlementId)` in `workContractActions.ts` is the player-facing board surface and currently only lists postable contracts.

### Persistence

- Work Contracts persist through `SaveData.workContracts` and restore as normal contract-owned state.
- Current save schema baseline is `CURRENT_SAVE_VERSION = 32`.
- Terrain-preparation completion facts are persisted independently and reconstruct `wasCompleted(id)` after load.

Any new persisted contract/assignment state must use the existing save-version migration pipeline; do not infer an in-progress stale-return flow from transient `NpcAgent` action state after load.

## 1. Add one shared Work Contract target resolver

Add a narrow, read-only target-resolution helper owned near the Work Contract/world domain, for example:

```text
src/world/workContractTarget.ts
```

Do not create a `WorkTargetManager` or second target registry.

The resolver must consume the existing target registries and return a discriminated result equivalent to:

```text
active
completed
missing
```

For `active`, include the authoritative current position and useful-work information needed by existing callers.

The resolver must preserve a distinction between:

```text
active + workable
active + temporarily blocked
completed
missing
```

when needed by the target kind. In particular, a material-blocked residential building is still an existing unfinished target and must never be classified stale.

Reuse target-owned helpers:

- wells: lookup + `isWellCompleted` / `wellRemainingWork`,
- terrain preparations: `find` + `wasCompleted` + `terrainPreparationRemainingWork`,
- palisades: lookup + `isPalisadeConstructionComplete` / `palisadeRemainingWork`,
- standing torches: lookup + `isStandingTorchConstructionComplete` / `standingTorchRemainingWork`,
- residential buildings: lookup + `isResidentialBuildingComplete` / `residentialBuildingRemainingWork`.

Add JSDoc to this resolver because it becomes the single cross-system target-validity contract used by NPC behaviour and player cleanup. Use `@domain npc`.

## 2. Keep `canPostContract` structural; validate posting through the shared resolver

Do not make pure `world/workContract.ts::canPostContract(record)` depend on live world registries.

Keep it as the state-machine predicate:

```text
available + not_posted
```

At the player notice-board posting seam, re-resolve the target immediately before `WorkContracts.post(...)`.

Rules:

- `active` unfinished target → allow posting;
- `completed` / `missing` target → do not post; report that the work is no longer current;
- temporary residential material blocking is not stale and does not invalidate an otherwise unfinished contract.

This prevents knowingly posting an already-dead contract without adding global proactive cleanup after later world changes.

## 3. NPC travel uses the advertised target location as fallback knowledge

Once an NPC has accepted an advertised contract, the contract's persisted `x/z` is the location described by the advertisement and is sufficient to let the NPC investigate the site.

During `accepted` / `travelling`:

- if the shared resolver returns an active target, use its authoritative live position as today;
- if it returns `completed` or `missing`, do **not** remotely finish/invalidate the contract;
- continue toward the contract's stored `x/z` as the NPC's last advertised destination.

Only after the NPC reaches the target arrival radius should it classify the contract as stale.

This is a deliberate exception to npc-018's old "always resolve travel position from the live target" rule: when the live target no longer exists, the advertisement's persisted location is the only physically meaningful location an NPC could investigate.

Do not change `x/z` into a second authoritative target position while the target exists.

## 4. Add an explicit stale-target lifecycle transition

Add persisted lifecycle state sufficient to represent:

```text
travelling
→ stale-target-detected
→ return to notice board
→ terminal contract cleanup
```

Preferred shape:

- add a coarse contract state such as `stale` meaning "target has been confirmed stale but advertisement cleanup is still pending";
- add an assignment state such as `stale_target_detected` for the NPC responsible for the physical return/report;
- persist the stale reason as a narrow discriminant (`completed` / `missing`) only if required to preserve the correct final completion-vs-invalidation/payment semantics after save/load.

Do not model the return journey only as transient `NpcAgent.phase`/action state. After save/load, the NPC must still know that it is returning because of a stale contract rather than resume work or schedule behaviour.

`stale` must:

- be non-discoverable,
- reject new acceptance,
- no longer show an active target flag,
- preserve the board advertisement until cleanup is finalized,
- never be interpreted as `working`/useful work remaining.

Update `contractHasActiveTarget(...)` accordingly so stale contracts do not respawn the world target flag after load.

## 5. Return behaviour

When the NPC detects stale work at the target:

1. transition through the authoritative Work Contracts mutation seam;
2. end/replace the current target work action cleanly;
3. navigate back to `SettlementLandmarks.noticeBoard` for the NPC's own settlement;
4. on arrival, finalize stale cleanup through `WorkContracts`;
5. allow normal decision/schedule flow to resume.

The NPC accepted the contract only from `noticeBoardId(itsSettlementId)`, so its own settlement board is the correct physical return destination for the current system.

If exact board data is temporarily unavailable, fall back to the settlement/home destination rather than teleporting or terminalizing the contract remotely; keep the authoritative stale state pending until a valid cleanup path is available.

## 6. Final cleanup semantics: logical fact first, advertisement removal on return

Choose this ownership split:

```text
at target:
  detect stale fact
  → mark contract stale immediately
  → stop discoverability / work execution immediately

at notice board:
  finalize contract lifecycle
  → clear advertisement / postedBoardId
  → enter existing terminal outcome
```

This avoids letting another NPC accept a contract that is already known stale, while preserving the visible-world consequence that the posted notice remains until somebody returns to remove it.

Final outcome must reuse existing semantics:

- stale reason `completed` → use the existing successful work-ending/payment-claim semantics rather than pretending the target was deleted;
- stale reason `missing` → use existing invalidation semantics;
- no synthetic work credit;
- never increment `npcWorkCompleted` merely for discovering or reporting stale work.

## 7. Multi-worker safety and idempotence

`npc-028` allows multiple assignments, so stale handling must be contract-wide and idempotent.

When one worker confirms stale target:

- contract becomes non-discoverable immediately;
- no new worker can accept it;
- all other work-active assignments must be prevented from resuming useful work against that target;
- choose one deterministic cleanup/report owner (prefer the detecting NPC; persist the owner if necessary for save/load);
- other affected assignments must transition through existing claim/release semantics without duplicating wage claims or contract cleanup.

`mark stale` and `finalize stale cleanup` mutations must safely no-op when another actor already performed the same transition.

Do not let two NPCs remove the same advertisement twice or freeze the same payment claim twice.

## 8. Player action: `Usuń wszystkie nieaktualne`

Add the action to the notice-board UI in `src/app/actions/workContractActions.ts`.

Scope it to the board currently being inspected:

```text
bundle.workContracts.postedAt(boardId)
```

For every advertised contract on that board:

1. resolve its target through the exact same shared target resolver used by NPC stale detection;
2. keep `active` unfinished targets;
3. cleanup `completed` or `missing` targets through the same authoritative stale/finalization mutations;
4. treat already-stale/finalized contracts idempotently.

The player action must not maintain a separate target-kind switch or UI-only stale predicate.

Show a concise result such as:

```text
Usunięto 3 nieaktualne ogłoszenia.
```

If none are stale, leave current contracts untouched and report that there was nothing to remove.

Do not turn this into a global contract-management screen or scan other settlements' boards remotely.

## 9. Existing creation / hire-help flow

Replace `workContractActions.ts::resolveLiveHireTarget()`'s duplicated existence/completion switch with the shared resolver where practical.

Preserve current hire-help semantics:

- missing/completed target cannot receive a new contract;
- material-blocked unfinished residential building remains a valid existing target but may still be unavailable for immediate work according to current hire/work rules;
- one-active-contract-per-target remains owned by `WorkContracts.hasActiveContract(...)`.

This keeps creation, NPC execution and cleanup aligned on one target identity/completion vocabulary.

## 10. Persistence and migration

Because stale discovery/return must survive save/load, persist the minimal new lifecycle data in `SaveWorkContract` / assignment state.

If the persisted representation changes:

- bump `CURRENT_SAVE_VERSION` from the current baseline,
- add the normal `SAVE_MIGRATIONS` step,
- old saves load every existing contract exactly as before with no inferred stale state,
- save/load during `stale_target_detected` restores the NPC's return/report obligation,
- save/load after stale fact was detected but before board cleanup preserves the board advertisement and non-discoverable contract state,
- save/load after cleanup does not resurrect target flag, posting or assignment work.

Continue serializing Work Contracts through `src/app/saveState.ts`; do not add a parallel persistence collection.

## 11. Tests

Extend focused tests rather than adding browser automation.

### Shared target resolver

Cover every current target kind:

- existing unfinished,
- completed,
- missing,
- terrain-preparation completed tombstone,
- material-blocked residential building remains active/not stale.

### Contract domain / registry

Cover:

- stale transition is idempotent,
- stale is non-discoverable and cannot accept another worker,
- stale target flag is removed,
- board advertisement remains until final cleanup,
- final cleanup clears posting exactly once,
- correct completed-vs-missing terminal semantics,
- multi-worker cleanup does not double-freeze claims or leave a work-active assignment capable of resuming work.

### NPC contract behaviour

Cover or add deterministic method-level tests for:

- target disappears while travelling → NPC still travels to stored contract `x/z`;
- completed target while travelling → same;
- arrival at stale target → explicit stale transition;
- stale assignment returns toward notice board;
- cleanup at board finalizes the contract;
- save/load-equivalent restored stale state resumes return rather than work.

### Player board action

Cover:

- only current board's advertised stale contracts are removed,
- active contracts stay,
- completed + missing use shared resolver,
- repeated `Usuń wszystkie nieaktualne` is harmless,
- material-blocked residential target is not removed.

## 12. Documentation updates after implementation

Update only current-state docs whose behaviour changes:

- `docs/state/player-systems.md` — Work Contract stale-target / board cleanup behaviour,
- `docs/state/npc.md` — NPC stale contract discovery and return consequence,
- `docs/plans/LOOSE-ENDS.md` — remove the 2026-09-05 `post()/canPostContract` stale-target loose end once covered.

If new public resolver/lifecycle symbols affect generated navigation, regenerate via the normal docs workflow rather than editing generated code-map content manually.

## Non-goals

Do not implement:

- global periodic stale-contract sweeps,
- immediate automatic deletion whenever any target changes,
- remote cleanup of another settlement's notice board,
- new contract target kinds,
- new wage/payment policy,
- NPC-employer contracts,
- workforce-management UI,
- a generic world-target manager,
- new off-screen long-distance travel simulation.

## Verification

Manual browser verification remains the user's responsibility.

Verify these gameplay scenarios manually after implementation:

1. Post a contract, let an NPC accept, complete/remove the target before arrival; NPC still visits the advertised location, discovers no work, returns to its board and removes the ad.
2. Save while NPC is travelling toward a now-stale target; load; NPC continues to investigate rather than remotely invalidating.
3. Save after stale discovery while NPC is returning; load; NPC continues the return/report flow.
4. Leave multiple stale ads on one board; player uses `Usuń wszystkie nieaktualne`; only stale ads disappear.
5. A valid unfinished contract and a material-blocked residential contract survive the cleanup action.
6. A stale contract is never accepted by another NPC after the first stale discovery.

## Completion criteria

The implemented behaviour is:

```text
ADVERTISEMENT IS PHYSICAL INFORMATION

posted contract
→ target may later disappear / complete
→ advertisement remains stale
→ NPC may still accept it
→ NPC investigates advertised location
→ confirms stale target on arrival
→ contract becomes non-discoverable
→ NPC returns to settlement board
→ advertisement is removed
→ existing completion/invalidation/payment semantics finalize once
```

and:

```text
PLAYER BOARD CLEANUP

open notice board
→ Usuń wszystkie nieaktualne
→ same target resolver as NPC
→ remove completed/missing advertisements only
```

No stale-target predicate is duplicated between NPC and player UI, and save/load cannot resurrect or lose an in-progress stale-report lifecycle.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
