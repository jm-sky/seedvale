# Player Construction and World Building

## Direction

The player can gradually create and develop persistent elements of the world.

Building is not a separate player-only system. Player-created objects should become normal parts of the world and reuse existing item, resource, interaction, work, logistics, lighting, terrain and settlement systems.

The long-term direction is:

```
placement
→ world object
→ interaction / work
→ persistent world change
→ infrastructure
→ NPC cooperation
→ settlement
```

The system should support both small placed objects and larger construction projects.

## Construction categories

Player-created content should fall into a few broad categories rather than separate systems for every object.

### Placed objects

Small objects that can be created directly at a valid location.

Examples:

- torches,
- containers,
- traps,
- tents,
- wells,
- other small world objects.

These may have their own state and interactions after placement.

### Cultivation and land preparation

Objects or world modifications related to growing resources.

Examples:

- gardens,
- fields,
- prepared cultivation plots,
- future agricultural infrastructure.

Gardens and fields should use the same underlying cultivation concepts where practical rather than creating separate player and NPC farming systems.

### Construction projects

Larger objects requiring materials and work.

Examples:

- palisades,
- fences,
- gates,
- houses,
- shelters,
- storage buildings,
- workshops,
- other settlement facilities.

A construction project may progress through:

```
planning
→ material delivery
→ construction
→ completion
```

### Infrastructure and terrain

Persistent modifications that are not conventional buildings.

Examples:

- paths,
- roads,
- bridges,
- prepared land,
- other infrastructure.

These should extend existing terrain and world mechanisms where possible.

## Roadmap

### 1. Placement foundation

Establish the shared concepts required to create persistent player-placed world objects.

Focus on:

- placement validation,
- position and rotation,
- terrain/ground requirements,
- collision and clearance,
- interaction range,
- resource/item requirements,
- world registration,
- save/load,
- cleanup and lifecycle.

Reuse existing placement mechanisms instead of replacing working systems unnecessarily.

The result should provide a foundation that can support both simple placed objects and future construction projects.

### 2. Simple placed objects

Unify the approach for small player-created objects.

Initial examples:

- torch,
- existing placed objects where appropriate.

A placed object should become part of the world rather than remaining a player-only visual.

Existing systems should be migrated or extended incrementally where this provides clear value.

### 3. Torches and ignition

Add player-placeable torches.

A torch:

- can be placed directly on the ground,
- does not require a wall, fence or other supporting object,
- starts unlit,
- can be ignited by an appropriate fire-starting action,
- has a persistent lit/unlit state,
- produces light while lit.

Ignition should extend the existing fire/fire-starting concepts rather than introducing a separate torch-only mechanism.

Future extensions may include torch fuel, extinguishing and NPC interaction, but these are not required for the initial implementation.

### 4. Cultivation

Extend the existing garden and terrain-preparation mechanisms into a coherent player cultivation model.

Support the distinction between:

- small gardens,
- larger fields,
- prepared cultivation land.

Reuse existing crop, hydration, maintenance, harvesting and resource concepts.

Do not create separate garden and field simulation systems when the same underlying mechanisms can be shared.

### 5. Construction project foundation

Introduce the common lifecycle required for larger constructions.

A project should be able to represent:

```
planned location
→ required materials
→ delivered materials
→ construction work
→ progress
→ completed world object
```

Construction should consume real resources and use existing inventory, item, work and action mechanisms.

The system should not assume that the player is always the worker. NPC cooperation must remain possible through normal simulation mechanisms.

### 6. Modular infrastructure

Add player-built defensive and structural infrastructure.

Initial examples:

- fences,
- palisades,
- gates.

Reuse existing modular construction, snapping, dimensions and collider concepts where appropriate.

Palisades should be constructed from persistent world elements rather than represented only as a visual boundary.

Gates should eventually provide normal world interactions and should not require a player-only mechanism.

### 7. Player buildings

Extend construction to larger buildings.

Initial examples:

- shelters,
- houses,
- storage buildings,
- workshops.

Reuse the existing building/asset pipeline, including modular building definitions and `HouseBuilder`, where appropriate.

Completed buildings should integrate with existing world concepts such as:

- Places,
- households,
- storage,
- production,
- settlement infrastructure.

A player-built house should therefore be capable of becoming a real house in the simulation rather than remaining a special player-base object.

### 8. NPC construction cooperation

Allow NPCs to participate in player construction using existing simulation concepts.

NPCs should be able to:

- gather required resources,
- transport materials,
- perform construction work,
- contribute according to their abilities and roles.

Do not introduce a player-specific worker AI.

Construction should become another type of work/task available to the existing simulation.

### 9. Settlement integration

Connect sufficiently developed player-built areas with the settlement system.

A player-created settlement should eventually support:

- housing,
- population,
- storage,
- production,
- infrastructure,
- resource availability,
- NPC roles,
- local needs and problems,
- relationships with other settlements.

Once established, the settlement must continue operating independently of the player.

Player construction should therefore be an entry point into the normal settlement simulation rather than a parallel player-base system.

## Design constraints

- Reuse existing world, item, resource, terrain, interaction, work, logistics, NPC and settlement mechanisms.
- Prefer extending existing systems over creating parallel player-only systems.
- Keep placement, construction and object-specific behaviour conceptually separate.
- Persist player-created world state through the existing persistence system.
- Construction must create meaningful and persistent world consequences.
- Do not require every placed object to use the full construction-project lifecycle.
- Keep the system deterministic.
- Support hybrid/off-screen simulation where appropriate.
- Avoid architecture that assumes the player is permanently present.
- Avoid architecture that would make future multiplayer fundamentally harder.
- Keep individual construction types small and composable rather than creating a monolithic construction manager.

## Long-term progression

The intended progression is:

```
simple placement
→ functional objects
→ land development
→ construction
→ infrastructure
→ NPC cooperation
→ buildings
→ settlement
→ autonomous community
```

This roadmap complements `player-founded-settlement.md`.

`player-founded-settlement.md` describes the long-term goal of the player becoming a settlement founder; this roadmap describes the physical/world-building capabilities that make that progression possible.
