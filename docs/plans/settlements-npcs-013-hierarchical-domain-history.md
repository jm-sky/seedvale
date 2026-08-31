# Plan: Hierarchical Domain History

**Created:** 2026-08-31  
**Status:** `planned` 📋  
**Priority:** high · **Effort:** M  
**Depends on:** `none`  
**Domain:** `settlements-npcs`

## Goal

Extend the existing NPC simulation trace into a coherent hierarchical history that allows developers to reconstruct meaningful simulation behaviour across:

```
Settlement
  └─ Household
       └─ NPC
```

The primary diagnostic question is:

> What happened, what changed, and how did the current state come about?

The first implementation must build on the existing NPC trace/inspection infrastructure from plan 170 rather than creating a parallel debug architecture.

## Current foundation

Plan 170 already provides the main NPC-level primitives:

- typed `NpcTraceEvent` events,
- bounded per-NPC ring buffer,
- NPC `history()`,
- stable inspection snapshot,
- `why()` causal inspection,
- `window.seedvale.debug.npc(id)`,
- NPC query/filter support,
- authoritative NPC ownership of trace data.

The current codebase also provides:

- `Household` as the authoritative owner of household stock/items/water,
- `HouseholdRegistry` owned by `SettlementsManager`, preserving household state across settlement streaming,
- `Settlement.households`,
- `Settlement.npcs`,
- `Settlement.economy`,
- stable NPC IDs derived from settlement identity,
- settlement-aware NPC lookup through the existing debug inspector.

These existing ownership boundaries must remain intact.

## Architectural decision

Do **not** introduce:

- a generic global `EventBus`,
- a `DebugManager`,
- separate `NpcHistory`, `HouseholdHistory` and `SettlementHistory` systems,
- duplicated copies of the same event at each scope,
- a second NPC trace implementation.

Preserve the existing typed NPC trace model and extend it only as far as required for hierarchical querying.

The implementation should use shared event/history infrastructure where useful, while keeping event production at the authoritative domain owner.

Do not replace the existing typed `NpcTraceEvent` union with an untyped generic event object merely to unify domains.

## Domain relationship

The target relationship is:

```
NPC event
  │
  ├── NPC scope
  ├── Household scope
  └── Settlement scope
```

For an event caused by an NPC, its context should identify the relevant household and settlement.

For events originating directly from household or settlement systems, the event should be owned by that domain and contain the appropriate higher-level context.

The same logical event must not be copied three times merely to make it visible at different scopes.

## Scope

### 1. Extend the existing event model

Reuse the existing `NpcTraceEvent` structure and event conventions wherever possible.

Add only the minimum context required to associate events with:

- NPC,
- household,
- settlement.

Existing event vocabulary from plan 170 remains authoritative for NPC decisions/actions.

Do not rename or duplicate existing event types without a concrete compatibility reason.

### 2. Add household-level history

Provide:

```ts
debug.household(id).history()
```

The history should expose meaningful events affecting the household.

Initially include events that already exist naturally in the current simulation, such as:

- household shortage/problem changes,
- resource delivery,
- resource consumption,
- household stock changes caused by NPC actions,
- important member changes,
- other meaningful state transitions already represented by existing authoritative code.

Do not invent new household simulation concepts purely for debugging.

The household history should be produced from authoritative ownership points.

`Household` remains the owner of household state. The debug history must never become a second owner of that state.

### 3. Add settlement-level history

Provide:

```ts
debug.settlement(id).history()
```

Settlement history should expose meaningful events occurring within the settlement domain.

It should be possible to see a process such as:

```
household shortage
→ NPC pressure
→ NPC decision
→ plan
→ action
→ resource delivery
→ household shortage resolved
```

without requiring the developer to manually combine unrelated logs.

Settlement remains the authoritative owner of settlement-level state. History observes the domain; it does not own it.

### 4. Preserve NPC history

Existing API:

```ts
debug.npc(id).history()
```

must continue to work.

Where an event already belongs to an NPC, extending its context must not change the existing meaning of the NPC trace.

