# Plan: NPC decision verification and scenario tooling

**Created:** 2026-09-10
**Status:** `planned` 📋
**Priority:** high · **Effort:** M
**Depends on:** none
**Domain:** `tools`
**Type:** `feature`
**Subdomains:** `debug` `diagnostics` `automation`
**Tags:** `npc` `decision-making` `contracts` `combat`
**Roadmap:** -

## Goal

Make NPC decisions verifiable from one bounded developer-facing workflow, reusing the existing NPC trace/inspector/debug API rather than creating a parallel diagnostics system.

The tooling must make it practical to answer:

- what decisions an NPC made over time and why,
- how a settlement reacted to an animal attack such as a wolf pack,
- whether NPCs evaluated, accepted, interrupted, resumed and completed construction Work Contracts,
- which inputs and score components caused a decision to win or lose.

The goal is observability and repeatable verification. This plan must not change gameplay decision policy merely to make tests pass.

## Current architecture confirmed by recon

Existing mechanisms already provide the core data path:

- `src/debug/npcTrace.ts` owns the typed, bounded per-NPC semantic event history (`NPC_TRACE_CAPACITY = 150`).
- `src/ai/NpcAgent.ts` records authoritative decision/action transitions into that trace.
- `src/debug/npcInspector.ts` resolves live NPCs, exposes NPC history and assembles settlement-level history envelopes.
- `src/debug/npcDebugApi.ts` exposes `window.seedvale.debug` in debug mode, including `npc(id).state()`, `why()`, `history()`, `npcs()`, `settlement(id).history()` and wolf helpers.
- `src/ui/createNpcInspector.ts` renders a low-frequency debug modal for one NPC and currently shows the newest 50 trace entries.
- `src/ai/npcAnimalThreat.ts` performs pure deterministic `defend` vs `flee` scoring.
- `src/ai/npcWorkContract.ts` performs pure deterministic Work Contract scoring and returns the scored candidates plus the selected positive candidate.
- `src/debug/domainHistory.ts` provides shared bounded-history/filtering primitives and should remain the common mechanism for filtering timelines.

Do not introduce a second trace buffer, event bus, decision logger or diagnostics-owned simulation state.

## Problems to solve

### 1. Normal decision history lacks a compact causal view

The trace already records pressures, scored need candidates, selected need, strategy candidates, selected strategy and action lifecycle. However the UI formats these mostly as isolated event lines.

A developer should be able to inspect one decision cycle as a causal chain instead of manually correlating several events by timestamp.

### 2. Animal-threat diagnostics record the result but not the full arbitration

`animalThreat.response` currently records the chosen response, `canFight` and health ratio. The pure scorer in `npcAnimalThreat.ts` already has the underlying `defend` and `flee` scores and relevant inputs, but the trace does not retain them.

This makes it difficult to answer why two nearby NPCs behaved differently during the same attack.

### 3. Work Contract diagnostics record total scores without score breakdown

`contract.evaluated` records `{ contractId, score }[]`, and `contract.accepted` records the selected score. `npcWorkContract.ts` internally combines reward, role suitability, travel cost, expected work cost, schedule conflict and provisioning feasibility.

The trace should expose enough structured breakdown to explain why a contract was accepted or rejected without recomputing the decision in debug code.

### 4. Settlement-wide crisis review is cumbersome

`settlement(id).history()` already merges NPC, household and settlement events, but the current tooling has no purpose-built projection for answering questions such as:

- how many NPCs sensed the wolves,
- who defended and who fled,
- who entered combat,
- who was hit or died,
- who never reacted,
- what each NPC was doing immediately before the threat.

The solution should project existing traces, not add settlement-owned NPC decision state.

### 5. Verification setup is too manual

`setFrenzyWolf()` already provides a deterministic debug seam for forcing one eligible wolf toward the nearest loaded village; repeated calls can create multiple frenzied wolves. Contract verification currently lacks an equally convenient bounded inspection workflow around candidate evaluation and acceptance.

The tooling should make scenario setup and result collection reproducible without bypassing the real simulation mechanisms.

## Scope

### A. Structured decision diagnostics

Extend existing typed trace data where the authoritative decision is made:

- animal threat response: record candidate scores and the inputs required to explain the arbitration,
- Work Contract evaluation: record a structured score breakdown for every evaluated candidate,
- retain the existing selected/accepted events and semantic transition model.

Prefer plain serializable data. Do not store live object references.

For standard needs/strategies, reuse the information already present on `need.selected` and `strategy.selected`; do not duplicate it into a new event family unless implementation recon proves a concrete gap.

### B. Causal projections

Add pure projection helpers over `NpcTraceEvent[]` that group related semantic events into compact developer-facing records, for example:

- decision cycles,
- threat responses,
- contract evaluation/acceptance cycles.

Projection code must be read-only and deterministic. It must not rerun scoring functions to infer historical reasons.

### C. Settlement decision review

Extend the existing debug inspection layer with a bounded settlement/NPC decision report derived from current live NPC histories.

At minimum it should support:

