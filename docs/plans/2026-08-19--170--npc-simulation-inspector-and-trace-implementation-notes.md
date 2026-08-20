# Implementation Notes: NPC simulation inspector and trace

**Plan:** `docs/plans/2026-08-19--170--npc-simulation-inspector-and-trace.md`
**Reviewed:** 2026-08-19
**Status:** `verification needed` — see the plan's "Implementation summary (2026-08-20)"

## Review summary

Plan 170 is architecturally sound and fits the current Seedvale direction: it should observe authoritative NPC simulation state rather than introduce another AI/state model. The current code already has the important seams: `NpcAgent`, shared `PlannedAction`/`ActionLifecycle`, `InteractionQueue`, movement watchdog, `isDebugMode()`, and the existing `Interactable` NPC picking path.

There are, however, several places where the plan currently describes concepts more abstractly than the implementation actually represents them. The implementation should follow the code vocabulary rather than create missing abstractions merely to make the inspector terminology fit.

The most important correction is:

> **Do not invent a runtime `goal` / `pressure` / `strategy` subsystem for diagnostics.**

The current NPC implementation has needs, schedule, `NeedId`, `PlannedAction`, action lifecycle, phase/activity and queue state. `pickNeed()` is a concrete need selector; it returns `food | idle | water | waterDuty | wood`. The causal inspector should derive its explanation from these existing values and the actual action-selection path.

## 1. Current ownership map

### `NpcAgent` remains the authoritative source

`src/ai/NpcAgent.ts` already owns the NPC simulation state and integrates:

- needs;
- phase/activity;
- schedule;
- `PlannedAction` / `ActionLifecycle`;
- `InteractionQueue` membership/use;
- vigor/stamina;
- movement watchdog;
- inventory used for some NPC transport flows.

Do not move any of that state into the inspector.

The inspector should receive a narrow read-only adapter/snapshot from `NpcAgent` rather than exposing private fields or returning mutable internal objects.

### `Needs.ts` is the source of truth for need semantics

`src/ai/Needs.ts` currently defines:

```ts
NeedId = 'food' | 'idle' | 'water' | 'waterDuty' | 'wood'
```

and `pickNeed()` calculates scores using thresholds and shortage/critical modifiers. There is no separate goal object in this module.

For `why()` prefer exposing facts such as:

```text
needs.thirst = 0.91
activeNeed = water
needSelection = water
needReason = threshold/score
```

only if those facts can be obtained from the existing decision path. Do not duplicate the scoring algorithm inside the inspector.

### `InteractionQueue` is deliberately opaque

`src/simulation/interactionQueue.ts` exposes useful read operations:

- `indexOf(agentId)`;
- `isServing(agentId)`;
- `isMember(agentId)`;
- `canEnterServing(agentId)`;
- `worldDestination(agentId)`;
- `servingPoint()`.

The mutable `waiting` array and `serving` set are implementation details and are not part of the public `InteractionQueue` interface.

Therefore the inspector should not cast `InteractionQueue` to a mutable/private shape just to show the whole queue. Add a small read-only diagnostic query at the queue owner/client boundary if queue membership/position requires more information.

For the well, the canonical queue id is `settlementId:well` via `wellQueueId()`.

## 2. Trace instrumentation must happen at authoritative transitions

Do not add one giant `trace()` call around `NpcAgent.update()`.

Instrument the places that already know that a semantic transition happened:

```text
need selection / interruption
    → NpcAgent decision code

planned / replaced / completed / failed action
    → ActionLifecycle owner / NpcAgent action transition

phase/activity change
    → NpcAgent phase transition

queue join/leave/claim/release
    → queue integration / NpcAgent queue lifecycle

movement rescue
    → NpcAgent handling of npcMovementWatchdog result
```

The watchdog itself is intentionally pure and only returns a `RescueStage`; it does not mutate `NpcAgent` phase/action state. Therefore trace events such as `movement.repath`, `movement.escape`, `movement.abandon`, and `movement.emergencyTeleport` belong where `NpcAgent` actually reacts to the watchdog result, not inside `npcMovementWatchdog.ts`.

Likewise, `npcMovementWatchdog.ts` already has bounded recent-rescue counters. Do not copy that state into the trace system.

## 3. Use typed event payloads

Start with a small discriminated union instead of the plan's long-term `Record<string, unknown>` shape.

Conceptually:

