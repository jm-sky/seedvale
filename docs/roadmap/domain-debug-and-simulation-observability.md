# Domain Debug & Simulation Observability Roadmap

## Goal

Make Seedvale's simulation explainable, inspectable and verifiable without replacing deterministic simulation with logging or LLM behaviour.

## Direction

The existing NPC inspector/trace is the reference model. Extend observability through shared domain events and domain-owned debug APIs rather than creating unrelated debug systems.

Preferred capabilities:

```text
Inspect
Trace
Explain
Control
Trigger
Verify
```

## High-ROI progression

```text
Hierarchical history
        ↓
Causal explanation (`why`)
        ↓
Structured snapshots
        ↓
Animal observability
        ↓
Settlement / household / economy / resource observability
        ↓
Relationships / emergent quests
        ↓
AI-readable + human-readable representations
```

### 1. Hierarchical domain history — first priority

Build on the existing NPC trace and expose meaningful history at multiple scopes:

```text
Settlement
  └─ Household
       └─ NPC
```

The same domain events should be queryable at the relevant parent scopes instead of maintaining separate duplicated history systems.

Focus on semantic state changes and decisions, not per-frame telemetry.

Examples:

- problems/pressures appearing or resolving,
- decisions and strategies,
- plans created/progressed/completed/failed,
- actions and meaningful outcomes,
- resource shortages/deliveries/consumption,
- relationship changes,
- important settlement/household changes.

Target developer API:

```text
settlement(id).history()
household(id).history()
npc(id).history()
```

The first implementation should reuse the existing NPC trace where practical and avoid introducing a parallel logging architecture.

### 2. Causal explanation

Extend the existing NPC `why()` concept to explain important domain decisions and state changes.

Examples:

```text
npc(id).why()
household(id).why(...)
settlement(id).why(...)
```

The goal is to expose the causal chain rather than merely dump internal fields.

### 3. Structured snapshots

Provide current-state snapshots independently from history:

```text
world.snapshot()
settlement(id).snapshot()
household(id).snapshot()
npc(id).snapshot()
```

World snapshots should prefer semantic information useful for diagnosis (landmarks, rivers, mountains, elevation/regions, settlements, resources and relevant state) over dumping raw terrain data indiscriminately.

JSON is the preferred structured/export format, not necessarily the final human-facing representation.

### 4. Animal observability

Animals currently have much weaker runtime observability than NPCs. Extend the model to support inspection, meaningful history and causal behaviour debugging where justified by the existing animal simulation.

Potential surface:

```text
animal(id).snapshot()
animal(id).history()
animal(id).why()
```

Add control/trigger capabilities only where they provide real verification value.

### 5. Broader domain observability

Gradually extend observability to:

- settlements,
- households and storage/logistics,
- resources and economy,
- relationships/social systems,
- quests and progression.

Each extension should answer the same questions:

```text
What happened?
Why did it happen?
What changed?
What caused it?
```

### 6. AI-readable and human-readable output

Keep structured data available through developer APIs and support an export/description layer when useful for AI-assisted diagnosis.

Potential forms:

```text
.snapshot()   → structured data
.history()    → structured events
.describe()   → compact semantic representation
.export()     → AI-readable diagnostic package
```

Do not make raw JSON the only interface. Compact semantic descriptions may be substantially easier for AI and humans to reason about.

## Runtime cost principles

The existence of `window.seedvale.debug` should remain cheap. Debug data collection should be bounded and event-based.

Avoid:

- per-frame debug history,
- unbounded event retention,
- always-on expensive world scans,
- generating large snapshots unless explicitly requested.

Debug API installation, inspector usage and large diagnostic queries should remain separate concerns.

If `?debug` appears to increase startup time materially, measure the difference with boot markers rather than assuming the debug API is the cause.

## Success criterion

A developer should be able to take an emergent situation such as:

```text
household shortage
  → NPC pressure
  → decision
  → plan
  → action
  → resource movement
  → shortage resolved
```

and reconstruct what actually happened from runtime history and snapshots, without relying only on visual observation or source-code inspection.

This roadmap is directional. Implementation details belong in implementation plans based on the current codebase.
