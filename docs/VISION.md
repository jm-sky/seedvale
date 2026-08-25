# Seedvale — Vision

**Purpose:** define why Seedvale exists, what kind of world it is meant to become, and the principles that should guide major design decisions. This document describes the vision and long-term direction, not the current implementation status.

Current implementation state belongs in [STATE.md](./STATE.md). Architecture belongs in [ARCHITECTURE.md](./architecture/ARCHITECTURE.md). Concrete priorities and plans belong in [ROADMAP.md](./ROADMAP.md) and [plans/README.md](./plans/README.md). Agent workflow belongs in [CLAUDE.md](../CLAUDE.md).

## Domain vision documents

Detailed domain-level vision is maintained in [`vision/`](./vision/).

These documents expand the principles of this document for individual systems and domains, including:

- NPCs and NPC AI,
- settlements,
- fauna,
- economy and resources,
- player systems,
- items,
- quests,
- agriculture,
- weather and world systems.

`VISION.md` remains the top-level vision. Domain documents should refine it, not contradict its core principles.

## 1. What Seedvale is

Seedvale is a browser-based 3D sandbox built around a **procedurally generated, living world**.

The world contains settlements, people, animals, resources, weather/time cycles and other systems that interact with one another. The player enters that world as one of its inhabitants. The world should not exist merely to provide content for the player: it should have its own rhythms, constraints, needs and consequences.

Seedvale is not intended to become an MMO, multiplayer game, theme-park quest RPG, or conventional survival/crafting game. Those systems may exist where they strengthen the central experience, but they are not the reason the world exists.

## 2. The central idea

> **Plant the seed. Watch the world grow.**

The core fantasy is to enter a world that feels as though it was already alive before the player arrived — and to leave it knowing that it will continue changing after the player walks away.

The player is not the chosen one and is not the centre of the simulation. The player can become important to particular people, places and events, but the world does not stop waiting for them.

The long-term goal is therefore not simply to create more content. It is to create a world capable of **producing stories through its own behaviour**.

## 3. The world is the AI system

A central part of Seedvale's identity is that its intelligence should emerge from the simulation itself.

The world is generated procedurally, but procedural generation alone does not make it alive. The generated environment provides the conditions in which agents and systems can act:

```text
procedural world
      ↓
resources + places + settlements + environment
      ↓
agent simulation
      ↓
needs + personality + traits + abilities
      ↓
memory + relationships + goals
      ↓
decisions + actions
      ↓
consequences
      ↓
emergent events and stories
```

An NPC should not need an LLM prompt for every action in order to appear intelligent. Needs, personality, abilities, relationships, memory and the environment should already produce meaningful behaviour through ordinary game systems.

LLMs and other generative AI may eventually extend this simulation — for example through richer dialogue, quest generation, characterisation or world events — but they should **augment the underlying simulation rather than replace it**.

This distinction is fundamental: Seedvale should remain a living world even when no generative model is running.

## 4. What the player becomes

The player's long-term role is that of a **full member of the world, without becoming its centre**.

The player should eventually be able to build a life in Seedvale: have a home or piece of land, own and use objects, develop relationships, participate in work and local economies, help or harm communities, and leave lasting consequences behind.

Those systems are not meant to turn Seedvale into a conventional player-centric survival game. The player's life is one life among many.

A player may build a farm while another NPC moves away. The player may become friends with one villager while two other villagers develop a relationship independently. A settlement may prosper or decline while the player is exploring somewhere else.

The player's story should be **one emergent story inside the world's larger story**.

## 5. The experience we want

Seedvale should encourage the player to:

- wander rather than follow a prescribed route;
- recognise people by their character, behaviour and history rather than by quest markers;
- observe events that were not authored specifically for them;
- discover consequences rather than receive scripted exposition;
- become attached to places and people because they change over time;
- participate when they want to, and simply observe when they do not;
- wonder what happened while they were away.

The desired feeling is:

> **"I didn't know my world could do that."**

That feeling should come from interactions between systems, not from an increasingly large collection of scripted scenarios.

## 6. The simulation layers

Seedvale's long-term simulation should grow as connected layers rather than as independent feature collections.

### World

