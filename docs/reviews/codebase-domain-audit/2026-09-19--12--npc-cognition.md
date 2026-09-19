# Codebase Domain Audit 12 — NPC cognition

**Date:** 2026-09-19  
**Master:** `docs/plans/tools-018-codebase-domain-and-flow-audit-master.md`  
**Area:** 12 — NPC cognition  
**Result:** ⚠️ reviewed with unresolved high findings  
**Scope:** code correctness, architecture, lifecycle/persistence, performance only

## Scope

Reviewed current `main` end-to-end across:

```text
NPC/world state
→ needs / problems
→ pressures
→ goals
→ decision
→ strategy
→ action selection
→ execution result
→ authoritative state / history / memory changes
→ next decision
```

The audit intentionally does **not** treat missing features, roadmap gaps or Vision mismatches as findings.

Primary code paths inspected:

- `src/ai/NpcAgent.ts`
- `src/ai/Needs.ts`
- `src/ai/decisionModifiers.ts`
- `src/ai/npcDecision.ts`
- `src/ai/npcStrategies.ts`
- `src/ai/npcPlan.ts`
- `src/ai/npcAction.ts`
- `src/ai/npcAnimalThreat.ts`
- `src/ai/npcAssistance.ts`
- `src/ai/healingPressure.ts`
- `src/ai/burialPressure.ts`
- `src/ai/economicPressure.ts`
- `src/ai/npcTravel.ts` and the off-screen travel/survival checkpoint path
- `src/settlement/npcState.ts`
- `src/settlement/household.ts`
- `src/ai/npcLogistics.ts`
- settlement update/crowd/threat forwarding seams
- persistence/state documentation and related active/planned NPC work.

## Entry points and state owners

### Authoritative cognition state

`NpcAuthoritativeState` is the durable NPC owner for `needs`, health/stamina/vigor, `physicalInjury`, `activePlan`, `personalInventory`, accompany/travel commitments and other durable semantic state.

It is held in `NpcStateRegistry`, shared directly with a live `NpcAgent`, serialized into `SaveData.npcStates`, and reused across settlement reconstruction. There is no second persisted needs/goal store.

`NpcAgent` owns transient execution state: `phase`, `pendingAction`, action lifecycle, combat intent, movement/path/watchdog state, selected-strategy diagnostics and transient `carried` work/logistics inventory.

That split is important: Goal/Plan state may survive reconstruction, while the concrete action is intentionally re-derived.

### Decision pipeline

Detailed NPC cognition currently follows:

```text
tickNeeds()
→ generateNeedPressures()
→ scoreNeedCandidates()
+ weather / healing / burial / corpse / repair / grave-visit pressures
→ pickActionKind()
→ decideNpcAction()
→ ensure/resume NpcPlan
→ strategy candidates + selectStrategy()
→ beginNeed()/special action
→ NpcPlannedAction
→ goTo → execute
→ onComplete world/state mutation
→ choose
```

Threat response is a deliberate hard interrupt outside that pressure arbitration. Critical interruption is throttled and uses a separate, documented precedence.

### Off-screen / time-skip

Purpose-backed off-screen travel has a generic durable `NpcTravelContinuity` owner and a checkpoint/survival path that advances hunger/thirst against world time and consumes personal provisions. That is a separate fidelity mode, not a second permanent needs store.

`NpcAgent.resolveTimeSkip()`, however, contains its own coarse need/action catch-up path. Finding F2 covers the concrete semantic divergence in that path.

## Flows traced

### 1. Needs → pressures → decision

`Needs.ts` owns physiological/duty meters and pressure generation. Personality/role modifiers are applied afterward by `decisionModifiers.ts`; hard eligibility remains outside the modifier layer.

No predicate that is accidentally constant true/false was found in the core need-pressure scorer. `idle` is intentionally always a valid outer fallback rather than an eligibility predicate for another action.

Economic shortage pressure is diagnostic/non-winning by design in current code; it does not silently compete as a second need implementation.

### 2. Goal/Plan → strategy → action

`NpcPlan` is persistent semantic intent, not a queued action list. A need-derived goal can survive interruption/reconstruction; strategy is re-selected from live context; the concrete action is transient.

`selectStrategy()` is first-available-wins and strategy availability is deliberately treated as a decision-time preview. This makes execution-time revalidation essential whenever another actor can consume the selected source before arrival. F1 is the concrete place where that contract is currently violated.

### 3. Interruptions, failure and retry

Combat/flee/collapse/ordinary interruption converge on existing reset/interruption seams that release runtime reservations and return to arbitration. Critical needs are checked at most once per second while `goTo`/`execute` is active; need-driven actions deliberately do not thrash between competing needs mid-action.

