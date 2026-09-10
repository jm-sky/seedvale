# Implementation Notes: tools-013 NPC decision verification and scenario tooling

## Recon baseline

Current `main` already contains the core NPC observability stack. Implementation should extend it, not replace it.

### Existing ownership

- `src/debug/npcTrace.ts`
  - `NpcTraceEvent` is the authoritative typed semantic history contract.
  - `createNpcTraceBuffer()` delegates to shared `createBoundedHistoryBuffer()`.
  - `NPC_TRACE_CAPACITY` is 150.
  - Events are intentionally transition-level, not tick-level.

- `src/ai/NpcAgent.ts`
  - owns the live per-NPC trace buffer and records authoritative transitions.
  - records `need.selected` with full pressures and scored candidates.
  - records `strategy.selected` with strategy candidates and winner.
  - records action lifecycle, combat, animal-threat and Work Contract events.
  - do not move diagnostics ownership out of authoritative transition call-sites.

- `src/debug/npcInspector.ts`
  - `findNpcById()` / `queryNpcs()` always re-resolve currently loaded settlements.
  - `npcHistory()` returns one live NPC trace and applies existing `HistoryFilter`.
  - `settlementHistory()` already merges NPC + household + settlement histories.
  - live NPC history disappears when the `NpcAgent` disappears through streaming/rebuild; household/economy history has different lifetime ownership.

- `src/debug/npcDebugApi.ts`
  - owns `window.seedvale.debug` in `?debug=1` mode.
  - `NpcDebugHandle` exposes `state()`, `history()`, `why()`, `freeze()`, `unfreeze()`, `reevaluate()`.
  - settlement handle already exposes merged `history()`.
  - wolf debug helpers already expose `setFrenzyWolf()`, `getFrenzyWolves()`, current/next frenzied wolf.
  - keep new output JSON-serializable and independent from UI state.

- `src/ui/createNpcInspector.ts`
  - vanilla DOM, debug gated, low-frequency refresh (`REFRESH_INTERVAL_MS = 150`).
  - renders at most `HISTORY_RENDER_LIMIT = 50` events.
  - `formatEvent()` already knows `animalThreat.*`, combat and `contract.*` event families.
  - `buildInspectorText()` already renders current needs, winner modifiers, strategy, plan, active Work Contract, action, queue, household and history.
  - extend formatting/projections here rather than creating a second inspector.

## Threat decision seam

`src/ai/npcAnimalThreat.ts` is already the correct pure scoring owner.

Relevant symbols:

- `AnimalThreatDecisionInput`
- `scoreAnimalThreatIntents()`
- `decideAnimalThreatResponse()`
- `senseImmediateAnimalThreat()`
- `IMMEDIATE_ANIMAL_THREAT_RADIUS`

The scorer currently derives:

- combat capability from melee/ranged availability,
- defend/flee scores from health,
- Big Five neuroticism risk bias,
- `defend = -Infinity` when the NPC cannot fight.

Important implementation decision:

- avoid calling `scoreAnimalThreatIntents()` once for diagnostics and again for the actual choice.
- prefer one scored result flowing through the existing decision path so the values recorded in `animalThreat.response` are exactly the values used to choose the response.
- if a small pure selector helper over already-scored candidates is useful, keep it in `npcAnimalThreat.ts`; do not reproduce the formula in `NpcAgent` or debug code.

Likely trace payload extension:

- chosen response,
- candidate scores (`defend`, `flee`),
- `hasMeleeCapability`, `hasRangedCapability`,
- health ratio,
- neuroticism used by the scorer.

Keep values plain-data and sufficient to explain the result without copying unrelated NPC state.

## Work Contract scoring seam

`src/ai/npcWorkContract.ts` is the correct pure scoring owner.

Relevant symbols:

- `WorkContractEvaluationInput`
- `scoreWorkContractOpportunity()`
- `selectBestWorkContract()`
- `ScoredWorkContract`

Current score combines:

- expected reward,
- role suitability,
- travel-hour penalty,
- expected-work penalty,
- schedule conflict penalty,
- provision feasibility penalty.

Current API only exposes final `score` per candidate.

Important implementation decision:

Refactor the pure scorer minimally so it can return both total and structured components from a single calculation, for example an internal/public result shape containing:

- `expectedReward`,
- `suitability`,
- `travelCost`,
- `workCost`,
- `scheduleConflict`,
- `provisionPenalty`,
- `score`.

`selectBestWorkContract()` should consume that same result rather than calculate totals independently. Preserve the current acceptance rule (`score > 0`) and stable tie behaviour.

Handle impossible provisioning explicitly. Current scorer returns `Number.NEGATIVE_INFINITY`; browser-facing plain-data/JSON surfaces should not accidentally rely on non-finite JSON serialization. Prefer a serializable reason/availability representation in trace/debug projections while preserving the actual scoring semantics inside the pure decision function.

## Standard need/strategy decision history

Do not add duplicate decision events prematurely.

`need.selected` already carries:

- selected `NeedId`,
- full `NpcPressure[]`,
- scored `ScoredNeedCandidate[]` including modifiers.