```ts
type NpcTraceEvent =
  | { type: 'need.selected'; simTime: number; need: NeedId }
  | { type: 'action.planned'; simTime: number; action: ... }
  | { type: 'action.completed'; simTime: number; action: ... }
  | { type: 'action.failed'; simTime: number; action: ...; reason?: string }
  | { type: 'phase.changed'; simTime: number; from: ...; to: ... }
  | { type: 'queue.joined'; simTime: number; queueId: string }
  | { type: 'queue.left'; simTime: number; queueId: string }
  | { type: 'queue.blocked'; simTime: number; queueId: string; position: number }
  | { type: 'movement.rescue'; simTime: number; stage: RescueStage }
```

The exact discriminants must follow actual current types. Do not create duplicate string enums for existing `Phase`, `NeedId`, action kinds, etc.

Store only the minimum data needed to explain the event. In particular, do not snapshot the complete `NpcAgent`, `Inventory`, `Household`, `Settlement` or Three.js object into every trace entry.

## 4. Ring buffer ownership

A per-NPC bounded ring buffer is appropriate, but avoid allocating one eagerly for every NPC if the current population can become large and the debug feature is normally unused.

Preferred shape:

```text
NpcAgent
  └── optional NpcTraceBuffer
        └── fixed-capacity event storage
```

If the existing NPC construction path makes lazy allocation awkward, a small fixed buffer per agent is still acceptable. The important invariants are:

- fixed maximum capacity;
- no unbounded arrays;
- no string formatting while recording;
- no Three.js references in events;
- no save/persistence integration;
- chronological deterministic order.

The normal trace should record semantic transitions only. Never emit a trace record from every `update()` call.

## 5. Snapshot API: keep it separate from trace

The trace is history. The snapshot is current state. Do not make one reconstruct the other.

Recommended layering:

```text
NpcAgent authoritative state
        │
        ├── createNpcInspectionSnapshot()
        │
        └── NpcTraceBuffer
                 │
                 └── history()
```

A snapshot should contain plain data only. Use copied vectors/numbers and copied arrays where necessary.

Avoid returning:

- `NpcAgent` itself;
- `THREE.Object3D`;
- mutable `Inventory`;
- mutable `InteractionQueue`;
- `Household` object;
- mutable schedule/action objects.

The UI and browser automation must be unable to mutate simulation state through the diagnostic API.

## 6. `why()` should be a projection, not a second decision engine

The plan's example is useful, but some terminology does not map 1:1 to current runtime types.

Do not implement:

```text
goal = satisfy thirst
strategy = nearest available water
```

as new NPC state merely for diagnostics.

Instead expose the actual chain when available:

```text
active need: water
selected action: drink / existing action kind
planned target: well queue / home water / current target
queue: settlement:well
queue position: 3
blocked: serving capacity
phase: goTo / execute / ...
```

If a causal fact is not explicitly represented by the current decision code, it is better to return `null`/`unknown` than infer a plausible explanation independently.

This is especially important for debugging: an inspector that invents a reason can hide the real bug.

## 7. Queue diagnostics need a small read-only seam

The current `InteractionQueue` intentionally exposes membership and position for one agent but not a full queue snapshot. That is enough for the selected NPC's own inspector state, but not for a filter like:

```ts
seedvale.debug.npcs({ queueId: 'well-01' })
```

Do not expose the internal `waiting` array publicly just for this feature.

Instead prefer one of these approaches, in order:

1. query NPCs from the authoritative NPC registry and inspect each agent's queue membership;
2. add a small read-only queue diagnostic helper returning copied ids/positions;
3. only add a full queue snapshot if the automation use case actually needs it.

Do not turn `InteractionQueue` into a generic debug/event system.

## 8. There is already an NPC interaction/picking path

The plan is correct that Ctrl+click should reuse existing picking infrastructure.

`src/interaction/Interactable.ts` already has a dedicated:

```ts
{ kind: 'npc', position, promptLabel, npc, settlement }
```

candidate, and `src/app/interactables.ts` builds the per-frame interaction candidates. Therefore do **not** add a second NPC raycast registry or per-frame NPC picking loop.

The implementation should locate the existing pointer/click handling in `gameLoop.ts` and add only the debug-specific modifier path:

```text
Ctrl + click
    ↓
existing scene/interactable picking
    ↓
npc candidate
    ↓
openNpcInspector(npc)
```

The normal `[E]` NPC interaction/dialogue path must remain unchanged.

## 9. Debug gating