The intended scopes are:

```
NPC history
    = events relevant to NPC

Household history
    = events relevant to household

Settlement history
    = events relevant to settlement
```

### 5. Current-state context

History must be useful together with the existing inspection snapshot.

The diagnostic workflow should become:

```
current state
      ↓
recent history
      ↓
previous decisions/actions
      ↓
observable state changes
```

Reuse existing `NpcAgent.createInspectionSnapshot()` and `Household.snapshot()` where useful.

Do not introduce the full `world.snapshot()` system in this plan.

### 6. Correlation of multi-step processes

Preserve a meaningful existing process/action/plan identity when one already exists.

A `correlationId` may be added to the shared event representation only if it can be propagated without invasive changes to unrelated simulation systems.

The desired result is that a multi-step process can be reconstructed:

```
problem.created
  ↓
pressure.changed
  ↓
decision
  ↓
plan.created
  ↓
action.completed
  ↓
resource.delivered
  ↓
problem.resolved
```

Do not introduce UUID generation, a generic workflow engine, or a new correlation subsystem solely for this feature.

If no natural correlation exists, chronology and domain context must still allow useful reconstruction.

### 7. Event ordering

History output must have deterministic ordering.

Choose one ordering convention and use it consistently, preferably oldest → newest for diagnostic timelines.

When events have identical simulation timestamps, use a deterministic secondary ordering or sequence number.

Do not rely on JavaScript object/map iteration order to establish domain chronology.

### 8. Event source

Where practical, retain a compact indication of the authoritative producer of an event, for example the owning domain/system.

This should answer:

> Which system emitted this state transition?

Do not capture stack traces or expensive diagnostic metadata.

Only add `source` if it fits naturally into the existing typed event model.

### 9. Bounded history and runtime cost

History must remain bounded.

Use the existing NPC trace's bounded-storage approach as the baseline.

Requirements:

- no unbounded global event list,
- no per-frame history entries,
- no string formatting during simulation updates,
- no full-world scans on every event,
- no additional simulation fidelity for off-screen agents,
- no Vue/UI work from simulation code.

If additional household/settlement storage is required, establish explicit bounded limits.

Separate these concerns:

```
debug API installation
        ≠
debug data collection
        ≠
debug inspection/query
```

The mere presence of `window.seedvale.debug` should remain cheap.

If debug initialization appears to affect boot time, use the existing boot markers to measure the difference rather than assuming history is the cause.

### 10. Debug API

Extend the existing `window.seedvale.debug` namespace.

Target:

```ts
debug.npc(id).history()

debug.household(id).history()

debug.settlement(id).history()
```

Keep the API:

- read-only,
- JSON-serializable,
- deterministic,
- stable enough for browser/AI-assisted diagnosis.

Useful filters may include:

```ts
history({
  since?,
  limit?,
  types?,
  correlationId?
})
```

Only add filters with a demonstrated use in the implementation or verification scenario.

Do not build a generic query language.

### 11. Shared domain lookup

Reuse existing authoritative registries and settlement structures.

In particular:

- NPC lookup should continue using the existing `SettlementsManager`/loaded settlement model,
- household lookup should use the existing `HouseholdRegistry`,
- settlement lookup should use the existing settlement collection.

Do not introduce another global registry solely for debug.

Streaming/rebuild behaviour must be respected: debug queries must not retain stale references to disposed/rebuilt entities.

## Event ownership rules

Every new event must have one clear authoritative producer.

Examples:

```
NPC decision
→ NpcAgent

Household stock mutation
→ Household/resource-owning system

Settlement economy mutation
→ SettlementEconomy / authoritative economy system

Settlement-level development change
→ settlement/development owner
```

Debug infrastructure must observe these events rather than performing state mutations itself.

If an event currently has no clear authoritative owner, resolve ownership before adding debug instrumentation.

## Implementation sequence

