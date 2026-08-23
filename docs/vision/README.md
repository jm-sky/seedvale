# Seedvale — Vision

> **Plant the seed. Watch the world grow.**

Seedvale is a browser-based 3D sandbox simulation built around a living world rather than a player-centred campaign.

The player is part of the world. Settlements, households, NPCs, animals, resources and the environment continue to operate when the player is absent or not observing them.

The goal is not to simulate everything at maximum fidelity. The goal is to create a small number of interconnected deterministic systems that produce believable, persistent and sometimes surprising consequences.

## Core Principles

### The world exists without the player

The player can influence the world, but does not drive its simulation. Settlements have their own needs, problems and development. NPCs work, rest, form relationships and respond to changing circumstances. Animals live within habitats and food chains. Resources are consumed and renewed. Weather and seasons alter conditions.

### Systems over scripts

Prefer reusable systems and world state over isolated scripted behaviours. A feature should strengthen existing interactions rather than create a parallel mechanism.

### Deterministic simulation

Important world behaviour is driven by explicit state, rules and decisions. LLMs may eventually augment dialogue, quests or characterisation, but they must not replace deterministic simulation.

### Persistent consequences

Actions should change the world in ways that can outlast the action itself. A shortage can alter work and trade. A damaged building can affect a household. A relationship can change future cooperation. A dead animal can become part of the ecosystem. A discovered place can create new opportunities.

### Shared world rules

The player, NPCs and animals should use the same underlying world concepts wherever practical. Avoid player-only versions of systems that already exist for inhabitants of the world.

### Adaptive simulation

Simulation fidelity should depend on importance, distance and observation. Important or nearby situations may be simulated in detail while remote or low-impact situations may use aggregation or lower update frequency. Simplification must preserve continuity and meaningful consequences.

## The Living World

Seedvale should emerge from a continuous loop:

```text
world and environment
        ↓
resources, places and opportunities
        ↓
settlements, households and individuals
        ↓
needs, problems, goals and pressures
        ↓
decisions and strategies
        ↓
actions and work
        ↓
world changes
        ↓
consumption, production, relationships and history
        ↓
new opportunities, shortages, conflicts and problems
```

No single system owns this loop. Different domains contribute state and behaviour to it.

## Simulation Model

The simulation distinguishes several concepts that should remain separate:

- **Needs** — states requiring satisfaction.
- **Problems** — undesirable situations requiring a response.
- **Goals** — desired future states.
- **Pressures** — priorities that influence decisions.
- **Strategies** — approaches used to pursue goals or solve problems.
- **Actions** — concrete changes made in the world.

For NPCs, the intended direction is:

```text
state + pressures + traits + relationships + goals
                    ↓
                 decision
                    ↓
                strategy
                    ↓
                  actions
                    ↓
              world changes
```

This model should remain understandable and testable. More sophisticated behaviour should emerge by enriching state, pressures and available strategies rather than replacing the simulation with opaque reasoning.

## Domains

### 1. World

The physical and environmental foundation of Seedvale: terrain, biomes, vegetation, forests, water, rivers, resources, places, weather and seasons.

World systems should provide opportunities and constraints for other domains rather than existing only for visual generation.

A place may exist as a logical part of the world before its detailed physical representation is generated. The world should be able to know that a settlement or landmark exists, where it is, what kind of place it is and its approximate size without immediately generating all of its chunks, buildings and inhabitants.

This allows quests and NPC knowledge to refer to places that the player has never visited. The same place can later be physically generated when it becomes relevant.

The world is deterministic from its seed at the point of initial generation, while changes caused by simulation or player actions become persistent world state. Regenerating a chunk must not restore a changed area to its original procedural state.

Places are shared world concepts used by settlements, NPCs, quests and the player. A place has a stable identity that does not depend on whether its chunks are currently loaded or whether its detailed simulation is active.

World knowledge is separate from physical existence. NPCs and the player may know about places without having personally visited them, and knowledge can be passed between people. Knowledge heard from others is approximate and may provide only a direction or rough description. Personal knowledge is concrete and can provide a precise location and details learned through direct experience.

The amount of off-screen simulation is adaptive and can evolve with the available CPU budget. Initially, distant places may only exist as known world information. Later they may receive simplified simulation, and eventually important places may continue to operate in greater detail without being rendered. Full off-screen simulation is not required for every place from the beginning.