`strategy.selected` already carries:

- need,
- all `NpcStrategyCandidate[]`,
- selected strategy or `null`.

`action.planned` follows those events.

The missing piece is presentation/projection. Build a pure causal projection over history rather than another recorder.

Because events currently have `simTime` but no per-NPC sequence number, projection should preserve original array order for equal timestamps. Do not invent a global sequence allocator solely for tooling unless a real ambiguity is demonstrated by tests.

## Suggested projection module boundary

First preference: add small exported pure helpers in `src/debug/npcInspector.ts` if they remain compact.

If the code becomes substantial, a narrow `src/debug/npcDecisionReport.ts` is justified. It should accept existing event arrays/snapshots and return plain data only. It must not import THREE, mutate agents, call scoring functions or own buffers.

Useful result shapes:

- per-NPC recent decision cycles,
- per-NPC threat summary,
- per-NPC contract evaluation cycle,
- settlement report aggregating those projections for currently loaded NPCs.

Avoid a generic analytics framework.

## Wolf-pack scenario

Reuse the existing path:

`npcDebugApi.ts` → `npcInspector.setFrenzyWolf()` → `pickNearestEligibleWolf()` → `AnimalAgent.setFrenzied()`.

`setFrenzyWolf()` already excludes dead/frenzied wolves and chooses the nearest eligible wolf relative to loaded villages. A pack helper can call/reuse this bounded mechanism repeatedly.

Do not directly:

- set an NPC's threat state,
- invoke `reactToAnimalThreat()` from debug code,
- start NPC combat,
- fabricate trace events.

The real fauna and NPC simulation must produce the response.

A helper such as `setFrenzyWolves(count)` may be useful, but use the current single-wolf primitive internally and return concrete success/failure information for each requested wolf. Do not silently claim a requested pack size when fewer wolves are eligible.

## Contract scenario boundary

Recon found no equivalent purpose-built contract scenario helper in `window.seedvale.debug`.

Do not create contracts by writing to `NpcAgent` commitments. Any helper must enter through the authoritative Work Contract/public construction path used by gameplay.

Before implementing a convenience setup helper, inspect the current `src/world/createWorkContracts.ts`, `src/world/workContract.ts`, and the relevant player-built construction manager target types. If the required public posting seam is not safely available from the current `WorldBundle`, omit contract creation from the helper and provide inspection/reporting only; do not widen production APIs solely for debug convenience without a clear ownership-safe seam.

## UI scope

`createNpcInspector.ts` currently renders flat event strings. The smallest useful change is:

- retain raw recent history,
- add compact sections for recent decision cycles / threat arbitration / contract evaluation breakdown,
- avoid increasing refresh frequency,
- avoid recalculating scores in the modal,
- keep rendering bounded.

A settlement-wide report does not need a large new modal in this plan if DevTools output is sufficient for the first version. Prefer useful diagnostics over UI scope growth.

## Tests to reuse/extend

Locate and extend current focused tests rather than adding broad integration harnesses. Relevant files already present in the repository include:

- `src/debug/npcTrace.test.ts`
- `src/debug/npcInspector.test.ts`
- `src/debug/npcDebugApi.test.ts`
- `src/ai/npcWorkContract.test.ts`
- tests adjacent to `src/ai/npcAnimalThreat.ts`

High-value pure tests:

- Work Contract breakdown total exactly matches existing score semantics.
- positive/negative selection and stable tie behaviour remain unchanged.
- impossible provisioning remains rejected and becomes safely representable in diagnostics.
- animal threat recorded candidate scores select the same winner as before.
- unarmed NPC still cannot choose defend.
- projection groups events without reordering same-time events.
- settlement report includes each currently loaded NPC once and respects filters.
- wolf-pack helper returns partial success when fewer wolves are available.

## Performance guardrails

- no per-tick trace events,
- no unbounded arrays,
- no repeated settlement/world scans from render-loop paths,
- projections should run only on explicit debug query or existing low-frequency inspector refresh,
- reuse the current bounded 150-event NPC history rather than maintaining derived history state,
- scenario helpers remain debug-only.

## Implementation order

1. Make pure threat and Work Contract scorers expose structured diagnostics without changing their decisions.
2. Extend `NpcTraceEvent` payloads and authoritative `NpcAgent` recording sites.
3. Add pure causal/report projections over existing histories.
4. Expose those projections through `npcDebugApi.ts` using current handles.
5. Add bounded wolf-pack convenience setup by reusing `setFrenzyWolf()`.
6. Improve `createNpcInspector.ts` presentation only after the data contract is stable.
7. Extend focused tests and run normal automated checks.
8. Leave browser/manual scenario verification to the User.

## Explicit follow-up boundary

If wolf-pack verification shows missing coordinated defense, alarm propagation or tactically implausible group behaviour, create a separate `npc`/`fauna` gameplay plan. Do not solve those findings inside this tools plan.

Likewise, if contract verification reveals bad economics/priority values, create a separate NPC Work Contract behaviour plan rather than tuning scores as part of diagnostics.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