1. Extend the existing NPC trace/inspection infrastructure from plan 170; do not replace it.
2. Map current household and settlement state mutation points relevant to the verification scenario.
3. Extend the existing typed event representation with the minimum required domain context.
4. Add bounded shared/domain history storage without introducing a global event bus.
5. Instrument household and settlement authoritative mutation/transition points.
6. Preserve and extend existing NPC trace events.
7. Implement `debug.household(id).history()`.
8. Implement `debug.settlement(id).history()`.
9. Preserve natural action/plan/process identity for correlation where available.
10. Add focused tests for event context, hierarchical filtering, ordering, bounded history and lifecycle safety.
11. Verify the end-to-end household shortage scenario.
12. Measure debug/history runtime overhead where practical using existing boot/runtime diagnostics.

## Likely files / systems

Confirm exact current paths before editing, but the primary systems are known:

- `src/ai/NpcAgent.ts`
- `src/debug/npcTrace.ts`
- `src/debug/npcInspector.ts`
- `src/debug/npcDebugApi.ts`
- `src/settlement/household.ts`
- `src/settlement/createSettlement.ts`
- `SettlementsManager` / settlement registry
- household exchange/resource delivery systems
- settlement economy/resource mutation systems
- existing NPC/household action and interaction systems

Do not create a generic debug manager.

New modules should only be introduced if an existing module cannot own the responsibility cleanly.

## Tests

Add focused tests following the existing testing style.

### Event context

Verify that an NPC event carries the correct NPC, household and settlement context where applicable.

### Hierarchical filtering

Given:

```
Settlement A
  Household A1
    NPC A1-1
    NPC A1-2

Settlement B
  Household B1
    NPC B1-1
```

verify that NPC A1-1, Household A1 and Settlement A histories do not leak unrelated domain events.

### Event ordering

Verify deterministic ordering, including events sharing the same simulation timestamp.

### Bounded storage

Verify deterministic eviction and that history cannot grow without bound.

### Streaming

Verify that history queries do not retain disposed NPC/Settlement references and continue to work with the existing stream/rebuild lifecycle.

### Compatibility

Existing NPC trace tests from plan 170 must remain valid.

## Browser verification

With `?debug=1`:

1. Run the household resource scenario.
2. Select the involved NPC.
3. Inspect `debug.npc(id).history()`.
4. Inspect `debug.household(id).history()`.
5. Inspect `debug.settlement(id).history()`.
6. Compare the timelines.
7. Confirm that settlement history includes the relevant household/NPC events without duplicated records distorting the sequence.
8. Verify that unrelated NPCs/households do not appear.
9. Stream/rebuild the settlement and verify that debug queries do not reference disposed objects.
10. Compare startup/runtime behaviour with and without debug history collection where measurable.

## Non-goals

Do not implement:

- `world.snapshot()`,
- `why()` for household/settlement as a new causal system,
- animal history,
- full economy observability,
- relationship history,
- quest history,
- debug GUI,
- file export,
- `describe()`,
- LLM integration,
- persistent SaveData history,
- generic event sourcing,
- generic global event bus,
- per-frame telemetry.

These remain follow-up work described by the domain observability roadmap.

## Success criteria

The implementation is successful when a developer can take an emergent situation and reconstruct it at increasing scope:

```
NPC
 ↓
Household
 ↓
Settlement
```

For example:

```
Household has shortage
→ NPC reacts
→ NPC makes decision
→ NPC creates plan
→ NPC performs action
→ resource changes
→ household state changes
→ shortage resolves
```

The same real simulation process must be observable without temporary `console.log` instrumentation or inspection of private runtime state.

The implementation should strengthen the existing NPC trace into a reusable domain-observability foundation while keeping domain ownership, deterministic ordering, bounded memory and runtime cost explicit.

## Follow-up

After this stage, the next high-ROI extension is causal explanation across domain boundaries:

```
history
  ↓
why / causal chain
  ↓
snapshots
```

Animal observability and broader world/economy observability should build on the same foundation rather than introducing parallel debug mechanisms.

**Zrób git commit i push do main, rebase jeżeli trzeba**
