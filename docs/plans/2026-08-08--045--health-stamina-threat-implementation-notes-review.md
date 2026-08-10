# Review: Health / Stamina / Threat Implementation Notes

## Purpose

Architectural review of `2026-08-08--045--health-stamina-threat-implementation-notes.md` against the current repository state.

These are review corrections to apply before implementation. The original implementation notes remain unchanged.

## CRITICAL

### 1. Existing animal `energy` is already stamina

`src/fauna/AnimalLife.ts` already models `AnimalLifeState.energy` as a physical effort resource:

- sprinting consumes energy,
- energy regenerates outside sprinting,
- low energy influences animal behavior/rest.

Treat this as the existing stamina mechanism to migrate/rename/abstract, not as an optional possibility and not as a reason to introduce a second `StaminaState` running in parallel.

The target should preserve one physical-effort resource across relevant actors.

### 2. Do not create parallel health/stamina mechanisms

The existing `HealthState` is already shared infrastructure for fauna and is intended to extend to NPCs. Stamina should follow the same principle: one generic state/data mechanism where semantics are shared, with actor-specific policy layered above it.

Avoid combinations such as:

```text
AnimalLifeState.energy + StaminaState.current
```

or separate NPC/animal health implementations.

## IMPORTANT

### 3. `AnimalLife` and `AnimalAgent` have different responsibilities

Current architecture separates:

```text
AnimalLife
  - hunger
  - thirst
  - energy/physical effort

AnimalAgent
  - movement/FSM
  - predator/prey behavior
  - perception
  - attack/combat behavior
```

045 should extend these existing responsibilities rather than move biological state into the agent FSM or create a second update pipeline.

### 4. Threat should remain a small state layer

Threat should represent danger/context used by decision making. It should not become another AI/FSM system.

The notes' `EntityRef` abstraction is not currently established as a repository-wide type. Do not introduce it merely for architectural symmetry unless there is a concrete need for generic entity references.

For v1, use the smallest representation compatible with existing actor references and expand only when a second real consumer requires it.

### 5. Keep decision ownership in the existing AI/FSM layer

Health, stamina, and threat should provide state/signals. Existing actor AI decides what to do with them.

Target flow:

```text
Health / Stamina / Threat
          ↓
       AI/FSM
          ↓
 movement / rest / flee / work / etc.
```

Do not create a new `ThreatManager`, `SurvivalController`, or parallel decision engine.

## MINOR

### 6. Explicitly document migration of `energy`

The implementation notes should state whether the existing field is renamed to `stamina`, wrapped by a generic stamina type, or otherwise migrated. The important architectural invariant is that there remains exactly one source of truth for physical effort.

### 7. Preserve existing deterministic/testable state updates

`AnimalLife` is already a relatively isolated state/update module. Prefer extending this style for generic biological/physical state rather than embedding new calculations directly into rendering or agent orchestration.

## OK

The separation of `Health`, `Stamina`, `Threat`, and AI/FSM is directionally correct and fits the existing Seedvale architecture, provided the existing `AnimalLife.energy` and shared `HealthState` are treated as migration points rather than replaced by parallel systems.