- recent decisions for all loaded NPCs in one settlement,
- animal-threat response summary per NPC,
- combat outcome summary,
- Work Contract evaluation/acceptance summary,
- filtering by NPC/event/scenario-relevant event families.

Respect the current streaming boundary: live `NpcAgent` traces are not persisted across settlement unload/rebuild. The tooling must state this clearly rather than pretending history is complete.

### D. Browser debug API

Extend `window.seedvale.debug` rather than creating another global.

Provide small query-oriented methods that return plain JSON-serializable data suitable for DevTools and automation. Exact names should follow current `npc(...)` / `settlement(...)` conventions.

Useful operations should include:

- getting a compact recent-decision view for one NPC,
- getting a compact decision/crisis report for a loaded settlement,
- triggering a bounded wolf-pack scenario by reusing the existing frenzy mechanism rather than mutating NPC state,
- collecting the resulting report after normal simulation has processed the event.

If a contract scenario helper is added, it must create/post contracts through the same public `WorkContracts`/construction APIs used by gameplay. Never inject `contract.accepted` or NPC commitment state directly.

### E. NPC inspector UI

Extend `src/ui/createNpcInspector.ts` only where it materially improves manual verification:

- show score breakdowns for threat and contract decisions,
- present recent causal decision cycles more clearly than a flat raw event dump,
- keep the existing low-frequency refresh and debug-only lifecycle.

Do not turn the NPC inspector into a general world observatory or large Vue subsystem.

### F. Repeatable verification scenarios

Document and support these initial scenarios:

1. **Normal decision history**
   - observe several NPCs through schedule changes and ordinary needs,
   - confirm pressures/candidates → selected need → strategy → action transitions are understandable.

2. **Single wolf attack**
   - force one wolf toward a loaded village,
   - inspect armed/unarmed and healthy/injured NPC responses.

3. **Wolf pack attack**
   - create several frenzied wolves through the existing fauna debug seam,
   - inspect settlement-wide sensed/responded/combat/flee/death outcomes,
   - verify independent NPC decisions can be compared from one report.

4. **Construction Work Contract**
   - post a real construction contract,
   - inspect all candidate scores and breakdowns,
   - verify acceptance/rejection reason,
   - inspect interruption by urgent needs and later continuation using existing contract/action lifecycle.

These are verification workflows, not scripted gameplay assertions requiring NPCs to make one predetermined choice.

## Implementation constraints

- Preserve authoritative state ownership in `NpcAgent`, `WorkContracts`, households, settlement economy and fauna systems.
- Trace only semantic events; never emit one event per simulation/render tick.
- Keep buffers bounded.
- Never compute alternate historical decisions in the inspector/debug layer.
- Keep all scoring deterministic and pure in the existing decision modules.
- Avoid broad `NpcAgent` refactors.
- No persistence work in this plan. NPC trace lifetime remains tied to live agents unless a separate persistence plan is created later.
- No new group AI / settlement-defense policy. The wolf-pack scenario observes current per-NPC behaviour; gameplay changes discovered during verification become separate NPC/fauna plans.
- No browser verification by the implementing AI agent.
- Add/update JSDoc for important public/projection/debug functions as needed, using `@domain tools` where it helps preflight discovery.

## Likely files

Primary:

- `src/debug/npcTrace.ts`
- `src/debug/npcInspector.ts`
- `src/debug/npcDebugApi.ts`
- `src/ui/createNpcInspector.ts`
- `src/ai/NpcAgent.ts`
- `src/ai/npcAnimalThreat.ts`
- `src/ai/npcWorkContract.ts`

Tests should extend the existing focused test locations around:

- NPC trace buffering/filtering,
- NPC inspector projections,
- debug API plain-data surfaces,
- `npcAnimalThreat` scoring,
- `npcWorkContract` scoring.

Only add a new narrow debug/projection module if keeping these projections inside `npcInspector.ts` would make that file materially less coherent.

## Verification

Automated verification should cover:

- new trace event payloads remain plain data and bounded,
- threat candidate scores in trace match the actual pure scorer inputs/result,
- contract score breakdown sums to the actual candidate score, including impossible provisioning,
- projection helpers preserve deterministic chronological ordering,
- settlement reports do not duplicate events and only include currently loaded NPC traces,
- filters remain compatible with existing `HistoryFilter`,
- debug scenario helpers reject/no-op cleanly when prerequisites are absent,
- no debug helper directly mutates NPC decision outcomes.

Manual browser verification by the User:

- inspect an ordinary NPC over several decision cycles,
- run one-wolf and multi-wolf village attacks and compare NPC responses,
- post a construction contract and inspect why NPCs accept/reject it,
- confirm inspector/debug output remains readable during active simulation,
- confirm no visible simulation behaviour changed solely because diagnostics are enabled.

## Non-goals / follow-ups

- Changing defend/flee balance.
- Coordinated settlement defense, alarm propagation or group tactics.
- Changing contract economics or acceptance policy.
- Persisting NPC trace history across streaming/save-load.
- Full world observatory UI.

Findings from the verification scenarios should become separate gameplay plans when they represent actual behaviour changes rather than diagnostic gaps.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
