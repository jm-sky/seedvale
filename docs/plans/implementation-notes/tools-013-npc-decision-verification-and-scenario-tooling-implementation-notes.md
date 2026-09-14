# Implementation Notes: tools-013 NPC decision verification and scenario tooling

## Recon baseline

Refreshed against current `main` on 2026-09-14. The core observability stack already exists and should be extended, not replaced.

- `src/debug/npcTrace.ts` owns bounded typed semantic history (`NPC_TRACE_CAPACITY = 150`).
- `src/ai/NpcAgent.ts` owns live per-NPC traces and records authoritative need/strategy/action/combat/threat/Work Contract transitions.
- `src/debug/npcInspector.ts` resolves live NPCs and exposes NPC/settlement histories through shared `HistoryFilter` semantics.
- `src/debug/npcDebugApi.ts` owns `window.seedvale.debug`; extend this API rather than creating another global.
- `src/ui/createNpcInspector.ts` is debug-only, vanilla DOM, low-frequency and bounded; keep it that way.
- Live NPC trace history is not persisted across settlement unload/rebuild.

Since the original recon, `npc-030` added scope-discriminated Work Contracts and expedition escort. tools-013 must account for that current implementation.

## Animal threat scoring

`src/ai/npcAnimalThreat.ts` remains the correct pure owner.

Relevant symbols:

- `AnimalThreatDecisionInput`
- `scoreAnimalThreatIntents()`
- `decideAnimalThreatResponse()`
- `senseImmediateAnimalThreat()`

The scorer already produces `defend` and `flee` candidates from weapon capability, health and neuroticism. `NpcAgent` currently records only the chosen response, `canFight` and health ratio.

Implementation guidance:

- calculate threat scores once and use that same result for both selection and diagnostics,
- do not reproduce scoring in `NpcAgent`, inspector or debug code,
- record enough plain data to explain the arbitration: candidate scores, melee/ranged capability, health ratio and neuroticism,
- represent unavailable `defend` safely: internal `-Infinity` must not leak as an unsafe/non-portable JSON value.

## Work Contract scoring is now scope-aware

`src/ai/npcWorkContract.ts` remains the single scoring owner.

Current relevant symbols include:

- `WorkContractEvaluationInput`
- `scoreWorkContractOpportunity()`
- `selectBestWorkContract()`
- `ScoredWorkContract`
- `EscortEvaluationContext`
- `DEFAULT_ESCORT_EVALUATION_CONTEXT`

`WorkContractRecord.scope.kind` now distinguishes:

- `measurable_work`
- `expedition_escort`

`contract.evaluated` still stores only `{ contractId, score }`, so the diagnostics gap remains.

### `measurable_work` breakdown

The current formula uses:

- expected reward,
- role suitability,
- travel cost,
- expected-work cost,
- schedule conflict,
- provisioning feasibility penalty.

### `expedition_escort` breakdown

The current formula uses:

- offered `rewardCoins`,
- escort-specific role suitability,
- relation bonus,
- local reputation bonus,
- renown bonus,
- `curious` trait bonus,
- expected-away cost (`escortAwayHours()`),
- danger penalty,
- schedule conflict,
- provisioning feasibility penalty via `estimateEscortProvisionNeed()`.

Do not force these into one flat pseudo-formula. Prefer a discriminated diagnostics result, e.g. conceptually:

- `kind: 'measurable_work'` + measurable terms + total score,
- `kind: 'expedition_escort'` + escort terms + total score.

Exact names should follow current code terminology.

Important architecture decision:

- refactor the pure evaluator so each candidate's terms and final score are calculated once,
- `selectBestWorkContract()` must select from that same structured result,
- `scoreWorkContractOpportunity()` may remain as a compatibility wrapper returning only `.score`,
- preserve existing acceptance semantics (`score > 0`) and deterministic stable ties,
- impossible provisioning must remain rejection-equivalent internally but expose a serialization-safe reason/state in trace/debug data.

`src/ai/npcPersonalProvisions.ts` is part of this seam: measurable work and escort use different estimators but the diagnostic result should reflect the actual scope-specific path used.

## Existing Work Contract lifecycle to reuse

Do not assume every Work Contract is construction.

Current code already has expedition escort integrated into the shared Work Contract lifecycle. `NpcAgent` starts the existing npc-029 accompany commitment and already emits `contract.escortServiceStarted`.

Causal projections should therefore group by `contractId` and, where known, scope:

- measurable work: evaluation → acceptance → provisioning/travel/work/completion events already present,
- escort: evaluation → acceptance → `contract.escortServiceStarted` → real interruption/resume/completion lifecycle.

