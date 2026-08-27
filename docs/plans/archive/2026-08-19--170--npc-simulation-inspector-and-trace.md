# Plan: NPC simulation inspector and trace

**Created:** 2026-08-19
**Status:** `verification needed` 🔍
**Priority:** high · **Effort:** L
**Depends on:** none

domain: settlements-npcs
tags: [ui-input]

## Goal

Provide one deterministic diagnostic/control layer for NPC simulation so a developer can answer **what an NPC is doing, what state caused it, why the decision was made, what happened afterwards, and where it became stuck** without guessing from the rendered animation.

Primary example: an NPC appears to wait at a well despite not being thirsty. The inspector must expose the actual need, selected goal/pressure, planned action, interaction queue state, current phase, and recent transitions so the failure can be localized to need selection, decision making, action planning, queueing, execution, or locomotion.

The same inspection data must power:

- Ctrl+click NPC → inspector modal.
- Console/API diagnostics for browser automation and AI agents.
- Optional debug controls for deliberately pausing or re-evaluating an NPC while `?debug` is enabled.

## Current-codebase findings

The repository already has the primitives this should observe rather than replace:

- `src/debug/debugMode.ts` provides URL-driven debug flags and the shared `isDebugMode()` gate. Extend this mechanism instead of introducing another debug-mode switch.
- `src/ai/NpcAgent.ts` owns the NPC FSM (`Phase`), needs, `CurrentActivity`, planned actions, interaction queues, movement watchdog, schedule and vigor. It already exposes a narrower activity view through `getCurrentActivity()`; do not expose its private FSM wholesale as the public debug contract.
- NPC actions are built on the shared simulation `PlannedAction` / `ActionLifecycle` / `InteractionQueue` primitives in `src/simulation`.
- `src/ui/createDebugGui.ts` is the existing debug UI entry point and is hidden by default. The inspector should complement it, not turn the lil-gui panel into an NPC-specific god object.
- `src/ui/createNpcDialog.ts` is the existing NPC-facing modal/dialog and should not be overloaded with simulation diagnostics. Create a dedicated inspector surface.
- NPC rendering/picking is already part of the Three.js world; Ctrl+click should reuse the existing raycast/interaction ownership rather than add a second per-frame NPC picking system.
- Existing NPC debug labels/visual state and `isDebugMode()` usage indicate that diagnostics already belong behind the debug surface where they have meaningful runtime cost.

## Scope

### 1. Simulation trace buffer

Add a small reusable trace facility owned by the NPC simulation layer, preferably independent of rendering/UI.

Requirements:

- Fixed-size ring buffer per NPC; never grow without bound.
- Keep a useful recent history in normal builds. Target roughly 100–200 semantic events per NPC rather than recording every simulation tick.
- Debug mode may enable additional high-detail events temporarily, but must still use bounded storage.
- Store structured data, not preformatted strings. Format only at the UI/console boundary.
- Include simulation/world time and, where useful, real timestamp for diagnostics.
- Avoid logging every `update()`/tick; record state transitions and meaningful decisions/actions.
- Trace events should cover at least:
  - need selected / cleared;
  - goal/pressure/strategy or decision outcome where those concepts already exist;
  - action planned / replaced / completed / failed;
  - phase/activity changes;
  - interaction queue entered / left / blocked / served / cancelled;
  - target selection;
  - movement watchdog abandonment/recovery;
  - sleep/work/need transitions where relevant.
- Do not create a parallel simulation state. Trace records are observations of authoritative NPC state.

Suggested shape:

```ts
type NpcTraceEvent = {
  simTime: number
  type: NpcTraceEventType
  data: Record<string, unknown>
}
```

Prefer discriminated unions with typed payloads once the concrete event set is known; avoid `Record<string, unknown>` as the long-term public API if it weakens TypeScript guarantees.

### 2. Stable NPC inspection snapshot

Introduce a read-only public snapshot/API that translates `NpcAgent` internals into stable diagnostic data.

It should expose, where available:

- identity/name;
- position and settlement/household identifiers;
- current activity and phase;
- needs and active need;
- schedule/current activity boundary;
- current planned action and target;
- interaction queue and queue position;
- movement/watchdog status;
- inventory/resource-relevant state needed to explain the action;
- relevant goal/pressure/strategy/decision reason already present in the codebase;
- bounded recent history.

Do not expose mutable internal objects. Return snapshots/readonly data so UI and automation cannot accidentally mutate simulation state.

### 3. `why` / causal inspection

Add a compact causal explanation derived from existing state rather than a new AI decision system.

Example:

```text
thirst = 0.91
→ active need: thirst
→ goal: satisfy thirst
→ strategy: nearest available water
→ action: drink
→ target: well-01
→ queue: position 3
→ blocked: waiting for queue slot
```

