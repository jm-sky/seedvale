# Seedvale — Session 2: Systems & Dependencies

**Status:** `IN PROGRESS — REVIEW`  
**Purpose:** define the major systems and their relationships without defining implementation order.  
**Source:** `docs/roadmap/02-systems.md`  

This document captures the current Session 2 decisions. It intentionally avoids detailed implementation design. Session 2 remains open until the remaining architectural questions are accepted.

---

## 1. Architectural principles

### System ownership

Seedvale should use a hybrid architecture:

- a small shared `WorldContext` for common world-level context such as time, environment and seed,
- simulation state owned by the systems responsible for it,
- no large central `WorldState` / God Object.

Systems should communicate through explicit dependencies where appropriate and shared event contracts where loose coupling is useful.

### Simulation entities

There is no single mandatory unit of simulation. Depending on the situation, systems may operate on:

- individual NPCs,
- households / families,
- settlements,
- work groups,
- trading groups / caravans,
- wildlife populations,
- other special groups.

A group is useful as a simulation entity when it has meaningful shared goals, resources, location, structure or behaviour. Special groups may reuse common foundations without being treated as settlements.

### Hybrid simulation

Simulation detail may change with relevance, distance and situation. Important or active entities can be simulated individually; remote or low-impact situations may use aggregation or lower-frequency simulation.

Simplification is allowed when it preserves a believable continuation of the world. Sensitive situations such as combat, fleeing, important actions, significant events and player-observed situations require higher fidelity.

When simulation is aggregated or simplified:

- important world-state quantities remain consistent,
- important events and consequences are not silently lost,
- entities do not gain resources, population or other state without a plausible simulated cause,
- returning to detailed simulation produces a believable state consistent with what happened while the entity was aggregated.

---

## 2. Core system model

### NPC and Household

The model is hybrid:

- **NPC** owns individual state: needs, behaviour, health, personality, traits, relationships and personal goals,
- **Household / Family** owns shared life and economic concerns such as shared resources and household-level decisions,
- not every NPC must belong to a household.

NPCs should not become independent miniature economies when a household-level concept is more appropriate.

### Needs, problems and goals

These are conceptually distinct:

- **needs** describe states that require satisfaction or maintenance,
- **problems** describe undesirable situations requiring a response,
- **goals** describe desired future states or outcomes.

They may share implementation mechanisms for evaluation, prioritization and decision making, but they are not required to be the same domain concept.

This distinction applies across the simulation. For example, an NPC may have biological needs, while a household or settlement may have problems such as insufficient food or damaged infrastructure and goals such as expanding housing.

### Decision making

Decision making should use a common concept of **pressure / priority**, while keeping the semantics of needs distinct from problems and goals.

A pressure can consider factors such as urgency, importance, current state, desired state, context and available actions.

A pressure does not dictate one fixed solution. For example, a food shortage could lead to hunting, farming, fishing, purchase, import or migration depending on context.

Decision making should consider the relevant level of responsibility:

```text
self ↔ household/family ↔ settlement/group
```

Personality, traits, relationships and world context influence how an entity responds to competing pressures. An NPC may prioritize a family or settlement problem over a personal need, depending on its state and characteristics.

### Goals and strategies

The target model combines explicit goals with emergent behaviour:

```text
State + Pressures + Traits + Relationships + Goals
  → Decision
  → Strategy
  → Actions
  → World changes
```

Goals may exist at different simulation levels, but no universal goal abstraction is required at this stage.

Strategies represent possible approaches; their selection and execution remain dependent on the actual world state.

### Settlement / group decision layer

A settlement is more than an aggregate of NPCs. It is a full simulation system with shared state, problems, goals and community-level decisions.

Development should be incremental. Early versions may behave closer to an aggregation/state layer; later versions can introduce increasingly capable deterministic settlement decisions, including scenarios handled from a "Virtual Mayor" perspective without requiring a dedicated mayor NPC.

For example, the system may initially support one concrete management scenario, then gain additional scenarios over time.

Higher-level goals should create pressure/opportunity rather than directly commanding individual NPCs. NPCs decide how and whether to contribute based on their own state and context.

---

## 3. Economy and material flow

### Work and production

Work is an ordinary NPC activity executed through existing behaviour/action mechanisms.

Profession primarily defines capabilities, skills and preferences rather than introducing a separate work system.

Production should normally result from actions performed in the world:

```text
actor / group
  → action
  → time + resource consumption
  → produced good
  → storage / transport
  → further use
```

Recipes or process definitions may describe production requirements, while specialized processes can remain possible.

### Resources, goods and storage

A shared foundation for resources, items and goods is desirable, while natural resources and manufactured goods may retain different semantics.

The same underlying resource may be represented at different levels of detail depending on context, from a concrete local stock to aggregated regional availability.

Storage is part of the economic simulation, but should remain as simple as possible until deeper functionality is justified.

Ownership may exist where economically meaningful, but does not need to apply to every resource.

### Transport

Transport is a real world activity when it matters:

```text
collect → load → travel → unload
```

Important flows may be individually simulated; bulk or remote flows may be aggregated when this does not change meaningful outcomes.

---

## 4. Settlements, buildings and infrastructure

### Buildings

Buildings participate in simulation when they provide meaningful capabilities such as housing, storage, production, water access or other relevant functions.

Capabilities should be reusable where useful, while specialized buildings may own specialized behaviour when necessary.

### Infrastructure

