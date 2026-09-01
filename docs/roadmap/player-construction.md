# Player Construction and World Building

## Direction

The player can gradually create and develop persistent elements of the world, eventually transforming an unused part of the world into a functioning settlement.

Building is not a separate player-only system. Player-created objects should become normal parts of the world and reuse existing item, resource, interaction, work, logistics, lighting, terrain and settlement systems.

The player is therefore not simply building a personal base. The long-term progression is from simple world modifications to becoming the founder of an autonomous community.

The overall direction is:

```
placement
→ world object
→ interaction / work
→ persistent world change
→ infrastructure
→ NPC cooperation
→ inhabitants
→ production
→ settlement
→ autonomous community
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

### 9. Settlement formation

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

Settlement formation should be based on meaningful world state rather than simply placing a special "settlement" marker. The physical development of the area, available housing and infrastructure, inhabitants, production capacity and other relevant settlement conditions should be the basis for recognizing a new community.

Once established, the settlement must continue operating independently of the player.

Player construction should therefore be an entry point into the normal settlement simulation rather than a parallel player-base system.

### 10. Inviting inhabitants

Allow the player to invite NPCs to join a developing settlement.

Invited NPCs should become inhabitants using the same household, relationship, profession and lifecycle mechanisms as other NPCs.

The player should be able to influence roles and tasks through the existing NPC work/task systems, without creating a player-specific population model.

Possible roles include:

- farming,
- forestry,
- hunting,
- construction,
- transport,
- crafting,
- defense.

The final implementation should reuse the existing profession/work/task systems.

### 11. Settlement growth and economy

Allow a newly formed settlement to develop into a functioning community.

It should be able to support:

- housing and households,
- infrastructure,
- storage,
- resource availability,
- production,
- population growth,
- local needs and problems,
- professions and social roles,
- relationships,
- trade or exchange with other settlements where those systems exist.

The settlement should use the same economy and logistics concepts as existing settlements:

```
resources
→ work / production
→ goods
→ storage / consumption
→ surplus / shortage
→ exchange / trade
```

Player involvement should influence the settlement without making the player its simulation authority. The settlement must remain capable of making decisions and operating when the player is absent.

### 12. Autonomous community

The final goal is an autonomous player-founded settlement that behaves like any other community in Seedvale.

It should:

- operate without the player,
- react to shortages and other local problems,
- assign and perform work,
- use resources and infrastructure,
- maintain households and relationships,
- participate in the wider economy,
- develop persistent history and consequences.

The player may remain an important inhabitant, founder or leader, but the settlement should not become a player-controlled simulation island.

Over time, player-founded settlements may trade, cooperate or compete with existing settlements and may develop their own identity, problems, relationships and history.

## Progression

The intended progression is:

```
simple placement
→ functional objects
→ land development
→ construction
→ infrastructure
→ NPC cooperation
→ inhabitants
→ roles
→ production
→ settlement formation
→ settlement growth
→ autonomous community
```

This progression intentionally combines physical world building with social and economic development. There is no separate "player base" system followed by a separate settlement system; construction creates the physical foundation on which the normal settlement simulation can emerge.

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
- Settlement formation should emerge from world state and development rather than being a special player-only mode.
- Invited NPCs must become normal inhabitants using existing household, profession, relationship and lifecycle systems.
- A founded settlement must be autonomous after formation and must not depend on the player or camera being present.
- Player influence should be represented through normal world actions, relationships and simulation state rather than privileged settlement control.

## Long-term vision

The player starts by making small, useful changes to the world. Those changes can grow into infrastructure and buildings, attract NPC cooperation and inhabitants, create productive households, and eventually form a new settlement.

The intended long-term relationship is:

```
player
  ↓
construction
  ↓
infrastructure
  ↓
NPC cooperation
  ↓
inhabitants
  ↓
roles + households
  ↓
production + storage
  ↓
settlement
  ↓
growth + economy
  ↓
autonomous community
```

This roadmap therefore covers both the **physical construction capabilities** and the **settlement-founding progression** that they enable.