The exact terminology must match the current decision/need/action vocabulary. Do not invent a second goal/pressure/strategy model merely for diagnostics.

The API should support a `why()`-style query for a single NPC and return structured causal data suitable for both UI and JSON output.

### 4. Console / automation API

Expose the inspector through one stable debug namespace, available only when the debug surface is enabled.

Target ergonomics:

```ts
seedvale.debug.npc(142).state()
seedvale.debug.npc(142).history()
seedvale.debug.npc(142).why()
seedvale.debug.npcs({ activity: 'drink' })
seedvale.debug.npcs({ queueId: 'well-01' })
```

The actual namespace/name should follow existing global/debug API conventions discovered during implementation.

Requirements:

- Return plain JSON-serializable snapshots.
- Deterministic field names and stable enums.
- Query filters useful for automation: NPC id, activity, need, queue, settlement and optionally proximity.
- Console output should be readable while the returned value remains structured.
- Do not spam `console.log` every tick. Logging is explicit/on-demand.
- Keep the API browser-test/agent friendly; no dependency on Vue component state.

### 5. Ctrl+click NPC inspector

Add a debug-only input path:

`Ctrl + click NPC` → open dedicated **NPC Simulation Inspector**.

Reuse the existing scene picking/raycast infrastructure where possible.

The modal should have compact sections/tabs for:

- Overview
- Needs
- Decision / Why
- Current action
- Queue
- History
- Household / relationships when already available
- Debug controls

History should show newest events first and allow enough context to diagnose a stuck action without dumping the entire lifetime history.

The inspector must refresh from snapshots; it must not become the owner of NPC state.

### 6. Minimal debug controls

The first version should keep controls deliberately small and safe. Behind `?debug` only:

- freeze/unfreeze selected NPC;
- request a fresh decision/re-evaluation using the existing decision path;
- optionally clear/cancel the current action only if the existing lifecycle/queue API has a safe cancellation path.

Do not add arbitrary state editing, teleporting, need mutation, inventory mutation or a second debug-only simulation path in this plan. If a safe existing mutation primitive does not exist, leave the control out rather than bypassing ownership rules.

Every control action must itself emit a trace event so the resulting behaviour remains explainable.

### 7. Performance and build hygiene

This is a diagnostic system, not a new per-frame workload.

- No string formatting during normal simulation ticks.
- No UI work from the NPC simulation update loop.
- Bounded memory per NPC.
- Trace writes should be cheap and allocation-conscious.
- Inspector refresh should be event-driven or low-frequency, not every render frame.
- Remote/off-screen NPCs must retain only the same bounded semantic trace; do not increase simulation fidelity just because tracing exists.
- Avoid worker communication for this feature unless the existing architecture already requires it; the trace is small and local to NPC simulation.

## Likely files / systems to inspect and modify

Start with the actual current paths and confirm ownership before editing:

- `src/ai/NpcAgent.ts` — authoritative NPC FSM/state/action integration.
- `src/ai/Needs.ts` — need state/selection and thresholds.
- `src/simulation/*` — `PlannedAction`, `ActionLifecycle`, `InteractionQueue` and lifecycle transitions.
- `src/ai/npcMovementWatchdog.ts` — movement failure/abandonment diagnostics.
- `src/debug/debugMode.ts` — shared debug gating.
- `src/ui/createDebugGui.ts` — existing debug UI integration point.
- `src/ui/createNpcDialog.ts` — inspect existing modal/input conventions; do not merge diagnostic UI into dialogue.
- Existing game-loop/input/raycast/interaction code — locate the current NPC picking path before implementing Ctrl+click.
- Existing tests around NPC needs/actions/simulation queues — extend with deterministic trace/snapshot tests.

New modules should be narrow, for example:

- `src/debug/npcTrace.ts` — bounded event buffer and typed event definitions.
- `src/debug/npcInspector.ts` — snapshot/query/causal API over authoritative NPC state.
- `src/ui/createNpcInspector.ts` — dedicated modal.

Exact names may change after inspecting current module boundaries; avoid creating a generic `DebugManager` or `NpcDebugManager` that accumulates unrelated responsibilities.

## Implementation sequence

1. Map the current NPC state/action/queue transition points and existing picking/input ownership.
2. Define typed trace events and implement the bounded ring buffer.
3. Instrument only meaningful transitions at their authoritative owners.
4. Add a read-only stable NPC snapshot and query API.
5. Add structured `why()` causal output.
6. Expose the same API through the debug console namespace.
7. Add Ctrl+click selection and the dedicated inspector modal.
8. Add only the safe minimal debug controls supported by existing lifecycle ownership.
9. Add focused unit tests for trace ordering/capacity, snapshots, filters and causal output.
10. Run TypeScript/build/tests, then browser verification with `?debug=1` and reproduce the water-queue case.