Infrastructure is simulated selectively. Elements that materially affect movement, access, transport or other systems may participate in simulation; decorative or low-impact elements do not need deep simulation.

### Settlement development

Settlement development should emerge from population, resources, economy, infrastructure and the decisions of the settlement/group layer rather than from a separate isolated progression system.

---

## 5. Relationships, events and memory

### Relationships

The initial relationship system is deliberately narrow:

```text
NPC ↔ NPC
```

Relationships can influence decisions and behaviour and should evolve over time. Additional relationship types may be introduced later when required by the simulation.

### Events

Communication should use a hybrid model:

- direct communication for strong, explicit dependencies,
- events for loosely coupled interactions,
- shared event contracts/models,
- no mandatory central `WorldEventManager` / event God Object.

Important world events such as births, deaths, marriages, fires, discoveries, migration and trade may become inputs to relationships, history, dialogue and quests.

### World history and memory

Important world events should persist as meaningful world history, but not everything needs to be remembered forever. Memory may be selective and may decay over time.

---

## 6. Time and simulation scheduling

Time is a shared simulation foundation, but systems should use different update frequencies appropriate to their role.

Examples:

```text
rendering             → high frequency
NPC movement          → frequent
needs                 → slower
population/lifecycle  → slower still
regional simulation   → infrequent
```

The exact scheduling model is intentionally deferred. The principle is that simulation cost should scale with relevance rather than forcing every system to run at the same frequency.

---

## 7. Environment, resources and ecosystem

The environment should influence selected systems rather than creating global coupling between every system.

Natural resources should be dynamic where depletion or regeneration creates meaningful gameplay/simulation effects. Complete ecological simulation is not required.

Wildlife should use selected ecosystem mechanisms and evolve incrementally toward the Session 1 vision:

- predator / prey relationships,
- food availability,
- population pressure,
- reproduction and lifecycle,
- migration and seasonal effects where justified,
- interactions with settlements and human activity.

Feedback loops should be deliberate and meaningful rather than universal.

---

## 8. Persistence and world independence

Persistence covers the continuing world, not only the player. Saved state must allow the simulation to continue after restart, including relevant NPC, household, animal, settlement, resource, relationship and other world state.

The world must continue to produce meaningful outcomes without the player. Remote simulation may be simplified, but it must preserve believable consequences and continuity.

---

## 9. Player, quests and dialogue

### Player integration

The player should use the same underlying world systems as NPCs where practical, while retaining a different interface and level of direct control.

Player actions can create pressures, goals and consequences that propagate through the existing simulation rather than through player-only mechanics.

### Quests

Quests use a hybrid model:

1. emergent quests can arise from world problems and goals,
2. authored scenarios can introduce designed content and special mechanics.

Quests should build on existing world systems rather than create a parallel simulation architecture.

### Dialogue

Dialogue should reflect relevant actual world state, including needs, relationships, family, work, settlement problems, events and history, without requiring every line to be fully dynamic.

---

## 10. High-level dependency map

This map describes **system relationships, not implementation order**.

```text
                    World / Time / Environment
                              │
             ┌────────────────┴────────────────┐
             ↓                                 ↓
     Resources / Ecosystem              NPC / Household State
             │                                 │
             ├──────────────┐          ┌───────┴────────┐
             ↓              ↓          ↓                ↓
       Work / Production  Availability  Pressure      Relationships
             │              │          │                │
             └──────┬───────┘          └───────┬────────┘
                    ↓                          ↓
              Storage / Transport        Goals / Strategy
                    │                          │
                    └──────────┬───────────────┘
                               ↓
                           Actions
                               │
                               ↓
                        World State Changes
                               │
          ┌────────────────────┼─────────────────────┐
          ↓                    ↓                     ↓
      Settlement           Ecosystem             Events
      Development          Changes             / History
          │                    │                     │
          └──────────────┬─────┴─────────────┬───────┘
                         ↓                   ↓
                    New Pressures       Dialogue / Quests

Player actions enter the same action/world-change flow.
```

The map is intentionally high-level. It must not be interpreted as a fixed dependency graph for implementation.

---

## 11. Deferred architectural notes

These principles are useful for future design but are intentionally not treated as Session 2 decisions:

- Resource representation may evolve from concrete local stocks to aggregated regional availability depending on simulation context.
- Important world flows may be simulated individually while bulk/remote flows may be aggregated.
- Buildings may expose reusable capabilities while specialized buildings retain specialized behaviour.
- Infrastructure should only receive deep simulation when it has meaningful effects on movement, access, transport or other systems.
- Different simulation systems may run at different frequencies; there is no requirement for one universal simulation tick.
- Shared event contracts are preferred over a mandatory central event manager.
- World and relationship memory should be selective rather than a complete permanent event log.
- Environmental/resource feedback loops should be introduced selectively; full ecological simulation is not required.
- Player systems should reuse world simulation primitives instead of creating parallel player-only mechanisms.
- Quest and dialogue systems should consume existing simulation state rather than become independent sources of world truth.

---

## Session status

- [x] Session 0 — Context & Current State
- [x] Session 1 — Vision & Desired World
- [🟡] Session 2 — Systems & Dependencies — **CURRENT**
- [ ] Session 3 — Development Stages
- [ ] Session 4 — Existing Plans Mapping
- [ ] Session 5 — Roadmap v1

> Session 2 is consolidated but remains open until the user explicitly accepts it as complete.
