# Seedvale Domain Roadmaps

Domain roadmaps describe the **target state** of individual Seedvale domains.
They answer what a domain should become as a coherent system, not what is currently implemented.

## Purpose

A domain roadmap sits between the product roadmap and implementation plans:

```text
VISION
  ↓
ROADMAP.md
  ↓
Domain Roadmap
  ↓
Plan / Epic
  ↓
Implementation
  ↓
STATE.md
```

The roadmap is a living design document. It should be updated as the vision becomes clearer, systems evolve, or new interactions are discovered.

## Domain roadmap vs. current state

- `docs/STATE.md` and documents under `docs/state/` describe what actually exists now.
- `docs/ROADMAP.md` describes product-level direction and major themes.
- `docs/domains/` describes the desired long-term shape of a specific domain.
- `docs/plans/` contains concrete implementation work that moves the code toward a domain roadmap.

Do not use a domain roadmap as an implementation-status tracker. Verify implementation against the code and current-state documentation.

## Domain roadmaps

- [Agriculture](./agriculture.md)
- [Combat](./combat.md)
- [`Companions`](./companions.md)
- [Economy](./economy.md)
- [Fauna](./fauna.md)
- [Items](./items.md)
- [NPCs](./npc.md)
- [Player](./player.md)
- [Quests](./quests.md)
- [Resources](./resources.md)
- [Settlements](./settlements.md)
- [Weather & Seasons](./weather.md)
- [World](./world.md)

## Required relationship with plans

Every new implementation plan must belong to a domain and use that domain's roadmap as an anchor. The plan should identify the roadmap area it advances, rather than introducing an isolated feature with no place in the domain's target state.

Plan filenames use the domain prefix:

`YYYY-MM-DD--NNN--<domain>--<name>.md`

Example:

`2026-08-22--205--npc--new-feature.md`

A domain roadmap may contain future work that has no plan yet. Plans may also reveal gaps or missing interactions; update the roadmap when that changes the intended target state.

## Scope

Domain roadmaps should focus on:

- desired capabilities and behaviours,
- important entities and state,
- relationships between systems,
- player and NPC participation,
- persistent consequences and emergent behaviour,
- boundaries and principles that should guide implementation,
- major future phases where useful.

They should not become detailed technical implementation specifications. Those belong in plans and code.
