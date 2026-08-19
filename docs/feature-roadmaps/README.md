# Seedvale Feature Roadmaps

**Updated:** 2026-08-19

Feature roadmaps describe the planned evolution of larger, interconnected features that span multiple implementation plans.

They sit between the high-level product roadmap and concrete implementation plans:

```text
docs/ROADMAP.md
    ↓
docs/feature-roadmaps/
    ↓
docs/plans/
```

## Purpose

Feature roadmaps are used for features that:

- evolve through multiple implementation steps,
- depend on several existing systems,
- may remain partially implemented for a long time,
- have several possible future extensions,
- benefit from keeping a coherent long-term direction.

They are **directional documents**, not implementation-status databases.

The repository's actual code remains the source of truth.

## Relationship to implementation plans

A feature roadmap describes **what the feature should become**.

An implementation plan describes **how a specific step will be implemented**.

```text
Feature roadmap
    ├── Stage 0
    │    └── implementation plan
    ├── Stage 1
    │    └── implementation plan
    └── Stage 2
         └── implementation plan
```

A roadmap stage does not imply that its implementation plan exists or that the stage is implemented.

Always verify:

1. current code,
2. tests/build configuration,
3. implementation notes/reviews,
4. plans,
5. roadmap documents.

## Design principles

Feature roadmaps should:

- extend existing systems instead of creating parallel mechanisms,
- identify dependencies explicitly,
- preserve world independence from the player,
- favour deterministic simulation,
- avoid premature implementation details,
- describe meaningful interactions with existing systems,
- allow individual capabilities to evolve independently when appropriate.

A feature roadmap should not become a second `docs/ROADMAP.md` or a detailed implementation plan.

## Current Feature Roadmaps

| Feature | Document | Description |
|---|---|---|
| Containers & Player Storage | [`containers.md`](./containers.md) | Generic containers, player storage, item size and encumbrance foundation |
| Companions | [`companions.md`](./companions.md) | NPC helpers, companions, camp life, defense, follow, roles and skills |

## Adding a Feature Roadmap

Create a dedicated Markdown document in this directory.

Use a name based on the feature rather than a date:

```text
docs/feature-roadmaps/<feature>.md
```

The document should normally contain:

1. **Goal**
2. **Design principles**
3. **Roles / concepts**, where applicable
4. **Stages**
5. **Dependencies**
6. **Future extensions**
7. **Explicit non-goals**, where useful

Keep implementation-specific details in `docs/plans/`.

## Status

Feature roadmaps are planning documents.

Do not treat the presence of a stage in a roadmap as evidence that the feature exists in the codebase.