## Verification

### Automated

- TypeScript check/build passes.
- Existing test suite passes.
- Trace ring buffer never exceeds configured capacity.
- Oldest events are discarded deterministically.
- Snapshot/query methods do not mutate NPC state.
- Filters return stable deterministic results.
- Causal output reflects the actual authoritative need/action/queue state.
- Debug controls cannot be invoked through the public production API when debug mode is disabled.

### Browser/manual

With `?debug=1`:

1. Ctrl+click a visible NPC.
2. Confirm the inspector shows current needs, active need, activity, action, target and queue state.
3. Confirm history changes as the NPC transitions between actions.
4. Select an NPC waiting at a water queue and determine from the trace whether thirst is actually active and why the queue was entered.
5. Compare the inspector with the console API output for the same NPC.
6. Exercise freeze/unfreeze and decision re-evaluation only where the existing simulation APIs make those operations safe.
7. Confirm normal play with debug disabled has no visible inspector and no console spam.

## Non-goals

- Replacing deterministic NPC decision making with LLM/AI-generated decisions.
- Persisting debug history in save files.
- Recording every simulation tick.
- Building a generic event-sourcing architecture for the whole game.
- Creating a second NPC state model for debugging.
- Adding a full developer/admin dashboard in this plan.
- Arbitrarily mutating needs, inventory, relationships or world state from the inspector.

## Expected outcome

A developer or AI agent can inspect an NPC and answer, from authoritative data:

> What is this NPC doing now?
> Why did it choose that?
> What state caused the choice?
> What is it waiting for?
> What happened in the last several actions?
> Where did the chain stop?

This should make bugs such as “NPCs are permanently queuing for water while not thirsty” diagnosable from one inspector/API instead of requiring temporary `console.log` instrumentation in `NpcAgent`.

## Dependencies / follow-up

This plan is intentionally independent of specific NPC gameplay plans. It can be implemented before or alongside plans such as 165/168 because it observes existing needs, actions and lodging behaviour rather than changing their semantics.

Potential follow-ups discovered during implementation should be recorded separately rather than expanding this plan into a general developer console.

## Implementation summary (2026-08-20)

Implemented directly against the current codebase, applying the implementation notes' corrections (no invented `goal`/`pressure`/`strategy` state, no `NpcDebugManager`, no second NPC picking system, no `isNpcDebugMode()`). No new models/sounds needed.

- **`src/debug/npcTrace.ts`** — `NpcTraceEvent` discriminated union (`need.selected`, `action.planned/completed/failed`, `phase.changed`, `queue.joined/left/served`, `movement.rescue`, `debug.freeze/unfreeze/reevaluate`) and `createNpcTraceBuffer()`, a fixed-capacity (150) ring buffer. `history()` returns a fresh chronological array every call — no way to mutate the ring from outside.
- **`src/ai/NpcAgent.ts`** — the trace buffer is owned per-agent (`private readonly trace`), always recording (cheap, structured events only, no per-tick/string-formatting cost) so `?debug=1` can be added after the fact and still show recent history. Instrumented only at the authoritative transition points already named in the implementation notes: `startAction()`/the `execute`-completion branch (`action.planned`/`completed`), `leaveActiveQueue()`/`startAction()`'s queue-join branch (`queue.left`/`joined`), the `goTo` arrival branch's `claimServing` transition (`queue.served`), `tickWatchdog()` (`movement.rescue`), `interruptCurrentAction()`/`abandonStuckAction()` (`action.failed`), the `choose` phase's `pickNeed()` call (`need.selected`), and one `phase.changed` check comparing `this.phase` before/after `update()`'s state-machine switch (not one call per `this.phase =` assignment site). `PlannedAction`'s existing `kind`/`queueId`/chain fields are reused as-is — no parallel event vocabulary.
  - Added `NpcAgent.createInspectionSnapshot(timeOfDay)` (plain-data `NpcInspectionSnapshot`, copies needs/health/stamina/vigor/household/queue state, never returns `THREE.Object3D`/`Inventory`/`InteractionQueue`/`Household`), `history()`, `why(timeOfDay)` (delegates to the new pure `projectNpcWhy()` — need/phase/action/queue/`blocked` facts only, `blocked` derived solely from the queue's own `serving` flag, never guessed), `setFrozen()`/`isFrozen()` (early-outs `update()` before any decision/movement logic — mesh keeps its last pose, a visible freeze confirmation rather than a hidden/removed object), and `requestReevaluation()` (thin public wrapper around the existing `interruptCurrentAction()` — doubles as the plan's "cancel" control since ownership rules only provide one safe cancellation path, so a second near-duplicate method was not added).
  - `Phase` is now exported (needed by the trace/inspector types); `NpcInspectionSnapshot`/`NpcWhy` live next to `CurrentActivity` following that existing precedent, rather than in a separate debug module reaching into private fields.
