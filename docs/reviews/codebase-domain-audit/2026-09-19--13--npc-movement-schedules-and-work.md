# Codebase domain audit 13 — NPC movement, schedules & work

**Date:** 2026-09-19  
**Audited branch:** `main`  
**Audited HEAD:** `56a72b0d8bcc97b911744ef22de89650fae4974e`  
**Scope:** code correctness, architecture, lifecycle/persistence, performance only

## Scope

Traced the production flow:

```text
schedule / decision
→ activity
→ destination selection
→ route / movement target
→ locomotion
→ arrival
→ work/action execution
→ completion/failure/interruption
→ cleanup / resume
→ next activity
```

The review covered ordinary scheduled work, profession work, Work Contracts, long-distance travel/accompany, movement targets/routes, watchdog/recovery, stamina/vigor interruption, off-screen travel, time skip and save/rebuild continuity.

Missing features, gameplay depth and Vision mismatches were not treated as findings.

## Entry points and state owners

- `src/ai/NpcAgent.ts` — detailed runtime FSM, action execution, locomotion, interruption/resume, schedule dispatch and Work Contract execution.
- `src/ai/schedule.ts` — pure role schedule + trait overlays and cyclic activity resolution.
- `src/ai/npcProfessionWork.ts` — profession destination/work planners producing `NpcPlannedAction`.
- `src/economy/npcWork.ts` / `productionExecutor.ts` — work-completion mutations.
- `src/ai/npcMovementWatchdog.ts` — low-progress detection and escalation.
- `src/ai/npcMovementRecovery.ts` — context-safe cave/surface recovery and time-skip placement.
- `src/ai/npcTravel.ts` / `npcTravelCheckpoint.ts` — persistent detailed ↔ off-screen travel continuity.
- `src/settlement/npcState.ts` — durable NPC identity/state; transient FSM/path/action state is rebuilt.
- Work Contracts remain world-owned; `NpcAgent` resolves/evaluates them fresh rather than copying contract state.

Movement ownership is mostly coherent: the concrete action owns its destination, `startAction()` commits the movement target and resets watchdog/repath state, while temporary route/repath waypoints are execution-only.

## Flows traced

### Schedule → work

`activityAt(effectiveSchedule)` feeds `beginIdle()`. Idle duty dispatch runs before routine schedule work:

```text
escort fulfilment
→ accompany
→ committed travel
→ Work Contract
→ follow-up / voluntary join
→ ordinary schedule
```

For scheduled `work`, `planProfessionWork()` first tries profession-specific work; the generic workplace action is only a fallback. Completion mutates economy/items through existing domain callbacks.

No second persistent “current activity” owner was found: schedule is an input to arbitration, while `pendingAction`/phase own transient execution.

### Movement / arrival

`startAction()` normalizes the destination, rejects recently abandoned targets, installs `pendingAction`, commits movement target state, resets watchdog/repath and enters `goTo`.

Ordinary arrival is gated by `steerWithRescue(...)`; skirt/bypass waypoint arrival does not complete the real action while the actual destination remains outside `ARRIVE`. Queue actions additionally require promotion to serving before entering `execute`. Cave actions use the composed spatial route and only enter execute after its route reports `arrived`.

No predicate effectively always true/false and no generic false-arrival path was confirmed in the movement FSM.

### Failure / interruption / resume

Stuck escalation is:

```text
low progress
→ repath
→ local escape
→ abandon
→ repeated abandon → emergency teleport (surface only)
```

Abandon uses the common in-flight reset, fails the action lifecycle and marks the persistent Plan interrupted. Critical needs/vigor and threat/combat interruption also return through centralized cleanup/re-arbitration instead of storing a second “resume exact action” state.

Stamina exhaustion preserves the current phase, rests in place, resets the watchdog baseline and resumes the interrupted phase after recovery.

### Off-screen / reconstruction

Long-distance travel has durable `NpcAuthoritativeState.travel`; local route/path/watchdog state stays transient. Stream-out hands progress to timestamp-based off-screen execution and stream-in reconstructs detailed execution from the durable checkpoint.

This boundary is correct in shape, but two concrete parity defects remain below.

## Findings

### F1 — HIGH — Work Contract targets can be completed/invalidated remotely before physical arrival

**Category:** correctness · lifecycle  
**Affected flow:** accepted Work Contract → travel → target discovery → work/completion