Movement/watchdog failure returns to `choose`. Stale real-world sources such as nearby food are revalidated at completion and correctly grant no relief when harvesting fails. F1 shows older household/water/wood paths do not consistently follow the same rule.

### 4. Threat assessment and assistance

Threat candidates are built upstream and passed as a bounded/local list; `NpcAgent` does not scan the entire fauna world per decision. Immediate threat, owned-flock threat and guard-assistance checks reuse that input.

Player-requested food/water assistance is intentionally a synchronous social decision, not a `NeedId` strategy. Its use of `carried` is the explicit plan-152 contract for “what can this NPC hand over now”; it is not treated as a duplicate needs owner in this audit.

### 5. Detailed vs off-screen

Generic purpose-backed travel already uses `survivalResolvedAtDays` to avoid double-resolving an interval and consumes real personal provisions off-screen.

The large current mismatch is not that generic travel mechanism; it is `resolveTimeSkip()`'s older shortcut, which can satisfy needs without equivalent authoritative transactions and hand-clears execution state. That is already owned by `npc-058`.

## Findings

### F1 — HIGH — Detailed need actions can grant need relief after their selected resource became unavailable

**Category:** correctness · architecture  
**Affected flow:** strategy eligibility → action travel → execution result → need/plan state

Decision-time availability is explicitly only a preview, but several `beginNeed()` completion handlers assume the preview is still true.

Confirmed cases:

1. **Household food**
   - strategy selection checks household food availability;
   - at completion `household.takeFood(...)` returns `ItemKind | null`;
   - the return value is ignored and `relieveNeed(..., 'food')` always runs.
   - Two NPCs can therefore select the last food unit; after one consumes it, the other can still get hunger relief for a failed `takeFood()`.

2. **Household water**
   - selection checks `household.water.has(...)`;
   - `WaterReserve.remove()` later clamps at zero and returns no success/failure result;
   - thirst is relieved unconditionally afterward.
   - A different NPC/animal can drain the reserve while this NPC is travelling, making the completion use stale availability.

3. **Wood duty**
   - `harvestWorldTreeFully()` correctly reports failure when another actor felled the selected tree first;
   - failed harvest leaves `harvestedYields` empty;
   - the chained deposit still executes and unconditionally `relieveNeed(..., 'wood')`.
   - No wood is minted, but cognition/duty state records success for work that produced nothing.

The affected needs are authoritative/persisted state and their pressure disappears after the false success, masking the shortage until the meter grows again.

Healthy precedent already exists in the same class: real nearby food gathering revalidates `foodSources.harvest(target)` at completion and grants no relief when it fails; local transfer helpers likewise revalidate live source state before a transfer.

**Existing-plan check:** `npc-058` is time-skip-only; local logistics plans revalidate transfers but do not own personal need relief. No active plan covers the normal detailed `beginNeed()` completion gap.

**New plan:** `npc-059-need-action-result-revalidation-and-atomic-relief.md`.

### F2 — HIGH — Time-skip has a parallel need/action semantics that can create free satisfaction and stale execution ownership

**Category:** correctness · architecture · lifecycle/persistence  
**Affected flow:** detailed action/state → time-skip → post-skip authoritative needs/action state

`NpcAgent.resolveTimeSkip()` samples needs but applies simplified outcomes:

- water calls household `remove` then relieves thirst regardless of whether enough stock existed;
- food relieves hunger without consuming real food;
- wood can be relieved from the mere presence of tree landmarks without a harvest/deposit transaction;
- water duty adds reserve directly;
- final reset hand-clears execution fields instead of using the complete interruption/cleanup seam.

This creates different consequences for the same NPC state depending on whether time advanced normally or through skip, and can persist the resulting need state.

**Existing-plan check:** fully covered by planned high-priority `npc-058-time-skip-resource-and-interrupt-parity.md`, whose explicit scope includes atomic “resource mutation succeeded → relief” semantics and shared interruption cleanup.

**New plan:** none.

### F3 — HIGH — Burial pressure can release another NPC's valid corpse claim by consulting the scanner's Plan

**Category:** correctness · architecture · lifecycle  
**Affected flow:** social problem pressure → target claim ownership → action continuation

`resolveBurialPressure()` iterates deceased NPC states and calls:

`recoverStaleNpcBurialClaim(post, claimantHasMatchingPlan(input.activePlan, deceasedId))`

before checking whether the corpse claim belongs to the scanning NPC.