- **`src/debug/npcInspector.ts`** — read-only registry/query layer. Never caches `NpcAgent` references: every lookup walks `bundle.settlementsManager.getLoaded()` fresh (the authoritative NPC collection findable in the current codebase — no second registry), so a settlement rebuild/stream cannot leave a stale reference behind. `findNpcById`, `isNpcRegistered` (rebuild-staleness check for the modal), `queryNpcs`/`matchesNpcFilter` (id/settlementId/need/phase/queueId — `matchesNpcFilter` pulled out pure for unit testing, same pattern as `classifyPendingActivity`), `npcWhy`, `npcHistory`, and the three debug controls `freezeNpc`/`unfreezeNpc`/`reevaluateNpc`, each rejecting outright when `isDebugMode()` is false.
- **`src/debug/npcDebugApi.ts`** — installs `window.seedvale.debug.npc(id)` / `.npcs(filter)` only when `?debug` is on (no-op otherwise, so the mutation surface does not exist in production). No pre-existing `seedvale.debug` convention was found in the codebase (implementation notes confirmed this), so this is a new, narrow namespace — ids are the runtime `${settlementId}:npc:${i}` string identity (`NpcAgent.id`), not the plan's illustrative numeric example; documented as not save-stable.
- **`src/debug/npcInspectTrigger.ts`** — **deviation from the plan's literal "Ctrl+click"**: Seedvale is a pointer-lock FPS controller (`MouseLook`'s own `click` handler only re-acquires pointer lock; there is no cursor-position raycast, and NPC targeting is already gaze-based, resolved once per frame in `gameLoop.ts` via `pickInGaze`). No listener is registered at all outside `?debug`. The trigger latches "Ctrl held during a `mousedown` on the game canvas"; `gameLoop.ts` opens the inspector for whatever NPC is currently gazed (`target.kind === 'npc'`) when consumed — the faithful equivalent of "click the NPC you're looking at" under this input model. The existing `[E]` dialogue path is unchanged.
- **`src/ui/createNpcInspector.ts`** — dedicated vanilla-DOM modal (no Vue dependency, matching the plan's "no dependency on Vue component state" requirement for the console/automation surface and the notes' "avoid adding Vue solely for this feature"), constructed only when `isDebugMode()`. Sections: Overview, Needs, Decision/Why, Current action, Queue, Household, Debug controls (Freeze/Unfreeze, Ponów decyzję), History (newest first, capped at 50 rendered rows). Refreshes on a 150 ms (`~6.7 Hz`) timer while open, never from the render loop; detects a stale/rebuilt NPC via `isNpcRegistered()` and shows an "unavailable" state instead of silently reading a disposed reference.
- **`src/app/gameLoop.ts` / `src/app/createApp.ts`** — `npcInspector`/`npcInspectTrigger` wired as optional `GameLoopDeps` (undefined outside `?debug`), constructed/disposed alongside the existing `npcDialog`/`questLog`; `installNpcDebugApi(bundle, () => dayNight.timeOfDay)` called once at startup. `bundle` is the existing stable `WorldBundle` container (fields reassigned in place on `rebuildWorld()`, the reference itself never changes), so the debug API and modal survive a world rebuild without re-installation.
- Tests: `src/debug/npcTrace.test.ts` (capacity, chronological order, deterministic discard, `history()` snapshot immutability), `src/ai/npcWhy.test.ts` (idle / water-need-no-queue / well-queue-waiting-blocked / well-queue-serving-not-blocked, against the pure `projectNpcWhy()`), `src/debug/npcInspector.test.ts` (`matchesNpcFilter` — id/settlementId/need/phase/queueId, single and combined). Full `NpcAgent` construction (GLTF load, THREE deps) is not unit-tested anywhere in this codebase already (see `npcCurrentActivity.test.ts`'s existing pure-function-extraction precedent), so the snapshot/why/trace logic itself was pulled into pure, directly-testable functions rather than adding new integration-test scaffolding.

**Technically verified**: `npx tsc --noEmit`, `pnpm run lint:fix`, `pnpm run build`, `pnpm run test` (1188 tests) all green.

**Not verified**: browser/manual (`?debug=1`, Ctrl+click on a gazed NPC, water-queue repro, console API vs. modal comparison) — per task instructions, left for manual testing.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