Current Work Contract pursuit re-resolves the live target before the NPC necessarily reaches the advertised destination. Missing/completed targets can immediately trigger `invalidateTarget()` / `completeWork()`.

That means target discovery/terminalization is not consistently gated by physical arrival: an NPC may “learn” that work disappeared or completed without reaching the site. This also bypasses the intended travel → arrival → validate → work/fail ordering.

**Files/symbols:** `src/ai/NpcAgent.ts` Work Contract pursuit branches; `src/world/createWorkContracts.ts`.

**Existing coverage:** `npc-037-stale-work-contract-target-discovery-and-notice-cleanup.md` already owns this exact correction.

**Next action:** implement/reverify under `npc-037`; no duplicate plan.

### F2 — HIGH — Time skip is a parallel work/need lifecycle with divergent resource and cleanup semantics

**Category:** correctness · lifecycle · architecture  
**Affected flow:** active movement/work → time skip → catch-up → resume

`NpcAgent.resolveTimeSkip()` does not use the same transaction and interruption semantics as live execution. Confirmed current differences include free/aggregate need relief and hand-written in-flight reset logic. The time-skip path can therefore produce different resource outcomes and cleanup state than equivalent elapsed normal simulation.

This matters directly to movement/work continuity because queues, reservations, route/action lifecycle and committed travel must not survive or disappear under different rules merely because time advanced through skip.

**Files/symbols:** `NpcAgent.resolveTimeSkip()`, `finishTimeSkipMovementReset`, `catchUpCommittedTravel`, `SettlementsManager.resolveTimeSkip()`.

**Existing coverage:** `npc-058-time-skip-resource-and-interrupt-parity.md`.

**Next action:** implement under `npc-058`; no duplicate plan.

### F3 — HIGH — Profession/local work cargo can be lost across save/rebuild after the source was already mutated

**Category:** lifecycle/persistence · correctness · architecture  
**Affected flow:** work/logistics pickup → movement → deposit → reconstruction

Several profession/local-economic flows remove goods from an authoritative source and then keep the in-transit value only in `NpcAgent.carried` or action closure state. Those are transient execution owners and are discarded on `NpcAgent` reconstruction/save-load.

A stream/rebuild/save boundary between pickup and deposit can therefore preserve the reduced source while losing the goods and the continuation needed to deposit them.

**Files/symbols:** `src/ai/npcProfessionWork.ts`, `src/ai/npcLogistics.ts`, `NpcAgent.carried`, `src/settlement/npcState.ts`.

**Existing coverage:** `settlements-npcs-052-persistent-economic-work-cargo-and-local-transfer-conservation.md`.

**Next action:** implement under `settlements-npcs-052`; no duplicate plan.

### F4 — HIGH — Off-screen accompany survival stops advancing after the captured spatial ETA

**Category:** off-screen lifecycle · correctness  
**Affected flow:** detailed accompany/travel → stream-out → ETA reached → remain off-screen → reification

`npcTravelCheckpoint.ts::survivalToDays()` clamps survival settlement to `execution.arrivesAtDays`:

```ts
return Math.min(nowDays, travel.execution.arrivesAtDays)
```

For an active accompany commitment, spatial travel may intentionally remain present after reaching the captured destination so live follow can later retarget. In that state an unloaded NPC can remain off-screen after the ETA while hunger/thirst/injury survival no longer advances.

Spatial interpolation being capped at the destination is valid; survival time being capped to the same ETA is not.

**Files/symbols:** `src/ai/npcTravelCheckpoint.ts::survivalToDays`, `resolveNpcTravelCheckpoint`, `src/ai/npcTravel.ts::resolveOffscreenNpcTravel`.

**Existing coverage:** `npc-032-expedition-needs-and-survival.md`, recon gap 6.

**Next action:** implement the generic checkpoint correction under `npc-032`; no duplicate plan.

### F5 — HIGH — Detailed long-distance NPCs can still select home-local need destinations/resources

**Category:** correctness · architecture  
**Affected flow:** committed travel/accompany → urgent need interruption → destination selection → need action → resume travel

Long-distance travel is correctly a low-priority persistent commitment, so an urgent need may interrupt it. The problem is source locality: ordinary `beginNeed()` still evaluates household/home garden/home well/settlement sources using the NPC's home context.

For an NPC physically far away, this can select a destination/resource that is not local to the current position, causing travel to be interrupted by movement back toward home or by logically remote household/settlement access. The resume architecture itself is sound; the destination/source candidate set is not travel-local.