Do not add a second escort trace or diagnostics-owned escort state machine. Do not access construction/build-target fields until `contract.scope.kind` has been discriminated.

## Standard need/strategy history

Do not add duplicate events.

`need.selected` already includes pressures and scored candidates; `strategy.selected` already includes strategy candidates and selected strategy; action lifecycle follows afterward.

The missing piece is projection/presentation. Build pure read-only projections over `NpcTraceEvent[]`. Preserve original event order for equal `simTime`; do not add a global sequence system solely for tooling unless tests demonstrate an actual ambiguity.

## Projection boundary

Prefer small exported helpers in `src/debug/npcInspector.ts`. If this becomes too large, a narrow `src/debug/npcDecisionReport.ts` is appropriate.

Such code must:

- accept existing trace/history data,
- return plain serializable data,
- remain deterministic and read-only,
- never call scoring functions to reconstruct past decisions,
- never own buffers or simulation state.

Useful projections:

- recent NPC decision cycles,
- threat arbitration summary,
- scope-aware Work Contract evaluation/lifecycle cycle,
- loaded-settlement report aggregating current NPC traces.

## Wolf-pack scenario

Reuse the current path through `setFrenzyWolf()` and fauna's real frenzy mechanism.

A convenience `setFrenzyWolves(count)` may repeatedly use the existing single-wolf primitive. It should report partial success when fewer eligible wolves exist.

Do not directly change NPC threat decisions, begin NPC combat or fabricate trace events. Normal fauna/NPC simulation must produce the result.

## Contract scenario setup

Any setup helper must use the authoritative Work Contract creation/posting path for the requested scope.

- measurable construction scenario: reuse the existing measurable-work/construction creation path,
- escort scenario: reuse the existing escort Work Contract creation/posting path where it is already safely reachable.

Inspect `src/world/createWorkContracts.ts`, `src/world/workContract.ts` and the relevant player/WorldBundle seams before adding helpers. If a clean public seam is not available from debug code, provide inspection/reporting only instead of widening production APIs solely for tooling.

Never fabricate acceptance, assignment, escort-service-start or accompany state.

## NPC inspector

Keep `src/ui/createNpcInspector.ts` bounded and low-frequency.

Useful additions only:

- threat candidate scores + inputs,
- scope-aware Work Contract breakdown,
- compact causal cycles,
- existing escort lifecycle events folded into the same contract view.

Do not turn it into a general world observatory or recalculate scores in the UI.

## Tests

Extend focused tests around:

- `src/debug/npcTrace.test.ts`
- `src/debug/npcInspector.test.ts`
- `src/debug/npcDebugApi.test.ts`
- `src/ai/npcWorkContract.test.ts`
- animal-threat scorer tests.

High-value assertions:

- threat diagnostics reflect exactly the scores used by production selection,
- unarmed NPC still cannot choose defend,
- measurable-work breakdown totals match existing score semantics,
- escort breakdown totals match existing score semantics including relation/reputation/renown/curious/danger/away-time,
- compatibility number scorer (if retained) equals structured `.score`,
- `score > 0` acceptance and stable ties remain unchanged,
- impossible provisioning is rejected and serialized safely,
- projections preserve same-time ordering,
- Work Contract projection handles both scopes and existing escort lifecycle without construction assumptions,
- settlement reports include only currently loaded NPC traces and do not duplicate events,
- wolf-pack helper reports partial success correctly.

## Performance guardrails

- no per-tick trace events,
- no unbounded arrays,
- no derived diagnostics state kept alongside the authoritative trace,
- no render-loop world/settlement scans,
- projections run only on explicit debug query or existing low-frequency inspector refresh,
- scenario helpers remain debug-only.

## Implementation order

1. Expose structured diagnostics from the existing pure threat and scope-aware Work Contract scorers without changing decisions.
2. Extend trace payloads at authoritative `NpcAgent` recording sites.
3. Add pure causal/report projections, including both Work Contract scopes and existing escort lifecycle events.
4. Expose projections through the current debug API.
5. Add bounded wolf-pack setup by reusing `setFrenzyWolf()`.
6. Add contract setup helpers only where current production-safe creation seams already exist.
7. Improve inspector presentation after the diagnostic data contract is stable.
8. Extend focused automated tests.
9. Browser/manual scenario verification remains the User's responsibility.

If verification reveals bad defend/flee balance, coordinated-defense gaps, bad Work Contract economics or escort weighting/danger assumptions, create separate gameplay plans. Do not tune gameplay policy inside tools-013.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