`input.activePlan` belongs to the **current scanner**, not to `post.burialClaimantId`. Therefore NPC B scanning a corpse already claimed by NPC A can classify A's claim as stale simply because B does not have A's burial plan, release the claim, and destabilize the in-flight burial.

The correct ownership lookup is already available through the burial hooks/state registry and is also the behavior required by the existing burial contract: validate the actual claimant against its authoritative plan.

This concrete identity/ownership bug was previously identified in the living-world synthesis and is still present on current `main`.

**Existing-plan check:** `npc-011-npc-burial-and-graves.md` is still `verification needed` and already owns the invariant “one deceased → at most one claim owner” plus claimant revalidation. This is an implementation defect inside that plan's existing contract, so creating a duplicate plan would be wrong.

**New plan:** none; fix under `npc-011` before its verification is considered complete.

### F4 — MEDIUM — Healing cognition reads transient work cargo instead of authoritative personal belongings

**Category:** correctness · architecture · lifecycle/persistence  
**Affected flow:** injury state → healing pressure → treatment eligibility → heal action

In `NpcAgent.choose()`, treatment eligibility is derived from `this.carried.findInjuryTreatment(injurySeverity)`, and the same transient inventory is used by the healing execution/debug path.

But `NpcAuthoritativeState.personalInventory` is the durable owner of personal belongings; `carried` is runtime-only profession/work/logistics cargo and is discarded on reconstruction. A treatment legitimately owned by the NPC in `personalInventory` can therefore be invisible to autonomous healing, while a transient work payload can influence healing eligibility.

**Existing-plan check:** planned `npc-032-expedition-needs-and-survival.md` explicitly contains the shared, non-companion-specific correction `carried → personalInventory` for healing pressure, execution and debug state.

**New plan:** none.

## Architecture observations

### Healthy seams to preserve

- `NpcAuthoritativeState` is a clear persistent owner; `NpcAgent` does not maintain a second copy of durable needs/plan state.
- Need generation, personality modifiers, outer decision arbitration, strategy selection and action execution are distinct layers.
- `NpcPlan` stores durable intent while actions remain transient; reconstruction re-derives concrete work.
- critical interruption is throttled and centralized rather than every pressure producer adding its own per-frame cancellation loop.
- threat input is caller-bounded/local; cognition does not perform a whole-fauna scan per NPC.
- off-screen travel has an exactly-once world-time checkpoint and consumes authoritative personal provisions.
- local resource exchange paths revalidate source state at pickup; nearby-world-food harvesting revalidates at completion.

### Performance observations

No new cognition-specific high/medium performance defect was confirmed.

- `generateNeedPressures`, candidate scoring and strategy construction allocate short arrays/objects, but the main decision path runs on `choose`, not every frame.
- critical need re-check is throttled to once per second while an action is in flight.
- threat checks scan a caller-bounded candidate list rather than the full world.
- the settlement NPC crowd pass remains pairwise O(N²), but it jointly owns physical separation and reaction-neighbor counts and is an existing cross-domain performance concern better handled by area 13/24 rather than duplicated here.

## Cross-domain dependencies / follow-ups

- Area 13 should verify action cancellation/retry and stream-out behavior after `npc-059`, especially chained work actions.
- Area 15 should treat threat-response ordering as already outside ordinary pressure arbitration rather than adding a second combat decision table.
- Area 24 should own any decision/crowd profiling and determine whether decision allocations or the pairwise crowd pass matter at target populations.
- Persistence review should verify that no future fix moves concrete action state into `NpcAuthoritativeState`; only semantic commitments/results belong there.

## Existing plans that already cover findings

- `npc-058-time-skip-resource-and-interrupt-parity.md` — F2.
- `npc-011-npc-burial-and-graves.md` — F3's claim-owner invariant and claimant revalidation; current implementation still violates it.
- `npc-032-expedition-needs-and-survival.md` — F4 shared healing inventory ownership correction.
- `npc-008-agent-decision-architecture-refactor.md`, `ai-003-npc-candidate-strategies.md`, `ai-004-npc-goals-and-persistent-plans.md` — architecture context; no duplicate decision framework required.

## New plans required

1. `npc-059-need-action-result-revalidation-and-atomic-relief.md` — HIGH — F1.

No new plans were created for F2–F4 because existing plans already own those corrections.

## Verification limits

This was a source/code-path audit against current `main`. No browser verification was run, per project rules.

No production finding was inferred from missing gameplay features or Vision differences. No finding was implemented.

The performance conclusions are structural/static; no profiler benchmark was run.

## Master status update

Area 12 → **⚠️ reviewed with unresolved high/critical findings** because F1–F3 remain unresolved.
