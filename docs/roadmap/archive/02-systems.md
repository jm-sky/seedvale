# Session 2 — Systems & Dependencies

**Status:** `DONE`  
**Date:** 2026-08-14

This document records the decisions accepted during Session 2. It is not a complete systems architecture or a final dependency map. Remaining open questions are deferred to later design/implementation work rather than blockers for closing this session.

## Accepted principles

### World architecture

Seedvale should use a hybrid architecture:

- a small shared `WorldContext` for common world-level context such as time/environment/seed,
- simulation state owned by the systems responsible for it,
- no large central `WorldState` acting as a God Object.

### Simulation entities and groups

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

### NPC and Household

The model is hybrid:

- **NPC** owns individual behaviour, needs, health, personality, traits, relationships and similar personal state.
- **Household/Family** owns shared life and economic concerns such as shared resources and household-level decisions.
- Not every NPC must necessarily belong to a household.

NPCs should not become independent miniature economies when a household-level concept is more appropriate.

### Needs, pressure and decision making

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

Decision priorities should be influenced by the hierarchy of **self / family / group or settlement**, personality and traits such as altruism, egoism or patriotism. Exact weighting remains to be defined.

### Goals and strategies

The model should support both emergent behaviour and explicit goals/strategies:

```text
State + Needs / Pressures + Traits + Relationships + Goals
  → Decision
  → Strategy
  → Actions
  → World changes
```

`Goal` is intended as a shared foundation that can be specialized for NPCs, households, settlements and groups. Complex goals may contain subgoals. Goals can retain progress, be temporarily deprioritized by crises, and resume later.

Strategies can be explicit options while the choice and execution remain dependent on the actual world state. This is intentionally a **strategies + emergence** model.

### Settlement and group decision layers

A settlement is expected to be more than a passive aggregate. The current direction is **B + C**:

- the settlement connects its units and shared state,
- it also has its own community-level state and decisions,
- a deterministic **Virtual Mayor** / settlement decision layer can handle development and crises without requiring a simulated mayor NPC.

The same general decision-layer foundation may be used by other groups, such as bandits.

A higher-level goal does not directly command NPCs. For example, a settlement may decide that it needs wood, but individual NPCs choose whether and how to contribute based on their own needs, priorities, personality, traits and context.

Goals may include development and crisis response, and can remain persistent with progress.

### Work and production

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

Production processes are likely to use recipes/process definitions, but with room for hybrid/specialized behaviour. Requirements may include buildings, tools, skills and time.

### Resources, storage and ownership

A shared foundation for resources/items/goods is acceptable, while natural resources and manufactured goods do not have to be identical in every semantic detail.

Resources may exist at multiple levels of representation, for example:

```text
specific wood pile
  → warehouse stock
  → regional availability
  → estimated remote availability
```

Storage is an active economic element, but should start simple and gain functionality only where needed. Some goods may have ownership or group affiliation; ownership is not required for every resource.

A resource shortage may create pressure and eventually a goal, but not every shortage should automatically create a goal. This is a hybrid mechanism.

### Buildings and infrastructure

Buildings are expected to participate in simulation, but selectively. Most may eventually have mechanics, while some can remain decorative or gain mechanics later.

The current architectural direction is hybrid:

- buildings can expose capabilities such as housing, storage, production or water access,
- selected buildings may also contain specialized logic where appropriate.

Infrastructure follows the same hybrid principle. Selected elements can affect movement, transport, access and other systems, while decorative or low-impact infrastructure need not be deeply simulated.

### Relationships

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

### Time and simulation frequency

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

### Events and system communication

System communication should use a **hybrid** approach:

- events for loosely coupled communication,
- direct communication where a strong, explicit dependency is appropriate,
- avoid both excessive direct coupling and an event-driven "spaghetti" architecture.

A central `WorldEventManager` is **not** accepted as a default architecture because it could become a coupling point and bottleneck.

Instead, the current direction is:

> shared event contracts/models + decentralized producers and consumers.

The world may contain important semantic events such as births, deaths, marriages, fires, discoveries, migrations, trade and other significant events. These can later feed relationships, history, quests, dialogue and similar systems.

### World history and memory