`src/debug/debugMode.ts` already owns URL-driven debug flags and `isDebugMode()`.

Do not add:

```ts
isNpcDebugMode()
```

unless there is a concrete need for an independent flag. The plan explicitly says this feature belongs behind the shared debug surface.

A good first version is:

```text
?debug=1
  → inspector input enabled
  → debug API installed
  → debug controls available

normal URL
  → no inspector input
  → no debug API mutation surface
```

If the console namespace must exist for tooling discovery but be inert in production, make that contract explicit and ensure controls are rejected when `isDebugMode()` is false.

## 10. Console API: no existing `seedvale.debug` contract found

The current code has `isDebugMode()` and `createDebugGui()`, but the reviewed codebase does not provide an established `seedvale.debug` global namespace to extend.

Therefore the plan's sample:

```ts
seedvale.debug.npc(142).state()
```

should be treated as target ergonomics, not an existing convention.

Create the smallest dedicated debug API and install it from the application composition layer (`src/app/createApp.ts` or the existing debug initialization path). Keep the global surface narrow.

Suggested structure:

```text
window.seedvale
  └── debug
       ├── npc(id)
       └── npcs(filter?)
```

or, if the repository already has a better browser-global convention discovered during implementation, extend that instead.

The API should return plain objects, not class instances with hidden mutable state.

## 11. NPC registry/query ownership

Before implementing `seedvale.debug.npc(id)`, identify the authoritative runtime collection of NPCs. Do not create a second global `Map<npcId, NpcAgent>` just for diagnostics if an existing settlement/NPC collection already owns them.

The inspector adapter should query the existing collection and filter it.

This matters for stream/rebuild behaviour: the debug layer must not retain stale `NpcAgent` references after a world rebuild.

If the current runtime does not have a stable global NPC registry, add the smallest query seam at the owner rather than a generic `NpcDebugManager`.

## 12. Stable NPC identity

The console API requires an NPC id, but the plan should not invent a new debug-only id.

Find and use the existing stable NPC identity already used by the runtime/settlement data. The diagnostic contract should expose that identity as a primitive string/number.

If the current runtime only has a generated runtime identity, document that clearly rather than pretending it is save-stable.

The inspector must never identify an NPC by object identity or array index.

## 13. Debug controls: keep them at the existing lifecycle owner

The three proposed controls should be implemented only where safe existing primitives exist.

### Freeze

Do not mutate arbitrary NPC state from the UI. Prefer a small explicit debug pause/freeze flag owned by the NPC simulation layer if the current update path already supports a clean early-out.

Do not stop rendering the NPC; freeze simulation, not the Three.js object.

### Re-evaluate

Call the existing decision/choose path through an explicit public debug method rather than invoking private methods from the UI.

The method should emit a trace event such as `debug.reevaluate` and then use the normal decision path.

### Cancel

Do not add cancellation merely because the UI wants a button. `ActionLifecycle` and `InteractionQueue` already have ownership rules. If a safe cancellation operation does not exist for the current action, omit the control.

Never directly set `pendingAction = null` from the inspector.

## 14. Trace debug-control events

Control events should be recorded in the same bounded history:

```text
debug.freeze

debug.unfreeze

debug.reevaluate

debug.cancel
```

This makes a post-debug history explainable.

The event should record only useful metadata, e.g. the operation and simulation time. Do not store UI component state.

## 15. UI architecture

`src/ui/createDebugGui.ts` is the existing lil-gui debug entry point, but it is already a general renderer/world debug panel. Do not turn it into an NPC inspector god object.

`src/ui/createNpcDialog.ts` is player-facing NPC dialogue. Do not merge diagnostics into it.

A dedicated `src/ui/createNpcInspector.ts` is appropriate if it follows the existing vanilla DOM modal conventions.

The inspector should consume the snapshot/API and have no direct dependency on private `NpcAgent` internals.

Avoid adding Vue solely for this feature if the existing debug modal infrastructure is vanilla DOM. Reuse the established UI technology for the smallest surface.

## 16. Refresh strategy

Do not refresh the inspector on every render frame.

Good options:

```text
trace event → mark inspector dirty → refresh next UI tick
```

or a low-frequency refresh such as 5–10 Hz while the modal is open.

The important invariant is that NPC simulation never calls DOM/Vue code.

When the selected NPC is no longer available after rebuild/stream lifecycle, the inspector should close or show a clear unavailable state rather than retaining a stale object reference.

## 17. Off-screen simulation and memory