[World](./world.md)

### 2. Settlements

Settlements are living communities composed of households, buildings, infrastructure, resources and social relationships. Their condition should change over time according to population, environment, economy and local problems.

[Settlements](./settlements.md)

### 3. NPCs

NPCs are inhabitants rather than quest dispensers. Their behaviour combines needs, problems, goals, pressures, personality, abilities, schedules, relationships and available opportunities.

[NPCs](./npc.md)

### 4. Fauna

Animals form an ecosystem rather than a collection of decorative agents. Habitat, food, predators, reproduction, population, seasons and settlement activity should influence wildlife and domestic animals.

[Fauna](./fauna.md)

### 5. Agriculture & Food

Food is produced, gathered, processed, stored and consumed through interconnected world systems. Gardens, fields, fishing, hunting, preservation and cooking should participate in household and settlement economies.

[Agriculture](./agriculture.md)

### 6. Economy & Resources

Resources flow through gathering, work, production, storage, consumption and trade. Shortages and surpluses should create real pressures for households, settlements and individuals.

[Economy](./economy.md) · [Resources](./resources.md)

### 7. Player

The player is another participant in the world. Survival, exploration, construction, skills, relationships and economic activity should use the same world state and create consequences for other inhabitants.

[Player](./player.md)

### 8. Items & Combat

Items represent tangible capabilities and possessions. Combat is a shared system used by the player, NPCs and relevant animals, with execution separated from decision-making.

[Items](./items.md) · [Combat](./combat.md)

### 9. Quests & Progression

Quests should increasingly emerge from actual world state: NPC and household problems, settlement conflicts, shortages, relationships, discoveries and environmental events. Progression should reflect participation in the living world rather than a separate campaign layer.

[Quests](./quests.md)

## Cross-Cutting Systems

Some systems support every domain and should not become isolated gameplay domains:

- **Simulation architecture** — update scheduling, ownership, deterministic state and adaptive/off-screen simulation.
- **Persistence** — saving and restoring meaningful world state.
- **Rendering** — terrain, vegetation, water, characters and other visual representation.
- **Performance** — batching, update frequency, memory, workers and main-thread responsiveness.
- **UI and input** — presenting world state and available interactions without becoming a parallel game model.
- **Multiplayer readiness** — avoid architectural assumptions that would make future shared simulation unnecessarily difficult, without treating multiplayer as an immediate requirement.

## Emergent Behaviour

The most important interactions are cross-domain.

Examples:

```text
forest resources
    → NPC gathering
    → household fuel
    → settlement stock
    → shortage
    → changed NPC pressures
    → different work decisions
```

```text
weather / season
    → crops and wildlife
    → food availability
    → household needs
    → settlement economy
    → trade or migration pressure
```

```text
NPC relationship
    → cooperation or conflict
    → changed action
    → household / settlement consequences
    → future relationship state
```

```text
player action
    → world state change
    → NPC / fauna response
    → new problem or opportunity
    → history / relationship / quest
```

These chains are more important than the number of individual features implemented.

## Long-Term Direction

Seedvale should gradually move from a collection of functioning systems toward a coherent living simulation.

The desired progression is:

1. **World foundation** — physical environment, resources and places behave consistently.
2. **Autonomous inhabitants** — settlements, households, NPCs and fauna operate independently.
3. **Interconnected economy and ecology** — work, food, resources and environment influence one another.
4. **Decision-driven behaviour** — NPCs respond to pressures, problems, goals, personality and relationships.
5. **Persistent history** — actions create consequences, memories, relationships and changing world conditions.
6. **Emergent gameplay** — quests, conflicts, opportunities and stories increasingly arise from simulation state.

This is a direction, not a promise that every system will eventually be simulated at maximum complexity.

## Domain Roadmaps

The domain documents describe the target state of individual systems. They should explain capabilities, important state, system relationships, boundaries and major future directions.

They are not implementation-status trackers. For current implementation state, use `docs/STATE.md` and `docs/state/`. For concrete implementation work, use `docs/plans/`.

## Backlog

This section is reserved for short design ideas that are not yet concrete enough to become implementation plans.

Backlog items are not commitments and must not be presented as implemented behaviour. When an idea becomes sufficiently defined, it should move into an appropriate implementation plan or be incorporated into the relevant domain roadmap.

- Future ideas may be recorded here while the project is still refining its long-term direction.
