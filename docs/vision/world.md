# World Domain Roadmap

**Status:** draft — needs ongoing user verification

## Purpose

The World domain is the physical and environmental foundation of Seedvale. It provides geography, climate, natural resources and places that create constraints and opportunities for settlements, NPCs, fauna, agriculture and the player.

The world exists independently of the player. Rendering is a representation of world state, not the owner of that state.

## Core principles

### The world exists before it is rendered

The world may know about a place before its chunks, buildings, inhabitants or detailed geometry are generated.

For example, a distant settlement may already have:

- a stable identity,
- a location,
- a type,
- an approximate size,
- a relationship to the surrounding world.

An NPC can therefore know that a large city lies to the north even when neither the player nor the renderer has visited it.

### Deterministic initial world

The world seed defines the initial procedural world. This includes geography and other seed-derived properties that need to remain stable.

The seed is not the complete persistent world state. Changes caused by simulation or player actions must be stored separately and survive chunk unloading and later procedural regeneration.

Conceptually:

```text
world seed
    ↓
initial world
    ↓
simulation + player actions
    ↓
persistent world changes
```

Regenerating a chunk must therefore never silently restore an area to its original procedural state after a persistent change.

### Places are shared world concepts

`Place` is a shared concept used by World, Settlements, NPCs, Quests and Player systems.

A place has a stable identity independent of loaded chunks or rendering state. It can represent, for example:

- settlement,
- city or village,
- landmark,
- natural feature,
- resource site,
- cave,
- ruin,
- other meaningful point or area in the world.

A place can be referenced by quests and world knowledge before it is physically instantiated in detail.

### World knowledge is not the same as world discovery

Different inhabitants may know different things about the same place.

Knowledge should distinguish at least two forms:

- **Heard knowledge** — learned from another person or indirect information. It is approximate and uncertain; it may provide only a direction or rough description rather than an exact map position.
- **Personal knowledge** — gained through direct experience. It can contain a concrete location and details actually observed or learned at the place.

Knowledge can be passed between NPCs and between NPCs and the player. The player does not automatically know everything the world or nearby NPCs know.

The long-term direction is for knowledge to become detailed enough to support believable answers such as where a place is, what can be found there and what an NPC personally knows about it.

## Environment

World systems include:

- terrain and elevation,
- mountains and natural landforms,
- biomes,
- forests and vegetation,
- ocean, lakes, rivers and other water,
- climate, weather and seasons,
- natural resource distribution,
- meaningful places and landmarks.

These systems should be connected. Terrain influences water and habitats; climate influences vegetation and wildlife; resources influence settlement opportunities; places emerge from or are positioned within the physical world.

## Natural resources

World is responsible for the **natural occurrence and environmental distribution** of resources. It is not responsible for every later use of those resources.

Examples of mineral and geological resources include:

- coal,
- iron,
- copper,
- tin,
- silver,
- gold,
- diamonds,
- stone,
- limestone,
- clay,
- sand,
- gravel.

Natural resources may have distinct types or material properties and may occur in different environments, concentrations or deposits.

Biological resources are shared with their owning domains rather than being duplicated inside World. For example:

- animal and fish species belong primarily to **Fauna**;
- crops and their lifecycle belong primarily to **Agriculture & Food**;
- extraction, processing, storage, trade and economic value belong primarily to **Economy & Resources**.

World still provides the environmental context in which those resources occur.

## Trees and vegetation

Trees are part of the World environment and may be represented by distinct species or material types. The exact catalogue can evolve independently of the core world simulation.

The long-term direction may include both real species and gameplay-relevant categories, for example:

- pine,
- spruce,
- birch,
- oak,
- beech,
- other hardwood/softwood or exotic species.

Fruit trees can also be part of the natural and cultivated landscape, for example:

- apple,
- pear,
- plum.

World owns their environmental occurrence and growth context. Fruit production, harvesting, food processing and orchard/agriculture mechanics belong to Agriculture & Food.

## Adaptive world simulation

Not every part of the world needs the same simulation fidelity.

The intended evolution is:

```text
known place
    ↓
optional detailed generation
    ↓
optional simulation
    ↓
higher fidelity when relevant
```

Initially, a distant place may only exist as world information. As systems mature and CPU resources allow it, remote places may receive simplified simulation. Important places may eventually continue operating in greater detail without being rendered.

This is an adaptive capability, not a requirement to fully simulate every place from the beginning.

At the current stage, remote locations do not need to progress independently merely because they exist. A specific quest or other world event may explicitly require a remote place to be generated or simulated earlier.

## World changes and persistence

World generation establishes the baseline. Simulation and player actions can modify that baseline.

Examples include:

- cutting or planting trees,
- terrain modification,
- changing resource availability,
- construction or destruction,
- environmental events,
- other persistent changes produced by world systems.

Persistent changes belong to world state and must remain valid when the corresponding chunks are unloaded, regenerated or revisited later.

## World and other domains

World should provide reusable state and queries rather than implementing the gameplay systems that consume it.

```text
World
  ↓
places + environment + resources + opportunities
  ↓
Settlements / Fauna / Agriculture / NPCs / Player
  ↓
actions and simulation
  ↓
world changes
```

Examples:

- World determines where iron deposits can occur; Economy determines how iron is extracted, processed and traded.
- World provides habitats and environmental conditions; Fauna owns animal populations and behaviour.
- World provides soil, climate and natural vegetation; Agriculture owns crops and cultivation.
- World provides places and geography; NPCs and Quests use them for knowledge, decisions and objectives.

Avoid creating parallel concepts for locations, terrain state or natural resources when an existing World mechanism can be reused.

## Future evolution

The World domain should gradually evolve toward:

1. a stable procedural world foundation,
2. richer shared Place semantics,
3. persistent world changes,
4. stronger environmental interactions,
5. adaptive off-screen simulation,
6. deeper world-scale consequences for settlements, fauna, agriculture, economy and quests.

The exact implementation order depends on the current codebase, performance constraints and the maturity of the domains consuming World state.

## Backlog

Short ideas that may be refined later:

- additional natural resource types and deposits,
- more tree species and material distinctions,
- deeper water and groundwater systems,
- caves and underground environments,
- waterfalls and richer river behaviour,
- additional natural landmarks and world-scale environmental events.

Backlog items are ideas, not commitments or statements about current implementation.

## Boundaries

World should not become a God Object containing settlement simulation, NPC decision-making, animal behaviour, agriculture, economy or quest logic.

It owns the shared physical/environmental foundation and stable world/place state needed by those domains. Architectural changes should be justified by actual product or simulation requirements rather than speculative future systems.