The inspector must not change simulation fidelity.

NPCs already continue to operate independently of the player's proximity. A remote NPC should produce the same bounded semantic trace as a nearby NPC.

Do not:

- force remote NPC updates to render frequency;
- retain Three.js references in history;
- enable extra detailed logging globally;
- create worker communication for the trace;
- persist trace history in `SaveData`.

If high-detail tracing is useful, make it a debug-only bounded mode and make the capacity explicit.

## 18. Tests to add before UI

Prioritize deterministic unit tests for the domain layer before building the modal:

### Ring buffer

- capacity is fixed;
- newest event is retained;
- oldest event is discarded;
- chronological order is deterministic;
- empty history works;
- snapshot returned by `history()` cannot mutate the buffer.

### Snapshot

- snapshot contains expected primitive values;
- mutable internal objects are not exposed;
- repeated snapshots do not share mutable arrays/objects.

### Filters

- id filter;
- activity/phase filter;
- need filter;
- queue filter;
- settlement filter;
- deterministic result ordering.

### Causal output

Use concrete current states, especially:

```text
idle
water need
well queue waiting
serving blocked
```

and verify the returned explanation matches authoritative state.

### Debug gating

Verify that debug controls cannot mutate NPCs when `isDebugMode()` is false.

## 19. Suggested implementation order

Use this smaller sequence instead of implementing the entire plan as one UI-heavy change:

1. Map the actual `NpcAgent` transition points and current NPC registry.
2. Map existing click/raycast ownership in `gameLoop.ts` and `interactables.ts`.
3. Implement `NpcTraceBuffer` and typed event definitions.
4. Instrument only authoritative semantic transitions.
5. Implement a read-only NPC inspection snapshot.
6. Implement query/filter functions over the existing NPC owner/registry.
7. Implement `why()` as a projection of actual state and action data.
8. Add the browser debug namespace and keep it plain-data/JSON-safe.
9. Add focused ring-buffer/snapshot/filter/causal tests.
10. Add Ctrl+click using the existing NPC interactable path.
11. Add the dedicated inspector modal.
12. Add freeze/re-evaluate only where safe lifecycle APIs exist; omit cancellation if ownership is unclear.
13. Run tsc/build/tests.
14. Browser-test `?debug=1`, especially an NPC waiting at a well, and compare UI vs console output.

## 20. Recommended file boundaries

Likely final structure:

```text
src/debug/npcTrace.ts
  typed trace events + bounded ring buffer

src/debug/npcInspector.ts
  read-only snapshot + queries + why()

src/ui/createNpcInspector.ts
  modal rendering/input
```

Possible additional small adapter if needed:

```text
src/debug/npcDebugApi.ts
```

Only create it if browser-global installation becomes large enough to justify separation.

Avoid:

```text
src/debug/NpcDebugManager.ts
src/debug/DebugManager.ts
src/ai/NpcDebugState.ts
```

because those would tend to become parallel ownership layers.

## 21. Important discrepancies from the original plan

### A. `goal / pressure / strategy` are conceptual, not established runtime contracts

The plan currently says the inspector should expose goal/pressure/strategy. The implementation notes should constrain this to existing decision vocabulary. Do not build missing abstractions solely for diagnostics.

### B. `seedvale.debug` is not an existing API convention

The sample namespace is a proposed interface. The repository currently has shared debug gating and `createDebugGui`, but no established `seedvale.debug` global was found in the reviewed code.

### C. Full queue state is not exposed by `InteractionQueue`

Only per-agent membership/index/serving queries are public. Do not bypass the interface by reading `waiting`/`serving` directly.

### D. NPC picking already exists

`Interactable` already represents NPCs and `buildInteractables()` is the shared candidate builder. Ctrl+click should extend this path, not create a second NPC raycast system.

### E. Watchdog is pure and returns a rescue stage

`npcMovementWatchdog.ts` does not own NPC phase/action mutation. Trace rescue events at `NpcAgent` where the returned stage is acted upon.

## 22. Verdict

**Plan 170: approved with implementation clarifications.**

The plan does not need a new dependency. The implementation should remain diagnostic-only and should reuse the current NPC/action/queue/picking/debug mechanisms.

The main risk is overbuilding a generic diagnostic architecture or inventing `goal/pressure/strategy` state that does not exist. Keep the first implementation narrow: authoritative snapshot + bounded semantic history + causal projection + one debug API + one inspector surface.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
