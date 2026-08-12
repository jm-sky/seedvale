# Session 2 — Systems & Dependencies

**Status:** IN PROGRESS

This document records the decisions accepted during Session 2 so far. It is not yet a complete systems architecture or dependency map.

## Accepted principles

### World architecture

Seedvale should use a hybrid architecture:

- a small shared `WorldContext` for common world-level context such as time/environment/seed,
- simulation state owned by the systems responsible for it,
- no large central `WorldState` acting as a God Object.

### Resources and environment

Natural resources should use a shared resource system connected to the environment.

The environment provides conditions; the resource system owns resource availability, regeneration and related state.

### NPC and Household

The model is hybrid:

- **NPC** owns individual behaviour, needs, health, personality, traits, relationships and similar personal state.
- **Household/Family** owns shared life and economic concerns such as shared resources and household-level decisions.
- Not every NPC must necessarily belong to a household.

NPCs should not become independent miniature economies when a household-level concept is more appropriate.

## Flexible simulation entities / groups

There should not be a single mandatory unit of simulation. Depending on the situation and system, the simulation may operate on:

- individual NPCs,
- families / households,
- settlements,
- work groups,
- trading caravans,
- wildlife populations,
- special groups.

A special group can use the same foundations while having different goals and behaviours. For example, a **bandit group with a hideout** can share concepts with a settlement without being treated as a village.

General principle:

> A group is a useful simulation entity when it has a shared goal, resources, location, structure or behaviour.

This flexibility also supports CPU-friendly hybrid simulation and aggregation.

## Needs, pressure and decision making

NPC decision making should resemble a hierarchy of needs rather than a single flat need list.

Needs/pressures may exist at different levels:

```text
NPC
  → individual needs
  → Household needs
  → Settlement / Group needs
  → wider world context
```

The exact semantic model is intentionally not fixed yet. A biological need of an organism is not necessarily the same concept as a need of a household or settlement.

What is accepted is a common decision-oriented concept of **pressure / priority**, with factors such as:

- urgency,
- weight,
- current state,
- desired state,
- context,
- available actions.

A need/pressure should not dictate one fixed solution. Example:

```text
Food shortage
  ├─ hunting
  ├─ farming
  ├─ fishing
  ├─ purchase
  ├─ import
  └─ migration
```

The decision can consider fatigue, time of day, distance, risk, skills, availability and other contextual factors.

## Work and production

Work is an ordinary type of NPC activity rather than a separate conceptual mechanism.

Profession primarily determines capabilities, skills and preferences. Existing behaviour/action mechanisms should be able to execute work.

Production should result from actual actions rather than from abstract periodic production ticks:

```text
NPC / Group
  → action
  → time / resource consumption
  → produced good
  → storage / transport
  → further use
```

## Group and settlement decisions

Not every important decision needs to emerge directly from an urgent need.

The model should also support:

```text
state + trends + goals
  → decision
  → actions
```

This is particularly relevant for future settlement development. Some strategic decisions may need dedicated mechanisms rather than being left entirely to emergent behaviour.

The exact strategic decision mechanism remains open.

## Relationships

A shared relationship system is a likely direction, capable of representing relationships between different entity types, for example:

```text
NPC ↔ NPC
NPC ↔ Household
NPC ↔ Settlement
Settlement ↔ Settlement
Group ↔ Group
```

Relationships can influence decisions and behaviour. Examples include trust, family bonds, reputation, dependency and cooperation.

The influence should be introduced incrementally; not every relationship type needs to affect every system from the beginning.

Relationships should evolve over time. Their history can be selective rather than a complete event log. Important semantic events may be remembered, e.g. a rescue, betrayal or significant help.

## Time and simulation frequency

Time is a shared foundation of the simulation, but systems do not need to update on every tick.

Different systems should have different update frequencies appropriate to their role, e.g.:

```text
rendering             → high frequency
NPC movement          → frequent
needs                 → slower
population/lifecycle  → slower still
economy               → system-dependent
regional simulation   → very infrequent
```

This is a core performance principle.

## Events and system communication

System communication should likely use a **hybrid** approach:

- events for loosely coupled communication,
- direct communication where a strong, explicit dependency is appropriate,
- avoid both excessive direct coupling and an event-driven "spaghetti" architecture.

A central `WorldEventManager` is **not** accepted as a default architecture because it could become a coupling point and bottleneck.

Instead, the current direction is:

> shared event contracts/models + decentralized producers and consumers.

The world may contain important semantic events such as births, deaths, marriages, fires, discoveries, migrations, trade and other significant events. These can later feed relationships, history, quests, dialogue and similar systems.

## World history and memory

Important world events should be persistent parts of the world history, but not everything needs to be remembered forever.

Memory can be selective and may decay / be forgotten over time.

This principle applies both to world history and to relationship history.

## Persistence

Persistence should cover the continuing state of the world, not only the player.

The saved state should be sufficient for the world to continue after restarting the game, including relevant state of NPCs, families, animals, settlements, resources, relationships, events and other simulation entities.

## Hybrid simulation and aggregation

Simulation may change representation depending on context and distance.

For example, a wildlife population may be represented by individual animals when actively simulated and by aggregated population data when remote.

Aggregation must be conservative around sensitive situations. Important examples include:

- combat,
- fleeing,
- important actions,
- significant events,
- player observation,
- other states where losing individual detail would change the outcome.

The exact mechanism is not fixed yet. The current direction is that individual systems should have substantial control over their appropriate simulation detail, potentially combined with shared contracts/conditions.

Simplifications are explicitly allowed when they produce a sufficiently believable continuation of the world.

## Resource aggregation

Resources may exist at multiple levels of representation, for example:

```text
specific wood pile
  → warehouse stock
  → regional availability
  → estimated remote availability
```

This is intended to support both realistic physical flows and CPU-efficient remote simulation.

## Transport

Transport should be a real activity where it matters:

```text
collect
  → load
  → travel
  → unload
```

Important transports may be fully simulated. Bulk or low-value flows may be aggregated, especially outside the active simulation area.

Practical simplifications are allowed, including higher-than-realistic carrying capacity where necessary to keep the economy flowing without excessive simulation cost.

---

## Decisions still open

The following questions have been raised but **not decided**:

1. Whether `Settlement` should be primarily an aggregate of multiple systems or contain more logic in one `SettlementSystem`.
2. Whether buildings should be active simulation elements with capabilities such as storage, production, housing and water access.
3. Whether infrastructure should participate directly in system dependencies, e.g. roads affecting transport and bridges affecting access to resources.
4. The precise abstraction shared by NPC, Household, Settlement and other group-level pressures.
5. The exact strategic decision mechanism for settlements and other groups.
6. The exact architecture for simulation LOD / aggregation.

These should be discussed before Session 2 is considered complete.

## Session status

- [x] Session 0 — Context & Current State
- [x] Session 1 — Vision & Desired World
- [🟡] Session 2 — Systems & Dependencies — **CURRENT**
- [ ] Session 3 — Development Stages
- [ ] Session 4 — Existing Plans Mapping
- [ ] Session 5 — Roadmap v1

> This document records the accepted state of the discussion. It does not establish implementation order and should not be treated as a final architecture specification.