**Files/symbols:** `NpcAgent.beginNeed()`, `resolveWaterWellTarget()` (uses `home` as lookup origin), food/household strategy selection, committed travel/accompany idle duty.

**Existing coverage:** `npc-032-expedition-needs-and-survival.md`, recon gaps 1–2 and Travel schedule boundary.

**Next action:** implement under `npc-032`; no duplicate plan.

### F6 — MEDIUM — Loaded-settlement crowd proximity/separation remains unconditional O(N²) per frame

**Category:** performance/scalability  
**Affected flow:** loaded settlement update → NPC crowd pass → per-NPC update/separation

`src/ai/npcCrowd.ts::createNpcCrowdPass().run()` checks every pair `i < j` every frame and calls `Math.hypot` before applying both group-reaction counts and separation.

This is a real O(N²) recurring path, but it is **not a current measured bottleneck**: the 2026-09-17 settlement-heavy benchmark reports 53 loaded NPC and crowd pass `0.0 ms/frame` (13.7 ms cumulative), while total NPC time was 6.2 ms/frame.

**Existing coverage:** issue `docs/issues/2026-08-15--031--unbounded-proximity-scans-fauna-settlement.md` explicitly tracks this shape and intentionally defers implementation until population/measurements justify it. Area 12 also handed this concern to areas 13/24.

**Next action:** no implementation plan now. Keep issue 031 as the tracker and let area 24 reassess with target-population benchmarks; create a plan only when the measured/scaling threshold justifies work.

## Architecture observations

Healthy seams to preserve:

- schedule templates are pure derived inputs, not a second current-activity state machine;
- concrete action destination ownership is centralized at `startAction()`;
- route/repath/watchdog state is execution-only and reset at action boundaries;
- queue promotion is an additional arrival gate before work executes;
- cave movement/recovery does not silently project underground NPCs to surface;
- stamina exhaustion resumes the same execution phase without inventing a second action;
- interruption keeps persistent semantic commitments/Plans and re-derives concrete actions;
- profession planners return actions; domain mutation remains in economy/world owners;
- off-screen travel is timestamp/checkpoint based rather than a hidden per-frame remote NPC loop.

Recovery includes a last-resort emergency teleport, but it is reached only after repeated abandon escalation and is surface-gated. No evidence was found that it is currently masking a deterministic always-unreachable destination class; keep it diagnostic and rare.

## Cross-domain dependencies / follow-ups

- Area 03 should verify final persistence ownership after `settlements-npcs-052` moves economic work cargo into authoritative NPC state.
- Area 08 should own shared navigation/pathfinding complexity beyond the NPC-specific movement executor.
- Area 15 should verify combat/threat cancellation against the same `resetInFlightAction()` invariants.
- Area 24 should reassess issue 031 using target NPC populations and the existing `agentCpuDiag` crowd-pass measurement before introducing a spatial index/cadence mechanism.
- Area 11 already owns the economic conservation half of F3.

## Existing plans that already cover findings

- `npc-037-stale-work-contract-target-discovery-and-notice-cleanup.md` — F1.
- `npc-058-time-skip-resource-and-interrupt-parity.md` — F2.
- `settlements-npcs-052-persistent-economic-work-cargo-and-local-transfer-conservation.md` — F3.
- `npc-032-expedition-needs-and-survival.md` — F4–F5.
- `npc-027-spatial-context-and-cave-traversal.md` and `settlements-npcs-028-long-distance-npc-travel-and-expedition-movement.md` are relevant implemented/verification-needed architecture context, not duplicate fix plans.

## New plans required

None.

Every high finding already has an owning active/planned plan. F6 is already tracked by issue 031 and current measurements support its explicit deferral; creating a new optimization plan now would duplicate a deliberately deferred tracker without evidence that it is worth implementing.

## Verification limits

This was a source/code-path audit against current `main`. No browser verification was run, per project rules. No production finding was inferred from missing features or Vision differences.

No finding was implemented.

The O(N²) conclusion is structural and was cross-checked against the existing 2026-09-17 settlement-heavy benchmark; no new benchmark was run in this review.

## Master status update

Area 13 → **⚠️ reviewed with unresolved high/critical findings**.

Unresolved high findings are already owned by `npc-037`, `npc-058`, `settlements-npcs-052` and `npc-032`.