The procedural world should provide meaningful geography, resources, settlements and environmental conditions. Terrain, water, vegetation, climate and other environmental systems should influence what can happen in a region.

The long-term direction is a substantially larger world, potentially without a conventional visible boundary. The exact technical solution is deliberately open until the simulation and streaming requirements make the choice clear.

### NPCs

NPCs should develop from the existing needs-driven model into increasingly complete agents.

A long-term agent can have:

- needs and priorities;
- personality and traits;
- abilities and limitations;
- work and daily routines;
- memory of relevant events;
- relationships with other characters;
- goals and changing circumstances;
- the ability to make decisions based on the current world rather than a fixed script.

The important progression is not "more dialogue lines". It is **more coherent behaviour over time**.

### Settlements

Settlements should become living communities rather than collections of NPCs and buildings.

The long-term direction includes multiple settlements, population changes, migration, local resources, work, relationships, cooperation, conflicts and dependencies between communities.

A settlement should be capable of changing because of what its inhabitants and environment do — not only because the player completed a quest there.

### Fauna

Animals should form an ecosystem with populations, predator/prey relationships, resources, movement and environmental pressures.

Fauna should continue to matter to the world even when the player is not watching it. The goal is not to simulate every animal at maximum detail at all times, but to preserve the consequences and continuity that make the ecosystem feel real.

### Player

Player systems should eventually include the tools needed to establish a meaningful life in the world: possessions, a home or land, building, farming or other productive activities, and deeper social/economic participation.

These systems should plug into the same world simulation rather than becoming a separate player-only game layered on top of it.

### Stories and quests

Quests should increasingly emerge from the world.

A quest can originate from a need, relationship, resource problem, settlement event, conflict or other simulation state. Hand-authored quests remain useful, but the long-term direction is a system capable of producing varied situations without requiring every possibility to be scripted manually.

Generative AI may eventually help create or express those situations, but the underlying causes should remain grounded in the simulated world.

## 7. Design principles

### Simulate life, not collections of objects

The important question is not only whether a tree, NPC or animal exists. It is whether systems interact so that the world can change without direct player instruction.

### Extend existing couplings

When adding a feature, first ask whether it should extend an existing relationship:

```text
needs → behaviour → personality → dialogue → relationships → quests → world events
```

or another shared mechanism such as health/state, resources, persistence or world streaming.

Avoid creating parallel systems that solve the same conceptual problem in isolation.

### The player is part of the simulation

Player-facing systems should participate in the same world rules where practical. The world should not quietly switch from "simulation" to "theme park" whenever the player arrives.

### Consequences matter more than spectacle

A small change that persists and affects other systems is often more valuable than a large scripted feature that disappears when its scene ends.

### Simple systems first

Seedvale should prefer understandable, composable simulation mechanisms before expensive general-purpose solutions. More sophisticated AI should be introduced when it solves a problem that simpler systems can no longer handle well.

### The world must survive without the player

A system is stronger when it can continue producing meaningful state changes without requiring the player to trigger every step.

## 8. Long-term destination

The long-term Seedvale vision is a generated world populated by agents that are sufficiently coherent to develop their own lives.

A mature version of the game should make it possible for the player to:

1. enter a procedurally generated world;
2. meet people whose behaviour is shaped by who they are and what has happened to them;
3. watch settlements and ecosystems change over time;
4. establish a personal life and relationships within that world;
5. influence events without controlling the entire simulation;
6. leave an area and return later to discover consequences that happened in their absence;
7. encounter stories that could not have been predicted from a fixed script.

The ultimate measure of success is not the number of systems or quests. It is whether the player can tell stories about things that **the game did not explicitly tell them to experience**.

## 9. How to evaluate a new idea

Before adding a major feature, ask:

1. Does it make the world more alive or merely give the player another task?
2. Does it create or strengthen a meaningful interaction between existing systems?
3. Can it produce consequences that persist beyond the immediate interaction?
4. Does it help NPCs, settlements, fauna or the player behave like participants in the same world?
5. Does it preserve the idea that the world continues without the player?
6. Could a simpler systemic solution achieve the same result before introducing a heavier AI/LLM or content-generation layer?

If a feature makes the game larger but not more alive, it deserves extra scrutiny.