Important world events should be persistent parts of the world history, but not everything needs to be remembered forever.

Memory can be selective and may decay / be forgotten over time.

This principle applies both to world history and to relationship history.

### Persistence

Persistence should cover the continuing state of the world, not only the player.

The saved state should be sufficient for the world to continue after restarting the game, including relevant state of NPCs, families, animals, settlements, resources, relationships, events and other simulation entities.

### Hybrid simulation and aggregation

Simulation may change representation depending on context and distance.

For example, a wildlife population may be represented by individual animals when actively simulated and by aggregated population data when remote.

Aggregation must be conservative around sensitive situations. Important examples include:

- combat,
- fleeing,
- important actions,
- significant events,
- player observation,
- other states where losing individual detail would change the outcome.

Individual systems should have substantial control over their appropriate simulation detail, potentially combined with shared contracts/conditions. Simplifications are explicitly allowed when they produce a sufficiently believable continuation of the world.

### Transport

Transport should be a real activity where it matters:

```text
collect
  → load
  → travel
  → unload
```

Important transports may be fully simulated. Bulk or low-value flows may be aggregated, especially outside the active simulation area. Practical simplifications are allowed, including higher-than-realistic carrying capacity where necessary to keep the economy flowing without excessive simulation cost.

### Environment and dynamic resources

The environment should influence **selected systems**, rather than creating global coupling between every system.

Natural resources should be dynamic where it produces useful simulation effects, but only selected resources need regeneration/depletion behaviour. We do not need to simulate every ecological detail.

Selected feedback loops are desirable when they create meaningful emergent outcomes, but they should be deliberate rather than universal.

### Wildlife and ecosystem

Wildlife should use selected ecosystem mechanisms rather than attempting to simulate a complete ecological model from the start.

- ecosystem-level pressures may be introduced selectively and incrementally,
- predator/prey food-chain modelling should initially cover selected species,
- wildlife should affect settlements and economy through selected meaningful dependencies.

### Player integration

The player should generally use the same underlying world systems as NPCs, while not necessarily using the same interface or level of control.

The player can influence NPCs, groups and settlement goals through actions in the world rather than becoming a direct controller of the simulation.

Player actions can create pressures, goals and consequences that flow through the same world systems.

### Quests and authored scenarios

Quests should use a hybrid model:

1. **Emergent quests** can arise from existing world problems/goals.
2. **Authored scenarios** can introduce designed content and special mechanics, such as caves, ruins, treasures or unique mobs (e.g. a large wolf).

Quests should generally build on existing world systems rather than becoming a parallel simulation architecture.

### Dialogue

Dialogue should partially reflect the actual state of the world and NPCs. It should be able to use relevant needs, family, relationships, work, events, settlement problems and history, while not requiring every line to be fully dynamic.

### World independence from the player

The world should be able to produce meaningful situations that the player does not see or directly influence. Examples include NPC conflicts/resolutions, settlement development, wildlife movement and trade between remote settlements.

The extent and fidelity of such simulation may be reduced when remote, provided the resulting world state remains believable.

## Decisions still open

The following remain intentionally open and should be resolved later during design/implementation, not as a prerequisite for closing Session 2:

1. The exact semantic model shared by NPC, Household, Settlement and Group pressures.
2. The exact implementation and weighting of priority between self, family, group/settlement, personality and traits.
3. The exact structure and ownership boundaries of `Settlement` and its decision layer.
4. The precise abstraction shared by `Goal` and specialized goal types.
5. The exact architecture for simulation LOD / aggregation and transitions between representations.
6. Which buildings and infrastructure elements receive mechanics first.
7. The exact scope and implementation of relationship history and memory decay.
8. Which environment/resource/ecosystem feedback loops are worth simulating.

## Session status

- [x] Session 0 — Context & Current State
- [x] Session 1 — Vision & Desired World
- [x] Session 2 — Systems & Dependencies
- [ ] Session 3 — Development Stages — **CURRENT**
- [ ] Session 4 — Existing Plans Mapping
- [ ] Session 5 — Roadmap v1

> This document records the accepted state of the discussion. It does not establish implementation order and should not be treated as a final architecture specification.
